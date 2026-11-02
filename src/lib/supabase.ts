import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const isSupabaseConfigured = Boolean(url && key);
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
        realtime: { params: { eventsPerSecond: 15 } },
      })
    : null;

let pendingGuest: Promise<string> | null = null;
export function requireSupabase() {
  if (!supabase)
    throw new Error(
      "Private rooms need a connected Supabase project. Solo puzzles are available now.",
    );
  return supabase;
}

export function ensureGuest(): Promise<string> {
  if (pendingGuest) return pendingGuest;
  pendingGuest = (async () => {
    const client = requireSupabase();
    const { data: existing, error: sessionError } =
      await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (existing.session) return existing.session.user.id;
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw new Error(`Guest sign-in failed: ${error.message}`);
    if (!data.user)
      throw new Error("Guest sign-in returned no user. Please try again.");
    return data.user.id;
  })().finally(() => {
    pendingGuest = null;
  });
  return pendingGuest;
}
