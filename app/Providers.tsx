"use client";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/app/lib/toast";
import AppWrapper from "@/app/AppWrapper";

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isYazdir = pathname?.startsWith("/faturalar/yazdir");

  return (
    <ToastProvider>
      {isYazdir ? children : <AppWrapper>{children}</AppWrapper>}
    </ToastProvider>
  );
}
