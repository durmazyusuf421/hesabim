"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import Link from "next/link";
interface Urun {
    id: number; urun_adi: string; barkod?: string; stok_miktari: number;
    birim: string; alis_fiyati: number; satis_fiyati: number; kdv_orani: number;
}
interface FormDataState {
    urun_adi: string; barkod: string; stok_miktari: number; birim: string;
    alis_fiyati: number; satis_fiyati: number; kdv_orani: number;
}

export default function StokKartlari() {
  const toast = useToast();
  const { aktifSirket, kullaniciRol, isYonetici, isDepocu } = useAuth();

  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [seciliUrunId, setSeciliUrunId] = useState<number | null>(null);

  const [formData, setFormData] = useState<FormDataState>({
      urun_adi: "", barkod: "", stok_miktari: 0, birim: "Adet", alis_fiyati: 0, satis_fiyati: 0, kdv_orani: 20
  });

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data, error } = await supabase.from("urunler").select("*").eq("sahip_sirket_id", sirketId).order('id', { ascending: false });
      if (!error && data) setUrunler(data);
      setYukleniyor(false);
  }

  useEffect(() => {
    if (!aktifSirket) return;

    // GÜVENLİK KİLİDİ: Hem Toptancı Hem Market girebilir
    if (aktifSirket.rol !== "TOPTANCI" && aktifSirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }

    // Market (Perakende) ise yetkiye bakma, Toptancı ise Depocu/Yönetici yetkisi ara
    if (aktifSirket.rol === "PERAKENDE" || kullaniciRol.includes("YONETICI") || kullaniciRol.includes("DEPOCU")) {
        verileriGetir(aktifSirket.id);
    } else {
        setYukleniyor(false);
    }
  }, [aktifSirket, kullaniciRol]);

  const hasAccess = aktifSirket?.rol === "PERAKENDE" || isDepocu;

  const yeniUrunEkle = () => {
      setDuzenlemeModu(false); setSeciliUrunId(null);
      setFormData({ urun_adi: "", barkod: "", stok_miktari: 0, birim: "Adet", alis_fiyati: 0, satis_fiyati: 0, kdv_orani: 20 });
      setModalAcik(true);
  };

  const urunDuzenle = (urun: Urun) => {
      setDuzenlemeModu(true); setSeciliUrunId(urun.id);
      setFormData({
          urun_adi: urun.urun_adi, barkod: urun.barkod || "", stok_miktari: urun.stok_miktari, birim: urun.birim,
          alis_fiyati: urun.alis_fiyati, satis_fiyati: urun.satis_fiyati, kdv_orani: urun.kdv_orani
      });
      setModalAcik(true);
  };

  const formuKaydet = async () => {
      if (!formData.urun_adi) { toast.error("Ürün adı zorunludur!"); return; }
      const kaydedilecekVeri = { ...formData, sahip_sirket_id: aktifSirket?.id };

      if (duzenlemeModu && seciliUrunId) {
          const { error } = await supabase.from("urunler").update(kaydedilecekVeri).eq("id", seciliUrunId);
          if (error) { toast.error("Hata: " + error.message); return; }
      } else {
          const { error } = await supabase.from("urunler").insert([kaydedilecekVeri]);
          if (error) { toast.error("Hata: " + error.message); return; }
      }
      setModalAcik(false);
      toast.success("Ürün başarıyla kaydedildi!");
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  const urunSil = async (id: number) => {
      if(window.confirm("Bu ürünü kalıcı olarak silmek istediğinize emin misiniz?")) {
          try {
              const { error } = await supabase.from("urunler").delete().eq("id", id);
              if (error) throw error;
              toast.success("Ürün başarıyla silindi.");
              if (aktifSirket) verileriGetir(aktifSirket.id);
          } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              toast.error("Silme hatası: " + message);
          }
      }
  };

  const filtrelenmisUrunler = urunler.filter(u => u.urun_adi.toLowerCase().includes(aramaTerimi.toLowerCase()) || (u.barkod && u.barkod.includes(aramaTerimi)));

  if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "var(--c-bg)" }}>Sistem Doğrulanıyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "#f8fafc" }}>
                <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Stok Kartları sayfasına erişim yetkiniz bulunmamaktadır.</p>
            </div>
        ) : (
            <>
                <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <div className="flex items-center gap-2">
                        <button onClick={yeniUrunEkle} className="btn-primary flex items-center gap-2"><i className="fas fa-plus text-[10px]" /> YENİ ÜRÜN</button>
                        <Link href="/stok/toplu-fiyat" className="btn-secondary flex items-center gap-2"><i className="fas fa-tags text-[10px]" /> TOPLU FİYAT</Link>
                    </div>
                    <div className="relative">
                        <input type="text" placeholder="Ürün adı veya barkod ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-64" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                    </div>
                </div>

                <div className="flex-1 overflow-auto relative" style={{ background: "var(--c-bg)" }}>
                    <table className="tbl-kurumsal">
                        <thead>
                            <tr>
                                <th className="w-16 text-center">ID</th>
                                <th className="w-32 text-center">Barkod</th>
                                <th>Ürün Adı</th>
                                <th className="w-24 text-center">Mevcut Stok</th>
                                <th className="w-20 text-center">Birim</th>
                                <th className="w-28 text-right">Alış Fiyatı</th>
                                <th className="w-28 text-right">Satış Fiyatı</th>
                                <th className="w-20 text-center">KDV (%)</th>
                                <th className="w-24 text-center print:hidden">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yukleniyor ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                            ) : filtrelenmisUrunler.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Stok Kartı Bulunamadı</td></tr>
                            ) : (
                                filtrelenmisUrunler.map((u) => (
                                    <tr key={u.id} className="text-[11px] font-medium border-b border-slate-200 hover:bg-slate-50 transition-colors">
                                        <td className="p-1.5 border-r border-slate-200 text-center text-slate-400">#{u.id}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-center font-bold font-mono text-slate-600">{u.barkod || '-'}</td>
                                        <td className="p-1.5 border-r border-slate-200 font-bold text-slate-800">{u.urun_adi}</td>
                                        <td className={`p-1.5 border-r border-slate-200 text-center font-semibold text-sm ${Number(u.stok_miktari) <= 0 ? 'text-[#dc2626]' : 'text-[#059669]'}`}>{u.stok_miktari}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-center">{u.birim}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-right font-semibold text-slate-500">{Number(u.alis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</td>
                                        <td className="p-1.5 border-r border-slate-200 text-right font-semibold text-[#1d4ed8]">{Number(u.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</td>
                                        <td className="p-1.5 border-r border-slate-200 text-center text-slate-500">% {u.kdv_orani}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-center print:hidden">
                                            <div className="flex justify-center space-x-1">
                                                <button onClick={() => urunDuzenle(u)} className="btn-secondary px-2 py-1" title="Düzenle"><i className="fas fa-edit"></i></button>
                                                <button onClick={() => urunSil(u.id)} className="btn-secondary px-2 py-1" title="Sil"><i className="fas fa-trash"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </>
        )}
      </main>

      {/* --- ÜRÜN EKLEME / DÜZENLEME MODALI --- */}
      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-xl overflow-hidden border border-slate-200 flex flex-col">
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                  <i className="fas fa-box mr-2"></i> {duzenlemeModu ? 'Stok Kartını Düzenle' : 'Yeni Stok Kartı'}
              </h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
            </div>

            <div className="p-4 bg-white space-y-4 overflow-y-auto">

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Ürün Adı</label>
                        <input type="text" value={formData.urun_adi} onChange={(e) => setFormData({...formData, urun_adi: e.target.value})} className="input-kurumsal w-full" placeholder="Örn: 5LT Ayçiçek Yağı" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Barkod (POS İçin)</label>
                        <input type="text" value={formData.barkod} onChange={(e) => setFormData({...formData, barkod: e.target.value})} className="input-kurumsal w-full font-mono" placeholder="Okutun..." />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Mevcut Stok Miktarı</label>
                        <input type="number" min="0" value={formData.stok_miktari} onChange={(e) => setFormData({...formData, stok_miktari: Number(e.target.value)})} className="input-kurumsal w-full text-center" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Satış Birimi</label>
                        <select value={formData.birim} onChange={(e) => setFormData({...formData, birim: e.target.value})} className="input-kurumsal w-full cursor-pointer">
                            <option value="Adet">Adet</option>
                            <option value="Kg">Kg</option>
                            <option value="Koli">Koli</option>
                            <option value="Kasa">Kasa</option>
                            <option value="Paket">Paket</option>
                            <option value="Metre">Metre</option>
                            <option value="Litre">Litre</option>
                            <option value="Ton">Ton</option>
                            <option value="Palet">Palet</option>
                            <option value="Düzine">Düzine</option>
                            <option value="Çift">Çift</option>
                            <option value="Kutu">Kutu</option>
                            <option value="Top">Top</option>
                            <option value="Rulo">Rulo</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Birim Alış Fiyatı (TL)</label>
                        <input type="number" min="0" value={formData.alis_fiyati} onChange={(e) => setFormData({...formData, alis_fiyati: Number(e.target.value)})} className="input-kurumsal w-full" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Birim Satış Fiyatı (TL)</label>
                        <input type="number" min="0" value={formData.satis_fiyati} onChange={(e) => setFormData({...formData, satis_fiyati: Number(e.target.value)})} className="input-kurumsal w-full" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">KDV Oranı (%)</label>
                        <select value={formData.kdv_orani} onChange={(e) => setFormData({...formData, kdv_orani: Number(e.target.value)})} className="input-kurumsal w-full cursor-pointer">
                            <option value={0}>% 0</option>
                            <option value={1}>% 1</option>
                            <option value={10}>% 10</option>
                            <option value={20}>% 20</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setModalAcik(false)} className="btn-secondary">İptal</button>
              <button onClick={formuKaydet} className="btn-primary flex items-center">
                  <i className={`fas ${duzenlemeModu ? 'fa-save' : 'fa-check'} mr-2`}></i> {duzenlemeModu ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
