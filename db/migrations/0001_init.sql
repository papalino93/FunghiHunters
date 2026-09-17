-- FungiCast Toscana - schema iniziale
--
-- Principi applicati, tutti conseguenza di cose viste sui dati reali:
--
-- 1. La finestra di aggregazione sta nella chiave primaria delle osservazioni. Non e' pedanteria:
--    la stessa pioggia compare il 12 agosto nella serie 0-24 e il 13 nella 9-9, e le due serie
--    coincidono sull'anno entro lo 0.1 % ma non giorno per giorno.
-- 2. Nessun controllo di qualita' cancella dati. I flag marcano, non filtrano.
-- 3. algorithm_version_id fa parte della chiave dei risultati, cosi' il confronto fra versioni
--    e il backtest sono una WHERE e non una migrazione.
-- 4. Provenienza e confidence sono per variabile, non per riga.

create extension if not exists postgis;

-- ============================================================================
-- GOVERNANCE DELLE FONTI
-- ============================================================================

create table data_sources (
  id                bigserial primary key,
  code              text not null unique,
  name              text not null,
  url               text not null,
  license_code      text not null,
  license_url       text not null,
  attribution_text  text not null,
  update_frequency  text not null,
  last_sync_at      timestamptz,
  last_success_at   timestamptz,
  last_error        text,
  is_healthy        boolean not null default true
);

comment on column data_sources.license_code is
  'I dati SIR sono CC-BY-SA: lo share-alike si propaga ai punteggi derivati.';

create table ingestion_runs (
  id               bigserial primary key,
  source_id        bigint not null references data_sources(id),
  job              text not null,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null check (status in ('running', 'success', 'partial', 'failed')),
  records_in       integer not null default 0,
  records_written  integer not null default 0,
  records_flagged  integer not null default 0,
  error_json       jsonb
);

create index on ingestion_runs (source_id, started_at desc);

-- Le risposte grezze si conservano: rendono riproducibile ogni bug di parsing.
-- In tabella va solo l'impronta, il corpo sta su object storage.
create table raw_payloads (
  id           bigserial primary key,
  source_id    bigint not null references data_sources(id),
  endpoint     text not null,
  fetched_at   timestamptz not null default now(),
  http_status  integer not null,
  bytes        integer not null,
  sha256       text not null,
  body_ref     text
);

create index on raw_payloads (source_id, fetched_at desc);

-- ============================================================================
-- VERSIONI DELL'ALGORITMO
-- ============================================================================

-- Nessuna soglia, peso, decay o parametro di specie vive nel codice: stanno tutti qui dentro.
create table algorithm_versions (
  id           bigserial primary key,
  version      text not null unique,
  released_at  timestamptz not null default now(),
  config_json  jsonb not null,
  notes        text,
  is_active    boolean not null default false
);

create unique index on algorithm_versions (is_active) where is_active;

-- ============================================================================
-- STAZIONI E OSSERVAZIONI
-- ============================================================================

create table weather_stations (
  id                 bigserial primary key,
  code               text not null unique,
  name               text not null,
  -- Il nome come arriva dalla fonte, prima della riparazione della codifica: "Monte di FÃ²".
  name_raw           text not null,
  municipality       text,
  province           text,
  elevation_m        numeric(7, 2),
  geom               geography(point, 4326) not null,
  source_id          bigint not null references data_sources(id),
  -- Grandezze misurate e anni dichiarati: e' cio' che dice se la stazione e' viva.
  available_measures jsonb not null default '[]'::jsonb,
  is_active          boolean not null default true,
  last_seen_at       timestamptz
);

create index on weather_stations using gist (geom);
create index on weather_stations (province) where is_active;

create table weather_observations (
  station_id            bigint not null references weather_stations(id),
  variable              text not null,
  -- Mai implicita: e' il campo che rende impossibile mescolare 0-24 e 9-9.
  aggregation_window    text not null check (aggregation_window in ('0_24', '9_9', 'instant')),
  observed_date         date not null,
  value                 numeric(10, 3),
  unit                  text not null,
  quality_flag_source   text not null default 'unknown',
  quality_flag_internal text not null default 'ok'
    check (quality_flag_internal in ('ok', 'out_of_range', 'suspect_jump', 'suspect_flat',
                                     'spatial_outlier', 'inconsistent', 'missing', 'interpolated')),
  provenance            text not null default 'OBSERVED'
    check (provenance in ('OBSERVED', 'REANALYSIS', 'MODELLED', 'FORECAST')),
  source_id             bigint not null references data_sources(id),
  source_updated_at     timestamptz,
  ingested_at           timestamptz not null default now(),
  primary key (station_id, variable, observed_date, aggregation_window)
);

create index on weather_observations (variable, observed_date desc);
create index on weather_observations (observed_date desc)
  where quality_flag_internal <> 'ok';

