import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

export interface DecodedBody {
  kind: "empty" | "text" | "json" | "binary" | "decode-error";
  decodedText: string | null;
  decodedBytes: number;
  originalBytes: number;
  contentEncoding: string | null;
  error: string | null;
}

type HeaderRecord = Record<string, unknown>;

export function decodeBody(buffer: Buffer, headers: HeaderRecord = {}): DecodedBody {
  const contentEncoding = headerValue(headers, "content-encoding");
  const contentType = headerValue(headers, "content-type");

  if (buffer.length === 0) {
    return {
      kind: "empty",
      decodedText: null,
      decodedBytes: 0,
      originalBytes: 0,
      contentEncoding,
      error: null
    };
  }

  let decoded = buffer;
  try {
    decoded = decompress(buffer, contentEncoding);
  } catch (error) {
    return {
      kind: "decode-error",
      decodedText: "[compressed body could not be decoded]",
      decodedBytes: 0,
      originalBytes: buffer.length,
      contentEncoding,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  if (!isTextLike(contentType, decoded)) {
    return {
      kind: "binary",
      decodedText: null,
      decodedBytes: decoded.length,
      originalBytes: buffer.length,
      contentEncoding,
      error: null
    };
  }

  const text = decoded.toString("utf8");
  return {
    kind: looksLikeJsonText(text, contentType) ? "json" : "text",
    decodedText: text,
    decodedBytes: decoded.length,
    originalBytes: buffer.length,
    contentEncoding,
    error: null
  };
}

export function parseDecodedBody(buffer: Buffer, headers: HeaderRecord = {}): unknown {
  const decoded = decodeBody(buffer, headers);

  if (decoded.kind === "empty") {
    return null;
  }

  if (decoded.kind === "binary") {
    return {
      bodyKind: "binary",
      originalBytes: decoded.originalBytes,
      decodedBytes: decoded.decodedBytes
    };
  }

  if (decoded.kind === "decode-error") {
    return {
      bodyKind: "decode-error",
      originalBytes: decoded.originalBytes,
      contentEncoding: decoded.contentEncoding,
      error: decoded.error
    };
  }

  const text = decoded.decodedText ?? "";
  if (decoded.kind === "json") {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

function decompress(buffer: Buffer, contentEncoding: string | null): Buffer {
  const encoding = contentEncoding?.toLowerCase().trim();

  if (!encoding || encoding === "identity") {
    return buffer;
  }
  if (encoding.includes("gzip")) {
    return gunzipSync(buffer);
  }
  if (encoding.includes("br")) {
    return brotliDecompressSync(buffer);
  }
  if (encoding.includes("deflate")) {
    return inflateSync(buffer);
  }

  return buffer;
}

function headerValue(headers: HeaderRecord, name: string): string | null {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  if (!entry) {
    return null;
  }
  const value = entry[1];
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  if (value === undefined || value === null) {
    return null;
  }
  return String(value);
}

function isTextLike(contentType: string | null, buffer: Buffer): boolean {
  const normalized = contentType?.toLowerCase() ?? "";
  if (
    normalized.includes("json") ||
    normalized.startsWith("text/") ||
    normalized.includes("xml") ||
    normalized.includes("javascript") ||
    normalized.includes("x-www-form-urlencoded")
  ) {
    return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 256));
  if (sample.includes(0)) {
    return false;
  }

  const replacement = sample.toString("utf8").match(/\uFFFD/g)?.length ?? 0;
  return replacement <= 1;
}

function looksLikeJsonText(text: string, contentType: string | null): boolean {
  const trimmed = text.trimStart();
  return Boolean(contentType?.toLowerCase().includes("json")) || trimmed.startsWith("{") || trimmed.startsWith("[");
}
