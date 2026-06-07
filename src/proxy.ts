import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { Proxy as MitmProxy, type IContext } from "http-mitm-proxy";
import { prepareLocalCertificate } from "./cert.js";
import type { MonitorConfig } from "./types.js";
import type { RequestStore } from "./store.js";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

export interface ProxyHandle {
  server: http.Server;
  url: string;
  close(): Promise<void>;
}

export async function startProxyServer(config: MonitorConfig, store: RequestStore): Promise<ProxyHandle> {
  if (config.inspectBody) {
    return startMitmProxyServer(config, store);
  }

  const server = http.createServer((request, response) => {
    void handleHttpProxyRequest(config, store, request, response);
  });

  server.on("connect", (request, clientSocket, head) => {
    handleConnectRequest(config, store, request, clientSocket, head);
  });

  await listen(server, config.proxyPort, config.host);

  return {
    server,
    url: `http://${config.host}:${config.proxyPort}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function startMitmProxyServer(config: MonitorConfig, store: RequestStore): Promise<ProxyHandle> {
  const cert = prepareLocalCertificate(config.dataDir);
  const proxy = new MitmProxy();
  const captures = new WeakMap<IContext, MitmCapture>();

  proxy.onError((ctx, error) => {
    if (!ctx) {
      console.error(error);
      return;
    }

    const capture = captures.get(ctx) ?? createMitmCapture(ctx);
    store.logRequest({
      sessionId: config.sessionId,
      startedAt: capture.startedAt,
      completedAt: new Date().toISOString(),
      method: capture.method,
      host: capture.host,
      path: capture.path,
      durationMs: Date.now() - capture.started,
      requestBytes: bufferLength(capture.requestChunks),
      responseBytes: bufferLength(capture.responseChunks),
      contentType: capture.contentType,
      error: error?.message ?? "MITM proxy error"
    });
  });

  proxy.onRequest((ctx, callback) => {
    captures.set(ctx, createMitmCapture(ctx));
    callback();
  });

  proxy.onRequestData((ctx, chunk, callback) => {
    const capture = captures.get(ctx);
    if (capture && bufferLength(capture.requestChunks) < MAX_CAPTURE_BYTES) {
      capture.requestChunks.push(chunk);
    }
    callback(null, chunk);
  });

  proxy.onResponse((ctx, callback) => {
    const capture = captures.get(ctx);
    if (capture) {
      capture.statusCode = ctx.serverToProxyResponse?.statusCode ?? null;
      capture.responseHeaders = headersToRecord(ctx.serverToProxyResponse?.headers ?? {});
      capture.contentType = headerValue(ctx.serverToProxyResponse?.headers["content-type"]);
    }
    callback();
  });

  proxy.onResponseData((ctx, chunk, callback) => {
    const capture = captures.get(ctx);
    if (capture && bufferLength(capture.responseChunks) < MAX_CAPTURE_BYTES) {
      capture.responseChunks.push(chunk);
    }
    callback(null, chunk);
  });

  proxy.onResponseEnd((ctx, callback) => {
    const capture = captures.get(ctx);
    if (capture) {
      const responseBody = Buffer.concat(capture.responseChunks);
      const requestBody = Buffer.concat(capture.requestChunks);
      const contentType = capture.contentType;
      const jsonLike = isJsonLike(contentType) || looksLikeJson(requestBody) || looksLikeJson(responseBody);

      store.logRequest({
        sessionId: config.sessionId,
        startedAt: capture.startedAt,
        completedAt: new Date().toISOString(),
        method: capture.method,
        host: capture.host,
        path: capture.path,
        statusCode: capture.statusCode,
        durationMs: Date.now() - capture.started,
        requestBytes: requestBody.length,
        responseBytes: responseBody.length,
        contentType,
        eventCount: countServerSentEvents(responseBody, contentType),
        requestHeaders: jsonLike ? capture.requestHeaders : undefined,
        requestBody: jsonLike ? parseJsonOrText(requestBody) : undefined,
        responseHeaders: jsonLike ? capture.responseHeaders : undefined,
        responseBody: jsonLike ? parseJsonOrText(responseBody) : undefined
      });
      captures.delete(ctx);
    }
    callback();
  });

  return new Promise((resolve, reject) => {
    proxy.listen(
      {
        host: config.host,
        port: config.proxyPort,
        sslCaDir: cert.certDir,
        forceSNI: true
      },
      (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          server: proxy.httpServer as http.Server,
          url: `http://${config.host}:${config.proxyPort}`,
          close: () =>
            new Promise((closeResolve) => {
              proxy.close();
              closeResolve();
            })
        });
      }
    );
  });
}

