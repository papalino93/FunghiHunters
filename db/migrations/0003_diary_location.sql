-- Posizione reale e specie arboree per il diario uscite.
--
-- Prima il diario salvava solo il punto di riferimento della zona (un centro storico, non un
-- posto): utile per il modello, inutile per ritrovare una fungaia. `position_source` distingue
-- una posizione GPS catturata sul momento da quella di ripiego, cosi' chi legge sa cosa sta
-- guardando. `tree_species` e' un elenco libero (non un enum): la lista riconosciuta dall'app vive
-- in `src/lib/diary/types.ts` e puo' crescere senza una migrazione.
--
-- Le foto non hanno una colonna qui apposta: restano locali al dispositivo (vedi il commento su
-- `DiaryEntry.photoIds`), portarle nel cloud richiede un bucket di storage con le sue policy RLS,
-- non ancora costruito.

alter table user_observations
  add column if not exists position_source text
    check (position_source is null or position_source in ('gps', 'zone')),
  add column if not exists tree_species text[] not null default '{}';
