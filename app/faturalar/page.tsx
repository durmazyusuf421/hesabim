"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
interface FaturaKalemi { urun_adi: string; miktar: number; birim: string; birim_fiyat: number; kdv_orani: number; }
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
  firmalar?: { unvan: string };
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
  const [faturaTipi, setFaturaTipi] = useState<"GELEN" | "GIDEN">("GIDEN");
  const [faturaForm, setFaturaForm] = useState<FaturaFormState>({ fatura_no: "", tarih: new Date().toISOString().split('T')[0], cari_id: "" });
  const [faturaKalemleri, setFaturaKalemleri] = useState<FaturaKalemi[]>([]);

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data: fData } = await supabase.from("firmalar").select("*").eq("sahip_sirket_id", sirketId).order('unvan');
      setFirmalar(fData || []);

      const { data: faturaData } = await supabase.from("faturalar").select("*, firmalar(unvan)").eq("sirket_id", sirketId).order('tarih', { ascending: false }).order('id', { ascending: false });
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
  const yeniFaturaBaslat = (tip: "GELEN" | "GIDEN") => {
      setFaturaTipi(tip);
      setSeciliFaturaId(null);
      setFaturaForm({ fatura_no: `FTR-${Math.floor(10000 + Math.random() * 90000)}`, tarih: new Date().toISOString().split('T')[0], cari_id: "" });
      setFaturaKalemleri([{ urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0, kdv_orani: 20 }]);
      setModalAcik(true);
  };

  const incele = async () => {
      if (!seciliFaturaId) { toast.error("Lütfen listeden bir fatura seçin!"); return; }
      const fatura = faturalar.find(f => f.id === seciliFaturaId);
      if (!fatura) return;

      setFaturaTipi(fatura.tip);
      setFaturaForm({ fatura_no: fatura.fatura_no, tarih: fatura.tarih, cari_id: fatura.cari_id?.toString() || "" });

      const { data } = await supabase.from("fatura_kalemleri").select("*").eq("fatura_id", fatura.id);
      setFaturaKalemleri(data || []);
      setModalAcik(true);
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
                  await supabase.from("fatura_kalemleri").delete().eq("fatura_id", seciliFaturaId);
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

  // HESAPLAMALAR (KDV DAHİL)
  const araToplamHesapla = () => faturaKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);
  const kdvToplamHesapla = () => faturaKalemleri.reduce((acc, k) => acc + ((k.miktar * k.birim_fiyat) * (k.kdv_orani / 100)), 0);
  const genelToplamHesapla = () => araToplamHesapla() + kdvToplamHesapla();

  const kaydet = async () => {
      if (!faturaForm.cari_id) { toast.error("Lütfen Cari (Müşteri/Tedarikçi) seçin!"); return; }
      if (faturaKalemleri.length === 0 || !faturaKalemleri[0].urun_adi) { toast.error("Faturaya en az bir kalem eklemelisiniz!"); return; }

      const gToplam = genelToplamHesapla();
      let islemYapilacakId = seciliFaturaId;

      if (!seciliFaturaId) {
          // YENİ FATURA KAYDI
          const { data, error } = await supabase.from("faturalar").insert([{
              sirket_id: aktifSirket?.id,
              cari_id: Number(faturaForm.cari_id),
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
      if (islemYapilacakId) {
          await supabase.from("fatura_kalemleri").delete().eq("fatura_id", islemYapilacakId);
          const eklenecekler = faturaKalemleri.filter(k => k.urun_adi).map(k => ({
              fatura_id: islemYapilacakId,
              urun_adi: k.urun_adi, miktar: k.miktar, birim: k.birim, birim_fiyat: k.birim_fiyat,
              kdv_orani: k.kdv_orani, toplam_tutar: (k.miktar * k.birim_fiyat) * (1 + (k.kdv_orani / 100))
          }));
          if (eklenecekler.length > 0) await supabase.from("fatura_kalemleri").insert(eklenecekler);
      }

      toast.success("Fatura başarıyla kaydedildi!");
      setModalAcik(false);
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  const filtrelenmisFaturalar = faturalar.filter(f => f.fatura_no.toLowerCase().includes(aramaTerimi.toLowerCase()) || (f.firmalar?.unvan || "").toLowerCase().includes(aramaTerimi.toLowerCase()));

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
                        <button onClick={incele} className="btn-secondary flex items-center gap-2"><i className="fas fa-search text-[10px]" /> İNCELE</button>
                        <button onClick={sil} className="btn-secondary flex items-center gap-2"><i className="fas fa-trash-alt text-[#dc2626] text-[10px]" /> SİL</button>
                    </div>
                    <div className="relative">
                        <input type="text" placeholder="Fatura No veya Cari..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-64" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                    </div>
                </div>

                <div className="flex-1 overflow-auto relative print:hidden" style={{ background: "var(--c-bg)" }}>
                    <table className="tbl-kurumsal">
                        <thead>
                            <tr>
                                <th className="w-8 text-center"><i className="fas fa-caret-down"></i></th>
                                <th className="w-32 text-center">Tarih</th>
                                <th className="w-32">Fatura No</th>
                                <th className="w-24 text-center">Yön</th>
                                <th>Cari Ünvanı (Alıcı/Satıcı)</th>
                                <th className="w-32 text-right">Ara Toplam</th>
                                <th className="w-32 text-right">KDV Toplam</th>
                                <th className="w-32 text-right">Genel Toplam (TL)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yukleniyor ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                            ) : filtrelenmisFaturalar.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Fatura Bulunamadı</td></tr>
                            ) : (
                            filtrelenmisFaturalar.map((f) => {
                                const isSelected = seciliFaturaId === f.id;
                                const isGiden = f.tip === "GIDEN";
                                return (
                                    <tr key={f.id} onClick={() => setSeciliFaturaId(f.id)} onDoubleClick={incele} className={`cursor-pointer select-none ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500 text-slate-800' : 'bg-white hover:bg-slate-50'}`}>
                                        <td className="text-center">{isSelected && <i className="fas fa-caret-right text-blue-500"></i>}</td>
                                        <td className="text-center">{new Date(f.tarih).toLocaleDateString('tr-TR')}</td>
                                        <td className="font-bold">{f.fatura_no}</td>
                                        <td className={`text-center font-semibold ${isGiden ? 'text-[#1d4ed8]' : 'text-orange-500'}`}>{isGiden ? 'SATIŞ' : 'ALIŞ'}</td>
                                        <td>{f.firmalar?.unvan || '-'}</td>
                                        <td className="text-right">{Number(f.ara_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="text-right">{Number(f.kdv_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="text-right font-semibold">{Number(f.genel_toplam || 0).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
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

      {/* --- FATURA GİRİŞ MODALI --- */}
      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:static print:bg-white p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[95vh] md:max-w-5xl flex flex-col overflow-hidden print:border-none print:w-full" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className={`text-sm font-semibold flex items-center ${faturaTipi === 'GIDEN' ? 'text-[#1d4ed8]' : 'text-orange-800'}`}>
                  <i className={`fas ${faturaTipi === 'GIDEN' ? 'fa-file-export' : 'fa-file-import'} mr-2`}></i>
                  {faturaTipi === 'GIDEN' ? 'Satış Faturası (Giden)' : 'Alış Faturası (Gelen)'}
              </h3>
              <div className="flex space-x-2">
                 <button onClick={() => window.print()} className="btn-secondary text-xs font-bold"><i className="fas fa-print mr-1"></i> Yazdır</button>
                 <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
              </div>
            </div>

            <div className="p-4 bg-white shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <div className="flex flex-col sm:flex-row gap-4 min-w-[500px]">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center"><label className="w-24 text-xs font-bold text-slate-700">Fatura No</label><input type="text" value={faturaForm.fatura_no} onChange={(e) => setFaturaForm({...faturaForm, fatura_no: e.target.value})} className="input-kurumsal flex-1" /></div>
                        <div className="flex items-center"><label className="w-24 text-xs font-bold text-slate-700">Tarih</label><input type="date" value={faturaForm.tarih} onChange={(e) => setFaturaForm({...faturaForm, tarih: e.target.value})} className="input-kurumsal flex-1" /></div>
                        <div className="flex items-center">
                            <label className="w-24 text-xs font-bold text-slate-700">Cari Hesap</label>
                            <select value={faturaForm.cari_id} onChange={(e) => setFaturaForm({...faturaForm, cari_id: e.target.value})} className="input-kurumsal flex-1">
                                <option value="">--- Fatura Kesilecek Cariyi Seçiniz ---</option>
                                {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                            </select>
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
                            <th className="w-16 text-center">KDV %</th>
                            <th className="w-32 text-right">KDV&apos;li Tutar</th>
                            <th className="w-8 text-center print:hidden"><i className="fas fa-trash"></i></th>
                        </tr>
                    </thead>
                    <tbody>
                        {faturaKalemleri.map((item, index) => {
                            const tutarKDVsiz = item.miktar * item.birim_fiyat;
                            const tutarKDVli = tutarKDVsiz * (1 + (item.kdv_orani / 100));
                            return (
                                <tr key={index} className="hover:bg-[#f8fafc] focus-within:bg-[#f8fafc] transition-colors">
                                    <td className="text-center text-[10px] text-slate-400 font-bold print:hidden">{index + 1}</td>
                                    <td className="p-0"><input value={item.urun_adi} onChange={(e) => satirGuncelle(index, "urun_adi", e.target.value)} placeholder="Stok veya Hizmet yazın" className="w-full px-2 py-1.5 text-[11px] font-semibold text-slate-800 outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="p-0"><input type="number" min="1" value={item.miktar} onChange={(e) => satirGuncelle(index, "miktar", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] font-bold text-center outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="p-0"><input type="text" value={item.birim} onChange={(e) => satirGuncelle(index, "birim", e.target.value)} className="w-full px-2 py-1.5 text-[11px] font-bold text-center outline-none bg-transparent focus:bg-white uppercase" /></td>
                                    <td className="p-0"><input type="number" min="0" value={item.birim_fiyat} onChange={(e) => satirGuncelle(index, "birim_fiyat", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] font-bold text-right text-[#1d4ed8] outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="p-0"><input type="number" min="0" value={item.kdv_orani} onChange={(e) => satirGuncelle(index, "kdv_orani", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] font-bold text-center text-orange-600 outline-none bg-transparent focus:bg-white" /></td>
                                    <td className="text-right text-[11px] font-semibold text-slate-900">{tutarKDVli.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                    <td className="text-center print:hidden"><button onClick={() => satirSil(index)} className="text-slate-400 hover:text-red-600 outline-none"><i className="fas fa-times"></i></button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <button onClick={satirEkle} className="mt-3 ml-2 text-[11px] font-bold text-[#1d4ed8] hover:underline print:hidden flex items-center"><i className="fas fa-plus-circle mr-1"></i> Yeni Fatura Satırı Ekle</button>
            </div>

            <div className="p-4 flex flex-col sm:flex-row justify-between sm:items-end gap-4 shrink-0 print:bg-white print:border-black print:border-t-2" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                <div className="print:hidden w-full sm:w-auto">
                    <button onClick={kaydet} className={`btn-primary w-full sm:w-auto px-6 py-3 sm:py-2 font-semibold text-xs uppercase tracking-widest flex items-center justify-center ${faturaTipi === 'GELEN' ? '' : ''}`} style={faturaTipi === 'GELEN' ? { background: "#ea580c" } : undefined}>
                        <i className="fas fa-save mr-2"></i> Faturayı Kaydet
                    </button>
                </div>

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
    </>
  );
}
