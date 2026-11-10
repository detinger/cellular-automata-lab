import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import clsx from 'clsx';

export function Callout({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'error' | 'success'; title?: string; children: ReactNode }) {
  const Icon = kind === 'warning' ? AlertTriangle : kind === 'error' ? XCircle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={clsx('callout', kind !== 'info' && `callout-${kind}`)} role={kind === 'error' ? 'alert' : undefined}>
      <Icon aria-hidden />
      <div>
        {title && <strong style={{ display: 'block', marginBottom: 2 }}>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Badge({ tone, children }: { tone?: 'primary' | 'accent' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return <span className={clsx('badge', tone && `badge-${tone}`)}>{children}</span>;
}

export function Kpi({ label, value, detail, swatch }: { label: string; value: ReactNode; detail?: ReactNode; swatch?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden />}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {detail !== undefined && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}
const ToastContext = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-kind={t.kind} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFilename = (name: string) =>
  name
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'model';
