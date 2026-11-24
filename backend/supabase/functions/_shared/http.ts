// Risposte HTTP comuni alle Edge Functions.
// CORS: in locale si accettano chiamate da qualunque origine; online DASHBOARD_ORIGIN va
// impostato all'indirizzo della dashboard (es. https://dashboard.questzero.it).

const allowedOrigin = Deno.env.get("DASHBOARD_ORIGIN") ?? "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function errorResponse(status: number, error: string, message: string): Response {
  return json({ error, message }, status);
}

// Gestisce la richiesta preliminare dei browser (OPTIONS) e i metodi diversi da POST.
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "method_not_allowed", "Usa POST");
  return null;
}

export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
