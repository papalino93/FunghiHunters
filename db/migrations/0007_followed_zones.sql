-- Zone che seguo.
--
-- Non e' un'estensione di `user_locations`: quella tabella ha `geom geography(point) not null` +
-- `radius_m`, pensata per un punto GPS personale con un raggio (la futura area salvata/allarme).
-- Le zone che seguo sono l'opposto per vincolo di prodotto: mai coordinate, solo un riferimento a
-- una zona gia' nel catalogo. Forzarle in `user_locations` avrebbe voluto dire inventare una
-- geometria finta per ogni zona, o riscrivere lo schema di una funzione futura diversa. Questa
-- tabella e' invece minima e riusa esattamente il pattern di sincronizzazione gia' verificato per
-- il diario (`0002_sync.sql`): stessa colonna `client_id` come chiave naturale lato client, stesso
-- `updated_at` per il confronto last-write-wins, stesso `deleted_at` come tombstone.
--
-- `client_id` qui e' il codice della zona stesso (non un uuid): seguire la stessa zona da due
-- dispositivi deve convergere sulla stessa riga, non crearne due. Vedi il commento in
-- `src/lib/zones/types.ts`.

create table user_followed_zones (
  id            bigserial primary key,
  user_id       uuid not null,
  client_id     text not null,
  zone_code     text not null,
  zone_name     text not null,
  region_slug   text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index user_followed_zones_user_client_key on user_followed_zones (user_id, client_id);
create index user_followed_zones_user_updated_idx on user_followed_zones (user_id, updated_at desc);

alter table user_followed_zones enable row level security;

create policy user_followed_zones_owner on user_followed_zones
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on column user_followed_zones.client_id is
  'Il codice zona stesso, non un uuid: e'' la chiave naturale dell''upsert (user_id, client_id).';
comment on column user_followed_zones.deleted_at is
  'Tombstone: la riga resta per propagare la cancellazione agli altri dispositivi, poi va pulita '
  'lato client dopo conferma di sincronizzazione — stessa logica del diario, vedi 0002_sync.sql.';
