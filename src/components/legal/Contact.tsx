import { CONTACT_EMAIL } from '@/lib/site/owner'

/** Il contatto del progetto, o la dichiarazione che non c'è ancora. */
export function Contact() {
  if (CONTACT_EMAIL === '') {
    return <span>l&apos;indirizzo di contatto del progetto, che verrà pubblicato qui a breve</span>
  }
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  )
}
