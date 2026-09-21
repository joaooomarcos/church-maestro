#!/usr/bin/env bash
# Atualiza o Maestro para a versão aprovada no canal, uma vez por dia.
#
# Mesmo desenho do atualizar.ps1: só instala o commit aprovado no canal.json,
# compila numa pasta separada antes de trocar qualquer coisa, e volta para a
# versão anterior se o agente não subir depois da troca.
set -uo pipefail

FORCAR=0
SHA_PEDIDO=""
while [ $# -gt 0 ]; do
  case "$1" in
  --forcar) FORCAR=1 ;;
  --sha)
    shift
    SHA_PEDIDO="${1:-}"
    ;;
  esac
  shift
done

REPO="joaooomarcos/church-maestro"
DESTINO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DADOS="$DESTINO/data"
LOG="$DADOS/atualizacao.log"
LOG_COMANDOS="$DADOS/atualizacao-comandos.log"
MARCADOR="$DADOS/ultima-checagem.txt"
VERSAO_TXT="$DESTINO/versao.txt"
ESTADO_JSON="$DADOS/atualizacao-estado.json"

mkdir -p "$DADOS"

registrar() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG"; }
curto() { if [ -n "${1:-}" ]; then echo "${1:0:7}"; else echo "desconhecida"; fi; }

# O painel lê este arquivo (pelo /health do agente) para mostrar o andamento.
escrever_estado() { # $1 = estado, $2 = mensagem, $3 = sha
  node -e '
    const fs=require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({
      estado: process.argv[2], mensagem: process.argv[3], sha: process.argv[4] || undefined, ts: Date.now(),
    }, null, 2));
  ' "$ESTADO_JSON" "$1" "$2" "${3:-}" 2>/dev/null || true
}

notas_do_commit() { # $1 = sha
  curl -fsSL --max-time 10 "https://api.github.com/repos/$REPO/commits/$1" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).commit.message.split("\n")[0])}catch{}})' ||
    true
}

sha_instalado() {
  [ -f "$VERSAO_TXT" ] || { echo ""; return; }
  awk '{print $1; exit}' "$VERSAO_TXT"
}

# O cache do raw.githubusercontent dura alguns minutos; a query quebra o cache.
obter_canal() {
  local url="https://raw.githubusercontent.com/$REPO/main/canal.json?t=$(date +%s)"
  for _ in $(seq 1 10); do
    if curl -fsSL --max-time 15 "$url"; then return 0; fi
    sleep 15 # logon costuma acontecer antes da rede conectar
  done
  return 1
}

campo_do_canal() { # $1 = json, $2 = campo
  printf '%s' "$1" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { const j=JSON.parse(s); const v=j[process.argv[1]]; console.log(v===undefined?"":String(v)); }
      catch { console.log(""); }
    })' "$2"
}

parar_maestro() {
  if command -v systemctl >/dev/null; then
    systemctl --user stop maestro-agent >/dev/null 2>&1 || true
    systemctl --user stop maestro-hub >/dev/null 2>&1 || true
  fi
  pkill -f 'packages/(hub|agent)/dist/index.js' >/dev/null 2>&1 || true
  sleep 2
}

subir_maestro() {
  if command -v systemctl >/dev/null; then
    systemctl --user start maestro-agent >/dev/null 2>&1 || true
    [ -f "$DESTINO/config/hub.json" ] && systemctl --user start maestro-hub >/dev/null 2>&1 || true
  fi
}

