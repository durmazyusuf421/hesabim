"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface CariOzet { id: string; gercekId: number; tip: string; isim: string; bakiye: number; telefon?: string; }
interface HareketKaydi { id: string; tarih: string; islemTipi: string; aciklama: string; borc: number; alacak: number; kategori: 'SIPARIS' | 'ODEME'; }
interface YeniCariData { kodu: string; isim: string; tip: 'firma' | 'cari'; bakiye: string; telefon: string; telefon2: string; email: string; il: string; ilce: string; adres: string; vergiDairesi: string; vergiNo: string; }

const parseTutar = (val: any): number => {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); } 
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

const formatTutar = (val: number): string => {
    if (val === 0 || isNaN(val)) return "0,00";
    return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function CariKartlarSayfasi() {
    const pathname = usePathname();
    const [aktifSirket, setAktifSirket] = useState<any>(null);
    const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
    const [yukleniyor, setYukleniyor] = useState<boolean>(true);
    const [mobilMenuAcik, setMobilMenuAcik] = useState<boolean>(false);

    const isYonetici = kullaniciRol.includes("YONETICI");
    const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
    const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
    const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;

    const [cariler, setCariler] = useState<CariOzet[]>([]);
    const [aramaMetni, setAramaMetni] = useState("");

    const [modalAcik, setModalAcik] = useState<boolean>(false);
    const [seciliCari, setSeciliCari] = useState<CariOzet | null>(null);
    const [hareketler, setHareketler] = useState<HareketKaydi[]>([]);
    const [hareketYukleniyor, setHareketYukleniyor] = useState<boolean>(false);
    const [filtre, setFiltre] = useState<'TUMU' | 'SIPARIS' | 'ODEME'>('TUMU');

    const [yeniCariModalAcik, setYeniCariModalAcik] = useState<boolean>(false);
    const [islemBekliyor, setIslemBekliyor] = useState<boolean>(false);
    const [aktifSekme, setAktifSekme] = useState<"genel" | "iletisim">("genel");
    const [yeniCari, setYeniCari] = useState<YeniCariData>({ 
        kodu: "", isim: "", tip: "firma", bakiye: "", 
        telefon: "", telefon2: "", email: "", il: "", ilce: "", adres: "", vergiDairesi: "", vergiNo: "" 
    });

    useEffect(() => {
        const sirketStr = localStorage.getItem("aktifSirket");
        const kullaniciStr = localStorage.getItem("aktifKullanici");
        if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
        
        try {
            const sirket = JSON.parse(sirketStr);
            const kullanici = JSON.parse(kullaniciStr);
            if (sirket.rol !== "TOPTANCI") { window.location.href = "/portal"; return; }
            setKullaniciRol(kullanici.rol || "");
            setAktifSirket(sirket);
            verileriGetir(sirket.id);
        } catch(err) { window.location.href = "/login"; }
    }, []);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            const resF = await supabase.from("firmalar").select("id, unvan, bakiye, telefon").eq("sahip_sirket_id", sirketId);
            const firmalar: CariOzet[] = (resF.data || []).map((f: any) => ({ 
                id: `F-${f.id}`, gercekId: Number(f.id), tip: 'firma', isim: String(f.unvan || ""), bakiye: parseTutar(f.bakiye), telefon: f.telefon || "" 
            }));

            const resC = await supabase.from("cari_kartlar").select("id, cari_adi, bakiye, borc_bakiye, alacak_bakiye, telefon").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`);
            const cariKartlar: CariOzet[] = (resC.data || []).map((c: any) => ({ 
                id: `C-${c.id}`, gercekId: Number(c.id), tip: 'cari', isim: String(c.cari_adi || ""), bakiye: c.bakiye ? parseTutar(c.bakiye) : (parseTutar(c.borc_bakiye) - parseTutar(c.alacak_bakiye)), telefon: c.telefon || "" 
            }));

            setCariler([...firmalar, ...cariKartlar].sort((a,b) => a.isim.localeCompare(b.isim)));
        } catch (error) { console.error("Veri çekme hatası:", error); }
        setYukleniyor(false);
    }

    const yeniCariEkraniAc = () => {
        setYeniCari({ 
            kodu: "C" + Math.floor(10000 + Math.random() * 90000).toString(),
            isim: "", tip: "firma", bakiye: "", telefon: "", telefon2: "", email: "", il: "", ilce: "", adres: "", vergiDairesi: "", vergiNo: "" 
        });
        setAktifSekme("genel");
        setYeniCariModalAcik(true);
    };

    const cariKaydet = async () => {
        if (!yeniCari.isim.trim()) return alert("Lütfen cari adını / ünvanını giriniz!");
        setIslemBekliyor(true);
        try {
            const baslangicBakiyesi = parseTutar(yeniCari.bakiye);
            if (yeniCari.tip === 'firma') {
                const { error } = await supabase.from('firmalar').insert([{
                    unvan: yeniCari.isim.trim(), bakiye: baslangicBakiyesi, telefon: yeniCari.telefon, sahip_sirket_id: aktifSirket.id
                }]);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('cari_kartlar').insert([{
                    cari_adi: yeniCari.isim.trim(), bakiye: baslangicBakiyesi, telefon: yeniCari.telefon, sahip_sirket_id: aktifSirket.id
                }]);
                if (error) throw error;
            }
            alert("Cari kart başarıyla oluşturuldu!");
            setYeniCariModalAcik(false);
            verileriGetir(aktifSirket.id);
        } catch (error: any) { alert(`Kayıt sırasında hata oluştu: ${error.message}`); }
        setIslemBekliyor(false);
    };

    const cariSil = async (cari: CariOzet) => {
        if (!window.confirm(`DİKKAT!\n\n"${cari.isim}" isimli cariyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) return;
        setYukleniyor(true);
        try {
            if (cari.tip === 'firma') {
                const { error } = await supabase.from('firmalar').delete().eq('id', cari.gercekId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('cari_kartlar').delete().eq('id', cari.gercekId);
                if (error) throw error;
            }
            alert("Cari başarıyla silindi.");
            verileriGetir(aktifSirket.id);
        } catch (error: any) { alert(`Silme başarısız! Muhtemelen bu cariye ait geçmiş sipariş veya tahsilat kayıtları mevcut.\nSistem Hatası: ${error.message}`); }
        setYukleniyor(false);
    };

    const cariHareketleriGetir = async (cari: CariOzet) => {
        setSeciliCari(cari);
        setModalAcik(true);
        setHareketYukleniyor(true);
        setFiltre('TUMU');
        setHareketler([]);
        try {
            let combinedData: HareketKaydi[] = [];
            const hareketFiltre = cari.tip === 'firma' ? { firma_id: cari.gercekId } : { cari_kart_id: cari.gercekId };
            const { data: dHareket } = await supabase.from('cari_hareketler').select('*').match(hareketFiltre);
            
            if (dHareket) {
                dHareket.forEach((h: any) => {
                    combinedData.push({
                        id: `H-${h.id}`, tarih: h.tarih || h.created_at, islemTipi: h.islem_tipi, aciklama: h.aciklama || "Kasa İşlemi",
                        borc: parseTutar(h.borc), alacak: parseTutar(h.alacak), kategori: 'ODEME'
                    });
                });
            }

            const siparisFiltre = cari.tip === 'firma' ? { alici_firma_id: cari.gercekId } : { cari_id: cari.gercekId };
            const { data: dSiparis } = await supabase.from('siparisler').select('*').match(siparisFiltre);

            if (dSiparis) {
                dSiparis.forEach((s: any) => {
                    if (s.durum !== "İptal Edildi" && s.durum !== "REDDEDILDI") {
                        const tutar = parseTutar(s.toplam_tutar);
                        combinedData.push({
                            id: `S-${s.id}`, tarih: s.tarih || s.created_at, islemTipi: 'Sipariş (Satış)',
                            aciklama: s.siparis_no ? `Sipariş #${s.siparis_no}` : `Sipariş Fişi`, borc: tutar, alacak: 0, kategori: 'SIPARIS'
                        });
                    }
                });
            }
            combinedData.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
            setHareketler(combinedData);
        } catch (error) { console.error("Hareket çekme hatası:", error); }
        setHareketYukleniyor(false);
    };

    const cikisYap = () => { localStorage.clear(); window.location.href = "/login"; };

    const filtrelenmisCariler = cariler.filter(c => c.isim.toLowerCase().includes(aramaMetni.toLowerCase()));
    const gosterilenHareketler = hareketler.filter(h => filtre === 'TUMU' ? true : h.kategori === filtre);

    if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

    return (
        <div className="bg-[#EAEAEA] font-sans h-screen flex overflow-hidden text-[#333] w-full relative text-[11px] md:text-xs">
            {mobilMenuAcik && <div className="fixed inset-0 bg-slate-900/60 z-40 md:hidden" onClick={() => setMobilMenuAcik(false)}></div>}

            {/* --- TAM DONANIMLI VE YETKİ KONTROLLÜ SOL MENÜ --- */}
            <aside className={`w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden fixed md:static inset-y-0 left-0 z-50 transition-transform duration-300 ease-out ${mobilMenuAcik ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center relative">
                    <span className="text-orange-500 text-[10px] uppercase mb-0.5">{isYonetici ? 'Sistem Yöneticisi' : 'Personel Hesabı'}</span>
                    <span className="text-xs truncate w-full">{aktifSirket?.isletme_adi}</span>
                    <button onClick={() => setMobilMenuAcik(false)} className="md:hidden absolute right-4 text-slate-400 hover:text-white"><i className="fas fa-times text-lg"></i></button>
                </div>
                
                <nav className="flex-1 py-4 space-y-1 overflow-y-auto custom-scrollbar">
                    {aktifSirket?.rol === "TOPTANCI" ? (
                        <>
                            {isYonetici ? <Link href="/dashboard" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isPlasiyer || isDepocu ? <Link href="/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/pos" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isPlasiyer || isDepocu ? <Link href="/" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {isYonetici || isMuhasebe ? <Link href="/tahsilat" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/tahsilat" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-money-bill-wave w-6"></i> Tahsilat / Ödeme <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isMuhasebe ? <Link href="/faturalar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {isYonetici || isDepocu ? <Link href="/stok" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            {isYonetici || isDepocu ? <Link href="/stok-hareketleri" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {/* CARİ KARTLAR (Aktif Sayfa) */}
                            {isYonetici || isPlasiyer || isMuhasebe ? <Link href="/cari" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6 text-blue-400"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                            
                            {isYonetici || isMuhasebe ? <Link href="/ekstre" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                        </>
                    ) : (
                        <Link href="/portal/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
                    {isYonetici ? <Link href="/ayarlar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link> : <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                    <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
                </div>
            </aside>

            {/* ANA EKRAN */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F0F0F0] relative w-full">
                
                {/* LİSTE ÜST BAŞLIK */}
                <header className="h-14 bg-white border-b border-[#CCCCCC] flex items-center justify-between px-4 shrink-0 shadow-sm text-[12px] font-bold text-slate-700">
                    <div className="flex items-center gap-3">
                        <button onClick={() => window.dispatchEvent(new Event('openMobilMenu'))} className="md:hidden w-8 h-8 bg-slate-100 rounded flex items-center justify-center text-slate-600"><i className="fas fa-bars"></i></button>
                        <i className="fas fa-address-book text-blue-600 text-lg"></i> 
                        <span className="text-sm hidden sm:inline">Cari Kart Listesi ve Bakiye Takibi</span>
                        {yukleniyor && <i className="fas fa-circle-notch fa-spin text-blue-500 ml-2"></i>}
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative w-48 sm:w-64">
                            <input type="text" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} placeholder="Cari Adı Ara..." className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                            <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        </div>
                        <button onClick={yeniCariEkraniAc} className="bg-[#E6F0FA] hover:bg-[#D2E6FA] border border-[#A0C8F0] text-blue-800 px-3 py-1.5 rounded text-[11px] font-bold shadow-sm transition-colors flex items-center">
                            <i className="fas fa-plus mr-1.5"></i> Yeni Kayıt
                        </button>
                    </div>
                </header>

                {/* CARİ LİSTESİ TABLOSU */}
                <div className="flex-1 overflow-auto bg-white p-4 custom-scrollbar">
                    <div className="border border-[#CCCCCC] rounded shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                            <thead className="bg-[#F8F8F8] sticky top-0 z-10 shadow-sm">
                                <tr className="text-[11px] font-bold text-[#555] uppercase border-b-2 border-[#CCCCCC]">
                                    <th className="p-3 border-r border-[#E0E0E0] w-12 text-center">No</th>
                                    <th className="p-3 border-r border-[#E0E0E0]">Cari Ünvanı / Müşteri Adı</th>
                                    <th className="p-3 border-r border-[#E0E0E0] w-28 text-center">Tipi</th>
                                    <th className="p-3 border-r border-[#E0E0E0] w-32 text-right">Güncel Bakiye</th>
                                    <th className="p-3 w-40 text-center">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrelenmisCariler.length === 0 ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-[#999] font-bold">Listelenecek Müşteri/Cari Bulunamadı.</td></tr>
                                ) : (
                                    filtrelenmisCariler.map((cari, idx) => (
                                        <tr key={cari.id} className="border-b border-[#EAEAEA] hover:bg-[#F0F8FF] transition-colors group">
                                            <td className="p-2 border-r border-[#EAEAEA] text-center text-[#999] font-semibold">{idx + 1}</td>
                                            <td className="p-2 border-r border-[#EAEAEA] font-bold text-[#333] group-hover:text-blue-700">{cari.isim}</td>
                                            <td className="p-2 border-r border-[#EAEAEA] text-center">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${cari.tip === 'firma' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'}`}>
                                                    {cari.tip === 'firma' ? 'B2B Firma' : 'Perakende'}
                                                </span>
                                            </td>
                                            <td className={`p-2 border-r border-[#EAEAEA] text-right font-black text-[13px] ${cari.bakiye > 0 ? 'text-red-600' : (cari.bakiye < 0 ? 'text-emerald-600' : 'text-slate-500')}`}>
                                                {formatTutar(cari.bakiye)} ₺
                                            </td>
                                            <td className="p-2 text-center flex items-center justify-center gap-2">
                                                <button onClick={() => cariHareketleriGetir(cari)} className="bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1 rounded text-[10px] font-bold transition-all flex items-center shadow-sm">
                                                    <i className="fas fa-list-alt mr-1.5"></i> Ekstre
                                                </button>
                                                <button onClick={() => cariSil(cari)} className="bg-white hover:bg-red-50 text-red-500 border border-red-200 w-7 h-6 rounded transition-all flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100" title="Cariyi Sil">
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* --- BİLNEX / ERP TARZI YENİ CARİ KAYIT MODALI --- */}
            {yeniCariModalAcik && (
                <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[80] backdrop-blur-sm p-4">
                    <div className="bg-[#EAEAEA] rounded shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-400 flex flex-col max-h-[90vh]">
                        
                        <div className="p-2 bg-[#F8F8F8] border-b border-[#CCCCCC] flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <button onClick={cariKaydet} disabled={islemBekliyor} className="flex items-center px-4 py-1 bg-white border border-[#A0C8F0] rounded hover:bg-[#E6F0FA] text-blue-800 font-bold shadow-sm text-xs disabled:opacity-50">
                                    <i className="fas fa-save mr-1.5"></i> Kaydet
                                </button>
                                <button disabled className="flex items-center px-3 py-1 bg-white border border-[#CCCCCC] rounded opacity-50 shadow-sm text-xs text-slate-600 font-bold">
                                    <i className="fas fa-trash-alt mr-1.5"></i> Sil
                                </button>
                            </div>
                            <button onClick={() => setYeniCariModalAcik(false)} className="px-3 py-1 bg-white border border-[#CCCCCC] rounded hover:bg-red-50 text-red-600 shadow-sm text-xs font-bold"><i className="fas fa-times mr-1"></i> Kapat</button>
                        </div>

                        <div className="p-3 bg-[#F0F0F0] border-b border-[#D4D4D4] shrink-0">
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-1.5">
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-[#555] font-semibold text-[11px]">Kodu</label>
                                        <input type="text" disabled value={yeniCari.kodu} className="border border-[#999999] px-2 py-0.5 bg-[#FFFFE0] font-bold text-blue-800 w-32 outline-none" />
                                    </div>
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-[#555] font-semibold text-red-600 text-[11px]">Cari Adı / Ünvan</label>
                                        <input type="text" autoFocus value={yeniCari.isim} onChange={(e) => setYeniCari({...yeniCari, isim: e.target.value.toUpperCase()})} className="border border-[#999999] px-2 py-0.5 focus:border-blue-500 bg-white flex-1 outline-none uppercase font-bold text-[#333]" />
                                    </div>
                                </div>
                                <div className="w-80 space-y-1.5">
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-[#555] font-semibold text-[11px]">Döviz Cinsi</label>
                                        <select disabled className="border border-[#CCCCCC] px-1 py-0.5 bg-[#F8F8F8] flex-1 text-[#333]"><option>TL</option></select>
                                    </div>
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-[#555] font-semibold text-[11px]">Cari Tipi</label>
                                        <select value={yeniCari.tip} onChange={(e) => setYeniCari({...yeniCari, tip: e.target.value as any})} className="border border-[#999999] px-1 py-0.5 focus:border-blue-500 bg-white flex-1 font-bold text-[#333] outline-none cursor-pointer">
                                            <option value="firma">B2B Kurumsal Firma</option>
                                            <option value="cari">Perakende Müşteri</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="w-24 h-24 border border-[#CCCCCC] bg-white flex flex-col items-center justify-center text-[#999] shadow-inner shrink-0">
                                    <i className="fas fa-camera text-2xl mb-1"></i>
                                    <span className="text-[9px] text-center px-1 leading-tight">Resim Dosyası Yok</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex px-2 pt-2 bg-[#F0F0F0] border-b border-[#CCCCCC] shrink-0">
                            <button onClick={() => setAktifSekme('genel')} className={`px-4 py-1.5 border border-[#CCCCCC] -mb-[1px] font-bold text-[11px] ${aktifSekme === 'genel' ? 'bg-white border-b-white text-blue-700' : 'bg-[#EAEAEA] text-[#666] hover:bg-[#F8F8F8]'}`}>1: Genel Bilgiler</button>
                            <button onClick={() => setAktifSekme('iletisim')} className={`px-4 py-1.5 border border-[#CCCCCC] border-l-0 -mb-[1px] font-bold text-[11px] ${aktifSekme === 'iletisim' ? 'bg-white border-b-white text-blue-700' : 'bg-[#EAEAEA] text-[#666] hover:bg-[#F8F8F8]'}`}>2: İletişim ve Adres</button>
                        </div>

                        <div className="flex-1 bg-white p-4 overflow-y-auto">
                            {aktifSekme === 'genel' && (
                                <div className="flex gap-8 max-w-4xl">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">Vergi Dairesi</label><input type="text" value={yeniCari.vergiDairesi} onChange={e=>setYeniCari({...yeniCari, vergiDairesi: e.target.value.toUpperCase()})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1 uppercase" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">V.D. No / T.C.</label><input type="text" value={yeniCari.vergiNo} onChange={e=>setYeniCari({...yeniCari, vergiNo: e.target.value})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1" /></div>
                                        <div className="flex items-center pt-4 border-t border-dashed border-[#EEE]"><label className="w-28 text-right pr-2 text-[#555] font-bold text-[11px] text-orange-600">Açılış Bakiyesi</label><input type="number" value={yeniCari.bakiye} onChange={e=>setYeniCari({...yeniCari, bakiye: e.target.value})} className="border border-[#999999] px-2 py-1 outline-none focus:border-emerald-500 flex-1 font-black text-right shadow-inner bg-[#F8F8F8]" placeholder="0.00" /></div>
                                        <div className="flex justify-end"><span className="text-[9px] text-[#999]">* Geçmişten devreden alacağınız varsa buraya yazınız.</span></div>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">Grubu</label><select className="border border-[#CCCCCC] px-1 py-1 flex-1 text-[#333] outline-none"><option></option></select></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">Sektörü</label><select className="border border-[#CCCCCC] px-1 py-1 flex-1 text-[#333] outline-none"><option></option></select></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">Çalışma Şekli</label><select className="border border-[#CCCCCC] px-1 py-1 flex-1 text-[#333] outline-none"><option>Kredi</option><option>Peşin</option></select></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">Vade (Gün)</label><input type="number" defaultValue="0" className="border border-[#CCCCCC] px-2 py-1 outline-none w-16 text-right" /></div>
                                    </div>
                                </div>
                            )}

                            {aktifSekme === 'iletisim' && (
                                <div className="flex gap-8 max-w-4xl">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-start"><label className="w-28 text-right pr-2 mt-1 text-[#555] font-semibold text-[11px]">Açık Adres</label><textarea value={yeniCari.adres} onChange={e=>setYeniCari({...yeniCari, adres: e.target.value})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1 h-16 resize-none" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">İl</label><input type="text" value={yeniCari.il} onChange={e=>setYeniCari({...yeniCari, il: e.target.value.toUpperCase()})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1 uppercase" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">İlçe</label><input type="text" value={yeniCari.ilce} onChange={e=>setYeniCari({...yeniCari, ilce: e.target.value.toUpperCase()})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1 uppercase" /></div>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">Telefon 1 (Gsm)</label><input type="text" value={yeniCari.telefon} onChange={e=>setYeniCari({...yeniCari, telefon: e.target.value})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1" placeholder="05XX XXX XX XX" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">Telefon 2</label><input type="text" value={yeniCari.telefon2} onChange={e=>setYeniCari({...yeniCari, telefon2: e.target.value})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-[#555] font-semibold text-[11px]">E-Mail</label><input type="email" value={yeniCari.email} onChange={e=>setYeniCari({...yeniCari, email: e.target.value})} className="border border-[#CCCCCC] px-2 py-1 outline-none focus:border-blue-500 flex-1" /></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- CARİ EKSTRE MODALI --- */}
            {modalAcik && seciliCari && (
                <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[70] backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[85vh] border border-slate-300">
                        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0 border-b border-slate-900">
                            <div>
                                <h3 className="text-base font-bold flex items-center"><i className="fas fa-file-invoice-dollar mr-2 text-blue-400"></i> {seciliCari.isim}</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-widest">Cari Hesap Ekstresi ve Geçmiş İşlemler</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right hidden sm:block bg-slate-900 px-3 py-1 rounded border border-slate-700">
                                    <span className="text-[10px] text-slate-400 block uppercase">Güncel Bakiye</span>
                                    <span className={`font-black text-sm ${seciliCari.bakiye > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{formatTutar(seciliCari.bakiye)} ₺</span>
                                </div>
                                <button onClick={() => setModalAcik(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700 hover:bg-red-500 transition-colors text-white"><i className="fas fa-times"></i></button>
                            </div>
                        </div>

                        <div className="bg-[#F8F8F8] px-4 py-2 border-b border-[#CCCCCC] flex gap-2 shrink-0">
                            <button onClick={() => setFiltre('TUMU')} className={`px-4 py-1.5 rounded font-bold text-[11px] transition-all ${filtre === 'TUMU' ? 'bg-slate-700 text-white shadow-inner' : 'bg-white border border-[#CCC] text-slate-600 hover:bg-slate-100'}`}><i className="fas fa-list mr-1"></i> Tüm Hareketler</button>
                            <button onClick={() => setFiltre('SIPARIS')} className={`px-4 py-1.5 rounded font-bold text-[11px] transition-all ${filtre === 'SIPARIS' ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border border-[#CCC] text-blue-700 hover:bg-blue-50'}`}><i className="fas fa-box-open mr-1"></i> Sadece Siparişler (Aldıkları)</button>
                            <button onClick={() => setFiltre('ODEME')} className={`px-4 py-1.5 rounded font-bold text-[11px] transition-all ${filtre === 'ODEME' ? 'bg-emerald-600 text-white shadow-inner' : 'bg-white border border-[#CCC] text-emerald-700 hover:bg-emerald-50'}`}><i className="fas fa-money-bill-wave mr-1"></i> Sadece Ödemeler (Tahsilat)</button>
                        </div>

                        <div className="flex-1 overflow-auto bg-white p-4 custom-scrollbar">
                            {hareketYukleniyor ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400"><i className="fas fa-circle-notch fa-spin text-3xl mb-3 text-blue-500"></i><p className="font-bold tracking-widest uppercase text-xs">Kayıtlar Taranıyor...</p></div>
                            ) : (
                                <table className="w-full text-left border-collapse whitespace-nowrap border border-[#CCCCCC]">
                                    <thead className="bg-[#F4F4F4] sticky top-0 z-10">
                                        <tr className="text-[10px] font-black text-[#555] uppercase border-b-2 border-[#CCCCCC]">
                                            <th className="p-2.5 border-r border-[#CCCCCC] w-32">Tarih</th>
                                            <th className="p-2.5 border-r border-[#CCCCCC] w-32 text-center">İşlem Tipi</th>
                                            <th className="p-2.5 border-r border-[#CCCCCC]">Evrak / Açıklama</th>
                                            <th className="p-2.5 border-r border-[#CCCCCC] w-28 text-right text-red-600">Borç (Sipariş)</th>
                                            <th className="p-2.5 w-28 text-right text-emerald-600">Alacak (Ödeme)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gosterilenHareketler.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-[#999] font-bold uppercase text-xs">Bu kritere uygun işlem bulunamadı.</td></tr>
                                        ) : (
                                            gosterilenHareketler.map((h) => {
                                                const d = new Date(h.tarih);
                                                const isSiparis = h.kategori === 'SIPARIS';
                                                const isTahsilat = h.islemTipi === "Tahsilat";
                                                return (
                                                    <tr key={h.id} className="border-b border-[#EAEAEA] hover:bg-[#FFFFE0] transition-colors text-[11px] text-[#333]">
                                                        <td className="p-2 border-r border-[#CCCCCC] font-medium text-slate-500">{d.toLocaleDateString('tr-TR')} <span className="text-[9px] ml-1">{d.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</span></td>
                                                        <td className="p-2 border-r border-[#CCCCCC] text-center"><span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${isSiparis ? 'bg-blue-100 text-blue-700' : (isTahsilat ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700')}`}>{h.islemTipi}</span></td>
                                                        <td className="p-2 border-r border-[#CCCCCC] font-semibold">{h.aciklama}</td>
                                                        <td className="p-2 border-r border-[#CCCCCC] text-right font-black text-red-600">{h.borc > 0 ? formatTutar(h.borc) : "-"}</td>
                                                        <td className="p-2 text-right font-black text-emerald-600 bg-emerald-50/20">{h.alacak > 0 ? formatTutar(h.alacak) : "-"}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}