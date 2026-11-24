// Client Supabase per le Edge Functions.
// URL e chiavi li fornisce Supabase stesso come variabili d'ambiente: niente segreti nel codice.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variabile d'ambiente ${name} mancante`);
  return value;
}

// Client con permessi da amministratore (service role): ignora le regole RLS.
// Si usa solo dopo aver controllato chi sta chiamando.
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Client "come l'utente che chiama": usa il suo token di login, quindi valgono le regole RLS.
export function userClient(authorization: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
