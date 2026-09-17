-- FungiCast Toscana - sincronizzazione multi-dispositivo
--
-- Il diario nasce locale (IndexedDB, `0001_init.sql` gia' prevedeva le tabelle utente con RLS).
-- Per sincronizzarlo servono tre cose che lo schema iniziale non aveva:
--
-- 1. Una chiave che il client possa generare offline e riusare in un upsert idempotente.
--    `id bigserial` non va bene: due dispositivi offline genererebbero id in conflitto o
--    dovrebbero aspettare il server per saperlo. `client_id` e' l'uuid generato dal browser al
--    momento della creazione della voce (vedi `src/lib/diary/store.ts`), stabile per tutta la
--    vita della voce su tutti i dispositivi.
-- 2. `updated_at`, per risolvere i conflitti con l'unica regola che si puo' spiegare in una
--    frase: vince la modifica piu' recente. Non e' perfetto (una modifica offline vecchia puo'
--    perdere contro una online piu' nuova anche se "arrivata prima" in senso assoluto), ma e'
--    deterministico, riproducibile e visibile all'utente - vedi docs/SYNC.md.
-- 3. `deleted_at`, perche' una cancellazione e' un'informazione che deve propagarsi agli altri
--    dispositivi, non un buco silenzioso. Senza tombstone un dispositivo offline che non ha
--    ancora saputo della cancellazione la resusciterebbe alla sincronizzazione successiva.

alter table user_observations
  add column client_id  text,
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz,
  -- La versione algoritmo congelata arriva dal client come stringa ("1.0.0-porcino"), non come
  -- l'id della riga in `algorithm_versions`: il client non fa quel join, e forzarlo a farlo
  -- prima di ogni sincronizzazione significherebbe bloccare il salvataggio offline per una
  -- lettura di rete. `algorithm_version_id` resta per un collegamento futuro fatto lato server;
  -- questo campo e' quello che il diario usa davvero oggi.
  add column algorithm_version_text text,
  -- Il codice zona ("garfagnana") non e' ancora legato a `grid_cells`: la griglia regionale e'
  -- Fase 2 (vedi docs/DECISIONS.md, D8). Finche' non lo e', il diario sincronizza il nome della
  -- zona cosi' com'e' scelto in app, non un cell_id che non esiste ancora per l'utente.
  add column zone_code text,
  add column zone_name text,
  -- Livello di riservatezza scelto in app ('exact' | 'area' | 'zone'), distinto dal
  -- `privacy_level` di visibilita' gia' presente ('private' | 'municipality' | 'zone' |
  -- 'public'): sono due assi diversi. Il diario non ha ancora nessuna funzione di condivisione
  -- pubblica, quindi `privacy_level` resta al suo default 'private' e non viene toccato da qui.
  add column privacy_level_app text
    check (privacy_level_app in ('exact', 'area', 'zone'));

alter table user_locations
  add column client_id  text,
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

-- Backfill per righe eventualmente gia' presenti prima di questa migrazione: senza client_id
-- l'upsert non puo' funzionare, quindi se ne genera uno stabile ma il caso non dovrebbe
-- verificarsi in pratica (la sincronizzazione non esisteva prima di questa migrazione).
update user_observations set client_id = 'legacy-' || id::text where client_id is null;
update user_locations    set client_id = 'legacy-' || id::text where client_id is null;

alter table user_observations alter column client_id set not null;
alter table user_locations    alter column client_id set not null;

-- L'upsert dal client fa `on conflict (user_id, client_id)`: e' la chiave naturale della
-- sincronizzazione, non l'id interno del bigserial.
create unique index user_observations_user_client_key on user_observations (user_id, client_id);
create unique index user_locations_user_client_key    on user_locations    (user_id, client_id);

-- Le letture di sync filtrano per updated_at: senza indice la pull scansiona tutta la tabella
-- dell'utente a ogni sincronizzazione.
create index user_observations_user_updated_idx on user_observations (user_id, updated_at desc);
create index user_locations_user_updated_idx    on user_locations    (user_id, updated_at desc);

comment on column user_observations.client_id is
  'Id generato dal browser (crypto.randomUUID). Stabile su tutti i dispositivi, chiave dell''upsert.';
comment on column user_observations.deleted_at is
  'Tombstone: la riga resta per propagare la cancellazione agli altri dispositivi, poi va pulita '
  'lato client dopo conferma di sincronizzazione. Mai esposta come cancellazione "vera" in UI.';
