"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
interface UrunOzet { id: number; urun_adi: string; stok_miktari: number; birim: string; }
interface StokHareketi {
    id: number; tarih: string; islem_tipi: string; miktar: number; aciklama: string;
    islem_yapan: string; urunler: { urun_adi: string; birim: string; }
}

export default function StokHareketleri() {
  const { aktifSirket, kullanici, kullaniciRol, isYonetici, isDepocu } = useAuth();
  const toast = useToast();
  const [aktifKullaniciAdi, setAktifKullaniciAdi] = useState<string>("");
  const hasAccess = isYonetici || isDepocu;

  const [urunler, setUrunler] = useState<UrunOzet[]>([]);
  const [hareketler, setHareketler] = useState<StokHareketi[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  // YENİ HAREKET MODAL STATE
  const [modalAcik, setModalAcik] = useState(false);
  const [islemForm, setIslemForm] = useState({ urun_id: "", islem_tipi: "GIRIS", miktar: 1, aciklama: "" });

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data: uData } = await supabase.from("urunler").select("id, urun_adi, stok_miktari, birim").eq("sahip_sirket_id", sirketId).order('urun_adi');
      setUrunler(uData || []);

      const { data: hData } = await supabase.from("stok_hareketleri").select("*, urunler(urun_adi, birim)").eq("sirket_id", sirketId).order('tarih', { ascending: false }).order('id', { ascending: false });
      setHareketler((hData as StokHareketi[]) || []);
      setYukleniyor(false);
  }

  useEffect(() => {
    if (!aktifSirket) return;
    if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
    setAktifKullaniciAdi(kullanici?.ad_soyad || "Bilinmeyen Kullanıcı");

    if (kullaniciRol.includes("YONETICI") || kullaniciRol.includes("DEPOCU")) {
        verileriGetir(aktifSirket.id);
    } else {
        setYukleniyor(false);
    }
  }, [aktifSirket, kullanici, kullaniciRol]);

  const yeniIslemBaslat = () => {
      setIslemForm({ urun_id: "", islem_tipi: "GIRIS", miktar: 1, aciklama: "" });
      setModalAcik(true);
  };

  const islemKaydet = async () => {
      if (!islemForm.urun_id) { toast.error("Lütfen bir ürün seçin!"); return; }
      if (islemForm.miktar <= 0) { toast.error("Miktar 0'dan büyük olmalıdır!"); return; }

      const seciliUrun = urunler.find(u => u.id.toString() === islemForm.urun_id);
      if (!seciliUrun) { toast.error("Ürün bulunamadı!"); return; }

      const { error: hError } = await supabase.from("stok_hareketleri").insert([{
          sirket_id: aktifSirket?.id,
          urun_id: Number(islemForm.urun_id),
          islem_tipi: islemForm.islem_tipi,
          miktar: islemForm.miktar,
          aciklama: islemForm.aciklama || 'Manuel İşlem',
          islem_yapan: aktifKullaniciAdi
      }]);

      if (hError) { toast.error("İşlem kaydedilemedi: " + hError.message); return; }

      let yeniMiktar = Number(seciliUrun.stok_miktari);
      if (islemForm.islem_tipi === "GIRIS") yeniMiktar += Number(islemForm.miktar);
      else if (islemForm.islem_tipi === "CIKIS" || islemForm.islem_tipi === "FIRE") yeniMiktar -= Number(islemForm.miktar);
      else if (islemForm.islem_tipi === "SAYIM") yeniMiktar = Number(islemForm.miktar);

      await supabase.from("urunler").update({ stok_miktari: yeniMiktar }).eq("id", seciliUrun.id);

      setModalAcik(false);
      if (aktifSirket) verileriGetir(aktifSirket.id);
      toast.success("Stok işlemi başarıyla kaydedildi!");
  };

  const filtrelenmisHareketler = hareketler.filter(h => (h.urunler?.urun_adi || "").toLowerCase().includes(aramaTerimi.toLowerCase()) || (h.islem_tipi || "").toLowerCase().includes(aramaTerimi.toLowerCase()));

  if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "#f8fafc" }}>Yükleniyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500" style={{ background: "#f8fafc" }}>
                <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Stok Hareketleri sayfasına sadece &quot;YÖNETİCİ&quot; veya &quot;DEPOCU&quot; yetkisine sahip kullanıcılar erişebilir.</p>
            </div>
        ) : (
            <>
                <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <button onClick={yeniIslemBaslat} className="btn-primary flex items-center gap-2"><i className="fas fa-plus text-[10px]" /> STOK İŞLEMİ</button>
                    <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2"><i className="fas fa-print text-[10px]" /> YAZDIR</button>
                    <div className="ml-auto relative">
                        <input type="text" placeholder="Stok adı veya işlem tipi..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-64" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                    </div>
                </div>

                <div className="flex-1 overflow-auto relative">
                    <table className="tbl-kurumsal">
                        <thead>
                            <tr>
                                <th className="w-32 text-center">İşlem Tarihi</th>
                                <th>Stok / Ürün Adı</th>
                                <th className="w-32 text-center">İşlem Tipi</th>
                                <th className="w-24 text-center">Miktar</th>
                                <th className="w-48">Açıklama / Belge</th>
                                <th className="w-32">İşlemi Yapan</th>
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
                                    let badgeClass = "badge-durum";

                                    if(h.islem_tipi === "GIRIS") { icon = "fa-arrow-down"; badgeClass = "badge-durum badge-teslim"; }
                                    else if(h.islem_tipi === "CIKIS") { icon = "fa-arrow-up"; badgeClass = "badge-durum badge-sevkiyat"; }
                                    else if(h.islem_tipi === "FIRE") { icon = "fa-trash"; badgeClass = "badge-durum badge-iptal"; }
                                    else if(h.islem_tipi === "SAYIM") { icon = "fa-equals"; badgeClass = "badge-durum badge-hazirlaniyor"; }

                                    return (
                                        <tr key={index}>
                                            <td className="text-center">{new Date(h.tarih).toLocaleString('tr-TR', {dateStyle: 'short', timeStyle: 'short'})}</td>
                                            <td className="font-bold text-slate-800">{h.urunler?.urun_adi || '-'}</td>
                                            <td className="text-center">
                                                <span className={badgeClass}>
                                                    <i className={`fas ${icon} mr-1`}></i> {h.islem_tipi}
                                                </span>
                                            </td>
                                            <td className="text-center font-semibold text-lg">{h.miktar} <span className="text-[10px] text-slate-500 font-bold">{h.urunler?.birim}</span></td>
                                            <td className="text-slate-600 truncate max-w-xs" title={h.aciklama}>{h.aciklama}</td>
                                            <td className="text-slate-500 font-bold">{h.islem_yapan}</td>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg overflow-hidden border border-slate-200 flex flex-col">
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-sm font-bold text-slate-800 flex items-center"><i className="fas fa-dolly-flatbed text-blue-600 mr-2"></i> Manuel Stok İşlemi</h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times text-lg"></i></button>
            </div>

            <div className="p-4 bg-white space-y-4 overflow-y-auto">
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşlem Yapılacak Ürün</label>
                    <select value={islemForm.urun_id} onChange={(e) => setIslemForm({...islemForm, urun_id: e.target.value})} className="input-kurumsal w-full">
                        <option value="">-- Ürün Seçiniz --</option>
                        {urunler.map(u => <option key={u.id} value={u.id}>{u.urun_adi} (Mevcut: {u.stok_miktari} {u.birim})</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşlem Tipi</label>
                        <select value={islemForm.islem_tipi} onChange={(e) => setIslemForm({...islemForm, islem_tipi: e.target.value})} className="input-kurumsal w-full cursor-pointer">
                            <option value="GIRIS">STOK GİRİŞİ (Ekle)</option>
                            <option value="CIKIS">STOK ÇIKIŞI (Düş)</option>
                            <option value="FIRE">FİRE / BOZUK (Düş)</option>
                            <option value="SAYIM">SAYIM (Eşitle)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Miktar</label>
                        <input type="number" min="1" value={islemForm.miktar} onChange={(e) => setIslemForm({...islemForm, miktar: Number(e.target.value)})} className="input-kurumsal w-full text-center" />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Açıklama / Not</label>
                    <textarea value={islemForm.aciklama} onChange={(e) => setIslemForm({...islemForm, aciklama: e.target.value})} placeholder="İşlem notu yazın..." className="input-kurumsal w-full resize-none h-20"></textarea>
                </div>
            </div>

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setModalAcik(false)} className="btn-secondary">İptal</button>
              <button onClick={islemKaydet} className="btn-primary flex items-center"><i className="fas fa-check mr-2"></i> İşlemi İşle</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
