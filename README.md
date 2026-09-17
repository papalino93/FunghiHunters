# FungiCast Toscana

Web app mobile-first che calcola, per ogni zona della Toscana, un **Mushroom Potential Index (MPI)** 0–100.

> **L'MPI non indica mai la presenza di funghi.** Indica quanto le condizioni ambientali
> (pioggia, bilancio idrico, temperatura dell'aria e del suolo, evapotraspirazione, vento,
> quota, vegetazione, stagione) sono **compatibili** con una possibile fruttificazione fungina.

## Stato

**Fase 1 completata.** Discovery, verifica delle fonti e architettura approvate; le otto
decisioni aperte sono chiuse. Nessun codice applicativo ancora scritto.

- [`docs/DISCOVERY-AND-ARCHITECTURE.md`](docs/DISCOVERY-AND-ARCHITECTURE.md) — fonti, licenze,
  limiti verificati, schema DB, MPI v1, confidence, costi
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — le decisioni vincolanti per l'implementazione

Ambito della v1: **solo porcino**, un unico indice, sulle sette zone di taratura.

## Stack

Next.js 16 · TypeScript strict · App Router · Tailwind v4 · deploy su Vercel.

## Sicurezza micologica

L'app non identifica funghi commestibili e non afferma mai che un fungo sia sicuro da mangiare.
Riguarda la probabilità ambientale di fruttificazione, non la determinazione delle specie raccolte.