responde() { # $1 = url, $2 = segundos
  local fim=$(( $(date +%s) + $2 ))
  while [ "$(date +%s)" -lt "$fim" ]; do
    curl -fsS --max-time 3 "$1" >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

verificar() {
  local ok=0
  if [ -f "$DESTINO/config/hub.json" ]; then
    if responde "http://127.0.0.1:8700/health" 90; then registrar "ok: o painel respondeu"; else registrar "FALHA: o painel não respondeu depois da troca"; ok=1; fi
  fi
  if [ -f "$DESTINO/config/agent.json" ]; then
    if responde "http://127.0.0.1:8770/health" 60; then registrar "ok: o agente respondeu"; else registrar "FALHA: o agente não respondeu depois da troca"; ok=1; fi
  fi
  return $ok
}

instalar_sha() { # $1 = sha, $2 = notas
  local sha="$1" notas="$2"
  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN

  registrar "baixando $(curto "$sha")"
  escrever_estado baixando "Baixando a versão $(curto "$sha")" "$sha"
  mkdir -p "$tmp/codigo"
  if ! curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$sha" | tar -xz -C "$tmp/codigo" --strip-components=1; then
    registrar "FALHA: não consegui baixar $(curto "$sha"); nada foi trocado"
    escrever_estado falhou "Não consegui baixar a versão; nada foi trocado" "$sha"
    return 1
  fi

  registrar "instalando dependências e compilando numa pasta separada"
  escrever_estado compilando "Compilando a versão nova (a máquina segue no ar)" "$sha"
  if ! (cd "$tmp/codigo" && npm ci --no-audit --no-fund >>"$LOG_COMANDOS" 2>&1); then
    registrar "FALHA: npm ci não terminou; nada foi trocado"
    escrever_estado falhou "Falha ao baixar as dependências; nada foi trocado" "$sha"
    return 1
  fi
  if ! (cd "$tmp/codigo" && npm run build >>"$LOG_COMANDOS" 2>&1); then
    registrar "FALHA: a compilação quebrou; nada foi trocado"
    escrever_estado falhou "A versão nova não compilou; nada foi trocado" "$sha"
    return 1
  fi

  registrar "parando o Maestro para trocar os arquivos"
  escrever_estado trocando "Trocando os arquivos e reiniciando" "$sha"
  parar_maestro

  # --delete tira arquivo velho que não existe mais na versão nova. Os arquivos
  # que mantêm a máquina capaz de se atualizar ficam de fora da poda: voltar
  # para uma versão anterior ao atualizador deixaria a máquina sem saída, só
  # resolvida com visita presencial.
  if command -v rsync >/dev/null; then
    copiar() {
      rsync -a --delete \
        --exclude 'config/' --exclude 'data/' --exclude 'versao.txt' \
        --exclude 'scripts/atualizar.sh' --exclude 'scripts/atualizar.ps1' \
        --exclude 'scripts/iniciar-oculto.vbs' \
        "$tmp/codigo/" "$DESTINO/"
    }
  else
    copiar() { cp -a "$tmp/codigo/." "$DESTINO/"; }
  fi
  if ! copiar >>"$LOG_COMANDOS" 2>&1; then
    registrar "FALHA: não consegui copiar os arquivos"
    subir_maestro
    return 1
  fi

  # Quando a versão nova traz esses arquivos, eles são atualizados também.
  for arquivo in scripts/atualizar.sh scripts/atualizar.ps1 scripts/iniciar-oculto.vbs; do
    if [ -f "$tmp/codigo/$arquivo" ]; then
      cp -a "$tmp/codigo/$arquivo" "$DESTINO/$arquivo" 2>>"$LOG_COMANDOS" ||
        registrar "aviso: não consegui trocar $arquivo; fica a versão atual"
    fi
  done

  printf '%s %s\n' "$sha" "$notas" >"$VERSAO_TXT"
  subir_maestro
  registrar "versão trocada para $(curto "$sha") — $notas"
  escrever_estado ok "Atualizado para $(curto "$sha")" "$sha"
  return 0
}

# --- daqui para baixo é o fluxo ---

# Pedido pelo painel: instala exatamente esta versão, sem consultar o canal.
if [ -n "$SHA_PEDIDO" ]; then
  INSTALADO="$(sha_instalado)"
  NOTAS="$(notas_do_commit "$SHA_PEDIDO")"
  [ -z "$NOTAS" ] && NOTAS="atualização pedida no painel"
  registrar "atualização pedida no painel: $(curto "$SHA_PEDIDO")"
  if instalar_sha "$SHA_PEDIDO" "$NOTAS"; then
    if ! verificar; then
      if [ -n "$INSTALADO" ] && [ "$INSTALADO" != "$SHA_PEDIDO" ]; then
        registrar "revertendo para a versão anterior"
        if instalar_sha "$INSTALADO" "versão anterior (revertida)" && verificar; then
          escrever_estado falhou "A versão nova não subiu; voltei para a anterior" "$INSTALADO"
          registrar "revertido: a máquina voltou para a versão anterior"
        else
          escrever_estado falhou "A versão nova não subiu e não consegui reverter" "$SHA_PEDIDO"
          registrar "ATENÇÃO: não consegui reverter. Rode o comando de instalação nesta máquina."
        fi
      fi
    fi
  fi
  exit 0
fi

if [ "$FORCAR" -eq 0 ] && [ -f "$MARCADOR" ] && [ "$(cat "$MARCADOR")" = "$(date '+%Y-%m-%d')" ]; then
  exit 0
fi

CANAL="$(obter_canal || true)"
if [ -z "$CANAL" ]; then
  registrar "sem internet para consultar o canal; tento no próximo logon"
  exit 0
fi

date '+%Y-%m-%d' >"$MARCADOR"

if [ "$(campo_do_canal "$CANAL" ativo)" != "true" ]; then
  registrar "atualização automática desligada no canal"
  exit 0
fi

SHA_APROVADO="$(campo_do_canal "$CANAL" sha)"
NOTAS="$(campo_do_canal "$CANAL" notas)"
INSTALADO="$(sha_instalado)"

if [ -z "$SHA_APROVADO" ] || [ "$SHA_APROVADO" = "$INSTALADO" ]; then
  registrar "já está na versão aprovada ($(curto "$SHA_APROVADO"))"
  exit 0
fi

registrar "versão aprovada: $(curto "$SHA_APROVADO") — $NOTAS"
registrar "instalada aqui:  $(curto "$INSTALADO")"

if instalar_sha "$SHA_APROVADO" "$NOTAS"; then
  if ! verificar; then
    if [ -n "$INSTALADO" ]; then
      registrar "revertendo para a versão anterior"
      if instalar_sha "$INSTALADO" "versão anterior (revertida)" && verificar; then
        registrar "revertido: a máquina voltou para a versão anterior"
      else
        registrar "ATENÇÃO: não consegui reverter. Rode o comando de instalação nesta máquina."
      fi
    else
      registrar "ATENÇÃO: sem versão anterior conhecida para reverter."
    fi
  fi
fi
