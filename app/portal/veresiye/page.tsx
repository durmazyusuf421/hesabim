"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function VeresiyeDefteri() {
  const pathname = usePathname();
  const [aktifMusteri, setAktifMusteri] = useState<any>(null);
  const [kullaniciAdi, setKullaniciAdi] = useState<string>("");

  const [musteriler, setMusteriler] = useState<any[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [toplamAlacak, setToplamAlacak] = useState(0);

  // MÜŞTERİ EKLEME/DÜZENLEME MODALI
  const [modalAcik, setModalAcik] = useState(false);
  const [seciliMusteriId, setSeciliMusteriId] = useState<number | null>(null);
  const [musteriForm, setMusteriForm] = useState({ ad_soyad: "", telefon: "", adres: "" });

  // İŞLEM (BORÇ/TAHSİLAT) MODALI
  const [islemModalAcik, setIslemModalAcik] = useState(false);
  const [islemTipi, setIslemTipi] = useState<"BORCLANDIRMA" | "TAHSILAT">("BORCLANDIRMA");
  const [islemForm, setIslemForm] = useState({ tutar: "", aciklama: "", tarih: new Date().toISOString().split('T')[0] });

  // YENİ: GEÇMİŞ / EKSTRE MODALI STATELERİ
  const [gecmisModalAcik, setGecmisModalAcik] = useState(false);
  const [musteriHareketleri, setMusteriHareketleri] = useState<any[]>([]);
  const [hareketYukleniyor, setHareketYukleniyor] = useState(false);

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    
    if (!sirketStr) { window.location.href = "/login"; return; }
    
    const sirket = JSON.parse(sirketStr);
    const kullanici = kullaniciStr ? JSON.parse(kullaniciStr) : { ad_soyad: "Yönetici" };
    
    if (sirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
    
    setAktifMusteri(sirket);
    setKullaniciAdi(kullanici.ad_soyad);
    verileriGetir(sirket.id);
  }, []);

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data } = await supabase.from("veresiye_musteriler").select("*").eq("sirket_id", sirketId).order('ad_soyad');
      
      if (data) {
          setMusteriler(data);
          const alacaklar = data.reduce((acc, m) => acc + Number(m.bakiye), 0);
          setToplamAlacak(alacaklar);
      }
      setYukleniyor(false);
  }

  const yeniMusteri = () => { setSeciliMusteriId(null); setMusteriForm({ ad_soyad: "", telefon: "", adres: "" }); setModalAcik(true); };
  
  const musteriKaydet = async () => {
      if (!musteriForm.ad_soyad) return alert("Müşteri Adı zorunludur!");
      
      if (seciliMusteriId) {
          await supabase.from("veresiye_musteriler").update(musteriForm).eq("id", seciliMusteriId);
      } else {
          await supabase.from("veresiye_musteriler").insert([{ ...musteriForm, sirket_id: aktifMusteri.id }]);
      }
      setModalAcik(false); verileriGetir(aktifMusteri.id);
  };

  const islemBaslat = (tip: "BORCLANDIRMA" | "TAHSILAT") => {
      if (!seciliMusteriId) return alert("Lütfen listeden işlem yapılacak müşteriyi seçin!");
      setIslemTipi(tip);
      setIslemForm({ tutar: "", aciklama: tip === "BORCLANDIRMA" ? "Veresiye Satış: " : "Nakit Ödeme", tarih: new Date().toISOString().split('T')[0] });
      setIslemModalAcik(true);
  };

  const islemKaydet = async () => {
      if (!islemForm.tutar || Number(islemForm.tutar) <= 0) return alert("Geçerli bir tutar giriniz!");
      
      const seciliMusteri = musteriler.find(m => m.id === seciliMusteriId);
      if (!seciliMusteri) return;

      const tutar = Number(islemForm.tutar);
      
      // Hareketi Kaydet
      await supabase.from("veresiye_hareketler").insert([{
          musteri_id: seciliMusteriId,
          islem_tipi: islemTipi,
          tutar: tutar,
          aciklama: islemForm.aciklama,
          tarih: islemForm.tarih,
          islem_yapan: kullaniciAdi
      }]);

      // Bakiyeyi Güncelle
      let yeniBakiye = Number(seciliMusteri.bakiye);
      if (islemTipi === "BORCLANDIRMA") yeniBakiye += tutar;
      else yeniBakiye -= tutar;

      await supabase.from("veresiye_musteriler").update({ bakiye: yeniBakiye }).eq("id", seciliMusteriId);

      setIslemModalAcik(false);
      verileriGetir(aktifMusteri.id);
  };

  const musteriSil = async () => {
      if (!seciliMusteriId) return alert("Lütfen müşteri seçin!");
      const m = musteriler.find(x => x.id === seciliMusteriId);
      if (Number(m?.bakiye) !== 0) return alert("Bakiyesi sıfırlanmamış (borcu olan) müşteri silinemez!");
      
      if(window.confirm("Bu müşteriyi silmek istediğinize emin misiniz?")) {
          await supabase.from("veresiye_hareketler").delete().eq("musteri_id", seciliMusteriId);
          await supabase.from("veresiye_musteriler").delete().eq("id", seciliMusteriId);
          setSeciliMusteriId(null); verileriGetir(aktifMusteri.id);
      }
  };

  // YENİ: GEÇMİŞİ GETİR FONKSİYONU
  const gecmisiGor = async (id: number) => {
      setSeciliMusteriId(id);
      setGecmisModalAcik(true);
      setHareketYukleniyor(true);
      
      const { data } = await supabase.from("veresiye_hareketler")
          .select("*")
          .eq("musteri_id", id)
          .order('tarih', { ascending: false })
          .order('id', { ascending: false });
          
      setMusteriHareketleri(data || []);
      setHareketYukleniyor(false);
  };

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

  const filtrelenmisMusteriler = musteriler.filter(m => m.ad_soyad.toLowerCase().includes(aramaTerimi.toLowerCase()));
  const acikMusteri = musteriler.find(m => m.id === seciliMusteriId);

  if (!aktifMusteri) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800">
      
      {/* MARKET (MÜŞTERİ) SOL MENÜSÜ */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden">
        <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center">
            <span className="text-cyan-500 text-[10px] uppercase mb-0.5">Müşteri Portalı</span>
            <span className="text-xs truncate w-full">{aktifMusteri.isletme_adi}</span>
        </div>
        <nav className="flex-1 py-4 space-y-1">
  {/* YENİ POS VE STOK SİSTEMİ */}
  <Link href="/portal/pos" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-barcode w-6"></i> Hızlı Satış (POS)</Link>
  <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Market Stokları</Link>
  
  {/* B2B VE MUHASEBE */}
  <Link href="/portal" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
  <Link href="/portal/siparisler" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/siparisler" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
  <Link href="/portal/kasa" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/kasa" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-cash-register w-6"></i> Kasa & Nakit Akışı</Link>
  <Link href="/portal/veresiye" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/veresiye" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-book w-6"></i> Veresiye Defteri</Link>
</nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <Link href="/ayarlar" className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded hover:text-white`}><i className="fas fa-cog w-6"></i> Ayarlar</Link>
          <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white relative">
        
        {/* ÜST ARAÇ ÇUBUĞU */}
        <div className="h-16 bg-slate-100 border-b border-slate-300 flex items-center px-4 shrink-0 justify-between">
            <div className="space-x-2 flex">
                <button onClick={yeniMusteri} className="flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-sm"><i className="fas fa-user-plus text-cyan-600 mr-2"></i> Müşteri Ekle</button>
                <div className="w-px h-8 bg-slate-300 mx-2"></div>
                <button onClick={() => islemBaslat("BORCLANDIRMA")} className="flex items-center px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 text-xs font-bold shadow-sm transition-colors"><i className="fas fa-cart-plus mr-2"></i> Veresiye Yaz (Borçlandır)</button>
                <button onClick={() => islemBaslat("TAHSILAT")} className="flex items-center px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 text-xs font-bold shadow-sm transition-colors"><i className="fas fa-hand-holding-usd mr-2"></i> Ödeme Al (Tahsilat)</button>
            </div>
            <div className="flex items-center bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm">
                <div className="text-right mr-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Piyasadaki Toplam Alacak</p>
                    <p className="text-lg font-black text-cyan-600 leading-tight">{toplamAlacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</p>
                </div>
                <div className="w-10 h-10 bg-cyan-50 text-cyan-500 rounded-full flex items-center justify-center text-xl"><i className="fas fa-book-open"></i></div>
            </div>
        </div>

        <div className="h-12 bg-slate-50 border-b border-slate-200 flex items-center px-6 shrink-0 space-x-4">
            <i className="fas fa-search text-slate-400"></i>
            <input type="text" placeholder="Müşteri adı veya soyadı ile ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="flex-1 text-sm font-bold text-slate-700 outline-none bg-transparent placeholder-slate-400" />
            <button onClick={musteriSil} className="text-xs font-bold text-red-500 hover:text-red-700"><i className="fas fa-trash mr-1"></i> Müşteriyi Sil</button>
        </div>

        {/* DATA GRID */}
        <div className="flex-1 overflow-auto bg-white relative">
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-slate-100 border-b-2 border-slate-200 sticky top-0 z-10 shadow-sm">
                    <tr className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="p-3 border-r border-slate-200 w-8 text-center"><i className="fas fa-check"></i></th>
                        <th className="p-3 border-r border-slate-200">Müşteri Adı Soyadı</th>
                        <th className="p-3 border-r border-slate-200 w-40">Telefon Numarası</th>
                        <th className="p-3 border-r border-slate-200 w-48">Adres Bilgisi</th>
                        <th className="p-3 border-r border-slate-200 w-40 text-right">Borç Bakiyesi</th>
                        <th className="p-3 w-32 text-center">Detay / Geçmiş</th>
                    </tr>
                </thead>
                <tbody>
                    {yukleniyor ? (
                        <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Müşteriler Yükleniyor...</td></tr>
                    ) : filtrelenmisMusteriler.length === 0 ? (
                        <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Kayıtlı Müşteri Bulunamadı</td></tr>
                    ) : (
                        filtrelenmisMusteriler.map((m) => {
                            const isSelected = seciliMusteriId === m.id;
                            const bakiye = Number(m.bakiye);
                            return (
                                <tr key={m.id} onClick={() => setSeciliMusteriId(m.id)} onDoubleClick={() => gecmisiGor(m.id)} className={`text-sm font-medium border-b border-slate-100 cursor-pointer select-none transition-colors ${isSelected ? 'bg-cyan-50 border-l-4 border-l-cyan-500' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 border-r border-slate-100 text-center">{isSelected && <i className="fas fa-check-circle text-cyan-600"></i>}</td>
                                    <td className={`p-3 border-r border-slate-100 font-black ${isSelected ? 'text-cyan-800' : 'text-slate-800'}`}>
                                        <i className="fas fa-user-circle text-slate-300 mr-2 text-lg align-middle"></i> {m.ad_soyad}
                                    </td>
                                    <td className="p-3 border-r border-slate-100 text-slate-600 font-bold">{m.telefon || '-'}</td>
                                    <td className="p-3 border-r border-slate-100 text-slate-500 text-xs truncate max-w-[200px]">{m.adres || '-'}</td>
                                    <td className={`p-3 border-r border-slate-100 text-right font-black ${bakiye > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {bakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                    </td>
                                    <td className="p-2 text-center">
                                        <button onClick={(e) => { e.stopPropagation(); gecmisiGor(m.id); }} className="px-3 py-1.5 bg-white border border-slate-200 hover:border-cyan-400 hover:bg-cyan-50 text-cyan-600 text-xs font-bold rounded shadow-sm transition-all">
                                            <i className="fas fa-history mr-1"></i> İncele
                                        </button>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
      </main>

      {/* --- MÜŞTERİ GEÇMİŞİ (EKSTRE) MODALI --- */}
      {gecmisModalAcik && acikMusteri && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-slate-300 max-h-[90vh]">
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
                <div>
                    <h3 className="text-lg font-black text-slate-800 flex items-center">
                        <i className="fas fa-book-reader text-cyan-600 mr-2"></i> {acikMusteri.ad_soyad} - Hesap Dökümü
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{acikMusteri.telefon} | {acikMusteri.adres}</p>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Güncel Borç</p>
                        <p className={`text-xl font-black leading-tight ${Number(acikMusteri.bakiye) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{Number(acikMusteri.bakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</p>
                    </div>
                    <button onClick={() => setGecmisModalAcik(false)} className="w-10 h-10 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-full flex items-center justify-center text-slate-500 shadow-sm transition-all"><i className="fas fa-times"></i></button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-white p-0">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            <th className="p-3 border-r border-slate-200 w-32 text-center">İşlem Tarihi</th>
                            <th className="p-3 border-r border-slate-200 w-32 text-center">İşlem Tipi</th>
                            <th className="p-3 border-r border-slate-200">Açıklama (Alınan Ürünler vb.)</th>
                            <th className="p-3 border-r border-slate-200 w-32 text-right">Tutar (TL)</th>
                            <th className="p-3 w-32 text-center">İşlemi Yapan</th>
                        </tr>
                    </thead>
                    <tbody>
                        {hareketYukleniyor ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest"><i className="fas fa-circle-notch fa-spin mr-2"></i> Geçmiş Yükleniyor...</td></tr>
                        ) : musteriHareketleri.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Henüz hiçbir işlem yapılmamış.</td></tr>
                        ) : (
                            musteriHareketleri.map((h) => {
                                const isBorc = h.islem_tipi === 'BORCLANDIRMA';
                                return (
                                    <tr key={h.id} className="text-xs font-medium border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                        <td className="p-3 border-r border-slate-100 text-center font-bold text-slate-600">{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                                        <td className="p-3 border-r border-slate-100 text-center">
                                            <span className={`px-2 py-1 rounded font-black text-[9px] uppercase tracking-widest ${isBorc ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                <i className={`fas ${isBorc ? 'fa-cart-arrow-down' : 'fa-hand-holding-usd'} mr-1`}></i> {isBorc ? 'Veresiye' : 'Tahsilat'}
                                            </span>
                                        </td>
                                        <td className="p-3 border-r border-slate-100 font-semibold text-slate-800 truncate max-w-sm">{h.aciklama || '-'}</td>
                                        <td className={`p-3 border-r border-slate-100 text-right font-black ${isBorc ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {isBorc ? '+' : '-'}{Number(h.tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}
                                        </td>
                                        <td className="p-3 text-center text-[10px] text-slate-500 font-bold uppercase">{h.islem_yapan}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-between shrink-0">
                <button onClick={() => window.print()} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 hover:text-cyan-600 hover:border-cyan-300 font-bold text-xs uppercase tracking-widest rounded-xl shadow-sm transition-all flex items-center">
                    <i className="fas fa-print mr-2"></i> Ekstreyi Yazdır
                </button>
                <div className="space-x-3">
                    <button onClick={() => islemBaslat("BORCLANDIRMA")} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all"><i className="fas fa-cart-plus mr-2"></i> Yeni Borç Ekle</button>
                    <button onClick={() => islemBaslat("TAHSILAT")} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all"><i className="fas fa-hand-holding-usd mr-2"></i> Tahsilat Yap</button>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MÜŞTERİ EKLEME MODALI --- */}
      {modalAcik && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-800 flex items-center"><i className="fas fa-user-plus text-cyan-600 mr-2"></i> Yeni Müşteri Kaydı</h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-400 hover:text-red-500"><i className="fas fa-times text-lg"></i></button>
            </div>
            
            <div className="p-6 space-y-4">
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Müşteri Adı Soyadı</label>
                    <input type="text" value={musteriForm.ad_soyad} onChange={(e) => setMusteriForm({...musteriForm, ad_soyad: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-cyan-500 focus:bg-white transition-colors" placeholder="Örn: Ahmet Amca, Ayşe Teyze" />
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Telefon Numarası</label>
                    <input type="text" value={musteriForm.telefon} onChange={(e) => setMusteriForm({...musteriForm, telefon: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-cyan-500 focus:bg-white transition-colors" placeholder="İsteğe bağlı" />
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Adres / Açıklama</label>
                    <textarea value={musteriForm.adres} onChange={(e) => setMusteriForm({...musteriForm, adres: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-cyan-500 focus:bg-white transition-colors resize-none h-20" placeholder="Hangi apartman, bina vs."></textarea>
                </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end space-x-3">
              <button onClick={() => setModalAcik(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-100 shadow-sm">İptal</button>
              <button onClick={musteriKaydet} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md flex items-center"><i className="fas fa-check mr-2"></i> Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* --- İŞLEM (BORÇ/TAHSİLAT) MODALI --- */}
      {islemModalAcik && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200">
            <div className={`border-b border-slate-200 p-4 flex justify-between items-center ${islemTipi === 'BORCLANDIRMA' ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <h3 className={`text-sm font-black flex items-center ${islemTipi === 'BORCLANDIRMA' ? 'text-red-800' : 'text-emerald-800'}`}>
                  <i className={`fas ${islemTipi === 'BORCLANDIRMA' ? 'fa-cart-plus' : 'fa-hand-holding-usd'} mr-2`}></i> 
                  {islemTipi === 'BORCLANDIRMA' ? 'Veresiye Yaz (Borçlandır)' : 'Ödeme Al (Tahsilat Yap)'}
              </h3>
              <button onClick={() => setIslemModalAcik(false)} className="text-slate-400 hover:text-red-500"><i className="fas fa-times text-lg"></i></button>
            </div>
            
            <div className="p-6 space-y-4">
                <div className="text-center mb-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">İşlem Yapılan Müşteri</p>
                    <h2 className="text-xl font-black text-slate-800">{musteriler.find(m => m.id === seciliMusteriId)?.ad_soyad}</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Tutar (TL)</label>
                        <input type="number" value={islemForm.tutar} onChange={(e) => setIslemForm({...islemForm, tutar: e.target.value})} className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl font-black text-3xl text-center outline-none transition-colors ${islemTipi === 'BORCLANDIRMA' ? 'border-red-100 text-red-600 focus:border-red-500 focus:bg-white' : 'border-emerald-100 text-emerald-600 focus:border-emerald-500 focus:bg-white'}`} placeholder="0,00" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşlem Tarihi</label>
                        <input type="date" value={islemForm.tarih} onChange={(e) => setIslemForm({...islemForm, tarih: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-cyan-500 focus:bg-white text-slate-700" />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Açıklama (Ne alındı / Ne ödendi?)</label>
                    <textarea value={islemForm.aciklama} onChange={(e) => setIslemForm({...islemForm, aciklama: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-cyan-500 focus:bg-white resize-none h-20"></textarea>
                </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end space-x-3">
              <button onClick={() => setIslemModalAcik(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-100 shadow-sm">İptal</button>
              <button onClick={islemKaydet} className={`px-5 py-2.5 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md flex items-center ${islemTipi === 'BORCLANDIRMA' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  <i className="fas fa-check mr-2"></i> Hesaba İşle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}