export type EstadoSemaforo = 'online' | 'offline' | 'nao-configurado';

const ROTULOS: Record<EstadoSemaforo, string> = {
  online: 'Online',
  offline: 'Offline',
  'nao-configurado': 'Não configurado',
};

export function Semaforo({ estado }: { estado: EstadoSemaforo }) {
  return (
    <span className={`semaforo semaforo--${estado}`} role="status" aria-label={ROTULOS[estado]} title={ROTULOS[estado]}>
      <span className="semaforo__ponto" aria-hidden="true" />
    </span>
  );
}
