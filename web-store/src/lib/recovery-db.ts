import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// A submitted recovery proof can only change the password of the account it proves.
// Keep the short-lived Auth session inside this request, including if updateUser rejects the password.
export function recoveryDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Older emailed PKCE codes need the original verifier. Do not import the signed-in user's session.
export async function legacyRecoveryDb() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll().filter(cookie => /-code-verifier(?:\.\d+)?$/.test(cookie.name)),
      setAll() { /* Never replace the browser's signed-in identity during recovery. */ },
    },
  });
}
