"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Sirket { id: number; isletme_adi: string; rol: string; email?: string; }
interface Kullanici { ad_soyad: string; email: string; rol: string; }
interface SiparisData { id: string; cari_adi: string; toplam_tutar: number | string | null; durum: string; tarih: string; }
interface GrafikVeri { isim: string; Tutar: number; }

const parseTutar = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); } 
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};

export default function AnaSayfa() {
    const pathname = usePathname();
    const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);
    const [kullaniciAdi, setKullaniciAdi] = useState<string>("");
    const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
    const [yukleniyor, setYukleniyor] = useState<boolean>(true);
    const [mobilMenuAcik, setMobilMenuAcik] = useState<boolean>(false);

    const [toplamUrun, setToplamUrun] = useState<number>(0);
    const [toplamMusteri, setToplamMusteri] = useState<number>(0);
    const [yeniSiparisler, setYeniSiparisler] = useState<number>(0);
    const [onayBekleyenSiparisler, setOnayBekleyenSiparisler] = useState<number>(0);
    const [toplamAlacak, setToplamAlacak] = useState<number>(0);
    const [toplamSatis, setToplamSatis] = useState<number>(0);
    const [sonSiparisler, setSonSiparisler] = useState<SiparisData[]>([]);
    const [gunlukSatisGrafik, setGunlukSatisGrafik] = useState<GrafikVeri[]>([]);
    const [maksimumSatis, setMaksimumSatis] = useState<number>(1);

    useEffect(() => {
        const sirketStr = localStorage.getItem("aktifSirket");
        const kullaniciStr = localStorage.getItem("aktifKullanici");
        if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
        
        try {
            const sirket: Sirket = JSON.parse(sirketStr);
            const kullanici: Kullanici = JSON.parse(kullaniciStr);
            setKullaniciRol(kullanici.rol || "");
            setAktifSirket(sirket);
            setKullaniciAdi(kullanici.ad_soyad || "Yönetici");

            if ((kullanici.rol || "").includes("YONETICI")) { verileriTopla(sirket.id); } 
            else { setYukleniyor(false); }
        } catch(err) { window.location.href = "/login"; }
    }, []);

    async function verileriTopla(sirketId: number) {
        setYukleniyor(true);
        try {
            const [urunlerRes, carilerRes, siparislerRes] = await Promise.all([
                supabase.from("urunler").select("id").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`),
                supabase.from("cari_kartlar").select("id, bakiye, borc_bakiye, alacak_bakiye").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`),
                supabase.from("siparisler").select("*").or(`toptanci_id.eq.${sirketId},sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`)
            ]);

            setToplamUrun(urunlerRes.data ? urunlerRes.data.length : 0);
            setToplamMusteri(carilerRes.data ? carilerRes.data.length : 0);
            
            let alacak = 0;
            if (carilerRes.data) {
                carilerRes.data.forEach((c: any) => {
                    const bakiye = c.bakiye ? parseTutar(c.bakiye) : (parseTutar(c.borc_bakiye) - parseTutar(c.alacak_bakiye));
                    if (bakiye > 0) alacak += bakiye;
                });
            }
            setToplamAlacak(alacak);

            const siparisler: SiparisData[] = siparislerRes.data || [];

            if (siparisler.length > 0) {
                setYeniSiparisler(siparisler.filter(s => s.durum === "Yeni Sipariş" || s.durum === "Yeni").length);
                setOnayBekleyenSiparisler(siparisler.filter(s => s.durum === "Onay Bekliyor").length);

                let totalSat = 0;
                const aylar = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
                const aylikVeriler: { [key: string]: number } = {};
                
                for (let i = 11; i >= 0; i--) {
                    const d = new Date(); d.setMonth(d.getMonth() - i);
                    aylikVeriler[aylar[d.getMonth()]] = 0; 
                }

                siparisler.forEach(s => {
                    if (s.durum !== "İptal Edildi") {
                        const t = parseTutar(s.toplam_tutar);
                        totalSat += t;
                        if (s.tarih) {
                            const ayIsmi = aylar[new Date(s.tarih).getMonth()];
                            if (aylikVeriler[ayIsmi] !== undefined) aylikVeriler[ayIsmi] += t;
                        }
                    }
                });

                setToplamSatis(totalSat);
                const grafikArray: GrafikVeri[] = Object.keys(aylikVeriler).map(key => ({ isim: key, Tutar: aylikVeriler[key] }));
                
                let maxSatis = 0;
                grafikArray.forEach(g => { if (g.Tutar > maxSatis) maxSatis = g.Tutar; });
                setMaksimumSatis(maxSatis > 0 ? maxSatis : 100); 
                setGunlukSatisGrafik(grafikArray);

                const siraliSiparisler = [...siparisler].sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
                setSonSiparisler(siraliSiparisler.slice(0, 5));
            } else {
                setToplamSatis(0); setSonSiparisler([]);
            }
        } catch (e) { console.error("Dashboard Veri Hatası:", e); }
        setYukleniyor(false);
    }

    const cikisYap = () => { localStorage.clear(); window.location.href = "/login"; };
    const handleMenuClick = () => { if (window.innerWidth < 768) setMobilMenuAcik(false); };

    const isYonetici = kullaniciRol.includes("YONETICI");
    const ilkHarf = kullaniciAdi ? kullaniciAdi.charAt(0).toUpperCase() : 'U';
    const sirketRol = aktifSirket?.rol || "TOPTANCI"; 

    if (!aktifSirket && !yukleniyor) return <div className="h-screen bg-[#f0f4f8]"></div>;

    return (
        <div className="bg-[#f0f4f8] font-sans h-[100dvh] flex overflow-hidden text-slate-800 w-full max-w-[100vw]">
            
            {mobilMenuAcik && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setMobilMenuAcik(false)}></div>}

            <aside className={`fixed md:static inset-y-0 left-0 z-50 w-[75vw] max-w-[280px] md:w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 transition-transform duration-300 ease-out ${mobilMenuAcik ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                <div className="h-16 md:h-20 flex items-center justify-between md:justify-center border-b border-slate-700 bg-slate-950 px-4 md:px-2 text-center relative">
                    <div className="flex flex-col items-start md:items-center w-full">
                        <span className={`text-[10px] uppercase mb-0.5 ${sirketRol === 'TOPTANCI' ? 'text-orange-500' : 'text-cyan-500'}`}>{isYonetici ? 'SİSTEM YÖNETİCİSİ' : 'PERSONEL HESABI'}</span>
                        <span className="text-xs truncate w-full text-slate-100 font-medium text-left md:text-center">{aktifSirket?.isletme_adi || "Yükleniyor..."}</span>
                    </div>
                    <button onClick={() => setMobilMenuAcik(false)} className="md:hidden absolute right-4 text-slate-400 hover:text-white"><i className="fas fa-times text-lg"></i></button>
                </div>
                
                <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                    {sirketRol === "TOPTANCI" ? (
                        <>
                            {isYonetici ? <Link href="/dashboard" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Panel</Link> : null}
                            {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) ? <Link href="/pos" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/pos" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link> : null}
                            {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) ? <Link href="/" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : null}
                            {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/faturalar" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : null}
                            {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : null}
                            {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok-hareketleri" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : null}
                            {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("MUHASEBE")) ? <Link href="/cari" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Müşteriler</Link> : null}
                            {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/ekstre" onClick={handleMenuClick} className={`flex items-center px-6 py-3.5 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : null}
                        </>
                    ) : (
                        <>
                            <Link href="/portal/pos" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                            <Link href="/stok" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"><i className="fas fa-box w-6"></i> Market Stokları</Link>
                            <Link href="/portal" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
                            <Link href="/portal/siparisler" onClick={handleMenuClick} className="flex items-center px-6 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
                        </>
                    )}
                </nav>
                <div className="p-4 border-t border-slate-800 space-y-2">
                    {isYonetici && <Link href="/ayarlar" onClick={handleMenuClick} className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link>}
                    <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative w-full">
                <header className="h-16 md:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 shadow-sm z-10">
                    <div className="flex items-center gap-3 md:gap-6 w-3/4 md:w-1/2">
                        <button onClick={() => setMobilMenuAcik(true)} className="md:hidden w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors shrink-0"><i className="fas fa-bars text-lg"></i></button>
                        <h1 className="text-base md:text-xl font-bold text-slate-800 truncate">Hoş Geldiniz, <span className="font-black text-blue-600">{kullaniciAdi || "..."}</span>!</h1>
                        <div className="flex-1 relative max-w-md hidden lg:block ml-4">
                            <input type="text" placeholder="Ara..." className="w-full bg-slate-100 border border-slate-200 text-sm font-medium px-4 py-2.5 rounded-full outline-none focus:bg-white focus:border-blue-400 transition-colors" />
                            <i className="fas fa-search absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 md:space-x-6">
                        <div className="relative cursor-pointer text-slate-500 hover:text-blue-600 transition-colors hidden sm:block">
                            <i className="fas fa-bell text-xl"></i>
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                        </div>
                        <div className="flex items-center space-x-3 sm:border-l sm:border-slate-200 sm:pl-6">
                            <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-black shadow-md shrink-0">{ilkHarf}</div>
                            <div className="hidden md:flex flex-col">
                                <span className="text-sm font-bold text-slate-800 leading-tight">{kullaniciAdi}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isYonetici ? 'YÖNETİCİ' : 'PERSONEL'}</span>
                            </div>
                        </div>
                    </div>
                </header>

                {yukleniyor ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f4f8]">
                        <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Veriler Hesaplanıyor...</span>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 animate-in fade-in duration-300 w-full overflow-x-hidden">
                        <div className="max-w-[1600px] mx-auto space-y-4 md:space-y-6">
                            
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                                {[
                                    { title: "Yeni Gelen Siparişler", val: yeniSiparisler, icon: "fa-file-signature", color: "text-blue-500", bg: "bg-blue-50", link: "/" },
                                    { title: "Onay Bekleyenler", val: onayBekleyenSiparisler, icon: "fa-file-contract", color: "text-orange-500", bg: "bg-orange-50", link: "/" },
                                    { title: "Toplam Ürün Sayısı", val: toplamUrun, icon: "fa-box-open", color: "text-indigo-500", bg: "bg-indigo-50", link: "/stok" },
                                    { title: "Aktif Müşteri Sayısı", val: toplamMusteri, icon: "fa-user-check", color: "text-emerald-500", bg: "bg-emerald-50", link: "/cari" }
                                ].map((kpi, idx) => (
                                    <Link href={kpi.link} key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5 flex flex-col hover:shadow-md transition-all duration-300 group hover:border-blue-300 cursor-pointer">
                                        <div className="flex justify-between items-center mb-2 md:mb-4">
                                            <span className="text-[10px] md:text-xs font-bold text-slate-500 group-hover:text-blue-600 transition-colors truncate">{kpi.title}</span>
                                            <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg ${kpi.bg} ${kpi.color} flex items-center justify-center group-hover:scale-110 transition-transform shrink-0`}><i className={`fas ${kpi.icon} text-sm`}></i></div>
                                        </div>
                                        <div className="flex items-end justify-between mt-auto">
                                            <span className="text-2xl md:text-3xl font-black text-slate-800">{kpi.val.toLocaleString('tr-TR')}</span>
                                            <div className="hidden sm:flex items-end gap-1 h-8 opacity-50 group-hover:opacity-100 transition-opacity">
                                                {[40, 70, 45, 90, 65, 100].map((h, i) => (<div key={i} className={`w-1.5 rounded-t-sm bg-current ${kpi.color}`} style={{ height: `${h}%` }}></div>))}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col w-full overflow-hidden">
                                    <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center">
                                        <h2 className="text-sm md:text-base font-bold text-slate-800">Aylık Satış Analizi</h2>
                                        <div className="flex items-center gap-4 text-xs font-bold text-slate-500"><span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Ciro</span></div>
                                    </div>
                                    <div className="p-4 md:p-6 flex-1 flex items-end justify-between gap-1 md:gap-2 min-h-[200px] md:min-h-[300px] overflow-x-auto custom-scrollbar pb-6 md:pb-0">
                                        {gunlukSatisGrafik.map((g, i) => {
                                            const h = maksimumSatis > 0 ? (g.Tutar / maksimumSatis) * 100 : 0;
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end min-w-[20px]">
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap z-10 shadow-lg pointer-events-none" style={{ bottom: `calc(${h}% + 10px)` }}>{g.Tutar.toLocaleString('tr-TR')} ₺</div>
                                                    <div className="w-full max-w-[20px] md:max-w-[30px] bg-blue-500 rounded-t-sm group-hover:bg-blue-600 transition-all duration-700" style={{ height: `${h}%`, minHeight: '5px' }}></div>
                                                    <span className="text-[9px] md:text-[10px] font-bold text-slate-400 mt-3 transform -rotate-45 md:rotate-0 origin-top-left md:origin-center absolute -bottom-4 md:static md:bottom-auto">{g.isim}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
                                    <div className="p-4 md:p-5 border-b border-slate-100"><h2 className="text-sm md:text-base font-bold text-slate-800">Ciro Oranı</h2></div>
                                    <div className="p-4 md:p-6 flex flex-col items-center justify-center flex-1 relative">
                                        <div className="w-32 h-32 md:w-48 md:h-48 rounded-full border-[10px] md:border-[16px] border-slate-100 relative flex items-center justify-center">
                                            <div className="absolute inset-0 rounded-full border-[10px] md:border-[16px] border-blue-500" style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0, 30% 0)' }}></div>
                                            <div className="absolute inset-0 rounded-full border-[10px] md:border-[16px] border-emerald-400" style={{ clipPath: 'polygon(50% 50%, 30% 0, 0 0, 0 40%)' }}></div>
                                            <div className="text-center">
                                                <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alacak</p>
                                                <p className="text-lg md:text-xl font-black text-slate-800">{toplamAlacak > 1000 ? (toplamAlacak / 1000).toFixed(1) + 'K' : toplamAlacak}</p>
                                            </div>
                                        </div>
                                        <div className="w-full mt-6 md:mt-8 grid grid-cols-2 gap-2 md:gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <div><div className="flex items-center text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"><div className="w-2 h-2 rounded bg-blue-500 mr-2"></div> Ciro</div><div className="text-xs md:text-sm font-bold text-blue-600">{toplamSatis.toLocaleString('tr-TR')} ₺</div></div>
                                            <div><div className="flex items-center text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"><div className="w-2 h-2 rounded bg-emerald-400 mr-2"></div> Açık Alacak</div><div className="text-xs md:text-sm font-bold text-emerald-600">{toplamAlacak.toLocaleString('tr-TR')} ₺</div></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 w-full">
                                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col w-full overflow-hidden">
                                    <div className="p-4 md:p-5 border-b border-slate-100 flex justify-between items-center">
                                        <h2 className="text-sm md:text-base font-bold text-slate-800">Son Aktiviteler (Siparişler)</h2>
                                        <span className="text-[10px] md:text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Sistem No: {aktifSirket?.id}</span>
                                    </div>
                                    
                                    <div className="hidden md:block flex-1 overflow-x-auto w-full">
                                        <table className="w-full text-left whitespace-nowrap min-w-[600px]">
                                            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                                                <tr><th className="p-4">Tarih</th><th className="p-4">Saat</th><th className="p-4">Müşteri Bilgisi</th><th className="p-4 text-right">Tutar</th><th className="p-4 text-center">Durum</th></tr>
                                            </thead>
                                            <tbody className="text-sm font-medium">
                                                {sonSiparisler.length === 0 ? (
                                                    <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Aktivite Bulunamadı</td></tr>
                                                ) : (
                                                    sonSiparisler.map(sip => {
                                                        const d = new Date(sip.tarih);
                                                        const isOnay = sip.durum === "Onaylandı";
                                                        return (
                                                            <tr key={sip.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                                <td className="p-4 text-slate-500 text-xs">{d.toLocaleDateString('tr-TR')}</td>
                                                                <td className="p-4 text-slate-500 text-xs">{d.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</td>
                                                                <td className="p-4 flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shadow-inner">{sip.cari_adi ? sip.cari_adi.charAt(0).toUpperCase() : 'M'}</div>
                                                                    <span className="font-bold text-slate-800">{sip.cari_adi}</span>
                                                                </td>
                                                                <td className="p-4 text-right font-black text-slate-800">{parseTutar(sip.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</td>
                                                                <td className="p-4 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${isOnay ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{isOnay ? 'Onaylandı' : 'Bekliyor'}</span></td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="md:hidden flex flex-col p-3 space-y-3 w-full">
                                        {sonSiparisler.length === 0 ? (
                                            <p className="text-center text-[10px] font-bold text-slate-400 py-6">Aktivite Bulunamadı</p>
                                        ) : (
                                            sonSiparisler.map(sip => {
                                                const d = new Date(sip.tarih);
                                                const isOnay = sip.durum === "Onaylandı";
                                                return (
                                                    <div key={sip.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex flex-col gap-2">
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">{sip.cari_adi ? sip.cari_adi.charAt(0).toUpperCase() : 'M'}</div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-800 leading-tight line-clamp-1">{sip.cari_adi}</p>
                                                                    <p className="text-[9px] font-medium text-slate-400">{d.toLocaleDateString('tr-TR')} - {d.toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}</p>
                                                                </div>
                                                            </div>
                                                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${isOnay ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{isOnay ? 'Onay' : 'Bekliyor'}</span>
                                                        </div>
                                                        <div className="flex justify-between items-end border-t border-slate-200 pt-2 mt-1">
                                                            <span className="text-[10px] font-bold text-slate-400">Tutar</span>
                                                            <span className="text-sm font-black text-slate-800">{parseTutar(sip.toplam_tutar).toLocaleString('tr-TR')} ₺</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4 md:gap-6 w-full">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-5">
                                        <h3 className="text-sm font-bold text-slate-800 mb-3 md:mb-4 border-b border-slate-100 pb-2">Hızlı İşlemler</h3>
                                        <div className="space-y-3">
                                            <Link href="/" className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group text-left">
                                                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0"><i className="fas fa-plus"></i></div>
                                                <div><p className="text-xs md:text-sm font-bold text-slate-800">Yeni Sipariş Fişi</p><p className="text-[10px] md:text-xs font-medium text-slate-400">Toptan satış kaydı açın</p></div>
                                            </Link>
                                            <Link href="/pos" className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group text-left">
                                                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0"><i className="fas fa-barcode"></i></div>
                                                <div><p className="text-xs md:text-sm font-bold text-slate-800">Hızlı Satış (POS)</p><p className="text-[10px] md:text-xs font-medium text-slate-400">Toptancı kasasını açın</p></div>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <footer className="mt-8 md:mt-10 border-t border-slate-200 pt-4 md:pt-6 pb-2 flex flex-col md:flex-row items-center justify-between text-[10px] md:text-xs font-bold text-slate-400">
                            <div className="space-y-1 text-center md:text-left"><p>Versiyon : 1.0.0 / {new Date().toLocaleDateString('tr-TR')}</p><p>Tüm Hakları Saklıdır. © {new Date().getFullYear()} Durmaz Business Solutions</p></div>
                            <span className="mt-2 md:mt-0 text-blue-500">www.durmazsaas.com</span>
                        </footer>
                    </div>
                )}
            </main>
        </div>
    );
}