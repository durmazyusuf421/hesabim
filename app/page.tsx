"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function Home() {
  const pathname = usePathname(); // Aktif menüyü bulmak için
  const [aktifSirket, setAktifSirket] = useState<any>(null);
  
  // YETKİ KONTROL STATELERİ
  const [kullaniciRol, setKullaniciRol] = useState<string>("");
  const isYonetici = kullaniciRol.includes("YONETICI");
  const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
  const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
  const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;

  const [siparisler, setSiparisler] = useState<any[]>([]);
  const [firmalar, setFirmalar] = useState<any[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [seciliSiparisId, setSeciliSiparisId] = useState<number | null>(null);

  const [modalAcik, setModalAcik] = useState(false);
  const [isYeniSiparis, setIsYeniSiparis] = useState(false);
  const [seciliSiparis, setSeciliSiparis] = useState<any>(null);
  const [seciliFirmaId, setSeciliFirmaId] = useState<string>("");
  const [siparisKalemleri, setSiparisKalemleri] = useState<any[]>([]);

  const [gelenIstekler, setGelenIstekler] = useState<any[]>([]);
  const [istekModalAcik, setIstekModalAcik] = useState(false);

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    
    if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
    
    const sirket = JSON.parse(sirketStr);
    const kullanici = JSON.parse(kullaniciStr);
    
    if (sirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
    
    setKullaniciRol(kullanici.rol || "");
    setAktifSirket(sirket);
  }, []);

  useEffect(() => {
    if (aktifSirket) {
        verileriGetir();
        istekleriGetir();
    }
  }, [aktifSirket]);

  async function istekleriGetir() {
      const { data: istekData } = await supabase.from("b2b_baglantilar").select("*").eq("toptanci_id", aktifSirket.id).eq("durum", "BEKLIYOR");
      if (istekData && istekData.length > 0) {
          const marketIds = istekData.map(i => i.market_id);
          const { data: marketData } = await supabase.from("sirketler").select("*").in("id", marketIds);
          const birlesik = istekData.map(istek => ({ ...istek, marketBilgisi: marketData?.find(m => m.id === istek.market_id) }));
          setGelenIstekler(birlesik);
      } else {
          setGelenIstekler([]);
      }
  }

  async function verileriGetir() {
    setYukleniyor(true);
    const { data: fData } = await supabase.from("firmalar").select("*").eq("sahip_sirket_id", aktifSirket.id).order('unvan');
    setFirmalar(fData || []);

    const { data: sData, error } = await supabase.from("siparisler").select("*").eq("satici_sirket_id", aktifSirket.id).order('id', { ascending: false });
    if (!error) setSiparisler(sData || []);
    setYukleniyor(false);
  }

  const istegiOnayla = async (istek: any) => {
      await supabase.from("b2b_baglantilar").update({ durum: 'ONAYLANDI' }).eq("id", istek.id);
      const { data: mevcutCari } = await supabase.from("firmalar").select("id").eq("sahip_sirket_id", aktifSirket.id).eq("bagli_sirket_id", istek.market_id).single();
      if (!mevcutCari) {
          const yeniCari = { sahip_sirket_id: aktifSirket.id, bagli_sirket_id: istek.market_id, unvan: istek.marketBilgisi.unvan, firma_tipi: "Müşteri", telefon: istek.marketBilgisi.telefon, adres: istek.marketBilgisi.adres, vergi_no: istek.marketBilgisi.vergi_no };
          await supabase.from("firmalar").insert([yeniCari]);
      }
      alert("Müşteriyle bağlantı kuruldu ve Cari Kartlara eklendi!");
      istekleriGetir(); verileriGetir();
  };

  const istegiReddet = async (istekId: number) => {
      if(window.confirm("Bu isteği reddetmek istediğinize emin misiniz?")) {
          await supabase.from("b2b_baglantilar").update({ durum: 'REDDEDILDI' }).eq("id", istekId);
          istekleriGetir();
      }
  };

  const yeniSiparisBaslat = () => { setIsYeniSiparis(true); setSeciliSiparis(null); setSeciliFirmaId(""); setSiparisKalemleri([{ urun_adi: "", miktar: 1, birim_fiyat: 0 }]); setModalAcik(true); };
  const duzelt = async () => { if (!seciliSiparisId) return alert("Lütfen listeden bir sipariş seçin!"); const siparis = siparisler.find(s => s.id === seciliSiparisId); if (!siparis) return; setIsYeniSiparis(false); setSeciliSiparis(siparis); setSeciliFirmaId(siparis.alici_firma_id?.toString() || ""); const { data } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", siparis.id); setSiparisKalemleri(data || []); setModalAcik(true); };
  const sil = async () => { if (!seciliSiparisId) return alert("Lütfen listeden sipariş seçin!"); const siparis = siparisler.find(s => s.id === seciliSiparisId); if (siparis?.durum !== "YENI" && siparis?.durum !== "HAZIRLANIYOR") return alert("Sadece 'Yeni' siparişler silinebilir!"); if(window.confirm("Siparişi silmek istediğinize emin misiniz?")) { await supabase.from("siparis_kalemleri").delete().eq("siparis_id", seciliSiparisId); await supabase.from("siparisler").delete().eq("id", seciliSiparisId); setSeciliSiparisId(null); verileriGetir(); } };
  const urunSatiriEkle = () => setSiparisKalemleri([...siparisKalemleri, { urun_adi: "", miktar: 1, birim_fiyat: 0 }]);
  const satirGuncelle = (index: number, alan: string, deger: any) => { const yeniListe = [...siparisKalemleri]; yeniListe[index][alan] = deger; setSiparisKalemleri(yeniListe); };
  const durumIlerlet = async () => { if (!seciliSiparisId) return alert("Sipariş seçin!"); const siparis = siparisler.find(s => s.id === seciliSiparisId); if (!siparis) return; let yeniDurum = siparis.durum; if (siparis.durum === "YENI") yeniDurum = "HAZIRLANIYOR"; else if (siparis.durum === "ONAY_BEKLIYOR") yeniDurum = "HAZIR"; else if (siparis.durum === "HAZIR") yeniDurum = "BITTI"; else return; await supabase.from("siparisler").update({ durum: yeniDurum }).eq("id", siparis.id); verileriGetir(); };
  
  const kaydetVeGonder = async (durumHedef: string) => {
    if (!seciliFirmaId) return alert("Lütfen önce müşteri seçin!");
    const toplam = siparisKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);
    let currentId = seciliSiparis?.id;

    if (isYeniSiparis) {
      const yeniNo = `SIP-${Math.floor(1000 + Math.random() * 9000)}`;
      const { data, error } = await supabase.from("siparisler").insert([{ siparis_no: yeniNo, satici_sirket_id: aktifSirket.id, alici_firma_id: Number(seciliFirmaId), durum: durumHedef, toplam_tutar: toplam }]).select().single();
      if (error) return alert("Hata: " + error.message);
      currentId = data.id;
    } else {
      await supabase.from("siparisler").update({ toplam_tutar: toplam, durum: durumHedef, alici_firma_id: Number(seciliFirmaId) }).eq("id", currentId);
    }

    await supabase.from("siparis_kalemleri").delete().eq("siparis_id", currentId);
    const eklenecekler = siparisKalemleri.filter(k => k.urun_adi).map(k => ({ siparis_id: Number(currentId), urun_adi: k.urun_adi, miktar: k.miktar, birim_fiyat: k.birim_fiyat }));
    if (eklenecekler.length > 0) await supabase.from("siparis_kalemleri").insert(eklenecekler);

    if (durumHedef === "ONAY_BEKLIYOR" && seciliSiparis?.durum !== "ONAY_BEKLIYOR") {
      const { data: f } = await supabase.from("firmalar").select("bakiye").eq("id", seciliFirmaId).single();
      await supabase.from("firmalar").update({ bakiye: Number(f?.bakiye || 0) + toplam }).eq("id", seciliFirmaId);
    }
    setModalAcik(false); verileriGetir();
  };

  const firmaBul = (id: number) => firmalar.find(f => f.id === id)?.unvan || "Belirsiz Cari";
  const filtrelenmisSiparisler = siparisler.filter(s => s.siparis_no.toLowerCase().includes(aramaTerimi.toLowerCase()) || firmaBul(s.alici_firma_id).toLowerCase().includes(aramaTerimi.toLowerCase()));
  const getSonrakiIslemMetni = () => { if (!seciliSiparisId) return "İşlem"; const s = siparisler.find(x => x.id === seciliSiparisId); if (s?.durum === "YENI") return "Hazırlığa Al"; if (s?.durum === "ONAY_BEKLIYOR") return "Müşteri Onayladı"; if (s?.durum === "HAZIR") return "Teslimatı Bitir"; return "İşlem Bekleniyor"; };
  
  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };

  if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Sistem Doğrulanıyor...</div>;

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800">
      
      {/* SOL MENÜ (AKILLI VE KİLİTLİ TASARIM) */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden">
        <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center">
            <span className="text-orange-500 text-[10px] uppercase mb-0.5">
                {isYonetici ? 'Sistem Yöneticisi' : 'Personel Hesabı'}
            </span>
            <span className="text-xs truncate w-full">{aktifSirket.isletme_adi}</span>
        </div>
        <nav className="flex-1 py-4 space-y-1">
  {/* Ana Sayfa */}
  {isYonetici ? <Link href="/dashboard" className={`flex items-center px-6 py-3 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
  
  {/* SİPARİŞLER */}
  {isYonetici || isPlasiyer || isDepocu ? <Link href="/" className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
  
  {/* FATURALAR */}
  {isYonetici || isMuhasebe ? <Link href="/faturalar" className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
  
  {/* STOK KARTLARI */}
  {isYonetici || isDepocu ? <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
  
  {/* STOK HAREKETLERİ */}
  {isYonetici || isDepocu ? <Link href="/stok-hareketleri" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
  
  {/* CARİ KARTLARI */}
  {isYonetici || isPlasiyer || isMuhasebe ? <Link href="/cari" className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
  
  {/* CARİ HAREKETLER (EKSTRE) */}
  {isYonetici || isMuhasebe ? <Link href="/ekstre" className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice-dollar w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-file-invoice-dollar w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
</nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          {/* AYARLAR */}
          {isYonetici ? (
              <Link href="/ayarlar" className={`flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded ${pathname === "/ayarlar" ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}><i className="fas fa-cog w-6"></i> Ayarlar</Link>
          ) : (
              <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 transition-colors w-full text-xs uppercase tracking-widest" title="Ayarlara erişim yetkiniz yok"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>
          )}
          <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
        
        {/* ÜST ARAÇ ÇUBUĞU */}
        <header className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0 print:hidden">
            {/* Sadece Yönetici veya Plasiyer yeni sipariş girebilir/silebilir */}
            {(isYonetici || isPlasiyer) && (
                <>
                    <button onClick={yeniSiparisBaslat} className="flex items-center px-4 py-1.5 bg-emerald-600 border border-emerald-700 text-white rounded hover:bg-emerald-700 text-xs font-bold shadow-sm">
                        <i className="fas fa-plus mr-2"></i> Yeni Sipariş Ekle
                    </button>
                    <div className="w-px h-6 bg-slate-300 mx-2"></div>
                </>
            )}
            
            <button onClick={duzelt} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-edit text-blue-600 mr-2"></i> İncele / Düzelt</button>
            
            {(isYonetici || isPlasiyer) && (
                <button onClick={sil} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-trash-alt text-red-600 mr-2"></i> Sil</button>
            )}

            <div className="w-px h-6 bg-slate-300 mx-2"></div>
            <button onClick={durumIlerlet} disabled={!seciliSiparisId || siparisler.find(s => s.id === seciliSiparisId)?.durum === "HAZIRLANIYOR"} className="flex items-center px-3 py-1.5 bg-blue-600 border border-blue-700 text-white rounded hover:bg-blue-700 text-xs font-bold shadow-sm disabled:opacity-50"><i className="fas fa-check-circle mr-2"></i> {getSonrakiIslemMetni()}</button>
            <div className="w-px h-6 bg-slate-300 mx-2"></div>
            <button onClick={() => window.print()} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-print text-slate-600 mr-2"></i> Yazdır</button>

            {isYonetici && gelenIstekler.length > 0 && (
                <button onClick={() => setIstekModalAcik(true)} className="ml-auto flex items-center px-4 py-1.5 bg-orange-500 border border-orange-600 text-white rounded hover:bg-orange-600 text-xs font-black shadow-md animate-pulse">
                    <i className="fas fa-bell mr-2 text-sm"></i> Yeni Müşteri İsteği ({gelenIstekler.length})
                </button>
            )}
        </header>

        {/* FİLTRE VE ARAMA */}
        <div className="h-10 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4 print:hidden">
            <span className="text-xs font-bold text-slate-600 uppercase">Sipariş Fişleri</span>
            <div className="flex-1 max-w-md relative">
                <input type="text" placeholder="Fiş No veya Cari Ünvanı ile arama yapın..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="w-full text-xs px-3 py-1 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
        </div>

        {/* DATA GRID */}
        <div className="flex-1 overflow-auto bg-white relative print:hidden">
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                    <tr className="text-[11px] font-bold text-slate-700">
                        <th className="p-2 border-r border-slate-300 w-8 text-center"><i className="fas fa-caret-down"></i></th>
                        <th className="p-2 border-r border-slate-300 w-32">Belge / Fiş No</th>
                        <th className="p-2 border-r border-slate-300">Cari Adı (Müşteri)</th>
                        <th className="p-2 border-r border-slate-300 w-40 text-center">Durum</th>
                        <th className="p-2 border-r border-slate-300 w-40 text-right">Tutar (TL)</th>
                    </tr>
                </thead>
                <tbody>
                    {filtrelenmisSiparisler.map((s) => {
                        const isSelected = seciliSiparisId === s.id;
                        let durumMetni = "Bilinmiyor"; let durumRenk = "text-slate-600";
                        if(s.durum === "YENI") { durumMetni = "Yeni Sipariş"; durumRenk = "text-blue-600 font-bold"; }
                        else if(s.durum === "HAZIRLANIYOR") { durumMetni = "Depoda Hazırlanıyor"; durumRenk = "text-orange-500 font-bold"; }
                        else if(s.durum === "ONAY_BEKLIYOR") { durumMetni = "Onay Bekliyor"; durumRenk = "text-purple-600 font-bold"; }
                        else if(s.durum === "HAZIR") { durumMetni = "Sevkiyata Hazır"; durumRenk = "text-emerald-600 font-bold"; }
                        else if(s.durum === "BITTI") { durumMetni = "Teslim Edildi"; durumRenk = "text-slate-400"; }

                        return (
                            <tr key={s.id} onClick={() => setSeciliSiparisId(s.id)} onDoubleClick={duzelt} className={`text-[11px] font-medium border-b border-slate-200 cursor-pointer select-none ${isSelected ? 'bg-[#000080] text-white' : 'hover:bg-slate-100 bg-white text-slate-800'}`}>
                                <td className="p-1.5 border-r border-slate-200 text-center">{isSelected && <i className="fas fa-caret-right text-white"></i>}</td>
                                <td className="p-1.5 border-r border-slate-200">{s.siparis_no}</td>
                                <td className="p-1.5 border-r border-slate-200">{firmaBul(s.alici_firma_id)}</td>
                                <td className={`p-1.5 border-r border-slate-200 text-center ${isSelected ? 'text-white' : durumRenk}`}>{durumMetni}</td>
                                <td className="p-1.5 border-r border-slate-200 text-right font-bold">{Number(s.toplam_tutar || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </main>

      {/* --- MÜŞTERİ BAĞLANTI İSTEKLERİ MODALI --- */}
      {isYonetici && istekModalAcik && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50">
            <div className="bg-slate-100 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-400">
                <div className="bg-orange-500 border-b border-orange-600 p-3 flex justify-between items-center text-white">
                    <h3 className="text-sm font-bold flex items-center"><i className="fas fa-handshake mr-2"></i> Yeni Müşteri Çalışma İstekleri</h3>
                    <button onClick={() => setIstekModalAcik(false)} className="hover:text-red-200 px-2"><i className="fas fa-times"></i></button>
                </div>
                <div className="p-4 bg-white max-h-[60vh] overflow-y-auto space-y-3">
                    {gelenIstekler.map((istek, idx) => (
                        <div key={idx} className="border border-slate-200 rounded-lg p-4 shadow-sm bg-slate-50 flex justify-between items-center">
                            <div>
                                <h4 className="font-black text-slate-800 text-lg">{istek.marketBilgisi?.isletme_adi}</h4>
                                <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                                    <p><b>Resmi Ünvan:</b> {istek.marketBilgisi?.unvan} | <b>Vergi No:</b> {istek.marketBilgisi?.vergi_no}</p>
                                    <p><b>Konum:</b> {istek.marketBilgisi?.il} / {istek.marketBilgisi?.ilce}</p>
                                    <p><b>Telefon:</b> {istek.marketBilgisi?.telefon}</p>
                                </div>
                            </div>
                            <div className="flex flex-col space-y-2">
                                <button onClick={() => istegiOnayla(istek)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow-sm flex items-center justify-center"><i className="fas fa-check-circle mr-1"></i> Müşteriyi Onayla</button>
                                <button onClick={() => istegiReddet(istek.id)} className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-red-50 text-red-600 text-xs font-bold rounded shadow-sm flex items-center justify-center"><i className="fas fa-times mr-1"></i> Reddet</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      )}

      {/* --- SİPARİŞ DETAY MODALI --- */}
      {modalAcik && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 print:static print:bg-white">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-400 print:border-none print:shadow-none print:w-full">
            <div className="bg-slate-200 border-b border-slate-300 p-2 flex justify-between items-center print:hidden">
              <h3 className="text-xs font-bold text-slate-800 flex items-center"><i className="fas fa-file-invoice text-blue-600 mr-2 text-sm"></i> Toptan Satış Fişi {isYeniSiparis ? '(Yeni Kayıt)' : '(İnceleme/Düzeltme)'}</h3>
              <div className="flex space-x-2">
                 <button onClick={() => window.print()} className="text-slate-500 hover:text-blue-600 px-2 border border-slate-300 bg-white rounded shadow-sm text-xs"><i className="fas fa-print mr-1"></i> Yazdır</button>
                 <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times"></i></button>
              </div>
            </div>
            
            <div className="p-4 bg-white border-b border-slate-300 shrink-0">
                <div className="flex space-x-8">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center">
                            <label className="w-24 text-xs font-semibold text-slate-700">Fiş No</label>
                            <input type="text" value={isYeniSiparis ? "OTOMATİK VERİLECEK" : seciliSiparis?.siparis_no} disabled className="flex-1 border border-slate-300 px-2 py-1 text-xs bg-yellow-50 font-bold outline-none" />
                        </div>
                        <div className="flex items-center">
                            <label className="w-24 text-xs font-semibold text-slate-700">Cari Kodu/Adı</label>
                            {isYeniSiparis ? (
                                <select value={seciliFirmaId} onChange={(e) => setSeciliFirmaId(e.target.value)} className="flex-1 border border-slate-300 px-2 py-1 text-xs focus:bg-blue-50 outline-none">
                                    <option value="">--- Listeden Seçiniz ---</option>
                                    {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                                </select>
                            ) : (
                                <input type="text" value={firmaBul(Number(seciliFirmaId))} disabled className="flex-1 border border-slate-300 px-2 py-1 text-xs bg-slate-50 font-bold outline-none" />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-2 print:p-0 print:bg-white">
                <table className="w-full text-left border-collapse bg-white border border-slate-300">
                    <thead className="bg-slate-200 border-b border-slate-300">
                        <tr className="text-[11px] font-bold text-slate-700">
                            <th className="p-1.5 border-r border-slate-300 w-8 text-center print:hidden">#</th>
                            <th className="p-1.5 border-r border-slate-300">Stok Adı / Açıklama</th>
                            <th className="p-1.5 border-r border-slate-300 w-24 text-center">Miktar</th>
                            <th className="p-1.5 border-r border-slate-300 w-32 text-right">Birim Fiyat</th>
                            <th className="p-1.5 border-r border-slate-300 w-32 text-right">Tutar (TL)</th>
                            {(isYonetici || isPlasiyer) && <th className="p-1.5 w-8 text-center print:hidden"><i className="fas fa-trash"></i></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {siparisKalemleri.map((item, index) => (
                            <tr key={index} className="border-b border-slate-200 hover:bg-yellow-50 focus-within:bg-yellow-50 transition-colors">
                                <td className="p-1 border-r border-slate-300 text-center text-[10px] text-slate-400 font-bold print:hidden">{index + 1}</td>
                                <td className="p-0 border-r border-slate-300"><input value={item.urun_adi} onChange={(e) => satirGuncelle(index, "urun_adi", e.target.value)} placeholder="Stok seçin/yazın" className="w-full px-2 py-1 text-[11px] font-semibold text-slate-800 outline-none bg-transparent focus:bg-white" disabled={!isYonetici && !isPlasiyer} /></td>
                                <td className="p-0 border-r border-slate-300"><input type="number" value={item.miktar} onChange={(e) => satirGuncelle(index, "miktar", Number(e.target.value))} className="w-full px-2 py-1 text-[11px] font-bold text-center outline-none bg-transparent focus:bg-white" disabled={!isYonetici && !isPlasiyer} /></td>
                                <td className="p-0 border-r border-slate-300"><input type="number" value={item.birim_fiyat} onChange={(e) => satirGuncelle(index, "birim_fiyat", Number(e.target.value))} className="w-full px-2 py-1 text-[11px] font-bold text-right text-blue-700 outline-none bg-transparent focus:bg-white" disabled={!isYonetici && !isPlasiyer} /></td>
                                <td className="p-1.5 border-r border-slate-300 text-right text-[11px] font-bold text-slate-900">{(item.miktar * item.birim_fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                {(isYonetici || isPlasiyer) && (
                                    <td className="p-1 text-center print:hidden"><button onClick={() => setSiparisKalemleri(siparisKalemleri.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-600 outline-none"><i className="fas fa-times"></i></button></td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {(isYonetici || isPlasiyer) && (!seciliSiparis || seciliSiparis?.durum === 'YENI' || seciliSiparis?.durum === 'HAZIRLANIYOR') && (
                    <button onClick={urunSatiriEkle} className="mt-2 text-[10px] font-bold text-blue-600 hover:underline print:hidden flex items-center"><i className="fas fa-plus-circle mr-1"></i> Yeni Satır Ekle</button>
                )}
            </div>

            <div className="bg-slate-200 border-t border-slate-300 p-4 flex justify-between items-end shrink-0 print:bg-white print:border-black print:border-t-2">
                <div className="space-x-2 print:hidden">
                    {(isYonetici || isPlasiyer) && (!seciliSiparis || seciliSiparis?.durum === 'YENI' || seciliSiparis?.durum === 'HAZIRLANIYOR') && (
                        <>
                            <button onClick={() => kaydetVeGonder("HAZIRLANIYOR")} className="px-4 py-2 bg-white border border-slate-400 text-slate-700 font-bold text-xs rounded hover:bg-slate-50 shadow-sm"><i className="fas fa-save mr-2"></i>Fişi Kaydet (Hazırlanıyor)</button>
                            <button onClick={() => kaydetVeGonder("ONAY_BEKLIYOR")} className="px-4 py-2 bg-[#000080] border border-[#000050] text-white font-bold text-xs rounded hover:bg-blue-800 shadow-sm"><i className="fas fa-check-double mr-2"></i>Müşteri Onayına Gönder (Bakiye İşle)</button>
                        </>
                    )}
                </div>
                
                <div className="bg-white border border-slate-400 p-2 rounded shadow-inner w-64">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-1 mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Ara Toplam</span>
                        <span className="text-xs font-bold text-slate-700">{siparisKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-slate-800 uppercase">Genel Toplam</span>
                        <span className="text-lg font-black text-[#000080]">{siparisKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}