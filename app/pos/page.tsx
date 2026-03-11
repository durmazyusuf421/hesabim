"use client";
import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Sirket { id: number; isletme_adi: string; rol: string; email?: string; }
interface Kullanici { ad_soyad: string; email: string; rol: string; }
interface Urun { id: number; urun_adi: string; barkod?: string; satis_fiyati: any; }
interface Cari { id: number; cari_adi: string; }
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

export default function PosTerminal() {
    const pathname = usePathname();
    const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);
    const [kullaniciAdi, setKullaniciAdi] = useState("");
    const [kullaniciRol, setKullaniciRol] = useState(""); 
    const [yukleniyor, setYukleniyor] = useState(true);
    const [mobilMenuAcik, setMobilMenuAcik] = useState(false);

    // POS Verileri
    const [urunler, setUrunler] = useState<Urun[]>([]);
    const [cariler, setCariler] = useState<Cari[]>([]);
    const [sepet, setSepet] = useState<SepetItem[]>([]);
    const [seciliCari, setSeciliCari] = useState<number | null>(null);
    const [barkodInput, setBarkodInput] = useState("");
    const [aramaMetni, setAramaMetni] = useState("");
    const [islemBekliyor, setIslemBekliyor] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const s = localStorage.getItem("aktifSirket");
        const k = localStorage.getItem("aktifKullanici");
        if (!s || !k) { window.location.href = "/login"; return; }
        
        try {
            const sirket = JSON.parse(s);
            const kullanici = JSON.parse(k);
            setAktifSirket(sirket);
            setKullaniciAdi(kullanici.ad_soyad || "Kullanıcı");
            setKullaniciRol(kullanici.rol || "");
            verileriGetir(sirket.id);
        } catch(err) { window.location.href = "/login"; }
    }, []);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            const [uRes, cRes] = await Promise.all([
                supabase.from("urunler").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`),
                supabase.from("cari_kartlar").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`)
            ]);
            if (uRes.data) setUrunler(uRes.data);
            if (cRes.data) setCariler(cRes.data);
        } catch (error) { console.error("Veri hatası", error); }
        setYukleniyor(false);
        if (inputRef.current && window.innerWidth > 768) inputRef.current.focus();
    }

    // TÜRKÇE KARAKTER DUYARLI HIZLI ARAMA
    const hizliUrunler = urunler.filter(u => {
        if (!aramaMetni) return false;
        const aramaKucuk = aramaMetni.toLocaleLowerCase('tr-TR');
        const isimKucuk = u.urun_adi ? String(u.urun_adi).toLocaleLowerCase('tr-TR') : "";
        return isimKucuk.includes(aramaKucuk);
    }).slice(0, 12); // Ekrana sığması için max 12 ürün

    const sepeteEkle = (urun: Urun) => {
        setSepet(prev => {
            const varMi = prev.find(item => item.urun.id === urun.id);
            if (varMi) return prev.map(item => item.urun.id === urun.id ? { ...item, miktar: item.miktar + 1 } : item);
            return [...prev, { urun, miktar: 1, fiyat: parseTutar(urun.satis_fiyati) }];
        });
        setBarkodInput("");
        setAramaMetni("");
        if (inputRef.current && window.innerWidth > 768) inputRef.current.focus();
    };

    const barkodOkut = (e: React.FormEvent) => {
        e.preventDefault();
        if (!barkodInput.trim()) return;
        const urun = urunler.find(u => u.barkod === barkodInput.trim() || u.urun_adi.toLocaleLowerCase('tr-TR') === barkodInput.toLocaleLowerCase('tr-TR'));
        if (urun) sepeteEkle(urun);
        else { alert("Ürün sistemde bulunamadı!"); setBarkodInput(""); }
    };

    const genelToplam = sepet.reduce((acc, item) => acc + (item.fiyat * item.miktar), 0);
    const kdvToplam = genelToplam * 0.18; // Örnek KDV gösterimi
    const araToplam = genelToplam - kdvToplam;

    const satisiTamamla = async (odemeTipi: 'NAKİT' | 'KREDİ KARTI' | 'VERESİYE') => {
        if (sepet.length === 0) return;
        if (odemeTipi === 'VERESİYE' && !seciliCari) { alert("Veresiye işlem için Cari seçmelisiniz!"); return; }

        setIslemBekliyor(true);
        try {
            const musteriIsmi = seciliCari ? cariler.find(c => c.id === seciliCari)?.cari_adi : "Perakende Müşteri";
            const yeniSiparis = { 
                toptanci_id: aktifSirket?.id, 
                cari_id: seciliCari || null, 
                cari_adi: musteriIsmi, 
                durum: "Onaylandı", 
                toplam_tutar: genelToplam, 
                odeme_tipi: odemeTipi, 
                tarih: new Date().toISOString() 
            };
            
            const { error } = await supabase.from("siparisler").insert([yeniSiparis]);
            if (error) throw error;

            alert(`FİŞ ONAYLANDI\nÖdeme: ${odemeTipi}\nTutar: ${genelToplam.toLocaleString('tr-TR')} TL`);
            setSepet([]); setSeciliCari(null); setBarkodInput(""); setAramaMetni("");
        } catch (error) { alert("Kayıt sırasında hata oluştu!"); }
        setIslemBekliyor(false);
    };

    const cikisYap = () => { localStorage.clear(); window.location.href = "/login"; };
    const handleMenuClick = () => { if (window.innerWidth < 768) setMobilMenuAcik(false); };

    const isYonetici = kullaniciRol.includes("YONETICI");
    const sirketRol = aktifSirket?.rol || "TOPTANCI"; 

    if (!aktifSirket) return <div className="h-screen bg-[#e5e7eb]" />;

    return (
        <div className="bg-[#e5e7eb] font-sans h-[100dvh] flex overflow-hidden text-slate-900 w-full max-w-[100vw]">
            
            {/* MOBİL KARARTMA */}
            {mobilMenuAcik && <div className="fixed inset-0 bg-slate-900/60 z-40 md:hidden" onClick={() => setMobilMenuAcik(false)}></div>}

            {/* SOL MENÜ */}
            <aside className={`fixed md:static inset-y-0 left-0 z-50 w-[75vw] max-w-[280px] md:w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 transition-transform duration-300 ease-out ${mobilMenuAcik ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                <div className="h-16 flex items-center justify-between md:justify-center border-b border-slate-800 bg-slate-950 px-4 md:px-2 text-center">
                    <div className="flex flex-col items-start md:items-center w-full">
                        <span className={`text-[10px] font-bold uppercase mb-0.5 ${sirketRol === 'TOPTANCI' ? 'text-orange-500' : 'text-cyan-500'}`}>{isYonetici ? 'SİSTEM YÖNETİCİSİ' : 'PERSONEL HESABI'}</span>
                        <span className="text-xs truncate w-full text-slate-100 font-medium text-left md:text-center">{aktifSirket.isletme_adi}</span>
                    </div>
                    <button onClick={() => setMobilMenuAcik(false)} className="md:hidden text-slate-400 p-2"><i className="fas fa-times text-lg"></i></button>
                </div>
                
                <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                    {sirketRol === "TOPTANCI" ? (
                        <>
                            {isYonetici && <Link href="/dashboard" onClick={handleMenuClick} className="flex items-center px-6 py-3.5 text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-chart-pie w-6"></i> Panel</Link>}
                            <Link href="/pos" onClick={handleMenuClick} className="flex items-center px-6 py-3.5 bg-slate-800 text-white border-l-4 border-orange-500 font-bold"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                            <Link href="/" onClick={handleMenuClick} className="flex items-center px-6 py-3.5 text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-receipt w-6"></i> Siparişler</Link>
                            <Link href="/stok" onClick={handleMenuClick} className="flex items-center px-6 py-3.5 text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-box w-6"></i> Stok Kartları</Link>
                            <Link href="/cari" onClick={handleMenuClick} className="flex items-center px-6 py-3.5 text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-users w-6"></i> Müşteriler</Link>
                        </>
                    ) : (
                        <Link href="/portal/pos" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"><i className="fas fa-desktop w-6"></i> Sipariş Ver</Link>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800">
                    <button onClick={cikisYap} className="flex items-center px-2 py-3 text-red-400 hover:text-red-300 w-full text-xs font-bold uppercase tracking-wider text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
                </div>
            </aside>

            {/* ANA EKRAN */}
            <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative w-full bg-[#f3f4f6]">
                
                {/* ÜST BİLGİ ÇUBUĞU (Terminal Tarzı) */}
                <header className="h-12 bg-white border-b border-gray-300 flex items-center justify-between px-3 md:px-4 shrink-0 shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setMobilMenuAcik(true)} className="md:hidden text-gray-600 p-1 border border-gray-300 rounded bg-gray-50"><i className="fas fa-bars"></i></button>
                        <h1 className="text-sm font-black text-gray-800 tracking-tight uppercase"><i className="fas fa-cash-register text-gray-500 mr-2"></i> Kasa Terminali <span className="hidden sm:inline-block text-gray-400 font-normal text-xs ml-2">[Bilnex Entegrasyonlu]</span></h1>
                    </div>
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-widest hidden sm:block">Kullanıcı: {kullaniciAdi}</div>
                </header>

                {yukleniyor ? (
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <i className="fas fa-circle-notch fa-spin text-3xl text-gray-500 mb-3"></i>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest font-mono">Sistem Başlatılıyor...</span>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full">
                        
                        {/* 1. SOL ALAN: ADİSYON / FİŞ (PC'de %40, Mobilde üstte) */}
                        <section className="w-full lg:w-[40%] bg-white border-r border-gray-300 flex flex-col h-[45vh] lg:h-full shrink-0 z-20 shadow-md lg:shadow-none">
                            <div className="p-3 bg-gray-100 border-b border-gray-300 flex justify-between items-center shrink-0">
                                <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Aktif Fiş</h2>
                                <span className="text-xs font-mono font-bold text-gray-500">Tarih: {new Date().toLocaleDateString('tr-TR')}</span>
                            </div>

                            {/* FİŞ BAŞLIKLARI (Sadece PC'de veya geniş mobilde görünür) */}
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-300 flex text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                <span className="w-8 text-center">#</span>
                                <span className="flex-1">Ürün Adı / Kodu</span>
                                <span className="w-16 text-center">Miktar</span>
                                <span className="w-20 text-right">B.Fiyat</span>
                                <span className="w-20 text-right">Toplam</span>
                                <span className="w-16 text-center">İşlem</span>
                            </div>

                            {/* SEPET LİSTESİ */}
                            <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
                                {sepet.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-2">
                                        <i className="fas fa-receipt text-4xl"></i>
                                        <p className="font-bold text-xs uppercase tracking-widest">Fiş Bekliyor</p>
                                    </div>
                                ) : (
                                    sepet.map((item, idx) => (
                                        <div key={item.urun.id} className="flex items-center px-3 py-2 border-b border-gray-100 hover:bg-blue-50/50 transition-colors text-xs font-mono font-bold text-gray-800">
                                            <span className="w-8 text-center text-gray-400">{idx + 1}</span>
                                            <span className="flex-1 truncate pr-2 uppercase" title={item.urun.urun_adi}>{item.urun.urun_adi}</span>
                                            <span className="w-16 text-center bg-gray-100 rounded px-1 py-0.5 border border-gray-200">{item.miktar}</span>
                                            <span className="w-20 text-right text-gray-500">{item.fiyat.toFixed(2)}</span>
                                            <span className="w-20 text-right text-black">{(item.fiyat * item.miktar).toFixed(2)}</span>
                                            <div className="w-16 flex justify-center gap-1 pl-2">
                                                <button onClick={() => setSepet(s => s.map(i => i.urun.id === item.urun.id ? {...i, miktar: Math.max(1, i.miktar - 1)} : i))} className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded border border-gray-300 flex items-center justify-center">-</button>
                                                <button onClick={() => setSepet(s => s.map(i => i.urun.id === item.urun.id ? {...i, miktar: i.miktar + 1} : i))} className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded border border-gray-300 flex items-center justify-center">+</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* TOPLAM ALANI */}
                            <div className="bg-gray-100 border-t-2 border-gray-400 p-4 shrink-0 font-mono">
                                <div className="flex justify-between text-xs text-gray-600 font-bold mb-1">
                                    <span>ARA TOPLAM:</span>
                                    <span>{araToplam.toLocaleString('tr-TR', {minimumFractionDigits:2})} TL</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-600 font-bold mb-3 border-b border-gray-300 pb-2">
                                    <span>KDV (%18):</span>
                                    <span>{kdvToplam.toLocaleString('tr-TR', {minimumFractionDigits:2})} TL</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-black text-gray-800 uppercase">Genel Toplam:</span>
                                    <span className="text-2xl lg:text-3xl font-black text-black bg-white px-3 py-1 border-2 border-gray-400 rounded-md shadow-inner">[ {genelToplam.toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺ ]</span>
                                </div>
                            </div>
                        </section>

                        {/* 2. SAĞ ALAN: İŞLEM MERKEZİ */}
                        <section className="flex-1 flex flex-col bg-gray-50 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">
                            
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest hidden lg:block border-b-2 border-gray-300 pb-2">İşlem Merkezi</h2>

                            {/* BARKOD VE CARİ SEÇİMİ (Endüstriyel Form) */}
                            <div className="space-y-4 bg-white p-4 border border-gray-300 shadow-sm rounded-sm">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Barkod Giriş <span className="font-mono text-gray-400 ml-2">&gt; BARKOD/KOD:</span></label>
                                    <form onSubmit={barkodOkut} className="flex gap-2">
                                        <input 
                                            ref={inputRef} autoFocus type="text" value={barkodInput} onChange={(e) => setBarkodInput(e.target.value)}
                                            className="flex-1 border-2 border-gray-400 bg-gray-50 focus:bg-white focus:border-blue-600 px-3 py-2 md:py-3 text-lg font-mono font-bold text-gray-900 outline-none rounded-sm transition-colors"
                                        />
                                        <button type="submit" className="bg-gray-200 border-2 border-gray-400 text-gray-700 font-bold px-4 md:px-6 rounded-sm hover:bg-gray-300 active:bg-gray-400 uppercase text-xs md:text-sm">[EKLE]</button>
                                    </form>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Müşteri Seçimi (Cari) <span className="font-mono text-gray-400 ml-2">&gt; CARİ:</span></label>
                                    <select 
                                        value={seciliCari || ""} onChange={(e) => setSeciliCari(Number(e.target.value) || null)}
                                        className="w-full border-2 border-gray-400 bg-gray-50 focus:bg-white focus:border-blue-600 px-3 py-2 md:py-3 text-sm md:text-base font-bold text-gray-800 outline-none rounded-sm uppercase"
                                    >
                                        <option value="">--- PERAKENDE / NAKİT MÜŞTERİ ---</option>
                                        {cariler.map(c => <option key={c.id} value={c.id}>{c.cari_adi}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* HIZLI ÜRÜN ARAMA & BUTONLAR */}
                            <div className="bg-white p-4 border border-gray-300 shadow-sm rounded-sm flex-1 flex flex-col">
                                <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Hızlı Ürün Arama <span className="font-mono text-gray-400 ml-2">&gt; ARA:</span></label>
                                <div className="flex items-center gap-2 mb-4">
                                    <input 
                                        type="text" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} placeholder="(Örn: Şeker, Yağ, Un)"
                                        className="flex-1 border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 focus:bg-white rounded-sm"
                                    />
                                    {aramaMetni && <button onClick={() => setAramaMetni("")} className="px-3 py-2 border border-gray-300 bg-gray-100 hover:bg-red-100 hover:text-red-600 rounded-sm font-bold text-gray-500"><i className="fas fa-times"></i></button>}
                                </div>

                                {/* Arama Sonuçları Kartları */}
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 overflow-y-auto max-h-[150px] md:max-h-[200px] custom-scrollbar mb-4">
                                    {aramaMetni && hizliUrunler.length === 0 && <div className="col-span-full text-center text-xs font-bold text-gray-400 py-4">Ürün Bulunamadı</div>}
                                    {hizliUrunler.map(urun => (
                                        <button key={urun.id} onClick={() => sepeteEkle(urun)} className="border-2 border-orange-200 bg-orange-50/30 hover:bg-orange-100 hover:border-orange-400 p-2 rounded-sm text-left flex flex-col justify-between transition-colors active:scale-95">
                                            <span className="text-[10px] md:text-xs font-black text-gray-800 leading-tight line-clamp-2 uppercase">{urun.urun_adi}</span>
                                            <span className="text-xs font-mono font-bold text-orange-700 mt-1">({parseTutar(urun.satis_fiyati)} ₺)</span>
                                        </button>
                                    ))}
                                </div>

                                {/* ÖDEME VE İŞLEM BUTONLARI (Alt kısma yaslı) */}
                                <div className="mt-auto grid grid-cols-2 gap-2 md:gap-3">
                                    <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla("NAKİT")} className="bg-[#1e7e34] hover:bg-[#155d27] disabled:opacity-50 text-white font-bold py-4 md:py-5 rounded-sm flex flex-col items-center justify-center gap-1 transition-colors border-b-4 border-[#124d20] active:border-b-0 active:translate-y-1">
                                        <span className="text-[10px] md:text-xs text-green-200 font-mono">[F9]</span>
                                        <span className="text-sm md:text-base uppercase tracking-widest">Nakit Ödeme</span>
                                    </button>
                                    <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla("KREDİ KARTI")} className="bg-[#1e7e34] hover:bg-[#155d27] disabled:opacity-50 text-white font-bold py-4 md:py-5 rounded-sm flex flex-col items-center justify-center gap-1 transition-colors border-b-4 border-[#124d20] active:border-b-0 active:translate-y-1">
                                        <span className="text-[10px] md:text-xs text-green-200 font-mono">[F10]</span>
                                        <span className="text-sm md:text-base uppercase tracking-widest">Kredi Kartı</span>
                                    </button>
                                    <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla("VERESİYE")} className="bg-[#d35400] hover:bg-[#a84300] disabled:opacity-50 text-white font-bold py-4 md:py-5 rounded-sm flex flex-col items-center justify-center gap-1 transition-colors border-b-4 border-[#823400] active:border-b-0 active:translate-y-1">
                                        <span className="text-[10px] md:text-xs text-orange-200 font-mono">[F11]</span>
                                        <span className="text-sm md:text-base uppercase tracking-widest">Veresiye Yaz</span>
                                    </button>
                                    <button disabled={islemBekliyor || sepet.length === 0} onClick={() => {if(window.confirm('Fişi tamamen iptal etmek istediğinize emin misiniz?')) setSepet([])}} className="bg-[#c0392b] hover:bg-[#962d22] disabled:opacity-50 text-white font-bold py-4 md:py-5 rounded-sm flex flex-col items-center justify-center gap-1 transition-colors border-b-4 border-[#78241b] active:border-b-0 active:translate-y-1">
                                        <span className="text-[10px] md:text-xs text-red-200 font-mono">[ESC]</span>
                                        <span className="text-sm md:text-base uppercase tracking-widest">Fişi İptal Et</span>
                                    </button>
                                </div>
                            </div>

                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}