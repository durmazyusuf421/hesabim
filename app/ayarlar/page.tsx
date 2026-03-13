"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- TİP TANIMLAMALARI (TypeScript Hatalarını Önlemek İçin) ---
interface Sirket { id: number; isletme_adi: string; rol: string; }
interface Kullanici { ad_soyad: string; rol: string; }
interface Personel {
    id: number;
    ad_soyad: string;
    eposta: string;
    sifre: string;
    rol: string;
}
interface FirmaDataState {
    isletme_adi: string; unvan: string; vergi_dairesi: string; vergi_no: string;
    il: string; ilce: string; adres: string; telefon: string; eposta: string; sifre: string;
}
interface PersonelFormState {
    ad_soyad: string; eposta: string; sifre: string; roller: string[];
}

export default function AyarlarEkrani() {
  const pathname = usePathname();
  const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);
  
  // YETKİ STATE'İ
  const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
  const isYonetici = kullaniciRol.includes("YONETICI");
  const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
  const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
  const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;

  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mobilMenuAcik, setMobilMenuAcik] = useState(false);

  const [aktifSekme, setAktifSekme] = useState<"FIRMA" | "PERSONEL">("FIRMA");

  const [formData, setFormData] = useState<FirmaDataState>({
      isletme_adi: "", unvan: "", vergi_dairesi: "", vergi_no: "",
      il: "", ilce: "", adres: "", telefon: "", eposta: "", sifre: ""
  });

  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [personelModalAcik, setPersonelModalAcik] = useState(false);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [seciliPersonelId, setSeciliPersonelId] = useState<number | null>(null);
  
  const [personelForm, setPersonelForm] = useState<PersonelFormState>({
      ad_soyad: "", eposta: "", sifre: "", roller: ["PLASIYER"]
  });

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    
    if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
    
    try {
        const sirket: Sirket = JSON.parse(sirketStr);
        const kullanici: Kullanici = JSON.parse(kullaniciStr);
        const rolStr = kullanici.rol || "";
        
        setKullaniciRol(rolStr);
        setAktifSirket(sirket);

        // Eğer Yönetici ise verileri çek
        if (rolStr.includes("YONETICI")) {
            verileriGetir(sirket.id);
            personelleriGetir(sirket.id);
        } else {
            setYukleniyor(false); 
        }
    } catch(err) { window.location.href = "/login"; }
  }, []);

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data } = await supabase.from("sirketler").select("*").eq("id", sirketId).single();
      if (data) {
          setFormData({
              isletme_adi: data.isletme_adi || "", unvan: data.unvan || "", vergi_dairesi: data.vergi_dairesi || "", vergi_no: data.vergi_no || "",
              il: data.il || "", ilce: data.ilce || "", adres: data.adres || "", telefon: data.telefon || "", eposta: data.eposta || "", sifre: data.sifre || ""
          });
      }
      setYukleniyor(false);
  }

  async function personelleriGetir(sirketId: number) {
      const { data } = await supabase.from("alt_kullanicilar").select("*").eq("sirket_id", sirketId).order('id', { ascending: false });
      setPersoneller(data || []);
  }

  const ayarlariKaydet = async () => {
      if(!aktifSirket) return;
      setKaydediliyor(true);
      const { error, data } = await supabase.from("sirketler").update(formData).eq("id", aktifSirket.id).select().single();
      if (error) { alert("Güncelleme sırasında hata oluştu: " + error.message); } 
      else {
          alert("Firma bilgileriniz başarıyla güncellendi!");
          localStorage.setItem("aktifSirket", JSON.stringify(data));
          setAktifSirket(data);
      }
      setKaydediliyor(false);
  };

  const rolSecimiGuncelle = (rol: string) => {
      let mevcutRoller = [...personelForm.roller];
      if (mevcutRoller.includes(rol)) mevcutRoller = mevcutRoller.filter(r => r !== rol);
      else mevcutRoller.push(rol);
      setPersonelForm({ ...personelForm, roller: mevcutRoller });
  };

  const yeniPersonelEkle = () => {
      setDuzenlemeModu(false); setSeciliPersonelId(null);
      setPersonelForm({ ad_soyad: "", eposta: "", sifre: "", roller: ["PLASIYER"] });
      setPersonelModalAcik(true);
  };

  const personelDuzenle = (p: Personel) => {
      setDuzenlemeModu(true); setSeciliPersonelId(p.id);
      setPersonelForm({ ad_soyad: p.ad_soyad, eposta: p.eposta, sifre: p.sifre, roller: p.rol ? p.rol.split(',') : [] });
      setPersonelModalAcik(true);
  };

  const personelKaydet = async () => {
      if(!aktifSirket) return;
      if(!personelForm.ad_soyad || !personelForm.eposta || !personelForm.sifre) return alert("Lütfen tüm alanları doldurun!");
      if(personelForm.roller.length === 0) return alert("Lütfen en az bir yetki alanı seçin!");
      const kaydedilecekRolString = personelForm.roller.join(',');
      
      if (duzenlemeModu && seciliPersonelId) {
          const { error } = await supabase.from("alt_kullanicilar").update({ ad_soyad: personelForm.ad_soyad, eposta: personelForm.eposta, sifre: personelForm.sifre, rol: kaydedilecekRolString }).eq("id", seciliPersonelId);
          if (error) alert("Güncelleme hatası!"); else alert("Personel bilgileri güncellendi.");
      } else {
          const { error } = await supabase.from("alt_kullanicilar").insert([{ sirket_id: aktifSirket.id, ad_soyad: personelForm.ad_soyad, eposta: personelForm.eposta, sifre: personelForm.sifre, rol: kaydedilecekRolString, durum: 'AKTIF' }]);
          if (error) alert("Personel eklenemedi! E-Posta adresi kullanılıyor olabilir.");
      }
      setPersonelModalAcik(false); personelleriGetir(aktifSirket.id);
  };

  const personelSil = async (id: number) => {
      if(!aktifSirket) return;
      if(window.confirm("Bu personelin sisteme girişini kalıcı olarak iptal etmek istediğinize emin misiniz?")) {
          await supabase.from("alt_kullanicilar").delete().eq("id", id);
          personelleriGetir(aktifSirket.id);
      }
  };

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

  if (!aktifSirket || yukleniyor) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Sistem Doğrulanıyor...</div>;

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800 w-full relative">
      
      {mobilMenuAcik && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setMobilMenuAcik(false)}></div>}

      {/* --- GÜNCELLENMİŞ EKSİKSİZ SOL MENÜ --- */}
      <aside className={`w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden fixed md:static inset-y-0 left-0 z-50 transition-transform duration-300 ease-out ${mobilMenuAcik ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
          <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center relative">
              <span className={`text-[10px] uppercase mb-0.5 ${aktifSirket.rol === 'TOPTANCI' ? 'text-orange-500' : 'text-cyan-500'}`}>{isYonetici ? 'Sistem Yöneticisi' : 'Personel Hesabı'}</span>
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
                      {isYonetici || isMuhasebe ? <Link href="/ekstre" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
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
              {/* AKTİF SAYFA BURASI (Ayarlar) */}
              {isYonetici ? (
                  <Link href="/ayarlar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white font-bold" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6 text-blue-400"></i> Ayarlar</Link>
              ) : (
                  <div className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded opacity-40 cursor-not-allowed text-slate-500`} title="Ayarlara erişim yetkiniz yok"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>
              )}
              <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
          </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 relative w-full">
        
        {/* MOBİL MENÜ BUTONU */}
        <div className="md:hidden bg-white border-b border-slate-200 p-3 flex justify-between items-center shrink-0">
             <h1 className="font-bold text-slate-800 text-sm"><i className="fas fa-cog text-blue-600 mr-2"></i>Ayarlar</h1>
             <button onClick={() => setMobilMenuAcik(true)} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded border border-slate-300"><i className="fas fa-bars"></i></button>
        </div>

        {/* YETKİSİZ GİRİŞ (LOCK EKRANI) */}
        {!isYonetici ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500">
                <div className="w-32 h-32 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner border-4 border-white">
                    <i className="fas fa-lock"></i>
                </div>
                <h1 className="text-3xl font-black text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">
                    Ayarlar ve personel yönetimi sayfasına sadece "YÖNETİCİ" yetkisine sahip kullanıcılar erişebilir. Lütfen sol menüden yetkili olduğunuz bir sayfaya geçiniz.
                </p>
                <Link href={aktifSirket.rol === "TOPTANCI" ? "/" : "/portal"} className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg transition-all">
                    <i className="fas fa-arrow-left mr-2"></i> Güvenli Sayfaya Dön
                </Link>
            </div>
        ) : (
            <>
                {/* ÜST BAŞLIK VE SEKME ÇUBUĞU (YÖNETİCİ İÇİN) */}
                <header className="bg-white border-b border-slate-200 px-4 md:px-8 pt-4 md:pt-6 shadow-sm shrink-0">
                    <div className="flex flex-col md:flex-row justify-between md:items-end mb-4 md:mb-6 gap-4 md:gap-0">
                        <div>
                            <h1 className="text-lg md:text-2xl font-black text-slate-800 tracking-tight">Sistem ve Hesap Ayarları</h1>
                            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Firma bilgileri ve personel yetkilendirmeleri</p>
                        </div>
                        <div className="w-full md:w-auto">
                            {aktifSekme === "FIRMA" && (
                                <button onClick={ayarlariKaydet} disabled={kaydediliyor} className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-lg shadow-md transition-all disabled:opacity-50 flex items-center justify-center">
                                    {kaydediliyor ? <><i className="fas fa-circle-notch fa-spin mr-2"></i> Kaydediliyor...</> : <><i className="fas fa-save mr-2"></i> Firma Bilgilerini Kaydet</>}
                                </button>
                            )}
                            {aktifSekme === "PERSONEL" && (
                                <button onClick={yeniPersonelEkle} className="w-full md:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-lg shadow-md transition-all flex items-center justify-center">
                                    <i className="fas fa-user-plus mr-2"></i> Yeni Personel Ekle
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex space-x-4 md:space-x-6 overflow-x-auto custom-scrollbar">
                        <button onClick={() => setAktifSekme("FIRMA")} className={`pb-3 text-xs md:text-sm font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${aktifSekme === "FIRMA" ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Firma Bilgileri</button>
                        <button onClick={() => setAktifSekme("PERSONEL")} className={`pb-3 text-xs md:text-sm font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${aktifSekme === "PERSONEL" ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Personeller & Yetkiler</button>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
                    <div className="max-w-5xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {aktifSekme === "FIRMA" && (
                            <div className="p-0">
                                <div className="p-4 md:p-8 border-b border-slate-100">
                                    <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-store mr-2"></i> Firma (Marka) Bilgileri</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Sistemde Görünen Marka Adı</label><input type="text" value={formData.isletme_adi} onChange={(e) => setFormData({...formData, isletme_adi: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" /></div>
                                    </div>
                                </div>
                                <div className="p-4 md:p-8 border-b border-slate-100 bg-slate-50/50">
                                    <h3 className="text-sm font-black text-orange-600 uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-file-invoice mr-2"></i> Resmi E-Fatura Bilgileri</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div className="md:col-span-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Resmi Vergi Ünvanı</label><input type="text" value={formData.unvan} onChange={(e) => setFormData({...formData, unvan: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-orange-500 transition-all shadow-sm" /></div>
                                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Vergi Dairesi</label><input type="text" value={formData.vergi_dairesi} onChange={(e) => setFormData({...formData, vergi_dairesi: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-orange-500 transition-all shadow-sm" /></div>
                                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Vergi No / TCKN</label><input type="text" value={formData.vergi_no} onChange={(e) => setFormData({...formData, vergi_no: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-orange-500 transition-all shadow-sm" /></div>
                                    </div>
                                </div>
                                <div className="p-4 md:p-8 border-b border-slate-100">
                                    <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-map-marker-alt mr-2"></i> İletişim ve Adres</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">İl</label><input type="text" value={formData.il} onChange={(e) => setFormData({...formData, il: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all" /></div>
                                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">İlçe</label><input type="text" value={formData.ilce} onChange={(e) => setFormData({...formData, ilce: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all" /></div>
                                        <div className="md:col-span-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Açık Adres</label><textarea value={formData.adres} onChange={(e) => setFormData({...formData, adres: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all resize-none h-20"></textarea></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {aktifSekme === "PERSONEL" && (
                            <div className="p-0 animate-in fade-in overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                                    <thead className="bg-slate-100 border-b border-slate-200">
                                        <tr className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                            <th className="p-4 border-r border-slate-200">Ad Soyad</th><th className="p-4 border-r border-slate-200">Giriş E-Postası</th><th className="p-4 border-r border-slate-200 w-32 text-center">Sistem Şifresi</th><th className="p-4 border-r border-slate-200 w-64 text-left">Yetki Alanları (Roller)</th><th className="p-4 w-24 text-center">İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {personeller.length === 0 ? (<tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Kayıtlı alt personeliniz bulunmuyor.</td></tr>) : (
                                            personeller.map(p => {
                                                const roller = p.rol ? p.rol.split(',') : [];
                                                return (
                                                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                        <td className="p-4 font-black text-slate-800">{p.ad_soyad}</td><td className="p-4 font-bold text-blue-600">{p.eposta}</td><td className="p-4 text-center font-bold text-slate-600 bg-slate-50">{p.sifre}</td>
                                                        <td className="p-4 text-left">
                                                            <div className="flex flex-wrap gap-1">
                                                                {roller.map((r: string, idx: number) => (
                                                                    <span key={idx} className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${r === 'YONETICI' ? 'bg-purple-100 text-purple-700 border border-purple-200' : r === 'PLASIYER' ? 'bg-blue-100 text-blue-700 border border-blue-200' : r === 'DEPOCU' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>{r}</span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-center flex space-x-1 justify-center">
                                                            <button onClick={() => personelDuzenle(p)} className="w-8 h-8 rounded bg-white border border-slate-200 text-blue-500 hover:bg-blue-50 hover:border-blue-200 shadow-sm transition-all" title="Düzenle"><i className="fas fa-edit"></i></button>
                                                            <button onClick={() => personelSil(p.id)} className="w-8 h-8 rounded bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 shadow-sm transition-all" title="Sil"><i className="fas fa-trash"></i></button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </>
        )}
      </main>

      {/* --- PERSONEL EKLEME / DÜZENLEME MODALI --- */}
      {isYonetici && personelModalAcik && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200 max-h-full">
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-black text-slate-800 flex items-center">
                  <i className={`fas ${duzenlemeModu ? 'fa-user-edit text-blue-600' : 'fa-user-plus text-emerald-600'} mr-2`}></i> 
                  {duzenlemeModu ? 'Personel Yetkilerini Düzenle' : 'Yeni Personel Ekle'}
              </h3>
              <button onClick={() => setPersonelModalAcik(false)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-600 shadow-sm"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Personel Adı Soyadı</label>
                    <input type="text" value={personelForm.ad_soyad} onChange={(e) => setPersonelForm({...personelForm, ad_soyad: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white" placeholder="Örn: Ahmet Yılmaz" />
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Sisteme Giriş E-Postası (Kullanıcı Adı)</label>
                    <input type="email" value={personelForm.eposta} onChange={(e) => setPersonelForm({...personelForm, eposta: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white" placeholder="Örn: ahmet@sirketiniz.com" />
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Sisteme Giriş Şifresi</label>
                    <input type="text" value={personelForm.sifre} onChange={(e) => setPersonelForm({...personelForm, sifre: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white" placeholder="Personelin şifresini belirleyin" />
                </div>
                
                <div className="pt-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Yetki Alanları (Birden Fazla Seçilebilir)</label>
                    <div className="space-y-2 border border-slate-200 p-3 rounded-xl bg-slate-50">
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white rounded transition-colors"><input type="checkbox" checked={personelForm.roller.includes("YONETICI")} onChange={() => rolSecimiGuncelle("YONETICI")} className="w-4 h-4 text-blue-600 rounded border-gray-300" /><span className="text-xs font-bold text-slate-700">YÖNETİCİ <span className="text-[10px] font-normal text-slate-400">(Tam erişim)</span></span></label>
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white rounded transition-colors"><input type="checkbox" checked={personelForm.roller.includes("PLASIYER")} onChange={() => rolSecimiGuncelle("PLASIYER")} className="w-4 h-4 text-blue-600 rounded border-gray-300" /><span className="text-xs font-bold text-slate-700">PLASİYER <span className="text-[10px] font-normal text-slate-400">(Sipariş / Cari)</span></span></label>
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white rounded transition-colors"><input type="checkbox" checked={personelForm.roller.includes("DEPOCU")} onChange={() => rolSecimiGuncelle("DEPOCU")} className="w-4 h-4 text-blue-600 rounded border-gray-300" /><span className="text-xs font-bold text-slate-700">DEPOCU <span className="text-[10px] font-normal text-slate-400">(Stok / Sevkiyat)</span></span></label>
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white rounded transition-colors"><input type="checkbox" checked={personelForm.roller.includes("MUHASEBE")} onChange={() => rolSecimiGuncelle("MUHASEBE")} className="w-4 h-4 text-blue-600 rounded border-gray-300" /><span className="text-xs font-bold text-slate-700">MUHASEBE <span className="text-[10px] font-normal text-slate-400">(Fatura / Ekstre)</span></span></label>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end space-x-3 shrink-0">
              <button onClick={() => setPersonelModalAcik(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-100 shadow-sm transition-colors">İptal</button>
              <button onClick={personelKaydet} className={`px-5 py-2.5 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-colors flex items-center ${duzenlemeModu ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  <i className={`fas ${duzenlemeModu ? 'fa-save' : 'fa-check'} mr-2`}></i> {duzenlemeModu ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}