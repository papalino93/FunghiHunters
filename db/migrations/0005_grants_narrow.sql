-- FungiCast Toscana - restringe i permessi concessi in blocco da 0003_grants.sql
--
-- COSA CORREGGE
--
-- `0003_grants.sql` risolveva un blocco reale della sincronizzazione (`permission denied for
-- schema public`) ma lo faceva con l'accetta:
--
--   grant select, insert, update, delete on all tables in schema public to anon, authenticated;
--
-- La sua nota diceva "non allarga la sicurezza, la RLS resta il confine reale riga per riga".
-- È vero **solo per le tabelle su cui la RLS è accesa**, e in `0001_init.sql` è accesa su tre:
-- `user_locations`, `user_observations`, `alerts`. Le altre diciotto — fra cui `mpi_scores`,
-- `weather_observations`, `algorithm_versions`, `species_parameters` — non hanno né RLS né
-- policy. Su quelle il grant non era filtrato da nulla.
--
-- Perché conta: `anon` è il ruolo della chiave pubblica, quella che sta in chiaro nel bundle
-- JavaScript (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) e che PostgREST espone su ogni tabella dello
-- schema `public`. Chiunque apra il sito e legga quella chiave poteva quindi scrivere, modificare
-- e cancellare righe di quelle diciotto tabelle.
--
-- Impatto ad oggi: nessun dato perso, perché il codice dell'app non legge né scrive nessuna di
-- quelle tabelle (lo snapshot viaggia come file statico, `public/data/snapshot.json`) e in
-- produzione sono vuote. Il buco però era già aperto, e si sarebbe trasformato in manomissione
-- degli ingressi del modello il giorno in cui la pipeline avesse iniziato a scriverci davvero.
--
-- COSA FA
--
-- 1. toglie i permessi in blocco;
-- 2. li ridà solo sulle tre tabelle utente, che la RLS protegge davvero;
-- 3. accende la RLS su tutte le altre, così l'affermazione di 0003 diventa finalmente vera per
--    ogni tabella: senza policy nessuno passa, tranne `service_role`, che la RLS la scavalca per
--    definizione e la cui chiave non lascia mai il server;
-- 4. rimette a posto le `default privileges`, che altrimenti avrebbero riprodotto lo stesso buco
--    su ogni tabella creata in futuro — la parte più insidiosa, perché silenziosa.

-- ----------------------------------------------------------------------------
-- 1. Via i permessi concessi in blocco
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- `usage` sullo schema resta: senza, si torna esattamente all'errore che 0003 curava.
-- Dice solo "puoi nominare gli oggetti di questo schema", non "puoi leggerli".
grant usage on schema public to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Permessi solo dove la RLS fa da filtro
-- ----------------------------------------------------------------------------

-- Le uniche tre tabelle con `enable row level security` + policy `user_id = auth.uid()`
-- (0001_init.sql). Qui il grant è sicuro: la policy decide riga per riga chi vede cosa.
-- `anon` è incluso perché è il ruolo con cui parte ogni richiesta prima che PostgREST legga il
-- JWT; con `auth.uid()` nullo la policy non gli fa passare nessuna riga.
grant select, insert, update, delete on user_locations    to anon, authenticated;
grant select, insert, update, delete on user_observations to anon, authenticated;
grant select, insert, update, delete on alerts            to anon, authenticated;

-- Le sequenze servono agli `id bigserial` delle tre tabelle qui sopra. Da sole non danno
-- accesso a nessuna riga.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- `service_role` resta pieno: gira solo lato server (`src/app/api/account/delete/route.ts`) con
-- una chiave che non ha il prefisso NEXT_PUBLIC_ e non entra mai nel bundle del browser.
grant all on all tables in schema public to service_role;

-- ----------------------------------------------------------------------------
-- 3. RLS accesa ovunque: nessuna tabella resta scoperta
-- ----------------------------------------------------------------------------
--
-- Senza policy, accendere la RLS equivale a "nessuno tranne service_role". È esattamente quello
-- che serve per le tabelle della pipeline: ci scrive il processo di ingestione lato server, non
-- il browser. `if exists` perché questo file deve poter girare anche su un database a cui non
-- sono state applicate tutte le migrazioni precedenti.

alter table if exists data_sources        enable row level security;
alter table if exists ingestion_runs      enable row level security;
alter table if exists raw_payloads        enable row level security;
alter table if exists algorithm_versions  enable row level security;
alter table if exists weather_stations    enable row level security;
alter table if exists weather_observations enable row level security;
alter table if exists station_biases      enable row level security;
alter table if exists grid_cells          enable row level security;
alter table if exists vegetation_data     enable row level security;
alter table if exists soil_data           enable row level security;
alter table if exists weather_forecasts   enable row level security;
alter table if exists forecast_ensemble   enable row level security;
alter table if exists cell_climatology    enable row level security;
alter table if exists cell_features       enable row level security;
alter table if exists rain_events         enable row level security;
alter table if exists species             enable row level security;
alter table if exists species_parameters  enable row level security;
alter table if exists mpi_scores          enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Le tabelle future non ereditano il buco
-- ----------------------------------------------------------------------------
--
-- 0003 lasciava `alter default privileges ... grant select, insert, update, delete on tables to
-- anon, authenticated`: ogni tabella creata dopo nasceva scrivibile dalla chiave pubblica, senza
-- che nessuno lo notasse. Si revoca il default; una nuova tabella che debba essere raggiungibile
-- dal client dovrà dichiararlo esplicitamente, insieme alla sua policy.

alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;

-- Questo invece resta: il ruolo di servizio deve continuare a vedere ciò che crea.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
