#!/usr/bin/env bash
# Corre las pruebas SQL de Dark Chess contra un Postgres temporal (no toca ninguna base real).
# Uso: bash tests/sql/correr.sh [dark_candados|dark_pausa|dark_resultado]   (sin argumento corre las dos)
# Necesita los binarios de PostgreSQL (initdb, pg_ctl, psql). Si no están en el PATH, los busca en /usr/lib/postgresql/*/bin.
set -u
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"
DIR="$(mktemp -d)"; PUERTO=$((54000 + RANDOM % 900))
trap 'pg_ctl -D "$DIR/data" -m immediate -w stop >/dev/null 2>&1; sleep 1; rm -rf "$DIR"' EXIT
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  chown postgres "$DIR"
  EJ() { su postgres -c "export PATH=$PATH; $*"; }
else
  EJ() { bash -c "$*"; }
fi
EJ "initdb -D $DIR/data -A trust >/dev/null"
EJ "pg_ctl -D $DIR/data -o '-p $PUERTO -k $DIR' -l $DIR/log -w start >/dev/null"
CASOS="${1:-dark_candados dark_pausa dark_resultado cuaderno marcas}"
for caso in $CASOS; do
  echo "================ $caso ================"
  EJ "createdb -h $DIR -p $PUERTO prueba_$caso"
  P="psql -h $DIR -p $PUERTO -d prueba_$caso -X -q"
  EJ "$P -f $RAIZ/tests/sql/dark_stub.sql" >/dev/null 2>&1
  EJ "$P -f $RAIZ/18_dark.sql" 2>&1 | grep -E "ERROR|denied|No such file" && echo "(error cargando 18_dark.sql)"
  if [ "$caso" = "dark_pausa" ] && [ -z "${SIN19:-}" ]; then EJ "$P -f ${ARCHIVO19:-$RAIZ/19_dark_pausa.sql}" 2>&1 | grep -E "ERROR|denied|No such file" && echo "(error cargando 19_dark_pausa.sql)"; fi
  if [ "$caso" = "dark_pausa" ] && [ -z "${SIN20:-}" ]; then EJ "$P -f $RAIZ/20_resultado.sql" 2>&1 | grep -E "ERROR|denied|No such file" && echo "(error cargando 20_resultado.sql)"; fi   # la pausa debe seguir funcionando CON el candado de resultado puesto
  if [ "$caso" = "dark_resultado" ]; then
    EJ "$P -f $RAIZ/19_dark_pausa.sql" 2>&1 | grep -E "ERROR|denied|No such file" && echo "(error cargando 19_dark_pausa.sql)"
    EJ "$P -f ${ARCHIVO20:-$RAIZ/20_resultado.sql}" 2>&1 | grep -E "ERROR|denied|No such file" && echo "(error cargando 20_resultado.sql)"
  fi
  EJ "$P -f $RAIZ/tests/sql/$caso.sql" 2>&1
done
