import { useAppContexto } from '../contexto/AppContext';

/** Toque no toast para descartar antes do tempo — o alvo já é o próprio card. */
export function Toasts() {
  const { toasts, removerToast } = useAppContexto();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast--${toast.nivel}`}
          onClick={() => removerToast(toast.id)}
        >
          {toast.mensagem}
        </button>
      ))}
    </div>
  );
}
