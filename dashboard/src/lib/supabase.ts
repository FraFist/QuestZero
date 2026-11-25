// Client Supabase unico per tutta la dashboard.
// Indirizzo e chiave arrivano da .env.local (vedi .env.example): niente valori nel codice.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'Mancano VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY: copia dashboard/.env.example in .env.local e riempilo.',
  )
}

// Link dell'email di invito (o di recupero): Supabase riporta qui con "#...&type=invite" nell'indirizzo.
// Va letto PRIMA di creare il client, che poi pulisce l'indirizzo. Si ricorda finché la password
// non è stata scelta, anche se la pagina viene ricaricata.
const PASSWORD_FLAG = 'qz-imposta-password'
const linkType = new URLSearchParams(window.location.hash.slice(1)).get('type')
if (linkType === 'invite' || linkType === 'recovery') sessionStorage.setItem(PASSWORD_FLAG, '1')

export function mustSetPassword(): boolean {
  return sessionStorage.getItem(PASSWORD_FLAG) === '1'
}
export function passwordSet(): void {
  sessionStorage.removeItem(PASSWORD_FLAG)
}

export const supabase = createClient<Database>(url, anonKey)

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
export type UserRole = Database['public']['Enums']['user_role']
