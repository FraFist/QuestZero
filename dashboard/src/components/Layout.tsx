// Cornice delle pagine dopo il login: barra con logo, menu del ruolo e uscita.
import { NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import { roleLabel } from '../lib/messages'
import logoBianco from '../assets/questzero-orizzontale-bianco.svg'

export interface MenuItem {
  to: string
  label: string
}

export function Layout({ menu }: { menu: MenuItem[] }) {
  const auth = useAuth()
  const who =
    auth.status === 'signed_in'
      ? auth.profile.role === 'participant'
        ? `Studente ${auth.profile.participant_code ?? ''}`
        : (auth.profile.display_name ?? roleLabel(auth.profile.role))
      : ''

  return (
    <>
      <header className="barra">
        <div className="barra-interno">
          <NavLink to="/" className="barra-logo" aria-label="QuestZero, pagina iniziale">
            <img src={logoBianco} alt="" />
          </NavLink>
          <nav aria-label="Menu principale">
            {menu.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="barra-utente">
            <span>{who}</span>
            <button className="btn btn-barra" type="button" onClick={() => void supabase.auth.signOut()}>
              Esci
            </button>
          </div>
        </div>
      </header>
      <main className="pagina">
        <Outlet />
      </main>
    </>
  )
}
