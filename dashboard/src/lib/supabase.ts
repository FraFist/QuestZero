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

export const supabase = createClient<Database>(url, anonKey)

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
export type UserRole = Database['public']['Enums']['user_role']
