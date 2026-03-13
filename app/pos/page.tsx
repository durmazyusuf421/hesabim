"use client";
import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Urun { id: number; urun_adi: string; barkod?: string; satis_fiyati: number | string; kategori?: string; resim_url?: string; }
interface Cari { id: number; cari_adi: string; bakiye?: number | string; }
interface SepetItem { urun: Urun; miktar: number; fiyat: number; }

const parseTutar = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); }
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};

export default function PosEkrani() {
    const pathname = usePathname();
    const [aktifSirket, setAktifSirket] = useState<any>(null);
    const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
    const [yukleniyor, setYukleniyor] = useState(true);
    const [mobilMenuAcik, setMobilMenuAcik] = useState(false);

    const isYonetici = kullaniciRol.includes("YONETICI");
    const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
    const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
    const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;

    const [urunler, setUrunler] = useState<Urun[]>([]);
    const [cariler, setCariler] = useState<Cari[]>([]);
    const [aramaMetni, setAramaMetni] = useState("");
    const [seciliKategori, setSeciliKategori] = useState<string | null>(null);

    const [sepet, setSepet] = useState<SepetItem[]>([]);
    const [seciliCari, setSeciliCari] = useState<number | null>(null);
    const [islemBekliyor, setIslemBekliyor] = useState(false);

    const aramaRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const sirketStr = localStorage.getItem("aktifSirket");
        const kullaniciStr = localStorage.getItem("aktifKullanici");
        if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }

        const sirket = JSON.parse(sirketStr);
        const kullanici = JSON.parse(kullaniciStr);
        
        setKullaniciRol(kullanici.rol || "");
        setAktifSirket(sirket);

        verileriGetir(sirket.id);
        if (aramaRef.current && window.innerWidth > 768) aramaRef.current.focus();
    }, []);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            const [dbUrunler, dbCariler] = await Promise.all([
                supabase.from("urunler").select("*").eq("sahip_sirket_id", sirketId),
                supabase.from("cari_kartlar").select("*").eq("sahip_sirket_id", sirketId)
            ]);
            
            let finalUrunler = dbUrunler.data || [];
            let finalCariler = dbCariler.data || [];

            if (finalUrunler.length === 0) {
                 const { data } = await supabase.from("urunler").select("*").eq("sirket_id", sirketId);
                 if (data) finalUrunler = data;
            }
            if (finalCariler.length === 0) {
                 const { data } = await supabase.from("cari_kartlar").select("*").eq("sirket_id", sirketId);
                 if (data) finalCariler = data;
            }

            setUrunler(finalUrunler);
            setCariler(finalCariler);
        } catch (error) { console.error("Veri çekme hatası:", error); }
        setYukleniyor(false);
    }

    const kategoriler = Array.from(new Set(urunler.map(u => u.kategori).filter(Boolean))) as string[];

    const filtrelenmisUrunler = urunler.filter(u => {
        if (seciliKategori && u.kategori !== seciliKategori) return false;
        if (!aramaMetni) return true;
        const aramaKucuk = aramaMetni.toLocaleLowerCase('tr-TR').trim();
        const isimKucuk = u.urun_adi ? String(u.urun_adi).toLocaleLowerCase('tr-TR') : "";
        const barkodString = u.barkod ? String(u.barkod).trim() : "";
        return isimKucuk.includes(aramaKucuk) || barkodString === aramaKucuk;
    });

    const sepeteEkle = (urun: Urun) => {
        setSepet(prev => {
            const varMi = prev.find(item => item.urun.id === urun.id);
            if (varMi) return prev.map(item => item.urun.id === urun.id ? { ...item, miktar: item.miktar + 1 } : item);
            return [...prev, { urun, miktar: 1, fiyat: parseTutar(urun.satis_fiyati) }];
        });
        setAramaMetni(""); 
        if (aramaRef.current && window.innerWidth > 768) aramaRef.current.focus();
    };

    const aramaFormSubmit = (e: React.FormEvent) => {
        e.preventDefault(); 
        if (!aramaMetni.trim()) return;
        const aranan = aramaMetni.trim();
        const tamBarkodEslesti = urunler.find(u => String(u.barkod).trim() === aranan);
        if (tamBarkodEslesti) { sepeteEkle(tamBarkodEslesti); return; }
        if (filtrelenmisUrunler.length === 1) { sepeteEkle(filtrelenmisUrunler[0]); } 
        else if (filtrelenmisUrunler.length === 0) { alert(`Sistemde "${aranan}" bulunamadı!`); setAramaMetni(""); } 
        else { if (aramaRef.current) aramaRef.current.blur(); }
    };

    const miktarGuncelle = (urunId: number, yeniMiktar: number) => { if (yeniMiktar > 0) setSepet(prev => prev.map(item => item.urun.id === urunId ? { ...item, miktar: yeniMiktar } : item)); };
    const fiyatGuncelle = (urunId: number, yeniFiyat: number) => { if (yeniFiyat >= 0) setSepet(prev => prev.map(item => item.urun.id === urunId ? { ...item, fiyat: yeniFiyat } : item)); };
    const sepettenCikar = (urunId: number) => { setSepet(prev => prev.filter(item => item.urun.id !== urunId)); };

    const araToplam = sepet.reduce((acc, item) => acc + (item.fiyat * item.miktar), 0);
    const genelToplam = araToplam + (araToplam * 0.20); 

    const satisiTamamla = async (odemeTipi: 'NAKİT' | 'KREDİ KARTI' | 'VERESİYE') => {
        if (sepet.length === 0) return;
        if (odemeTipi === 'VERESİYE' && !seciliCari) { alert("Veresiye için lütfen Cari seçin!"); return; }

        setIslemBekliyor(true);
        try {
            const musteriIsmi = seciliCari ? cariler.find(c => c.id === seciliCari)?.cari_adi : "Perakende Müşteri";
            const yeniSiparis = { toptanci_id: aktifSirket?.id, cari_id: seciliCari || null, cari_adi: musteriIsmi, durum: "Onaylandı", toplam_tutar: genelToplam, odeme_tipi: odemeTipi, tarih: new Date().toISOString() };
            const { error } = await supabase.from("siparisler").insert([yeniSiparis]);
            if (error) throw error;
            alert(`Satış Başarılı!\nTutar: ${genelToplam.toLocaleString('tr-TR')} ₺`);
            setSepet([]); setSeciliCari(null); setAramaMetni("");
        } catch (error) { alert("Satış sırasında hata oluştu."); }
        setIslemBekliyor(false);
    };

    const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

    if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Sistem Doğrulanıyor...</div>;

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
                            {isYonetici ? <Link href="/dashboard" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {/* AKTİF SAYFA BURASI (Hızlı Satış POS) */}
                            {isYonetici || isPlasiyer || isDepocu ? <Link href="/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/pos" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6 text-blue-400"></i> Hızlı Satış (POS)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {isYonetici || isPlasiyer || isDepocu ? <Link href="/" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {isYonetici || isMuhasebe ? <Link href="/tahsilat" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/tahsilat" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme <i className="fas fa-lock ml-auto text-[10px]"></i></div>}

                            {isYonetici || isMuhasebe ? <Link href="/faturalar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isDepocu ? <Link href="/stok" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isDepocu ? <Link href="/stok-hareketleri" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isPlasiyer || isMuhasebe ? <Link href="/cari" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isMuhasebe ? <Link href="/ekstre" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                        </>
                    ) : (
                        <Link href="/portal/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
                    {isYonetici ? <Link href="/ayarlar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link> : <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                    <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
                </div>
            </aside>

            {/* --- ANA EKRAN (POS İÇERİĞİ) --- */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white relative w-full">
                <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden w-full">
                    
                    <div className="flex-1 flex flex-col h-[55vh] lg:h-full overflow-hidden border-b lg:border-b-0 border-slate-200 relative">
                        <header className="bg-slate-100 lg:h-16 border-b border-slate-300 flex flex-col lg:flex-row items-center justify-between p-2 lg:px-4 shrink-0 z-10 gap-2 lg:gap-0 print:hidden">
                            <div className="flex items-center justify-between w-full lg:w-1/4">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setMobilMenuAcik(true)} className="md:hidden w-8 h-8 flex items-center justify-center text-slate-600 bg-white border border-slate-300 rounded shadow-sm"><i className="fas fa-bars"></i></button>
                                    <h1 className="text-base font-bold text-slate-800 leading-none flex items-center"><i className="fas fa-desktop text-blue-600 mr-2"></i>Hızlı Satış</h1>
                                </div>
                            </div>

                            <form onSubmit={aramaFormSubmit} className="flex w-full lg:flex-1 lg:max-w-xl gap-2">
                                <div className="relative flex-1">
                                    <input ref={aramaRef} type="search" enterKeyHint="search" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} placeholder="Barkod okutun veya arayın..." className="w-full text-xs px-3 py-2 pl-8 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                                    <i className="fas fa-barcode absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                </div>
                                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold text-xs shadow-sm flex items-center gap-2 shrink-0"><i className="fas fa-search"></i><span className="hidden sm:block">ARA</span></button>
                            </form>
                            <div className="hidden lg:flex w-1/4 justify-end"></div>
                        </header>

                        <div className="bg-white border-b border-slate-300 px-3 lg:px-4 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
                            <button onClick={() => setSeciliKategori(null)} className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap border shadow-sm ${!seciliKategori ? 'bg-slate-700 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>Tümü</button>
                            {kategoriler.map(kat => (
                                <button key={kat} onClick={() => setSeciliKategori(kat)} className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap border shadow-sm ${seciliKategori === kat ? 'bg-slate-700 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{kat}</button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 lg:p-4 bg-slate-50 custom-scrollbar w-full">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pb-10">
                                {filtrelenmisUrunler.map(urun => (
                                    <button key={urun.id} onClick={() => sepeteEkle(urun)} className="bg-white rounded border border-slate-300 p-2 text-left hover:shadow transition-all group flex flex-col h-full active:bg-blue-50">
                                        <div className="w-full h-24 bg-slate-100 rounded border border-slate-200 mb-2 flex items-center justify-center overflow-hidden relative">
                                            {urun.resim_url ? <img src={urun.resim_url} alt={urun.urun_adi} className="w-full h-full object-cover" /> : <i className="fas fa-box text-slate-300 text-2xl"></i>}
                                        </div>
                                        <div className="flex-1 w-full flex flex-col justify-between">
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-400 truncate">{urun.barkod || "Barkodsuz"}</p>
                                                <h3 className="text-xs font-bold text-slate-800 leading-tight group-hover:text-blue-600 line-clamp-2">{urun.urun_adi}</h3>
                                            </div>
                                            <div className="mt-2 flex items-end justify-between w-full">
                                                <span className="text-sm font-black text-blue-700 truncate">{parseTutar(urun.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</span>
                                                <div className="w-6 h-6 rounded bg-slate-100 text-slate-600 border border-slate-300 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-700"><i className="fas fa-plus text-[10px]"></i></div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-[45vh] lg:h-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-l border-slate-300 shadow-xl flex flex-col shrink-0 z-20">
                        <div className="h-10 bg-slate-200 border-b border-slate-300 text-slate-700 flex items-center justify-between px-3 shrink-0">
                            <h2 className="text-xs font-bold flex items-center"><i className="fas fa-shopping-cart text-slate-500 mr-2"></i> Satış Fişi</h2>
                            <span className="bg-slate-300 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">{sepet.length} Kalem</span>
                        </div>

                        <div className="p-2 border-b border-slate-200 bg-slate-50 shrink-0">
                            <select value={seciliCari || ""} onChange={(e) => setSeciliCari(Number(e.target.value) || null)} className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500">
                                <option value="">-- Perakende Müşteri --</option>
                                {cariler.map(c => (<option key={c.id} value={c.id}>{c.cari_adi}</option>))}
                            </select>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-white custom-scrollbar">
                            {sepet.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <i className="fas fa-receipt text-3xl mb-2 opacity-30"></i>
                                    <p className="font-bold text-[10px] uppercase tracking-widest mt-2">Sepet Boş</p>
                                </div>
                            ) : (
                                sepet.map((item) => (
                                    <div key={item.urun.id} className="bg-slate-50 border border-slate-200 p-2 rounded flex flex-col gap-1 relative">
                                        <div className="flex justify-between items-start pr-5">
                                            <h4 className="text-[10px] font-bold text-slate-800 leading-tight">{item.urun.urun_adi}</h4>
                                            <button onClick={() => sepettenCikar(item.urun.id)} className="absolute right-1 top-1 text-slate-400 hover:text-red-600"><i className="fas fa-times text-xs"></i></button>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <div className="flex items-center bg-white border border-slate-300 rounded overflow-hidden">
                                                <button onClick={() => miktarGuncelle(item.urun.id, item.miktar - 1)} className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 border-r border-slate-300"><i className="fas fa-minus text-[8px]"></i></button>
                                                <input type="number" value={item.miktar} onChange={(e) => miktarGuncelle(item.urun.id, Number(e.target.value))} className="w-8 text-center text-[10px] font-bold text-slate-800 border-none outline-none" />
                                                <button onClick={() => miktarGuncelle(item.urun.id, item.miktar + 1)} className="w-5 h-5 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 border-l border-slate-300"><i className="fas fa-plus text-[8px]"></i></button>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[11px] font-black text-slate-900">{(item.fiyat * item.miktar).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="bg-slate-100 border-t border-slate-300 p-3 shrink-0 shadow-inner">
                            <div className="flex justify-between items-center mb-3 bg-white p-2 rounded border border-slate-300">
                                <span className="text-xs font-black text-slate-700 uppercase">Genel Toplam</span>
                                <span className="text-lg font-black text-[#000080]">{genelToplam.toLocaleString('tr-TR', {minimumFractionDigits:2})} <span className="text-xs">₺</span></span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('NAKİT')} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"><i className="fas fa-money-bill"></i> Nakit</button>
                                <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('KREDİ KARTI')} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"><i className="fas fa-credit-card"></i> K.Kartı</button>
                            </div>
                            <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('VERESİYE')} className={`w-full p-2 rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm disabled:opacity-50 ${!seciliCari ? 'bg-white text-slate-500 border border-slate-300' : 'bg-orange-500 hover:bg-orange-600 border border-orange-600 text-white'}`}>
                                <i className="fas fa-book"></i> {!seciliCari ? 'Veresiye (Cari Seçin)' : 'Açık Hesap (Veresiye)'}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}