"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function FaturaMerkezi() {
  const pathname = usePathname();
  const [aktifSirket, setAktifSirket] = useState<any>(null);

  // YETKİ KONTROL STATELERİ
  const [kullaniciRol, setKullaniciRol] = useState<string>("");
  const isYonetici = kullaniciRol.includes("YONETICI");
  const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
  const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
  const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;
  const hasAccess = isYonetici || isMuhasebe; // Sadece Yönetici ve Muhasebe fatura kesebilir

  const [faturalar, setFaturalar] = useState<any[]>([]);
  const [firmalar, setFirmalar] = useState<any[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [seciliFaturaId, setSeciliFaturaId] = useState<number | null>(null);

  // MODAL STATELERİ
  const [modalAcik, setModalAcik] = useState(false);
  const [faturaTipi, setFaturaTipi] = useState<"GELEN" | "GIDEN">("GIDEN");
  const [faturaForm, setFaturaForm] = useState({ fatura_no: "", tarih: new Date().toISOString().split('T')[0], cari_id: "" });
  const [faturaKalemleri, setFaturaKalemleri] = useState<any[]>([]);

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

    if (rolStr.includes("YONETICI") || rolStr.includes("MUHASEBE")) {
        verileriGetir(sirket.id);
    } else {
        setYukleniyor(false);
    }
  }, []);

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data: fData } = await supabase.from("firmalar").select("*").eq("sahip_sirket_id", sirketId).order('unvan');
      setFirmalar(fData || []);

      const { data: faturaData } = await supabase.from("faturalar").select("*, firmalar(unvan)").eq("sirket_id", sirketId).order('tarih', { ascending: false }).order('id', { ascending: false });
      setFaturalar(faturaData || []);
      setYukleniyor(false);
  }

  // YENİ FATURA OLUŞTURMA BAŞLATICI
  const yeniFaturaBaslat = (tip: "GELEN" | "GIDEN") => {
      setFaturaTipi(tip);
      setSeciliFaturaId(null);
      setFaturaForm({ fatura_no: `FTR-${Math.floor(10000 + Math.random() * 90000)}`, tarih: new Date().toISOString().split('T')[0], cari_id: "" });
      setFaturaKalemleri([{ urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0, kdv_orani: 20 }]);
      setModalAcik(true);
  };

  const incele = async () => {
      if (!seciliFaturaId) return alert("Lütfen listeden bir fatura seçin!");
      const fatura = faturalar.find(f => f.id === seciliFaturaId);
      if (!fatura) return;
      
      setFaturaTipi(fatura.tip);
      setFaturaForm({ fatura_no: fatura.fatura_no, tarih: fatura.tarih, cari_id: fatura.cari_id?.toString() || "" });
      
      const { data } = await supabase.from("fatura_kalemleri").select("*").eq("fatura_id", fatura.id);
      setFaturaKalemleri(data || []);
      setModalAcik(true);
  };

  const sil = async () => {
      if (!seciliFaturaId) return alert("Lütfen listeden bir fatura seçin!");
      if(window.confirm("Bu faturayı tamamen iptal edip silmek istediğinize emin misiniz? (Cari bakiye işlemi manuel düzeltilmelidir)")) {
          await supabase.from("fatura_kalemleri").delete().eq("fatura_id", seciliFaturaId);
          await supabase.from("faturalar").delete().eq("id", seciliFaturaId);
          setSeciliFaturaId(null); verileriGetir(aktifSirket.id);
      }
  };

  const satirEkle = () => setFaturaKalemleri([...faturaKalemleri, { urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0, kdv_orani: 20 }]);
  const satirGuncelle = (index: number, alan: string, deger: any) => { const yeni = [...faturaKalemleri]; yeni[index][alan] = deger; setFaturaKalemleri(yeni); };
  const satirSil = (index: number) => setFaturaKalemleri(faturaKalemleri.filter((_, i) => i !== index));

  // HESAPLAMALAR (KDV DAHİL)
  const araToplamHesapla = () => faturaKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);
  const kdvToplamHesapla = () => faturaKalemleri.reduce((acc, k) => acc + ((k.miktar * k.birim_fiyat) * (k.kdv_orani / 100)), 0);
  const genelToplamHesapla = () => araToplamHesapla() + kdvToplamHesapla();

  const kaydet = async () => {
      if (!faturaForm.cari_id) return alert("Lütfen Cari (Müşteri/Tedarikçi) seçin!");
      if (faturaKalemleri.length === 0 || !faturaKalemleri[0].urun_adi) return alert("Faturaya en az bir kalem eklemelisiniz!");

      const gToplam = genelToplamHesapla();
      let islemYapilacakId = seciliFaturaId;

      if (!seciliFaturaId) {
          // YENİ FATURA KAYDI
          const { data, error } = await supabase.from("faturalar").insert([{
              sirket_id: aktifSirket.id,
              cari_id: Number(faturaForm.cari_id),
              fatura_no: faturaForm.fatura_no,
              tip: faturaTipi,
              tarih: faturaForm.tarih,
              ara_toplam: araToplamHesapla(),
              kdv_toplam: kdvToplamHesapla(),
              genel_toplam: gToplam,
              durum: 'BEKLIYOR'
          }]).select().single();
          if (error) return alert("Fatura kaydedilemedi!");
          islemYapilacakId = data.id;

          // CARİ BAKİYEYE OTOMATİK İŞLEME (Opsiyonel ama ERP'lerde hayat kurtarır)
          const islemAciklama = faturaTipi === "GIDEN" ? `Satış Faturası (${faturaForm.fatura_no})` : `Alış Faturası (${faturaForm.fatura_no})`;
          const borc = faturaTipi === "GIDEN" ? gToplam : 0; // Müşteriye giden fatura müşteriyi borçlandırır
          const alacak = faturaTipi === "GELEN" ? gToplam : 0; // Tedarikçiden gelen fatura tedarikçiyi alacaklandırır
          
          await supabase.from("cari_hareketler").insert([{
              firma_id: Number(faturaForm.cari_id),
              tarih: faturaForm.tarih,
              evrak_no: faturaForm.fatura_no,
              islem_tipi: "FATURA",
              aciklama: islemAciklama,
              borc: borc,
              alacak: alacak
          }]);

          const { data: f } = await supabase.from("firmalar").select("bakiye").eq("id", faturaForm.cari_id).single();
          await supabase.from("firmalar").update({ bakiye: Number(f?.bakiye || 0) + (borc - alacak) }).eq("id", faturaForm.cari_id);

      } else {
          // GÜNCELLEME İŞLEMİ (Basit güncelleme, cari hareket detaylı düzeltilmez)
          await supabase.from("faturalar").update({
              fatura_no: faturaForm.fatura_no, tarih: faturaForm.tarih, cari_id: Number(faturaForm.cari_id),
              ara_toplam: araToplamHesapla(), kdv_toplam: kdvToplamHesapla(), genel_toplam: gToplam
          }).eq("id", seciliFaturaId);
      }

      // KALEMLERİ YENİDEN YAZ
      if (islemYapilacakId) {
          await supabase.from("fatura_kalemleri").delete().eq("fatura_id", islemYapilacakId);
          const eklenecekler = faturaKalemleri.filter(k => k.urun_adi).map(k => ({
              fatura_id: islemYapilacakId,
              urun_adi: k.urun_adi, miktar: k.miktar, birim: k.birim, birim_fiyat: k.birim_fiyat, 
              kdv_orani: k.kdv_orani, toplam_tutar: (k.miktar * k.birim_fiyat) * (1 + (k.kdv_orani / 100))
          }));
          if (eklenecekler.length > 0) await supabase.from("fatura_kalemleri").insert(eklenecekler);
      }

      setModalAcik(false); verileriGetir(aktifSirket.id);
  };

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

  const filtrelenmisFaturalar = faturalar.filter(f => f.fatura_no.toLowerCase().includes(aramaTerimi.toLowerCase()) || (f.firmalar?.unvan || "").toLowerCase().includes(aramaTerimi.toLowerCase()));

  if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Sistem Doğrulanıyor...</div>;

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800">
      
      {/* SOL MENÜ */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden">
        <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center">
            <span className="text-orange-500 text-[10px] uppercase mb-0.5">{isYonetici ? 'Sistem Yöneticisi' : 'Personel Hesabı'}</span>
            <span className="text-xs truncate w-full">{aktifSirket.isletme_adi}</span>
        </div>
        <nav className="flex-1 py-4 space-y-1">
  {/* Ana Sayfa */}
  {isYonetici ? (
      <Link href="/dashboard" className={`flex items-center px-6 py-3 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link>
  ) : (
      <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors" title="Bu ekrana yetkiniz yok"><i className="fas fa-chart-pie w-6"></i> Patron Ekranı <i className="fas fa-lock ml-auto text-[10px]"></i></div>
  )}
  
  {/* SİPARİŞLER */}
  {isYonetici || isPlasiyer || isDepocu ? (
      <Link href="/" className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link>
  ) : (
      <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors" title="Bu ekrana yetkiniz yok"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>
  )}

  {/* FATURALAR */}
  {isYonetici || isMuhasebe ? (
      <Link href="/faturalar" className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link>
  ) : (
      <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors" title="Bu ekrana yetkiniz yok"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>
  )}
  
  {/* STOK KARTLARI */}
  {isYonetici || isDepocu ? (
      <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link>
  ) : (
      <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors" title="Bu ekrana yetkiniz yok"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>
  )}

  {/* STOK HAREKETLERİ */}
  {isYonetici || isDepocu ? (
      <Link href="/stok-hareketleri" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link>
  ) : (
      <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors" title="Bu ekrana yetkiniz yok"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>
  )}

  {/* CARİ KARTLARI */}
  {isYonetici || isPlasiyer || isMuhasebe ? (
      <Link href="/cari" className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link>
  ) : (
      <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors" title="Bu ekrana yetkiniz yok"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>
  )}

  {/* CARİ HAREKETLER (EKSTRE) */}
  {isYonetici || isMuhasebe ? (
      <Link href="/ekstre" className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice-dollar w-6"></i> Cari Hareketler</Link>
  ) : (
      <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors" title="Bu ekrana yetkiniz yok"><i className="fas fa-file-invoice-dollar w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>
  )}
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
                <p className="text-slate-500 font-bold max-w-md mx-auto">Resmi Fatura ekranına sadece "YÖNETİCİ" veya "MUHASEBE" yetkisine sahip kullanıcılar erişebilir.</p>
            </div>
        ) : (
            <>
                <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0 print:hidden">
                    <button onClick={() => yeniFaturaBaslat('GIDEN')} className="flex items-center px-4 py-1.5 bg-blue-600 border border-blue-700 text-white rounded hover:bg-blue-700 text-xs font-bold shadow-sm"><i className="fas fa-file-export mr-2"></i> Yeni Satış Faturası (Giden)</button>
                    <button onClick={() => yeniFaturaBaslat('GELEN')} className="flex items-center px-4 py-1.5 bg-orange-500 border border-orange-600 text-white rounded hover:bg-orange-600 text-xs font-bold shadow-sm"><i className="fas fa-file-import mr-2"></i> Yeni Alış Faturası (Gelen)</button>
                    <div className="w-px h-6 bg-slate-300 mx-2"></div>
                    <button onClick={incele} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-search text-slate-600 mr-2"></i> İncele</button>
                    <button onClick={sil} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-trash-alt text-red-600 mr-2"></i> Sil</button>
                </div>

                <div className="h-10 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4 print:hidden">
                    <span className="text-xs font-bold text-slate-600 uppercase">Resmi Faturalar</span>
                    <div className="flex-1 max-w-md relative">
                        <input type="text" placeholder="Fatura No veya Cari Unvanı..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="w-full text-xs px-3 py-1 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-white relative print:hidden">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                            <tr className="text-[11px] font-bold text-slate-700">
                                <th className="p-2 border-r border-slate-300 w-8 text-center"><i className="fas fa-caret-down"></i></th>
                                <th className="p-2 border-r border-slate-300 w-32 text-center">Tarih</th>
                                <th className="p-2 border-r border-slate-300 w-32">Fatura No</th>
                                <th className="p-2 border-r border-slate-300 w-24 text-center">Yön</th>
                                <th className="p-2 border-r border-slate-300">Cari Ünvanı (Alıcı/Satıcı)</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-right">Ara Toplam</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-right">KDV Toplam</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-right">Genel Toplam (TL)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtrelenmisFaturalar.map((f) => {
                                const isSelected = seciliFaturaId === f.id;
                                const isGiden = f.tip === "GIDEN";
                                return (
                                    <tr key={f.id} onClick={() => setSeciliFaturaId(f.id)} onDoubleClick={incele} className={`text-[11px] font-medium border-b border-slate-200 cursor-pointer select-none ${isSelected ? 'bg-[#000080] text-white' : 'hover:bg-slate-100 bg-white text-slate-800'}`}>
                                        <td className="p-1.5 border-r border-slate-200 text-center">{isSelected && <i className="fas fa-caret-right text-white"></i>}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-center">{new Date(f.tarih).toLocaleDateString('tr-TR')}</td>
                                        <td className="p-1.5 border-r border-slate-200 font-bold">{f.fatura_no}</td>
                                        <td className={`p-1.5 border-r border-slate-200 text-center font-black ${isSelected ? 'text-white' : (isGiden ? 'text-blue-600' : 'text-orange-500')}`}>{isGiden ? 'SATIŞ' : 'ALIŞ'}</td>
                                        <td className="p-1.5 border-r border-slate-200">{f.firmalar?.unvan || '-'}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-right">{Number(f.ara_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-right">{Number(f.kdv_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-right font-black">{Number(f.genel_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </>
        )}
      </main>

      {/* --- FATURA GİRİŞ MODALI --- */}
      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 print:static print:bg-white">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-400 print:border-none print:shadow-none print:w-full">
            <div className={`border-b border-slate-300 p-3 flex justify-between items-center print:hidden ${faturaTipi === 'GIDEN' ? 'bg-blue-100' : 'bg-orange-100'}`}>
              <h3 className={`text-sm font-black flex items-center ${faturaTipi === 'GIDEN' ? 'text-blue-800' : 'text-orange-800'}`}>
                  <i className={`fas ${faturaTipi === 'GIDEN' ? 'fa-file-export' : 'fa-file-import'} mr-2`}></i> 
                  {faturaTipi === 'GIDEN' ? 'Satış Faturası (Giden)' : 'Alış Faturası (Gelen)'}
              </h3>
              <div className="flex space-x-2">
                 <button onClick={() => window.print()} className="text-slate-600 hover:text-blue-600 px-3 py-1 border border-slate-300 bg-white rounded shadow-sm text-xs font-bold"><i className="fas fa-print mr-1"></i> Yazdır</button>
                 <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
              </div>
            </div>
            
            <div className="p-4 bg-white border-b border-slate-300 shrink-0">
                <div className="flex space-x-8">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center"><label className="w-24 text-xs font-bold text-slate-700">Fatura No</label><input type="text" value={faturaForm.fatura_no} onChange={(e) => setFaturaForm({...faturaForm, fatura_no: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs bg-slate-50 font-bold outline-none focus:border-blue-500" /></div>
                        <div className="flex items-center"><label className="w-24 text-xs font-bold text-slate-700">Tarih</label><input type="date" value={faturaForm.tarih} onChange={(e) => setFaturaForm({...faturaForm, tarih: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs bg-slate-50 font-bold outline-none focus:border-blue-500" /></div>
                        <div className="flex items-center">
                            <label className="w-24 text-xs font-bold text-slate-700">Cari Hesap</label>
                            <select value={faturaForm.cari_id} onChange={(e) => setFaturaForm({...faturaForm, cari_id: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 outline-none font-bold text-slate-800">
                                <option value="">--- Fatura Kesilecek Cariyi Seçiniz ---</option>
                                {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-2 print:p-0 print:bg-white">
                <table className="w-full text-left border-collapse bg-white border border-slate-300">
                    <thead className="bg-slate-200 border-b border-slate-300">
                        <tr className="text-[11px] font-bold text-slate-700">
                            <th className="p-1.5 border-r border-slate-300 w-8 text-center print:hidden">#</th>
                            <th className="p-1.5 border-r border-slate-300">Stok / Hizmet Adı</th>
                            <th className="p-1.5 border-r border-slate-300 w-24 text-center">Miktar</th>
                            <th className="p-1.5 border-r border-slate-300 w-20 text-center">Birim</th>
                            <th className="p-1.5 border-r border-slate-300 w-32 text-right">Birim Fiyat</th>
                            <th className="p-1.5 border-r border-slate-300 w-16 text-center">KDV %</th>
                            <th className="p-1.5 border-r border-slate-300 w-32 text-right">KDV'li Tutar</th>
                            <th className="p-1.5 w-8 text-center print:hidden"><i className="fas fa-trash"></i></th>
                        </tr>
                    </thead>
                    <tbody>
                        {faturaKalemleri.map((item, index) => {
                            const tutarKDVsiz = item.miktar * item.birim_fiyat;
                            const tutarKDVli = tutarKDVsiz * (1 + (item.kdv_orani / 100));
                            return (
                                <tr key={index} className="border-b border-slate-200 hover:bg-yellow-50 focus-within:bg-yellow-50 transition-colors">
                                    <td className="p-1 border-r border-slate-300 text-center text-[10px] text-slate-400 font-bold print:hidden">{index + 1}</td>
                                    <td className="p-0 border-r border-slate-300"><input value={item.urun_adi} onChange={(e) => satirGuncelle(index, "urun_adi", e.target.value)} placeholder="Stok veya Hizmet yazın" className="w-full px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="p-0 border-r border-slate-300"><input type="number" value={item.miktar} onChange={(e) => satirGuncelle(index, "miktar", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] font-bold text-center outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="p-0 border-r border-slate-300"><input type="text" value={item.birim} onChange={(e) => satirGuncelle(index, "birim", e.target.value)} className="w-full px-2 py-1.5 text-[11px] font-bold text-center outline-none bg-transparent focus:bg-white uppercase" /></td>
                                    <td className="p-0 border-r border-slate-300"><input type="number" value={item.birim_fiyat} onChange={(e) => satirGuncelle(index, "birim_fiyat", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] font-bold text-right text-blue-700 outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="p-0 border-r border-slate-300"><input type="number" value={item.kdv_orani} onChange={(e) => satirGuncelle(index, "kdv_orani", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] font-bold text-center text-orange-600 outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="p-1.5 border-r border-slate-300 text-right text-[11px] font-black text-slate-900">{tutarKDVli.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                    <td className="p-1 text-center print:hidden"><button onClick={() => satirSil(index)} className="text-slate-400 hover:text-red-600 outline-none"><i className="fas fa-times"></i></button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <button onClick={satirEkle} className="mt-3 ml-2 text-[11px] font-bold text-blue-600 hover:underline print:hidden flex items-center"><i className="fas fa-plus-circle mr-1"></i> Yeni Fatura Satırı Ekle</button>
            </div>

            <div className="bg-slate-200 border-t border-slate-300 p-4 flex justify-between items-end shrink-0 print:bg-white print:border-black print:border-t-2">
                <div className="space-x-2 print:hidden">
                    <button onClick={kaydet} className={`px-6 py-2 border text-white font-black text-xs uppercase tracking-widest rounded shadow-md transition-colors flex items-center ${faturaTipi === 'GIDEN' ? 'bg-blue-600 hover:bg-blue-700 border-blue-700' : 'bg-orange-500 hover:bg-orange-600 border-orange-600'}`}>
                        <i className="fas fa-save mr-2"></i> Faturayı Kaydet ve Cari Bakiye'ye İşle
                    </button>
                </div>
                
                <div className="bg-white border border-slate-400 p-3 rounded shadow-inner w-72">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-1 mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Ara Toplam</span>
                        <span className="text-xs font-bold text-slate-700">{araToplamHesapla().toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">KDV Toplam</span>
                        <span className="text-xs font-bold text-orange-600">{kdvToplamHesapla().toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-slate-800 uppercase">Genel Toplam</span>
                        <span className="text-xl font-black text-[#000080]">{genelToplamHesapla().toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}