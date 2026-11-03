import { describe, expect, it } from "vitest";
import { readPublicConfig } from "./public-config";
const url = "https://exampleproject.supabase.co";
const publicKey = "sb_publishable_example";
const jwt = (role: string) =>
  `e30.${btoa(JSON.stringify({ role }))}.example-signature`;
describe("public Supabase settings", () => {
  it("keeps solo available when no connection is configured", () =>
    expect(readPublicConfig().status).toBe("unconfigured"));
  it("requires both settings", () =>
    expect(readPublicConfig(url).status).toBe("invalid"));
  it("accepts a trimmed public key and base URL", () =>
    expect(readPublicConfig(` ${url}/ `, ` ${publicKey} `)).toEqual({
      status: "ready",
      url,
      key: publicKey,
    }));
  it("allows the legacy public anon key but rejects service-role keys", () => {
    expect(readPublicConfig(url, jwt("anon")).status).toBe("ready");
    expect(readPublicConfig(url, jwt("service_role")).status).toBe("invalid");
    expect(readPublicConfig(url, "sb_secret_do-not-embed-this").status).toBe(
      "invalid",
    );
  });
  it.each([
    `${url}/rest/v1`,
    `${url}/auth/v1`,
    `${url}?token=private`,
    `${url}#fragment`,
    "https://name:password@exampleproject.supabase.co",
    "http://exampleproject.supabase.co",
    "not-a-url",
  ])("rejects unsafe or incorrect URL %s", (value) =>
    expect(readPublicConfig(value, publicKey).status).toBe("invalid"),
  );
  it("supports a local Supabase instance", () =>
    expect(readPublicConfig("http://127.0.0.1:54321", publicKey).status).toBe(
      "ready",
    ));
  it("never echoes a private value in an error message", () =>
    expect(
      JSON.stringify(readPublicConfig(url, "sb_secret_do-not-embed-this")),
    ).not.toContain("do-not-embed-this"));
});
