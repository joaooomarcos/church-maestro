import { z } from 'zod';

/**
 * Controle de convidado: alguém que vai apresentar escaneia o QR code da
 * máquina onde a apresentação está aberta e passa os slides do próprio celular,
 * sem conhecer o PIN da equipe nem mexer no painel.
 */
export const MODOS_CONVIDADO = ['holyrics', 'powerpoint', 'teclado'] as const;

export type ModoConvidado = (typeof MODOS_CONVIDADO)[number];

export const NOMES_MODOS: Record<ModoConvidado, string> = {
  holyrics: 'Holyrics',
  powerpoint: 'PowerPoint',
  teclado: 'Setas do teclado',
};

/** Tudo que o celular do convidado pode pedir ao hub. O hub decide, por link, o que vale. */
export const ACOES_CONVIDADO = [
  'proximo',
  'anterior',
  'mostrarLetra',
  'f8',
  'f9',
  'f10',
  'encerrar',
  'iniciar',
] as const;

export type NomeAcaoConvidado = (typeof ACOES_CONVIDADO)[number];

/** Voltar e Avançar: o que todo link pode, em qualquer modo. */
const ACOES_BASICAS: readonly NomeAcaoConvidado[] = ['proximo', 'anterior'];

/** O que o "controle completo" acrescenta em cada modo. O modo setas nunca ganha nada. */
const ACOES_COMPLETAS: Record<ModoConvidado, readonly NomeAcaoConvidado[]> = {
  holyrics: ['mostrarLetra', 'f8', 'f9', 'f10', 'encerrar'],
  powerpoint: ['iniciar', 'encerrar'],
  teclado: [],
};

/** Ações que derrubam o que está no telão: o celular do convidado pede confirmação. */
export const ACOES_COM_CONFIRMACAO: readonly NomeAcaoConvidado[] = ['encerrar', 'f10'];

/**
 * Regra única de permissão do convidado, usada pelo hub (que é quem vale) e
 * pela tela (só para decidir o que desenhar).
 */
export function acaoPermitida(
  modo: ModoConvidado,
  acao: NomeAcaoConvidado,
  completo: boolean,
): boolean {
  if (ACOES_BASICAS.includes(acao)) return true;
  return completo && ACOES_COMPLETAS[modo].includes(acao);
}

export const entrarConvidadoSchema = z.object({
  token: z.string().min(8),
  pin: z.string().min(1),
});

export const acaoConvidadoSchema = z.object({
  modo: z.enum(MODOS_CONVIDADO),
  acao: z.enum(ACOES_CONVIDADO),
  /** Música da lista de reprodução, para "mostrarLetra". */
  letraId: z.string().min(1).optional(),
  /** F8/F9/F10: liga ou desliga. */
  ativar: z.boolean().optional(),
});

export type AcaoConvidado = z.infer<typeof acaoConvidadoSchema>;

export const estadoConvidadoSchema = z.object({
  dispositivoNome: z.string(),
  /** Nome do link fixo, quando é um. */
  nomeLink: z.string().optional(),
  /** Modos que fazem sentido nesta máquina agora. */
  modos: z.array(z.enum(MODOS_CONVIDADO)).default([]),
  /** Texto curto do que está no ar, para o convidado saber que acertou a máquina. */
  resumo: z.string().default(''),
  /** Link com controle completo. Só nele vêm os dados extras abaixo. */
  completo: z.boolean().default(false),
  holyrics: z
    .object({
      online: z.boolean(),
      noAr: z
        .object({
          id: z.string().optional(),
          nome: z.string(),
          slide: z.number().nullable(),
          totalSlides: z.number().nullable(),
        })
        .nullable(),
    })
    .optional(),
  powerpoint: z
    .object({
      online: z.boolean(),
      emApresentacao: z.boolean(),
      arquivo: z.string().nullable(),
      slide: z.number().nullable(),
      totalSlides: z.number().nullable(),
    })
    .optional(),
});

export type EstadoConvidado = z.infer<typeof estadoConvidadoSchema>;

export const pedidoLinkConvidadoSchema = z.object({
  dispositivo: z.string().min(1),
  /** true gera um token novo e derruba os links antigos daquela máquina. */
  regerar: z.boolean().default(false),
  /**
   * O que a pessoa vai controlar, escolhido pela equipe antes de gerar o QR.
   * Com isso o convidado só vê Avançar e Voltar, sem ter o que escolher.
   */
  modo: z.enum(MODOS_CONVIDADO).optional(),
  /** Controle completo (lista de reprodução, tela preta, prévias...). Desligado por padrão. */
  completo: z.boolean().optional(),
});

export const respostaLinkConvidadoSchema = z.object({
  dispositivoId: z.string(),
  nome: z.string(),
  url: z.string(),
  pin: z.string(),
  modo: z.enum(MODOS_CONVIDADO).optional(),
  completo: z.boolean().default(false),
});

export type RespostaLinkConvidado = z.infer<typeof respostaLinkConvidadoSchema>;

/** Caminho da página que o QR code abre. O token identifica a máquina. */
export function caminhoConvidado(token: string): string {
  return `/convidado/${token}`;
}

/** Tamanho do PIN gerado para os links fixos. */
export const DIGITOS_PIN_LINK_FIXO = 4;

/**
 * Link fixo: não expira, tem PIN próprio e uma versão do PIN. O celular guarda
 * a versão; trocar o PIN gera outra e derruba quem estava conectado.
 */
export const linkFixoConvidadoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1).max(60),
  /** Segredo da URL (/convidado/<token>). */
  token: z.string().min(8),
  dispositivo: z.string().min(1),
  modo: z.enum(MODOS_CONVIDADO),
  completo: z.boolean().default(false),
  // Leitura tolerante: PIN antigo (6 dígitos) é trocado por um de 4 na inicialização do hub.
  pin: z.string().min(1),
  /** Muda a cada troca de PIN; as sessões dos celulares ficam presas a ela. */
  versaoPin: z.string().min(8),
});

export type LinkFixoConvidado = z.infer<typeof linkFixoConvidadoSchema>;

export const arquivoConvidadosSchema = z.object({
  links: z.array(linkFixoConvidadoSchema).default([]),
});

export type ArquivoConvidados = z.infer<typeof arquivoConvidadosSchema>;

export const criarLinkFixoSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  dispositivo: z.string().min(1),
  modo: z.enum(MODOS_CONVIDADO),
  completo: z.boolean().default(false),
});

export const idLinkFixoSchema = z.object({ id: z.string().min(1) });

/** O que a equipe vê de um link fixo: o dado do arquivo mais a URL pronta para o QR. */
export const respostaLinkFixoSchema = linkFixoConvidadoSchema
  .omit({ token: true, versaoPin: true })
  .extend({ url: z.string(), dispositivoNome: z.string() });

export type RespostaLinkFixo = z.infer<typeof respostaLinkFixoSchema>;
