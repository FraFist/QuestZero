// Tiene traccia di chi ha fatto il login e del suo ruolo (tabella profiles).
// Il ruolo decide quali pagine mostrare; i dati che ognuno può leggere li limita comunque
// il database con le regole RLS (RNF-11, RF-22).
import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AuthContext, type AuthState } from './auth-context'

async function loadState(session: Session | null): Promise<AuthState> {
  if (!session) return { status: 'signed_out' }
  const { data } = await supabase
    .from('profiles')
    .select('id, role, participant_code, display_name')
    .eq('id', session.user.id)
    .maybeSingle()
  return data
    ? { status: 'signed_in', session, profile: data }
    : { status: 'no_profile', session }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    const apply = (session: Session | null) => {
      void loadState(session).then((next) => {
        if (current) setState(next)
      })
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session))

    // Login, logout e rinnovo del token. Si ricarica il profilo solo quando cambia l'utente
    // o la sessione finisce; la chiamata al database avviene fuori dal callback (consiglio di Supabase).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => apply(session), 0)
      }
    })

    return () => {
      current = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
