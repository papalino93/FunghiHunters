-- Contesto della ricerca: durata e numero di cercatori.
--
-- Due campi facoltativi che rendono leggibile uno "zero": dieci minuti senza trovare niente e
-- mezza giornata senza trovare niente non sono la stessa informazione, ma senza questi due campi
-- il diario li registrava allo stesso modo. Vedi `shortSearchCaveat` in `src/lib/diary/calibration.ts`.
--
-- Gli stessi intervalli validati lato client (`src/lib/diary/types.ts`,
-- `isValidDurationMinutes`/`isValidSearchers`) sono ripetuti qui come vincolo del database: un
-- client futuro diverso dall'app web non deve poter scrivere un valore che l'interfaccia non
-- permetterebbe mai di inserire.

alter table user_observations
  add column if not exists duration_minutes integer
    check (duration_minutes is null or duration_minutes between 5 and 720),
  add column if not exists searchers integer
    check (searchers is null or searchers between 1 and 20);
