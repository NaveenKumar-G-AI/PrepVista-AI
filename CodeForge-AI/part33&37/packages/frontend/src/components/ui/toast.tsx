'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'error' | 'warning';

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = React.useCallback((message: string, variant: ToastVariant = 'default', duration = 4000) => {
    const id = Math.random().toString(36).substring(2);
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-start justify-between rounded-lg border p-4 shadow-lg animate-slide-up',
              t.variant === 'success' && 'border-green-400 bg-green-50 text-green-900',
              t.variant === 'error' && 'border-red-400 bg-red-50 text-red-900',
              t.variant === 'warning' && 'border-yellow-400 bg-yellow-50 text-yellow-900',
              t.variant === 'default' && 'border-border bg-background text-foreground'
            )}
          >
            <span className="text-sm">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-4 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}