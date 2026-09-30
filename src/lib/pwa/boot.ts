/**
 * Cattura l'invito all'installazione di Chrome **prima** che React parta.
 *
 * `beforeinstallprompt` arriva una volta sola, e spesso subito dopo il caricamento: prima che i
 * componenti si idratino e mettano in ascolto il loro gestore. Perso quello, su Android il
 * pulsante «Installa» non compariva e restavano solo le istruzioni a parole. Questo script è in
 * linea, in cima al `<body>`, e lascia l'evento in `window.__fcInstallEvent`, da dove lo legge
 * `install-store.ts`.
 *
 * `preventDefault` toglie la barra automatica di Chrome: l'invito lo facciamo noi, con parole
 * nostre, e sentirlo due volte sarebbe insistere.
 *
 * Modulo senza `'use client'` apposta: il layout (componente server) deve leggere la stringa.
 */

export const INSTALL_EVENT_GLOBAL = '__fcInstallEvent'
export const INSTALLED_GLOBAL = '__fcInstalled'
/** Nome dell'evento con cui lo script avvisa i componenti già montati. */
export const INSTALL_CHANGE_EVENT = 'fungicast:install-change'

export const INSTALL_BOOT_SCRIPT =
  `try{var w=window;w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();` +
  `w[${JSON.stringify(INSTALL_EVENT_GLOBAL)}]=e;w.dispatchEvent(new Event(${JSON.stringify(INSTALL_CHANGE_EVENT)}))});` +
  `w.addEventListener('appinstalled',function(){w[${JSON.stringify(INSTALL_EVENT_GLOBAL)}]=null;` +
  `w[${JSON.stringify(INSTALLED_GLOBAL)}]=true;w.dispatchEvent(new Event(${JSON.stringify(INSTALL_CHANGE_EVENT)}))})}catch(e){}`
