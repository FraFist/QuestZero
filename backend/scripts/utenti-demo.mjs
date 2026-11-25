// Crea gli utenti di prova nel Supabase LOCALE: un formatore e un amministratore.
// Uso (da backend/, con `npm start` già fatto): npm run demo:utenti
// Da rilanciare dopo ogni `npx supabase db reset`. Se gli utenti esistono già, non fa nulla.
//
// Credenziali SOLO di prova, valide solo in locale (dominio riservato .test, RFC 2606):
//   formatore@questzero.test       / prova-formatore-locale
//   formatore2@questzero.test      / prova-formatore-locale   (per verificare RF-22: non vede i dati del primo)
//   amministratore@questzero.test  / prova-admin-locale
// Lo script si rifiuta di funzionare se l'indirizzo non è locale: online gli account si creano a mano
// (docs/stato.md, passaggi manuali 3 e 4).
import { execSync } from "node:child_process";

const USERS = [
  { email: "formatore@questzero.test", password: "prova-formatore-locale", role: "trainer", name: "Formatore di prova" },
  { email: "formatore2@questzero.test", password: "prova-formatore-locale", role: "trainer", name: "Secondo formatore" },
  { email: "amministratore@questzero.test", password: "prova-admin-locale", role: "admin", name: "Amministratore di prova" },
];

function localEnv() {
  const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = localEnv();
const url = env.API_URL;
const key = env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase locale non risponde: lancia prima `npm start`.");
  process.exit(1);
}
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`Indirizzo non locale (${host}): questo script vale solo per Supabase locale.`);
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function findUserId(email) {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
  const body = await res.json();
  return body.users?.find((u) => u.email === email)?.id ?? null;
}

for (const u of USERS) {
  let id = await findUserId(u.email);
  if (!id) {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true }),
    });
    if (!res.ok) {
      console.error(`Creazione di ${u.email} non riuscita: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    id = (await res.json()).id;
  }

  // Profilo con ruolo e nome (upsert: se c'è già, si aggiorna).
  const res = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id, role: u.role, display_name: u.name }),
  });
  if (!res.ok) {
    console.error(`Profilo di ${u.email} non creato: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`ok  ${u.role.padEnd(8)} ${u.email}`);
}
console.log("Utenti di prova pronti (password in backend/scripts/utenti-demo.mjs).");
