#!/usr/bin/env python3
"""Incrusta en index.html los sonidos de sonidos/ (window.SFX_AUDIO): un clip por pieza (claves pz_p, pz_n, ...) y las capturas nuevas,
que se añaden a las 11 originales del arreglo «cap». Es idempotente: se puede correr cuantas veces haga falta tras cambiar un archivo.
Uso:  python3 tools/build-sfx.py"""
import base64, json, os, sys
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
HTML = os.path.join(RAIZ, "index.html")
ORIGINALES = 11   # capturas que ya traía el juego
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()
s = open(HTML, encoding="utf-8").read()
ini = s.index("window.SFX_AUDIO={"); fin = s.index("\n", ini)
obj, fin_obj = json.JSONDecoder().raw_decode(s[ini + len("window.SFX_AUDIO="):fin])
resto = s[ini + len("window.SFX_AUDIO=") + fin_obj:fin]          # normalmente ";</script>"
d = dict(obj)
for tipo in "pnbrqkacfm":
    ruta = os.path.join(RAIZ, "sonidos", "piezas", tipo + ".mp3")
    if os.path.exists(ruta): d["pz_" + tipo] = b64(ruta)
nuevas = sorted(f for f in os.listdir(os.path.join(RAIZ, "sonidos", "capturas")) if f.endswith(".mp3"))
d["cap"] = d["cap"][:ORIGINALES] + [b64(os.path.join(RAIZ, "sonidos", "capturas", f)) for f in nuevas]
nuevo = "window.SFX_AUDIO=" + json.dumps(d, separators=(",", ":")) + resto
s = s[:ini] + nuevo + s[fin:]
open(HTML, "w", encoding="utf-8").write(s)
print("piezas:", sorted(k for k in d if k.startswith("pz_")), "| capturas:", len(d["cap"]), "| tamaño del bloque: %d KB" % (len(nuevo) // 1000))
