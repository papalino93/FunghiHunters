# FungiCast Toscana

Web app mobile-first che calcola, per ogni zona della Toscana, un **Mushroom Potential Index (MPI)** 0–100.

> **L'MPI non indica mai la presenza di funghi.** Indica quanto le condizioni ambientali
> (pioggia, bilancio idrico, temperatura dell'aria e del suolo, evapotraspirazione, vento,
> quota, vegetazione, stagione) sono **compatibili** con una possibile fruttificazione fungina.

## Stato

App funzionante: motore MPI versionato, interpolazione spaziale validata, snapshot giornaliero
precalcolato, mappa, diario uscite con calibrazione, PWA offline, account e sincronizzazione fra
dispositivi (opzionale). Ambito v1: **solo porcino**, un unico indice, sulle sette zone di
taratura toscane.

- [`docs/DISCOVERY-AND-ARCHITECTURE.md`](docs/DISCOVERY-AND-ARCHITECTURE.md) — fonti, licenze,
  limiti verificati, schema DB, MPI v1, confidence, costi
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — le decisioni vincolanti per l'implementazione
- [`docs/AUDIT.md`](docs/AUDIT.md) — cosa è stato verificato, cosa manca, priorità aperte
- [`docs/SYNC.md`](docs/SYNC.md) — come funziona la sincronizzazione, cosa serve per attivarla
- [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md) — accesso con Google su Vercel: Supabase, Google
  Cloud, variabili d'ambiente, e cosa significa ogni errore

## Stack

Next.js 16 · TypeScript strict · App Router · Tailwind v4 · Supabase (Postgres, PostGIS, Auth) ·
deploy su Vercel.

## Sviluppo locale

```bash
npm install
npx tsx scripts/build-snapshot.ts   # genera public/data/snapshot.json, altrimenti la mappa è vuota
npm run dev
npm run check                       # typecheck + lint + test, prima di ogni commit
```

L'app funziona senza account. Per provare login e sincronizzazione serve un progetto Supabase —
vedi [`docs/SYNC.md`](docs/SYNC.md) per i passi e le variabili d'ambiente
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

## Sicurezza micologica

L'app non identifica funghi commestibili e non afferma mai che un fungo sia sicuro da mangiare.
Riguarda la probabilità ambientale di fruttificazione, non la determinazione delle specie raccolte.
