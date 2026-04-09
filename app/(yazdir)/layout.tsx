export default function YazdirLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, padding: 0, background: "white" }}>
        {children}
      </body>
    </html>
  );
}
