"use client";
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

// --- TİPLER ---
type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

// --- CONTEXT ---
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue["toast"] {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}

// --- PROVIDER ---
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const toast = useCallback(() => {}, []);
  const contextValue: ToastContextValue = {
    toast: {
      success: useCallback((msg: string) => addToast(msg, "success"), [addToast]),
      error: useCallback((msg: string) => addToast(msg, "error"), [addToast]),
      info: useCallback((msg: string) => addToast(msg, "info"), [addToast]),
    },
  };

  // Suppress unused warning
  void toast;

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* TOAST CONTAINER - Sağ üst köşe */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 420 }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// --- TOAST ITEM ---
function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 2700);
    return () => clearTimeout(timer);
  }, []);

  const config = {
    success: { bg: "bg-emerald-600", icon: "fas fa-check-circle", border: "border-emerald-700" },
    error: { bg: "bg-red-600", icon: "fas fa-exclamation-circle", border: "border-red-700" },
    info: { bg: "bg-blue-600", icon: "fas fa-info-circle", border: "border-blue-700" },
  }[toast.type];

  return (
    <div
      className={`${config.bg} border ${config.border} text-white px-4 py-3 rounded-lg shadow-2xl flex items-start gap-3 pointer-events-auto transition-all duration-300 ${visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
      role="alert"
    >
      <i className={`${config.icon} text-lg mt-0.5 shrink-0 drop-shadow`}></i>
      <p className="text-sm font-bold leading-snug flex-1 break-words">{toast.message}</p>
      <button onClick={onClose} className="text-white/60 hover:text-white shrink-0 ml-1">
        <i className="fas fa-times text-xs"></i>
      </button>
    </div>
  );
}
