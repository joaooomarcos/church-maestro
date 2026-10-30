---
name: publicar-versao
description: Conduz o ciclo de release do Maestro (preparar o número, publicar no canal aprovado e atualizar as máquinas da igreja), sempre pedindo confirmação do João antes de push, tag ou mudança no canal.json.
disable-model-invocation: true
---

# Publicar uma versão do Maestro

Baseado em `scripts/publicar.mjs`, `scripts/atualizar-agora.mjs`, `.github/workflows/publicar.yml`, `canal.json` e `docs/instalacao.md` (seção 5). Onde algo não está claro nos arquivos, o texto diz **verificar**.

## Regras de versão (x.y.z)

- Começou em **0.1.0**. Última liberada ao escrever isto: 0.10.0 (conferir em `canal.json`).
- **Funcionalidade nova sobe o do meio** (0.10.0 → 0.11.0). **Correção sobe o último** (0.10.0 → 0.10.1). O primeiro número (`major`) só sobe se o João pedir.
- O número mora no `package.json` da raiz e de `packages/shared`, `hub`, `agent`, `web`, mais o `package-lock.json` (o `npm ci` confere). O script troca todos juntos.
- `canal.json` guarda a versão aprovada (`versao`, `sha`, `notas`, `liberadoEm`, `ativo`) e o histórico `versoes` (número, commit, notas, data; máximo 40). O painel (Sistema > Versões) lê daí.
- Mensagens de commit seguem o padrão do histórico: `Versão x.y.z` (troca do número) e `Libera a versão x.y.z para as máquinas da igreja` (canal).

## Pré-checagens (antes de qualquer comando que grave)

1. `git status`: o script **aborta** se houver qualquer mudança não commitada. Conferir com o João se o que está pendente é o esperado e se deve entrar na versão (commit de trabalho) antes. Nunca commitar por conta própria.
2. `npm run typecheck`
3. `npm test`
4. `npm run build` (o CI repete build + test num Windows antes de liberar).
5. Conferir `git log --oneline` desde a última versão: o script se recusa a publicar sem commit novo (ignora os que começam com `Libera `, `Versão <n>` e `Desliga a oferta`). As notas padrão são esses assuntos, cortados em 160 caracteres. Sugerir `--notas "texto"` se ficarem ruins.
6. Se houver mudança que exija cuidado ao atualizar (config, migração), lembrar de anotar em `docs/instalacao.md` antes (como foi feito no aviso da 0.10 para 0.11).

## Dois caminhos de publicação

### A) Pelo main com o GitHub (padrão do trabalho em branch)

1. Na branch: `npm run versao -- funcionalidade` (ou `correcao`). Isso é `publicar.mjs --preparar`: troca o número em todos os pacotes e lockfile, faz o commit `Versão x.y.z` com as notas no corpo e **para**. Não cria tag, não mexe no canal, não faz push.
2. Quando a branch volta para o main (merge/push = decisão do João), `.github/workflows/publicar.yml` roda (ignora mudanças só em `**.md`, `docs/**`, `.github/**`):
   - job `conferir` (Windows): `npm ci`, `npm run build`, `npm test`. Pulado se o commit do push começa com `Libera ` ou `Desliga a oferta`.
   - job `publicar` (Ubuntu): se o `package.json` traz número ainda não liberado, publica esse; se já foi liberado, conta como correção e sobe o último. Executa `node scripts/publicar.mjs`, que commita no main, cria a tag e atualiza o canal.
   - Também há "Run workflow" manual com tipo `automatico`, `correcao`, `funcionalidade` ou `voltar` (este exige `versao` já liberada), mais `notas` opcional.

### B) Pelo terminal (`npm run publicar`)

`npm run publicar -- funcionalidade | correcao | <x.y.z>`. Ordem exata do script:

1. Aborta se `git status --porcelain` não estiver vazio.
2. Lê `canal.json` e a versão atual do `package.json`.
3. Calcula a nova versão (`funcionalidade`/`minor` = meio; `correcao`/`patch` = último; `major` = primeiro; ou um `x.y.z` explícito, que não pode ser menor que o atual). Aborta se a versão já foi liberada ou se não há commits novos desde a última.
4. Se a versão difere da atual: grava o número em todos os `package.json` + lock e commita `Versão x.y.z`.
5. Cria a tag anotada `vX.Y.Z` (local) apontando para o commit de versão (`sha` = HEAD).
6. Atualiza `canal.json` (ativo, versao, sha, notas, liberadoEm, entrada no topo de `versoes`) e commita `Libera a versão x.y.z para as máquinas da igreja`.
7. **`git push origin HEAD`** e **`git push origin refs/tags/vX.Y.Z`**.
8. Imprime anterior/agora e lembra que nenhuma máquina atualiza sozinha.

Variações:
- `npm run publicar -- <x.y.z já liberada>`: **volta** (ou avança) as máquinas; não cria versão nem tag, só reescreve `canal.json`, commita e dá push.
- `npm run publicar -- --desligar`: `ativo:false`, commit `Desliga a oferta de versão nova` e push; o instalador volta a usar o topo do main.

Observação: o push do commit "Libera..." no main não dispara nova publicação (o workflow o ignora).

## Atualizar as máquinas da igreja

- **Nada é aplicado sozinho.** Quem atualiza é o João, no painel: **Sistema > Versões** (menu), cartão da máquina, botão **Atualizar de X para Y**; conferir que volta **verde/Atualizada** antes da próxima. **Uma máquina de cada vez**; a máquina marcada como **painel** (roda o hub) por último ou com cuidado (ver `docs/instalacao.md` seção 5).
- Máquinas só ficam ligadas em dia de culto: a atualização depende de estarem ligadas.
- Log na máquina: `Get-Content ~\maestro\data\atualizacao.log -Tail 20`; versão instalada em `maestro\versao.txt`.
- `npm run atualizar` (`scripts/atualizar-agora.mjs`) roda o atualizador **localmente**, na máquina onde é executado, sem esperar o logon (`atualizar.ps1 -Forcar` no Windows, `atualizar.sh --forcar` no Linux). **Não** atualiza as máquinas da igreja a distância. Só rodar na própria máquina e com confirmação.

## NUNCA sem confirmação explícita do João

- `git push` de qualquer tipo, criar/enviar **tags**, `npm run publicar` (ele já faz commit, tag e push), `--desligar`, "Run workflow".
- Editar `canal.json` (à mão ou via script) ou qualquer coisa que **libere para as máquinas** ou mude a versão que o instalador oferece.
- Aplicar atualização em máquina (painel ou `npm run atualizar`).
- Commitar mudanças pendentes ou trocar o número de versão sem ele pedir. `npm run versao` só depois de confirmar o tipo (funcionalidade ou correção).
- Antes de publicar, mostrar: versão atual, versão nova, notas e os commits incluídos, e esperar o "sim".

## Se algo der errado

- Registrar em `docs/instalacao.md` (seção de problemas, ao lado de "A atualização não terminou"): sintoma, causa, solução e a partir de qual versão está corrigido. Todo aprendizado vai para a doc.
- Se o script falhar depois de commitar mas antes do push: o estado local tem commits/tag sem estar no remoto. **Verificar** (`git log`, `git tag`) e decidir com o João antes de refazer; não apagar tag nem dar reset sozinho.
- Para recuar as máquinas de uma versão ruim: `npm run publicar -- <versão anterior liberada>` (confirmar antes).
