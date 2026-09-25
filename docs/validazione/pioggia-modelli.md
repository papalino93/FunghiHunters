# Pioggia: modelli Open-Meteo contro pluviometri SIR

Periodo 2026-08-11 → 2026-09-24 (45 giorni), 132 stazioni della Regione Toscana, una per cella di 0.15°. Generato da `scripts/validate-precip-models.ts`.

| Modello | Errore giornaliero (mm) | Scarto medio (mm/giorno) | Errore sui 7 giorni (mm) | Errore sui 26 giorni (mm) | Totale rispetto al misurato | Eventi ≥ 20 mm visti | Eventi ≥ 20 mm inventati |
|---|---|---|---|---|---|---|---|
| best_match | 2,8 | -1,0 | 16,0 | 46,1 | 63% | 130/279 | 24 |
| italia_meteo_arpae_icon_2i | 2,7 | -0,3 | 15,6 | 38,1 | 89% | 187/277 | 40 |
| media | 2,4 | -0,7 | 13,6 | 36,5 | 76% | 202/277 | 16 |

«Visto»: il modello dà almeno 10 mm fra il giorno prima e quello dopo. «Inventato»: il modello dà almeno 20 mm e il pluviometro meno di 5 in quei tre giorni.

## Totale del periodo per stazione (mm)

