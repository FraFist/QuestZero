import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { UserRole } from './supabase'

export interface Profile {
  id: string
  role: UserRole
  participant_code: string | null
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  /** Login riuscito ma nessuna riga in profiles: account creato a mano senza ruolo. */
  | { status: 'no_profile'; session: Session }
  | { status: 'signed_in'; session: Session; profile: Profile }

export const AuthContext = createContext<AuthState>({ status: 'loading' })

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
