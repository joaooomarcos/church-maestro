import { useAppContexto } from '../contexto/AppContext';
import { TecladoPin } from './TecladoPin';

export function TelaPin() {
  const { entrar } = useAppContexto();

  return (
    <div className="tela-pin">
      <h1 className="tela-pin__titulo">Maestro</h1>
      <p className="tela-pin__subtitulo">Digite o PIN da equipe</p>
      <TecladoPin
        aoCompletar={async (pin) => {
          const resultado = await entrar(pin);
          return resultado.ok ? null : (resultado.mensagem ?? 'PIN incorreto.');
        }}
      />
    </div>
  );
}
