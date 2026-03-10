"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function StokHareketleri() {
  const pathname = usePathname();
  const [aktifSirket, setAktifSirket] = useState<any>(null);
  const [aktifKullaniciAdi, setAktifKullaniciAdi] = useState<string>("");

  // YETKİ KONTROL STATELERİ
  const [kullaniciRol, setKullaniciRol] = useState<string>("");
  const isYonetici = kullaniciRol.includes("YONETICI");
  const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
  const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
  const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;
  const hasAccess = isYonetici || isDepocu; // ERİŞİM: Sadece Patron ve Depocu

  const [urunler, setUrunler] = useState<any[]>([]);
  const [hareketler, setHareketler] = useState<any[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);

  // YENİ HAREKET MODAL STATE
  const [modalAcik, setModalAcik] = useState(false);
  const [islemForm, setIslemForm] = useState({ urun_id: "", islem_tipi: "GIRIS", miktar: 1, aciklama: "" });

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
    
    const sirket = JSON.parse(sirketStr);
    const kullanici = JSON.parse(kullaniciStr);
    if (sirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
    
    const rolStr = kullanici.rol || "";
    setKullaniciRol(rolStr);
    setAktifSirket(sirket);
    setAktifKullaniciAdi(kullanici.ad_soyad || "Bilinmeyen Kullanıcı");

    if (rolStr.includes("YONETICI") || rolStr.includes("DEPOCU")) {
        verileriGetir(sirket.id);
    } else {
        setYukleniyor(false);
    }
  }, []);

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data: uData } = await supabase.from("urunler").select("id, urun_adi, stok_miktari, birim").eq("sahip_sirket_id", sirketId).order('urun_adi');
      setUrunler(uData || []);

      const { data: hData } = await supabase.from("stok_hareketleri").select("*, urunler(urun_adi, birim)").eq("sirket_id", sirketId).order('tarih', { ascending: false }).order('id', { ascending: false });
      setHareketler(hData || []);
      setYukleniyor(false);
  }

  const yeniIslemBaslat = () => {
      setIslemForm({ urun_id: "", islem_tipi: "GIRIS", miktar: 1, aciklama: "" });
      setModalAcik(true);
  };

  const islemKaydet = async () => {
      if (!islemForm.urun_id) return alert("Lütfen bir ürün seçin!");
      if (islemForm.miktar <= 0) return alert("Miktar 0'dan büyük olmalıdır!");
      
      const seciliUrun = urunler.find(u => u.id.toString() === islemForm.urun_id);
      if (!seciliUrun) return alert("Ürün bulunamadı!");

      // STOK HAREKETİNİ KAYDET
      const { error: hError } = await supabase.from("stok_hareketleri").insert([{
          sirket_id: aktifSirket.id,
          urun_id: Number(islemForm.urun_id),
          islem_tipi: islemForm.islem_tipi,
          miktar: islemForm.miktar,
          aciklama: islemForm.aciklama || 'Manuel İşlem',
          islem_yapan: aktifKullaniciAdi
      }]);

      if (hError) return alert("İşlem kaydedilemedi: " + hError.message);

      // ANA STOK MİKTARINI GÜNCELLE
      let yeniMiktar = Number(seciliUrun.stok_miktari);
      if (islemForm.islem_tipi === "GIRIS") {
          yeniMiktar += Number(islemForm.miktar);
      } else if (islemForm.islem_tipi === "CIKIS" || islemForm.islem_tipi === "FIRE") {
          yeniMiktar -= Number(islemForm.miktar);
      } else if (islemForm.islem_tipi === "SAYIM") {
          yeniMiktar = Number(islemForm.miktar); // Sayım direkt eşitleme yapar
      }

      await supabase.from("urunler").update({ stok_miktari: yeniMiktar }).eq("id", seciliUrun.id);

      setModalAcik(false);
      verileriGetir(aktifSirket.id);
      alert("Stok işlemi başarıyla kaydedildi ve depo güncellendi!");
  };

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

  const filtrelenmisHareketler = hareketler.filter(h => (h.urunler?.urun_adi || "").toLowerCase().includes(aramaTerimi.toLowerCase()) || (h.islem_tipi || "").toLowerCase().includes(aramaTerimi.toLowerCase()));

  if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Sistem Doğrulanıyor...</div>;

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800">
      
      {/* SOL MENÜ (FATURALAR VE STOK HAREKETLERİ EKLENMİŞ GÜNCEL MENÜ) */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden">
        <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center">
            <span className="text-orange-500 text-[10px] uppercase mb-0.5">{isYonetici ? 'Sistem Yöneticisi' : 'Personel Hesabı'}</span>
            <span className="text-xs truncate w-full">{aktifSirket.isletme_adi}</span>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {isYonetici ? <Link href="/dashboard" className="flex items-center px-6 py-3 transition-all hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || isPlasiyer || isDepocu ? <Link href="/" className="flex items-center px-6 py-3 transition-all hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || isMuhasebe ? <Link href="/faturalar" className="flex items-center px-6 py-3 transition-all hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          
          {isYonetici || isDepocu ? <Link href="/stok" className="flex items-center px-6 py-3 transition-all hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {/* YENİ: STOK HAREKETLERİ LİNKİ */}
          {hasAccess ? <Link href="/stok-hareketleri" className="flex items-center px-6 py-3 transition-all bg-slate-800 text-white border-l-4 border-blue-500"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          
          {isYonetici || isPlasiyer || isMuhasebe ? <Link href="/cari" className="flex items-center px-6 py-3 transition-all hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || isMuhasebe ? <Link href="/ekstre" className="flex items-center px-6 py-3 transition-all hover:bg-slate-800 hover:text-white border-l-4 border-transparent"><i className="fas fa-file-invoice-dollar w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-file-invoice-dollar w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          {isYonetici ? <Link href="/ayarlar" className="flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded hover:text-white"><i className="fas fa-cog w-6"></i> Ayarlar</Link> : <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 w-full text-xs uppercase tracking-widest"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white relative">
        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 animate-in zoom-in-95 duration-500">
                <div className="w-32 h-32 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-black text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Stok Hareketleri sayfasına sadece "YÖNETİCİ" veya "DEPOCU" yetkisine sahip kullanıcılar erişebilir.</p>
            </div>
        ) : (
            <>
                <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0 print:hidden">
                    <button onClick={yeniIslemBaslat} className="flex items-center px-4 py-1.5 bg-blue-600 border border-blue-700 text-white rounded hover:bg-blue-700 text-xs font-bold shadow-sm"><i className="fas fa-plus-circle mr-2"></i> Manuel Stok İşlemi (Giriş/Çıkış/Fire)</button>
                    <div className="w-px h-6 bg-slate-300 mx-2"></div>
                    <button onClick={() => window.print()} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-print text-slate-600 mr-2"></i> Raporu Yazdır</button>
                </div>

                <div className="h-10 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4 print:hidden">
                    <span className="text-xs font-bold text-slate-600 uppercase">Depo Röntgeni</span>
                    <div className="flex-1 max-w-md relative">
                        <input type="text" placeholder="Stok adı veya işlem tipi ile arama yapın..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="w-full text-xs px-3 py-1 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-white relative">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                            <tr className="text-[11px] font-bold text-slate-700">
                                <th className="p-2 border-r border-slate-300 w-32 text-center">İşlem Tarihi</th>
                                <th className="p-2 border-r border-slate-300">Stok / Ürün Adı</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-center">İşlem Tipi</th>
                                <th className="p-2 border-r border-slate-300 w-24 text-center">Miktar</th>
                                <th className="p-2 border-r border-slate-300 w-48">Açıklama / Belge</th>
                                <th className="p-2 border-r border-slate-300 w-32">İşlemi Yapan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yukleniyor ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                            ) : filtrelenmisHareketler.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Stok Hareketi Bulunmuyor</td></tr>
                            ) : (
                                filtrelenmisHareketler.map((h, index) => {
                                    let icon = "fa-exchange-alt";
                                    let renkClass = "text-slate-600 bg-slate-50";
                                    
                                    if(h.islem_tipi === "GIRIS") { icon = "fa-arrow-down"; renkClass = "text-emerald-700 bg-emerald-50"; }
                                    else if(h.islem_tipi === "CIKIS") { icon = "fa-arrow-up"; renkClass = "text-blue-700 bg-blue-50"; }
                                    else if(h.islem_tipi === "FIRE") { icon = "fa-trash"; renkClass = "text-red-700 bg-red-50"; }
                                    else if(h.islem_tipi === "SAYIM") { icon = "fa-equals"; renkClass = "text-orange-700 bg-orange-50"; }

                                    return (
                                        <tr key={index} className="text-[11px] font-medium border-b border-slate-200 hover:bg-slate-50 transition-colors">
                                            <td className="p-2 border-r border-slate-200 text-center">{new Date(h.tarih).toLocaleString('tr-TR', {dateStyle: 'short', timeStyle: 'short'})}</td>
                                            <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{h.urunler?.urun_adi || '-'}</td>
                                            <td className="p-1.5 border-r border-slate-200 text-center">
                                                <span className={`px-2 py-1 rounded font-black text-[10px] uppercase tracking-widest ${renkClass}`}>
                                                    <i className={`fas ${icon} mr-1`}></i> {h.islem_tipi}
                                                </span>
                                            </td>
                                            <td className="p-2 border-r border-slate-200 text-center font-black text-lg">{h.miktar} <span className="text-[10px] text-slate-500 font-bold">{h.urunler?.birim}</span></td>
                                            <td className="p-2 border-r border-slate-200 text-slate-600 truncate max-w-xs" title={h.aciklama}>{h.aciklama}</td>
                                            <td className="p-2 text-slate-500 font-bold">{h.islem_yapan}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </>
        )}
      </main>

      {/* --- MANUEL İŞLEM MODALI --- */}
      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-lg overflow-hidden border border-slate-400">
            <div className="bg-slate-200 border-b border-slate-300 p-3 flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-800 flex items-center"><i className="fas fa-dolly-flatbed text-blue-600 mr-2"></i> Manuel Stok İşlemi</h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
            </div>
            
            <div className="p-5 bg-white border-b border-slate-300 space-y-4">
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşlem Yapılacak Ürün (Stok Kartı)</label>
                    <select value={islemForm.urun_id} onChange={(e) => setIslemForm({...islemForm, urun_id: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-800">
                        <option value="">-- Ürün Seçiniz --</option>
                        {urunler.map(u => <option key={u.id} value={u.id}>{u.urun_adi} (Mevcut: {u.stok_miktari} {u.birim})</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşlem Tipi</label>
                        <select value={islemForm.islem_tipi} onChange={(e) => setIslemForm({...islemForm, islem_tipi: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-blue-500 focus:bg-white cursor-pointer">
                            <option value="GIRIS">📥 STOK GİRİŞİ (Ekle)</option>
                            <option value="CIKIS">📤 STOK ÇIKIŞI (Düş)</option>
                            <option value="FIRE">🗑️ FİRE / BOZUK (Düş)</option>
                            <option value="SAYIM">⚖️ SAYIM (Eşitle)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Miktar</label>
                        <input type="number" value={islemForm.miktar} onChange={(e) => setIslemForm({...islemForm, miktar: Number(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-blue-500 focus:bg-white text-center" />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Açıklama / Not</label>
                    <textarea value={islemForm.aciklama} onChange={(e) => setIslemForm({...islemForm, aciklama: e.target.value})} placeholder="Örn: 2 kasa domates çöpe atıldı, depo sayımı yapıldı vb." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white resize-none h-20"></textarea>
                </div>
            </div>

            <div className="bg-slate-100 p-3 flex justify-end space-x-2">
              <button onClick={() => setModalAcik(false)} className="px-5 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center rounded-xl shadow-sm">İptal</button>
              <button onClick={islemKaydet} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest flex items-center rounded-xl shadow-md transition-colors"><i className="fas fa-check mr-2"></i> İşlemi Depoya İşle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}