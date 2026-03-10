"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function MusteriPortali() {
  const pathname = usePathname();
  const [aktifMusteri, setAktifMusteri] = useState<any>(null);

  const [toptancilar, setToptancilar] = useState<any[]>([]);
  const [baglantilar, setBaglantilar] = useState<any[]>([]);
  const [tumUrunler, setTumUrunler] = useState<any[]>([]); 
  const [yukleniyor, setYukleniyor] = useState(true);

  const [seciliToptanciId, setSeciliToptanciId] = useState<string>("TUM"); 
  
  const [sepet, setSepet] = useState<any[]>([]);
  const [aktifBirimler, setAktifBirimler] = useState<{[key: number]: number}>({}); 
  
  const [sepetModalAcik, setSepetModalAcik] = useState(false);
  const [kesfetModalAcik, setKesfetModalAcik] = useState(false);
  const [seciliUrunId, setSeciliUrunId] = useState<number | null>(null);

  const [kesfetArama, setKesfetArama] = useState("");
  const [kesfetIl, setKesfetIl] = useState("");
  const [siparisGonderiliyor, setSiparisGonderiliyor] = useState(false);

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    if (!sirketStr) { window.location.href = "/login"; return; }
    const sirket = JSON.parse(sirketStr);
    if (sirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
    setAktifMusteri(sirket);
  }, []);

  const verileriGetir = async () => {
    if (!aktifMusteri) return;
    setYukleniyor(true);
    
    const { data: toptanciData } = await supabase.from("sirketler").select("*").eq("rol", "TOPTANCI").order('isletme_adi');
    setToptancilar(toptanciData || []);

    const { data: baglantiData } = await supabase.from("b2b_baglantilar").select("*").eq("market_id", aktifMusteri.id);
    setBaglantilar(baglantiData || []);

    const onaylilar = (baglantiData || []).filter(b => b.durum === 'ONAYLANDI').map(b => b.toptanci_id);
    if (onaylilar.length > 0) {
        const { data: urunData } = await supabase.from("urunler").select("*").in("sahip_sirket_id", onaylilar).order('urun_adi');
        setTumUrunler(urunData || []);
    } else {
        setTumUrunler([]);
    }
    setYukleniyor(false);
  };

  useEffect(() => { verileriGetir(); }, [aktifMusteri]);

  const istekGonder = async (toptanciId: number, toptanciAdi: string) => {
      if(window.confirm(`${toptanciAdi} firmasına çalışma isteği göndermek istiyor musunuz?`)) {
          const { error } = await supabase.from("b2b_baglantilar").insert([{ toptanci_id: toptanciId, market_id: aktifMusteri.id, durum: 'BEKLIYOR' }]);
          if (!error) { alert("İstek gönderildi."); verileriGetir(); }
      }
  };

  const sepeteEkle = (urun: any, miktar: number, gecerliBirim: string, gecerliFiyat: number) => {
      if (miktar <= 0) {
          setSepet(sepet.filter(s => !(s.id === urun.id && s.secilen_birim === gecerliBirim)));
          return;
      }
      
      const varMi = sepet.find(s => s.id === urun.id && s.secilen_birim === gecerliBirim);
      
      if (varMi) {
          setSepet(sepet.map(s => (s.id === urun.id && s.secilen_birim === gecerliBirim) ? { ...s, miktar: miktar } : s));
      } else {
          setSepet([...sepet, { ...urun, secilen_birim: gecerliBirim, gecerli_fiyat: gecerliFiyat, miktar: miktar }]);
      }
  };

  const siparisiTamamla = async () => {
      if (sepet.length === 0) return alert("Sepetiniz boş!");
      setSiparisGonderiliyor(true);

      const siparisGruplari = sepet.reduce((gruplar: any, item: any) => {
          const toptanciId = item.sahip_sirket_id;
          if (!gruplar[toptanciId]) gruplar[toptanciId] = [];
          gruplar[toptanciId].push(item);
          return gruplar;
      }, {});

      for (const toptanciIdStr in siparisGruplari) {
          const toptanciId = Number(toptanciIdStr);
          const kalemler = siparisGruplari[toptanciIdStr];
          const toplamTutar = kalemler.reduce((acc: number, item: any) => acc + (item.gecerli_fiyat * item.miktar), 0);

          let { data: mevcutCari } = await supabase.from("firmalar").select("id").eq("sahip_sirket_id", toptanciId).eq("bagli_sirket_id", aktifMusteri.id).single();
          let cariFirmaId = mevcutCari?.id;
          
          if (!cariFirmaId) {
              const yeniCari = { sahip_sirket_id: toptanciId, bagli_sirket_id: aktifMusteri.id, unvan: aktifMusteri.unvan, telefon: aktifMusteri.telefon, adres: aktifMusteri.adres, vergi_no: aktifMusteri.vergi_no, firma_tipi: "Müşteri" };
              const { data: eklenenCari } = await supabase.from("firmalar").insert([yeniCari]).select().single();
              cariFirmaId = eklenenCari?.id;
          }

          const yeniNo = `SIP-${Math.floor(1000 + Math.random() * 9000)}`;
          const { data: siparisData, error: siparisError } = await supabase.from("siparisler").insert([{ 
              siparis_no: yeniNo, satici_sirket_id: toptanciId, alici_firma_id: cariFirmaId, durum: "YENI", toplam_tutar: toplamTutar 
          }]).select().single();

          if (!siparisError && siparisData) {
              const eklenecekler = kalemler.map((item: any) => ({ 
                  siparis_id: siparisData.id, 
                  urun_adi: `${item.urun_adi} (${item.secilen_birim})`, 
                  miktar: item.miktar, 
                  birim_fiyat: item.gecerli_fiyat 
              }));
              await supabase.from("siparis_kalemleri").insert(eklenecekler);
          }
      }

      alert("Siparişleriniz ilgili tedarikçilerinize başarıyla iletildi!");
      setSepet([]); setSepetModalAcik(false); setSiparisGonderiliyor(false);
  };

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); window.location.href = "/login"; };

  if (!aktifMusteri) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

  const onayliToptanciIdleri = baglantilar.filter(b => b.durum === 'ONAYLANDI').map(b => b.toptanci_id);
  const benimTedarikcilerim = toptancilar.filter(t => onayliToptanciIdleri.includes(t.id));
  const gosterilenUrunler = seciliToptanciId === "TUM" ? tumUrunler : tumUrunler.filter(u => u.sahip_sirket_id.toString() === seciliToptanciId);

  const digerToptancilar = toptancilar.filter(t => !onayliToptanciIdleri.includes(t.id));
  const iller = Array.from(new Set(digerToptancilar.map(t => t.il).filter(Boolean))).sort();
  const filtrelenmisDigerToptancilar = digerToptancilar.filter(t => {
      const adUyumu = (t.isletme_adi || "").toLowerCase().includes(kesfetArama.toLowerCase());
      const ilUyumu = kesfetIl ? t.il === kesfetIl : true;
      return adUyumu && ilUyumu;
  });

  const sepetToplami = sepet.reduce((acc, item) => acc + (item.gecerli_fiyat * item.miktar), 0);

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800">
        
      {/* SOL MENÜ */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800">
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

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
          <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0">
              <button onClick={() => setKesfetModalAcik(true)} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-search-location text-blue-600 mr-2"></i> Yeni Tedarikçi Bul</button>
              <div className="w-px h-6 bg-slate-300 mx-2"></div>
              <button onClick={() => setSepetModalAcik(true)} disabled={sepet.length === 0} className="flex items-center px-3 py-1.5 bg-emerald-600 border border-emerald-700 text-white rounded hover:bg-emerald-700 text-xs font-bold shadow-sm disabled:opacity-50"><i className="fas fa-shopping-cart mr-2"></i> Siparişi Tamamla ({sepet.length} Kalem)</button>
          </div>

          <div className="h-10 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4">
              <span className="text-xs font-bold text-slate-600 uppercase">Tedarikçi Filtresi</span>
              <select value={seciliToptanciId} onChange={(e) => setSeciliToptanciId(e.target.value)} className="flex-1 max-w-md text-xs px-3 py-1 border border-slate-300 rounded shadow-inner outline-none focus:border-cyan-500 font-bold text-slate-700">
                  <option value="TUM">-- TÜM TEDARİKÇİLERİM (Karma Liste) --</option>
                  {benimTedarikcilerim.map(t => <option key={t.id} value={t.id}>{t.isletme_adi} ({t.il})</option>)}
              </select>
          </div>

          <div className="flex-1 overflow-auto bg-white relative">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                      <tr className="text-[11px] font-bold text-slate-700">
                          <th className="p-2 border-r border-slate-300 w-8 text-center"><i className="fas fa-caret-down"></i></th>
                          <th className="p-2 border-r border-slate-300 w-24">Stok Kodu</th>
                          <th className="p-2 border-r border-slate-300">Stok Adı</th>
                          <th className="p-2 border-r border-slate-300 w-48 text-cyan-700">Tedarikçi / Satıcı</th>
                          <th className="p-2 border-r border-slate-300 w-32 bg-blue-50 text-blue-700">Sipariş Birimi Seç</th>
                          <th className="p-2 border-r border-slate-300 w-24 text-right">Birim Fiyatı</th>
                          <th className="p-2 border-r border-slate-300 w-32 text-center bg-yellow-50">Sipariş Miktarı</th>
                          <th className="p-2 w-32 text-right">Tutar</th>
                      </tr>
                  </thead>
                  <tbody>
                      {yukleniyor ? (
                          <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold">Ürünler Yükleniyor...</td></tr>
                      ) : gosterilenUrunler.length === 0 ? (
                          <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Kayıtlı ürün bulunamadı. Lütfen yeni tedarikçi ekleyin.</td></tr>
                      ) : (
                          gosterilenUrunler.map((u) => {
                              const isSelected = seciliUrunId === u.id;
                              const saticiFirma = benimTedarikcilerim.find(t => t.id === u.sahip_sirket_id)?.isletme_adi || "-";
                              
                              const aktifBirimNo = aktifBirimler[u.id] !== undefined ? aktifBirimler[u.id] : -1;
                              const gecerliBirim = aktifBirimNo === -1 ? u.birim : u.alt_birimler[aktifBirimNo].birim;
                              const gecerliFiyat = aktifBirimNo === -1 ? u.satis_fiyati : u.alt_birimler[aktifBirimNo].fiyat;

                              const sepettekiUrun = sepet.find(s => s.id === u.id && s.secilen_birim === gecerliBirim);
                              const miktar = sepettekiUrun ? sepettekiUrun.miktar : 0;
                              const tutar = miktar * gecerliFiyat;

                              return (
                                  <tr key={u.id} onClick={() => setSeciliUrunId(u.id)} className={`text-[11px] font-medium border-b border-slate-200 cursor-pointer select-none ${isSelected ? 'bg-[#000080] text-white' : 'hover:bg-slate-100 bg-white text-slate-800 even:bg-slate-50'}`}>
                                      {/* Sol Ok */}
                                      <td className={`p-1 border-r border-slate-200 text-center ${isSelected ? 'border-white/20' : ''}`}>
                                          {isSelected && <i className="fas fa-caret-right text-white"></i>}
                                      </td>
                                      
                                      <td className={`p-1.5 border-r border-slate-200 ${isSelected ? 'border-white/20' : ''}`}>{u.id.toString().padStart(5, '0')}</td>
                                      <td className={`p-1.5 border-r border-slate-200 font-bold ${isSelected ? 'border-white/20' : ''}`}>{u.urun_adi}</td>
                                      
                                      {/* Tedarikçi Adı */}
                                      <td className={`p-1.5 border-r border-slate-200 font-bold ${isSelected ? 'border-white/20 text-cyan-200' : 'text-cyan-700'}`}>{saticiFirma}</td>
                                      
                                      {/* AÇILIR MENÜ (SELECT) - OKUNABİLİR RENKLER */}
                                      <td className={`p-1 border-r border-slate-200 text-center ${isSelected ? 'border-white/20 bg-[#000080]' : 'bg-blue-50/50'}`}>
                                          <select 
                                              value={aktifBirimNo}
                                              onChange={(e) => setAktifBirimler({...aktifBirimler, [u.id]: Number(e.target.value)})}
                                              className={`w-full rounded px-1 py-0.5 text-[10px] font-bold outline-none cursor-pointer ${isSelected ? 'bg-[#0000a0] text-white border-none' : 'border border-slate-300 bg-white text-slate-800'}`}
                                          >
                                              <option value={-1}>{u.birim}</option>
                                              {u.alt_birimler && u.alt_birimler.map((ab: any, idx: number) => (
                                                  <option key={idx} value={idx}>{ab.birim}</option>
                                              ))}
                                          </select>
                                      </td>
                                      
                                      {/* FİYAT */}
                                      <td className={`p-1.5 border-r border-slate-200 text-right font-bold ${isSelected ? 'border-white/20 text-white' : 'text-blue-700'}`}>
                                          {Number(gecerliFiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                      </td>
                                      
                                      {/* MİKTAR GİRİŞ ALANI - OKUNABİLİR RENKLER */}
                                      <td className={`p-0 border-r border-slate-200 ${isSelected ? 'border-white/20 bg-[#000080]' : 'bg-yellow-50/50'}`}>
                                          <input 
                                              type="number" 
                                              value={miktar || ''} 
                                              onChange={(e) => sepeteEkle(u, Number(e.target.value), gecerliBirim, gecerliFiyat)}
                                              placeholder="0"
                                              className={`w-full h-full px-2 py-1 text-center font-black outline-none ${isSelected ? 'bg-[#0000a0] text-white placeholder-white/50' : 'bg-transparent text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-400'}`}
                                          />
                                      </td>
                                      
                                      {/* TUTAR */}
                                      <td className={`p-1.5 text-right font-black ${isSelected ? 'text-white' : ''}`}>
                                          {tutar > 0 ? tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}
                                      </td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
          </div>
          <div className="h-8 bg-slate-200 border-t border-slate-300 flex items-center justify-between px-4 text-[10px] text-slate-600 font-bold shrink-0">
              <span>Listelenen Ürün: {gosterilenUrunler.length}</span>
              <span className="text-blue-700">Genel Sepet Tutarı: {sepetToplami.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
          </div>
      </main>

      {/* MODALLAR (Aynı kaldı) */}
      {kesfetModalAcik && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-400 flex flex-col max-h-[90vh]">
            <div className="bg-slate-200 border-b border-slate-300 p-2 flex justify-between items-center shrink-0">
              <h3 className="text-xs font-bold text-slate-800 flex items-center"><i className="fas fa-search-location text-blue-600 mr-2"></i> Tedarikçi Ağı ve İstek Gönderimi</h3>
              <button onClick={() => setKesfetModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times"></i></button>
            </div>
            <div className="bg-white p-3 border-b border-slate-300 flex space-x-4 items-center shrink-0">
                <div className="flex-1 relative">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" placeholder="Tedarikçi adı ile arama yapın..." value={kesfetArama} onChange={(e) => setKesfetArama(e.target.value)} className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs outline-none focus:border-blue-500 shadow-inner" />
                </div>
                <div className="w-64 flex items-center">
                    <label className="text-xs font-bold text-slate-600 mr-2 whitespace-nowrap">İl Seçimi:</label>
                    <select value={kesfetIl} onChange={(e) => setKesfetIl(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:border-blue-500">
                        <option value="">Tüm İller</option>{iller.map((il: any) => <option key={il} value={il}>{il}</option>)}
                    </select>
                </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 p-0">
                <table className="w-full text-left border-collapse whitespace-nowrap text-[11px] bg-white">
                    <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0"><tr className="font-bold text-slate-700"><th className="p-2 border-r border-slate-300 w-16 text-center">İl</th><th className="p-2 border-r border-slate-300">Tedarikçi Firma Ünvanı</th><th className="p-2 border-r border-slate-300 w-32">Telefon</th><th className="p-2 w-32 text-center">İşlem</th></tr></thead>
                    <tbody>
                        {filtrelenmisDigerToptancilar.length === 0 ? ( <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Aradığınız kritere uygun toptancı bulunamadı.</td></tr> ) : (
                            filtrelenmisDigerToptancilar.map(t => {
                                const durum = baglantilar.find(b => b.toptanci_id === t.id)?.durum;
                                return (
                                    <tr key={t.id} className="border-b border-slate-200 hover:bg-slate-50">
                                        <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-500 uppercase">{t.il}</td><td className="p-2 border-r border-slate-200 font-bold text-slate-800">{t.isletme_adi}</td><td className="p-2 border-r border-slate-200">{t.telefon}</td>
                                        <td className="p-1.5 text-center">{!durum ? <button onClick={() => istekGonder(t.id, t.isletme_adi)} className="bg-white border border-slate-300 px-2 py-1 rounded text-blue-600 hover:bg-blue-50 font-bold w-full shadow-sm">İstek Gönder</button> : durum === 'BEKLIYOR' ? <span className="text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded">Bekliyor</span> : <span className="text-red-500 font-bold bg-red-50 px-2 py-1 rounded">Reddedildi</span>}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
          </div>
        </div>
      )}

      {sepetModalAcik && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-400 flex flex-col">
            <div className="bg-slate-200 border-b border-slate-300 p-2 flex justify-between items-center shrink-0">
              <h3 className="text-xs font-bold text-slate-800 flex items-center"><i className="fas fa-file-invoice text-emerald-600 mr-2 text-sm"></i> Toplu Sipariş Onayı</h3>
              <button onClick={() => setSepetModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times"></i></button>
            </div>
            <div className="p-4 bg-white border-b border-slate-300 max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-100 border-b border-slate-300"><tr className="font-bold text-slate-700"><th className="p-1.5 border-r border-slate-300">Stok Adı (Birim)</th><th className="p-1.5 border-r border-slate-300 w-32 text-cyan-700">Tedarikçi</th><th className="p-1.5 border-r border-slate-300 w-16 text-center">Miktar</th><th className="p-1.5 border-r border-slate-300 w-24 text-right">B.Fiyat</th><th className="p-1.5 w-24 text-right">Tutar</th></tr></thead>
                    <tbody>
                        {sepet.map((item, i) => (
                            <tr key={i} className="border-b border-slate-200">
                                <td className="p-1.5 border-r border-slate-200 font-semibold">{item.urun_adi} <span className="text-blue-600">({item.secilen_birim})</span></td>
                                <td className="p-1.5 border-r border-slate-200 text-cyan-700 font-bold">{benimTedarikcilerim.find(t => t.id === item.sahip_sirket_id)?.isletme_adi}</td>
                                <td className="p-1.5 border-r border-slate-200 text-center font-bold text-slate-800">{item.miktar}</td>
                                <td className="p-1.5 border-r border-slate-200 text-right">{item.gecerli_fiyat} TL</td>
                                <td className="p-1.5 text-right font-bold">{(item.miktar * item.gecerli_fiyat).toLocaleString('tr-TR')} TL</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="bg-slate-200 p-3 flex justify-between items-center shrink-0">
              <div className="text-sm font-black text-slate-800 uppercase">Genel Toplam: <span className="text-emerald-700">{sepetToplami.toLocaleString('tr-TR')} TL</span></div>
              <div className="space-x-2">
                  <button onClick={() => setSepetModalAcik(false)} className="px-4 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-sm"><i className="fas fa-times text-red-500 mr-2"></i> İptal</button>
                  <button onClick={siparisiTamamla} disabled={siparisGonderiliyor} className="px-4 py-1.5 border border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"><i className="fas fa-check mr-2"></i> Siparişi İlet</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}