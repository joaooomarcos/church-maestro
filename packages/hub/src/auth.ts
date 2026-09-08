import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ROTAS, loginSchema, type ConfigHub, type ErroApi } from '@maestro/shared';

export const NOME_COOKIE_SESSAO = 'maestro_sessao';
const TRINTA_DIAS_S = 60 * 60 * 24 * 30;

/** Rotas acessíveis sem sessão: saúde, login/sessão/logout, e o registro de agentes (usa token próprio). */
const ROTAS_PUBLICAS = new Set<string>([
  ROTAS.saude,
  ROTAS.login,
  ROTAS.sessao,
  ROTAS.logout,
  ROTAS.registrarAgente,
]);

function caminhoDaRota(req: FastifyRequest): string {
  const doRoteador = req.routeOptions?.url;
  if (doRoteador) return doRoteador;
  const semQuery = req.url.split('?')[0];
  return semQuery ?? req.url;
}

/** Estáticos e a SPA vivem fora de `/api/` — passam direto; o resto exige sessão (ou está na lista pública). */
function ehRotaPublica(caminho: string): boolean {
  if (ROTAS_PUBLICAS.has(caminho)) return true;
  return !caminho.startsWith('/api/');
}

/** Compara em tempo constante: hasheia os dois lados para igualar o tamanho do buffer antes do `timingSafeEqual`. */
function pinConfere(informado: string, esperado: string): boolean {
  const a = createHash('sha256').update(informado).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

export function sessaoValida(req: FastifyRequest): boolean {
  const bruto = req.cookies[NOME_COOKIE_SESSAO];
  if (!bruto) return false;
  const resultado = req.unsignCookie(bruto);
  return resultado.valid;
}

/** Registra o hook de autenticação global e as rotas de login/sessão/logout. Plugins (cookie etc.) são de `index.ts`. */
export async function registrarAutenticacao(app: FastifyInstance, config: ConfigHub): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (ehRotaPublica(caminhoDaRota(req))) return;
    if (!sessaoValida(req)) {
      const corpo: ErroApi = { erro: 'nao_autenticado', mensagem: 'Faça login para continuar.' };
      return reply.code(401).send(corpo);
    }
    return undefined;
  });

  app.post(
    ROTAS.login,
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const corpo = loginSchema.safeParse(req.body);
      if (!corpo.success) {
        const erro: ErroApi = { erro: 'pin_invalido', mensagem: 'Informe o PIN.' };
        return reply.code(400).send(erro);
      }
      if (!pinConfere(corpo.data.pin, config.pin)) {
        const erro: ErroApi = { erro: 'pin_incorreto', mensagem: 'PIN incorreto.' };
        return reply.code(401).send(erro);
      }
      const valorSessao = randomBytes(16).toString('hex');
      void reply.cookie(NOME_COOKIE_SESSAO, valorSessao, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: TRINTA_DIAS_S,
      });
      return reply.send({ autenticado: true });
    },
  );

  app.post(ROTAS.logout, async (_req, reply) => {
    void reply.clearCookie(NOME_COOKIE_SESSAO, { path: '/' });
    return reply.send({ autenticado: false });
  });

  app.get(ROTAS.sessao, async (req, reply) => {
    return reply.send({ autenticado: sessaoValida(req) });
  });
}
