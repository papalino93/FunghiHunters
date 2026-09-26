-- FungiCast - amministratore e registro degli accessi
--
-- Due tabelle, entrambe irraggiungibili dal browser: chi e' l'amministratore (`app_admins`) e
-- cosa ha letto (`admin_access_log`).
--
-- PERCHE' ESISTE
--
-- Il titolare del trattamento ha accesso al database: e' vero in questo progetto come in
-- qualunque servizio, e l'informativa lo dice a chiare lettere da quando esiste `/admin`. Cio'
-- che distingue un accesso legittimo del titolare da un problema serio non e' il permesso - quello
-- c'e' comunque, basta aprire la dashboard Supabase - ma il poter dimostrare *quando* si e'
-- guardato e *perche'*. E' il principio di responsabilizzazione dell'art. 5.2 GDPR: non basta
-- trattare i dati correttamente, bisogna poterlo provare.
--
-- Questa tabella e' quella prova. Ogni lettura di `/api/admin/*` ci scrive una riga prima di
-- restituire qualunque cosa.
--
-- IRRAGGIUNGIBILE DAL CLIENT, PER COSTRUZIONE
--
-- RLS attiva e *nessuna policy*: senza policy, RLS nega tutto. Nessun `grant` a `anon` o
-- `authenticated`: da `0005_grants_narrow.sql` in poi una tabella nuova nasce senza permessi e
-- resta cosi' finche' qualcuno non li concede, e qui non li concede nessuno - di proposito.
-- La service role key, che e' l'unica cosa che scrive qui, scavalca sia RLS sia i grant: non le
-- serve nessuna delle due cose. Il risultato e' un registro che il browser non puo' leggere,
-- scrivere, ne' - soprattutto - ripulire.
--
-- Non contiene i dati guardati, solo il fatto che sono stati guardati: chi, quando, quale
-- operazione, quante righe. Un registro che copiasse dentro di se' le note degli utenti sarebbe
-- una seconda copia degli stessi dati personali, cioe' l'opposto della minimizzazione.

create table if not exists admin_access_log (
  id uuid primary key default gen_random_uuid(),
  -- Chi: l'uuid di `auth.users`, non l'email. L'email puo' cambiare, l'uuid no.
  admin_user_id uuid not null,
  -- Quando: ora del server, non del client, che e' l'unica di cui ci si possa fidare.
  accessed_at timestamptz not null default now(),
  -- Cosa: il nome dell'operazione (`observations.list`, `observations.export`, ...).
  action text not null,
  -- Quante righe ha restituito: dice la portata dell'accesso senza duplicarne il contenuto.
  rows_returned integer not null default 0,
  -- Da dove, per riconoscere un accesso che non si ricorda di aver fatto.
  user_agent text,
  ip_address text
);

-- L'interrogazione tipica e' "cosa e' stato letto, dal piu' recente": l'indice segue quella.
create index if not exists admin_access_log_accessed_at_idx
  on admin_access_log (accessed_at desc);

alter table admin_access_log enable row level security;

-- Nessuna policy e nessun grant, deliberatamente: vedi sopra. Le due righe che seguono sono
-- ridondanti rispetto a `0005`, e stanno qui perche' una migrazione deve essere leggibile da sola
-- e perche' un `grant` concesso per sbaglio altrove viene comunque revocato rieseguendo questo
-- file.
revoke all on admin_access_log from anon, authenticated;

-- ============================================================================================
-- CHI E' L'AMMINISTRATORE
-- ============================================================================================
--
-- Una tabella e non una variabile d'ambiente su Vercel. La prima versione di questo pannello
-- chiedeva `ADMIN_USER_ID` fra le impostazioni di Vercel: voleva dire cercare il proprio UID
-- nella dashboard di Supabase, copiarlo nella dashboard di Vercel, e rifare il deploy - tre posti
-- diversi per dire una cosa sola. Qui basta questa migrazione, eseguita dove si eseguono gia'
-- tutte le altre, e l'effetto e' immediato: nessun deploy.
--
-- La sicurezza non cambia. Sapere chi e' l'amministratore non da' nessun potere: la rotta
-- verifica comunque il token con Supabase prima di guardare questa tabella. E la tabella stessa
-- non si puo' ne' leggere ne' modificare dal browser - stessa regola del registro qui sopra:
-- RLS senza policy, nessun grant. Per diventare amministratore bisogna gia' avere accesso al
-- database, cioe' esserlo.
--
-- L'amministratore NON viene inserito qui: questo file finisce su GitHub, e l'indirizzo con cui
-- il titolare accede non deve finirci. L'inserimento e' una riga a parte, eseguita una volta
-- sola nell'SQL Editor:
--
--   insert into app_admins (user_id)
--   select id from auth.users where email = '<indirizzo con cui accedi a FungiCast>'
--   on conflict do nothing;

create table if not exists app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table app_admins enable row level security;
revoke all on app_admins from anon, authenticated;
