import type { ComandoPpt, StatusPpt } from '@maestro/shared';

/**
 * Ponte com o PowerPoint. No Windows é COM via PowerShell; nos outros sistemas
 * é uma implementação inerte, para o agente rodar igual no Linux do som e no
 * Mac de desenvolvimento.
 */
export interface PontePowerPoint {
  /** false em plataformas sem PowerPoint — as rotas respondem 501. */
  readonly disponivel: boolean;
  status(): Promise<StatusPpt>;
  executar(comando: ComandoPpt): Promise<StatusPpt>;
  /**
   * Janela em primeiro plano na máquina. Mora aqui porque esta ponte é o único
   * canal do agente com a área de trabalho do Windows — não tem a ver com
   * PowerPoint. Devolve null quando não dá para saber.
   */
  janelaEmPrimeiroPlano(): Promise<{ processo: string; titulo: string } | null>;
  encerrar(): Promise<void>;
}

/** Erro com mensagem já pronta para a tela. */
export class ErroPowerPoint extends Error {
  constructor(
    override readonly message: string,
    readonly causaTecnica?: string,
  ) {
    super(message);
    this.name = 'ErroPowerPoint';
  }
}

export const PPT_INDISPONIVEL: StatusPpt = {
  emApresentacao: false,
  slide: null,
  totalSlides: null,
  arquivo: null,
};
