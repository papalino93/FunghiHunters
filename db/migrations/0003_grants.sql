-- FungiCast Toscana - permessi mancanti sullo schema public
--
-- Sintomo osservato in produzione: dopo un accesso Google riuscito, la sincronizzazione falliva
-- con `permission denied for schema public`, non con un rifiuto della Row Level Security (che
-- avrebbe restituito zero righe, non un errore). La RLS di `0001_init.sql` filtra le righe *dopo*
-- che l'accesso alla tabella è già concesso: se il ruolo con cui PostgREST si connette non ha
-- `USAGE` sullo schema, Postgres rifiuta prima ancora di guardare le policy.
--
-- Su un progetto Supabase creato dalla dashboard questi permessi ci sono già di norma, concessi
-- allo stesso modo su ogni schema `public`: `anon` e `authenticated` sono i ruoli con cui
-- PostgREST esegue le query dell'app (in base al JWT), `service_role` è quello con cui gira
-- `src/app/api/account/delete/route.ts`. Qui mancavano — questa migrazione li ripristina
-- esplicitamente invece di dipendere da un default che in questo progetto non c'era.
--
-- Non allarga la sicurezza: la Row Level Security abilitata in `0001_init.sql` resta il confine
-- reale riga per riga (`using (user_id = auth.uid())`). Questi grant dicono solo "questi ruoli
-- possono provare ad accedere alla tabella"; chi legge cosa lo decide sempre la RLS.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Perché "for tables/sequences" e non solo per quelle di oggi: una tabella creata da una
-- migrazione futura erediterebbe di nuovo permessi assenti, riproducendo lo stesso bug in un
-- posto nuovo. Da qui in avanti ogni nuova tabella li ha già.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
