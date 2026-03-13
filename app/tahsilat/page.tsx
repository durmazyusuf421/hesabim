"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Sirket { id: number; isletme_adi: string; rol: string; }
interface Kullanici { ad_soyad: string; email: string; rol: string; }
interface CariOzet { id: string; gercekId: number; tip: string; isim: string; bakiye: number; }
interface Kalem { id: number; cinsi: string; adi: string; tutar: string; aciklama: string; }
interface Evrak { islemTipi: string; seri: string; sira: string; tarih: string; cariId: string; cariAdi: string; bakiye: number; proje: string; personel: string; aciklama: string; }

// METNİ ONDALIKLI SAYIYA ÇEVİREN ERP FONKSİYONU
const parseTutarToFloat = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); } 
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

// SAYIYI TÜRK LİRASI FORMATINA (1.250,50) ÇEVİREN FONKSİYON
const formatTutarString = (val: number): string => {
    if (val === 0) return "";
    return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function TahsilatErpSayfasi() {
    const pathname = usePathname();
    const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);
    const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
    const [yukleniyor, setYukleniyor] = useState<boolean>(true);
    const [mobilMenuAcik, setMobilMenuAcik] = useState<boolean>(false);

    // YETKİ KONTROLLERİ (Yeni Menü İçin)
    const isYonetici = kullaniciRol.includes("YONETICI");
    const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
    const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
    const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;

    // Veri Stateleri
    const [cariler, setCariler] = useState<CariOzet[]>([]);
    const [gecmisHareketler, setGecmisHareketler] = useState<any[]>([]);
    const [gecmisModalAcik, setGecmisModalAcik] = useState<boolean>(false);
    
    // Form Stateleri
    const [evrak, setEvrak] = useState<Evrak>({
        islemTipi: "Tahsilat",
        seri: "THS",
        sira: Math.floor(Math.random() * 10000).toString(),
        tarih: new Date().toISOString().split('T')[0],
        cariId: "",
        cariAdi: "",
        bakiye: 0,
        proje: "",
        personel: "",
        aciklama: ""
    });

    const [kalemler, setKalemler] = useState<Kalem[]>([
        { id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }
    ]);

    useEffect(() => {
        const sirketStr = localStorage.getItem("aktifSirket");
        const kullaniciStr = localStorage.getItem("aktifKullanici");
        if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
        
        try {
            const sirket: Sirket = JSON.parse(sirketStr);
            const kullanici: Kullanici = JSON.parse(kullaniciStr);
            
            if (sirket.rol !== "TOPTANCI") { window.location.href = "/portal"; return; }

            setKullaniciRol(kullanici.rol || "");
            setAktifSirket(sirket);
            verileriGetir(sirket.id);
        } catch(err) { window.location.href = "/login"; }
    }, []);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            const resF = await supabase.from("firmalar").select("id, unvan, bakiye").eq("sahip_sirket_id", sirketId);
            const firmalar: CariOzet[] = (resF.data || []).map((f: any) => ({ id: `F-${f.id}`, gercekId: Number(f.id), tip: 'firma', isim: String(f.unvan || ""), bakiye: parseTutarToFloat(f.bakiye) }));

            const resC = await supabase.from("cari_kartlar").select("id, cari_adi, bakiye, borc_bakiye, alacak_bakiye").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`);
            const cariKartlar: CariOzet[] = (resC.data || []).map((c: any) => ({ id: `C-${c.id}`, gercekId: Number(c.id), tip: 'cari', isim: String(c.cari_adi || ""), bakiye: c.bakiye ? parseTutarToFloat(c.bakiye) : (parseTutarToFloat(c.borc_bakiye) - parseTutarToFloat(c.alacak_bakiye)) }));

            setCariler([...firmalar, ...cariKartlar].sort((a,b) => a.isim.localeCompare(b.isim)));
            
            const resH = await supabase.from("cari_hareketler").select("*").eq("sahip_sirket_id", sirketId).in("islem_tipi", ["Tahsilat", "Tediye"]).order("id", { ascending: false }).limit(30);
            if (resH.data) setGecmisHareketler(resH.data);

        } catch (error) { console.error("Veri çekme hatası:", error); }
        setYukleniyor(false);
    }

    const handleCariSecim = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const secilenId = e.target.value;
        const cari = cariler.find(c => c.id === secilenId);
        if (cari) {
            setEvrak({ ...evrak, cariId: cari.id, cariAdi: cari.isim, bakiye: cari.bakiye });
        } else {
            setEvrak({ ...evrak, cariId: "", cariAdi: "", bakiye: 0 });
        }
    };

    const formuTemizle = () => {
        setEvrak({
            ...evrak, seri: evrak.islemTipi === "Tahsilat" ? "THS" : "TDY", sira: Math.floor(Math.random() * 10000).toString(),
            cariId: "", cariAdi: "", bakiye: 0, proje: "", personel: "", aciklama: ""
        });
        setKalemler([{ id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }]);
    };

    const kalemEkle = () => {
        setKalemler([...kalemler, { id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }]);
    };

    const kalemSil = (id: number) => {
        if(kalemler.length === 1) {
            setKalemler([{ id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }]);
        } else {
            setKalemler(kalemler.filter(k => k.id !== id));
        }
    };

    const kalemGuncelle = (id: number, field: keyof Kalem, value: any) => {
        setKalemler(kalemler.map(k => k.id === id ? { ...k, [field]: value } : k));
    };

    const handleTutarFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (!evrak.cariId) {
            e.target.blur();
            alert("İşlem yapabilmek için lütfen önce sol üstten bir Müşteri/Cari seçiniz.");
        }
    };

    const handleTutarBlur = (id: number, val: string) => {
        const floatDeger = parseTutarToFloat(val);
        kalemGuncelle(id, "tutar", formatTutarString(floatDeger));
    };

    const evrakKaydet = async () => {
        if (!evrak.cariId) return alert("Lütfen Cari seçiniz!");
        const toplamTutarFloat = kalemler.reduce((acc, k) => acc + parseTutarToFloat(k.tutar), 0);
        if (toplamTutarFloat <= 0) return alert("Evrak toplamı 0 olamaz! Lütfen tabloya geçerli bir tutar girin.");

        setYukleniyor(true);
        try {
            const seciliGercekCari = cariler.find(c => c.id === evrak.cariId);
            if(!seciliGercekCari) throw new Error("Cari verisi bulunamadı");
            
            const insertData: any = {
                sahip_sirket_id: aktifSirket?.id,
                islem_tipi: evrak.islemTipi,
                aciklama: evrak.aciklama || `${evrak.islemTipi} Makbuzu`,
                tarih: new Date(evrak.tarih).toISOString(),
                borc: evrak.islemTipi === "Tediye" ? toplamTutarFloat : 0,
                alacak: evrak.islemTipi === "Tahsilat" ? toplamTutarFloat : 0
            };

            if (seciliGercekCari.tip === 'firma') insertData.firma_id = seciliGercekCari.gercekId;
            else insertData.cari_kart_id = seciliGercekCari.gercekId;

            const { error } = await supabase.from("cari_hareketler").insert([insertData]);
            if (error) { alert(`Kayıt Hatası: ${error.message}`); throw error; }

            const bakiyeDegisimi = evrak.islemTipi === "Tahsilat" ? -toplamTutarFloat : toplamTutarFloat;
            const yeniBakiye = seciliGercekCari.bakiye + bakiyeDegisimi;

            if (seciliGercekCari.tip === 'firma') {
                await supabase.from("firmalar").update({ bakiye: yeniBakiye }).eq("id", seciliGercekCari.gercekId);
            } else {
                await supabase.from("cari_kartlar").update({ bakiye: yeniBakiye }).eq("id", seciliGercekCari.gercekId);
            }

            alert("Evrak başarıyla kaydedildi!");
            formuTemizle();
            verileriGetir(aktifSirket?.id || 0);
        } catch (error) {
            console.error(error);
        }
        setYukleniyor(false);
    };

    const gecmisIslemSil = async (id: number) => {
        if(window.confirm("Bu makbuzu silmek istediğinize emin misiniz? (Cari bakiye otomatik geri alınmaz, sadece makbuz iptal edilir)")) {
            setYukleniyor(true);
            await supabase.from("cari_hareketler").delete().eq("id", id);
            verileriGetir(aktifSirket?.id || 0);
            alert("Makbuz silindi.");
        }
    };

    const cikisYap = () => { localStorage.clear(); window.location.href = "/login"; };
    
    const evrakToplamiFloat = kalemler.reduce((acc, k) => acc + parseTutarToFloat(k.tutar), 0);

    if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

    const getCariIsmiGecmis = (h: any) => {
        if (h.firma_id) { const f = cariler.find(c => c.tip === 'firma' && c.gercekId === h.firma_id); if (f) return f.isim; }
        if (h.cari_kart_id) { const c = cariler.find(c => c.tip === 'cari' && c.gercekId === h.cari_kart_id); if (c) return c.isim; }
        return "Bilinmeyen Müşteri";
    };

    return (
        <div className="bg-[#EAEAEA] font-sans h-screen flex overflow-hidden text-[#333] w-full relative text-[11px] md:text-xs selection:bg-blue-200">
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
                            
                            {/* AKTİF SAYFA BURASI (Tahsilat / Ödeme) */}
                            {isYonetici || isMuhasebe ? <Link href="/tahsilat" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/tahsilat" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-money-bill-wave w-6 text-blue-400"></i> Tahsilat / Ödeme</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
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

            {/* ANA ERP EKRANI (Tahsilat Formu) */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F0F0F0] relative w-full">
                
                {/* ÜST BAŞLIK */}
                <header className="h-8 bg-white border-b border-[#CCCCCC] flex items-center justify-between px-3 shrink-0 shadow-sm text-[11px] font-bold text-slate-700">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setMobilMenuAcik(true)} className="md:hidden w-6 h-6 flex items-center justify-center bg-[#EAEAEA] rounded"><i className="fas fa-bars"></i></button>
                        <i className="fas fa-coins text-emerald-600"></i> Tahsilat / Ödeme Makbuzları
                    </div>
                    {yukleniyor && <span className="text-blue-600"><i className="fas fa-spinner fa-spin mr-1"></i> İşlem Yapılıyor...</span>}
                </header>

                {/* ERP TOOLBAR */}
                <div className="h-12 bg-[#F8F8F8] border-b border-[#D4D4D4] flex items-center justify-between px-3 shrink-0 overflow-x-auto custom-scrollbar">
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={evrakKaydet} disabled={yukleniyor || !evrak.cariId} className="flex items-center px-4 py-1.5 bg-[#E6F0FA] border border-[#A0C8F0] rounded hover:bg-[#D2E6FA] font-bold text-blue-800 shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap">
                            <i className="fas fa-save mr-2"></i> Formu Kaydet
                        </button>
                        <button onClick={formuTemizle} className="flex items-center px-4 py-1.5 bg-white border border-[#CCCCCC] rounded hover:bg-red-50 text-red-600 shadow-sm font-semibold transition-colors whitespace-nowrap">
                            <i className="fas fa-eraser mr-2"></i> Temizle
                        </button>
                    </div>
                    
                    <button onClick={() => setGecmisModalAcik(true)} className="flex items-center px-4 py-1.5 bg-white border border-[#CCCCCC] rounded hover:bg-slate-100 text-slate-700 shadow-sm font-bold transition-colors whitespace-nowrap ml-2 shrink-0">
                        <i className="fas fa-history text-orange-500 mr-2"></i> Geçmiş Makbuzlar
                    </button>
                </div>

                <div className="p-3 bg-[#F0F0F0] border-b border-[#D4D4D4] shrink-0 overflow-y-auto">
                    <div className="flex flex-col lg:flex-row gap-4 max-w-6xl">
                        <div className="flex flex-col gap-1.5 flex-1 border border-[#CCCCCC] bg-white p-2 rounded shadow-sm">
                            <div className="flex items-center">
                                <label className="w-24 text-right pr-2 text-[#555] font-semibold">İşlem Tipi</label>
                                <select value={evrak.islemTipi} onChange={(e) => { setEvrak({...evrak, islemTipi: e.target.value, seri: e.target.value === "Tahsilat" ? "THS" : "TDY"}); }} className="border border-[#999999] px-1 py-0.5 outline-none focus:border-blue-500 bg-white w-32 font-bold cursor-pointer">
                                    <option value="Tahsilat">Tahsilat (Giriş)</option>
                                    <option value="Tediye">Tediye (Çıkış)</option>
                                </select>
                            </div>
                            <div className="flex items-center">
                                <label className="w-24 text-right pr-2 text-[#555] font-semibold">Evrak Seri/Sıra</label>
                                <div className="flex gap-1 w-32">
                                    <input type="text" value={evrak.seri} onChange={(e) => setEvrak({...evrak, seri: e.target.value.toUpperCase()})} className="border border-[#999999] px-1 py-0.5 outline-none focus:border-blue-500 w-10 uppercase bg-[#F8F8F8]" />
                                    <input type="text" value={evrak.sira} onChange={(e) => setEvrak({...evrak, sira: e.target.value})} className="border border-[#999999] px-1 py-0.5 outline-none focus:border-blue-500 flex-1 text-right" />
                                </div>
                            </div>
                            <div className="flex items-center">
                                <label className="w-24 text-right pr-2 text-[#555] font-semibold">Tarih</label>
                                <input type="date" value={evrak.tarih} onChange={(e) => setEvrak({...evrak, tarih: e.target.value})} className="border border-[#999999] px-1 py-0.5 outline-none focus:border-blue-500 w-32 cursor-pointer" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5 flex-1 border border-[#CCCCCC] bg-white p-2 rounded shadow-sm">
                            <div className="flex items-center relative">
                                <label className="w-20 text-right pr-2 text-[#555] font-semibold text-red-600">Cari Adı</label>
                                <select value={evrak.cariId} onChange={handleCariSecim} className={`border border-[#999999] px-1 py-0.5 outline-none focus:border-blue-500 flex-1 font-bold text-black cursor-pointer ${!evrak.cariId ? 'bg-yellow-200 animate-pulse' : 'bg-[#FFFFE0]'}`}>
                                    <option value="">-- İşlem İçin Cari Seçiniz --</option>
                                    {cariler.map(c => <option key={c.id} value={c.id}>{c.isim}</option>)}
                                </select>
                            </div>
                            <div className="flex items-center">
                                <label className="w-20 text-right pr-2 text-[#555] font-semibold">Döviz Cinsi</label>
                                <input type="text" disabled value="TL" className="border border-[#CCCCCC] px-1 py-0.5 bg-[#F0F0F0] w-12 text-center text-[#333] font-bold" />
                                <label className="w-20 text-right pr-2 text-[#555] font-semibold">Döviz Kuru</label>
                                <input type="text" disabled value="1,0000" className="border border-[#CCCCCC] px-1 py-0.5 bg-[#F0F0F0] w-16 text-right text-[#333]" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5 flex-1 border border-[#CCCCCC] bg-white p-2 rounded shadow-sm">
                            <div className="flex items-center">
                                <label className="w-20 text-right pr-2 text-[#555] font-semibold">Proje</label>
                                <input type="text" value={evrak.proje} onChange={(e) => setEvrak({...evrak, proje: e.target.value})} className="border border-[#999999] px-1 py-0.5 outline-none focus:border-blue-500 flex-1" />
                            </div>
                            <div className="flex items-center">
                                <label className="w-20 text-right pr-2 text-[#555] font-semibold">Personel</label>
                                <input type="text" value={evrak.personel} onChange={(e) => setEvrak({...evrak, personel: e.target.value})} className="border border-[#999999] px-1 py-0.5 outline-none focus:border-blue-500 flex-1" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 max-w-6xl flex items-center">
                        <label className="w-24 text-right pr-2 text-[#555] font-semibold">Genel Açıklama</label>
                        <input type="text" value={evrak.aciklama} onChange={(e) => setEvrak({...evrak, aciklama: e.target.value})} className="border border-[#999999] px-2 py-1 outline-none focus:border-blue-500 flex-1 shadow-inner bg-white" placeholder="Evrak geneli için açıklama giriniz..." />
                    </div>
                </div>

                <div className="flex px-2 mt-1 shrink-0 border-b border-[#CCCCCC]">
                    <div className="px-4 py-1.5 bg-white border border-[#CCCCCC] border-b-white -mb-[1px] font-bold text-blue-700 z-10 cursor-pointer shadow-sm">Kayıt Bilgileri (Kalemler)</div>
                </div>

                <div className="flex-1 bg-white border border-[#CCCCCC] mx-2 mb-2 relative overflow-auto shadow-inner">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
                        <thead className="bg-[#F4F4F4] sticky top-0 z-10">
                            <tr className="text-[10px] text-[#333] border-b border-[#CCCCCC]">
                                <th className="p-1 border-r border-[#CCCCCC] w-6 text-center bg-[#EAEAEA]"></th>
                                <th className="p-1.5 border-r border-[#CCCCCC] w-28">Ödeme Cinsi</th>
                                <th className="p-1.5 border-r border-[#CCCCCC] w-36">Kasa / Banka Adı</th>
                                <th className="p-1.5 border-r border-[#CCCCCC] w-32 text-right">TL Tutar</th>
                                <th className="p-1.5 border-r border-[#CCCCCC] w-24 text-right">Döviz Kuru</th>
                                <th className="p-1.5 border-r border-[#CCCCCC]">Açıklama (Satır)</th>
                                <th className="p-1 border-[#CCCCCC] w-12 text-center">
                                    <button onClick={kalemEkle} className="bg-[#E6F0FA] hover:bg-[#D2E6FA] text-blue-800 px-2 py-0.5 rounded border border-[#A0C8F0] font-bold shadow-sm cursor-pointer">
                                        <i className="fas fa-plus"></i> Ekle
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {kalemler.map((kalem, i) => (
                                <tr key={kalem.id} className="border-b border-[#EAEAEA] hover:bg-[#FFFFE0] focus-within:bg-[#E6F0FA] transition-colors h-8">
                                    <td className="p-1 border-r border-[#CCCCCC] text-center text-[#999] bg-[#F8F8F8] font-bold">{i + 1}</td>
                                    <td className="p-0 border-r border-[#CCCCCC]">
                                        <select value={kalem.cinsi} onChange={(e) => kalemGuncelle(kalem.id, "cinsi", e.target.value)} className="w-full h-full p-1.5 bg-transparent outline-none focus:bg-white text-red-700 font-semibold cursor-pointer">
                                            <option value="Nakit">Nakit</option>
                                            <option value="Kredi Kartı">Kredi Kartı</option>
                                            <option value="Havale/EFT">Havale/EFT</option>
                                            <option value="Çek">Çek / Senet</option>
                                        </select>
                                    </td>
                                    <td className="p-0 border-r border-[#CCCCCC]">
                                        <input type="text" value={kalem.adi} onChange={(e) => kalemGuncelle(kalem.id, "adi", e.target.value.toUpperCase())} className="w-full h-full p-1.5 bg-transparent outline-none text-red-700 font-semibold focus:bg-white uppercase" />
                                    </td>
                                    
                                    <td className="p-0 border-r border-[#CCCCCC]">
                                        <input 
                                            type="text" 
                                            value={kalem.tutar} 
                                            onFocus={handleTutarFocus}
                                            onChange={(e) => kalemGuncelle(kalem.id, "tutar", e.target.value)} 
                                            onBlur={(e) => handleTutarBlur(kalem.id, e.target.value)}
                                            className={`w-full h-full p-1.5 bg-transparent outline-none text-right font-black focus:bg-white ${evrak.islemTipi === 'Tahsilat' ? 'text-emerald-700' : 'text-blue-700'}`} 
                                            placeholder="0,00" 
                                        />
                                    </td>

                                    <td className="p-0 border-r border-[#CCCCCC]">
                                        <input disabled type="text" value="1,00" className="w-full h-full p-1.5 bg-[#F8F8F8] outline-none text-right text-slate-500 font-semibold" />
                                    </td>
                                    <td className="p-0 border-r border-[#CCCCCC]">
                                        <input type="text" value={kalem.aciklama} onChange={(e) => kalemGuncelle(kalem.id, "aciklama", e.target.value)} className="w-full h-full p-1.5 bg-transparent outline-none focus:bg-white" />
                                    </td>
                                    <td className="p-1 text-center">
                                        <button onClick={() => kalemSil(kalem.id)} className="text-red-400 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"><i className="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="h-auto sm:h-16 bg-[#F0F0F0] border-t border-[#CCCCCC] shrink-0 flex flex-col sm:flex-row items-center justify-between px-4 py-2 sm:py-0 shadow-inner gap-2 sm:gap-0">
                    <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-[#555] font-semibold text-xs">Ortalama Vade :</span>
                            <input type="text" disabled value={evrak.tarih.split('-').reverse().join('.')} className="border border-[#CCCCCC] px-2 py-1 bg-[#F8F8F8] w-24 text-center text-[#333] font-bold text-xs" />
                        </div>
                        <div className="flex items-center gap-2 border border-[#CCCCCC] px-3 py-1 bg-white shadow-sm rounded">
                            <span className="text-[#555] font-bold text-xs">Mevcut Bakiye :</span>
                            <span className={`font-black text-[13px] ${evrak.bakiye > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{evrak.bakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} ₺</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end border border-[#CCCCCC] p-1.5 bg-white shadow-sm min-w-[200px] rounded w-full sm:w-auto">
                        <div className="flex justify-between w-full border-b border-dashed border-[#DDD] mb-1">
                            <span className="text-[#555] font-semibold text-xs">Evrak Döviz Cinsi</span>
                            <span className="font-bold text-[#333] text-xs">TL (₺)</span>
                        </div>
                        <div className="flex justify-between w-full">
                            <span className="text-black font-bold text-sm">TL Toplam</span>
                            <span className={`font-black text-[15px] ${evrak.islemTipi === 'Tahsilat' ? 'text-emerald-700' : 'text-blue-800'}`}>{formatTutarString(evrakToplamiFloat)}</span>
                        </div>
                    </div>
                </div>

            </main>

            {gecmisModalAcik && (
                <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[70] backdrop-blur-sm p-4">
                    <div className="bg-white rounded shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-400 flex flex-col h-[80vh]">
                        <div className="p-3 bg-slate-800 border-b border-slate-900 flex justify-between items-center text-white shrink-0">
                            <h3 className="text-sm font-bold flex items-center uppercase tracking-widest"><i className="fas fa-history mr-2 text-orange-400"></i> Geçmiş Makbuz ve Hareketler</h3>
                            <button onClick={() => setGecmisModalAcik(false)} className="hover:text-red-400 transition-colors"><i className="fas fa-times text-lg"></i></button>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-50 p-4">
                            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px] border border-slate-300 bg-white shadow-sm">
                                <thead className="bg-[#F4F4F4] sticky top-0 z-10 border-b-2 border-[#CCCCCC]">
                                    <tr className="text-[11px] font-bold text-slate-600 uppercase">
                                        <th className="p-2 border-r border-[#CCCCCC] w-32">Tarih / Saat</th>
                                        <th className="p-2 border-r border-[#CCCCCC]">Cari Adı</th>
                                        <th className="p-2 border-r border-[#CCCCCC] w-24 text-center">İşlem Tipi</th>
                                        <th className="p-2 border-r border-[#CCCCCC] w-32 text-right">Tutar (TL)</th>
                                        <th className="p-2 border-r border-[#CCCCCC]">Açıklama</th>
                                        <th className="p-2 w-16 text-center">Sil</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {gecmisHareketler.length === 0 ? (
                                        <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">Kayıt Bulunamadı</td></tr>
                                    ) : (
                                        gecmisHareketler.map(h => {
                                            const isTahsilat = h.islem_tipi === "Tahsilat";
                                            const d = new Date(h.tarih || h.created_at);
                                            const tutarFloat = parseTutarToFloat(h.borc) > 0 ? parseTutarToFloat(h.borc) : parseTutarToFloat(h.alacak);
                                            return (
                                                <tr key={h.id} className="border-b border-[#EAEAEA] hover:bg-yellow-50 transition-colors text-xs text-slate-800">
                                                    <td className="p-2 border-r border-[#CCCCCC]">{d.toLocaleDateString('tr-TR')} {d.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</td>
                                                    <td className="p-2 border-r border-[#CCCCCC] font-semibold">{getCariIsmiGecmis(h)}</td>
                                                    <td className={`p-2 border-r border-[#CCCCCC] text-center font-bold ${isTahsilat ? 'text-emerald-600' : 'text-blue-600'}`}>{h.islem_tipi}</td>
                                                    <td className="p-2 border-r border-[#CCCCCC] text-right font-black">{formatTutarString(tutarFloat)}</td>
                                                    <td className="p-2 border-r border-[#CCCCCC] text-slate-500">{h.aciklama}</td>
                                                    <td className="p-2 text-center">
                                                        <button onClick={() => gecmisIslemSil(h.id)} className="text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded shadow-sm transition-colors text-[10px] font-bold">Sil</button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}