#!/bin/bash

# Script para gerar PDFs dos checklists
# Uso: ./gerar_pdf.sh
# Dependências: Node.js 20+, Google Chrome instalado

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ ! -d "node_modules" ]; then
  echo "Instalando dependências (puppeteer-core)..."
  npm install --silent puppeteer-core
  if [ $? -ne 0 ]; then
    echo "Erro ao instalar dependências. Verifique sua conexão e Node.js."
    exit 1
  fi
fi

echo "Gerando PDFs..."
node gerar_pdf.js
