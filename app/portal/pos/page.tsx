"use client";
import React, { useEffect, useState, useRef, useMemo } from 'react';
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

export default function PosEkrani() {
  const { aktifSirket, kullanici } = useAuth();
  const toast = useToast();
  const [kullaniciAdi, setKullaniciAdi] = useState<string>("");

  // VERİTABANI STATELERİ
  const [urunler, setUrunler] = useState<any[]>([]);
  const [musteriler, setMusteriler] = useState<any[]>([]);
  
  // POS STATELERİ
  const [sepet, setSepet] = useState<any[]>([]);
  const [barkodGirdisi, setBarkodGirdisi] = useState("");
  const [seciliMusteriId, setSeciliMusteriId] = useState<string>("");
  const [islemYapiliyor, setIslemYapiliyor] = useState(false);
  
  // MANUEL ÜRÜN ARAMA STATELERİ
  const [aramaModalAcik, setAramaModalAcik] = useState(false);
  const [urunAramaTerimi, setUrunAramaTerimi] = useState("");

  const barkodInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aktifSirket) return;
    if (aktifSirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
    setKullaniciAdi(kullanici?.ad_soyad || "Kasiyer");
    verileriGetir(aktifSirket.id);
    barkodInputRef.current?.focus();
  }, [aktifSirket, kullanici]);

  async function verileriGetir(sirketId: number) {
      const { data: uData } = await supabase.from("urunler").select("*").eq("sahip_sirket_id", sirketId).order('urun_adi');
      setUrunler(uData || []);
      const { data: mData } = await supabase.from("veresiye_musteriler").select("*").eq("sirket_id", sirketId).order('ad_soyad');
      setMusteriler(mData || []);
  }

  // BARKOD OKUTMA İŞLEMİ
  const barkodOkutuldu = (e?: React.KeyboardEvent<HTMLInputElement>, manuelBarkod?: string) => {
      const okunanBarkod = (manuelBarkod || barkodGirdisi).trim();
      
      if ((e && e.key === "Enter" && okunanBarkod !== "") || (manuelBarkod && okunanBarkod !== "")) {
          if (e) e.preventDefault();
          
          const urun = urunler.find(u => u.barkod === okunanBarkod || u.id.toString() === okunanBarkod);
          
          if (urun) {
              sepeteEkle(urun);
          } else {
              toast.error("Ürün / Barkod bulunamadı! Manuel aramayı kullanın.");
          }
          setBarkodGirdisi("");
          barkodInputRef.current?.focus();
      }
  };

  const sepeteEkle = (urun: any) => {
      const varOlan = sepet.find(item => item.urun_id === urun.id);
      if (varOlan) {
          setSepet(sepet.map(item => item.urun_id === urun.id ? { ...item, miktar: item.miktar + 1, fiyat: Number(urun.satis_fiyati) } : item));
      } else {
          setSepet([{ 
              urun_id: urun.id, 
              ad: urun.urun_adi, 
              barkod: urun.barkod || urun.id.toString().padStart(5,'0'), 
              miktar: 1, 
              fiyat: Number(urun.satis_fiyati), 
              stok: Number(urun.stok_miktari)
          }, ...sepet]);
      }
      // Manuel arama modalı açıksa kapatıp barkoda odaklanalım
      if(aramaModalAcik) {
          setAramaModalAcik(false);
          setUrunAramaTerimi("");
          setTimeout(() => barkodInputRef.current?.focus(), 100);
      }
  };

  const sepetMiktarDegistir = (urun_id: number, yeniMiktar: number) => {
      if (yeniMiktar <= 0) setSepet(sepet.filter(item => item.urun_id !== urun_id));
      else setSepet(sepet.map(item => item.urun_id === urun_id ? { ...item, miktar: yeniMiktar } : item));
      barkodInputRef.current?.focus();
  };

  const sepetiTemizle = () => { 
      if(window.confirm("Satışı iptal etmek istediğinize emin misiniz?")) {
          setSepet([]); setSeciliMusteriId(""); barkodInputRef.current?.focus(); 
      }
  };

  const genelToplam = useMemo(() => {
      return sepet.reduce((sum, item) => sum + (item.miktar * item.fiyat), 0);
  }, [sepet]);

  // NUMPAD İŞLEMLERİ
  const numpadTikla = (tus: string) => {
      if (tus === 'C') setBarkodGirdisi('');
      else if (tus === 'Sil') setBarkodGirdisi(prev => prev.slice(0, -1));
      else if (tus === 'Enter') barkodOkutuldu(undefined, barkodGirdisi);
      else setBarkodGirdisi(prev => prev + tus);
      barkodInputRef.current?.focus();
  };

  // ÖDEME İŞLEMİ (VERİTABANINA YAZMA)
  const odemeAl = async (odemeTipi: "NAKIT" | "KREDI_KARTI" | "VERESIYE") => {
      if (sepet.length === 0) { toast.error("Sepette ürün yok!"); return; }
      if (odemeTipi === "VERESIYE" && !seciliMusteriId) { toast.error("Veresiye için müşteri seçin!"); return; }
      
      setIslemYapiliyor(true);

      try {
          const { data: satisData, error: satisError } = await supabase.from("perakende_satislar").insert([{
              sirket_id: aktifSirket!.id, musteri_id: seciliMusteriId ? Number(seciliMusteriId) : null,
              odeme_tipi: odemeTipi, toplam_tutar: genelToplam, islem_yapan: kullaniciAdi
          }]).select().single();

          if (satisError) throw new Error("Satış kaydedilemedi!");

          const kalemler = sepet.map(item => ({
              satis_id: satisData.id, urun_id: item.urun_id, urun_adi: item.ad,
              miktar: item.miktar, birim_fiyat: item.fiyat, toplam_tutar: item.miktar * item.fiyat
          }));
          await supabase.from("perakende_satis_kalemleri").insert(kalemler);

          // Stok Düş
          for (const item of sepet) {
              const gercekUrun = urunler.find(u => u.id === item.urun_id);
              if (gercekUrun) {
                  await supabase.from("urunler").update({ stok_miktari: Number(gercekUrun.stok_miktari) - item.miktar }).eq("id", item.urun_id);
              }
          }

          // Kasaya veya Veresiye Defterine İşle
          if (odemeTipi === "NAKIT" || odemeTipi === "KREDI_KARTI") {
              await supabase.from("kasa_islemleri").insert([{
                  sirket_id: aktifSirket!.id, islem_tipi: 'GELIR', kategori: 'Perakende Satış',
                  tutar: genelToplam, aciklama: `POS Satışı (#${satisData.id}) - ${odemeTipi === 'NAKIT' ? 'Nakit' : 'Kredi Kartı'}`, islem_yapan: kullaniciAdi
              }]);
          } else if (odemeTipi === "VERESIYE") {
              const musteri = musteriler.find(m => m.id.toString() === seciliMusteriId);
              await supabase.from("veresiye_hareketler").insert([{
                  musteri_id: Number(seciliMusteriId), islem_tipi: 'BORCLANDIRMA', tutar: genelToplam,
                  aciklama: `Market Alışverişi (#${satisData.id})`, islem_yapan: kullaniciAdi
              }]);
              await supabase.from("veresiye_musteriler").update({ bakiye: Number(musteri.bakiye) + genelToplam }).eq("id", musteri.id);
          }

          setSepet([]); setSeciliMusteriId(""); verileriGetir(aktifSirket!.id); barkodInputRef.current?.focus();
      } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Hata oluştu"); } finally { setIslemYapiliyor(false); }
  };

  const filtrelenmisUrunler = urunler.filter(u => u.urun_adi.toLowerCase().includes(urunAramaTerimi.toLowerCase()) || (u.barkod && u.barkod.includes(urunAramaTerimi)));

  if (!aktifSirket) return <div className="h-full flex items-center justify-center font-semibold text-[#64748b]" style={{ background: "var(--c-bg)" }}>Yükleniyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        <div className="flex-1 flex gap-4 p-4 overflow-hidden select-none">
          
          {/* SÜTUN 1: SEPET (SATIŞ FİŞİ) - MODERN & OKUNAKLI */}
          <div className="w-[42%] bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
              <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center z-10 shrink-0">
                  <h2 className="font-black text-slate-800 flex items-center tracking-tight">
                      <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mr-3"><i className="fas fa-shopping-cart"></i></div>
                      SATIŞ FİŞİ
                  </h2>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                      Kasiyer: <span className="text-blue-600">{kullaniciAdi}</span>
                  </div>
              </div>
              
              <div className="flex-1 overflow-y-auto bg-white p-2">
                  {sepet.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                          <i className="fas fa-barcode text-6xl opacity-50"></i>
                          <p className="font-bold uppercase tracking-widest text-sm">Sepetiniz Boş</p>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {sepet.map((item) => (
                              <div key={item.urun_id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-blue-300 transition-colors flex items-center justify-between group">
                                  
                                  {/* Ürün Adı ve Fiyat */}
                                  <div className="flex-1">
                                      <h3 className="font-black text-slate-800 text-sm truncate max-w-[180px]">{item.ad}</h3>
                                      <p className="text-[11px] font-bold text-slate-400 mt-1">Birim Fiyat: {item.fiyat.toLocaleString('tr-TR')} TL</p>
                                  </div>

                                  {/* Miktar Arttır/Azalt Butonları */}
                                  <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 mr-4">
                                      <button onClick={() => sepetMiktarDegistir(item.urun_id, item.miktar - 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-red-500 font-black text-lg transition-colors">-</button>
                                      <span className="w-10 text-center font-black text-slate-800 text-lg">{item.miktar}</span>
                                      <button onClick={() => sepetMiktarDegistir(item.urun_id, item.miktar + 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-slate-600 hover:text-emerald-500 font-black text-lg transition-colors">+</button>
                                  </div>

                                  {/* Satır Toplamı ve Sil Butonu */}
                                  <div className="flex items-center space-x-3">
                                      <div className="text-right w-20">
                                          <p className="font-black text-lg text-blue-600">{(item.miktar * item.fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</p>
                                      </div>
                                      <button onClick={() => sepetMiktarDegistir(item.urun_id, 0)} className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-colors shadow-sm">
                                          <i className="fas fa-trash-alt"></i>
                                      </button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>

              {/* DEV GENEL TOPLAM ALANI */}
              <div className="bg-slate-900 text-white p-6 shrink-0 relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl"></div>
                  <div className="flex justify-between items-end relative z-10">
                      <div>
                          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Ödenecek Tutar</p>
                          <p className="text-slate-500 font-semibold text-sm">Toplam {sepet.reduce((sum, item) => sum + item.miktar, 0)} Ürün</p>
                      </div>
                      <div className="text-5xl font-black tracking-tighter text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                          {genelToplam.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-2xl text-emerald-600 align-super">TL</span>
                      </div>
                  </div>
              </div>
          </div>

          {/* SÜTUN 2: BARKOD GİRİŞİ & NUMPAD & ÖDEME */}
          <div className="w-[33%] flex flex-col gap-4">
              
              {/* Barkod Okutma Alanı */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 shrink-0 relative overflow-hidden group focus-within:border-blue-400 transition-colors">
                  <div className="flex items-center text-blue-600 mb-3 font-black text-xs uppercase tracking-widest">
                      <i className="fas fa-barcode text-xl mr-2"></i> Ürün Barkodu Okutun
                  </div>
                  <input 
                      type="text" 
                      ref={barkodInputRef}
                      value={barkodGirdisi} 
                      onChange={(e) => setBarkodGirdisi(e.target.value)} 
                      onKeyDown={barkodOkutuldu}
                      autoFocus
                      placeholder="Barkod veya Ürün Kodu..." 
                      className="w-full bg-slate-50 border-2 border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-4 text-2xl font-black text-slate-800 outline-none text-center tracking-widest shadow-inner transition-all" 
                  />
              </div>

              {/* Numpad (İri ve Dokunmatik Dostu) */}
              <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 grid grid-cols-3 grid-rows-4 gap-3">
                  {['7','8','9','4','5','6','1','2','3','C','0','Enter'].map((tus, index) => {
                      let btnClass = "bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 active:bg-slate-200 rounded-xl flex items-center justify-center text-3xl font-black text-slate-700 transition-all shadow-sm";
                      
                      if (tus === 'Enter') btnClass = "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl flex items-center justify-center text-white text-xl font-black uppercase tracking-widest transition-all shadow-md";
                      if (tus === 'C') btnClass = "bg-red-50 border border-red-200 hover:bg-red-100 active:bg-red-200 rounded-xl flex items-center justify-center text-red-500 text-xl font-black uppercase tracking-widest transition-all shadow-sm";

                      return (
                          <button key={index} onClick={() => numpadTikla(tus)} className={btnClass}>
                              {tus}
                          </button>
                      );
                  })}
              </div>

              {/* Ödeme Butonları (Klasik Renk Kodlaması) */}
              <div className="grid grid-cols-2 grid-rows-2 gap-3 h-40 shrink-0">
                  <button onClick={() => odemeAl("NAKIT")} disabled={islemYapiliyor || sepet.length === 0} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-xl shadow-md transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex flex-col items-center justify-center gap-1">
                      <i className="fas fa-money-bill-wave text-2xl"></i> NAKİT
                  </button>
                  <button onClick={() => odemeAl("KREDI_KARTI")} disabled={islemYapiliyor || sepet.length === 0} className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-black text-xl shadow-md transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex flex-col items-center justify-center gap-1">
                      <i className="fas fa-credit-card text-2xl"></i> K. KARTI
                  </button>
                  <button onClick={() => odemeAl("VERESIYE")} disabled={islemYapiliyor || sepet.length === 0} className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black text-xl shadow-md transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex flex-col items-center justify-center gap-1">
                      <i className="fas fa-book text-2xl"></i> VERESİYE
                  </button>
                  <button onClick={sepetiTemizle} disabled={sepet.length === 0} className="bg-slate-200 hover:bg-red-500 hover:text-white text-slate-600 rounded-xl font-black text-sm uppercase tracking-widest shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex flex-col items-center justify-center gap-1 border border-slate-300 hover:border-red-600">
                      <i className="fas fa-trash-alt text-xl"></i> İPTAL ET
                  </button>
              </div>
          </div>

          {/* SÜTUN 3: MÜŞTERİ, YENİ ÖZELLİKLER & İŞLEMLER */}
          <div className="w-[25%] flex flex-col gap-4">
              
              {/* Müşteri Seçimi */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 shrink-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center">
                      <i className="fas fa-user-tag text-blue-500 mr-2 text-sm" /> Müşteri Seçimi (Veresiye)
                  </label>
                  <select 
                      value={seciliMusteriId} 
                      onChange={(e) => { setSeciliMusteriId(e.target.value); barkodInputRef.current?.focus(); }}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold text-sm rounded-xl p-3 outline-none focus:border-blue-500 focus:bg-white cursor-pointer transition-colors shadow-inner"
                  >
                      <option value="">-- NAKİT MÜŞTERİ --</option>
                      {musteriler.map(m => (
                          <option key={m.id} value={m.id}>{m.ad_soyad} (B: {m.bakiye})</option>
                      ))}
                  </select>
              </div>

              {/* YENİ EKLENEN: MANUEL ÜRÜN ARAMA BUTONU */}
              <button onClick={() => setAramaModalAcik(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl p-4 shadow-lg flex flex-col items-center justify-center transition-transform hover:-translate-y-1 active:translate-y-0 shrink-0">
                  <i className="fas fa-search text-3xl mb-2 drop-shadow-sm"></i>
                  <span className="font-black text-lg tracking-wide drop-shadow-sm">MANUEL ÜRÜN ARA</span>
                  <span className="text-[10px] font-medium opacity-80 uppercase tracking-widest mt-1">Barkodsuz Ekle</span>
              </button>

              {/* Diğer Hızlı İşlemler */}
              <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-3 grid grid-cols-2 grid-rows-3 gap-2">
                  {[
                      { text: 'Müşteri Ekle', icon: 'fa-user-plus', color: 'text-emerald-500', bg: 'bg-emerald-50 hover:bg-emerald-100' },
                      { text: 'Fiyat Gör', icon: 'fa-tags', color: 'text-purple-500', bg: 'bg-purple-50 hover:bg-purple-100' },
                      { text: 'Parka Al', icon: 'fa-pause-circle', color: 'text-amber-500', bg: 'bg-amber-50 hover:bg-amber-100' },
                      { text: 'Satışları Gör', icon: 'fa-receipt', color: 'text-cyan-500', bg: 'bg-cyan-50 hover:bg-cyan-100' },
                      { text: 'Dara Al (Terazi)', icon: 'fa-balance-scale', color: 'text-slate-500', bg: 'bg-slate-100 hover:bg-slate-200', colSpan: true },
                  ].map((btn, i) => (
                      <button key={i} className={`rounded-xl border border-transparent flex flex-col items-center justify-center gap-2 transition-all group ${btn.bg} ${btn.colSpan ? 'col-span-2' : ''}`}>
                          <i className={`fas ${btn.icon} text-2xl ${btn.color} group-hover:scale-110 transition-transform`}></i>
                          <span className="text-xs font-bold text-slate-700">{btn.text}</span>
                      </button>
                  ))}
              </div>

              {/* Kasayı Kapat */}
              <Link href="/portal" className="h-16 bg-red-50 border border-red-200 hover:bg-red-600 hover:text-white text-red-600 rounded-2xl flex items-center justify-center shadow-sm transition-all group shrink-0">
                  <i className="fas fa-sign-out-alt text-xl mr-3 group-hover:-translate-x-1 transition-transform"></i>
                  <span className="font-black text-sm uppercase tracking-widest">KASAYI KAPAT</span>
              </Link>
          </div>

        </div>

      {/* --- MANUEL ÜRÜN ARAMA MODALI --- */}
      {aramaModalAcik && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-slate-300 h-[85vh]">
            
            {/* Modal Header & Arama Çubuğu */}
            <div className="bg-slate-50 border-b border-slate-200 p-6 shrink-0 flex items-center gap-4">
                <div className="flex-1 relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
                    <input 
                        type="text" 
                        autoFocus
                        value={urunAramaTerimi}
                        onChange={(e) => setUrunAramaTerimi(e.target.value)}
                        placeholder="Ürün adı veya barkod ile arama yapın..."
                        className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 focus:border-blue-500 rounded-2xl outline-none font-bold text-lg text-slate-800 shadow-inner transition-colors"
                    />
                </div>
                <button onClick={() => setAramaModalAcik(false)} className="w-14 h-14 bg-white border border-slate-200 text-slate-500 hover:text-red-500 hover:bg-red-50 hover:border-red-200 rounded-2xl flex items-center justify-center text-2xl shadow-sm transition-all">
                    <i className="fas fa-times"></i>
                </button>
            </div>
            
            {/* Ürün Listesi */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-100/50">
                {filtrelenmisUrunler.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <i className="fas fa-box-open text-6xl mb-4 opacity-50"></i>
                        <h3 className="text-xl font-black tracking-widest uppercase mb-1">Ürün Bulunamadı</h3>
                        <p className="font-medium text-sm">Farklı bir kelime ile aramayı deneyin.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {filtrelenmisUrunler.map(u => (
                            <button 
                                key={u.id} 
                                onClick={() => sepeteEkle(u)}
                                className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col items-start text-left shadow-sm hover:shadow-md hover:border-blue-400 hover:bg-blue-50 transition-all group"
                            >
                                <span className="text-xs font-bold text-slate-400 mb-1 tracking-widest uppercase"><i className="fas fa-barcode mr-1"></i> {u.barkod || u.id}</span>
                                <h3 className="font-black text-slate-800 text-base leading-tight mb-3 group-hover:text-blue-700 transition-colors line-clamp-2">{u.urun_adi}</h3>
                                <div className="mt-auto w-full flex items-center justify-between">
                                    <span className="text-xl font-black text-blue-600">{Number(u.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${Number(u.stok_miktari) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        Stok: {u.stok_miktari} {u.birim}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

          </div>
        </div>
      )}
      </main>
    </>
  );
}