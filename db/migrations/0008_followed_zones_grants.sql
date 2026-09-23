-- FungiCast - permessi sulla tabella delle zone seguite
--
-- COSA CORREGGE
--
-- `0007_followed_zones.sql` crea `user_followed_zones` con RLS e policy, ma non concede nessun
-- permesso sulla tabella. Da `0005_grants_narrow.sql` in poi non ci pensa piu' nessun altro: la
-- sezione 4 di quel file revoca apposta le `default privileges` di `anon` e `authenticated`, cosi'
-- che una tabella nuova nasca irraggiungibile dal client finche' non lo dichiara. `0007` e' la
-- prima tabella nata dopo quella revoca, e la dichiarazione mancava: in produzione ogni lettura o
-- scrittura del browser risponde `permission denied for table user_followed_zones`, e la
-- sincronizzazione delle zone seguite fallisce anche con l'utente regolarmente autenticato. La RLS
-- non c'entra: filtra le righe *dopo* che il permesso sulla tabella e' gia' stato concesso.
--
-- COSA FA
--
-- Concede esattamente cio' che `0005` concede al diario (`user_observations`), che e' il modello
-- di sincronizzazione riusato da `0007` (stesso `client_id`, `updated_at`, `deleted_at`):
--
--   grant select, insert, update, delete on user_observations to anon, authenticated;
--
-- Stessi ruoli e stessi privilegi, non di piu'. `anon` compare per coerenza con il diario e con la
-- motivazione scritta in `0005`; con `auth.uid()` nullo la policy `user_followed_zones_owner` non
-- gli fa passare nessuna riga, ne' in lettura ne' in scrittura (`with check`). Niente `truncate`,
-- `references` o `trigger`: il diario non li ha e il client non ne ha bisogno.
--
-- Idempotente: un `grant` gia' concesso non fa nulla, e il file si puo' rieseguire senza danni.
-- Presuppone `0007` applicata: se la tabella non esiste fallisce con un errore esplicito invece di
-- passare in silenzio, che e' il comportamento giusto per una migrazione eseguita fuori ordine.

grant select, insert, update, delete on user_followed_zones to anon, authenticated;

-- `service_role` ce l'avrebbe gia' dalle `default privileges` di `0005`, ma solo se `0007` e'
-- stata creata dallo stesso ruolo che le ha impostate (vedi la nota sulla sequenza qui sotto).
-- Il diario lo riceve dal `grant all on all tables ... to service_role` di `0005`; qui lo si
-- ripete esplicito perche' la cancellazione dell'account (`src/app/api/account/delete/route.ts`)
-- svuota anche questa tabella con quel ruolo.
grant all on user_followed_zones to service_role;

-- La sequenza di `id bigserial`. Le `default privileges` sulle sequenze sopravvivono a `0005`
-- (sezione 4, ultima istruzione), ma valgono solo per gli oggetti creati dal ruolo che le ha
-- impostate: se `0007` e' stata eseguita da un altro ruolo, senza questa riga ogni insert
-- fallirebbe su `nextval`. Stessi privilegi che `0005` da' alle sequenze del diario.
grant usage, select on sequence user_followed_zones_id_seq to anon, authenticated, service_role;
