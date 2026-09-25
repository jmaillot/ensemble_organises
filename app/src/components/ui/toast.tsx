import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/shared/icon';

export type ToastTone = 'default' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneIcon: Record<ToastTone, IconName> = {
  default: 'info',
  success: 'checkCircle',
  error: 'info',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = 'default') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-[22px] bottom-[22px] z-70 flex flex-col items-end gap-2 max-[650px]:inset-x-[15px] max-[650px]:bottom-[92px] max-[650px]:items-stretch"
        role="region"
        aria-label="Notifications de l’application"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-[12px] px-4 py-3 text-xs text-surface shadow-[var(--shadow-md)]',
              item.tone === 'error' ? 'bg-coral' : 'bg-fg',
            )}
          >
            <Icon name={toneIcon[item.tone]} size="sm" />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast doit être utilisé dans un ToastProvider.');
  return context.toast;
}
