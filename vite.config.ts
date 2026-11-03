import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readPublicConfig } from "./src/lib/public-config";
import { securityHeaders } from "./security-headers";
export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), "VITE_");
  const configuration = readPublicConfig(
    values.VITE_SUPABASE_URL,
    values.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (configuration.status === "invalid")
    throw new Error(`Supabase configuration: ${configuration.message}`);
  return {
    plugins: [react()],
    preview: { headers: securityHeaders },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
