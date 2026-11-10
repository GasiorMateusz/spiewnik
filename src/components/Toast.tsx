import React, { useEffect } from 'react';
import { XIcon } from './Icons';

export interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  theme?: 'dark' | 'light';
  autoCloseMs?: number;
}

/**
 * Non-intrusive Toast notification component (REQ-PWA-2).
 * Displays PWA update prompt ("Nowe piosenki pobrane" + "Odśwież") and offline status notifications.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onClose,
  theme = 'dark',
  autoCloseMs,
}: ToastProps): React.JSX.Element {
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!autoCloseMs || autoCloseMs <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, autoCloseMs);
    return () => clearTimeout(timer);
  }, [autoCloseMs, onClose]);

  return (
    <aside
      role="alert"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] p-3 sm:p-4 rounded-xl border shadow-2xl flex items-center justify-between gap-3 transition-all animate-bounce-in select-none ${
        isDark
          ? 'bg-neutral-900 border-neutral-700 text-neutral-100 shadow-black/60'
          : 'bg-white border-neutral-300 text-neutral-900 shadow-neutral-400/40'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
        <p className="text-xs sm:text-sm font-medium leading-tight truncate">{message}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 transition cursor-pointer shadow-sm"
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij powiadomienie"
          title="Zamknij"
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            isDark
              ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
