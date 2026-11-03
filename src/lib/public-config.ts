export type PublicConfig =
  | { status: "unconfigured"; message: string }
  | { status: "invalid"; message: string }
  | { status: "ready"; url: string; key: string };

/** Only public browser credentials are accepted. Error messages never contain values. */
export function readPublicConfig(
  rawUrl?: string,
  rawKey?: string,
): PublicConfig {
  const url = rawUrl?.trim();
  const key = rawKey?.trim();
  if (!url && !key)
    return {
      status: "unconfigured",
      message:
        "Add the public Supabase URL and publishable key to .env.local, then restart the development server.",
    };
  if (!url || !key)
    return {
      status: "invalid",
      message:
        "Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the project’s .env.local file, then restart the server.",
    };
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" &&
        !(local && parsed.protocol === "http:")) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return {
        status: "invalid",
        message:
          "Use the Supabase project’s base HTTPS URL, without /rest/v1, /auth/v1, query parameters, or a dashboard path.",
      };
    }
    if (key.startsWith("sb_secret_"))
      return {
        status: "invalid",
        message:
          "A Supabase secret key cannot be used in the browser. Use the public publishable key instead.",
      };
    if (!key.startsWith("sb_publishable_")) {
      const parts = key.split(".");
      if (parts.length !== 3)
        return {
          status: "invalid",
          message:
            "Use a Supabase public publishable key or a legacy anon key.",
        };
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const decoded: unknown = JSON.parse(atob(payload));
      if (
        !decoded ||
        typeof decoded !== "object" ||
        !("role" in decoded) ||
        decoded.role !== "anon"
      ) {
        return {
          status: "invalid",
          message:
            "Only the public anon role is allowed in a legacy browser key. Never use a service-role key.",
        };
      }
    }
    return { status: "ready", url: parsed.origin, key };
  } catch {
    return {
      status: "invalid",
      message:
        "Check the Supabase project URL and public key format in .env.local. Do not use a dashboard URL or secret key.",
    };
  }
}
