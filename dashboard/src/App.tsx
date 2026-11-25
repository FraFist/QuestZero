// Pagine e permessi: senza login si va a /login; con il login il ruolo (profiles.role)
// decide quale insieme di pagine si vede. I dati restano comunque protetti dalla RLS.
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './lib/AuthProvider'
import { useAuth } from './lib/auth-context'
import { mustSetPassword, supabase } from './lib/supabase'
import { Layout, type MenuItem } from './components/Layout'
import { Login } from './pages/Login'
import { TrainerHome } from './pages/trainer/Home'
import { Studenti } from './pages/trainer/Studenti'
import { Studente } from './pages/trainer/Studente'
import { ErroriFrequenti } from './pages/trainer/ErroriFrequenti'
import { NuovaSessione } from './pages/trainer/NuovaSessione'
import { Sessione } from './pages/trainer/Sessione'
import { ImpostaPassword } from './pages/ImpostaPassword'
import { MieiRisultati } from './pages/student/MieiRisultati'
import { InformativaPrivacy } from './components/InformativaPrivacy'
import { AdminSessioni } from './pages/admin/AdminSessioni'
import { AdminStudenti } from './pages/admin/AdminStudenti'
import { AdminFormatori } from './pages/admin/AdminFormatori'

const TRAINER_MENU: MenuItem[] = [
  { to: '/', label: 'Sessioni' },
  { to: '/studenti', label: 'Studenti' },
  { to: '/errori', label: 'Errori frequenti' },
]

const ADMIN_MENU: MenuItem[] = [
  { to: '/', label: 'Sessioni' },
  { to: '/studenti', label: 'Studenti' },
  { to: '/formatori', label: 'Formatori' },
  { to: '/errori', label: 'Errori frequenti' },
]

function Pages() {
  const auth = useAuth()
  // Arrivati dal link di invito: prima si sceglie la password (RF-20).
  const [needsPassword, setNeedsPassword] = useState(mustSetPassword)

  if (auth.status === 'loading') {
    return <div className="caricamento">Caricamento…</div>
  }

  if (auth.status === 'signed_out') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (auth.status === 'no_profile') {
    return (
      <main className="pagina">
        <h1>Account senza ruolo</h1>
        <div className="avviso avviso-errore" role="alert">
          Il login è riuscito, ma questo account non è registrato come formatore, studente o
          amministratore. Chiedi all'amministratore di assegnarti un ruolo.
        </div>
        <div>
          <button className="btn btn-secondario" type="button" onClick={() => void supabase.auth.signOut()}>
            Esci
          </button>
        </div>
      </main>
    )
  }

  if (needsPassword) return <ImpostaPassword onDone={() => setNeedsPassword(false)} />

  const role = auth.profile.role
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      {role === 'trainer' && (
        <Route element={<Layout menu={TRAINER_MENU} />}>
          <Route index element={<TrainerHome />} />
          <Route path="studenti" element={<Studenti />} />
          <Route path="studenti/:id" element={<Studente />} />
          <Route path="errori" element={<ErroriFrequenti />} />
          <Route path="sessioni/nuova" element={<NuovaSessione />} />
          <Route path="sessioni/:id" element={<Sessione />} />
        </Route>
      )}
      {role === 'participant' && (
        <Route element={<Layout menu={[{ to: '/', label: 'I miei risultati' }]} />}>
          <Route
            index
            element={
              <InformativaPrivacy userId={auth.session.user.id}>
                <MieiRisultati />
              </InformativaPrivacy>
            }
          />
        </Route>
      )}
      {role === 'admin' && (
        <Route element={<Layout menu={ADMIN_MENU} />}>
          <Route index element={<AdminSessioni />} />
          <Route path="studenti" element={<AdminStudenti />} />
          <Route path="studenti/:id" element={<Studente />} />
          <Route path="formatori" element={<AdminFormatori />} />
          <Route path="errori" element={<ErroriFrequenti />} />
          <Route path="sessioni/:id" element={<Sessione />} />
        </Route>
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Pages />
      </BrowserRouter>
    </AuthProvider>
  )
}
