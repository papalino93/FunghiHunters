# Accesso con Google su Vercel — procedura completa

Questo documento porta il login con Google da "il codice c'è" a "funziona sul sito pubblicato".
Le parti che restano da fare a mano sono tutte fuori dal repository: un progetto Supabase, un
client OAuth su Google Cloud, tre variabili d'ambiente su Vercel. Nessun agente può crearle al
posto vostro — sono account di terze parti — ma da qui in avanti non c'è niente da inventare:
sono sei passi in ordine, e l'ultimo dice come accorgersi che ha funzionato.

Cosa succede nell'app, in una riga: si preme **Continua con Google** in `/account`, l'app manda a
Supabase l'indirizzo su cui vuole tornare (`https://<dominio-dell-app>/account`), Supabase manda a
Google, Google torna a Supabase, Supabase torna all'app con la sessione nel frammento dell'URL.
Ogni passo di questa catena ha un elenco di indirizzi autorizzati, ed è lì che si rompe quasi
sempre.

---

## 1. Progetto Supabase

1. Creare un progetto su [supabase.com](https://supabase.com) (il piano gratuito basta).
2. Nell'**SQL Editor**, eseguire in ordine `db/migrations/0001_init.sql` e
   `db/migrations/0002_sync.sql`.
3. Da **Project Settings → API** annotare:
   - **Project URL** → sarà `NEXT_PUBLIC_SUPABASE_URL`
   - chiave **anon / public** → sarà `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - chiave **service_role** → sarà `SUPABASE_SERVICE_ROLE_KEY` (**segreta**, vedi passo 5)

L'URL del progetto ha la forma `https://<ref>.supabase.co`: quel `<ref>` torna nel passo dopo.

## 2. Client OAuth su Google Cloud

Su [console.cloud.google.com](https://console.cloud.google.com), progetto nuovo o esistente. La
sezione si chiama oggi **Google Auth Platform** (in passato *APIs & Services → OAuth consent
screen*); i nomi delle voci cambiano ogni tanto, la sostanza no.

1. **Schermata di consenso**: tipo *External*, nome dell'app, email di supporto, email dello
   sviluppatore. Gli ambiti richiesti da Supabase sono `openid`, `email`, `profile`: non sono
   ambiti sensibili, quindi **non serve la verifica di Google** e non serve allegare niente.
2. **Stato di pubblicazione**: finché l'app resta *In testing*, possono accedere **solo gli
   indirizzi elencati come utenti di test** — chiunque altro riceve un rifiuto da Google, prima
   ancora di tornare all'app. O si aggiungono gli indirizzi fra i test users, o si preme
   **Pubblica app**. È la causa più comune di "a me funziona, a lui no".
3. **Client** (ex *Credentials*) → **Crea client OAuth** → tipo **Applicazione web**.
4. In **URI di reindirizzamento autorizzati** incollare **solo** l'indirizzo di Supabase:

   ```
   https://<ref>.supabase.co/auth/v1/callback
   ```

   Non il dominio dell'app: Google non torna mai direttamente all'app. Lo stesso indirizzo è
   scritto nella pagina del provider Google su Supabase (passo 3), da dove conviene copiarlo.
   *Origini JavaScript autorizzate* non serve: l'accesso avviene per redirect, non da JavaScript.
5. Annotare **Client ID** e **Client Secret**.

## 3. Abilitare Google su Supabase

**Authentication → Sign In / Providers → Google**: abilitare, incollare Client ID e Client Secret,
salvare. Finché questo interruttore è spento, ogni tentativo torna indietro con
`validation_failed` o `provider_disabled` e l'app lo scrive a schermo.

## 4. Indirizzi autorizzati su Supabase

**Authentication → URL Configuration**. Due campi, due ruoli diversi:

- **Site URL**: l'indirizzo di produzione — per questo progetto
  `https://funghihunters.vercel.app`. È anche il ripiego: quando un ritorno non è autorizzato,
  Supabase manda **lì** invece che dove chiedeva l'app. Se dopo il login ci si ritrova sulla home
  invece che su `/account`, il colpevole è l'elenco qui sotto, non il codice.
- **Redirect URLs**: l'elenco degli indirizzi su cui Supabase accetta di tornare. Servono almeno:

  ```
  https://funghihunters.vercel.app/account
  http://localhost:3000/account
  ```

  Per le **anteprime di Vercel** (ogni ramo e ogni pull request ha un dominio diverso) serve una
  riga con i caratteri jolly, presa dal dominio reale di un'anteprima:

  ```
  https://funghihunters-*-<slug-del-team>.vercel.app/**
  ```

  Da evitare `https://*.vercel.app/**`: autorizzerebbe il ritorno della sessione su qualunque
  sito ospitato su `vercel.app`, compresi quelli di altri.

L'app chiede sempre di tornare sull'**origine da cui si è partiti**, più `/account`
(`src/lib/auth/context.tsx`): se si accede da un dominio personalizzato, va aggiunto anche quello.

## 5. Variabili d'ambiente su Vercel

**Project → Settings → Environment Variables**, tre voci:

| Variabile | Ambienti | Note |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | chiave pubblica, protetta da RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | **segreta**, mai con prefisso `NEXT_PUBLIC_` |

La service role key scavalca la Row Level Security: la usa solo `src/app/api/account/delete/route.ts`,
che gira lato server. Se le si desse il prefisso `NEXT_PUBLIC_` finirebbe nel bundle del browser e
chiunque potrebbe leggere e cancellare i dati di chiunque.

**Dopo averle aggiunte serve un nuovo deploy.** Le variabili `NEXT_PUBLIC_` non vengono lette dal
browser a runtime: Next.js le sostituisce nel codice durante `next build`, quindi un deploy fatto
prima che esistessero resta cieco per sempre. Verificato in questa sessione con una build di
prova: i valori compaiono letteralmente dentro `.next/static/chunks/*.js`. Su Vercel:
**Deployments → … → Redeploy**, meglio senza cache di build.

Per lo sviluppo locale le stesse tre variabili vanno in `.env.local` — vedi `.env.local.example`.

## 6. Verificare che funzioni

1. Aprire [`/account`](https://funghihunters.vercel.app/account) sul sito pubblicato. Se dice
   *"la sincronizzazione non è configurata su questo deploy"*, le variabili non sono arrivate al
   build: rifare il passo 5. È il controllo più veloce, e non richiede di provare l'accesso.

   Lo stesso controllo si può fare da fuori, senza aprire il browser: nel JavaScript pubblicato
   devono comparire i **valori** delle variabili, non i loro nomi. Se in un chunk si legge ancora
   `env.NEXT_PUBLIC_SUPABASE_URL` invece di `https://<ref>.supabase.co`, quel deploy è stato
   costruito senza le variabili.

   ```bash
   curl -s https://funghihunters.vercel.app/account \
     | grep -o 'static/immutable/chunks/[A-Za-z0-9._-]*\.js' | sort -u \
     | while read c; do curl -s "https://funghihunters.vercel.app/_next/$c"; done \
     | grep -o 'https://[a-z0-9]*\.supabase\.co' | sort -u
   ```
2. Premere **Continua con Google** e completare l'accesso. Si deve tornare su `/account` con
   l'indirizzo email in alto.
3. Registrare un'uscita nel Diario e controllare su Supabase (**Table Editor → user_observations**)
   che la riga ci sia, con il `user_id` giusto.
4. Accedere con lo stesso account da un secondo browser: l'uscita deve comparire.
5. La checklist completa della sincronizzazione (offline, cancellazioni, cancellazione account) è
   in [`SYNC.md`](SYNC.md).

Se qualcosa va storto, **l'app lo scrive**: un ritorno fallito mostra una striscia rossa con il
messaggio, il codice d'errore e l'URL di ritorno che ha usato. Non c'è bisogno di aprire la
console del browser.

---

## Quando non funziona: errore per errore

Gli errori che Google mostra **sulla propria pagina**, senza tornare all'app:

| Cosa si vede | Causa | Rimedio |
| --- | --- | --- |
| `Error 400: redirect_uri_mismatch` | l'URI di reindirizzamento del client OAuth non è quello di Supabase | passo 2.4: dev'essere `https://<ref>.supabase.co/auth/v1/callback`, esatto, senza barra finale |
| *Accesso bloccato: l'app non ha completato la verifica* / *non sei un tester* | app ancora *In testing* | passo 2.2: aggiungere l'utente fra i test o pubblicare l'app |
| `Error 401: invalid_client` | Client ID inesistente o di un altro progetto | passo 3: ricontrollare quello incollato su Supabase |

Gli errori che tornano **dentro l'app**, come striscia rossa (i codici vengono da Supabase e sono
tradotti in `src/lib/auth/callback.ts`):

| Codice | Cosa significa | Rimedio |
| --- | --- | --- |
| `validation_failed`, `provider_disabled` | il provider Google non è abilitato sul progetto | passo 3 |
| `unexpected_failure`, `server_error` | Google ha risposto ma Supabase non ha chiuso lo scambio | passo 3: Client Secret sbagliato, scaduto o di un altro client |
| `bad_oauth_callback` | il ritorno è arrivato senza i parametri attesi | passo 2.4 |
| `access_denied` | l'autorizzazione non è stata concessa su Google | nessuno: è una scelta di chi accede |
| `otp_expired` | link via email scaduto o già usato | chiederne un altro; ogni link vale una volta |
| `bad_oauth_state`, `flow_state_not_found` | accesso iniziato su un browser e concluso su un altro | ripetere l'accesso su un solo browser |
| `over_email_send_rate_limit` | troppe email di accesso di fila | il servizio email integrato di Supabase è pensato solo per le prove e consente pochi invii l'ora: per l'uso vero va configurato un SMTP proprio (**Authentication → Emails**) |

E i due casi che **non** danno errore, ma non sono quello che ci si aspetta:

- **Dopo il login ci si ritrova sulla home, non su `/account`, ma si è dentro.** Il ritorno
  richiesto non era fra i Redirect URLs e Supabase ha usato il Site URL. Passo 4 — succede
  tipicamente dalle anteprime.
- **Nessun errore, nessun accesso, e `/account` dice che la sincronizzazione non è configurata.**
  Le variabili non c'erano al momento del build. Passo 5, poi redeploy.

## Cosa resta fuori

- **Apple Sign In**: rimandato (`docs/DECISIONS.md`, D7), serve solo per un'eventuale
  distribuzione su App Store.
- **Un test end-to-end del login vero**: richiederebbe un progetto Supabase dedicato alla CI e un
  account Google di prova. Oggi i test coprono la macchina a stati
  (`tests/auth.test.ts`) e la lettura del ritorno dal redirect (`tests/auth-callback.test.ts`),
  non il giro completo attraverso Google.
