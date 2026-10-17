"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { Check, CircleAlert, X } from "lucide-react";
import { Button } from "./button";
import { Toast, ToastDescription, ToastProvider as RadixToastProvider, ToastTitle, ToastViewport } from "./toast";

type ToastMessage = { id: string; title: string; description?: string; type: "success" | "error" };
interface ToastAPI { show: (message: Omit<ToastMessage, "id">) => void }
const ToastContext = createContext<ToastAPI | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("ToastProvider is missing.");
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const show = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    setMessages((items) => [...items.slice(-2), { ...message, id }]);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return <ToastContext.Provider value={value}>
    <RadixToastProvider swipeDirection="right">
      {children}
      {messages.map((message) => <Toast key={message.id} open onOpenChange={(open) => { if (!open) setMessages((items) => items.filter((item) => item.id !== message.id)); }} duration={Infinity} className={message.type === "error" ? "toast-danger" : "toast-success"}>
        <span className="toast-icon" aria-hidden>{message.type === "success" ? <Check /> : <CircleAlert />}</span>
        <div className="toast-copy"><ToastTitle>{message.title}</ToastTitle>{message.description && <ToastDescription>{message.description}</ToastDescription>}</div>
        <ToastPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Dismiss notification"><X aria-hidden /></Button></ToastPrimitive.Close>
      </Toast>)}
      <ToastViewport />
    </RadixToastProvider>
  </ToastContext.Provider>;
}
