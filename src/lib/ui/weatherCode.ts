/**
 * Codice meteo WMO (`weather_code` di Open-Meteo) in una frase breve, in italiano.
 *
 * Tabella ufficiale WMO 4677, ridotta alle classi che contano per un cercatore: sereno/nuvoloso,
 * nebbia, pioggia (per intensità), temporale, neve. Non un elenco completo dei 27 codici: le
 * distinzioni fini (es. "pioggia gelata leggera" vs "moderata") non cambiano la decisione di
 * nessuno qui.
 */
const LABELS: ReadonlyArray<{ readonly codes: readonly number[]; readonly label: string }> = [
  { codes: [0], label: 'sereno' },
  { codes: [1, 2], label: 'poco nuvoloso' },
  { codes: [3], label: 'coperto' },
  { codes: [45, 48], label: 'nebbia' },
  { codes: [51, 53, 55], label: 'pioggerella' },
  { codes: [56, 57], label: 'pioggerella gelata' },
  { codes: [61, 80], label: 'pioggia debole' },
  { codes: [63, 81], label: 'pioggia' },
  { codes: [65, 82], label: 'pioggia forte' },
  { codes: [66, 67], label: 'pioggia gelata' },
  { codes: [71, 73, 75, 77, 85, 86], label: 'neve' },
  { codes: [95], label: 'temporale' },
  { codes: [96, 99], label: 'temporale con grandine' },
]

export function weatherCodeLabel(code: number | null): string | null {
  if (code === null) return null
  return LABELS.find((entry) => entry.codes.includes(code))?.label ?? null
}
