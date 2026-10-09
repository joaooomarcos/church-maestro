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
