"use client";
import React, { useEffect, useState, useRef } from "react";
import { supabase, faturaNoUret } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
import { useBirimler } from "@/app/lib/useBirimler";
interface FaturaKalemi { urun_adi: string; miktar: number; birim: string; birim_fiyat: number; kdv_orani: number; }
interface StokUrun { id: number; urun_adi: string; birim: string; satis_fiyati: number; kdv_orani: number; }
interface FaturaFormState { fatura_no: string; tarih: string; cari_id: string; }
interface FaturaRecord {
  id: number;
  sirket_id: number;
  cari_id: number;
  fatura_no: string;
  tip: "GELEN" | "GIDEN";
  tarih: string;
  ara_toplam: number;
  kdv_toplam: number;
  genel_toplam: number;
  durum: string;
  cari_adi?: string;
}
interface FirmaRecord {
  id: number;
  sahip_sirket_id: number;
  unvan: string;
  bakiye?: number;
}

export default function FaturaMerkezi() {
  const { aktifSirket, kullaniciRol, isYonetici, isMuhasebe } = useAuth();
  const toast = useToast();
  const { onayla, OnayModal } = useOnayModal();
  const hasAccess = isYonetici || isMuhasebe; // Sadece Yönetici ve Muhasebe fatura kesebilir

  const [faturalar, setFaturalar] = useState<FaturaRecord[]>([]);
  const [firmalar, setFirmalar] = useState<FirmaRecord[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [seciliFaturaId, setSeciliFaturaId] = useState<number | null>(null);

  // MODAL STATELERİ
  const [modalAcik, setModalAcik] = useState(false);
  const [modalMod, setModalMod] = useState<"goruntule" | "duzenle">("duzenle");
  const [faturaTipi, setFaturaTipi] = useState<"GELEN" | "GIDEN">("GIDEN");
  const [faturaForm, setFaturaForm] = useState<FaturaFormState>({ fatura_no: "", tarih: new Date().toISOString().split('T')[0], cari_id: "" });
  const [faturaKalemleri, setFaturaKalemleri] = useState<FaturaKalemi[]>([]);
  const [yazdirModalAcik, setYazdirModalAcik] = useState(false);
  const { birimler: birimListesi } = useBirimler();

  // SATIR İÇİ STOK ARAMA (AUTOCOMPLETE)
  const [acikAutoIndex, setAcikAutoIndex] = useState<number>(-1);
  const [autoSonuclar, setAutoSonuclar] = useState<StokUrun[]>([]);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoWrapperRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const urunAdiInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data: fData } = await supabase.from("firmalar").select("*").eq("sahip_sirket_id", sirketId).order('unvan');
      setFirmalar(fData || []);

      const { data: faturaData } = await supabase.from("faturalar").select("*").eq("sirket_id", sirketId).order('id', { ascending: false });
      setFaturalar(faturaData || []);

      setYukleniyor(false);
  }

  useEffect(() => {
    if (!aktifSirket) return;

    if (kullaniciRol.includes("YONETICI") || kullaniciRol.includes("MUHASEBE")) {
        verileriGetir(aktifSirket.id);
    } else {
        setYukleniyor(false);
    }
  }, [aktifSirket, kullaniciRol]);

  // YENİ FATURA OLUŞTURMA BAŞLATICI
  const yeniFaturaBaslat = async (tip: "GELEN" | "GIDEN") => {
      setModalMod("duzenle");
      setFaturaTipi(tip);
      setSeciliFaturaId(null);
      const yeniNo = await faturaNoUret();
      setFaturaForm({ fatura_no: yeniNo, tarih: new Date().toISOString().split('T')[0], cari_id: "" });
      setFaturaKalemleri([{ urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0, kdv_orani: 20 }]);
      setModalAcik(true);
  };

  const faturaModalAc = async (mod: "goruntule" | "duzenle", faturaId?: number) => {
      const hedefId = faturaId || seciliFaturaId;
      if (!hedefId) { toast.error("Lütfen listeden bir fatura seçin!"); return; }
      const fatura = faturalar.find(f => f.id === hedefId);
      if (!fatura) return;

      setSeciliFaturaId(hedefId);
      setModalMod(mod);
      setFaturaTipi(fatura.tip);
      setFaturaForm({ fatura_no: fatura.fatura_no, tarih: fatura.tarih, cari_id: fatura.cari_id?.toString() || "" });

      const { data: kalemData } = await supabase.from("fatura_detaylari").select("*").eq("fatura_id", fatura.id);
      setFaturaKalemleri(kalemData || []);
      setModalAcik(true);
  };

  const faturaSilTekli = (faturaId: number) => {
      onayla({
          baslik: "Fatura Sil",
          mesaj: "Bu faturayı silmek istediğinize emin misiniz?",
          altMesaj: "Cari bakiye işlemi manuel düzeltilmelidir.",
          onayMetni: "Evet, Sil",
          tehlikeli: true,
          onOnayla: async () => {
              await supabase.from("fatura_detaylari").delete().eq("fatura_id", faturaId);
              const { error } = await supabase.from("faturalar").delete().eq("id", faturaId);
              if (error) { toast.error("Silme hatası: " + error.message); return; }
              toast.success("Fatura silindi.");
              setSeciliFaturaId(null);
              if (aktifSirket) verileriGetir(aktifSirket.id);
          }
      });
  };

  const sil = async () => {
      if (!seciliFaturaId) { toast.error("Lütfen listeden bir fatura seçin!"); return; }
      onayla({
          baslik: "Fatura Sil",
          mesaj: "Bu faturayı iptal edip silmek istediğinize emin misiniz?",
          altMesaj: "Cari bakiye işlemi manuel düzeltilmelidir.",
          onayMetni: "Evet, Sil",
          tehlikeli: true,
          onOnayla: async () => {
              try {
                  await supabase.from("fatura_detaylari").delete().eq("fatura_id", seciliFaturaId);
                  const { error } = await supabase.from("faturalar").delete().eq("id", seciliFaturaId);
                  if (error) throw error;
                  toast.success("Fatura başarıyla silindi.");
                  setSeciliFaturaId(null);
                  if (aktifSirket) verileriGetir(aktifSirket.id);
              } catch (error: unknown) {
                  const message = error instanceof Error ? error.message : String(error);
                  toast.error("Silme hatası: " + message);
              }
          }
      });
  };

  const satirEkle = () => setFaturaKalemleri([...faturaKalemleri, { urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0, kdv_orani: 20 }]);
  const satirGuncelle = (index: number, alan: keyof FaturaKalemi, deger: string | number) => {
      const yeni = [...faturaKalemleri];
      yeni[index] = { ...yeni[index], [alan]: deger };
      setFaturaKalemleri(yeni);
  };
  const satirSil = (index: number) => setFaturaKalemleri(faturaKalemleri.filter((_, i) => i !== index));

  // SATIR İÇİ AUTOCOMPLETE
  const urunAdiDegisti = (index: number, value: string) => {
      satirGuncelle(index, "urun_adi", value);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (!aktifSirket || value.trim().length < 1) { setAutoSonuclar([]); setAcikAutoIndex(-1); return; }
      setAcikAutoIndex(index);
      autoTimerRef.current = setTimeout(async () => {
          const { data } = await supabase.from("urunler")
              .select("id, urun_adi, birim, satis_fiyati, kdv_orani")
              .eq("sahip_sirket_id", aktifSirket.id)
              .neq("aktif", false)
              .ilike("urun_adi", `%${value.trim()}%`)
              .limit(10)
              .order("urun_adi");
          setAutoSonuclar(data || []);
      }, 300);
  };

  const autoUrunSec = (index: number, urun: StokUrun) => {
      const yeni = [...faturaKalemleri];
      yeni[index] = { ...yeni[index], urun_adi: urun.urun_adi, birim: urun.birim, birim_fiyat: urun.satis_fiyati, kdv_orani: urun.kdv_orani };
      setFaturaKalemleri(yeni);
      setAcikAutoIndex(-1);
      setAutoSonuclar([]);
  };

  // Dışarı tıklayınca dropdown kapat
  useEffect(() => {
      if (acikAutoIndex === -1) return;
      const handleClick = (e: MouseEvent) => {
          const wrapper = autoWrapperRefs.current.get(acikAutoIndex);
          if (wrapper && !wrapper.contains(e.target as Node)) { setAcikAutoIndex(-1); setAutoSonuclar([]); }
      };
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
  }, [acikAutoIndex]);

  // HESAPLAMALAR (KDV DAHİL)
  const araToplamHesapla = () => faturaKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);
  const kdvToplamHesapla = () => faturaKalemleri.reduce((acc, k) => acc + ((k.miktar * k.birim_fiyat) * (k.kdv_orani / 100)), 0);
  const genelToplamHesapla = () => araToplamHesapla() + kdvToplamHesapla();

  const faturaYazdir = () => {
      setYazdirModalAcik(true);
      setTimeout(() => { window.print(); }, 300);
  };

  const kaydet = async () => {
      if (!faturaForm.cari_id) { toast.error("Lütfen Cari (Müşteri/Tedarikçi) seçin!"); return; }
      if (faturaKalemleri.length === 0 || !faturaKalemleri[0].urun_adi) { toast.error("Faturaya en az bir kalem eklemelisiniz!"); return; }

      const gToplam = genelToplamHesapla();
      let islemYapilacakId = seciliFaturaId;

      if (!seciliFaturaId) {
          // YENİ FATURA KAYDI
          const seciliFirma = firmalar.find(f => f.id === Number(faturaForm.cari_id));
          const { data, error } = await supabase.from("faturalar").insert([{
              sirket_id: aktifSirket?.id,
              cari_id: Number(faturaForm.cari_id),
              cari_adi: seciliFirma?.unvan || null,
              fatura_no: faturaForm.fatura_no,
              tip: faturaTipi,
              tarih: faturaForm.tarih,
              ara_toplam: araToplamHesapla(),
              kdv_toplam: kdvToplamHesapla(),
              genel_toplam: gToplam,
              durum: 'BEKLIYOR'
          }]).select().single();
          if (error) { toast.error("Fatura kaydedilemedi: " + error.message); return; }
          islemYapilacakId = data.id;

          // CARİ BAKİYEYE OTOMATİK İŞLEME
          const islemAciklama = faturaTipi === "GIDEN" ? `Satış Faturası (${faturaForm.fatura_no})` : `Alış Faturası (${faturaForm.fatura_no})`;
          const borc = faturaTipi === "GIDEN" ? gToplam : 0;
          const alacak = faturaTipi === "GELEN" ? gToplam : 0;

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
          // GÜNCELLEME İŞLEMİ
          await supabase.from("faturalar").update({
              fatura_no: faturaForm.fatura_no, tarih: faturaForm.tarih, cari_id: Number(faturaForm.cari_id),
              ara_toplam: araToplamHesapla(), kdv_toplam: kdvToplamHesapla(), genel_toplam: gToplam
          }).eq("id", seciliFaturaId);
      }

      // KALEMLERİ YENİDEN YAZ
      let kalemHatasi = false;
      if (islemYapilacakId) {
          await supabase.from("fatura_detaylari").delete().eq("fatura_id", islemYapilacakId);
          const eklenecekler = faturaKalemleri.filter(k => k.urun_adi).map(k => {
              const araTutar = k.miktar * k.birim_fiyat;
              const kdvTutari = araTutar * (k.kdv_orani / 100);
              return {
                  fatura_id: islemYapilacakId,
                  urun_adi: k.urun_adi,
                  miktar: k.miktar,
                  birim: k.birim,
                  birim_fiyat: k.birim_fiyat,
                  kdv_orani: k.kdv_orani,
                  kdv_tutari: kdvTutari,
                  satir_toplami: araTutar + kdvTutari,
              };
          });
          if (eklenecekler.length > 0) {
              const { error: kalemError } = await supabase.from("fatura_detaylari").insert(eklenecekler);
              if (kalemError) {
                  console.error("[fatura_detaylari insert hata]", kalemError);
                  kalemHatasi = true;
              }
          }
      }

      if (kalemHatasi) {
          toast.info("Fatura kaydedildi fakat bazı kalemler kaydedilemedi");
      } else {
          toast.success("Fatura başarıyla kaydedildi!");
      }
      setModalAcik(false);
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  const filtrelenmisFaturalar = faturalar.filter(f => {
      const q = aramaTerimi.toLowerCase();
      const cariAdi = f.cari_adi || firmalar.find(fr => fr.id === f.cari_id)?.unvan || "";
      return f.fatura_no.toLowerCase().includes(q) || cariAdi.toLowerCase().includes(q);
  });

  if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "#f8fafc" }}>Sistem Doğrulanıyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500" style={{ background: "#f8fafc" }}>
                <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Resmi Fatura ekranına sadece &quot;YÖNETİCİ&quot; veya &quot;MUHASEBE&quot; yetkisine sahip kullanıcılar erişebilir.</p>
            </div>
        ) : (
            <>
                <div className="flex items-center justify-between px-4 py-2 shrink-0 flex-wrap gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => yeniFaturaBaslat('GIDEN')} className="btn-primary flex items-center gap-2"><i className="fas fa-file-export text-[10px]" /> SATIŞ FATURASI</button>
                        <button onClick={() => yeniFaturaBaslat('GELEN')} className="btn-primary flex items-center gap-2" style={{ background: "#ea580c" }}><i className="fas fa-file-import text-[10px]" /> ALIŞ FATURASI</button>
                    </div>
                    <div className="relative">
                        <input type="text" placeholder="Fatura No veya Cari..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-64" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                    </div>
                </div>

                <div className="flex-1 overflow-auto relative print:hidden" style={{ background: "var(--c-bg)" }}>
                    {/* MASAÜSTÜ TABLO */}
                    <table className="tbl-kurumsal hidden md:table">
                        <thead>
                            <tr>
                                <th className="w-32 text-center">Tarih</th>
                                <th className="w-32">Fatura No</th>
                                <th className="w-24 text-center">Yön</th>
                                <th>Cari Ünvanı (Alıcı/Satıcı)</th>
                                <th className="w-32 text-right">Genel Toplam (TL)</th>
                                <th className="w-28 text-center">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yukleniyor ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                            ) : filtrelenmisFaturalar.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Fatura Bulunamadı</td></tr>
                            ) : (
                            filtrelenmisFaturalar.map((f) => {
                                const isGiden = f.tip === "GIDEN";
                                return (
                                    <tr key={f.id} onDoubleClick={() => faturaModalAc("goruntule", f.id)} className="bg-white hover:bg-slate-50">
                                        <td className="text-center">{new Date(f.tarih).toLocaleDateString('tr-TR')}</td>
                                        <td className="font-bold">{f.fatura_no}</td>
                                        <td className={`text-center font-semibold ${isGiden ? 'text-[#1d4ed8]' : 'text-orange-500'}`}>{isGiden ? 'SATIŞ' : 'ALIŞ'}</td>
                                        <td>{f.cari_adi || firmalar.find(fr => fr.id === f.cari_id)?.unvan || '-'}</td>
                                        <td className="text-right font-semibold">{Number(f.genel_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={(e) => { e.stopPropagation(); faturaModalAc("goruntule", f.id); }} className="w-7 h-7 bg-blue-50 text-[#1d4ed8] border border-blue-200 hover:bg-blue-100 flex items-center justify-center transition-colors" title="İncele"><i className="fas fa-eye text-[9px]"></i></button>
                                                <button onClick={(e) => { e.stopPropagation(); faturaModalAc("duzenle", f.id); }} className="w-7 h-7 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 flex items-center justify-center transition-colors" title="Düzenle"><i className="fas fa-edit text-[9px]"></i></button>
                                                <button onClick={(e) => { e.stopPropagation(); faturaSilTekli(f.id); }} className="w-7 h-7 bg-red-50 text-[#dc2626] border border-red-200 hover:bg-red-100 flex items-center justify-center transition-colors" title="Sil"><i className="fas fa-trash text-[9px]"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                            )}
                        </tbody>
                    </table>

                    {/* MOBİL KART GÖRÜNÜMÜ */}
                    <div className="md:hidden p-3 space-y-2">
                        {yukleniyor ? (
                            <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</div>
                        ) : filtrelenmisFaturalar.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Fatura Bulunamadı</div>
                        ) : (
                        filtrelenmisFaturalar.map((f) => {
                            const isGiden = f.tip === "GIDEN";
                            return (
                                <div key={f.id} onClick={() => faturaModalAc("goruntule", f.id)} className="bg-white p-3 flex items-center justify-between gap-3" style={{ border: "1px solid var(--c-border)" }}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-sm text-slate-800 truncate">{f.fatura_no}</span>
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isGiden ? 'bg-blue-50 text-[#1d4ed8]' : 'bg-orange-50 text-orange-600'}`}>{isGiden ? 'SATIŞ' : 'ALIŞ'}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 truncate">{f.cari_adi || firmalar.find(fr => fr.id === f.cari_id)?.unvan || '-'}</p>
                                        <p className="text-sm font-semibold text-slate-800 mt-1">{Number(f.genel_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); faturaModalAc("goruntule", f.id); }} className="w-8 h-8 bg-blue-50 text-[#1d4ed8] border border-blue-200 hover:bg-blue-100 flex items-center justify-center transition-colors" title="İncele"><i className="fas fa-eye text-xs"></i></button>
                                        <button onClick={(e) => { e.stopPropagation(); faturaModalAc("duzenle", f.id); }} className="w-8 h-8 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 flex items-center justify-center transition-colors" title="Düzenle"><i className="fas fa-edit text-xs"></i></button>
                                        <button onClick={(e) => { e.stopPropagation(); faturaSilTekli(f.id); }} className="w-8 h-8 bg-red-50 text-[#dc2626] border border-red-200 hover:bg-red-100 flex items-center justify-center transition-colors" title="Sil"><i className="fas fa-trash text-xs"></i></button>
                                    </div>
                                </div>
                            );
                        })
                        )}
                    </div>
                </div>
            </>
        )}
      </main>

      {/* --- FATURA GİRİŞ MODALI --- */}
      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:static print:bg-white p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[95vh] md:max-w-5xl flex flex-col overflow-hidden print:border-none print:w-full" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className={`text-sm font-semibold flex items-center ${faturaTipi === 'GIDEN' ? 'text-[#1d4ed8]' : 'text-orange-800'}`}>
                  <i className={`fas ${faturaTipi === 'GIDEN' ? 'fa-file-export' : 'fa-file-import'} mr-2`}></i>
                  {modalMod === "goruntule" ? "Fatura Detayı" : (seciliFaturaId ? "Fatura Düzenle" : (faturaTipi === 'GIDEN' ? 'Satış Faturası (Giden)' : 'Alış Faturası (Gelen)'))}
              </h3>
              <div className="flex items-center space-x-2">
                 {modalMod === "goruntule" && (
                     <button onClick={() => setModalMod("duzenle")} className="btn-secondary text-xs font-bold"><i className="fas fa-edit mr-1"></i> Düzenle</button>
                 )}
                 <button onClick={faturaYazdir} className="btn-secondary text-xs font-bold"><i className="fas fa-print mr-1"></i> Yazdır</button>
                 <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
              </div>
            </div>

            <div className="p-4 bg-white shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <div className="flex flex-col sm:flex-row gap-4 min-w-[500px]">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center"><label className="w-24 text-xs font-bold text-slate-700">Fatura No</label><input type="text" value={faturaForm.fatura_no} onChange={(e) => setFaturaForm({...faturaForm, fatura_no: e.target.value})} disabled={modalMod === "goruntule"} className={`input-kurumsal flex-1 ${modalMod === "goruntule" ? "bg-[#f8fafc] cursor-default" : ""}`} /></div>
                        <div className="flex items-center"><label className="w-24 text-xs font-bold text-slate-700">Tarih</label><input type="date" value={faturaForm.tarih} onChange={(e) => setFaturaForm({...faturaForm, tarih: e.target.value})} disabled={modalMod === "goruntule"} className={`input-kurumsal flex-1 ${modalMod === "goruntule" ? "bg-[#f8fafc] cursor-default" : ""}`} /></div>
                        <div className="flex items-center">
                            <label className="w-24 text-xs font-bold text-slate-700">Cari Hesap</label>
                            {modalMod === "goruntule" ? (
                                <input type="text" disabled value={firmalar.find(f => f.id === Number(faturaForm.cari_id))?.unvan || "-"} className="input-kurumsal flex-1 bg-[#f8fafc] cursor-default" />
                            ) : (
                                <select value={faturaForm.cari_id} onChange={(e) => setFaturaForm({...faturaForm, cari_id: e.target.value})} className="input-kurumsal flex-1">
                                    <option value="">--- Fatura Kesilecek Cariyi Seçiniz ---</option>
                                    {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                                </select>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-2 print:p-0 print:bg-white" style={{ background: "#f8fafc" }}>
                <table className="tbl-kurumsal">
                    <thead>
                        <tr>
                            <th className="w-8 text-center print:hidden">#</th>
                            <th>Stok / Hizmet Adı</th>
                            <th className="w-24 text-center">Miktar</th>
                            <th className="w-20 text-center">Birim</th>
                            <th className="w-32 text-right">Birim Fiyat</th>
                            <th className="w-16 text-center hidden md:table-cell">KDV %</th>
                            <th className="w-32 text-right">KDV&apos;li Tutar</th>
                            {modalMod === "duzenle" && <th className="w-8 text-center print:hidden"><i className="fas fa-trash"></i></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {faturaKalemleri.map((item, index) => {
                            const tutarKDVsiz = item.miktar * item.birim_fiyat;
                            const tutarKDVli = tutarKDVsiz * (1 + (item.kdv_orani / 100));
                            return (
                                <tr key={index} className="hover:bg-[#f8fafc] focus-within:bg-[#f8fafc] transition-colors">
                                    <td className="text-center text-[10px] text-slate-400 font-bold print:hidden">{index + 1}</td>
                                    <td className={`${modalMod === "goruntule" ? "px-2 py-1.5 text-[11px] font-semibold text-slate-800" : "p-0 relative"}`}>
                                        {modalMod === "goruntule" ? item.urun_adi : (
                                            <div ref={(el) => { if (el) autoWrapperRefs.current.set(index, el); else autoWrapperRefs.current.delete(index); }} className="relative">
                                                <input
                                                    ref={(el) => { if (el) urunAdiInputRefs.current.set(index, el); else urunAdiInputRefs.current.delete(index); }}
                                                    value={item.urun_adi}
                                                    onChange={(e) => urunAdiDegisti(index, e.target.value)}
                                                    onFocus={() => { if (item.urun_adi.trim().length >= 1) urunAdiDegisti(index, item.urun_adi); }}
                                                    placeholder="Ürün veya hizmet adı yazın..."
                                                    className="w-full px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none bg-transparent focus:bg-white"
                                                />
                                                {acikAutoIndex === index && autoSonuclar.length > 0 && (
                                                    <div className="absolute left-0 right-0 top-full bg-white shadow-lg border overflow-auto" style={{ zIndex: 90, maxHeight: "200px", borderColor: "var(--c-border)" }}>
                                                        {autoSonuclar.map(urun => (
                                                            <button key={urun.id} onClick={() => autoUrunSec(index, urun)} className="w-full text-left px-2.5 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                                                <span className="text-[11px] font-bold text-slate-800 truncate">{urun.urun_adi}</span>
                                                                <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">{Number(urun.satis_fiyati).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL / {urun.birim}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className={`${modalMod === "goruntule" ? "px-2 py-1.5 text-[11px] font-bold text-center" : "p-0"}`}>{modalMod === "goruntule" ? item.miktar : <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={item.miktar} onFocus={(e) => e.target.select()} onChange={(e) => { const val = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(val) || val === '') satirGuncelle(index, "miktar", val === '' ? 0 : Number(val)); }} className="w-full px-2 py-1.5 text-[11px] font-bold text-center outline-none bg-transparent focus:bg-white" />}</td>
                                    <td className={`${modalMod === "goruntule" ? "px-2 py-1.5 text-[11px] font-bold text-center uppercase" : "p-0"}`}>{modalMod === "goruntule" ? item.birim : <select value={item.birim} onChange={(e) => satirGuncelle(index, "birim", e.target.value)} className="w-full px-1 py-1.5 text-[11px] font-bold text-center outline-none bg-transparent focus:bg-white cursor-pointer">{birimListesi.map(b => <option key={b.id} value={b.kisaltma}>{b.kisaltma}</option>)}{item.birim && !birimListesi.some(b => b.kisaltma === item.birim) && <option value={item.birim}>{item.birim}</option>}</select>}</td>
                                    <td className={`${modalMod === "goruntule" ? "px-2 py-1.5 text-[11px] font-bold text-right text-[#1d4ed8]" : "p-0"}`}>{modalMod === "goruntule" ? Number(item.birim_fiyat).toLocaleString('tr-TR', {minimumFractionDigits:2}) : <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={item.birim_fiyat} onFocus={(e) => e.target.select()} onChange={(e) => { const val = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(val) || val === '') satirGuncelle(index, "birim_fiyat", val === '' ? 0 : Number(val)); }} className="w-full px-2 py-1.5 text-[11px] font-bold text-right text-[#1d4ed8] outline-none bg-transparent focus:bg-white" />}</td>
                                    <td className={`hidden md:table-cell ${modalMod === "goruntule" ? "px-2 py-1.5 text-xs font-bold text-center text-orange-600" : "p-1"}`}>{modalMod === "goruntule" ? `%${item.kdv_orani}` : <select value={String(item.kdv_orani)} onChange={(e) => satirGuncelle(index, "kdv_orani", Number(e.target.value))} onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const yeniIndex = faturaKalemleri.length; setFaturaKalemleri(prev => [...prev, { urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0, kdv_orani: 20 }]); setTimeout(() => urunAdiInputRefs.current.get(yeniIndex)?.focus(), 50); } }} className="border rounded px-1 py-1 text-xs w-16 bg-white text-gray-800"><option value="0">%0</option><option value="1">%1</option><option value="10">%10</option><option value="20">%20</option></select>}</td>
                                    <td className="text-right text-[11px] font-semibold text-slate-900">{tutarKDVli.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                    {modalMod === "duzenle" && <td className="text-center print:hidden"><button onClick={() => satirSil(index)} className="text-slate-400 hover:text-red-600 outline-none"><i className="fas fa-times"></i></button></td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {modalMod === "duzenle" && <button onClick={satirEkle} className="mt-3 ml-2 text-[11px] font-bold text-[#1d4ed8] hover:underline print:hidden flex items-center"><i className="fas fa-plus-circle mr-1"></i> Yeni Fatura Satırı Ekle</button>}
            </div>

            <div className="p-4 flex flex-col sm:flex-row justify-between sm:items-end gap-4 shrink-0 print:bg-white print:border-black print:border-t-2" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                {modalMod === "duzenle" && (
                    <div className="print:hidden w-full sm:w-auto">
                        <button onClick={kaydet} className={`btn-primary w-full sm:w-auto px-6 py-3 sm:py-2 font-semibold text-xs uppercase tracking-widest flex items-center justify-center`} style={faturaTipi === 'GELEN' ? { background: "#ea580c" } : undefined}>
                            <i className="fas fa-save mr-2"></i> Faturayı Kaydet
                        </button>
                    </div>
                )}

                <div className="bg-white p-3 w-full sm:w-72 self-end" style={{ border: "1px solid var(--c-border)" }}>
                    <div className="flex justify-between items-center pb-1 mb-1" style={{ borderBottom: "1px solid var(--c-border)" }}>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Ara Toplam</span>
                        <span className="text-xs font-bold text-slate-700">{araToplamHesapla().toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 mb-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">KDV Toplam</span>
                        <span className="text-xs font-bold text-orange-600">{kdvToplamHesapla().toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-800 uppercase">Genel Toplam</span>
                        <span className="text-xl font-semibold text-[#1d4ed8]">{genelToplamHesapla().toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
      <OnayModal />

      {/* --- FATURA YAZDIR GÖRÜNÜMÜ --- */}
      {yazdirModalAcik && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #fatura-print, #fatura-print * { visibility: visible !important; }
              #fatura-print { position: absolute; left: 0; top: 0; width: 100%; }
            }
          `}</style>
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center overflow-auto print:hidden" onClick={() => setYazdirModalAcik(false)}>
            <div className="my-8 bg-white shadow-2xl max-w-[210mm] w-full" onClick={e => e.stopPropagation()}>
              <div className="p-4 flex justify-between items-center border-b" style={{ background: "#f8fafc" }}>
                <span className="text-sm font-bold text-slate-700">Fatura Önizleme</span>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="btn-primary text-xs"><i className="fas fa-print mr-1"></i> Yazdır</button>
                  <button onClick={() => setYazdirModalAcik(false)} className="btn-secondary text-xs text-red-600"><i className="fas fa-times mr-1"></i> Kapat</button>
                </div>
              </div>
            </div>
          </div>

          <div id="fatura-print" style={{ fontFamily: "Arial, sans-serif", color: "#1a1a1a", background: "#fff", padding: "40px", maxWidth: "210mm", margin: "0 auto" }} className="hidden print:block">
            {/* HEADER */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "16px", borderBottom: "3px solid #1e3a5f" }}>
              <div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#1e3a5f", lineHeight: 1.2 }}>{aktifSirket?.isletme_adi || aktifSirket?.unvan || "Firma Adı"}</div>
                {aktifSirket?.unvan && aktifSirket.unvan !== aktifSirket.isletme_adi && (
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{aktifSirket.unvan}</div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "28px", fontWeight: 700, color: "#1e3a5f", letterSpacing: "2px" }}>FATURA</div>
                <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>
                  <span style={{ fontWeight: 600 }}>No:</span> {faturaForm.fatura_no}
                </div>
                <div style={{ fontSize: "12px", color: "#475569" }}>
                  <span style={{ fontWeight: 600 }}>Tarih:</span> {new Date(faturaForm.tarih).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                  {faturaTipi === "GIDEN" ? "Satış Faturası" : "Alış Faturası"}
                </div>
              </div>
            </div>

            {/* SATICI & ALICI BİLGİLERİ */}
            <div style={{ display: "flex", gap: "32px", marginTop: "20px", marginBottom: "24px" }}>
              <div style={{ flex: 1, background: "#f8fafc", padding: "14px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px" }}>Satıcı</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>{aktifSirket?.isletme_adi || "-"}</div>
                {aktifSirket?.adres && <div style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>{aktifSirket.adres}</div>}
                {(aktifSirket?.il || aktifSirket?.ilce) && <div style={{ fontSize: "11px", color: "#475569" }}>{[aktifSirket.ilce, aktifSirket.il].filter(Boolean).join(" / ")}</div>}
                {aktifSirket?.vergi_dairesi && <div style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>V.D.: {aktifSirket.vergi_dairesi}</div>}
                {aktifSirket?.vergi_no && <div style={{ fontSize: "11px", color: "#475569" }}>V.K.N.: {aktifSirket.vergi_no}</div>}
                {aktifSirket?.telefon && <div style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>Tel: {aktifSirket.telefon}</div>}
              </div>
              <div style={{ flex: 1, background: "#f8fafc", padding: "14px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", borderBottom: "1px solid #cbd5e1", paddingBottom: "4px" }}>Alıcı</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                  {(() => { const f = faturalar.find(f => f.id === seciliFaturaId); return f?.cari_adi || firmalar.find(fr => fr.id === Number(faturaForm.cari_id))?.unvan || "-"; })()}
                </div>
              </div>
            </div>

            {/* KALEM TABLOSU */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#1e3a5f", color: "#fff" }}>
                  <th style={{ padding: "8px 6px", textAlign: "center", width: "30px", fontWeight: 600 }}>#</th>
                  <th style={{ padding: "8px 6px", textAlign: "left", fontWeight: 600 }}>Ürün / Hizmet</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", width: "60px", fontWeight: 600 }}>Miktar</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", width: "55px", fontWeight: 600 }}>Birim</th>
                  <th style={{ padding: "8px 6px", textAlign: "right", width: "90px", fontWeight: 600 }}>Birim Fiyat</th>
                  <th style={{ padding: "8px 6px", textAlign: "center", width: "50px", fontWeight: 600 }}>KDV%</th>
                  <th style={{ padding: "8px 6px", textAlign: "right", width: "100px", fontWeight: 600 }}>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {faturaKalemleri.map((k, i) => {
                  const araTutar = k.miktar * k.birim_fiyat;
                  const kdvTutari = araTutar * (k.kdv_orani / 100);
                  const toplamTutar = araTutar + kdvTutari;
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "7px 6px", textAlign: "center", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: "7px 6px", fontWeight: 500 }}>{k.urun_adi}</td>
                      <td style={{ padding: "7px 6px", textAlign: "center", fontWeight: 600 }}>{k.miktar}</td>
                      <td style={{ padding: "7px 6px", textAlign: "center", textTransform: "uppercase" }}>{k.birim}</td>
                      <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 600 }}>{Number(k.birim_fiyat).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "7px 6px", textAlign: "center" }}>%{k.kdv_orani}</td>
                      <td style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700 }}>{toplamTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* TOPLAMLAR */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <div style={{ width: "260px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e2e8f0", fontSize: "12px" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Ara Toplam</span>
                  <span style={{ fontWeight: 600 }}>{araToplamHesapla().toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e2e8f0", fontSize: "12px" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>KDV Toplam</span>
                  <span style={{ fontWeight: 600, color: "#ea580c" }}>{kdvToplamHesapla().toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: "16px", background: "#1e3a5f", color: "#fff", marginTop: "4px", paddingLeft: "10px", paddingRight: "10px" }}>
                  <span style={{ fontWeight: 700 }}>GENEL TOPLAM</span>
                  <span style={{ fontWeight: 700 }}>{genelToplamHesapla().toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</span>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", gap: "32px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Notlar</div>
                <div style={{ border: "1px solid #e2e8f0", padding: "10px", minHeight: "50px", fontSize: "11px", color: "#64748b" }}>
                  &nbsp;
                </div>
              </div>
              <div style={{ width: "200px", textAlign: "center" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Kaşe / İmza</div>
                <div style={{ borderBottom: "1px solid #1e3a5f", marginTop: "60px" }}></div>
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: "32px", paddingTop: "12px", borderTop: "1px solid #e2e8f0", fontSize: "9px", color: "#94a3b8", letterSpacing: "0.5px" }}>
              Bu fatura elektronik ortamda oluşturulmuştur.
            </div>
          </div>
        </>
      )}
    </>
  );
}
