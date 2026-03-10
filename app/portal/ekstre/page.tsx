"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function MusteriEkstre() {
  const pathname = usePathname();
  const [aktifMusteri, setAktifMusteri] = useState<any>(null);
  
  const [toptanciBakiyeleri, setToptanciBakiyeleri] = useState<any[]>([]);
  const [seciliCariHesapId, setSeciliCariHesapId] = useState<string>("");
  const [hareketler, setHareketler] = useState<any[]>([]);

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    if (!sirketStr) { window.location.href = "/login"; return; }
    const sirket = JSON.parse(sirketStr);
    if (sirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
    setAktifMusteri(sirket);
  }, []);

  useEffect(() => { if (aktifMusteri) bakiyeleriGetir(); }, [aktifMusteri]);

  async function bakiyeleriGetir() {
      const { data: cariKartlar } = await supabase.from("firmalar").select("*").eq("bagli_sirket_id", aktifMusteri.id);
      if (cariKartlar && cariKartlar.length > 0) {
          const toptanciIdler = cariKartlar.map(c => c.sahip_sirket_id);
          const { data: toptancilar } = await supabase.from("sirketler").select("id, isletme_adi").in("id", toptanciIdler);
          const birlesik = cariKartlar.map(cari => {
              const toptanci = toptancilar?.find(t => t.id === cari.sahip_sirket_id);
              return { ...cari, toptanci_adi: toptanci?.isletme_adi };
          });
          setToptanciBakiyeleri(birlesik);
      }
  }

  useEffect(() => {
      async function hareketleriGetir() {
          if (!seciliCariHesapId) { setHareketler([]); return; }
          const { data } = await supabase.from("cari_hareketler").select("*").eq("firma_id", seciliCariHesapId).order('tarih', { ascending: true }).order('id', { ascending: true });
          setHareketler(data || []);
      }
      hareketleriGetir();
  }, [seciliCariHesapId]);

  const seciliToptanciAd = toptanciBakiyeleri.find(t => t.id.toString() === seciliCariHesapId)?.toptanci_adi || "-";
  const cikisYap = () => { localStorage.removeItem("aktifSirket"); window.location.href = "/login"; };

  if (!aktifMusteri) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

  let yuruyenBakiye = 0;

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800">
        
      {/* SOL MENÜ */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden">
        <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center">
            <span className="text-cyan-500 text-[10px] uppercase mb-0.5">Müşteri Portalı</span>
            <span className="text-xs truncate w-full">{aktifMusteri.isletme_adi}</span>
        </div>
        <nav className="flex-1 py-4 space-y-1">
  {/* YENİ POS VE STOK SİSTEMİ */}
  <Link href="/portal/pos" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-barcode w-6"></i> Hızlı Satış (POS)</Link>
  <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Market Stokları</Link>
  
  {/* B2B VE MUHASEBE */}
  <Link href="/portal" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
  <Link href="/portal/siparisler" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/siparisler" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
  <Link href="/portal/kasa" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/kasa" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-cash-register w-6"></i> Kasa & Nakit Akışı</Link>
  <Link href="/portal/veresiye" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/veresiye" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-book w-6"></i> Veresiye Defteri</Link>
</nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <Link href="/ayarlar" className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded hover:text-white`}><i className="fas fa-cog w-6"></i> Ayarlar</Link>
          <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
          
          {/* ÜST ARAÇ ÇUBUĞU */}
          <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0 print:hidden">
              <button onClick={() => window.print()} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm">
                  <i className="fas fa-print text-slate-600 mr-2"></i> Ekstre Yazdır
              </button>
          </div>

          {/* TEDARİKÇİ SEÇİM ÇUBUĞU */}
          <div className="h-12 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4 print:hidden">
              <span className="text-xs font-bold text-slate-600 uppercase w-32">Tedarikçi Seçimi</span>
              <select 
                  value={seciliCariHesapId} 
                  onChange={(e) => setSeciliCariHesapId(e.target.value)}
                  className="flex-1 max-w-lg text-sm px-3 py-1.5 border border-slate-300 rounded shadow-inner outline-none focus:border-cyan-500 font-bold text-slate-700"
              >
                  <option value="">-- Ekstresini Almak İstediğiniz Tedarikçiyi Seçin --</option>
                  {toptanciBakiyeleri.map(t => <option key={t.id} value={t.id}>{t.toptanci_adi}</option>)}
              </select>
          </div>

          {/* EKSTRE TABLOSU (DATA GRID) */}
          <div className="flex-1 overflow-auto bg-white relative">
              <div className="print:block hidden mb-4 border-b-2 border-black pb-2 pt-4 px-4">
                  <h2 className="text-xl font-bold uppercase">{seciliToptanciAd}</h2>
                  <h3 className="text-lg font-semibold mt-1">MÜŞTERİ HESAP EKSTRESİ (SURET)</h3>
                  <p className="text-sm font-bold mt-2">Müşteri: {aktifMusteri.isletme_adi}</p>
              </div>

              <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm print:bg-white print:border-black">
                      <tr className="text-[11px] font-bold text-slate-700 print:text-black">
                          <th className="p-2 border-r border-slate-300 w-24">Tarih</th>
                          <th className="p-2 border-r border-slate-300 w-32">Evrak No</th>
                          <th className="p-2 border-r border-slate-300 w-48">İşlem Türü</th>
                          <th className="p-2 border-r border-slate-300">Açıklama</th>
                          <th className="p-2 border-r border-slate-300 w-32 text-right">Borç (TL)</th>
                          <th className="p-2 border-r border-slate-300 w-32 text-right">Alacak (TL)</th>
                          <th className="p-2 w-32 text-right">Kalan Bakiye</th>
                      </tr>
                  </thead>
                  <tbody>
                      {!seciliCariHesapId ? (
                          <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest print:hidden">LÜTFEN ÜSTTEN BİR TEDARİKÇİ SEÇİN</td></tr>
                      ) : hareketler.length === 0 ? (
                          <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">HESAP HAREKETİ BULUNMUYOR</td></tr>
                      ) : (
                          hareketler.map((h, index) => {
                              const borc = Number(h.borc) || 0; // Bize yazılan borç
                              const alacak = Number(h.alacak) || 0; // Bizim yaptığımız ödeme
                              yuruyenBakiye += (borc - alacak);

                              return (
                                  <tr key={index} className="text-[11px] font-medium border-b border-slate-200 hover:bg-slate-50 bg-white text-slate-800 print:border-black">
                                      <td className="p-1.5 border-r border-slate-200 print:border-black">{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                                      <td className="p-1.5 border-r border-slate-200 print:border-black">{h.evrak_no}</td>
                                      <td className="p-1.5 border-r border-slate-200 font-bold print:border-black">{h.islem_tipi}</td>
                                      <td className="p-1.5 border-r border-slate-200 print:border-black">{h.aciklama}</td>
                                      <td className="p-1.5 border-r border-slate-200 text-right font-bold text-red-600 print:text-black print:border-black">{borc > 0 ? borc.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                      <td className="p-1.5 border-r border-slate-200 text-right font-bold text-emerald-600 print:text-black print:border-black">{alacak > 0 ? alacak.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                      <td className="p-1.5 text-right font-black text-[#000080] print:text-black">{Math.abs(yuruyenBakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} {yuruyenBakiye > 0 ? '(B)' : yuruyenBakiye < 0 ? '(A)' : ''}</td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
          </div>
          <div className="h-8 bg-slate-200 border-t border-slate-300 flex items-center justify-between px-4 text-[10px] text-slate-600 font-bold shrink-0 print:hidden">
              <span>Listelenen Hareket: {hareketler.length}</span>
              <span className="text-blue-700">Güncel Durum: {Math.abs(yuruyenBakiye).toLocaleString('tr-TR')} TL {yuruyenBakiye > 0 ? 'Borçlusunuz' : yuruyenBakiye < 0 ? 'Alacaklısınız' : 'Kapalı'}</span>
          </div>
      </main>
    </div>
  );
}