async function handleHttpProxyRequest(
  config: MonitorConfig,
  store: RequestStore,
  clientRequest: http.IncomingMessage,
  clientResponse: http.ServerResponse
): Promise<void> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const chunks: Buffer[] = [];
  let requestBytes = 0;

  clientRequest.on("data", (chunk: Buffer) => {
    requestBytes += chunk.length;
    if (bufferLength(chunks) < MAX_CAPTURE_BYTES) {
      chunks.push(chunk);
    }
  });

  clientRequest.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    const target = resolveTargetUrl(clientRequest);

    if (!target) {
      clientResponse.writeHead(400, { "content-type": "text/plain" });
      clientResponse.end("Claude Watch proxy requires an absolute HTTP URL");
      return;
    }

    const upstream = target.protocol === "https:" ? https : http;
    const upstreamRequest = upstream.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        method: clientRequest.method,
        path: `${target.pathname}${target.search}`,
        headers: clientRequest.headers
      },
      (upstreamResponse) => {
        const responseChunks: Buffer[] = [];
        let responseBytes = 0;

        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.on("data", (chunk: Buffer) => {
          responseBytes += chunk.length;
          if (bufferLength(responseChunks) < MAX_CAPTURE_BYTES) {
            responseChunks.push(chunk);
          }
          clientResponse.write(chunk);
        });
        upstreamResponse.on("end", () => {
          clientResponse.end();
          const completedAt = new Date().toISOString();
          const responseBody = Buffer.concat(responseChunks);
          const contentType = headerValue(upstreamResponse.headers["content-type"]);
          const inspectJson = config.inspectBody && isJsonLike(contentType);

          store.logRequest({
            sessionId: config.sessionId,
            startedAt,
            completedAt,
            method: clientRequest.method ?? "GET",
            host: target.host,
            path: `${target.pathname}${target.search}`,
            statusCode: upstreamResponse.statusCode ?? null,
            durationMs: Date.now() - started,
            requestBytes,
            responseBytes,
            contentType,
            eventCount: countServerSentEvents(responseBody, contentType),
            requestHeaders: inspectJson ? headersToRecord(clientRequest.headers) : undefined,
            requestBody: inspectJson ? parseJsonOrText(rawBody) : undefined,
            responseHeaders: inspectJson ? headersToRecord(upstreamResponse.headers) : undefined,
            responseBody: inspectJson ? parseJsonOrText(responseBody) : undefined
          });
        });
      }
    );

    upstreamRequest.on("error", (error) => {
      const completedAt = new Date().toISOString();
      clientResponse.writeHead(502, { "content-type": "text/plain" });
      clientResponse.end(error.message);
      store.logRequest({
        sessionId: config.sessionId,
        startedAt,
        completedAt,
        method: clientRequest.method ?? "GET",
        host: target.host,
        path: `${target.pathname}${target.search}`,
        durationMs: Date.now() - started,
        requestBytes,
        error: error.message
      });
    });

    if (rawBody.length > 0) {
      upstreamRequest.write(rawBody);
    }
    upstreamRequest.end();
  });
}

function handleConnectRequest(
  config: MonitorConfig,
  store: RequestStore,
  request: http.IncomingMessage,
  clientSocket: Duplex,
  head: Buffer
): void {
  const started = Date.now();
  const target = request.url ?? "";
  const [host, portText] = target.split(":");
  const port = Number(portText || 443);

  const upstreamSocket = net.connect(port, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) {
      upstreamSocket.write(head);
    }
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
    store.logRequest({
      sessionId: config.sessionId,
      startedAt: new Date(started).toISOString(),
      completedAt: new Date().toISOString(),
      method: "CONNECT",
      host,
      path: target,
      statusCode: 200,
      durationMs: Date.now() - started,
      requestBytes: head.length
    });
  });

  upstreamSocket.on("error", (error) => {
    clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    store.logRequest({
      sessionId: config.sessionId,
      startedAt: new Date(started).toISOString(),
      completedAt: new Date().toISOString(),
      method: "CONNECT",
      host,
      path: target,
      statusCode: 502,
      durationMs: Date.now() - started,
      error: error.message
    });
  });
}

function resolveTargetUrl(request: http.IncomingMessage): URL | undefined {
  if (!request.url) {
    return undefined;
  }

  try {
    return new URL(request.url);
  } catch {
    const host = request.headers.host;
    if (!host) {
      return undefined;
    }
    return new URL(`http://${host}${request.url}`);
  }
}

function listen(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function bufferLength(chunks: Buffer[]): number {
  return chunks.reduce((total, chunk) => total + chunk.length, 0);
}

function headerValue(value: string | string[] | number | undefined): string | null {
  if (Array.isArray(value)) {
    return value.join("; ");
  }
  if (value === undefined) {
    return null;
  }
  return String(value);
}

function headersToRecord(headers: http.IncomingHttpHeaders | http.OutgoingHttpHeaders): Record<string, unknown> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, value]));
}

function isJsonLike(contentType: string | null): boolean {
  return contentType?.toLowerCase().includes("json") ?? false;
}

function parseJsonOrText(buffer: Buffer): unknown {
  const text = buffer.toString("utf8");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function countServerSentEvents(buffer: Buffer, contentType: string | null): number {
  if (!contentType?.toLowerCase().includes("text/event-stream")) {
    return 0;
  }
  const text = buffer.toString("utf8");
  return text.split("\n").filter((line) => line.startsWith("event:")).length;
}

interface MitmCapture {
  started: number;
  startedAt: string;
  method: string;
  host: string;
  path: string;
  requestHeaders: Record<string, unknown>;
  requestChunks: Buffer[];
  responseHeaders: Record<string, unknown>;
  responseChunks: Buffer[];
  statusCode: number | null;
  contentType: string | null;
}

function createMitmCapture(ctx: IContext): MitmCapture {
  const started = Date.now();
  const request = ctx.clientToProxyRequest;
  const host = headerValue(request.headers.host) ?? "unknown";
  const path = request.url ?? "/";

  return {
    started,
    startedAt: new Date(started).toISOString(),
    method: request.method ?? "GET",
    host,
    path,
    requestHeaders: headersToRecord(request.headers),
    requestChunks: [],
    responseHeaders: {},
    responseChunks: [],
    statusCode: null,
    contentType: null
  };
}

function looksLikeJson(buffer: Buffer): boolean {
  const text = buffer.toString("utf8").trimStart();
  return text.startsWith("{") || text.startsWith("[");
}