-- Bias sistematico stazione contro modello, per variabile.
-- Misurato sull'Amiata: Tmin -3.14 C, Tmax -0.52 C, con errore residuo di circa 1 C dopo la
-- correzione. Non e' rumore: la stazione sta in una conca e accumula aria fredda di notte.
create table station_biases (
  station_id      bigint not null references weather_stations(id),
  variable        text not null,
  reference_model text not null,
  bias            numeric(6, 3) not null,
  residual_mae    numeric(6, 3) not null,
  sample_days     integer not null,
  computed_at     timestamptz not null default now(),
  primary key (station_id, variable, reference_model)
);

-- ============================================================================
-- GRIGLIA E TERRITORIO
-- ============================================================================

create table grid_cells (
  id                 bigserial primary key,
  resolution_m       integer not null,
  geom               geography(polygon, 4326) not null,
  centroid           geography(point, 4326) not null,
  elevation_m        numeric(7, 2),
  slope_deg          numeric(5, 2),
  aspect_deg         numeric(5, 1),
  -- Topographic Position Index: gli impluvi trattengono acqua diversamente dai crinali.
  tpi                numeric(7, 2),
  -- true per le celle su cui si chiama davvero Open-Meteo. Le altre ereditano e correggono.
  is_anchor          boolean not null default false,
  anchor_cell_id     bigint references grid_cells(id),
  forest_fraction    numeric(4, 3),
  zone_code          text,
  admin_municipality text,
  admin_province     text
);

create index on grid_cells using gist (geom);
create index on grid_cells (zone_code);
create index on grid_cells (is_anchor) where is_anchor;

create table vegetation_data (
  cell_id            bigint primary key references grid_cells(id),
  source_id          bigint not null references data_sources(id),
  ucs_class          text,
  ucs_class_label    text,
  forest_type        text,
  canopy_density     numeric(4, 3),
  dominant_leaf_type text,
  confidence         numeric(5, 2),
  computed_at        timestamptz not null default now()
);

create table soil_data (
  cell_id                   bigint primary key references grid_cells(id),
  source_id                 bigint not null references data_sources(id),
  texture_class             text,
  water_holding_capacity_mm numeric(7, 2),
  depth_class               text
);

-- ============================================================================
-- PREVISIONI
-- ============================================================================

create table weather_forecasts (
  cell_id      bigint not null references grid_cells(id),
  variable     text not null,
  target_date  date not null,
  run_at       timestamptz not null,
  model        text not null,
  value        numeric(10, 3),
  primary key (cell_id, variable, target_date, run_at, model)
);

create index on weather_forecasts (target_date, variable);

-- I 122 membri dell'ensemble non si salvano tutti: si salvano i quantili.
create table forecast_ensemble (
  cell_id         bigint not null references grid_cells(id),
  variable        text not null,
  target_date     date not null,
  run_at          timestamptz not null,
  member_count    integer not null,
  p10             numeric(10, 3),
  p25             numeric(10, 3),
  p50             numeric(10, 3),
  p75             numeric(10, 3),
  p90             numeric(10, 3),
  spread          numeric(10, 3),
  agreement_score numeric(5, 2),
  primary key (cell_id, variable, target_date, run_at)
);

-- ============================================================================
-- CLIMATOLOGIA
-- ============================================================================

-- Normali per cella e per decade. Derivate una volta da ERA5 1991-2020 e poi lette:
-- lo storico grezzo non entra in questa base dati, altrimenti non si sta nei 500 MB.
create table cell_climatology (
  cell_id      bigint not null references grid_cells(id),
  variable     text not null,
  -- Decade dell'anno, 1-36. Piu' fine del mese, abbastanza stabile da non inseguire il rumore.
  decade       smallint not null check (decade between 1 and 36),
  reference    text not null,
  mean_value   numeric(10, 3),
  p10          numeric(10, 3),
  p25          numeric(10, 3),
  p50          numeric(10, 3),
  p75          numeric(10, 3),
  p90          numeric(10, 3),
  sample_years integer not null,
  primary key (cell_id, variable, decade, reference)
);

-- ============================================================================
-- FEATURE E PUNTEGGI
-- ============================================================================

create table cell_features (
  cell_id              bigint not null references grid_cells(id),
  feature_date         date not null,
  algorithm_version_id bigint not null references algorithm_versions(id),

  rain_24h             numeric(8, 2),
  rain_72h             numeric(8, 2),
  rain_7d              numeric(8, 2),
  rain_14d             numeric(8, 2),
  -- Finestra di 26 giorni: e' quella selezionata per AIC nello studio decennale su B. edulis.
  rain_26d             numeric(8, 2),
  rain_30d             numeric(8, 2),
  et0_7d               numeric(8, 2),
  et0_14d              numeric(8, 2),
  effective_moisture_14d numeric(8, 2),
  effective_moisture_21d numeric(8, 2),
  soil_water_balance   numeric(8, 2),
  -- Finestra di 20 giorni, con ottimo a 13 C: stessa fonte.
  t_mean_20d           numeric(6, 2),
  t_min_window         numeric(6, 2),
  t_max_window         numeric(6, 2),
  t_soil_mean_7d       numeric(6, 2),
  vpd_mean_7d          numeric(6, 3),
  wind_mean_7d         numeric(6, 2),
  rh_mean_7d           numeric(5, 2),
  days_since_event     integer,
  drought_index_prior  numeric(6, 3),
  rain_percentile_26d  numeric(5, 2),
  t_percentile_20d     numeric(5, 2),

  -- Per variabile, non per riga: {"rain_7d": {"prov": "OBSERVED", "conf": 88}, ...}
  provenance_map       jsonb not null default '{}'::jsonb,
  confidence_map       jsonb not null default '{}'::jsonb,
  computed_at          timestamptz not null default now(),
  primary key (cell_id, feature_date, algorithm_version_id)
);

