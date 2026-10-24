import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { Check, CircleAlert, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
interface ToastMessage { id: number; text: string; tone: ToastTone; }
interface ToastApi { push: (text: string, tone?: ToastTone) => void; }
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const dismiss = useCallback((id: number) => setMessages((items) => items.filter((item) => item.id !== id)), []);
  const push = useCallback((text: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random();
    setMessages((items) => [...items, { id, text, tone }]);
    window.setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);
  return <ToastContext.Provider value={value}>{children}<div className="toast-stack" aria-live="polite" aria-relevant="additions text">{messages.map((message) => {
    const Icon = message.tone === 'success' ? Check : message.tone === 'error' ? CircleAlert : Info;
    return <div key={message.id} className={`toast toast-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}><Icon size={16} /><span>{message.text}</span><button type="button" className="toast-close" onClick={() => dismiss(message.id)} aria-label="Dismiss message"><X size={14} /></button></div>;
  })}</div></ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within ToastProvider.');
  return value;
}
