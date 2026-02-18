'use client';

import { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

const typeStyles = {
  success: 'border-green-900/50 bg-green-900/20 text-safe-green',
  error: 'border-red-900/50 bg-red-900/20 text-safe-red',
  info: 'border-blue-900/50 bg-blue-900/20 text-safe-blue',
  warning: 'border-yellow-900/50 bg-yellow-900/20 text-safe-yellow',
};

const icons = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={`
        ${typeStyles[type]}
        fixed bottom-8 right-8 z-50
        flex items-center gap-3 rounded-xl border px-6 py-4 shadow-2xl
        transition-all duration-300
        ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
    >
      <span className="text-xl">{icons[type]}</span>
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onClose, 300);
        }}
        className="ml-2 text-gray-500 transition-colors hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: ToastType }>>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const ToastContainer = () => (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </>
  );

  return { showToast, ToastContainer };
}
