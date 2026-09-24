# Backtest GBIF — riepilogo generato

Generato: 2026-09-24T11:20:14.400Z — seme 20260924, bootstrap 2000 replicati a grappoli (localita'-anno).

GBIF: 907 record scaricati, 490 accettati, 437 dopo deduplica (stesso giorno entro 1 km), 413 localita'-anno. Scarti: {"obscured":292,"uncertainty-large":63,"uncertainty-missing":62}.
Campione: 250 localita'-anno (strati: regione, allocazione uguale). Meteo disponibile per 250 (1 scaricate ora, 249 da cache, 0 fallite).
Righe: 1014 = 264 casi + 750 controlli (0 giorni scartati per meteo mancante). Quota dei casi: mediana 949 m, 10°-90° percentile 265-1626 m.
Casi per regione: Trentino-Alto Adige 35, Toscana 35, Piemonte 34, Lombardia 33, Veneto 23, ignota 15, Emilia-Romagna 14, Sardegna 12, Lazio 12, Calabria 11, Liguria 8, Valle d'Aosta 6, Abruzzo 6, Sicilia 6, Campania 5, Friuli-Venezia Giulia 4, Marche 2, Molise 1, Basilicata 1, Umbria 1.
Brier di riferimento (sola prevalenza, LOYO): 0.193.

## AUC per variante

| Variante | Cambiamento | AUC [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] | Δ vs calendario a nucleo [IC 95%] | Brier (LOYO) | BSS |
|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | trigger.waterRelief = 0 | 0.687 [0.654, 0.718] | -0.011 [-0.018, -0.004] | 0.040 [-0.007, 0.086] | -0.002 [-0.048, 0.045] | 0.1869 | 0.029 |
| (b) 1.5 attuale | la 1.5.0 congelata (CONFIG_V15) | 0.697 [0.663, 0.730] | — | 0.051 [0.003, 0.098] | 0.009 [-0.038, 0.056] | 0.1844 | 0.043 |
| (c) 1.5 + estate in quota | peso autunnale per quota al massimo 0.7 (quota stagionale <= 840 m) | 0.686 [0.652, 0.717] | -0.012 [-0.023, -0.000] | 0.039 [-0.011, 0.091] | -0.003 [-0.054, 0.048] | 0.1836 | 0.046 |
| (c2) 1.5 + entrambi i regimi a ogni quota | peso autunnale per quota fra 0.3 e 0.7 (quota stagionale 760-840 m) | 0.753 [0.718, 0.785] | 0.055 [0.027, 0.085] | 0.106 [0.062, 0.154] | 0.064 [0.022, 0.107] | 0.1697 | 0.119 |
| (d) 1.5 + caldo tollerato se c'e' acqua | sigmaWarmC 7.5 -> 12 solo nei giorni con fattore acqua 1.5 >= 0.5 | 0.697 [0.662, 0.730] | 0.000 [-0.001, 0.001] | 0.051 [0.003, 0.099] | 0.009 [-0.037, 0.057] | 0.1840 | 0.044 |
| (d2) 1.5 + caldo tollerato sempre | sigmaWarmC 7.5 -> 12 in tutti i giorni (controllo della (d)) | 0.697 [0.662, 0.730] | -0.000 [-0.002, 0.002] | 0.051 [0.003, 0.098] | 0.009 [-0.038, 0.056] | 0.1840 | 0.045 |
| (e) 1.5 + ottimo autunnale 15 °C | thermal.optAutumnC 13 -> 15 | 0.717 [0.682, 0.748] | 0.019 [0.014, 0.024] | 0.070 [0.024, 0.118] | 0.028 [-0.018, 0.075] | 0.1819 | 0.056 |
| (g) 1.5 + autunno a bassa quota (0,5) | phenology.lowElevationAutumnWeight = 0.5 (estate invariata) | 0.727 [0.691, 0.759] | 0.029 [0.009, 0.050] | 0.081 [0.035, 0.127] | 0.038 [-0.005, 0.082] | 0.1795 | 0.068 |
| (g2) 1.5 + autunno a bassa quota (0,8) | phenology.lowElevationAutumnWeight = 0.8 (estate invariata) | 0.734 [0.699, 0.767] | 0.036 [0.012, 0.061] | 0.088 [0.043, 0.133] | 0.045 [0.003, 0.087] | 0.1762 | 0.085 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | thermal.optAutumnC = 15 e phenology.lowElevationAutumnWeight = 0.5 | 0.749 [0.715, 0.782] | 0.052 [0.032, 0.073] | 0.103 [0.058, 0.148] | 0.061 [0.018, 0.104] | 0.1755 | 0.089 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | thermal.optAutumnC = 15 e phenology.lowElevationAutumnWeight = 0.8 | 0.755 [0.721, 0.788] | 0.058 [0.034, 0.082] | 0.109 [0.066, 0.154] | 0.067 [0.025, 0.108] | 0.1720 | 0.107 |
| (p) modello in produzione | ALGORITHM_V1 (1.6.0-porcino) | 0.755 [0.721, 0.788] | 0.058 [0.034, 0.082] | 0.109 [0.066, 0.154] | 0.067 [0.025, 0.108] | 0.1720 | 0.107 |
| (f) nullo: calendario mensile | frazione dei casi degli altri anni nello stesso mese | 0.646 [0.600, 0.693] | -0.051 [-0.098, -0.003] | — | -0.042 [-0.060, -0.025] | 0.1807 | 0.062 |
| (f2) nullo: calendario a nucleo | densita' dei giorni dell'anno dei casi degli altri anni, nucleo 10 giorni | 0.689 [0.646, 0.732] | -0.009 [-0.056, 0.038] | 0.042 [0.025, 0.060] | — | 0.1770 | 0.081 |

## AUC appaiata (caso contro controlli della stessa localita'-anno)

| Variante | AUC appaiata [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] |
|---|---|---|---|
| (a) 1.4 equivalente | 0.718 [0.678, 0.757] | 0.000 [-0.011, 0.011] | 0.053 [-0.000, 0.104] |
| (b) 1.5 attuale | 0.718 [0.676, 0.759] | — | 0.053 [0.000, 0.106] |
| (c) 1.5 + estate in quota | 0.718 [0.675, 0.756] | 0.000 [-0.020, 0.021] | 0.053 [-0.003, 0.109] |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.767 [0.726, 0.803] | 0.049 [0.010, 0.087] | 0.102 [0.054, 0.151] |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.721 [0.678, 0.760] | 0.003 [-0.001, 0.007] | 0.056 [0.003, 0.108] |
| (d2) 1.5 + caldo tollerato sempre | 0.722 [0.680, 0.761] | 0.004 [-0.003, 0.011] | 0.057 [0.003, 0.108] |
| (e) 1.5 + ottimo autunnale 15 °C | 0.744 [0.704, 0.781] | 0.026 [0.014, 0.040] | 0.079 [0.025, 0.130] |
| (g) 1.5 + autunno a bassa quota (0,5) | 0.735 [0.695, 0.774] | 0.017 [-0.007, 0.042] | 0.070 [0.019, 0.121] |
| (g2) 1.5 + autunno a bassa quota (0,8) | 0.736 [0.695, 0.775] | 0.018 [-0.012, 0.048] | 0.071 [0.022, 0.120] |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 0.767 [0.727, 0.803] | 0.049 [0.023, 0.076] | 0.102 [0.049, 0.152] |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 0.771 [0.733, 0.806] | 0.052 [0.021, 0.084] | 0.105 [0.057, 0.152] |
| (p) modello in produzione | 0.771 [0.733, 0.806] | 0.052 [0.021, 0.084] | 0.105 [0.057, 0.152] |
| (f) nullo: calendario mensile | 0.665 [0.616, 0.713] | -0.053 [-0.106, 0.000] | — |
| (f2) nullo: calendario a nucleo | 0.697 [0.652, 0.742] | -0.021 [-0.072, 0.031] | 0.032 [0.006, 0.056] |

## AUC per fascia di quota e per mese

Numerosita' (casi/controlli): <600 m: 85 casi / 231 controlli; 600-1200 m: 86 casi / 246 controlli; >1200 m: 93 casi / 273 controlli. Mesi: 5: 7/0; 6: 16/147; 7: 27/141; 8: 52/108; 9: 78/104; 10: 69/108; 11: 15/142.

| Variante | <600 m | 600-1200 m | >1200 m | mese 5 | mese 6 | mese 7 | mese 8 | mese 9 | mese 10 | mese 11 |
|---|---|---|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 0.720 | 0.701 | 0.690 | — | 0.645 | 0.714 | 0.847 | 0.522 | 0.480 | 0.633 |
| (b) 1.5 attuale | 0.721 | 0.713 | 0.700 | — | 0.662 | 0.708 | 0.840 | 0.541 | 0.510 | 0.646 |
| (c) 1.5 + estate in quota | 0.721 | 0.699 | 0.695 | — | 0.653 | 0.720 | 0.840 | 0.552 | 0.524 | 0.662 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.796 | 0.747 | 0.721 | — | 0.634 | 0.729 | 0.849 | 0.575 | 0.733 | 0.821 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.720 | 0.714 | 0.701 | — | 0.660 | 0.706 | 0.838 | 0.540 | 0.511 | 0.646 |
| (d2) 1.5 + caldo tollerato sempre | 0.713 | 0.718 | 0.701 | — | 0.661 | 0.703 | 0.837 | 0.538 | 0.511 | 0.646 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.721 | 0.731 | 0.736 | — | 0.678 | 0.707 | 0.839 | 0.553 | 0.545 | 0.710 |
| (g) 1.5 + autunno a bassa quota (0,5) | 0.763 | 0.733 | 0.700 | — | 0.662 | 0.708 | 0.842 | 0.539 | 0.633 | 0.762 |
| (g2) 1.5 + autunno a bassa quota (0,8) | 0.777 | 0.735 | 0.700 | — | 0.662 | 0.708 | 0.843 | 0.543 | 0.680 | 0.777 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 0.772 | 0.752 | 0.736 | — | 0.678 | 0.707 | 0.841 | 0.554 | 0.707 | 0.812 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 0.786 | 0.753 | 0.736 | — | 0.678 | 0.707 | 0.842 | 0.562 | 0.729 | 0.820 |
| (p) modello in produzione | 0.786 | 0.753 | 0.736 | — | 0.678 | 0.707 | 0.842 | 0.562 | 0.729 | 0.820 |
| (f) nullo: calendario mensile | 0.644 | 0.663 | 0.647 | — | — | — | — | — | — | — |
| (f2) nullo: calendario a nucleo | 0.669 | 0.727 | 0.675 | — | 0.412 | 0.565 | 0.293 | 0.440 | 0.655 | 0.732 |

## Sensibilita'

| Variante | casi giu-nov | solo incertezza nota | senza Trentino-Alto Adige |
|---|---|---|---|
| (a) 1.4 equivalente | 0.689 | 0.689 | 0.687 |
| (b) 1.5 attuale | 0.701 | 0.702 | 0.698 |
| (c) 1.5 + estate in quota | 0.689 | 0.690 | 0.685 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.761 | 0.755 | 0.757 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.701 | 0.702 | 0.698 |
| (d2) 1.5 + caldo tollerato sempre | 0.701 | 0.702 | 0.697 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.720 | 0.720 | 0.715 |
| (g) 1.5 + autunno a bassa quota (0,5) | 0.732 | 0.730 | 0.731 |
| (g2) 1.5 + autunno a bassa quota (0,8) | 0.740 | 0.737 | 0.740 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 0.755 | 0.752 | 0.752 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 0.761 | 0.757 | 0.759 |
| (p) modello in produzione | 0.761 | 0.757 | 0.759 |
| (f) nullo: calendario mensile | 0.664 | 0.644 | 0.654 |
| (f2) nullo: calendario a nucleo | 0.706 | 0.685 | 0.699 |

## MPI nei giorni in cui i porcini sono stati trovati

| Variante | <20 | 20-40 | 40-60 | 60-80 | >=80 | mediana |
|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 148 (56%) | 49 (19%) | 22 (8%) | 12 (5%) | 33 (13%) | 15.1 |
| (b) 1.5 attuale | 136 (52%) | 54 (20%) | 16 (6%) | 18 (7%) | 40 (15%) | 19.3 |
| (c) 1.5 + estate in quota | 131 (50%) | 67 (25%) | 23 (9%) | 29 (11%) | 14 (5%) | 20.8 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 80 (30%) | 70 (27%) | 35 (13%) | 50 (19%) | 29 (11%) | 33.0 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 136 (52%) | 53 (20%) | 17 (6%) | 17 (6%) | 41 (16%) | 19.3 |
| (d2) 1.5 + caldo tollerato sempre | 134 (51%) | 55 (21%) | 17 (6%) | 17 (6%) | 41 (16%) | 19.5 |
| (e) 1.5 + ottimo autunnale 15 °C | 139 (53%) | 51 (19%) | 20 (8%) | 17 (6%) | 37 (14%) | 18.1 |
| (g) 1.5 + autunno a bassa quota (0,5) | 90 (34%) | 74 (28%) | 37 (14%) | 23 (9%) | 40 (15%) | 29.4 |
| (g2) 1.5 + autunno a bassa quota (0,8) | 81 (31%) | 63 (24%) | 34 (13%) | 31 (12%) | 55 (21%) | 33.2 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 95 (36%) | 60 (23%) | 49 (19%) | 23 (9%) | 37 (14%) | 31.1 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 85 (32%) | 55 (21%) | 32 (12%) | 40 (15%) | 52 (20%) | 33.8 |
| (p) modello in produzione | 85 (32%) | 55 (21%) | 32 (12%) | 40 (15%) | 52 (20%) | 33.8 |

## Affidabilita' (decili, dopo calibrazione logistica LOYO)

**(b) 1.5 attuale**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 101 | 0.192 | 0.040 |
| 2 | 101 | 0.195 | 0.109 |
| 3 | 102 | 0.201 | 0.147 |
| 4 | 101 | 0.205 | 0.198 |
| 5 | 102 | 0.210 | 0.255 |
| 6 | 101 | 0.219 | 0.287 |
| 7 | 101 | 0.239 | 0.327 |
| 8 | 102 | 0.272 | 0.431 |
| 9 | 101 | 0.356 | 0.356 |
| 10 | 102 | 0.519 | 0.451 |

**(f) nullo: calendario mensile**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 101 | 0.125 | 0.238 |
| 2 | 101 | 0.143 | 0.089 |
| 3 | 102 | 0.147 | 0.049 |
| 4 | 101 | 0.166 | 0.178 |
| 5 | 102 | 0.194 | 0.167 |
| 6 | 101 | 0.281 | 0.347 |
| 7 | 101 | 0.331 | 0.347 |
| 8 | 102 | 0.371 | 0.500 |
| 9 | 101 | 0.404 | 0.416 |
| 10 | 102 | 0.444 | 0.275 |

## Casi con MPI 1.5 < 20: da che cosa dipende

136 casi. Media dei componenti della 1.5: acqua 0.62, termico 0.73, stagione 0.25. Fattore piu' basso: acqua 40, termico 1, stagione 95.
