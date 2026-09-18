# Sincronizzazione e account

Stato: implementata per il **diario uscite**. Non ancora collegata per aree salvate/preferenze
(le colonne di sincronizzazione esistono già su `user_locations`, la UI no — vedi "Cosa manca").

## Architettura

Il diario resta **local-first**: vive in IndexedDB su ogni dispositivo (`src/lib/diary/store.ts`)
e funziona identico con o senza account. L'account aggiunge solo una seconda copia su Supabase e
un motore che le tiene allineate (`src/lib/sync/engine.ts`).

```
IndexedDB (per dispositivo) ←→ runSync() ←→ Supabase (per utente, RLS)
```

- **Login**: Google OAuth o magic link via email, entrambi Supabase Auth
  (`src/lib/auth/`). Nessun account è richiesto per consultare l'app: solo per salvare oltre il
  dispositivo corrente. Un ritorno fallito dal redirect non resta muto: `readAuthCallbackError()`
  in `src/lib/auth/callback.ts` lo legge dall'URL e lo mostra a schermo, perché quegli errori
  vengono quasi sempre da una configurazione incompleta del deploy — vedi
  [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md).
- **Trigger di sincronizzazione**: al login, dopo ogni modifica al diario (se già collegato), e
  al ritorno della rete (`online`). Non c'è polling: non serve, il diario cambia raramente.
- **Stati mostrati in UI**: `local` (nessun account, o non ancora sincronizzato), `syncing`,
  `synced`, `error` con messaggio.

## Strategia sui conflitti

**Last-write-wins su `updatedAt`, con pull sempre prima del push.** Motivazione completa nel
commento in testa a `src/lib/sync/engine.ts`; qui il riassunto:

1. È una regola che l'utente può prevedere ("vince la modifica che ho fatto per ultima").
2. È sufficiente per un diario personale a singolo proprietario, modificato da un dispositivo alla
   volta — non serve un merge campo per campo, che avrebbe senso solo per editing condiviso.
3. Il pull viene prima del push apposta: un dispositivo rimasto offline a lungo, con una modifica
   ormai vecchia, deve scoprire che il server ha una versione più recente *prima* di sovrascriverla.
   Se il locale perde il confronto, non viene inviato.
4. Nessuna modifica sparisce in silenzio: o vince il locale (viene inviato) o vince il remoto
   (viene applicato in locale). Non esiste un terzo caso.

Testato in `tests/sync.test.ts`: conflitto vinto dal locale, conflitto vinto dal remoto, il caso
esplicito del dispositivo tornato online tardi, propagazione dei tombstone in entrambe le
direzioni, comportamento su un push o un pull falliti a metà.

## Dispositivo condiviso: mai sincronizzare in automatico l'account sbagliato

