import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fatura Yazdır" };

export default function YazdirLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 0, padding: 0, background: "#ffffff", minHeight: "100vh" }}>
      {children}
    </div>
  );
}