| Stazione | Quota (m) | Misurato | best_match | italia_meteo_arpae_icon_2i | media |
|---|---|---|---|---|---|
| Abbadia S. S. - Vetta Amiata | 1678 | 81 | 69 | NaN | NaN |
| Acquerino | 950 | 177 | 31 | NaN | NaN |
| Acquisti | 5 | 154 | 97 | NaN | NaN |
| Albano | 465 | 40 | 11 | NaN | NaN |
| Alberese | 1 | 36 | 86 | NaN | NaN |
| Alpe di Poti | 971 | 84 | 59 | NaN | NaN |
| Montedoglio | 411.76 | 120 | 76 | NaN | NaN |
| Anqua | 440 | 138 | 45 | NaN | NaN |
| Pizzorne | 938 | 126 | 33 | NaN | NaN |
| Argentario | 615 | 0 | 44 | NaN | NaN |
| Vinci | 250 | 130 | 17 | NaN | NaN |
| Asciano Pisano | 95 | 97 | 1 | NaN | NaN |
| Vergheto | 845 | 215 | 188 | NaN | NaN |
| Cervaiole | 1140 | 228 | 219 | NaN | NaN |
| Castel del Piano | 566 | 136 | 28 | NaN | NaN |
| Badia Agnano | 261 | 93 | 110 | NaN | NaN |
| La Verna | 1125 | 150 | 3 | NaN | NaN |
| Badia Tedalda | 842.11 | 167 | 1 | NaN | NaN |
| Tereglio | 590 | 92 | 170 | NaN | NaN |
| Barberino | 430 | 175 | 144 | NaN | NaN |
| Giogo | 880 | 36 | 28 | NaN | NaN |
| Palagnana | 861 | NaN | 97 | NaN | NaN |
| Batignano | 140 | 137 | 90 | NaN | NaN |
| Bettolle | 292 | 70 | 21 | NaN | NaN |
| Monte Faggiola | 881.24 | 143 | 64 | NaN | NaN |
| Zoo di Poppi | 417 | 192 | 1 | NaN | NaN |
| Bibbona | 70 | 93 | 132 | NaN | NaN |
| S. Rossore | 3 | 105 | 1 | NaN | NaN |
| Croce Arcana | 1716 | 61 | 102 | NaN | NaN |
| Roccatederighi | 475 | 172 | 145 | NaN | NaN |
| Castelnuovo Val di Cecina | 770 | 161 | 132 | NaN | NaN |
| Montalcino | 594 | 119 | 28 | NaN | NaN |
| Miemo | 420 | 87 | 124 | NaN | NaN |
| Caldana | 146 | 125 | 96 | NaN | NaN |
| Vaglia | 340 | 108 | 6 | NaN | NaN |
| Le Croci di Calenzano | 421 | 132 | 13 | NaN | NaN |
| Calzalunga | 45.39 | 117 | 127 | NaN | NaN |
| Camaiore I Frati | 27 | 105 | 77 | NaN | NaN |
| Camaldoli | 1111 | 138 | 1 | NaN | NaN |
| Gerfalco | 740 | 107 | 157 | NaN | NaN |
| Sassetta | 351 | 115 | 142 | NaN | NaN |
| Orto di Donna | 1070 | 110 | 187 | NaN | NaN |
| Careggine | 1100 | 233 | 248 | NaN | NaN |
| Sassa | 398 | 49 | 132 | NaN | NaN |
| Capalbio | 12 | 27 | 90 | NaN | NaN |
| Manciano | 447 | 115 | 72 | NaN | NaN |
| Passo Pradarena | 1580 | 243 | 327 | NaN | NaN |
| Capannoli | 28.61 | 134 | 76 | NaN | NaN |
| Capezzine | 326 | 106 | 22 | NaN | NaN |
| Capraia Isola | 274 | 133 | 36 | NaN | NaN |
| Il Palagio | 315 | 179 | 96 | NaN | NaN |
| Castellina Marittima  | 325 | 86 | 115 | NaN | NaN |
| Casaglia | 748.31 | 85 | 29 | NaN | NaN |
| Santermo | 210 | 102 | 64 | NaN | NaN |
| Passo Radici | 1637 | 156 | 193 | NaN | NaN |
| Serra Pistoiese | 790 | 43 | 46 | NaN | NaN |
| Poggio Aglione | 441 | 126 | 106 | NaN | NaN |
| Certaldo | 65 | 164 | 106 | NaN | NaN |
| Castellina in Chianti | 572 | 76 | 140 | NaN | NaN |
| Nusenna in Chianti | 560 | 53 | 116 | NaN | NaN |
| Gabbro | 245 | 8 | 88 | NaN | NaN |
| Pratomagno | 695 | 67 | 158 | NaN | NaN |
| Cortona | 427 | 65 | 48 | NaN | NaN |
| Vivo d'Orcia | 842 | 142 | 25 | NaN | NaN |
| Vernio | 695 | 114 | 47 | NaN | NaN |
| S. Miniato Poggio al Pino | 117 | 174 | 5 | NaN | NaN |
| Monticchiello | 495 | 93 | 18 | NaN | NaN |
| Gombitelli | 475 | 118 | 85 | NaN | NaN |
| Monte Serra | 890 | 76 | 1 | NaN | NaN |
| Valle Benedetta | 300 | 96 | 91 | NaN | NaN |
| Vallombrosa | 980 | 191 | 1 | NaN | NaN |
| Cottede | 769.99 | 96 | 58 | NaN | NaN |
| Monte Giovi | 960 | 120 | 3 | NaN | NaN |
| Lamole | 536 | 127 | 117 | NaN | NaN |
| Poggio alla Croce | 500 | 147 | 2 | NaN | NaN |
| Firenzuola | 430.2 | 146 | 48 | NaN | NaN |
| Foce a Giovo | 1674 | 96 | 166 | NaN | NaN |
| Follonica | 15 | NaN | 104 | NaN | NaN |
| Giglio Castello | 470 | 3 | 68 | NaN | NaN |
| Gorgona | 230 | 93 | 82 | NaN | NaN |
| Granaione | 148 | 171 | 33 | NaN | NaN |
| Guinadi Presa Verde | 383 | 277 | 354 | NaN | NaN |
| Pelago | 325 | 148 | 3 | 133 | 68 |
| Santomato | 125 | 130 | 18 | 79 | 49 |
| Radicofani | 618 | 110 | 13 | 249 | 131 |
| La Madonnina | 607 | 154 | 120 | 118 | 119 |
| Massa Marittima Filetto | 670 | 124 | 151 | 148 | 150 |
| Lago Paduli | 1168 | 244 | 328 | 152 | 240 |
| Livorno Mareografo | 0 | 85 | 77 | 67 | 72 |
| Marradi | 323 | 148 | 29 | 98 | 63 |
| Marsiliana | 16 | 46 | 88 | 10 | 49 |
| Massa Marittima Valpiana | 188 | 152 | 111 | 104 | 108 |
| Volterra Balze | 450 | 171 | 104 | 85 | 95 |
| Rigomagno | 395 | 126 | 48 | 149 | 98 |
| Prunetta | 960 | 152 | 41 | 84 | 62 |
| Monte Antico | 82 | 128 | 32 | 155 | 93 |
| Monte Ginezzo | 921 | 67 | 65 | 174 | 119 |
| Monte Perone | 713 | 92 | 57 | 49 | 53 |
| Montecatini Terme | 95 | 125 | 15 | 71 | 43 |
| Montecchio | 585 | 111 | 139 | 117 | 128 |
| Montecristo | 85 | 2 | 25 | 5 | 15 |
| Montenero | 193 | 120 | 16 | 103 | 60 |
| Monterchi | 309 | 100 | 27 | 118 | 72 |
| Taverne d'Arbia | 218 | 92 | 69 | 203 | 136 |
| Trappola | 869 | 133 | 4 | 250 | 127 |
| Monticiano La Pineta | 450 | 159 | 68 | 199 | 134 |
| Pienza (Madonnina) | 446 | 80 | 16 | 142 | 79 |
| Montopoli | 29 | 148 | 3 | 66 | 34 |
| Novegigola | 420 | 347 | 49 | 171 | 110 |
| Pari | 330 | 176 | 89 | 154 | 121 |
| Pentolina | 450 | 105 | 73 | 133 | 103 |
| Piancastagnaio | 341 | 131 | 38 | NaN | NaN |
| Pitigliano | 157 | 112 | 73 | NaN | NaN |
| Sorano Meteo | 782 | 203 | 104 | NaN | NaN |
| Scorgiano | 233 | 83 | 77 | NaN | NaN |
| Scansano | 576 | 103 | 103 | NaN | NaN |
| Siena Poggio al Vento | 348 | 103 | 94 | NaN | NaN |
| Rocchetta | 400 | 231 | 171 | NaN | NaN |
| Populonia | 164 | 68 | 101 | 24 | 63 |
| Portoferraio | 10 | 83 | 63 | 43 | 53 |
| Quercianella | 244 | 64 | 91 | 29 | 60 |
| Rispescia | 25 | 121 | 54 | 29 | 42 |
| Roccastrada | 504 | 170 | 98 | 107 | 102 |
| S. Donato | 21 | 33 | 74 | 9 | 41 |
| Vingone | 54 | 139 | 4 | 63 | 34 |
| S. Martino | 320 | 93 | 60 | 53 | 56 |
| Sestino | 1000 | 80 | 2 | 150 | 76 |
| Spineta | 633 | 141 | 23 | 226 | 124 |
| Vada (Bonifica) | 2 | 34 | 104 | 70 | 87 |
| Vallucciole | 745 | 171 | 2 | 136 | 69 |
| Vecchia SS Aurelia | 12 | 87 | 107 | 43 | 75 |
| Villafranca | 156 | 441 | 62 | 130 | 96 |
