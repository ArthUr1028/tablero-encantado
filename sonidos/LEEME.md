# Sonidos del Tablero Encantado

Origen: pistas largas que aportó Arthur (zip «efectos de sonido», 24-oct-2026). Autor y licencia de cada una: **pendiente de anotar** (Arthur las tomó de sitios libres como Freesound).

- `piezas/<tipo>.mp3`: un recorte por tipo de pieza (p peón, n caballo, b alfil, r torre, q dama, k rey, a arzobispo, c canciller, f ferz). Mismas duraciones siempre (0,5–0,7 s) para que el oído no delate la distancia. Entrada de 6 ms y salida con coseno de 140 ms; volumen común (-21 dBFS RMS).
- `capturas/nuevoN.mp3`: los tres golpes separados de `capturas.mp3`; se suman a las 11 capturas originales.
- `reserva/batalla.mp3`: pista de batalla guardada para más adelante (aún sin uso).
- Sin integrar todavía: `enroques.mp3` (178 s), `santuario.mp3` (distinta de la que ya está incrustada).

Origen de cada recorte (segundo de la pista original, opción nº1): peón 18,75 · caballo 2,17 · alfil 79,23 · torre 2,77 · dama 3,00 · rey 8,38 · ferz 24,50 · arzobispo 47,92 · canciller 8,58.

Para cambiar un sonido: reemplaza el mp3 y corre `python3 tools/build-sfx.py` (los incrusta en index.html).
