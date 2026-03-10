"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function MusteriSiparisleri() {
  const pathname = usePathname();
  const [aktifMusteri, setAktifMusteri] = useState<any>(null);
  
  const [siparisler, setSiparisler] = useState<any[]>([]);
  const [toptancilar, setToptancilar] = useState<any[]>([]);
  const [seciliSiparisId, setSeciliSiparisId] = useState<number | null>(null);

  const [modalAcik, setModalAcik] = useState(false);
  const [seciliSiparis, setSeciliSiparis] = useState<any>(null);
  const [siparisKalemleri, setSiparisKalemleri] = useState<any[]>([]);

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    if (!sirketStr) { window.location.href = "/login"; return; }
    const sirket = JSON.parse(sirketStr);
    if (sirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
    setAktifMusteri(sirket);
  }, []);

  useEffect(() => { if (aktifMusteri) verileriGetir(); }, [aktifMusteri]);

  async function verileriGetir() {
      const { data: toptanciData } = await supabase.from("sirketler").select("id, isletme_adi").eq("rol", "TOPTANCI");
      setToptancilar(toptanciData || []);

      const { data: cariKartlar } = await supabase.from("firmalar").select("id").eq("bagli_sirket_id", aktifMusteri.id);
      
      if (cariKartlar && cariKartlar.length > 0) {
          const cariIdler = cariKartlar.map(c => c.id);
          const { data: siparisData } = await supabase.from("siparisler").select("*").in("alici_firma_id", cariIdler).order('id', { ascending: false });
          setSiparisler(siparisData || []);
      }
  }

  const incele = async () => {
      if (!seciliSiparisId) return alert("Lütfen listeden bir sipariş seçin!");
      const siparis = siparisler.find(s => s.id === seciliSiparisId);
      setSeciliSiparis(siparis);
      const { data } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", siparis.id);
      setSiparisKalemleri(data || []);
      setModalAcik(true);
  };

  const toptanciAdiBul = (toptanciId: number) => toptancilar.find(t => t.id === toptanciId)?.isletme_adi || "Bilinmeyen";
  const cikisYap = () => { localStorage.removeItem("aktifSirket"); window.location.href = "/login"; };

  if (!aktifMusteri) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

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
              
              {/* DİKKAT ÇEKİCİ YENİ SİPARİŞ KISAYOLU */}
              <Link href="/portal" className="flex items-center px-4 py-1.5 bg-emerald-600 border border-emerald-700 text-white rounded hover:bg-emerald-700 text-xs font-bold shadow-sm">
                  <i className="fas fa-plus mr-2"></i> Yeni Sipariş Oluştur
              </Link>
              <div className="w-px h-6 bg-slate-300 mx-2"></div>

              <button onClick={incele} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm">
                  <i className="fas fa-search text-blue-600 mr-2"></i> İncele / Görüntüle
              </button>
              <div className="w-px h-6 bg-slate-300 mx-2"></div>
              <button onClick={() => window.print()} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm">
                  <i className="fas fa-print text-slate-600 mr-2"></i> Yazdır
              </button>
          </div>

          <div className="h-10 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4 print:hidden">
              <span className="text-xs font-bold text-slate-600 uppercase">Sipariş Fişlerim</span>
          </div>

          <div className="flex-1 overflow-auto bg-white relative print:hidden">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                      <tr className="text-[11px] font-bold text-slate-700">
                          <th className="p-2 border-r border-slate-300 w-8 text-center"><i className="fas fa-caret-down"></i></th>
                          <th className="p-2 border-r border-slate-300 w-32">Fiş No</th>
                          <th className="p-2 border-r border-slate-300">Tedarikçi (Toptancı)</th>
                          <th className="p-2 border-r border-slate-300 w-32 text-center">Tarih</th>
                          <th className="p-2 border-r border-slate-300 w-40 text-center">Durum</th>
                          <th className="p-2 border-r border-slate-300 w-40 text-right">Tutar (TL)</th>
                      </tr>
                  </thead>
                  <tbody>
                      {siparisler.map((s) => {
                          const isSelected = seciliSiparisId === s.id;
                          let durumMetni = "Bilinmiyor";
                          if(s.durum === "YENI") durumMetni = "İletildi";
                          else if(s.durum === "HAZIRLANIYOR") durumMetni = "Hazırlanıyor";
                          else if(s.durum === "ONAY_BEKLIYOR" || s.durum === "HAZIR") durumMetni = "Sevkiyata Hazır";
                          else if(s.durum === "BITTI") durumMetni = "Tamamlandı";

                          return (
                              <tr key={s.id} onClick={() => setSeciliSiparisId(s.id)} onDoubleClick={incele} className={`text-[11px] font-medium border-b border-slate-200 cursor-pointer select-none ${isSelected ? 'bg-[#000080] text-white' : 'hover:bg-slate-100 bg-white text-slate-800 even:bg-slate-50'}`}>
                                  <td className={`p-1.5 border-r border-slate-200 text-center ${isSelected ? 'border-r-[#000080]' : ''}`}>{isSelected && <i className="fas fa-caret-right text-white"></i>}</td>
                                  <td className={`p-1.5 border-r border-slate-200 ${isSelected ? 'border-r-[#000080]' : ''}`}>{s.siparis_no}</td>
                                  <td className={`p-1.5 border-r border-slate-200 font-bold ${isSelected ? 'border-r-[#000080]' : ''}`}>{toptanciAdiBul(s.satici_sirket_id)}</td>
                                  <td className={`p-1.5 border-r border-slate-200 text-center ${isSelected ? 'border-r-[#000080]' : ''}`}>{new Date(s.created_at).toLocaleDateString('tr-TR')}</td>
                                  <td className={`p-1.5 border-r border-slate-200 text-center font-bold uppercase tracking-widest ${isSelected ? 'border-r-[#000080]' : 'text-blue-600'}`}>{durumMetni}</td>
                                  <td className={`p-1.5 border-r border-slate-200 text-right font-black ${isSelected ? 'border-r-[#000080]' : ''}`}>{Number(s.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </main>

      {modalAcik && seciliSiparis && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 print:static print:bg-white">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-400 print:border-none print:shadow-none print:w-full">
            <div className="bg-slate-200 border-b border-slate-300 p-2 flex justify-between items-center print:hidden">
              <h3 className="text-xs font-bold text-slate-800 flex items-center"><i className="fas fa-file-invoice text-blue-600 mr-2 text-sm"></i> Sipariş Fişi İnceleme</h3>
              <div className="flex space-x-2">
                 <button onClick={() => window.print()} className="text-slate-500 hover:text-blue-600 px-2 border border-slate-300 bg-white rounded shadow-sm text-xs"><i className="fas fa-print mr-1"></i> Yazdır</button>
                 <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times"></i></button>
              </div>
            </div>
            
            <div className="p-4 bg-white border-b border-slate-300 shrink-0">
                <div className="print:block hidden mb-4 border-b-2 border-black pb-2">
                    <h2 className="text-xl font-bold uppercase">{toptanciAdiBul(seciliSiparis.satici_sirket_id)}</h2>
                    <h3 className="text-lg font-semibold mt-1">SİPARİŞ FİŞİ (SURET)</h3>
                </div>
                <div className="flex space-x-8">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center"><label className="w-24 text-xs font-semibold text-slate-700">Fiş No</label><input type="text" value={seciliSiparis.siparis_no} disabled className="flex-1 border border-slate-300 px-2 py-1 text-xs bg-slate-50 font-bold outline-none print:border-none" /></div>
                        <div className="flex items-center"><label className="w-24 text-xs font-semibold text-slate-700">Tedarikçi</label><input type="text" value={toptanciAdiBul(seciliSiparis.satici_sirket_id)} disabled className="flex-1 border border-slate-300 px-2 py-1 text-xs bg-slate-50 font-bold outline-none print:border-none" /></div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-2 print:p-0 print:bg-white">
                <table className="w-full text-left border-collapse bg-white border border-slate-300">
                    <thead className="bg-slate-200 border-b border-slate-300 print:bg-slate-100 print:border-black print:border-b-2">
                        <tr className="text-[11px] font-bold text-slate-700 print:text-black">
                            <th className="p-1.5 border-r border-slate-300 w-8 text-center print:hidden">#</th>
                            <th className="p-1.5 border-r border-slate-300">Stok Adı / Açıklama</th>
                            <th className="p-1.5 border-r border-slate-300 w-24 text-center">Miktar</th>
                            <th className="p-1.5 border-r border-slate-300 w-32 text-right">Birim Fiyat</th>
                            <th className="p-1.5 w-32 text-right">Tutar (TL)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {siparisKalemleri.map((item, index) => (
                            <tr key={index} className="border-b border-slate-200 print:border-black text-[11px]">
                                <td className="p-1 border-r border-slate-300 text-center text-slate-500 print:hidden">{index + 1}</td>
                                <td className="p-1.5 border-r border-slate-300 font-semibold">{item.urun_adi}</td>
                                <td className="p-1.5 border-r border-slate-300 text-center font-bold">{item.miktar}</td>
                                <td className="p-1.5 border-r border-slate-300 text-right">{item.birim_fiyat}</td>
                                <td className="p-1.5 text-right font-bold">{(item.miktar * item.birim_fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-slate-200 border-t border-slate-300 p-4 flex justify-end shrink-0 print:bg-white print:border-black print:border-t-2">
                <div className="bg-white border border-slate-400 p-2 rounded shadow-inner w-64 print:border-none print:shadow-none">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-1 mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Ara Toplam</span>
                        <span className="text-xs font-bold text-slate-700">{Number(seciliSiparis.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-slate-800 uppercase">Genel Toplam</span>
                        <span className="text-lg font-black text-[#000080]">{Number(seciliSiparis.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}