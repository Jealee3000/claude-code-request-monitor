import type http from "node:http";

interface MitmSessionContext {
  connectRequest?: { headers: http.IncomingHttpHeaders };
  clientToProxyRequest: { headers: http.IncomingHttpHeaders };
}

export function parseProxyWatchToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return undefined;
  }

  const match = /^Basic\s+(.+)$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return undefined;
    }
    const username = decoded.slice(0, separator);
    const token = decoded.slice(separator + 1);
    return username === "cw" && token ? token : undefined;
  } catch {
    return undefined;
  }
}

export function resolveRequestSessionId(
  headers: http.IncomingHttpHeaders,
  fallbackSessionId: string,
  lookupSessionId: (token: string) => string | undefined
): string {
  const token = parseProxyWatchToken(headers["proxy-authorization"]);
  if (!token) {
    return fallbackSessionId;
  }

  return lookupSessionId(token) ?? fallbackSessionId;
}

export function resolveMitmRequestSessionId(
  ctx: MitmSessionContext,
  fallbackSessionId: string,
  lookupSessionId: (token: string) => string | undefined
): string {
  const connectSessionId = ctx.connectRequest
    ? resolveRequestSessionId(ctx.connectRequest.headers, fallbackSessionId, lookupSessionId)
    : fallbackSessionId;

  if (connectSessionId !== fallbackSessionId) {
    return connectSessionId;
  }

  return resolveRequestSessionId(ctx.clientToProxyRequest.headers, fallbackSessionId, lookupSessionId);
}

export function stripProxyAuthorization<T extends http.IncomingHttpHeaders | http.OutgoingHttpHeaders>(headers: T): T {
  const next = { ...headers };
  delete next["proxy-authorization"];
  delete next["Proxy-Authorization"];
  return next as T;
}
