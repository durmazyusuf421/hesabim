"use client";
import { ToastProvider } from "@/app/lib/toast";
import AppWrapper from "@/app/AppWrapper";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppWrapper>{children}</AppWrapper>
    </ToastProvider>
  );
}
