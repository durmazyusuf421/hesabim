"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// TYPESCRIPT İÇİN TİP TANIMLAMALARI (Kırmızı çizgileri yok eden kısım)
interface Sirket { id: number; isletme_adi: string; rol: string; }
interface Kullanici { ad_soyad: string; rol: string; }
interface Urun {
    id: number; urun_adi: string; barkod?: string; stok_miktari: number;
    birim: string; alis_fiyati: number; satis_fiyati: number; kdv_orani: number;
}
interface FormDataState {
    urun_adi: string; barkod: string; stok_miktari: number; birim: string;
    alis_fiyati: number; satis_fiyati: number; kdv_orani: number;
}

export default function StokKartlari() {
  const pathname = usePathname();
  const [aktifSirket, setAktifSirket] = useState<Sirket | null>(null);
  
  // YETKİ KONTROLLERİ
  const [kullaniciRol, setKullaniciRol] = useState<string>(""); 
  const isYonetici = kullaniciRol.includes("YONETICI");
  const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
  const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
  const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;
  
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [mobilMenuAcik, setMobilMenuAcik] = useState(false);

  const [modalAcik, setModalAcik] = useState(false);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [seciliUrunId, setSeciliUrunId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState<FormDataState>({
      urun_adi: "", barkod: "", stok_miktari: 0, birim: "Adet", alis_fiyati: 0, satis_fiyati: 0, kdv_orani: 20
  });

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
    
    try {
        const sirket: Sirket = JSON.parse(sirketStr);
        const kullanici: Kullanici = JSON.parse(kullaniciStr);
        
        // GÜVENLİK KİLİDİ: Hem Toptancı Hem Market girebilir
        if (sirket.rol !== "TOPTANCI" && sirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
        
        const rolStr = kullanici.rol || "";
        setKullaniciRol(rolStr);
        setAktifSirket(sirket);

        // Market (Perakende) ise yetkiye bakma, Toptancı ise Depocu/Yönetici yetkisi ara
        if (sirket.rol === "PERAKENDE" || rolStr.includes("YONETICI") || rolStr.includes("DEPOCU")) {
            verileriGetir(sirket.id);
        } else {
            setYukleniyor(false);
        }
    } catch(err) { window.location.href = "/login"; }
  }, []);

  const hasAccess = aktifSirket?.rol === "PERAKENDE" || isDepocu;

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data, error } = await supabase.from("urunler").select("*").eq("sahip_sirket_id", sirketId).order('id', { ascending: false });
      if (!error && data) setUrunler(data);
      setYukleniyor(false);
  }

  const yeniUrunEkle = () => {
      setDuzenlemeModu(false); setSeciliUrunId(null);
      setFormData({ urun_adi: "", barkod: "", stok_miktari: 0, birim: "Adet", alis_fiyati: 0, satis_fiyati: 0, kdv_orani: 20 });
      setModalAcik(true);
  };

  const urunDuzenle = (urun: Urun) => {
      setDuzenlemeModu(true); setSeciliUrunId(urun.id);
      setFormData({
          urun_adi: urun.urun_adi, barkod: urun.barkod || "", stok_miktari: urun.stok_miktari, birim: urun.birim,
          alis_fiyati: urun.alis_fiyati, satis_fiyati: urun.satis_fiyati, kdv_orani: urun.kdv_orani
      });
      setModalAcik(true);
  };

  const formuKaydet = async () => {
      if (!formData.urun_adi) return alert("Ürün adı zorunludur!");
      const kaydedilecekVeri = { ...formData, sahip_sirket_id: aktifSirket?.id };

      if (duzenlemeModu && seciliUrunId) {
          const { error } = await supabase.from("urunler").update(kaydedilecekVeri).eq("id", seciliUrunId);
          if (error) alert("Hata: " + error.message);
      } else {
          const { error } = await supabase.from("urunler").insert([kaydedilecekVeri]);
          if (error) alert("Hata: " + error.message);
      }
      setModalAcik(false); 
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  const urunSil = async (id: number) => {
      if(window.confirm("Bu ürünü kalıcı olarak silmek istediğinize emin misiniz?")) {
          await supabase.from("urunler").delete().eq("id", id);
          if (aktifSirket) verileriGetir(aktifSirket.id);
      }
  };

  const cikisYap = () => { localStorage.clear(); window.location.href = "/login"; };

  const filtrelenmisUrunler = urunler.filter(u => u.urun_adi.toLowerCase().includes(aramaTerimi.toLowerCase()) || (u.barkod && u.barkod.includes(aramaTerimi)));

  if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Sistem Doğrulanıyor...</div>;

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
                      
                      {/* AKTİF SAYFA BURASI (Stok Kartları) */}
                      {isYonetici || isDepocu ? <Link href="/stok" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6 text-blue-400"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      
                      {isYonetici || isDepocu ? <Link href="/stok-hareketleri" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isPlasiyer || isMuhasebe ? <Link href="/cari" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                      {isYonetici || isMuhasebe ? <Link href="/ekstre" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
                  </>
              ) : (
                  <>
                    <Link href="/portal/pos" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
                    <Link href="/stok" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6 text-cyan-400"></i> Market Stokları</Link>
                    <Link href="/portal" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
                    <Link href="/portal/siparisler" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/siparisler" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
                    <Link href="/portal/kasa" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/kasa" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-cash-register w-6"></i> Kasa & Nakit Akışı</Link>
                    <Link href="/portal/veresiye" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/veresiye" ? "bg-slate-800 text-white border-l-4 border-cyan-500 font-bold" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-book w-6"></i> Veresiye Defteri</Link>
                  </>
              )}
          </nav>
          <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
              {isYonetici || aktifSirket.rol === "PERAKENDE" ? <Link href="/ayarlar" onClick={() => setMobilMenuAcik(false)} className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link> : <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500" title="Yetkiniz yok"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
              <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest text-left"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
          </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white relative w-full">
        {/* MOBİL MENÜ BUTONU (Üst kısma eklendi) */}
        <div className="md:hidden bg-white border-b border-slate-200 p-3 flex justify-between items-center shrink-0">
             <h1 className="font-bold text-slate-800 text-sm"><i className="fas fa-box text-blue-600 mr-2"></i>Stok Kartları</h1>
             <button onClick={() => setMobilMenuAcik(true)} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded border border-slate-300"><i className="fas fa-bars"></i></button>
        </div>

        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 animate-in zoom-in-95 duration-500">
                <div className="w-32 h-32 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-black text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Stok Kartları sayfasına erişim yetkiniz bulunmamaktadır.</p>
            </div>
        ) : (
            <>
                <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0 print:hidden">
                    <button onClick={yeniUrunEkle} className={`flex items-center px-4 py-1.5 border text-white rounded text-xs font-bold shadow-sm ${aktifSirket.rol === 'TOPTANCI' ? 'bg-blue-600 border-blue-700 hover:bg-blue-700' : 'bg-cyan-600 border-cyan-700 hover:bg-cyan-700'}`}><i className="fas fa-plus-circle mr-2"></i> Yeni Ürün (Stok Kartı) Ekle</button>
                </div>

                <div className="h-10 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4 print:hidden">
                    <span className="text-xs font-bold text-slate-600 uppercase hidden sm:block">Stok Yönetimi</span>
                    <div className="flex-1 max-w-md relative">
                        <input type="text" placeholder="Ürün adı veya barkod ile arama yapın..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="w-full text-xs px-3 py-1 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-white relative">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                            <tr className="text-[11px] font-bold text-slate-700">
                                <th className="p-2 border-r border-slate-300 w-16 text-center">ID</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-center">Barkod</th>
                                <th className="p-2 border-r border-slate-300">Ürün Adı</th>
                                <th className="p-2 border-r border-slate-300 w-24 text-center">Mevcut Stok</th>
                                <th className="p-2 border-r border-slate-300 w-20 text-center">Birim</th>
                                <th className="p-2 border-r border-slate-300 w-28 text-right">Alış Fiyatı</th>
                                <th className="p-2 border-r border-slate-300 w-28 text-right">Satış Fiyatı</th>
                                <th className="p-2 border-r border-slate-300 w-20 text-center">KDV (%)</th>
                                <th className="p-2 w-24 text-center print:hidden">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yukleniyor ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                            ) : filtrelenmisUrunler.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Stok Kartı Bulunamadı</td></tr>
                            ) : (
                                filtrelenmisUrunler.map((u) => (
                                    <tr key={u.id} className="text-[11px] font-medium border-b border-slate-200 hover:bg-slate-50 transition-colors">
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-400">#{u.id}</td>
                                        <td className="p-2 border-r border-slate-200 text-center font-bold font-mono text-slate-600">{u.barkod || '-'}</td>
                                        <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{u.urun_adi}</td>
                                        <td className={`p-2 border-r border-slate-200 text-center font-black text-sm ${Number(u.stok_miktari) <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{u.stok_miktari}</td>
                                        <td className="p-2 border-r border-slate-200 text-center">{u.birim}</td>
                                        <td className="p-2 border-r border-slate-200 text-right font-semibold text-slate-500">{Number(u.alis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</td>
                                        <td className="p-2 border-r border-slate-200 text-right font-black text-blue-700">{Number(u.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</td>
                                        <td className="p-2 border-r border-slate-200 text-center text-slate-500">% {u.kdv_orani}</td>
                                        <td className="p-1.5 text-center print:hidden">
                                            <div className="flex justify-center space-x-1">
                                                <button onClick={() => urunDuzenle(u)} className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 shadow-sm transition-all" title="Düzenle"><i className="fas fa-edit"></i></button>
                                                <button onClick={() => urunSil(u.id)} className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 shadow-sm transition-all" title="Sil"><i className="fas fa-trash"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </>
        )}
      </main>

      {/* --- ÜRÜN EKLEME / DÜZENLEME MODALI --- */}
      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-xl overflow-hidden border border-slate-400 flex flex-col max-h-full">
            <div className={`border-b border-slate-300 p-3 flex justify-between items-center shrink-0 ${aktifSirket?.rol === 'TOPTANCI' ? 'bg-slate-200' : 'bg-cyan-50'}`}>
              <h3 className={`text-sm font-black flex items-center ${aktifSirket?.rol === 'TOPTANCI' ? 'text-slate-800' : 'text-cyan-800'}`}>
                  <i className="fas fa-box mr-2"></i> {duzenlemeModu ? 'Stok Kartını Düzenle' : 'Yeni Stok Kartı'}
              </h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
            </div>
            
            <div className="p-5 bg-white border-b border-slate-300 space-y-4 overflow-y-auto">
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Ürün Adı</label>
                        <input type="text" value={formData.urun_adi} onChange={(e) => setFormData({...formData, urun_adi: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-800" placeholder="Örn: 5LT Ayçiçek Yağı" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Barkod (POS İçin)</label>
                        <input type="text" value={formData.barkod} onChange={(e) => setFormData({...formData, barkod: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-800 font-mono" placeholder="Okutun..." />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Mevcut Stok Miktarı</label>
                        <input type="number" value={formData.stok_miktari} onChange={(e) => setFormData({...formData, stok_miktari: Number(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-blue-500 focus:bg-white text-emerald-600 text-center" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Satış Birimi</label>
                        <select value={formData.birim} onChange={(e) => setFormData({...formData, birim: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-800 cursor-pointer">
                            <option value="Adet">Adet</option>
                            <option value="Kilo">Kilo (KG)</option>
                            <option value="Litre">Litre (LT)</option>
                            <option value="Koli">Koli</option>
                            <option value="Kasa">Kasa</option>
                            <option value="Çuval">Çuval</option>
                            <option value="Paket">Paket</option>
                            <option value="Bağ">Bağ / Demet</option>
                            <option value="Gram">Gram (GR)</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Birim Alış Fiyatı (TL)</label>
                        <input type="number" value={formData.alis_fiyati} onChange={(e) => setFormData({...formData, alis_fiyati: Number(e.target.value)})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-600" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Birim Satış Fiyatı (TL)</label>
                        <input type="number" value={formData.satis_fiyati} onChange={(e) => setFormData({...formData, satis_fiyati: Number(e.target.value)})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-blue-500 focus:bg-white text-blue-600" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">KDV Oranı (%)</label>
                        <select value={formData.kdv_orani} onChange={(e) => setFormData({...formData, kdv_orani: Number(e.target.value)})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-800 cursor-pointer">
                            <option value={0}>% 0</option>
                            <option value={1}>% 1</option>
                            <option value={10}>% 10</option>
                            <option value={20}>% 20</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-slate-100 p-3 flex justify-end space-x-2 shrink-0">
              <button onClick={() => setModalAcik(false)} className="px-5 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center rounded-xl shadow-sm">İptal</button>
              <button onClick={formuKaydet} className={`px-5 py-2.5 text-white font-black text-xs uppercase tracking-widest flex items-center rounded-xl shadow-md transition-colors ${aktifSirket?.rol === 'TOPTANCI' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                  <i className={`fas ${duzenlemeModu ? 'fa-save' : 'fa-check'} mr-2`}></i> {duzenlemeModu ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}