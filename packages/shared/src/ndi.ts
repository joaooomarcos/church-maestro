import { z } from 'zod';
import type { Monitor } from './agente.js';
import type { DispositivoConfig } from './dispositivos.js';

/**
 * NDI: a prova real do teste compara o que a máquina de origem envia (NDI
 * Screen Capture) com o que a janela do Studio Monitor mostra no destino. Para
 * isso o painel precisa saber, por máquina, qual monitor cada coisa usa.
 */

/** Uma janela do Studio Monitor e o monitor onde ela aparece. */
export interface JanelaNdiConfig {
  porta: number;
  /** id do monitor; null = ainda não informado. */
  monitor: string | null;
}

/** Uma máquina em Ajustes › NDI. */
export interface MaquinaNdiConfig {
  id: string;
  nome: string;
  /** O agente respondeu; sem ele não há como listar os monitores. */
  online: boolean;
  /** null = o agente não informou os monitores (antigo ou offline). */
  monitores: Monitor[] | null;
  /** Monitor que o NDI Screen Capture envia; null = o principal. */
  envioMonitor: string | null;
  /** Vazio quando a máquina não tem o Studio Monitor. */
  janelas: JanelaNdiConfig[];
}

export interface RespostaNdiConfig {
  maquinas: MaquinaNdiConfig[];
}

export const pedidoSalvarNdiSchema = z.object({
  dispositivo: z.string().min(1),
  /** Porta (como texto) → monitor; null limpa. Portas ausentes ficam como estão. */
  janelas: z.record(z.string(), z.string().min(1).nullable()).optional(),
  /** Monitor do Screen Capture; null volta para o principal. */
  envioMonitor: z.string().min(1).nullable().optional(),
});

export type PedidoSalvarNdi = z.infer<typeof pedidoSalvarNdiSchema>;

function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * O NDI Screen Capture nomeia a fonte "NOME-DA-MAQUINA (Screen Capture)". Devolve
 * a parte da máquina, ou null se o nome não segue esse padrão.
 */
export function maquinaDaFonteNdi(fonte: string): string | null {
  const achou = /^(.+?)\s*\(([^)]*)\)\s*$/.exec(fonte.trim());
  const nome = (achou ? achou[1] : fonte)?.trim();
  return nome ? nome : null;
}

/**
 * Descobre qual máquina do painel envia a fonte: compara o nome da fonte com o
 * id, o nome cadastrado e o hostname que o agente informou (ignora maiúsculas,
 * acentos e pontuação). null = a origem não é uma máquina do painel.
 */
export function dispositivoDaFonteNdi(
  fonte: string,
  dispositivos: DispositivoConfig[],
  hostname: (dispositivoId: string) => string | undefined = () => undefined,
): DispositivoConfig | null {
  const nome = maquinaDaFonteNdi(fonte);
  if (!nome) return null;
  const alvo = chave(nome);
  if (!alvo) return null;
  return (
    dispositivos.find((d) => {
      const candidatos = [d.id, d.nome, hostname(d.id)].filter((c): c is string => Boolean(c));
      return candidatos.some((c) => chave(c) === alvo);
    }) ?? null
  );
}

/** Valor que o Studio Monitor usa para "nenhuma fonte". */
export const FONTE_NDI_NENHUMA = '';

/**
 * Extrai nomes de fonte NDI de uma resposta de formato incerto. Aceita:
 * lista de strings, lista de objetos com `name`, ou objeto cujas chaves
 * agrupam essas listas (`ndi_sources`, `sources`, ...).
 */
export function extrairFontes(dados: unknown): string[] {
  const encontradas: string[] = [];

  const coletar = (valor: unknown): void => {
    if (typeof valor === 'string') {
      if (valor.length > 0) encontradas.push(valor);
      return;
    }
    if (Array.isArray(valor)) {
      for (const item of valor) coletar(item);
      return;
    }
    if (valor !== null && typeof valor === 'object') {
      const obj = valor as Record<string, unknown>;
      const nome = obj['name'] ?? obj['ndi_name'] ?? obj['source_name'];
      if (typeof nome === 'string' && nome.length > 0) {
        encontradas.push(nome);
      }
    }
  };

  if (Array.isArray(dados)) {
    coletar(dados);
  } else if (dados !== null && typeof dados === 'object') {
    const obj = dados as Record<string, unknown>;
    // Só as chaves que sabidamente contêm fontes NDI — displays e saídas de
    // áudio também vêm nessa resposta e não devem virar opção de exibição.
    for (const chave of ['ndi_sources', 'sources', 'NDI_sources', 'ndi']) {
      if (chave in obj) coletar(obj[chave]);
    }
    if (encontradas.length === 0) coletar(obj['items']);
  }

  return [...new Set(encontradas)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Lê a fonte selecionada de uma resposta de /v1/configuration. */
export function extrairFonteAtual(dados: unknown): string | null {
  if (dados === null || typeof dados !== 'object') return null;
  const obj = dados as Record<string, unknown>;
  const bruto = obj['NDI_source'] ?? obj['ndi_source'] ?? obj['source'];
  if (typeof bruto !== 'string' || bruto === FONTE_NDI_NENHUMA) return null;
  return bruto;
}
