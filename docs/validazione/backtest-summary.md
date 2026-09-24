# Backtest GBIF — riepilogo generato

Generato: 2026-09-24T07:47:50.375Z — seme 20260924, bootstrap 2000 replicati a grappoli (localita'-anno).

GBIF: 907 record scaricati, 490 accettati, 437 dopo deduplica (stesso giorno entro 1 km), 413 localita'-anno. Scarti: {"obscured":292,"uncertainty-large":63,"uncertainty-missing":62}.
Campione: 250 localita'-anno (strati: regione, allocazione uguale). Meteo disponibile per 15 (0 scaricate ora, 15 da cache, 0 fallite).
Righe: 61 = 16 casi + 45 controlli (0 giorni scartati per meteo mancante). Quota dei casi: mediana 780 m, 10°-90° percentile 322-1334 m.
Casi per regione: ignota 3, Sardegna 2, Campania 2, Lazio 2, Abruzzo 1, Sicilia 1, Marche 1, Friuli-Venezia Giulia 1, Emilia-Romagna 1, Trentino-Alto Adige 1, Toscana 1.
Brier di riferimento (sola prevalenza, LOYO): 0.194.

## AUC per variante

| Variante | Cambiamento | AUC [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] | Δ vs calendario a nucleo [IC 95%] | Brier (LOYO) | BSS |
|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | trigger.waterRelief = 0 | 0.838 [0.741, 0.926] | 0.008 [-0.032, 0.056] | 0.287 [0.124, 0.442] | 0.231 [0.097, 0.365] | 0.1898 | 0.021 |
| (b) 1.5 attuale | nessuna (ALGORITHM_V1, 1.5.0-porcino) | 0.829 [0.730, 0.907] | — | 0.279 [0.106, 0.447] | 0.222 [0.072, 0.363] | 0.1828 | 0.057 |
| (c) 1.5 + estate in quota | peso autunnale per quota al massimo 0.7 (quota stagionale <= 840 m) | 0.783 [0.686, 0.859] | -0.046 [-0.116, 0.009] | 0.233 [0.050, 0.409] | 0.176 [0.001, 0.345] | 0.1757 | 0.094 |
| (c2) 1.5 + entrambi i regimi a ogni quota | peso autunnale per quota fra 0.3 e 0.7 (quota stagionale 760-840 m) | 0.765 [0.637, 0.860] | -0.065 [-0.186, 0.034] | 0.215 [0.028, 0.355] | 0.158 [-0.026, 0.328] | 0.1741 | 0.102 |
| (d) 1.5 + caldo tollerato se c'e' acqua | sigmaWarmC 7.5 -> 12 solo nei giorni con fattore acqua 1.5 >= 0.5 | 0.831 [0.731, 0.908] | 0.001 [-0.011, 0.024] | 0.281 [0.107, 0.450] | 0.224 [0.072, 0.373] | 0.1819 | 0.062 |
| (d2) 1.5 + caldo tollerato sempre | sigmaWarmC 7.5 -> 12 in tutti i giorni (controllo della (d)) | 0.824 [0.724, 0.907] | -0.005 [-0.018, 0.013] | 0.274 [0.101, 0.443] | 0.217 [0.067, 0.365] | 0.1815 | 0.064 |
| (e) 1.5 + ottimo autunnale 15 °C | thermal.optAutumnC 13 -> 15 | 0.828 [0.729, 0.907] | -0.001 [-0.015, 0.021] | 0.278 [0.107, 0.447] | 0.222 [0.068, 0.372] | 0.1759 | 0.092 |
| (f) nullo: calendario mensile | frazione dei casi degli altri anni nello stesso mese | 0.550 [0.359, 0.747] | -0.279 [-0.447, -0.106] | — | -0.057 [-0.165, 0.052] | 0.2003 | -0.033 |
| (f2) nullo: calendario a nucleo | densita' dei giorni dell'anno dei casi degli altri anni, nucleo 10 giorni | 0.607 [0.425, 0.786] | -0.222 [-0.363, -0.072] | 0.057 [-0.052, 0.165] | — | 0.1950 | -0.006 |

## AUC appaiata (caso contro controlli della stessa localita'-anno)

| Variante | AUC appaiata [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] |
|---|---|---|---|
| (a) 1.4 equivalente | 0.854 [0.745, 0.956] | 0.042 [-0.039, 0.125] | 0.302 [0.122, 0.479] |
| (b) 1.5 attuale | 0.813 [0.667, 0.933] | — | 0.260 [0.056, 0.454] |
| (c) 1.5 + estate in quota | 0.750 [0.622, 0.867] | -0.063 [-0.133, 0.000] | 0.198 [0.000, 0.400] |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.667 [0.526, 0.822] | -0.146 [-0.292, 0.022] | 0.115 [-0.052, 0.260] |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.833 [0.687, 0.956] | 0.021 [0.000, 0.067] | 0.281 [0.078, 0.479] |
| (d2) 1.5 + caldo tollerato sempre | 0.833 [0.687, 0.956] | 0.021 [0.000, 0.067] | 0.281 [0.078, 0.479] |
| (e) 1.5 + ottimo autunnale 15 °C | 0.833 [0.687, 0.956] | 0.021 [0.000, 0.067] | 0.281 [0.078, 0.479] |
| (f) nullo: calendario mensile | 0.552 [0.353, 0.767] | -0.260 [-0.454, -0.056] | — |
| (f2) nullo: calendario a nucleo | 0.542 [0.333, 0.778] | -0.271 [-0.451, -0.089] | -0.010 [-0.125, 0.115] |

## AUC per fascia di quota e per mese

Numerosita' (casi/controlli): <600 m: 7 casi / 18 controlli; 600-1200 m: 7 casi / 21 controlli; >1200 m: 2 casi / 6 controlli. Mesi: 5: 3/0; 6: 1/11; 7: 1/11; 8: 1/9; 9: 4/4; 10: 4/4; 11: 2/6.

| Variante | <600 m | 600-1200 m | >1200 m | mese 5 | mese 6 | mese 7 | mese 8 | mese 9 | mese 10 | mese 11 |
|---|---|---|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 0.841 | 0.844 | 0.833 | — | 0.909 | 0.636 | 1.000 | 0.750 | 0.625 | 0.750 |
| (b) 1.5 attuale | 0.782 | 0.861 | 0.917 | — | 0.909 | 0.727 | 0.889 | 0.875 | 0.625 | 0.833 |
| (c) 1.5 + estate in quota | 0.782 | 0.830 | 0.833 | — | 0.727 | 0.818 | 0.889 | 0.875 | 0.625 | 0.833 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.643 | 0.840 | 0.833 | — | 0.636 | 0.818 | 1.000 | 0.938 | 0.563 | 0.333 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.778 | 0.878 | 0.917 | — | 0.909 | 0.727 | 0.889 | 0.875 | 0.625 | 0.833 |
| (d2) 1.5 + caldo tollerato sempre | 0.778 | 0.871 | 0.917 | — | 0.909 | 0.727 | 0.889 | 0.813 | 0.625 | 0.833 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.782 | 0.871 | 0.917 | — | 0.909 | 0.727 | 1.000 | 0.813 | 0.625 | 0.833 |
| (f) nullo: calendario mensile | 0.381 | 0.599 | 0.833 | — | — | — | — | — | — | — |
| (f2) nullo: calendario a nucleo | 0.444 | 0.646 | 0.833 | — | 0.182 | 0.000 | 0.000 | 0.438 | 0.000 | 0.417 |

## Sensibilita'

| Variante | casi giu-nov | solo incertezza nota | senza Trentino-Alto Adige |
|---|---|---|---|
| (a) 1.4 equivalente | 0.839 | 0.818 | 0.838 |
| (b) 1.5 attuale | 0.836 | 0.827 | 0.829 |
| (c) 1.5 + estate in quota | 0.797 | 0.804 | 0.789 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.809 | 0.808 | 0.772 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.839 | 0.833 | 0.830 |
| (d2) 1.5 + caldo tollerato sempre | 0.834 | 0.828 | 0.826 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.838 | 0.832 | 0.833 |
| (f) nullo: calendario mensile | 0.572 | 0.537 | 0.574 |
| (f2) nullo: calendario a nucleo | 0.607 | 0.562 | 0.590 |

## MPI nei giorni in cui i porcini sono stati trovati

| Variante | <20 | 20-40 | 40-60 | 60-80 | >=80 | mediana |
|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 12 (75%) | 2 (13%) | 1 (6%) | 0 (0%) | 1 (6%) | 11.5 |
| (b) 1.5 attuale | 11 (69%) | 2 (13%) | 0 (0%) | 1 (6%) | 2 (13%) | 14.8 |
| (c) 1.5 + estate in quota | 11 (69%) | 2 (13%) | 1 (6%) | 1 (6%) | 1 (6%) | 16.0 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 9 (56%) | 4 (25%) | 1 (6%) | 1 (6%) | 1 (6%) | 17.4 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 11 (69%) | 2 (13%) | 0 (0%) | 0 (0%) | 3 (19%) | 14.9 |
| (d2) 1.5 + caldo tollerato sempre | 10 (63%) | 3 (19%) | 0 (0%) | 0 (0%) | 3 (19%) | 14.9 |
| (e) 1.5 + ottimo autunnale 15 °C | 11 (69%) | 2 (13%) | 0 (0%) | 0 (0%) | 3 (19%) | 12.9 |

## Affidabilita' (decili, dopo calibrazione logistica LOYO)

**(b) 1.5 attuale**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 6 | 0.160 | 0.000 |
| 2 | 6 | 0.165 | 0.000 |
| 3 | 6 | 0.173 | 0.000 |
| 4 | 6 | 0.177 | 0.000 |
| 5 | 6 | 0.188 | 0.500 |
| 6 | 6 | 0.200 | 0.167 |
| 7 | 6 | 0.220 | 0.500 |
| 8 | 6 | 0.254 | 0.500 |
| 9 | 6 | 0.324 | 0.500 |
| 10 | 7 | 0.770 | 0.429 |

**(f) nullo: calendario mensile**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 6 | 0.191 | 0.667 |
| 2 | 6 | 0.237 | 0.000 |
| 3 | 6 | 0.249 | 0.167 |
| 4 | 6 | 0.253 | 0.167 |
| 5 | 6 | 0.259 | 0.000 |
| 6 | 6 | 0.260 | 0.167 |
| 7 | 6 | 0.265 | 0.167 |
| 8 | 6 | 0.274 | 0.333 |
| 9 | 6 | 0.283 | 1.000 |
| 10 | 7 | 0.352 | 0.000 |

## Casi con MPI 1.5 < 20: da che cosa dipende

11 casi. Media dei componenti della 1.5: acqua 0.62, termico 0.76, stagione 0.31. Fattore piu' basso: acqua 3, termico 0, stagione 8.
