# Sonidos del Tablero Encantado

Origen: pistas largas que aportó Arthur (zip «efectos de sonido», 24-oct-2026). Según Arthur, son de NCS (NoCopyrightSounds).

- `piezas/<tipo>.mp3`: un recorte por tipo de pieza (p peón, n caballo, b alfil, r torre, q dama, k rey, a arzobispo, c canciller, f ferz, m maharajá). Mismas duraciones siempre (0,5–0,7 s) para que el oído no delate la distancia. Entrada de 6 ms y salida con coseno de 140 ms; volumen común (-21 dBFS RMS).
- `capturas/nuevoN.mp3`: los tres golpes separados de `capturas.mp3`; se suman a las 11 capturas originales.
- `reserva/batalla.mp3`: pista de batalla completa (33 s). `entrada/batalla.mp3` es su recorte de los primeros 15 s (112 kbps), que suena en la entrada a la batalla (2.136): sube con el humo, se sostiene y se apaga al disiparse.
- Sin integrar todavía: `enroques.mp3` (178 s), `santuario.mp3` (distinta de la que ya está incrustada).

Origen de cada recorte (segundo de la pista original; opción elegida por Arthur): peón 18,75 (op.1) · caballo 2,17 (1) · alfil 79,23 (1) · torre 4,25 (2) · dama 3,00 (1) · rey 8,38 (1) · ferz 24,50 (1) · arzobispo 79,80 (3) · canciller 6,58 (3) · maharajá 8,05 (1, sin confirmar).

Por variante: en Seirawan el halcón (a) y el elefante (c), y en Shatranj el fil (l), conservan los gritos que ya traía el tablero (muestras `halcon` y `elefante`). La «m» (amazona en Amazonas, maharajá en Maharajá) usa `piezas/m.mp3` en ambas variantes.

Para cambiar un sonido: reemplaza el mp3 y corre `python3 tools/build-sfx.py` (los incrusta en index.html).

## Enroques (2.128)
- `enroques/corto.mp3` (0,96 s, 2 golpes de tambor) y `enroques/largo.mp3` (1,81 s, 3 golpes): recortes de la pista `enroques.mp3` de Arthur, desde el segundo 0,24 (los tres primeros golpes, separados medio segundo; el corto es el largo sin su tercer golpe). Pico a −3 dB y fundido de salida para que no corten en seco.
- Se usan en TODAS las variantes: enroque corto (`K`) = 2 golpes, largo (`Q`) = 3. Sin las muestras, el juego vuelve a los golpes de piedra de antes. En un enroque no suena el paso del rey: lo sustituyen los tambores.
- Origen de la pista original: NCS (NoCopyrightSounds), según Arthur.

## Banda sonora (2.218)
- `musica/*.mp3`: siete pistas que aportó Arthur (`banda_sonora.zip` y «The Iron Toll Remains», 4-nov-2026; creadas por él con IA, sin licencias de terceros), de ≈2 min y ≈2,9 MB cada una (192 kbps). Con «La Niebla» (generativa, sin archivo) son las ocho pistas que suenan en orden aleatorio en TODAS las variantes y en el Tablero libre. Se quitaron «La Marcha» y «La Crónica».
- Títulos: Steel Against the Sky · Beneath The Siege Wall · Before the Shield Wall · Iron Beneath the Shield · Before the Siege · Where Steel Meets Mud · The Iron Toll Remains.
- Nivelación: las pistas vienen a ≈ −12 LUFS y La Niebla sale a ≈ −21; en `index.html` (`MUS_ARCH`) cada una lleva una ganancia que la deja a ≈ −20 LUFS. Si se cambia o añade una pista, medirla (`ffmpeg -af ebur128`) y ajustar su ganancia.
- Orden: baraja por rondas (suenan las ocho antes de repetir; la primera de una ronda nunca es la última de la anterior). Cruce de 5 s entre pistas; La Niebla dura 2:30 por turno.
- Descarga: no se precargan en el service worker (serían ≈17 MB con datos móviles). Se baja la pista que suena y, mientras tanto, la siguiente; `sw.js` las guarda en su propia caché (`musica-v1`, que el cambio de versión no borra) y las sirve desde ahí. Sin red y sin caché, cae a La Niebla.

## La Niebla grabada (2.220)
- `musica/la-niebla-i.mp3` y `la-niebla-ii.mp3` (3:06, 128 kbps): La Niebla renderizada sin conexión con el mismo generador (`MUSICA_DARK`) y la misma reverberación, con 8 s de fundido final y nivelada a ≈ −20 LUFS (ganancia 1 en `MUS_ARCH`). Motivo: generada en vivo se cortaba en el teléfono (procesador justo); las pistas grabadas no. Con ellas son nueve pistas.
- La generativa sigue en el código solo de respaldo (si falla la descarga de una pista, suena ella). Para renderizar otra versión: extraer `MUSICA_DARK` de `index.html`, correrla en un `OfflineAudioContext` de 186 s con un convolver de 5,5 s (ver `makeIRm`), fundido de 8 s y normalizar a −20 LUFS.
- Nota de nivel: al nivelar la banda sonora (2.218) las pistas grabadas quedaron unos 7 dB por debajo de la antigua La Niebla en vivo (que salía a ≈ −12,7 LUFS antes del volumen de música). Las versiones grabadas de La Niebla van al mismo nivel que las demás.

## Trueno de la coronación (2.262)
- `coronacion/trueno.mp3` (4,4 s, 112 kbps, ≈ −17,6 LUFS, pico −5,3 dBFS): recorte del audio «Thunder (single hit)» que aportó Arthur (9-nov-2026; origen y licencia no indicados, ya sin la imagen incrustada ni los metadatos). Se quitaron los últimos 4 s (cola casi inaudible), con entrada de 4 ms, salida de 1,5 s, limitador y nivelación; el original llegaba a +1,7 dBFS (saturaba).
- Suena en TODA coronación, en todas las variantes (incluido Dark Chess, igual que antes con el sonido de coronación), arrancando en el impacto del rayo: 0,26 s (espera) + 0,42 s (caída) tras la jugada. Sin la muestra, vuelve la invocación sintetizada de siempre (`summonSfx`). Se incrusta con `python3 tools/build-sfx.py` (clave `trueno`).
- Visual: `spawnBolt()` en `index.html` (rayo SVG de tres trazos, ramas y arcos a ras de la casilla, destello de tablero con a lo sumo dos picos por segundo; sin filtros de desenfoque, ligero en celular). Con «reducir movimiento» no se dibuja nada. Prueba: `node tests/coronacion_rayo.smoke.js` (con `FRAMES=/carpeta` guarda capturas congeladas; `CASO=negras` prueba la coronación larga).

## Llegada del Halcón y del Elefante (2.263)
- Sin archivos nuevos: los chillidos (`halcon`, `elefante`) son los de siempre; lo nuevo es la capa sintetizada de `creatureSfx()` y la animación. Impacto a t + 0,42 s (igual que el visual: `--gd` + 0,42 s).
- Halcón: soplo de aire que se afina (picada), aleteo de 4 ráfagas agudas y un destello. Elefante: retumbo grave que se acerca, pisotón (sub-grave + golpe medio para bocinas de celular), polvo, eco a los 0,28 s (coincide con la segunda sacudida, `quake-heavy`) y cinco guijarros.
- En el enroque con convocatoria la llegada espera a los tambores (0,8 s corto / 1,3 s largo): visual y sonido comparten ese retraso. Prueba: `node tests/seirawan_entrada.smoke.js` (`FRAMES=/carpeta` guarda capturas congeladas).

