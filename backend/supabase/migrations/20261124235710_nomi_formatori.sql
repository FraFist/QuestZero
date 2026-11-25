-- Migrazione 10: nome leggibile di formatori e amministratori.
-- Requisiti: RF-22 (l'amministratore sposta gli studenti tra formatori: deve riconoscerli),
-- RNF-19 (gli studenti restano solo il loro codice: per loro il nome non esiste).
--
-- Il nome lo imposta l'amministratore dalla dashboard: la regola profiles_update_admin
-- (migrazione 1) permette già solo a lui di modificare i profili.

alter table public.profiles add column display_name text;

comment on column public.profiles.display_name is
  'Nome di formatori e amministratori, mostrato in dashboard. Sempre null per gli studenti (RNF-19).';

-- Gli studenti non hanno un nome: sono solo il loro codice (RNF-19).
alter table public.profiles add constraint profiles_display_name_only_staff
  check (display_name is null or role <> 'participant');

-- Niente nomi vuoti o lunghissimi.
alter table public.profiles add constraint profiles_display_name_length
  check (display_name is null or char_length(btrim(display_name)) between 1 and 80);
