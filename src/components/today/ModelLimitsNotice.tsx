/**
 * Il limite del modello, sempre visibile — non richiudibile come il benvenuto.
 *
 * Prima compariva solo nell'intestazione della mappa e, una volta sola, nel benvenuto della home
 * (`WelcomeHero`, che si chiude e non si ripresenta più). Chi ha già chiuso il benvenuto non
 * rivedeva più, in home, la frase più importante del progetto — un buco reale nella "fiducia
 * visibile" che questa funzione doveva garantire.
 */
export function ModelLimitsNotice() {
  return (
    <p className="text-xs leading-snug text-ink-faint">
      L&apos;indice descrive condizioni ambientali compatibili con la fruttificazione, non la
      presenza reale di funghi: non indica quantità, commestibilità né sicurezza della raccolta.
    </p>
  )
}
