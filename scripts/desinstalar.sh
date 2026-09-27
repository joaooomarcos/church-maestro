#!/usr/bin/env bash
# Remove o Maestro desta máquina Linux, para instalar do zero depois.
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/desinstalar.sh | bash
#
# Não mexe no Node nem nos outros programas. A pasta config é guardada ao lado
# (maestro-config-antiga-...) por segurança.
set -uo pipefail

DESTINO="${MAESTRO_DIR:-$HOME/maestro}"
passo() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
aviso() { printf '\033[33mAVISO: %s\033[0m\n' "$1"; }

passo "Removendo os serviços"
if command -v systemctl >/dev/null; then
  for servico in maestro-agent maestro-update maestro-hub; do
    arquivo="$HOME/.config/systemd/user/$servico.service"
    if [ -f "$arquivo" ]; then
      systemctl --user disable --now "$servico" >/dev/null 2>&1 || true
      rm -f "$arquivo"
      echo "removido: $servico"
    fi
  done
  systemctl --user daemon-reload >/dev/null 2>&1 || true
fi

passo "Parando o Maestro"
pkill -f 'packages/(hub|agent)/(dist|src)/index' >/dev/null 2>&1 && echo "processos parados" || echo "nada rodando"

cd "$HOME" || exit 1

if [ -d "$DESTINO" ]; then
  case "$DESTINO" in "" | "/" | "$HOME") aviso "pasta inválida: '$DESTINO'"; exit 1 ;; esac
  if ! grep -qE '"name":[[:space:]]*"maestro"' "$DESTINO/package.json" 2>/dev/null; then
    aviso "A pasta $DESTINO não parece ser do Maestro. Não apaguei nada nela."
  else
    if [ -d "$DESTINO/config" ]; then
      COPIA="$HOME/maestro-config-antiga-$(date '+%Y%m%d-%H%M')"
      passo "Guardando a configuração antiga em $COPIA"
      cp -a "$DESTINO/config" "$COPIA"
    fi
    passo "Apagando $DESTINO"
    rm -rf "$DESTINO" && echo "pasta apagada"
  fi
else
  echo "não há pasta $DESTINO"
fi

passo "Pronto: o Maestro saiu desta máquina."
echo "Para instalar de novo, siga o guia a partir da seção 2."
