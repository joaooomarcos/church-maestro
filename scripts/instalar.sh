#!/usr/bin/env bash
# Instala ou atualiza o Maestro nesta máquina Linux.
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.sh | bash
set -euo pipefail

REPO="joaooomarcos/church-maestro"
BRANCH="${MAESTRO_BRANCH:-main}"
DESTINO="${MAESTRO_DIR:-$HOME/maestro}"
PRESERVAR=(config/hub.json config/agent.json config/devices.json config/scenarios.json data)

TMP="$(mktemp -d)"
BACKUP="$TMP/preservado"

passo() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
falha() { printf '\n\033[31mERRO: %s\033[0m\n' "$1" >&2; exit 1; }
avisar_backup() {
  if [ $? -ne 0 ] && [ -d "$BACKUP" ]; then
    printf '\n\033[33mAs configurações desta máquina estão guardadas em: %s\033[0m\n' "$BACKUP" >&2
  fi
}
trap avisar_backup EXIT

passo "Conferindo o Node.js"
command -v node >/dev/null || falha "Node.js não encontrado. Instale o Node 20+ (seção 0 do guia)."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || falha "Node $(node -v) é antigo demais. Instale o Node 20 ou superior."
echo "Node $(node -v)"
for cmd in curl tar npm; do
  command -v "$cmd" >/dev/null || falha "comando '$cmd' não encontrado."
done

case "$DESTINO" in "" | "/" | "$HOME") falha "pasta de destino inválida: '$DESTINO'" ;; esac
if [ -d "$DESTINO" ] && [ -n "$(ls -A "$DESTINO")" ] &&
  ! grep -qE '"name":[[:space:]]*"maestro"' "$DESTINO/package.json" 2>/dev/null; then
  falha "A pasta $DESTINO já existe e não parece ser uma instalação do Maestro. Mova ou renomeie essa pasta e rode de novo."
fi

# As máquinas da igreja instalam a versão aprovada no canal, não o topo do main.
VERSAO=""
if [ -z "${MAESTRO_BRANCH:-}" ]; then
  VERSAO="$(curl -fsSL --max-time 15 "https://raw.githubusercontent.com/$REPO/main/canal.json?t=$(date +%s)" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);if(j.ativo&&j.sha)console.log(j.sha+" "+(j.notas||""))}catch{}})' || true)"
fi
if [ -z "$VERSAO" ]; then
  VERSAO="$(curl -fsSL "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const c=JSON.parse(s);console.log(c.sha+" "+c.commit.message.split("\n")[0])}catch{}})' || true)"
fi
SHA="${VERSAO%% *}"

passo "Baixando a versão mais nova ($BRANCH)"
mkdir -p "$TMP/codigo"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/${SHA:-refs/heads/$BRANCH}" | tar -xz -C "$TMP/codigo" --strip-components=1

passo "Parando o Maestro, se estiver rodando"
if command -v systemctl >/dev/null && systemctl --user is-active --quiet maestro-agent 2>/dev/null; then
  systemctl --user stop maestro-agent
  echo "parado: maestro-agent"
fi
pkill -f 'packages/(hub|agent)/dist/index.js' || true

if [ -d "$DESTINO" ]; then
  passo "Guardando as configurações desta máquina"
  for item in "${PRESERVAR[@]}"; do
    if [ -e "$DESTINO/$item" ]; then
      mkdir -p "$BACKUP/$(dirname "$item")"
      cp -a "$DESTINO/$item" "$BACKUP/$item"
      echo "guardado: $item"
    fi
  done
  rm -rf "$DESTINO"
fi

passo "Instalando em $DESTINO"
mkdir -p "$DESTINO"
cp -a "$TMP/codigo/." "$DESTINO/"
if [ -d "$BACKUP" ]; then
  cp -a "$BACKUP/." "$DESTINO/"
fi

cd "$DESTINO"

passo "Instalando dependências (npm ci)"
npm ci --no-audit --no-fund || falha "npm ci falhou. Confira a internet desta máquina e rode o comando de novo."

passo "Compilando (npm run build)"
npm run build || falha "A compilação falhou. Copie as mensagens acima e mande para quem mantém o Maestro."

if [ -n "$VERSAO" ]; then
  printf '%s\n' "$VERSAO" >versao.txt
fi

if [ ! -f config/agent.json ]; then
  passo "Configurando esta máquina"
  echo "O assistente procura o hub e pergunta o que esta máquina faz."
  # Rodando por "curl | bash" a entrada padrão é o cano; /dev/tty devolve o teclado.
  if [ -e /dev/tty ] && [ -r /dev/tty ]; then
    npm run setup </dev/tty || echo "AVISO: o assistente não terminou. Rode 'npm run setup' nesta pasta."
  else
    echo "AVISO: sem terminal aqui. Rode 'npm run setup' nesta pasta para configurar."
  fi
fi

if [ -f config/agent.json ] && command -v systemctl >/dev/null; then
  passo "Subindo o agente"
  mkdir -p "$HOME/.config/systemd/user"
  cat >"$HOME/.config/systemd/user/maestro-agent.service" <<UNIT
[Unit]
Description=Agente Maestro
After=network.target

[Service]
Type=simple
WorkingDirectory=$DESTINO
ExecStart=$(command -v node) $DESTINO/packages/agent/dist/index.js
Restart=on-failure

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable maestro-agent >/dev/null 2>&1 || true
  systemctl --user restart maestro-agent || echo "AVISO: não consegui subir o serviço; rode 'npm run start:agent' para ver o erro."
  # Sem linger o serviço cai quando a pessoa faz logout.
  loginctl enable-linger "$USER" >/dev/null 2>&1 || true
  echo "serviço maestro-agent ativado"

  # Atualização é decisão de quem opera, tomada na aba Versões do painel — nada
  # de descobrir uma versão nova sozinho no domingo de manhã.
  if [ -f "$HOME/.config/systemd/user/maestro-update.service" ]; then
    systemctl --user disable --now maestro-update >/dev/null 2>&1 || true
    rm -f "$HOME/.config/systemd/user/maestro-update.service"
    systemctl --user daemon-reload
    echo "serviço maestro-update removido (agora quem atualiza é o painel)"
  fi
fi

rm -rf "$TMP"

if [ -n "$VERSAO" ]; then
  passo "Pronto! Versão: ${VERSAO:0:7} ${VERSAO#* }"
else
  passo "Pronto!"
fi
echo "Pasta: $DESTINO"
echo
echo "Reconfigurar:     cd $DESTINO && npm run setup"
echo "Ver o log:        journalctl --user -u maestro-agent -n 30"
echo "Atualizações:     pela aba Versões do painel"
echo "(se o terminal estava dentro da pasta antiga, rode 'cd $DESTINO' antes)"
echo
echo "Para atualizar depois, rode o mesmo comando de instalação."
