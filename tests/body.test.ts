import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeBody, parseDecodedBody } from "../src/body.js";

const json = JSON.stringify({ ok: true, message: "hello" });

describe("body decoding", () => {
  it("decodes gzip json before parsing", () => {
    const result = parseDecodedBody(gzipSync(json), {
      "content-encoding": "gzip",
      "content-type": "application/json"
    });

    expect(result).toEqual({ ok: true, message: "hello" });
  });

  it("decodes brotli json before parsing", () => {
    const result = parseDecodedBody(brotliCompressSync(json), {
      "content-encoding": "br",
      "content-type": "application/json"
    });

    expect(result).toEqual({ ok: true, message: "hello" });
  });

  it("decodes deflate json before parsing", () => {
    const result = parseDecodedBody(deflateSync(json), {
      "content-encoding": "deflate",
      "content-type": "application/json"
    });

    expect(result).toEqual({ ok: true, message: "hello" });
  });

  it("parses plain json without content encoding", () => {
    const result = parseDecodedBody(Buffer.from(json), {
      "content-type": "application/json"
    });

    expect(result).toEqual({ ok: true, message: "hello" });
  });

  it("does not convert binary bytes into unreadable utf8 text", () => {
    const decoded = decodeBody(Buffer.from([0, 159, 255, 10]), {
      "content-type": "application/octet-stream"
    });

    expect(decoded).toMatchObject({
      kind: "binary",
      decodedText: null,
      decodedBytes: 4
    });
  });
});
