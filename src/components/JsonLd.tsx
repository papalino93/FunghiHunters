/**
 * Dati strutturati (schema.org) per i motori di ricerca, in un `<script type="application/ld+json">`.
 *
 * `<` viene scritto come `<`: il JSON finisce dentro HTML, e un testo con `</script>` chiuderebbe
 * lo script a metà. Il contenuto è sempre costruito dal codice, mai da input dell'utente.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
