"use client";
import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// TYPESCRIPT ARAYÜZLERİ
interface Urun { id: number; urun_adi: string; barkod?: string; satis_fiyati: number | string; stok_miktari?: number | string; resim_url?: string; }
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
    const [kullaniciAdi, setKullaniciAdi] = useState("");
    const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
    const [yukleniyor, setYukleniyor] = useState(true);
    
    // MOBİL MENÜ STATE'İ
    const [mobilMenuAcik, setMobilMenuAcik] = useState(false);

    // VERİLER
    const [urunler, setUrunler] = useState<Urun[]>([]);
    const [cariler, setCariler] = useState<Cari[]>([]);
    const [aramaMetni, setAramaMetni] = useState("");

    // SEPET & SATIŞ
    const [sepet, setSepet] = useState<SepetItem[]>([]);
    const [seciliCari, setSeciliCari] = useState<number | null>(null);
    const [islemBekliyor, setIslemBekliyor] = useState(false);

    const aramaRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const sirketStr = localStorage.getItem("aktifSirket");
        const kullaniciStr = localStorage.getItem("aktifKullanici");
        if (!sirketStr) { window.location.href = "/login"; return; }

        const sirket = JSON.parse(sirketStr);
        setAktifSirket(sirket);
        if (kullaniciStr) {
            const kul = JSON.parse(kullaniciStr);
            setKullaniciAdi(kul.ad_soyad);
            setKullaniciRol(kul.rol || "");
        }

        verileriGetir(sirket.id);
        if (aramaRef.current && window.innerWidth > 1024) aramaRef.current.focus();
    }, []);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            // Paralel veri çekimi ile PC tasarımı bozulmadan hız artırıldı
            const [dbUrunler, dbCariler] = await Promise.all([
                supabase.from("urunler").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`),
                supabase.from("cari_kartlar").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`)
            ]);
            if (dbUrunler.data) setUrunler(dbUrunler.data);
            if (dbCariler.data) setCariler(dbCariler.data);
        } catch (error) { console.error("Veri çekme hatası:", error); }
        setYukleniyor(false);
    }

    // TÜRKÇE KARAKTERE DUYARLI ARAMA FİLTRESİ
    const filtrelenmisUrunler = urunler.filter(u => {
        if (!aramaMetni) return true;
        const aramaKucuk = aramaMetni.toLocaleLowerCase('tr-TR');
        const isimKucuk = u.urun_adi ? String(u.urun_adi).toLocaleLowerCase('tr-TR') : "";
        const barkodString = u.barkod ? String(u.barkod) : "";
        return isimKucuk.includes(aramaKucuk) || barkodString.includes(aramaMetni);
    });

    const sepeteEkle = (urun: Urun) => {
        setSepet(prev => {
            const varMi = prev.find(item => item.urun.id === urun.id);
            if (varMi) return prev.map(item => item.urun.id === urun.id ? { ...item, miktar: item.miktar + 1 } : item);
            return [...prev, { urun, miktar: 1, fiyat: parseTutar(urun.satis_fiyati) }];
        });
        setAramaMetni(""); 
        if (aramaRef.current && window.innerWidth > 1024) aramaRef.current.focus();
    };

    const miktarGuncelle = (urunId: number, yeniMiktar: number) => { if (yeniMiktar > 0) setSepet(prev => prev.map(item => item.urun.id === urunId ? { ...item, miktar: yeniMiktar } : item)); };
    const fiyatGuncelle = (urunId: number, yeniFiyat: number) => { if (yeniFiyat >= 0) setSepet(prev => prev.map(item => item.urun.id === urunId ? { ...item, fiyat: yeniFiyat } : item)); };
    const sepettenCikar = (urunId: number) => { setSepet(prev => prev.filter(item => item.urun.id !== urunId)); };

    const araToplam = sepet.reduce((acc, item) => acc + (item.fiyat * item.miktar), 0);
    const kdvToplam = araToplam * 0.20; 
    const genelToplam = araToplam + kdvToplam;

    const satisiTamamla = async (odemeTipi: 'NAKİT' | 'KREDİ KARTI' | 'VERESİYE') => {
        if (sepet.length === 0) { alert("Sepet boş!"); return; }
        if (odemeTipi === 'VERESİYE' && !seciliCari) { alert("Veresiye için lütfen bir Cari seçin!"); return; }

        setIslemBekliyor(true);
        try {
            const musteriIsmi = seciliCari ? cariler.find(c => c.id === seciliCari)?.cari_adi : "Perakende Müşteri";
            const yeniSiparis = { toptanci_id: aktifSirket.id, cari_id: seciliCari || null, cari_adi: musteriIsmi, durum: "Onaylandı", toplam_tutar: genelToplam, odeme_tipi: odemeTipi, tarih: new Date().toISOString() };
            
            const { error } = await supabase.from("siparisler").insert([yeniSiparis]);
            if (error) throw error;

            alert(`Satış Başarılı!\nTutar: ${genelToplam.toLocaleString('tr-TR')} ₺`);
            setSepet([]); setSeciliCari(null); setAramaMetni("");
        } catch (error) { alert("Satış sırasında hata oluştu."); }
        setIslemBekliyor(false);
    };

    const cikisYap = () => { localStorage.clear(); window.location.href = "/login"; };
    const handleMenuClick = () => { if (window.innerWidth < 1024) setMobilMenuAcik(false); };

    if (!aktifSirket) return <div className="h-screen bg-[#f0f4f8]"></div>;

    const isYonetici = kullaniciRol.includes("YONETICI");

    return (
        <div className="bg-[#f0f4f8] font-sans h-[100dvh] flex overflow-hidden text-slate-800 w-full max-w-[100vw]">
            
            {/* MOBİL KARARTMA EKRANI */}
            {mobilMenuAcik && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobilMenuAcik(false)}></div>
            )}

            {/* SOL MENÜ - PC'DE AYNI, MOBİLDE AÇILIR/KAPANIR */}
            <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[75vw] max-w-[280px] lg:w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 transition-transform duration-300 ease-out ${mobilMenuAcik ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}>
                <div className="h-16 lg:h-16 flex flex-col items-start lg:items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-4 lg:px-2 text-left lg:text-center relative">
                    <span className={`text-[10px] uppercase mb-0.5 ${aktifSirket.rol === 'TOPTANCI' ? 'text-orange-500' : 'text-cyan-500'}`}>{isYonetici ? 'SİSTEM YÖNETİCİSİ' : 'PERSONEL HESABI'}</span>
                    <span className="text-xs truncate w-full">{aktifSirket.email || aktifSirket.isletme_adi}</span>
                    <button onClick={() => setMobilMenuAcik(false)} className="lg:hidden absolute right-4 text-slate-400 hover:text-white"><i className="fas fa-times text-lg"></i></button>
                </div>
                <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                    {aktifSirket.rol === "TOPTANCI" ? (
                        <>
                            {isYonetici ? <Link href="/dashboard" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) ? <Link href="/pos" onClick={handleMenuClick} className={`flex items-center px-6 py-3 transition-all ${pathname === "/pos" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) ? <Link href="/" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/faturalar" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok-hareketleri" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("MUHASEBE")) ? <Link href="/cari" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/ekstre" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                        </>
                    ) : (
                        <>
                            <Link href="/portal/pos" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                            <Link href="/stok" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-box w-6"></i> Market Stokları</Link>
                            <Link href="/portal" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
                            <Link href="/portal/siparisler" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white transition-all border-l-4 border-transparent"><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
                        </>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
                    <button onClick={cikisYap} className="flex items-center px-2 py-2 text-slate-500 hover:text-red-400 w-full text-left uppercase text-[10px] font-black"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
                </div>
            </aside>

            {/* İÇERİK YÜKLENİYORSA SADECE ORTA ALANDA SPINNER ÇIKAR */}
            {yukleniyor ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
                    <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Kasa Hazırlanıyor...</span>
                </div>
            ) : (
                // PC'de yanyana (flex-row), Mobilde alt alta (flex-col)
                <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden w-full">
                    
                    {/* ORTA ALAN: ÜRÜNLER VE ARAMA (PC tasarımı birebir aynı, sadece paddingler mobilde kısıldı) */}
                    <div className="flex-1 flex flex-col h-1/2 lg:h-full overflow-hidden border-b lg:border-b-0 border-slate-200">
                        
                        {/* Arama Header'ı */}
                        <header className="bg-white h-auto lg:h-20 border-b border-slate-200 flex flex-col lg:flex-row items-center justify-between px-3 lg:px-8 py-3 lg:py-0 shrink-0 shadow-sm z-10 gap-3 lg:gap-0">
                            <div className="flex items-center justify-between w-full lg:w-1/4">
                                <div className="flex items-center gap-3">
                                    <button onClick={() => setMobilMenuAcik(true)} className="lg:hidden w-10 h-10 flex items-center justify-center text-slate-600 bg-slate-100 rounded-lg active:bg-slate-200">
                                        <i className="fas fa-bars text-lg"></i>
                                    </button>
                                    <h1 className="text-base lg:text-xl font-black text-slate-800 leading-none flex items-center"><i className="fas fa-bolt text-blue-500 mr-2"></i><span className="hidden sm:inline">Hızlı </span>Satış</h1>
                                </div>
                                {/* Mobilde Kas Aktif İkonu */}
                                <div className="lg:hidden flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase">Aktif</span>
                                </div>
                            </div>

                            <div className="w-full lg:flex-1 lg:max-w-xl lg:mx-4 relative">
                                <input 
                                    ref={aramaRef} type="text" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)}
                                    placeholder="Barkod okutun veya ürün arayın..." 
                                    className="w-full bg-slate-100 border border-slate-200 rounded-full px-4 lg:px-5 py-2 lg:py-3 pl-10 lg:pl-12 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-inner"
                                />
                                <i className="fas fa-barcode absolute left-4 lg:left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                {aramaMetni && <button onClick={() => setAramaMetni("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><i className="fas fa-times"></i></button>}
                            </div>

                            <div className="hidden lg:flex w-1/4 justify-end">
                                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Kasa Aktif</p>
                            </div>
                        </header>

                        {/* Ürün Grid'i */}
                        <div className="flex-1 overflow-y-auto p-3 lg:p-6 bg-slate-50">
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4 pb-10">
                                {filtrelenmisUrunler.map(urun => (
                                    <button key={urun.id} onClick={() => sepeteEkle(urun)} className="bg-white rounded-xl border border-slate-200 p-3 lg:p-4 text-left hover:shadow-lg hover:border-blue-300 transition-all group relative overflow-hidden flex flex-col min-h-[100px] lg:min-h-[120px] active:scale-95">
                                        <div className="flex-1">
                                            <p className="text-[9px] lg:text-[10px] font-black text-slate-400 mb-1">{urun.barkod || "Barkodsuz"}</p>
                                            <h3 className="text-xs lg:text-sm font-bold text-slate-800 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">{urun.urun_adi}</h3>
                                        </div>
                                        <div className="mt-3 lg:mt-4 flex items-end justify-between">
                                            <span className="text-sm lg:text-lg font-black text-blue-600">{parseTutar(urun.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</span>
                                            <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors"><i className="fas fa-plus text-xs lg:text-sm"></i></div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* SAĞ ALAN: ADİSYON / SEPET (PC tasarımı korundu, Mobilde alt yarıya geçti) */}
                    <div className="w-full lg:w-[380px] h-1/2 lg:h-full bg-white border-l-0 lg:border-l border-slate-200 shadow-2xl flex flex-col shrink-0 z-20">
                        <div className="h-12 lg:h-20 bg-slate-900 text-white flex items-center justify-between px-4 lg:px-6 shrink-0">
                            <h2 className="text-xs lg:text-sm font-black uppercase tracking-widest flex items-center gap-2"><i className="fas fa-receipt text-blue-400"></i> Satış Fişi</h2>
                            <span className="bg-slate-800 text-slate-300 text-[9px] lg:text-[10px] font-bold px-2 lg:px-3 py-1 rounded-full">{sepet.length} Kalem</span>
                        </div>

                        <div className="p-3 lg:p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                            <label className="text-[9px] lg:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 lg:mb-1.5 block">Cari Seçimi</label>
                            <select value={seciliCari || ""} onChange={(e) => setSeciliCari(Number(e.target.value) || null)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs lg:text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all">
                                <option value="">-- Perakende (Peşin) --</option>
                                {cariler.map(c => (<option key={c.id} value={c.id}>{c.cari_adi}</option>))}
                            </select>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/50 custom-scrollbar pb-6">
                            {sepet.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                    <i className="fas fa-shopping-cart text-3xl lg:text-4xl mb-2 lg:mb-3 opacity-20"></i>
                                    <p className="font-bold text-[10px] lg:text-xs uppercase tracking-widest">Sepet Boş</p>
                                </div>
                            ) : (
                                sepet.map((item) => (
                                    <div key={item.urun.id} className="bg-white border border-slate-100 p-2 lg:p-3 rounded-xl shadow-sm flex flex-col gap-2 group relative">
                                        <div className="flex justify-between items-start pr-6">
                                            <h4 className="text-[10px] lg:text-xs font-bold text-slate-800 leading-tight">{item.urun.urun_adi}</h4>
                                            <button onClick={() => sepettenCikar(item.urun.id)} className="absolute right-2 lg:right-3 top-2 lg:top-3 text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-trash-alt text-[10px] lg:text-base"></i></button>
                                        </div>
                                        <div className="flex items-center justify-between bg-slate-50 p-1.5 lg:p-2 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-0.5">
                                                <button onClick={() => miktarGuncelle(item.urun.id, item.miktar - 1)} className="w-5 h-5 lg:w-6 lg:h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded hover:text-red-500"><i className="fas fa-minus text-[8px] lg:text-[10px]"></i></button>
                                                <input type="number" value={item.miktar} onChange={(e) => miktarGuncelle(item.urun.id, Number(e.target.value))} className="w-6 lg:w-8 text-center text-[10px] lg:text-xs font-black text-slate-800 bg-transparent outline-none appearance-none" />
                                                <button onClick={() => miktarGuncelle(item.urun.id, item.miktar + 1)} className="w-5 h-5 lg:w-6 lg:h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded hover:text-blue-500"><i className="fas fa-plus text-[8px] lg:text-[10px]"></i></button>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[8px] lg:text-[9px] font-black text-slate-400 uppercase">Fiyat Değiştir</span>
                                                <div className="flex items-center">
                                                    <input type="number" value={item.fiyat} onChange={(e) => fiyatGuncelle(item.urun.id, Number(e.target.value))} className="w-12 lg:w-16 text-right text-xs lg:text-sm font-bold text-blue-600 bg-transparent outline-none border-b border-transparent focus:border-blue-300 transition-colors" />
                                                    <span className="text-[9px] lg:text-[10px] font-bold text-blue-600 ml-0.5 lg:ml-1">₺</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="bg-white border-t border-slate-200 p-3 lg:p-5 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                            <div className="flex justify-between items-end pb-2 lg:pb-4 mb-2 lg:mb-4 border-b border-dashed border-slate-200">
                                <span className="text-xs lg:text-sm font-black text-slate-800 uppercase tracking-widest">Toplam</span>
                                <span className="text-xl lg:text-2xl font-black text-emerald-600">{genelToplam.toLocaleString('tr-TR', {minimumFractionDigits:2})} <span className="text-sm lg:text-lg">₺</span></span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('NAKİT')} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 lg:p-3 rounded-lg font-black uppercase tracking-widest text-[9px] lg:text-[10px] flex items-center justify-center gap-1.5 lg:gap-2 transition-all active:scale-95 disabled:opacity-50"><i className="fas fa-money-bill-wave text-xs lg:text-sm"></i> Nakit</button>
                                <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('KREDİ KARTI')} className="bg-blue-500 hover:bg-blue-600 text-white p-2 lg:p-3 rounded-lg font-black uppercase tracking-widest text-[9px] lg:text-[10px] flex items-center justify-center gap-1.5 lg:gap-2 transition-all active:scale-95 disabled:opacity-50"><i className="fas fa-credit-card text-xs lg:text-sm"></i> Kart</button>
                            </div>
                            <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('VERESİYE')} className={`w-full p-2 lg:p-3 rounded-lg font-black uppercase tracking-widest text-[9px] lg:text-[10px] flex items-center justify-center gap-1.5 lg:gap-2 transition-all active:scale-95 disabled:opacity-50 ${!seciliCari ? 'bg-slate-100 text-slate-400 border-2 border-dashed border-slate-200' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
                                <i className="fas fa-book-open text-xs lg:text-sm"></i> {!seciliCari ? 'Veresiye (Cari Seçin)' : 'Açık Hesap (Veresiye)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}