"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function MarketKasasi() {
  const pathname = usePathname();
  const [aktifMusteri, setAktifMusteri] = useState<any>(null);
  const [kullaniciAdi, setKullaniciAdi] = useState<string>("");

  const [islemler, setIslemler] = useState<any[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);

  // ÖZET İSTATİSTİKLER
  const [kasaBakiye, setKasaBakiye] = useState(0);
  const [gunlukGelir, setGunlukGelir] = useState(0);
  const [gunlukGider, setGunlukGider] = useState(0);

  // MODAL STATE
  const [modalAcik, setModalAcik] = useState(false);
  const [islemTipi, setIslemTipi] = useState<"GELIR" | "GIDER">("GELIR");
  const [form, setForm] = useState({
      kategori: "Perakende Satış",
      tutar: "",
      aciklama: "",
      tarih: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    
    if (!sirketStr) { window.location.href = "/login"; return; }
    
    const sirket = JSON.parse(sirketStr);
    const kullanici = kullaniciStr ? JSON.parse(kullaniciStr) : { ad_soyad: "Yönetici" };
    
    // Sadece PERAKENDE (Market) erişebilir
    if (sirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
    
    setAktifMusteri(sirket);
    setKullaniciAdi(kullanici.ad_soyad);
    verileriGetir(sirket.id);
  }, []);

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data } = await supabase.from("kasa_islemleri").select("*").eq("sirket_id", sirketId).order('tarih', { ascending: false }).order('id', { ascending: false });
      
      if (data) {
          setIslemler(data);
          
          // İstatistikleri Hesapla
          let toplamGelir = 0; let toplamGider = 0;
          let bugunGelir = 0; let bugunGider = 0;
          const bugun = new Date().toISOString().split('T')[0];

          data.forEach(islem => {
              const tutar = Number(islem.tutar);
              if (islem.islem_tipi === 'GELIR') {
                  toplamGelir += tutar;
                  if (islem.tarih === bugun) bugunGelir += tutar;
              } else {
                  toplamGider += tutar;
                  if (islem.tarih === bugun) bugunGider += tutar;
              }
          });

          setKasaBakiye(toplamGelir - toplamGider);
          setGunlukGelir(bugunGelir);
          setGunlukGider(bugunGider);
      }
      setYukleniyor(false);
  }

  const yeniIslemAc = (tip: "GELIR" | "GIDER") => {
      setIslemTipi(tip);
      setForm({
          kategori: tip === "GELIR" ? "Perakende Satış" : "Toptancı Ödemesi",
          tutar: "",
          aciklama: "",
          tarih: new Date().toISOString().split('T')[0]
      });
      setModalAcik(true);
  };

  const islemKaydet = async () => {
      if (!form.tutar || Number(form.tutar) <= 0) return alert("Lütfen geçerli bir tutar giriniz!");
      if (!form.kategori) return alert("Lütfen kategori seçiniz!");

      const { error } = await supabase.from("kasa_islemleri").insert([{
          sirket_id: aktifMusteri.id,
          islem_tipi: islemTipi,
          kategori: form.kategori,
          tutar: Number(form.tutar),
          aciklama: form.aciklama,
          tarih: form.tarih,
          islem_yapan: kullaniciAdi
      }]);

      if (error) {
          alert("İşlem kaydedilirken bir hata oluştu: " + error.message);
      } else {
          setModalAcik(false);
          verileriGetir(aktifMusteri.id);
      }
  };

  const islemSil = async (id: number) => {
      if(window.confirm("Bu kasa işlemini kalıcı olarak silmek istediğinize emin misiniz?")) {
          await supabase.from("kasa_islemleri").delete().eq("id", id);
          verileriGetir(aktifMusteri.id);
      }
  };

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

  const filtrelenmisIslemler = islemler.filter(i => (i.aciklama || "").toLowerCase().includes(aramaTerimi.toLowerCase()) || i.kategori.toLowerCase().includes(aramaTerimi.toLowerCase()));

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

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 relative">
        
        {/* ÜST BAŞLIK VE ÖZET KARTLARI */}
        <div className="p-6 border-b border-slate-200 bg-white shrink-0">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Market Kasası</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Gelir ve Gider Yönetimi</p>
                </div>
                <div className="space-x-3">
                    <button onClick={() => yeniIslemAc('GIDER')} className="px-5 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-black text-xs uppercase tracking-widest rounded-xl shadow-sm transition-all border border-red-200">
                        <i className="fas fa-minus-circle mr-2"></i> Gider Çık
                    </button>
                    <button onClick={() => yeniIslemAc('GELIR')} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all">
                        <i className="fas fa-plus-circle mr-2"></i> Gelir Ekle
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                    <i className="fas fa-wallet absolute -right-4 -bottom-4 text-8xl text-white/5"></i>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Toplam Kasa Bakiyesi</p>
                    <h2 className={`text-3xl font-black ${kasaBakiye >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {kasaBakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-sm text-slate-500">TL</span>
                    </h2>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-5 text-emerald-900 border border-emerald-100 shadow-sm relative overflow-hidden">
                    <i className="fas fa-arrow-down absolute -right-4 -bottom-4 text-8xl text-emerald-500/10"></i>
                    <p className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest mb-1">Bugünkü Gelir (Kasa Giriş)</p>
                    <h2 className="text-3xl font-black text-emerald-600">
                        {gunlukGelir.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-sm text-emerald-600/50">TL</span>
                    </h2>
                </div>
                <div className="bg-red-50 rounded-2xl p-5 text-red-900 border border-red-100 shadow-sm relative overflow-hidden">
                    <i className="fas fa-arrow-up absolute -right-4 -bottom-4 text-8xl text-red-500/10"></i>
                    <p className="text-[10px] font-bold text-red-600/70 uppercase tracking-widest mb-1">Bugünkü Gider (Kasa Çıkış)</p>
                    <h2 className="text-3xl font-black text-red-600">
                        {gunlukGider.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-sm text-red-600/50">TL</span>
                    </h2>
                </div>
            </div>
        </div>

        {/* ARAMA ÇUBUĞU */}
        <div className="h-12 bg-white border-b border-slate-200 flex items-center px-6 shrink-0 space-x-4">
            <i className="fas fa-search text-slate-400"></i>
            <input type="text" placeholder="Açıklama veya kategori ile işlem ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="flex-1 text-sm font-bold text-slate-700 outline-none placeholder-slate-400" />
        </div>

        {/* DATA GRID */}
        <div className="flex-1 overflow-auto bg-white relative">
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-slate-50 border-b-2 border-slate-200 sticky top-0 z-10 shadow-sm">
                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="p-3 border-r border-slate-200 w-32 text-center">Tarih</th>
                        <th className="p-3 border-r border-slate-200 w-32 text-center">TÜR</th>
                        <th className="p-3 border-r border-slate-200 w-48">Kategori</th>
                        <th className="p-3 border-r border-slate-200">Açıklama</th>
                        <th className="p-3 border-r border-slate-200 w-40 text-right">Tutar (TL)</th>
                        <th className="p-3 border-r border-slate-200 w-32 text-center">İşlemi Yapan</th>
                        <th className="p-3 w-16 text-center"><i className="fas fa-cog"></i></th>
                    </tr>
                </thead>
                <tbody>
                    {yukleniyor ? (
                        <tr><td colSpan={7} className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Veriler Yükleniyor...</td></tr>
                    ) : filtrelenmisIslemler.length === 0 ? (
                        <tr><td colSpan={7} className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Kasa Hareketi Bulunmuyor</td></tr>
                    ) : (
                        filtrelenmisIslemler.map((islem) => {
                            const isGelir = islem.islem_tipi === 'GELIR';
                            return (
                                <tr key={islem.id} className="text-xs font-medium border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="p-3 border-r border-slate-100 text-center text-slate-500 font-bold">{new Date(islem.tarih).toLocaleDateString('tr-TR')}</td>
                                    <td className="p-3 border-r border-slate-100 text-center">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${isGelir ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            <i className={`fas ${isGelir ? 'fa-arrow-down' : 'fa-arrow-up'} mr-1`}></i> {isGelir ? 'GELİR' : 'GİDER'}
                                        </span>
                                    </td>
                                    <td className="p-3 border-r border-slate-100 font-bold text-slate-700">{islem.kategori}</td>
                                    <td className="p-3 border-r border-slate-100 text-slate-600 truncate max-w-sm" title={islem.aciklama}>{islem.aciklama || '-'}</td>
                                    <td className={`p-3 border-r border-slate-100 text-right font-black text-sm ${isGelir ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {isGelir ? '+' : '-'}{Number(islem.tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}
                                    </td>
                                    <td className="p-3 border-r border-slate-100 text-center text-[10px] text-slate-500 font-bold uppercase">{islem.islem_yapan}</td>
                                    <td className="p-3 text-center">
                                        <button onClick={() => islemSil(islem.id)} className="w-7 h-7 rounded bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 shadow-sm transition-all" title="Sil">
                                            <i className="fas fa-trash"></i>
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

      {/* --- KASA İŞLEM MODALI --- */}
      {modalAcik && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col animate-in zoom-in-95 duration-200">
            <div className={`border-b border-slate-200 p-4 flex justify-between items-center ${islemTipi === 'GELIR' ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <h3 className={`text-sm font-black flex items-center ${islemTipi === 'GELIR' ? 'text-emerald-800' : 'text-red-800'}`}>
                  <i className={`fas ${islemTipi === 'GELIR' ? 'fa-plus-circle' : 'fa-minus-circle'} mr-2`}></i> 
                  {islemTipi === 'GELIR' ? 'Kasa Girişi (Gelir Ekle)' : 'Kasa Çıkışı (Gider Ekle)'}
              </h3>
              <button onClick={() => setModalAcik(false)} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-600 shadow-sm"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşlem Tutarı (TL)</label>
                        <input type="number" value={form.tutar} onChange={(e) => setForm({...form, tutar: e.target.value})} className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl font-black text-2xl text-center outline-none transition-all ${islemTipi === 'GELIR' ? 'border-emerald-100 text-emerald-600 focus:border-emerald-500 focus:bg-white' : 'border-red-100 text-red-600 focus:border-red-500 focus:bg-white'}`} placeholder="0,00" />
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşlem Tarihi</label>
                        <input type="date" value={form.tarih} onChange={(e) => setForm({...form, tarih: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-700" />
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Kategori Seçimi</label>
                        <select value={form.kategori} onChange={(e) => setForm({...form, kategori: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:bg-white text-slate-700 cursor-pointer">
                            {islemTipi === 'GELIR' ? (
                                <>
                                    <option value="Perakende Satış">Perakende Satış</option>
                                    <option value="Toptan Satış">Toptan Satış</option>
                                    <option value="Diğer Gelir">Diğer Gelir</option>
                                </>
                            ) : (
                                <>
                                    <option value="Toptancı Ödemesi">Toptancı Ödemesi (Mal Alımı)</option>
                                    <option value="Market Masrafı">Market / Dükkan Masrafı</option>
                                    <option value="Maaşlar">Personel Maaş / Avans</option>
                                    <option value="Kira">Dükkan Kirası</option>
                                    <option value="Fatura">Elektrik / Su / İnternet</option>
                                    <option value="Diğer Gider">Diğer Gider</option>
                                </>
                            )}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Açıklama / Detay</label>
                    <textarea value={form.aciklama} onChange={(e) => setForm({...form, aciklama: e.target.value})} placeholder="Örn: Akşam kasası nakit teslimi, Ahmet toptancıya nakit ödeme vb." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white resize-none h-20"></textarea>
                </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end space-x-3">
              <button onClick={() => setModalAcik(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-slate-100 shadow-sm transition-colors">İptal</button>
              <button onClick={islemKaydet} className={`px-5 py-2.5 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-colors flex items-center ${islemTipi === 'GELIR' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  <i className="fas fa-check mr-2"></i> Kasaya İşle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}