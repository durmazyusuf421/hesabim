"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- TİP TANIMLAMALARI ---
interface Sirket { id: number; isletme_adi: string; rol: string; }
interface Kullanici { ad_soyad: string; rol: string; }
interface Siparis {
    id: number;
    siparis_no: string;
    cari_adi: string;
    durum: string;
    toplam_tutar: number;
    tarih: string;
    created_at: string;
}

const parseTutar = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); } 
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};

export default function SiparislerSayfasi() {
    const pathname = usePathname();
    const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);

    // YETKİ KONTROL STATELERİ
    const [kullaniciRol, setKullaniciRol] = useState<string>("");
    const isYonetici = kullaniciRol.includes("YONETICI");
    const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
    const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
    const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;

    const [siparisler, setSiparisler] = useState<Siparis[]>([]);
    const [aramaTerimi, setAramaTerimi] = useState("");
    const [yukleniyor, setYukleniyor] = useState(true);
    const [mobilMenuAcik, setMobilMenuAcik] = useState(false);
    const [seciliSiparisId, setSeciliSiparisId] = useState<number | null>(null);

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

            if (rolStr.includes("YONETICI") || rolStr.includes("PLASIYER") || rolStr.includes("DEPOCU")) {
                verileriGetir(sirket.id);
            } else {
                setYukleniyor(false);
            }
        } catch(err) { window.location.href = "/login"; }
    }, []);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            // Firma isimlerini çekmek için (Eğer sipariş tablosunda sadece firma_id varsa eşleştirmek için)
            const { data: firmalarData } = await supabase.from("firmalar").select("id, unvan").eq("sahip_sirket_id", sirketId);
            const firmaMap: Record<number, string> = {};
            if (firmalarData) {
                firmalarData.forEach(f => firmaMap[f.id] = f.unvan);
            }

            // Siparişleri çek
            const { data } = await supabase.from("siparisler").select("*").eq("satici_sirket_id", sirketId).order('id', { ascending: false });
            
            if (data) {
                const islenmisSiparisler = data.map(s => ({
                    ...s,
                    cari_adi: s.cari_adi || firmaMap[s.alici_firma_id] || "Perakende / Bilinmiyor"
                }));
                setSiparisler(islenmisSiparisler);
            }
        } catch (error) {
            console.error(error);
        }
        setYukleniyor(false);
    }

    const siparisSil = async () => {
        if (!seciliSiparisId) return alert("Lütfen silmek için bir sipariş seçin!");
        if (window.confirm("Bu siparişi kalıcı olarak silmek istediğinize emin misiniz?")) {
            setYukleniyor(true);
            await supabase.from("siparis_kalemleri").delete().eq("siparis_id", seciliSiparisId);
            await supabase.from("siparisler").delete().eq("id", seciliSiparisId);
            setSeciliSiparisId(null);
            if (aktifSirket) verileriGetir(aktifSirket.id);
        }
    };

    const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

    const filtrelenmisSiparisler = siparisler.filter(s => 
        (s.siparis_no || "").toLowerCase().includes(aramaTerimi.toLowerCase()) || 
        (s.cari_adi || "").toLowerCase().includes(aramaTerimi.toLowerCase())
    );

    if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Sistem Doğrulanıyor...</div>;

    // Durum renklerini belirleyen yardımcı fonksiyon (Ekran görüntüsündeki gibi)
    const getDurumRengi = (durum: string) => {
        const d = durum.toLowerCase();
        if (d.includes("onay bekliyor")) return "text-purple-600 font-bold";
        if (d.includes("hazırlanıyor")) return "text-orange-500 font-bold";
        if (d.includes("yeni sipariş") || d.includes("yeni")) return "text-blue-500 font-bold";
        if (d.includes("tamamlandı") || d.includes("onaylandı")) return "text-emerald-600 font-bold";
        if (d.includes("iptal") || d.includes("red")) return "text-red-600 font-bold";
        return "text-slate-600 font-bold";
    };

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
                            
                            {/* AKTİF SAYFA BURASI (Siparişler Fiş) */}
                            {isYonetici || isPlasiyer || isDepocu ? <Link href="/" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6 text-blue-400"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {isYonetici || isMuhasebe ? <Link href="/tahsilat" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/tahsilat" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isMuhasebe ? <Link href="/faturalar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isDepocu ? <Link href="/stok" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isDepocu ? <Link href="/stok-hareketleri" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isPlasiyer || isMuhasebe ? <Link href="/cari" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isMuhasebe ? <Link href="/ekstre" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                        </>
                    ) : (
                        <Link href="/portal/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
                    {isYonetici ? <Link href="/ayarlar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link> : <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                    <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
                </div>
            </aside>

            {/* --- ANA EKRAN İÇERİĞİ (Orijinal Sipariş Listesi Tasarımı) --- */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white relative w-full">
                
                <div className="md:hidden bg-white border-b border-slate-200 p-3 flex justify-between items-center shrink-0">
                    <h1 className="font-bold text-slate-800 text-sm"><i className="fas fa-th-large text-blue-600 mr-2"></i>Siparişler (Fiş)</h1>
                    <button onClick={() => setMobilMenuAcik(true)} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded border border-slate-300"><i className="fas fa-bars"></i></button>
                </div>

                {!(isYonetici || isPlasiyer || isDepocu) ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 animate-in zoom-in-95 duration-500">
                        <div className="w-32 h-32 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner border-4 border-white"><i className="fas fa-lock"></i></div>
                        <h1 className="text-3xl font-black text-slate-800 mb-2">Erişim Engellendi</h1>
                        <p className="text-slate-500 font-bold max-w-md mx-auto">Siparişler sayfasına erişim yetkiniz bulunmamaktadır.</p>
                    </div>
                ) : (
                    <>
                        {/* 1. SATIR: TOOLBAR (Araç Çubuğu) */}
                        <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-4 space-x-2 shrink-0 print:hidden overflow-x-auto custom-scrollbar">
                            <button onClick={() => alert("Yeni sipariş ekranı eklenecek.")} className="flex items-center px-4 py-1.5 bg-emerald-600 border border-emerald-700 text-white rounded hover:bg-emerald-700 text-xs font-bold shadow-sm whitespace-nowrap">
                                <i className="fas fa-plus mr-2"></i> Yeni Sipariş Ekle
                            </button>
                            <button onClick={() => { if(!seciliSiparisId) alert("Lütfen incelemek için bir fiş seçin."); else alert("İnceleme/Düzenleme ekranı açılacak."); }} className="flex items-center px-4 py-1.5 bg-white border border-slate-300 rounded hover:bg-blue-50 text-blue-600 text-xs font-bold shadow-sm whitespace-nowrap">
                                <i className="fas fa-edit mr-2"></i> İncele / Düzelt
                            </button>
                            <button onClick={siparisSil} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-red-50 text-red-600 text-xs font-bold shadow-sm whitespace-nowrap">
                                <i className="fas fa-trash-alt mr-2"></i> Sil
                            </button>
                            <button onClick={() => alert("İşlem menüsü açılacak.")} className="flex items-center px-4 py-1.5 bg-blue-500 border border-blue-600 text-white rounded hover:bg-blue-600 text-xs font-bold shadow-sm whitespace-nowrap ml-2">
                                <i className="fas fa-check-circle mr-2"></i> İşlem
                            </button>
                            <button onClick={() => window.print()} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm whitespace-nowrap">
                                <i className="fas fa-print mr-2"></i> Yazdır
                            </button>
                        </div>

                        {/* 2. SATIR: ARAMA VE BAŞLIK ÇUBUĞU */}
                        <div className="h-12 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-6 print:hidden">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-widest hidden sm:block">SİPARİŞ FİŞLERİ</span>
                            <div className="flex-1 max-w-lg relative">
                                <input type="text" placeholder="Fiş No veya Cari Ünvanı ile arama yapın..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                                <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                            </div>
                        </div>

                        {/* 3. SATIR: TABLO (GRID) ALANI */}
                        <div className="flex-1 overflow-auto bg-white relative print:hidden">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
                                <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                                    <tr className="text-[11px] font-bold text-slate-700">
                                        <th className="p-2 border-r border-slate-300 w-8 text-center"><i className="fas fa-caret-down text-slate-400"></i></th>
                                        <th className="p-2 border-r border-slate-300 w-32">Belge / Fiş No</th>
                                        <th className="p-2 border-r border-slate-300">Cari Adı (Müşteri)</th>
                                        <th className="p-2 border-r border-slate-300 w-48 text-right">Durum</th>
                                        <th className="p-2 w-32 text-right">Tutar (TL)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {yukleniyor ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                                    ) : filtrelenmisSiparisler.length === 0 ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Sipariş Bulunamadı</td></tr>
                                    ) : (
                                        filtrelenmisSiparisler.map((s) => {
                                            const isSelected = seciliSiparisId === s.id;
                                            return (
                                                <tr key={s.id} onClick={() => setSeciliSiparisId(s.id)} className={`text-[11px] font-medium border-b border-slate-200 cursor-pointer select-none ${isSelected ? 'bg-[#000080] text-white' : 'hover:bg-slate-50 bg-white text-slate-800'}`}>
                                                    <td className="p-2 border-r border-slate-200 text-center">
                                                        {isSelected ? <i className="fas fa-caret-right text-white"></i> : <i className="fas fa-caret-down text-transparent"></i>}
                                                    </td>
                                                    <td className={`p-2 border-r border-slate-200 ${isSelected ? 'text-white' : 'text-slate-600'}`}>{s.siparis_no}</td>
                                                    <td className={`p-2 border-r border-slate-200 ${isSelected ? 'text-white' : 'text-slate-800'}`}>{s.cari_adi}</td>
                                                    
                                                    {/* DURUM RENKLENDİRMESİ */}
                                                    <td className={`p-2 border-r border-slate-200 text-right ${isSelected ? 'text-white' : getDurumRengi(s.durum)}`}>{s.durum}</td>
                                                    
                                                    {/* TUTAR */}
                                                    <td className={`p-2 text-right font-bold ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                                                        {parseTutar(s.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}