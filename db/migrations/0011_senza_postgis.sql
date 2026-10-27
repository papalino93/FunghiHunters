-- FungiCast - via PostGIS: le coordinate diventano testo, e `spatial_ref_sys` sparisce
--
-- PERCHE'
--
-- Supabase segnala dal 17/10/2026 `rls_disabled_in_public` su `spatial_ref_sys`, la tabella dei
-- sistemi di coordinate che PostGIS crea nello schema `public`. `0010` provava ad accenderle la
-- RLS, ma su Supabase quella tabella appartiene a `supabase_admin`: ne' noi ne' il proprietario del
-- progetto possiamo modificarla, e l'avviso e' rimasto (25/10/2026). La strada indicata da
-- Supabase e' non avere PostGIS in `public`.
--
-- E PostGIS qui non serve: l'app non fa nessun calcolo spaziale nel database. Lo usano solo
-- colonne di coordinate - quelle delle uscite (`geom_exact`, `geom_public`) e tre in tabelle
-- vuote, mai usate dall'app (`weather_stations`, `grid_cells`, `user_locations`).
--
-- C'era anzi un difetto: l'app scrive le coordinate come testo EWKT ('SRID=4326;POINT(lon lat)')
-- e le rilegge come testo (`parsePoint` in `src/lib/sync/supabase-backend.ts`), ma da una colonna
-- `geography` il server le restituisce in binario. Un'uscita scaricata su un altro telefono
-- arrivava quindi senza coordinate. Con colonne di testo il giro torna esatto.
--
-- COSA FA
--
-- Parte 1, in una transazione: toglie gli indici spaziali e converte ogni colonna `geography` o
-- `geometry` dello schema `public` in testo EWKT, con le stesse coordinate. Se qualcosa va storto
-- non cambia niente.
-- Parte 2: toglie l'estensione PostGIS, senza CASCADE: se qualcosa dipendesse ancora da lei, si
-- ferma con un errore invece di cancellarlo. Con PostGIS se ne va `spatial_ref_sys`, e l'avviso.
--
-- Se la parte 2 risponde «must be owner of extension postgis», l'estensione si toglie dalla
-- dashboard: Database -> Extensions -> postgis -> spegnere l'interruttore.
--
-- Si esegue con l'azione «Migrazione del database» (`.github/workflows/db-migrate.yml`) o
-- nell'SQL Editor di Supabase. Si puo' rieseguire: le colonne gia' di testo non si
-- toccano piu'.

-- ----------------------------------------------------------------------------
-- Parte 1: coordinate in testo
-- ----------------------------------------------------------------------------

begin;

do $$
declare
  r record;
begin
  -- Gli indici spaziali (GiST) non valgono per il testo: vanno tolti prima di cambiare tipo.
  for r in
    select i.relname as index_name
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_am a on a.oid = i.relam
    where n.nspname = 'public' and a.amname = 'gist' and t.relname <> 'spatial_ref_sys'
  loop
    execute format('drop index if exists public.%I', r.index_name);
    raise notice 'Tolto l''indice spaziale %', r.index_name;
  end loop;

  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.udt_name in ('geography', 'geometry')
      and c.table_name not in ('spatial_ref_sys', 'geometry_columns', 'geography_columns')
  loop
    execute format(
      'alter table public.%I alter column %I type text using st_asewkt(%I)',
      r.table_name, r.column_name, r.column_name
    );
    raise notice 'Coordinate in testo: %.%', r.table_name, r.column_name;
  end loop;
end
$$;

commit;

-- ----------------------------------------------------------------------------
-- Parte 2: via PostGIS (e con lui spatial_ref_sys)
-- ----------------------------------------------------------------------------

drop extension if exists postgis;

-- ----------------------------------------------------------------------------
-- Verifica
-- ----------------------------------------------------------------------------

-- Deve dire 0: PostGIS non c'e' piu'.
select count(*) as postgis_installato from pg_extension where extname = 'postgis';

-- Le colonne di coordinate, ora di tipo text, e quante uscite hanno ancora le loro coordinate.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and column_name in ('geom', 'geom_exact', 'geom_public', 'centroid')
order by table_name, column_name;

-- Solo il conteggio, mai una coordinata: questa verifica finisce nei log delle Actions.
select count(*) filter (where geom_public is not null) as uscite_con_coordinate,
       count(*) filter (where geom_public like 'SRID=4326;POINT(%') as nel_formato_dell_app
from public.user_observations;