Bug reale, trovato in una revisione approfondita e corretto nella stessa sessione: il logout non
cancella il diario locale (di proposito — sono dati dell'utente, non vanno persi solo perché si
esce dall'account). Ma `sync()` partiva in automatico a ogni login, quindi su un dispositivo
condiviso — due persone in sequenza, la prima non ha esportato/cancellato prima di uscire — il
diario della prima, comprese eventuali coordinate esatte, finiva spedito nell'account della
seconda.

Corretto: ogni dispositivo ricorda con quale account ha sincronizzato l'ultima volta
(`localStorage`, non nel diario). Se l'account ora collegato è diverso, `sync()` non parte da
sola — l'utente vede un avviso esplicito in Account e in Diario, e deve confermare "Sincronizza
comunque" prima che qualunque dato locale venga inviato. Vedi `isAccountMismatch()` in
`src/lib/sync/useDiarySync.ts`, testata in `tests/account-mismatch.test.ts`.

## Cancellazioni (tombstone)

`DiaryEntry.deletedAt` sostituisce la cancellazione fisica immediata. `remove()` marca la riga,
`list()` la nasconde, `listAll()` la mostra al motore di sync. Solo dopo che una cancellazione è
stata confermata sincronizzata (push riuscito, o pull di un tombstone remoto) la riga viene tolta
fisicamente con `purge()`. Senza questo, un secondo dispositivo rimasto offline al momento della
cancellazione la resusciterebbe alla sincronizzazione successiva.

## Privacy

- Le coordinate **esatte** di una voce di diario arrivano al server (colonna `geom_exact`) solo se
  l'utente ha scelto esplicitamente il livello di riservatezza "coordinate esatte" per quella voce
  (`PrivacyLevel = 'exact'`, default `'area'`, cioè sfocate a ~1 km prima ancora di essere
  salvate — vedi `applyPrivacy` in `src/lib/diary/types.ts`). Con qualunque altra scelta, solo le
  coordinate già sfocate arrivano al server (`geom_public`), e la sfocatura non è recuperabile.
- **Row Level Security**: ogni tabella utente (`user_observations`, `user_locations`, `alerts`) ha
  una policy `using (user_id = auth.uid())` — vedi `db/migrations/0001_init.sql`. La chiave usata
  dal browser (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) è vincolata da queste policy; non c'è modo, da
  client, di leggere i dati di un altro utente.
- **Service role key**: usata da un solo file, `src/app/api/account/delete/route.ts`, mai
  importata da codice che gira nel browser. Verifica il token dell'utente prima di cancellare
  qualunque cosa.
- Il diario non ha, e non avrà in questa forma, nessuna funzione di condivisione pubblica: la
  colonna `privacy_level` ereditata dallo schema iniziale (visibilità `private/municipality/
  zone/public`) resta al suo default `'private'` e non viene ancora esposta in UI.
- **"Modello collettivo": non esiste, e per questo non c'è un interruttore per attivarlo.** La
  richiesta di un opt-in separato e revocabile per usare i diari nella calibrazione collettiva
  presuppone che esista una pipeline che aggrega i diari fra utenti — non esiste. Costruire un
  interruttore "contribuisci al modello collettivo" che oggi non farebbe nulla sarebbe la stessa
  falsa precisione che questo progetto vuole evitare altrove, solo spostata sul consenso invece
  che sui dati. Oggi, con RLS attiva, **ogni diario resta leggibile solo dal proprietario, punto**
  — non esiste nessun percorso, nemmeno interno, che legga i dati di più utenti insieme. Quando
  (e se) nascerà una vera calibrazione collettiva, dovrà nascere già con un opt-in esplicito e
  separato dal giorno zero, non aggiunta dopo: è un vincolo di progetto da rispettare al momento
  di costruirla, non un lavoro rimandabile a oggi.

## Cosa serve per attivarla davvero

Il codice è pronto, ma **richiede un progetto Supabase e credenziali Google che nessun agente può
creare** (sono account di terze parti). La procedura completa, passo per passo e con l'elenco
degli errori che si vedono quando qualcosa non torna, sta in
[`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md). In sintesi:

1. Creare un progetto su [supabase.com](https://supabase.com) (tier gratuito) ed eseguire in
   ordine `db/migrations/0001_init.sql` e `db/migrations/0002_sync.sql` nell'SQL Editor.
2. Creare un client OAuth su Google Cloud, con l'unico redirect URI
   `https://<ref>.supabase.co/auth/v1/callback`, e incollare Client ID e Secret in
   **Authentication → Sign In / Providers → Google** su Supabase.
3. In **Authentication → URL Configuration**, impostare il Site URL di produzione e aggiungere
   fra i Redirect URLs `https://<la-tua-app>/account`, `http://localhost:3000/account` e, se si
   usano le anteprime di Vercel, il loro dominio con i caratteri jolly.
4. Impostare le variabili d'ambiente (in `.env.local` per lo sviluppo, nelle env var del deploy
   per la produzione):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — **solo lato server**, mai con prefisso `NEXT_PUBLIC_`, mai nel
     repository.

Le variabili `NEXT_PUBLIC_` vengono sostituite nel codice durante `next build`: aggiungerle a un
deploy già fatto non basta, serve un nuovo deploy.

Finché queste variabili non ci sono, `isSupabaseConfigured()` torna `false` e l'app mostra
"sincronizzazione non disponibile" invece di rompersi — vedi `src/lib/supabase/client.ts`.

### Verifica manuale dopo il collegamento

Non esiste, in questa consegna, un test automatico contro un progetto Supabase vero (servirebbe
crearne uno solo per la CI, con relativa manutenzione). Prima di fidarsi in produzione:

1. Accedi con Google su un dispositivo, registra un'uscita, controlla che la riga compaia nella
   tabella `user_observations` con `user_id` corretto.
2. Accedi con lo stesso account su un secondo browser (o una finestra anonima): l'uscita deve
   comparire dopo qualche secondo.
3. Disattiva la rete (DevTools → offline), modifica una voce, riattiva la rete: verifica che lo
   stato passi `syncing` → `synced` e che la modifica sia sul server.
4. Cancella una voce su un dispositivo, verifica che sparisca sull'altro dopo la sincronizzazione.
5. Da **Account**, prova "Cancella account": verifica che le righe spariscano dalle tre tabelle
   utente e che l'utente non compaia più in Authentication → Users.

## Cosa manca

- **Aree salvate e piani** (`user_locations`) hanno le colonne di sync pronte ma nessuna UI di
  salvataggio: oggi l'app non permette di salvare un'area o un piano da nessuna parte, quindi non
  c'era niente da sincronizzare. Prossimo passo naturale una volta che quella funzione esiste.
- **Apple Sign In**: rimandato come da `docs/DECISIONS.md` (D7), serve solo per un'eventuale
  distribuzione iOS/App Store.
- **Merge a grana fine**: non implementato per scelta (vedi sopra), non per limite tecnico. Se in
  futuro il diario diventasse condiviso fra più persone, andrebbe rivalutato.
