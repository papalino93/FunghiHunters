/**
 * Chi deve vedere il benvenuto della home, deciso **prima** che la pagina si disegni.
 *
 * Il benvenuto (`WelcomeHero`) prima compariva solo dopo l'idratazione, perché "l'ha già chiuso?"
 * vive nel `localStorage` e il server non lo può leggere. Per chi arrivava la prima volta voleva
 * dire una pagina che si disegnava, e un attimo dopo una scheda alta mezzo schermo che spingeva
 * giù tutto l'elenco: il salto di impaginazione (CLS 0,42) che si vede appena si apre l'app.
 *
 * Ora il server lo manda sempre nell'HTML, e questo script — in linea, in cima al `<body>`, quindi
 * eseguito prima che il resto della pagina venga letto — marca `<html>` quando il benvenuto non va
 * mostrato. Una regola CSS (`globals.css`) lo nasconde da subito: né chi è nuovo né chi l'ha già
 * chiuso vedono niente muoversi. Dopo l'idratazione il componente decide come prima e toglie il
 * nodo, ma a quel punto è già invisibile.
 *
 * Modulo senza `'use client'` apposta: il layout (componente server) deve leggere il valore di
 * queste costanti, non un riferimento a un modulo client.
 */

export const WELCOME_DISMISS_KEY = 'fungicast:welcome-dismissed'

/** Valore di `data-welcome` su `<html>` quando il benvenuto va nascosto. */
export const WELCOME_HIDDEN = 'nascosto'

/**
 * Nascosto quando è già stato chiuso, oppure quando c'è una sessione Supabase salvata.
 *
 * La seconda condizione è un'approssimazione sincrona di "ha fatto l'accesso": il componente
 * nasconde il benvenuto a chi è autenticato, ma lo stato vero dell'accesso arriva solo dopo una
 * risposta di rete, e aspettarlo riprodurrebbe lo stesso salto al contrario. La chiave del token
 * è `sb-<progetto>-auth-token` (il nome predefinito dell'SDK). Una sessione scaduta rimasta nello
 * storage nasconde il benvenuto a chi, comunque, non è alla prima visita.
 *
 * Ogni accesso allo storage sta in un `try`: con lo storage bloccato non si marca niente, e il
 * benvenuto si mostra — lo stesso che il componente fa in quel caso.
 */
export const WELCOME_BOOT_SCRIPT =
  `try{var s=localStorage,h=s.getItem(${JSON.stringify(WELCOME_DISMISS_KEY)})==='1';` +
  `for(var i=0;!h&&i<s.length;i++){var k=s.key(i);h=!!k&&/^sb-.+-auth-token$/.test(k)}` +
  `if(h)document.documentElement.setAttribute('data-welcome',${JSON.stringify(WELCOME_HIDDEN)})}catch(e){}`
