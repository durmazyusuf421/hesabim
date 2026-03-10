"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// TypeScript Arayüzleri 
interface Sirket {
  id: number;
  isletme_adi: string;
  rol: string;
  email?: string;
}

interface Kullanici {
  ad_soyad: string;
  email: string;
  rol: string;
}

interface SiparisData {
  id: string;
  cari_adi: string;
  toplam_tutar: number | string | null;
  durum: string;
  tarih: string;
}

interface GrafikVeri {
  isim: string;
  Tutar: number;
}

// VERİ DÖNÜŞTÜRÜCÜ
const parseTutar = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};

export default function AnaSayfa() {
  const pathname = usePathname();
  const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);
  const [kullaniciAdi, setKullaniciAdi] = useState<string>("");
  const [kullaniciEmail, setKullaniciEmail] = useState<string>("");
  
  const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
  const isYonetici = kullaniciRol.includes("YONETICI");

  const [yukleniyor, setYukleniyor] = useState<boolean>(true);

  // VERİ STATELERİ 
  const [toplamUrun, setToplamUrun] = useState<number>(0);
  const [toplamMusteri, setToplamMusteri] = useState<number>(0);
  const [yeniSiparisler, setYeniSiparisler] = useState<number>(0);
  const [onayBekleyenSiparisler, setOnayBekleyenSiparisler] = useState<number>(0);
  const [toplamAlacak, setToplamAlacak] = useState<number>(0);
  const [toplamSatis, setToplamSatis] = useState<number>(0);
  const [sonSiparisler, setSonSiparisler] = useState<SiparisData[]>([]);

  // GRAFİK STATELERİ 
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
        setKullaniciEmail(kullanici.email || "");

        if ((kullanici.rol || "").includes("YONETICI")) {
            verileriTopla(sirket.id);
        } else {
            setYukleniyor(false);
        }
    } catch(err) {
        window.location.href = "/login";
    }
  }, []);

  async function verileriTopla(sirketId: number) {
      setYukleniyor(true);
      try {
          const { data: allUrunler } = await supabase.from("urunler").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`);
          setToplamUrun(allUrunler ? allUrunler.length : 0);

          const { data: allCari } = await supabase.from("cari_kartlar").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`);
          setToplamMusteri(allCari ? allCari.length : 0);
          
          let alacak = 0;
          if (allCari) {
              allCari.forEach((c: any) => {
                  const bakiye = c.bakiye ? parseTutar(c.bakiye) : (parseTutar(c.borc_bakiye) - parseTutar(c.alacak_bakiye));
                  if (bakiye > 0) alacak += bakiye;
              });
          }
          setToplamAlacak(alacak);

          const { data: rawSiparisler } = await supabase.from("siparisler").select("*").or(`toptanci_id.eq.${sirketId},sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`);
          const siparisler: SiparisData[] = rawSiparisler || [];

          if (siparisler.length > 0) {
              // YENİ EKLENEN KISIM: Durumu "Yeni Sipariş" olanları tam okur!
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
                          if (aylikVeriler[ayIsmi] !== undefined) {
                              aylikVeriler[ayIsmi] += t;
                          }
                      }
                  }
              });

              setToplamSatis(totalSat);

              const grafikArray: GrafikVeri[] = Object.keys(aylikVeriler).map(key => ({ isim: key, Tutar: aylikVeriler[key] }));
              
              let maxSatis = 0;
              grafikArray.forEach(g => {
                  if (g.Tutar > maxSatis) maxSatis = g.Tutar;
              });
              setMaksimumSatis(maxSatis > 0 ? maxSatis : 100); 
              setGunlukSatisGrafik(grafikArray);

              const siraliSiparisler = [...siparisler].sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
              setSonSiparisler(siraliSiparisler.slice(0, 5));
          } else {
              setToplamSatis(0);
              setSonSiparisler([]);
          }

      } catch (e) { console.error("Dashboard Veri Hatası:", e); }
      setYukleniyor(false);
  }

  const cikisYap = () => { localStorage.clear(); window.location.href = "/login"; };

  if (!aktifSirket) return <div className="h-screen bg-[#f0f4f8]"></div>;

  const ilkHarf = kullaniciAdi ? kullaniciAdi.charAt(0).toUpperCase() : 'U';

  return (
    <div className="bg-[#f0f4f8] font-sans h-screen flex overflow-hidden text-slate-800">
      
      {/* SOL MENÜ */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden z-20 shadow-xl">
        <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center">
            <span className={`text-[10px] uppercase mb-0.5 ${aktifSirket.rol === 'TOPTANCI' ? 'text-orange-500' : 'text-cyan-500'}`}>
                {isYonetici ? 'SİSTEM YÖNETİCİSİ' : 'PERSONEL HESABI'}
            </span>
            <span className="text-xs truncate w-full">{aktifSirket.email || aktifSirket.isletme_adi}</span>
        </div>
        
        <nav className="flex-1 py-4 space-y-1">
          {aktifSirket.rol === "TOPTANCI" ? (
              <>
                  {isYonetici ? <Link href="/dashboard" className={`flex items-center px-6 py-3 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) ? <Link href="/" className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/faturalar" className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok-hareketleri" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("MUHASEBE")) ? <Link href="/cari" className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/ekstre" className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
              </>
          ) : (
              <>
                  <Link href="/portal/pos" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                  <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Market Stokları</Link>
                  <Link href="/portal" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
                  <Link href="/portal/siparisler" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/siparisler" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
                  <Link href="/portal/kasa" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/kasa" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-cash-register w-6"></i> Kasa & Nakit Akışı</Link>
                  <Link href="/portal/veresiye" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/veresiye" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-book w-6"></i> Veresiye Defteri</Link>
              </>
          )}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          {isYonetici ? (
              <Link href="/ayarlar" className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link>
          ) : (
              <div className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400`} title="Ayarlara erişim yetkiniz yok"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>
          )}
          <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
        </div>
      </aside>

      {/* SAĞ İÇERİK ALANI */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        
        {/* ÜST HEADER */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
            <div className="flex items-center space-x-6 w-1/2">
                <h1 className="text-xl font-bold text-slate-800 hidden md:block">Hoş Geldiniz, <span className="font-black text-blue-600">{kullaniciAdi}</span>!</h1>
                <div className="flex-1 relative max-w-md hidden lg:block">
                    <input type="text" placeholder="Ara..." className="w-full bg-slate-100 border border-slate-200 text-sm font-medium px-4 py-2.5 rounded-full outline-none focus:bg-white focus:border-blue-400 transition-colors" />
                    <i className="fas fa-search absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                </div>
            </div>
            
            <div className="flex items-center space-x-6">
                <div className="relative cursor-pointer text-slate-500 hover:text-blue-600 transition-colors">
                    <i className="fas fa-bell text-xl"></i>
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                </div>
                <div className="flex items-center space-x-3 border-l border-slate-200 pl-6">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-black shadow-md">
                        {ilkHarf}
                    </div>
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
            <div className="flex-1 overflow-y-auto p-6 md:p-8 animate-in fade-in duration-300">
                <div className="max-w-[1600px] mx-auto space-y-6">
                    
                    {/* TIKLANABİLİR KPI KARTLARI (Link ile sarıldı) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { title: "Yeni Gelen Siparişler", val: yeniSiparisler, icon: "fa-file-signature", color: "text-blue-500", bg: "bg-blue-50", link: "/" },
                            { title: "Onay Bekleyenler", val: onayBekleyenSiparisler, icon: "fa-file-contract", color: "text-orange-500", bg: "bg-orange-50", link: "/" },
                            { title: "Toplam Ürün Sayısı", val: toplamUrun, icon: "fa-box-open", color: "text-indigo-500", bg: "bg-indigo-50", link: "/stok" },
                            { title: "Aktif Müşteri Sayısı", val: toplamMusteri, icon: "fa-user-check", color: "text-emerald-500", bg: "bg-emerald-50", link: "/cari" }
                        ].map((kpi, idx) => (
                            <Link href={kpi.link} key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col hover:shadow-md transition-all duration-300 group hover:border-blue-300 cursor-pointer">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-bold text-slate-500 group-hover:text-blue-600 transition-colors">{kpi.title}</span>
                                    <div className={`w-8 h-8 rounded-lg ${kpi.bg} ${kpi.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                        <i className={`fas ${kpi.icon}`}></i>
                                    </div>
                                </div>
                                <div className="flex items-end justify-between mt-auto">
                                    <span className="text-3xl font-black text-slate-800">{kpi.val.toLocaleString('tr-TR')}</span>
                                    <div className="flex items-end gap-1 h-8 opacity-50 group-hover:opacity-100 transition-opacity">
                                        {[40, 70, 45, 90, 65, 100].map((h, i) => (
                                            <div key={i} className={`w-1.5 rounded-t-sm bg-current ${kpi.color}`} style={{ height: `${h}%` }}></div>
                                        ))}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* ORTA BÖLÜM: GRAFİKLER */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* BÜYÜK GRAFİK: AYLIK GELİRLER */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                                <h2 className="text-base font-bold text-slate-800">Aylık Satış Analizi</h2>
                                <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                                    <span className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Ciro</span>
                                </div>
                            </div>
                            
                            <div className="p-6 flex-1 flex items-end justify-between gap-2 min-h-[300px]">
                                {gunlukSatisGrafik.map((g, i) => {
                                    const h = (g.Tutar / maksimumSatis) * 100;
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                            <div 
                                                className="opacity-0 group-hover:opacity-100 transition-opacity absolute bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap z-10 shadow-lg pointer-events-none"
                                                style={{ bottom: `calc(${h}% + 10px)` }}
                                            >
                                                {g.Tutar.toLocaleString('tr-TR')} ₺
                                            </div>
                                            <div 
                                                className="w-full max-w-[30px] bg-blue-500 rounded-t-sm group-hover:bg-blue-600 transition-all duration-700"
                                                style={{ height: `${h}%`, minHeight: '5px' }}
                                            ></div>
                                            <span className="text-[10px] font-bold text-slate-400 mt-3">{g.isim}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* KÜÇÜK GRAFİK: CİRO / ALACAK */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <div className="p-5 border-b border-slate-100">
                                <h2 className="text-base font-bold text-slate-800">Ciro Oranı</h2>
                            </div>
                            <div className="p-6 flex flex-col items-center justify-center flex-1 relative">
                                <div className="w-48 h-48 rounded-full border-[16px] border-slate-100 relative flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border-[16px] border-blue-500" style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0, 30% 0)' }}></div>
                                    <div className="absolute inset-0 rounded-full border-[16px] border-emerald-400" style={{ clipPath: 'polygon(50% 50%, 30% 0, 0 0, 0 40%)' }}></div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Piyasadaki Alacak</p>
                                        <p className="text-xl font-black text-slate-800">{toplamAlacak > 1000 ? (toplamAlacak / 1000).toFixed(1) + 'K' : toplamAlacak}</p>
                                    </div>
                                </div>
                                
                                <div className="w-full mt-8 grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div>
                                        <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"><div className="w-2 h-2 rounded bg-blue-500 mr-2"></div> Toplam Ciro</div>
                                        <div className="text-sm font-bold text-blue-600">{toplamSatis.toLocaleString('tr-TR')} ₺</div>
                                    </div>
                                    <div>
                                        <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1"><div className="w-2 h-2 rounded bg-emerald-400 mr-2"></div> Açık Alacak</div>
                                        <div className="text-sm font-bold text-emerald-600">{toplamAlacak.toLocaleString('tr-TR')} ₺</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ALT BÖLÜM: AKTİVİTELER VE HIZLI İŞLEMLER */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* SON AKTİVİTELER TABLOSU */}
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                                <h2 className="text-base font-bold text-slate-800">Son Aktiviteler (Siparişler)</h2>
                                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Sistem No: {aktifSirket.id}</span>
                            </div>
                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full text-left whitespace-nowrap">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                                        <tr>
                                            <th className="p-4">Tarih</th>
                                            <th className="p-4">Saat</th>
                                            <th className="p-4">Müşteri Bilgisi</th>
                                            <th className="p-4 text-right">Tutar</th>
                                            <th className="p-4 text-center">Durum</th>
                                        </tr>
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
                                                        <td className="p-4 text-center">
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${isOnay ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                {isOnay ? 'Onaylandı' : 'Bekliyor'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* SAĞ PANEL: HIZLI LİNKLER VE İSTATİSTİKLER */}
                        <div className="flex flex-col gap-6">
                            
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                                <h3 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Hızlı İşlemler</h3>
                                <div className="space-y-3">
                                    <Link href="/" className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group text-left">
                                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform"><i className="fas fa-plus"></i></div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Yeni Sipariş Fişi</p>
                                            <p className="text-xs font-medium text-slate-400">Toptan satış kaydı açın</p>
                                        </div>
                                    </Link>
                                    
                                    <button 
                                        onClick={(e) => { e.preventDefault(); alert("Toptancı Hızlı Satış (POS) Ekranı Yapım Aşamasındadır.\n\nBir sonraki adımda hemen buraya başlıyoruz!"); }} 
                                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group text-left"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform"><i className="fas fa-barcode"></i></div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">Hızlı Satış (POS)</p>
                                            <p className="text-xs font-medium text-slate-400">Toptancı kasasını açın</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-sm font-bold text-slate-700">Müşteri Tahsilat Oranı</span>
                                        <span className="text-xs font-black text-blue-600">% 85</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{width: '85%'}}></div></div>
                                </div>
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-sm font-bold text-slate-700">Depo Doluluk</span>
                                        <span className="text-xs font-black text-orange-500">{toplamUrun} Ürün</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-orange-400 h-2 rounded-full" style={{width: '60%'}}></div></div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                <footer className="mt-10 border-t border-slate-200 pt-6 pb-2 flex flex-col md:flex-row items-center justify-between text-xs font-bold text-slate-400">
                    <div className="space-y-1 text-center md:text-left">
                        <p>Versiyon : 1.0.0 / {new Date().toLocaleDateString('tr-TR')}</p>
                        <p>Tüm Hakları Saklıdır. © {new Date().getFullYear()} Durmaz Business Solutions</p>
                    </div>
                    <span className="mt-2 md:mt-0 text-blue-500">www.durmazsaas.com</span>
                </footer>

            </div>
        )}
      </main>
    </div>
  );
}