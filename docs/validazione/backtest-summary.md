# Backtest GBIF — riepilogo generato

Generato: 2026-09-24T08:55:28.888Z — seme 20260924, bootstrap 2000 replicati a grappoli (localita'-anno).

GBIF: 907 record scaricati, 490 accettati, 437 dopo deduplica (stesso giorno entro 1 km), 413 localita'-anno. Scarti: {"obscured":292,"uncertainty-large":63,"uncertainty-missing":62}.
Campione: 250 localita'-anno (strati: regione, allocazione uguale). Meteo disponibile per 231 (231 scaricate ora, 0 da cache, 19 fallite).
Righe: 938 = 245 casi + 693 controlli (0 giorni scartati per meteo mancante). Quota dei casi: mediana 965 m, 10°-90° percentile 266-1634 m.
Casi per regione: Trentino-Alto Adige 34, Toscana 33, Piemonte 30, Lombardia 29, Veneto 22, ignota 14, Emilia-Romagna 13, Sardegna 12, Lazio 11, Calabria 10, Liguria 8, Abruzzo 6, Sicilia 6, Valle d'Aosta 5, Campania 5, Friuli-Venezia Giulia 4, Molise 1, Basilicata 1, Marche 1.
Brier di riferimento (sola prevalenza, LOYO): 0.193.

## AUC per variante

| Variante | Cambiamento | AUC [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] | Δ vs calendario a nucleo [IC 95%] | Brier (LOYO) | BSS |
|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | trigger.waterRelief = 0 | 0.685 [0.649, 0.719] | -0.011 [-0.019, -0.003] | 0.038 [-0.014, 0.089] | 0.000 [-0.051, 0.052] | 0.1874 | 0.029 |
| (b) 1.5 attuale | nessuna (ALGORITHM_V1, 1.5.0-porcino) | 0.696 [0.658, 0.730] | — | 0.048 [-0.004, 0.099] | 0.011 [-0.041, 0.062] | 0.1847 | 0.043 |
| (c) 1.5 + estate in quota | peso autunnale per quota al massimo 0.7 (quota stagionale <= 840 m) | 0.685 [0.649, 0.719] | -0.011 [-0.023, 0.001] | 0.038 [-0.018, 0.093] | 0.000 [-0.053, 0.056] | 0.1838 | 0.048 |
| (c2) 1.5 + entrambi i regimi a ogni quota | peso autunnale per quota fra 0.3 e 0.7 (quota stagionale 760-840 m) | 0.714 [0.676, 0.748] | 0.018 [-0.005, 0.041] | 0.066 [0.012, 0.115] | 0.028 [-0.022, 0.076] | 0.1788 | 0.074 |
| (d) 1.5 + caldo tollerato se c'e' acqua | sigmaWarmC 7.5 -> 12 solo nei giorni con fattore acqua 1.5 >= 0.5 | 0.696 [0.658, 0.730] | -0.000 [-0.001, 0.001] | 0.048 [-0.004, 0.099] | 0.011 [-0.040, 0.062] | 0.1845 | 0.044 |
| (d2) 1.5 + caldo tollerato sempre | sigmaWarmC 7.5 -> 12 in tutti i giorni (controllo della (d)) | 0.696 [0.657, 0.730] | -0.000 [-0.002, 0.002] | 0.048 [-0.004, 0.098] | 0.010 [-0.040, 0.061] | 0.1845 | 0.044 |
| (e) 1.5 + ottimo autunnale 15 °C | thermal.optAutumnC 13 -> 15 | 0.715 [0.678, 0.750] | 0.019 [0.014, 0.024] | 0.067 [0.016, 0.118] | 0.030 [-0.021, 0.081] | 0.1825 | 0.054 |
| (f) nullo: calendario mensile | frazione dei casi degli altri anni nello stesso mese | 0.648 [0.600, 0.694] | -0.048 [-0.099, 0.004] | — | -0.038 [-0.055, -0.018] | 0.1812 | 0.061 |
| (f2) nullo: calendario a nucleo | densita' dei giorni dell'anno dei casi degli altri anni, nucleo 10 giorni | 0.685 [0.638, 0.731] | -0.011 [-0.062, 0.041] | 0.038 [0.018, 0.055] | — | 0.1775 | 0.080 |

## AUC appaiata (caso contro controlli della stessa localita'-anno)

| Variante | AUC appaiata [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] |
|---|---|---|---|
| (a) 1.4 equivalente | 0.718 [0.669, 0.760] | 0.001 [-0.010, 0.012] | 0.041 [-0.013, 0.097] |
| (b) 1.5 attuale | 0.717 [0.669, 0.760] | — | 0.040 [-0.015, 0.095] |
| (c) 1.5 + estate in quota | 0.717 [0.671, 0.759] | 0.000 [-0.021, 0.021] | 0.040 [-0.018, 0.097] |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.728 [0.682, 0.771] | 0.011 [-0.020, 0.042] | 0.051 [-0.009, 0.109] |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.720 [0.671, 0.762] | 0.003 [-0.001, 0.008] | 0.043 [-0.013, 0.097] |
| (d2) 1.5 + caldo tollerato sempre | 0.721 [0.674, 0.763] | 0.004 [-0.003, 0.011] | 0.044 [-0.010, 0.097] |
| (e) 1.5 + ottimo autunnale 15 °C | 0.742 [0.698, 0.783] | 0.025 [0.012, 0.039] | 0.065 [0.010, 0.120] |
| (f) nullo: calendario mensile | 0.677 [0.626, 0.724] | -0.040 [-0.095, 0.015] | — |
| (f2) nullo: calendario a nucleo | 0.697 [0.649, 0.743] | -0.020 [-0.076, 0.036] | 0.020 [-0.005, 0.044] |

## AUC per fascia di quota e per mese

Numerosita' (casi/controlli): <600 m: 81 casi / 219 controlli; 600-1200 m: 78 casi / 222 controlli; >1200 m: 86 casi / 252 controlli. Mesi: 5: 7/0; 6: 15/134; 7: 27/134; 8: 46/98; 9: 73/94; 10: 64/102; 11: 13/131.

| Variante | <600 m | 600-1200 m | >1200 m | mese 5 | mese 6 | mese 7 | mese 8 | mese 9 | mese 10 | mese 11 |
|---|---|---|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 0.722 | 0.701 | 0.684 | — | 0.636 | 0.722 | 0.838 | 0.519 | 0.477 | 0.652 |
| (b) 1.5 attuale | 0.724 | 0.710 | 0.695 | — | 0.650 | 0.716 | 0.827 | 0.537 | 0.510 | 0.667 |
| (c) 1.5 + estate in quota | 0.724 | 0.700 | 0.691 | — | 0.644 | 0.727 | 0.826 | 0.545 | 0.525 | 0.682 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.756 | 0.722 | 0.691 | — | 0.621 | 0.738 | 0.842 | 0.542 | 0.638 | 0.726 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.723 | 0.712 | 0.696 | — | 0.649 | 0.716 | 0.825 | 0.535 | 0.510 | 0.667 |
| (d2) 1.5 + caldo tollerato sempre | 0.717 | 0.716 | 0.696 | — | 0.650 | 0.713 | 0.824 | 0.534 | 0.510 | 0.667 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.724 | 0.728 | 0.731 | — | 0.667 | 0.716 | 0.825 | 0.548 | 0.545 | 0.723 |
| (f) nullo: calendario mensile | 0.639 | 0.670 | 0.647 | — | — | — | — | — | — | — |
| (f2) nullo: calendario a nucleo | 0.664 | 0.732 | 0.669 | — | 0.374 | 0.561 | 0.264 | 0.425 | 0.655 | 0.725 |

## Sensibilita'

| Variante | casi giu-nov | solo incertezza nota | senza Trentino-Alto Adige |
|---|---|---|---|
| (a) 1.4 equivalente | 0.688 | 0.687 | 0.685 |
| (b) 1.5 attuale | 0.699 | 0.700 | 0.696 |
| (c) 1.5 + estate in quota | 0.689 | 0.690 | 0.685 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.721 | 0.717 | 0.715 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.699 | 0.700 | 0.696 |
| (d2) 1.5 + caldo tollerato sempre | 0.699 | 0.701 | 0.695 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.718 | 0.719 | 0.713 |
| (f) nullo: calendario mensile | 0.667 | 0.646 | 0.656 |
| (f2) nullo: calendario a nucleo | 0.704 | 0.682 | 0.696 |

## MPI nei giorni in cui i porcini sono stati trovati

| Variante | <20 | 20-40 | 40-60 | 60-80 | >=80 | mediana |
|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 140 (57%) | 44 (18%) | 19 (8%) | 11 (4%) | 31 (13%) | 14.3 |
| (b) 1.5 attuale | 130 (53%) | 48 (20%) | 12 (5%) | 17 (7%) | 38 (16%) | 17.1 |
| (c) 1.5 + estate in quota | 124 (51%) | 59 (24%) | 21 (9%) | 27 (11%) | 14 (6%) | 19.7 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 94 (38%) | 89 (36%) | 26 (11%) | 27 (11%) | 9 (4%) | 25.0 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 130 (53%) | 47 (19%) | 13 (5%) | 16 (7%) | 39 (16%) | 17.6 |
| (d2) 1.5 + caldo tollerato sempre | 129 (53%) | 48 (20%) | 13 (5%) | 16 (7%) | 39 (16%) | 17.6 |
| (e) 1.5 + ottimo autunnale 15 °C | 134 (55%) | 44 (18%) | 16 (7%) | 15 (6%) | 36 (15%) | 17.1 |

## Affidabilita' (decili, dopo calibrazione logistica LOYO)

**(b) 1.5 attuale**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 93 | 0.193 | 0.065 |
| 2 | 94 | 0.197 | 0.074 |
| 3 | 94 | 0.202 | 0.160 |
| 4 | 94 | 0.206 | 0.202 |
| 5 | 94 | 0.211 | 0.234 |
| 6 | 93 | 0.219 | 0.312 |
| 7 | 94 | 0.239 | 0.351 |
| 8 | 94 | 0.271 | 0.404 |
| 9 | 94 | 0.355 | 0.351 |
| 10 | 94 | 0.524 | 0.457 |

**(f) nullo: calendario mensile**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 93 | 0.126 | 0.226 |
| 2 | 94 | 0.143 | 0.085 |
| 3 | 94 | 0.148 | 0.064 |
| 4 | 94 | 0.173 | 0.181 |
| 5 | 94 | 0.200 | 0.160 |
| 6 | 93 | 0.268 | 0.366 |
| 7 | 94 | 0.327 | 0.383 |
| 8 | 94 | 0.373 | 0.457 |
| 9 | 94 | 0.408 | 0.362 |
| 10 | 94 | 0.446 | 0.330 |

## Casi con MPI 1.5 < 20: da che cosa dipende

130 casi. Media dei componenti della 1.5: acqua 0.62, termico 0.74, stagione 0.25. Fattore piu' basso: acqua 38, termico 1, stagione 91.
