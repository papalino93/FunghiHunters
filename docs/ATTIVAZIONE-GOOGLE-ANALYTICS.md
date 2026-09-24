# Attivare Google Search Console e le statistiche

Il codice è già pronto. Mancano solo i passi che richiedono i tuoi account (Google e Vercel).
In tutto sono circa 10 minuti. Tutto è configurato in `src/lib/seo/services.ts`.

## 1. Google Search Console (circa 5 minuti)

1. Apri <https://search.google.com/search-console> con il tuo account Google e scegli
   **Aggiungi proprietà**.
2. Scegli **Prefisso URL** (non «Dominio»: su `vercel.app` il DNS non è nostro) e inserisci
   `https://funghihunters.vercel.app/`.
3. Come metodo di verifica scegli **Tag HTML**. Google mostra una riga come
   `<meta name="google-site-verification" content="AbC123…" />`: ci serve solo il valore di
   `content`.
4. Il codice va nel sito in uno di questi due modi:
   - **A. Lo scrivi in chat.** Lo inserisco io, pubblico, e in circa 2 minuti è online. Il codice
     non è un segreto: finisce comunque nell'HTML pubblico.
   - **B. Lo metti tu su Vercel.** Vai in Project → Settings → Environment Variables e crea
     `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` = il codice, per l'ambiente Production. Poi fai
     Deployments → ultimo deploy → **Redeploy**.
5. Quando il deploy è online, in Search Console premi **Verifica**.
6. Apri **Sitemap** e invia `sitemap.xml`. Contiene home, mappa, meteo, guida, metodo, `/italia`
   con le 20 regioni e `/regole` con le 21 schede.
7. Apri **Controllo URL** e chiedi l'indicizzazione delle pagine principali: `/`, `/italia`,
   `/regole`, `/mappa`, `/regole/toscana`, `/italia/toscana`. Google ne accetta una decina al
   giorno. Le altre arrivano dalla sitemap.

Facoltativo: **Bing Webmaster Tools** (<https://www.bing.com/webmasters>) può importare la
proprietà direttamente da Search Console, senza codice. Se preferisci il tag, la variabile è
`NEXT_PUBLIC_BING_SITE_VERIFICATION`.

Cosa aspettarsi: le prime pagine compaiono di solito in qualche giorno. I dati su ricerche e clic
arrivano in Search Console dopo 2 o 3 giorni.

## 2. Statistiche: Vercel Web Analytics e Speed Insights (circa 5 minuti)

Perché questi strumenti:
- non usano cookie e non salvano identificativi sul dispositivo, quindi non serve il banner dei
  cookie;
- contano le visite in forma aggregata;
- prima dell'invio tolgono dall'indirizzo tutti i parametri tranne `regione`, `zona` e `giorno`.
  Per esempio non arriva mai il luogo cercato nella pagina meteo.

1. Nel pannello Vercel, nel progetto del sito, apri la scheda **Analytics** e premi **Enable**.
2. Apri la scheda **Speed Insights** e premi **Enable**.
3. Accendi le statistiche nel sito in uno di questi due modi:
   - **A.** Lo dici a me in chat e lo attivo io.
   - **B.** Crei su Vercel la variabile `NEXT_PUBLIC_ANALYTICS` = `1` (Production) e fai
     **Redeploy**.
4. Apri il sito dal telefono e dopo circa un minuto guarda la scheda Analytics: la visita deve
   comparire.

Il piano gratuito ha un tetto mensile di eventi, lo trovi nella scheda Analytics.

Quando le statistiche sono accese, la guida (sezione «I tuoi dati e la riservatezza») lo dice da
sola: la riga compare in automatico con la stessa impostazione.

## Dopo, con un dominio proprio

Se un giorno il sito passa a un dominio tuo (per esempio `fungicast.it`):

1. In Vercel imposta `NEXT_PUBLIC_SITE_URL`: canonical, sitemap e anteprime lo seguono da soli.
2. In Search Console aggiungi la proprietà **Dominio** del nuovo indirizzo, che si verifica con un
   record DNS.
3. Sulla vecchia proprietà usa **Cambio di indirizzo**: così i risultati già ottenuti non si
   perdono.
