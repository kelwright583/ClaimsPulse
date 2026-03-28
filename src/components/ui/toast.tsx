'use client';

import { createContext, useCallback, useContext, useState } from 'react';

interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const iconColor =
    toast.type === 'error' ? '#991B1B' :
    toast.type === 'info'  ? '#1E5BC6' :
    '#065F46';

  const iconPath =
    toast.type === 'error'
      ? 'M6 18 18 6M6 6l12 12'
      : 'm4.5 12.75 6 6 9-13.5';

  return (
    <div
      className="toast pointer-events-auto"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: '#0D2761',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 500,
        padding: '10px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 16px rgba(13,39,97,0.2)',
        animation: 'toast-in 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)',
        maxWidth: '340px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          background: '#F5A800',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width="10"
          height="10"
          fill="none"
          viewBox="0 0 24 24"
          stroke={iconColor}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={iconPath} />
        </svg>
      </span>
      {toast.message}
    </div>
  );
}
