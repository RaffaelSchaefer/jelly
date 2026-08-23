import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const ToastContext = createContext<(message: string, tone?: "success" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const show = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl ${toast.tone === "error" ? "border-danger bg-danger text-white" : "border-primary bg-primary text-white"}`}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
