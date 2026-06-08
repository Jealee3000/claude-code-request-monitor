import { describe, expect, it } from "vitest";
import {
  parseProxyWatchToken,
  resolveMitmRequestSessionId,
  resolveRequestSessionId,
  stripProxyAuthorization
} from "../src/proxy-session.js";

describe("proxy session resolution", () => {
  it("parses watch token from basic proxy authorization", () => {
    const encoded = Buffer.from("cw:token-a").toString("base64");

    expect(parseProxyWatchToken(`Basic ${encoded}`)).toBe("token-a");
  });

  it("falls back when the proxy authorization is missing or unknown", () => {
    const lookup = (token: string) => (token === "known" ? "session-known" : undefined);
    const known = Buffer.from("cw:known").toString("base64");
    const unknown = Buffer.from("cw:unknown").toString("base64");

    expect(resolveRequestSessionId({ "proxy-authorization": `Basic ${known}` }, "fallback", lookup)).toBe(
      "session-known"
    );
    expect(resolveRequestSessionId({ "proxy-authorization": `Basic ${unknown}` }, "fallback", lookup)).toBe(
      "fallback"
    );
    expect(resolveRequestSessionId({}, "fallback", lookup)).toBe("fallback");
  });

  it("removes proxy authorization before forwarding upstream", () => {
    const headers = stripProxyAuthorization({
      host: "api.anthropic.com",
      "proxy-authorization": "Basic secret"
    });

    expect(headers).toEqual({ host: "api.anthropic.com" });
  });

  it("uses the CONNECT request authorization for MITM HTTPS requests", () => {
    const encoded = Buffer.from("cw:known").toString("base64");

    expect(
      resolveMitmRequestSessionId(
        {
          connectRequest: { headers: { "proxy-authorization": `Basic ${encoded}` } },
          clientToProxyRequest: { headers: {} }
        },
        "fallback",
        (token) => (token === "known" ? "session-known" : undefined)
      )
    ).toBe("session-known");
  });
});