create table rain_events (
  id              bigserial primary key,
  cell_id         bigint not null references grid_cells(id),
  start_date      date not null,
  end_date        date not null,
  total_mm        numeric(8, 2) not null,
  duration_days   integer not null,
  max_daily_mm    numeric(8, 2) not null,
  intensity_mm_day numeric(8, 2) not null,
  prior_dry_days  integer not null,
  prior_rain_30d  numeric(8, 2) not null
);

create index on rain_events (cell_id, end_date desc);

-- Una sola specie in v1: "porcino", senza distinzioni tassonomiche esposte.
-- La struttura resta estendibile, ma l'estensione non e' un obiettivo.
create table species (
  id             bigserial primary key,
  code           text not null unique,
  scientific_name text,
  common_name_it text not null,
  is_active      boolean not null default true
);

create table species_parameters (
  species_id           bigint not null references species(id),
  algorithm_version_id bigint not null references algorithm_versions(id),
  param_key            text not null,
  param_value          jsonb not null,
  source_citation      text,
  source_url           text,
  -- false significa "parametro da calibrare", non dato scientifico. La UI lo mostra come tale.
  is_calibrated        boolean not null default false,
  primary key (species_id, algorithm_version_id, param_key),
  -- Un parametro dichiarato calibrato senza fonte e' esattamente cio' che non vogliamo.
  constraint calibrated_needs_source
    check (not is_calibrated or source_citation is not null)
);

create table mpi_scores (
  cell_id              bigint not null references grid_cells(id),
  species_id           bigint not null references species(id),
  score_date           date not null,
  horizon_type         text not null check (horizon_type in ('CURRENT', 'DEVELOPMENT', 'FORECAST')),
  algorithm_version_id bigint not null references algorithm_versions(id),
  mpi                  numeric(5, 2) not null check (mpi between 0 and 100),
  confidence           numeric(5, 2) not null check (confidence between 0 and 100),
  trend_7d             numeric(6, 2),
  best_window_start    date,
  best_window_end      date,
  -- Output di explainScore(): fattori positivi, negativi, neutri e di confidence.
  breakdown            jsonb not null default '{}'::jsonb,
  computed_at          timestamptz not null default now(),
  primary key (cell_id, species_id, score_date, horizon_type, algorithm_version_id)
);

create index on mpi_scores (score_date desc, horizon_type);

-- ============================================================================
-- UTENTE
-- ============================================================================

create table user_locations (
  id            bigserial primary key,
  user_id       uuid not null,
  name          text not null,
  geom          geography(point, 4326) not null,
  radius_m      integer not null default 2000,
  privacy_level text not null default 'private'
    check (privacy_level in ('private', 'municipality', 'zone', 'public')),
  created_at    timestamptz not null default now()
);

-- Il diario uscite e' il dato piu' prezioso del progetto: e' cio' che permette di calibrare il
-- modello confrontando MPI previsto ed esito reale.
create table user_observations (
  id                       bigserial primary key,
  user_id                  uuid not null,
  observed_at              date not null,
  cell_id                  bigint references grid_cells(id),
  -- Coordinate esatte private, versione sfocata per l'eventuale condivisione.
  geom_exact               geography(point, 4326),
  geom_public              geography(point, 4326),
  species_id               bigint references species(id),
  abundance                text check (abundance in ('none', 'few', 'some', 'many', 'exceptional')),
  elevation_m              numeric(7, 2),
  photo_ref                text,
  notes                    text,
  privacy_level            text not null default 'private'
    check (privacy_level in ('private', 'municipality', 'zone', 'public')),
  -- Congelati al momento dell'inserimento. Senza questi tre campi il dato di calibrazione e'
  -- irrecuperabile a posteriori, perche' il modello nel frattempo cambia.
  mpi_at_observation       numeric(5, 2),
  confidence_at_observation numeric(5, 2),
  algorithm_version_id     bigint references algorithm_versions(id),
  created_at               timestamptz not null default now()
);

create index on user_observations (user_id, observed_at desc);

create table alerts (
  id            bigserial primary key,
  user_id       uuid not null,
  location_id   bigint references user_locations(id),
  species_id    bigint references species(id),
  trigger_json  jsonb not null,
  channel       text not null default 'push',
  is_active     boolean not null default true,
  last_fired_at timestamptz
);

-- ============================================================================
-- SICUREZZA
-- ============================================================================

alter table user_locations    enable row level security;
alter table user_observations enable row level security;
alter table alerts            enable row level security;

create policy user_locations_owner on user_locations
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_observations_owner on user_observations
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy alerts_owner on alerts
  using (user_id = auth.uid()) with check (user_id = auth.uid());
