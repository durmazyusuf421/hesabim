"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- TİP TANIMLAMALARI (TypeScript Hatalarını Önlemek İçin) ---
interface Sirket { id: number; isletme_adi: string; rol: string; }
interface Kullanici { ad_soyad: string; rol: string; }
interface FirmaOzet { id: number; unvan: string; }
interface CariHareket {
    id: number;
    tarih: string;
    evrak_no: string;
    islem_tipi: string;
    aciklama: string;
    borc: number;
    alacak: number;
}

export default function CariEkstre() {
  const pathname = usePathname();
  const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);

  // YETKİ KONTROL STATELERİ
  const [kullaniciRol, setKullaniciRol] = useState<string>("");
  const isYonetici = kullaniciRol.includes("YONETICI");
  const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
  const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
  const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;
  const hasAccess = isYonetici || isMuhasebe; // EKSTRE ERİŞİM YETKİSİ

  const [firmalar, setFirmalar] = useState<FirmaOzet[]>([]);
  const [seciliFirmaId, setSeciliFirmaId] = useState<string>("");
  const [hareketler, setHareketler] = useState<CariHareket[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [mobilMenuAcik, setMobilMenuAcik] = useState(false);

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    
    if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
    
    try {
        const sirket: Sirket = JSON.parse(sirketStr);
        const kullanici: Kullanici = JSON.parse(kullaniciStr);
        if (sirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
        
        const rolStr = kullanici.rol || "";
        setKullaniciRol(rolStr);
        setAktifSirket(sirket);

        if (rolStr.includes("YONETICI") || rolStr.includes("MUHASEBE")) {
            firmalariGetir(sirket.id);
        }
    } catch(err) { window.location.href = "/login"; }
  }, []);

  async function firmalariGetir(sirketId: number) {
    const { data } = await supabase.from("firmalar").select("id, unvan").eq("sahip_sirket_id", sirketId).order('unvan');
    setFirmalar(data || []);
  }

  useEffect(() => {
      async function hareketleriCek() {
          if (!seciliFirmaId) { setHareketler([]); return; }
          setYukleniyor(true);
          const { data } = await supabase.from("cari_hareketler").select("*").eq("firma_id", seciliFirmaId).order('tarih', { ascending: true }).order('id', { ascending: true });
          setHareketler(data || []);
          setYukleniyor(false);
      }
      hareketleriCek();
  }, [seciliFirmaId]);

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

  if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

  let yuruyenBakiye = 0;
  const seciliFirmaAd = firmalar.find(f => f.id.toString() === seciliFirmaId)?.unvan || "";

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800 w-full relative">
      
      {mobilMenuAcik && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setMobilMenuAcik(false)}></div>}

      {/* --- GÜNCELLENMİŞ EKSİKSİZ SOL MENÜ --- */}
      <aside className={`w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden fixed md:static inset-y-0 left-0 z-50 transition-transform duration-300 ease-out ${mobilMenuAcik ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
          <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center relative">
              <span className="text-orange-500 text-[10px] uppercase mb-0.5">{isYonetici ? 'Sistem Yöneticisi' : 'Personel Hesabı'}</span>
              <span className="text-xs truncate w-full">{aktifSirket?.isletme_adi}</span>
              <button onClick={() => setMobilMenuAcik(false)} className="md:hidden absolute right-4 text-slate-400 hover:text-white"><i className="fas fa-times text-lg"></i></button>
          </div>
          
          <nav className="flex-1 py-4 space-y-1 overflow-y-auto custom-scrollbar">
              {aktifSirket?.rol === "TOPTANCI" ? (
                  <>
                      {isYonetici ? <Link href="/dashboard" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isPlasiyer || isDepocu ? <Link href="/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/pos" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isPlasiyer || isDepocu ? <Link href="/" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      
                      {isYonetici || isMuhasebe ? <Link href="/tahsilat" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/tahsilat" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isMuhasebe ? <Link href="/faturalar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isDepocu ? <Link href="/stok" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isDepocu ? <Link href="/stok-hareketleri" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isPlasiyer || isMuhasebe ? <Link href="/cari" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      
                      {/* AKTİF SAYFA BURASI (Cari Hareketler / Ekstre) */}
                      {isYonetici || isMuhasebe ? <Link href="/ekstre" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6 text-blue-400"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  </>
              ) : (
                  <>
                    <Link href="/portal/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                    <Link href="/stok" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Market Stokları</Link>
                    <Link href="/portal" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
                    <Link href="/portal/siparisler" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/siparisler" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
                    <Link href="/portal/kasa" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/kasa" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-cash-register w-6"></i> Kasa & Nakit Akışı</Link>
                    <Link href="/portal/veresiye" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/veresiye" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-book w-6"></i> Veresiye Defteri</Link>
                  </>
              )}
          </nav>
          <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
              {isYonetici ? <Link href="/ayarlar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link> : <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
              <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
          </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white relative w-full">
        {/* MOBİL MENÜ BUTONU */}
        <div className="md:hidden bg-white border-b border-slate-200 p-3 flex justify-between items-center shrink-0 print:hidden">
             <h1 className="font-bold text-slate-800 text-sm"><i className="fas fa-clipboard-list text-blue-600 mr-2"></i>Cari Hareketler</h1>
             <button onClick={() => setMobilMenuAcik(true)} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded border border-slate-300"><i className="fas fa-bars"></i></button>
        </div>

        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 animate-in zoom-in-95 duration-500">
                <div className="w-32 h-32 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-black text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Bu sayfaya sadece "YÖNETİCİ" veya "MUHASEBE" yetkisine sahip kullanıcılar erişebilir.</p>
                <Link href="/" className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg transition-all"><i className="fas fa-arrow-left mr-2"></i> Siparişlere Dön</Link>
            </div>
        ) : (
            <>
                <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0 print:hidden overflow-x-auto custom-scrollbar">
                    <button onClick={() => window.print()} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm whitespace-nowrap"><i className="fas fa-print text-slate-600 mr-2"></i> Yazdır / PDF İndir</button>
                </div>

                <div className="h-12 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4 print:hidden">
                    <span className="text-xs font-bold text-slate-600 uppercase hidden sm:block">Cari Seçimi</span>
                    <select 
                        value={seciliFirmaId} 
                        onChange={(e) => setSeciliFirmaId(e.target.value)}
                        className="flex-1 max-w-lg text-sm px-3 py-1.5 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500 font-bold text-slate-700 w-full"
                    >
                        <option value="">-- Ekstresini Almak İstediğiniz Müşteriyi Seçin --</option>
                        {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                    </select>
                </div>

                <div className="flex-1 overflow-auto bg-white relative">
                    <div className="print:block hidden mb-4 border-b-2 border-black pb-2 pt-4 px-4 text-center">
                        <h2 className="text-xl font-bold uppercase">{aktifSirket.isletme_adi}</h2>
                        <h3 className="text-lg font-semibold mt-1">MÜŞTERİ HESAP EKSTRESİ</h3>
                        <p className="text-sm font-bold mt-2">Müşteri: {seciliFirmaAd}</p>
                    </div>

                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                        <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm print:bg-white print:border-black">
                            <tr className="text-[11px] font-bold text-slate-700 print:text-black">
                                <th className="p-2 border-r border-slate-300 w-24">Tarih</th>
                                <th className="p-2 border-r border-slate-300 w-32">Evrak No</th>
                                <th className="p-2 border-r border-slate-300 w-48">İşlem Türü</th>
                                <th className="p-2 border-r border-slate-300">Açıklama</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-right">Borç (TL)</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-right">Alacak (TL)</th>
                                <th className="p-2 w-32 text-right">Bakiye</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!seciliFirmaId ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest print:hidden">LÜTFEN ÜSTTEN BİR MÜŞTERİ SEÇİN</td></tr>
                            ) : yukleniyor ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Veriler Yükleniyor...</td></tr>
                            ) : hareketler.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">HESAP HAREKETİ BULUNMUYOR</td></tr>
                            ) : (
                                hareketler.map((h, index) => {
                                    const borc = Number(h.borc) || 0;
                                    const alacak = Number(h.alacak) || 0;
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

                <div className="h-10 sm:h-8 bg-slate-200 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between px-4 py-1 text-[10px] text-slate-600 font-bold shrink-0 print:hidden">
                    <span>Listelenen Hareket: {hareketler.length}</span>
                    <span className="text-blue-700">Müşteri Bakiyesi: {Math.abs(yuruyenBakiye).toLocaleString('tr-TR', {minimumFractionDigits:2})} TL {yuruyenBakiye > 0 ? 'Borçlu' : yuruyenBakiye < 0 ? 'Alacaklı' : 'Kapalı'}</span>
                </div>
            </>
        )}
      </main>
    </div>
  );
}