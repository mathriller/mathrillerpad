import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(() => {});

/** 간단한 토스트 알림: const toast = useToast(); toast('저장됨'); toast('실패', 'error'); */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, message, type }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`animate-pop pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              t.type === 'error' ? 'bg-rose-600' : t.type === 'info' ? 'bg-slate-700' : 'bg-emerald-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
