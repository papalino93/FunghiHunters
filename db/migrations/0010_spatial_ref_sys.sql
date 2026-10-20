-- FungiCast - chiude `spatial_ref_sys` alla scrittura dall'esterno
--
-- PERCHE'
--
-- Il 17/10/2026 il controllo di sicurezza di Supabase ha segnalato `rls_disabled_in_public`:
-- una tabella dello schema `public` senza Row Level Security, raggiungibile con la chiave
-- pubblica. E' `spatial_ref_sys`, che non creiamo noi: la crea l'estensione PostGIS
-- (`0001_init.sql`, `create extension postgis`) e contiene l'elenco pubblico dei sistemi di
-- coordinate EPSG. Nessun dato degli utenti. Le tabelle nostre hanno tutte la RLS accesa
-- (`0001`, `0005`, `0007`, `0009`), e `0005` ha tolto i permessi in blocco: ma su
-- `spatial_ref_sys` restano quelli che PostGIS e i privilegi predefiniti di Supabase concedono
-- per conto loro, che `0005` non poteva togliere.
--
-- Leggerla resta lecito e serve: le funzioni di PostGIS la consultano anche quando un utente
-- collegato salva un'uscita con le coordinate (`geography`). Scriverla, no: un elenco EPSG
-- manomesso farebbe calcolare male le posizioni.
--
-- COSA FA
--
-- 1. Prova ad accendere la RLS con una sola regola, «tutti possono leggere»: nessuno puo' piu'
--    inserire, modificare o cancellare, tranne `service_role` e il proprietario. E' quello che
--    toglie l'avviso di Supabase.
-- 2. Su molti progetti Supabase la tabella appartiene a `supabase_admin`, non a `postgres`, e
--    l'`alter table` risponde «must be owner»: in quel caso il passo 1 si salta senza errore.
-- 3. In ogni caso toglie ad `anon` e `authenticated` (e a `public`) ogni permesso di scrittura.
--    La lettura resta.
--
-- Idempotente: si puo' rieseguire senza danni. Va eseguito nell'SQL Editor di Supabase.

do $$
begin
  begin
    execute 'alter table public.spatial_ref_sys enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'spatial_ref_sys' and policyname = 'lettura pubblica'
    ) then
      execute 'create policy "lettura pubblica" on public.spatial_ref_sys for select using (true)';
    end if;
    raise notice 'spatial_ref_sys: RLS accesa, sola lettura per tutti.';
  exception when insufficient_privilege then
    raise notice 'spatial_ref_sys: non siamo i proprietari, la RLS non si puo'' accendere. Tolgo solo la scrittura.';
  end;

  execute 'revoke insert, update, delete, truncate, references, trigger on public.spatial_ref_sys from anon, authenticated, public';
  raise notice 'spatial_ref_sys: scrittura tolta ad anon, authenticated e public.';
end
$$;

-- Verifica: devono risultare solo permessi SELECT per anon e authenticated (o nessuno).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'spatial_ref_sys'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, privilege_type;
