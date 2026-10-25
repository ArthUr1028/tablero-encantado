# Sonidos del Tablero Encantado

Origen: pistas largas que aportó Arthur (zip «efectos de sonido», 24-oct-2026). Autor y licencia de cada una: **pendiente de anotar** (Arthur las tomó de sitios libres como Freesound).

- `piezas/<tipo>.mp3`: un recorte por tipo de pieza (p peón, n caballo, b alfil, r torre, q dama, k rey, a arzobispo, c canciller, f ferz, m maharajá). Mismas duraciones siempre (0,5–0,7 s) para que el oído no delate la distancia. Entrada de 6 ms y salida con coseno de 140 ms; volumen común (-21 dBFS RMS).
- `capturas/nuevoN.mp3`: los tres golpes separados de `capturas.mp3`; se suman a las 11 capturas originales.
- `reserva/batalla.mp3`: pista de batalla guardada para más adelante (aún sin uso).
- Sin integrar todavía: `enroques.mp3` (178 s), `santuario.mp3` (distinta de la que ya está incrustada).

Origen de cada recorte (segundo de la pista original; opción elegida por Arthur): peón 18,75 (op.1) · caballo 2,17 (1) · alfil 79,23 (1) · torre 4,25 (2) · dama 3,00 (1) · rey 8,38 (1) · ferz 24,50 (1) · arzobispo 79,80 (3) · canciller 6,58 (3) · maharajá 8,05 (1, sin confirmar).

Por variante: en Seirawan el halcón (a) y el elefante (c), y en Shatranj el fil (l), conservan los gritos que ya traía el tablero (muestras `halcon` y `elefante`). En Amazonas, la amazona suena a dama + caballo; en Maharajá, la «m» usa `piezas/m.mp3`.

Para cambiar un sonido: reemplaza el mp3 y corre `python3 tools/build-sfx.py` (los incrusta en index.html).
