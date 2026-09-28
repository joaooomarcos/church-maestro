import { useAppContexto } from '../contexto/AppContext';
import { Icone } from './Icone';

function hora(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Os avisos dos cenários ("faltam 10 minutos...") no painel. Ao contrário do
 * toast, não somem sozinhos: quem estava longe do celular ainda vê ao voltar.
 */
export function AlertasEquipe() {
  const { alertas, fecharAlerta } = useAppContexto();
  const alerta = alertas[0];
  if (!alerta) return null;

  return (
    <div className="alerta-equipe" role="alertdialog" aria-labelledby="alerta-equipe-texto">
      <div className="alerta-equipe__caixa">
        <p className="alerta-equipe__cabecalho">
          <Icone nome="relogio" tamanho={18} />
          Aviso das {hora(alerta.ts)}
          {alertas.length > 1 ? <span className="alerta-equipe__fila">+{alertas.length - 1}</span> : null}
        </p>
        <p id="alerta-equipe-texto" className="alerta-equipe__texto">
          {alerta.texto}
        </p>
        <button type="button" className="botao-acao alerta-equipe__botao" onClick={() => fecharAlerta(alerta.id)}>
          Ok, visto
        </button>
      </div>
    </div>
  );
}
