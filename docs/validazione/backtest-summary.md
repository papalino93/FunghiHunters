# Backtest GBIF — riepilogo generato

Generato: 2026-09-24T09:45:07.082Z — seme 20260924, bootstrap 2000 replicati a grappoli (localita'-anno).

GBIF: 907 record scaricati, 490 accettati, 437 dopo deduplica (stesso giorno entro 1 km), 413 localita'-anno. Scarti: {"obscured":292,"uncertainty-large":63,"uncertainty-missing":62}.
Campione: 250 localita'-anno (strati: regione, allocazione uguale). Meteo disponibile per 249 (18 scaricate ora, 231 da cache, 1 fallite).
Righe: 1010 = 263 casi + 747 controlli (0 giorni scartati per meteo mancante). Quota dei casi: mediana 947 m, 10°-90° percentile 264-1626 m.
Casi per regione: Trentino-Alto Adige 35, Toscana 35, Piemonte 34, Lombardia 32, Veneto 23, ignota 15, Emilia-Romagna 14, Sardegna 12, Lazio 12, Calabria 11, Liguria 8, Valle d'Aosta 6, Abruzzo 6, Sicilia 6, Campania 5, Friuli-Venezia Giulia 4, Marche 2, Molise 1, Basilicata 1, Umbria 1.
Brier di riferimento (sola prevalenza, LOYO): 0.193.

## AUC per variante

| Variante | Cambiamento | AUC [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] | Δ vs calendario a nucleo [IC 95%] | Brier (LOYO) | BSS |
|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | trigger.waterRelief = 0 | 0.686 [0.653, 0.721] | -0.011 [-0.018, -0.003] | 0.040 [-0.005, 0.088] | -0.002 [-0.045, 0.043] | 0.1869 | 0.029 |
| (b) 1.5 attuale | nessuna (ALGORITHM_V1, 1.5.0-porcino) | 0.697 [0.663, 0.731] | — | 0.051 [0.006, 0.100] | 0.008 [-0.035, 0.054] | 0.1844 | 0.043 |
| (c) 1.5 + estate in quota | peso autunnale per quota al massimo 0.7 (quota stagionale <= 840 m) | 0.686 [0.651, 0.718] | -0.011 [-0.024, 0.000] | 0.040 [-0.010, 0.091] | -0.003 [-0.050, 0.046] | 0.1837 | 0.046 |
| (c2) 1.5 + entrambi i regimi a ogni quota | peso autunnale per quota fra 0.3 e 0.7 (quota stagionale 760-840 m) | 0.717 [0.682, 0.749] | 0.019 [-0.003, 0.042] | 0.070 [0.022, 0.116] | 0.028 [-0.018, 0.072] | 0.1785 | 0.073 |
| (d) 1.5 + caldo tollerato se c'e' acqua | sigmaWarmC 7.5 -> 12 solo nei giorni con fattore acqua 1.5 >= 0.5 | 0.697 [0.663, 0.732] | 0.000 [-0.001, 0.001] | 0.051 [0.006, 0.100] | 0.008 [-0.035, 0.055] | 0.1841 | 0.044 |
| (d2) 1.5 + caldo tollerato sempre | sigmaWarmC 7.5 -> 12 in tutti i giorni (controllo della (d)) | 0.697 [0.663, 0.731] | -0.000 [-0.002, 0.002] | 0.051 [0.006, 0.099] | 0.008 [-0.035, 0.054] | 0.1840 | 0.044 |
| (e) 1.5 + ottimo autunnale 15 °C | thermal.optAutumnC 13 -> 15 | 0.716 [0.683, 0.750] | 0.019 [0.014, 0.024] | 0.070 [0.025, 0.118] | 0.027 [-0.016, 0.074] | 0.1820 | 0.055 |
| (g) 1.5 + autunno a bassa quota (0,5) | phenology.lowElevationAutumnWeight = 0.5 (estate invariata) | 0.727 [0.691, 0.762] | 0.029 [0.010, 0.050] | 0.080 [0.033, 0.125] | 0.038 [-0.006, 0.080] | 0.1795 | 0.068 |
| (g2) 1.5 + autunno a bassa quota (0,8) | phenology.lowElevationAutumnWeight = 0.8 (estate invariata) | 0.734 [0.697, 0.769] | 0.036 [0.012, 0.061] | 0.087 [0.042, 0.131] | 0.045 [0.002, 0.085] | 0.1762 | 0.085 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | thermal.optAutumnC = 15 e phenology.lowElevationAutumnWeight = 0.5 | 0.749 [0.714, 0.783] | 0.052 [0.032, 0.073] | 0.103 [0.056, 0.147] | 0.060 [0.017, 0.101] | 0.1756 | 0.088 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | thermal.optAutumnC = 15 e phenology.lowElevationAutumnWeight = 0.8 | 0.755 [0.720, 0.789] | 0.058 [0.034, 0.082] | 0.109 [0.063, 0.151] | 0.066 [0.025, 0.105] | 0.1721 | 0.107 |
| (f) nullo: calendario mensile | frazione dei casi degli altri anni nello stesso mese | 0.646 [0.602, 0.690] | -0.051 [-0.100, -0.006] | — | -0.043 [-0.060, -0.024] | 0.1807 | 0.062 |
| (f2) nullo: calendario a nucleo | densita' dei giorni dell'anno dei casi degli altri anni, nucleo 10 giorni | 0.689 [0.647, 0.731] | -0.008 [-0.054, 0.035] | 0.043 [0.024, 0.060] | — | 0.1770 | 0.081 |

## AUC appaiata (caso contro controlli della stessa localita'-anno)

| Variante | AUC appaiata [IC 95%] | Δ vs 1.5 [IC 95%] | Δ vs calendario mensile [IC 95%] |
|---|---|---|---|
| (a) 1.4 equivalente | 0.719 [0.677, 0.758] | 0.000 [-0.012, 0.012] | 0.053 [0.003, 0.103] |
| (b) 1.5 attuale | 0.719 [0.676, 0.759] | — | 0.053 [0.003, 0.104] |
| (c) 1.5 + estate in quota | 0.719 [0.674, 0.758] | 0.000 [-0.021, 0.021] | 0.053 [-0.004, 0.107] |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.731 [0.689, 0.772] | 0.013 [-0.019, 0.044] | 0.066 [0.011, 0.117] |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.721 [0.678, 0.762] | 0.003 [-0.001, 0.007] | 0.056 [0.005, 0.107] |
| (d2) 1.5 + caldo tollerato sempre | 0.722 [0.680, 0.762] | 0.004 [-0.003, 0.011] | 0.057 [0.006, 0.107] |
| (e) 1.5 + ottimo autunnale 15 °C | 0.743 [0.703, 0.781] | 0.025 [0.013, 0.038] | 0.078 [0.025, 0.127] |
| (g) 1.5 + autunno a bassa quota (0,5) | 0.736 [0.694, 0.777] | 0.017 [-0.007, 0.042] | 0.070 [0.022, 0.119] |
| (g2) 1.5 + autunno a bassa quota (0,8) | 0.736 [0.694, 0.776] | 0.018 [-0.012, 0.050] | 0.071 [0.023, 0.116] |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 0.766 [0.727, 0.804] | 0.048 [0.020, 0.077] | 0.101 [0.050, 0.148] |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 0.770 [0.731, 0.806] | 0.051 [0.019, 0.084] | 0.105 [0.057, 0.149] |
| (f) nullo: calendario mensile | 0.665 [0.619, 0.710] | -0.053 [-0.104, -0.003] | — |
| (f2) nullo: calendario a nucleo | 0.697 [0.655, 0.739] | -0.022 [-0.072, 0.031] | 0.032 [0.006, 0.057] |

## AUC per fascia di quota e per mese

Numerosita' (casi/controlli): <600 m: 85 casi / 231 controlli; 600-1200 m: 86 casi / 246 controlli; >1200 m: 92 casi / 270 controlli. Mesi: 5: 7/0; 6: 16/146; 7: 27/141; 8: 51/108; 9: 78/104; 10: 69/107; 11: 15/141.

| Variante | <600 m | 600-1200 m | >1200 m | mese 5 | mese 6 | mese 7 | mese 8 | mese 9 | mese 10 | mese 11 |
|---|---|---|---|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 0.720 | 0.701 | 0.689 | — | 0.646 | 0.714 | 0.845 | 0.522 | 0.484 | 0.632 |
| (b) 1.5 attuale | 0.721 | 0.713 | 0.699 | — | 0.662 | 0.708 | 0.838 | 0.541 | 0.513 | 0.645 |
| (c) 1.5 + estate in quota | 0.721 | 0.699 | 0.696 | — | 0.656 | 0.720 | 0.838 | 0.552 | 0.527 | 0.661 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.757 | 0.726 | 0.696 | — | 0.637 | 0.730 | 0.854 | 0.550 | 0.627 | 0.749 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.720 | 0.714 | 0.700 | — | 0.661 | 0.706 | 0.837 | 0.540 | 0.514 | 0.645 |
| (d2) 1.5 + caldo tollerato sempre | 0.713 | 0.718 | 0.701 | — | 0.662 | 0.703 | 0.836 | 0.538 | 0.513 | 0.646 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.721 | 0.731 | 0.735 | — | 0.679 | 0.707 | 0.837 | 0.553 | 0.548 | 0.708 |
| (g) 1.5 + autunno a bassa quota (0,5) | 0.763 | 0.733 | 0.699 | — | 0.662 | 0.708 | 0.840 | 0.539 | 0.637 | 0.761 |
| (g2) 1.5 + autunno a bassa quota (0,8) | 0.777 | 0.735 | 0.699 | — | 0.662 | 0.708 | 0.842 | 0.543 | 0.682 | 0.775 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 0.772 | 0.752 | 0.735 | — | 0.679 | 0.707 | 0.839 | 0.554 | 0.708 | 0.811 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 0.786 | 0.753 | 0.735 | — | 0.679 | 0.707 | 0.840 | 0.562 | 0.730 | 0.819 |
| (f) nullo: calendario mensile | 0.644 | 0.663 | 0.647 | — | — | — | — | — | — | — |
| (f2) nullo: calendario a nucleo | 0.672 | 0.727 | 0.674 | — | 0.415 | 0.565 | 0.294 | 0.441 | 0.654 | 0.732 |

## Sensibilita'

| Variante | casi giu-nov | solo incertezza nota | senza Trentino-Alto Adige |
|---|---|---|---|
| (a) 1.4 equivalente | 0.689 | 0.688 | 0.687 |
| (b) 1.5 attuale | 0.700 | 0.701 | 0.698 |
| (c) 1.5 + estate in quota | 0.689 | 0.690 | 0.685 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 0.723 | 0.721 | 0.719 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 0.700 | 0.701 | 0.698 |
| (d2) 1.5 + caldo tollerato sempre | 0.700 | 0.702 | 0.697 |
| (e) 1.5 + ottimo autunnale 15 °C | 0.719 | 0.720 | 0.714 |
| (g) 1.5 + autunno a bassa quota (0,5) | 0.732 | 0.730 | 0.731 |
| (g2) 1.5 + autunno a bassa quota (0,8) | 0.740 | 0.737 | 0.740 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 0.755 | 0.751 | 0.752 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 0.761 | 0.757 | 0.758 |
| (f) nullo: calendario mensile | 0.664 | 0.644 | 0.654 |
| (f2) nullo: calendario a nucleo | 0.706 | 0.685 | 0.699 |

## MPI nei giorni in cui i porcini sono stati trovati

| Variante | <20 | 20-40 | 40-60 | 60-80 | >=80 | mediana |
|---|---|---|---|---|---|---|
| (a) 1.4 equivalente | 148 (56%) | 49 (19%) | 21 (8%) | 12 (5%) | 33 (13%) | 15.1 |
| (b) 1.5 attuale | 136 (52%) | 54 (21%) | 15 (6%) | 18 (7%) | 40 (15%) | 19.2 |
| (c) 1.5 + estate in quota | 131 (50%) | 66 (25%) | 23 (9%) | 29 (11%) | 14 (5%) | 20.4 |
| (c2) 1.5 + entrambi i regimi a ogni quota | 100 (38%) | 97 (37%) | 28 (11%) | 29 (11%) | 9 (3%) | 25.0 |
| (d) 1.5 + caldo tollerato se c'e' acqua | 136 (52%) | 53 (20%) | 16 (6%) | 17 (6%) | 41 (16%) | 19.2 |
| (d2) 1.5 + caldo tollerato sempre | 134 (51%) | 55 (21%) | 16 (6%) | 17 (6%) | 41 (16%) | 19.4 |
| (e) 1.5 + ottimo autunnale 15 °C | 139 (53%) | 51 (19%) | 19 (7%) | 17 (6%) | 37 (14%) | 17.9 |
| (g) 1.5 + autunno a bassa quota (0,5) | 90 (34%) | 74 (28%) | 36 (14%) | 23 (9%) | 40 (15%) | 29.3 |
| (g2) 1.5 + autunno a bassa quota (0,8) | 81 (31%) | 63 (24%) | 33 (13%) | 31 (12%) | 55 (21%) | 33.1 |
| (h) ottimo 15 °C + autunno a bassa quota (0,5) | 95 (36%) | 60 (23%) | 48 (18%) | 23 (9%) | 37 (14%) | 30.8 |
| (h2) ottimo 15 °C + autunno a bassa quota (0,8) | 85 (32%) | 55 (21%) | 31 (12%) | 40 (15%) | 52 (20%) | 33.8 |

## Affidabilita' (decili, dopo calibrazione logistica LOYO)

**(b) 1.5 attuale**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 101 | 0.192 | 0.050 |
| 2 | 101 | 0.195 | 0.099 |
| 3 | 101 | 0.201 | 0.149 |
| 4 | 101 | 0.205 | 0.198 |
| 5 | 101 | 0.210 | 0.257 |
| 6 | 101 | 0.219 | 0.287 |
| 7 | 101 | 0.239 | 0.327 |
| 8 | 101 | 0.272 | 0.426 |
| 9 | 101 | 0.356 | 0.366 |
| 10 | 101 | 0.520 | 0.446 |

**(f) nullo: calendario mensile**

| Decile | n | p prevista media | frequenza osservata |
|---|---|---|---|
| 1 | 101 | 0.126 | 0.238 |
| 2 | 101 | 0.143 | 0.069 |
| 3 | 101 | 0.147 | 0.069 |
| 4 | 101 | 0.167 | 0.178 |
| 5 | 101 | 0.195 | 0.158 |
| 6 | 101 | 0.276 | 0.347 |
| 7 | 101 | 0.329 | 0.356 |
| 8 | 101 | 0.372 | 0.495 |
| 9 | 101 | 0.405 | 0.416 |
| 10 | 101 | 0.445 | 0.277 |

## Casi con MPI 1.5 < 20: da che cosa dipende

136 casi. Media dei componenti della 1.5: acqua 0.62, termico 0.73, stagione 0.25. Fattore piu' basso: acqua 40, termico 1, stagione 95.
