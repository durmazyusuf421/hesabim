"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface KasaIslem {
  id: number;
  sirket_id: number;
  islem_tipi: string;
  kategori: string;
  tutar: number;
  aciklama: string;
  tarih: string;
  islem_yapan: string;
}

export default function MarketKasasi() {
  const { aktifSirket: aktifMusteri, kullanici } = useAuth();
  const toast = useToast();
  const { onayla, OnayModal } = useOnayModal();
  const [kullaniciAdi, setKullaniciAdi] = useState<string>("");

  const [islemler, setIslemler] = useState<KasaIslem[]>([]);
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
      kategori: "Satış Geliri",
      tutar: "",
      aciklama: "",
      tarih: new Date().toISOString().split('T')[0]
  });

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

  useEffect(() => {
    if (!aktifMusteri) return;
    if (aktifMusteri.rol !== "PERAKENDE") { window.location.href = "/login"; return; }

    setKullaniciAdi(kullanici?.ad_soyad || "Yönetici");
    verileriGetir(aktifMusteri.id);
  }, [aktifMusteri, kullanici]);

  const yeniIslemAc = (tip: "GELIR" | "GIDER") => {
      setIslemTipi(tip);
      setForm({
          kategori: tip === "GELIR" ? "Satış Geliri" : "Tedarikçi Ödemesi",
          tutar: "",
          aciklama: "",
          tarih: new Date().toISOString().split('T')[0]
      });
      setModalAcik(true);
  };

  const islemKaydet = async () => {
      if (!form.tutar || Number(form.tutar) <= 0) { toast.error("Lütfen geçerli bir tutar giriniz!"); return; }
      if (!form.kategori) { toast.error("Lütfen kategori seçiniz!"); return; }
      if (!aktifMusteri) return;

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
          toast.error("İşlem kaydedilirken bir hata oluştu: " + error.message);
      } else {
          setModalAcik(false);
          verileriGetir(aktifMusteri!.id);
          toast.success("İşlem başarıyla kaydedildi!");
      }
  };

  const islemSil = (id: number) => {
      onayla({
          baslik: "Kasa İşlemi Sil",
          mesaj: "Bu kasa işlemini kalıcı olarak silmek istediğinize emin misiniz?",
          altMesaj: "Bu işlem geri alınamaz.",
          onayMetni: "Evet, Sil",
          tehlikeli: true,
          onOnayla: async () => {
              await supabase.from("kasa_islemleri").delete().eq("id", id);
              verileriGetir(aktifMusteri!.id);
              toast.success("İşlem başarıyla silindi.");
          }
      });
  };

  const filtrelenmisIslemler = islemler.filter(i => (i.aciklama || "").toLowerCase().includes(aramaTerimi.toLowerCase()) || i.kategori.toLowerCase().includes(aramaTerimi.toLowerCase()));

  if (!aktifMusteri) return <div className="h-full flex items-center justify-center font-semibold text-slate-500" style={{ background: "var(--c-bg)" }}>Yükleniyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>

        {/* ÜST ARAÇ ÇUBUĞU */}
        <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <button onClick={() => yeniIslemAc('GELIR')} className="btn-primary flex items-center text-xs font-semibold whitespace-nowrap">
                <i className="fas fa-plus-circle mr-2"></i> Gelir Ekle
            </button>
            <button onClick={() => yeniIslemAc('GIDER')} className="flex items-center px-3 py-1.5 bg-[#dc2626] hover:bg-red-700 border border-red-700 text-white text-xs font-semibold whitespace-nowrap">
                <i className="fas fa-minus-circle mr-2"></i> Gider Çık
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
                <i className="fas fa-search text-slate-400"></i>
                <input type="text" placeholder="Açıklama veya kategori ile işlem ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal text-sm w-64" />
            </div>
        </div>

        {/* ÖZET KARTLARI */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 shrink-0" style={{ background: "var(--c-bg)" }}>
            <div className="bg-white border-2 border-slate-300 border-l-4 border-l-blue-500 p-4">
                <p className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Toplam Kasa Bakiyesi</p>
                <h2 className={`text-2xl font-semibold ${kasaBakiye >= 0 ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
                    {kasaBakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-sm text-[#94a3b8]">TL</span>
                </h2>
            </div>
            <div className="bg-white border-2 border-slate-300 border-l-4 border-l-emerald-500 p-4">
                <p className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Bugünkü Gelir (Kasa Giriş)</p>
                <h2 className="text-2xl font-semibold text-[#059669]">
                    {gunlukGelir.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-sm text-[#94a3b8]">TL</span>
                </h2>
            </div>
            <div className="bg-white border-2 border-slate-300 border-l-4 border-l-red-500 p-4">
                <p className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Bugünkü Gider (Kasa Çıkış)</p>
                <h2 className="text-2xl font-semibold text-[#dc2626]">
                    {gunlukGider.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-sm text-[#94a3b8]">TL</span>
                </h2>
            </div>
        </div>

        {/* DATA GRID */}
        <div className="flex-1 overflow-auto relative">
            <table className="tbl-kurumsal">
                <thead>
                    <tr>
                        <th className="w-32 text-center">Tarih</th>
                        <th className="w-32 text-center">TÜR</th>
                        <th className="w-48">Kategori</th>
                        <th>Açıklama</th>
                        <th className="w-40 text-right">Tutar (TL)</th>
                        <th className="w-32 text-center">İşlemi Yapan</th>
                        <th className="w-16 text-center"><i className="fas fa-cog"></i></th>
                    </tr>
                </thead>
                <tbody>
                    {yukleniyor ? (
                        <tr><td colSpan={7} className="p-10 text-center text-slate-400 font-semibold uppercase tracking-widest">Veriler Yükleniyor...</td></tr>
                    ) : filtrelenmisIslemler.length === 0 ? (
                        <tr><td colSpan={7} className="p-10 text-center text-slate-400 font-semibold uppercase tracking-widest">Kasa Hareketi Bulunmuyor</td></tr>
                    ) : (
                        filtrelenmisIslemler.map((islem) => {
                            const isGelir = islem.islem_tipi === 'GELIR';
                            return (
                                <tr key={islem.id}>
                                    <td className="text-center text-slate-500 font-semibold">{new Date(islem.tarih).toLocaleDateString('tr-TR')}</td>
                                    <td className="text-center">
                                        <span className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${isGelir ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            <i className={`fas ${isGelir ? 'fa-arrow-down' : 'fa-arrow-up'} mr-1`}></i> {isGelir ? 'GELİR' : 'GİDER'}
                                        </span>
                                    </td>
                                    <td className="font-semibold text-slate-700">{islem.kategori}</td>
                                    <td className="text-slate-600 truncate max-w-sm" title={islem.aciklama}>{islem.aciklama || '-'}</td>
                                    <td className={`text-right font-semibold text-sm ${isGelir ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
                                        {isGelir ? '+' : '-'}{Number(islem.tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}
                                    </td>
                                    <td className="text-center text-[10px] text-slate-500 font-semibold uppercase">{islem.islem_yapan}</td>
                                    <td className="text-center">
                                        <button onClick={() => islemSil(islem.id)} className="btn-secondary w-7 h-7 hover:bg-red-50 hover:text-[#dc2626] transition-all" title="Sil">
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

        {/* ALT DURUM ÇUBUĞU */}
        <div className="h-8 flex items-center justify-between px-4 text-[10px] text-slate-600 font-semibold shrink-0 print:hidden" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
            <span>Toplam İşlem: {filtrelenmisIslemler.length}</span>
            <span>Kasa Bakiye: {kasaBakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
        </div>
      </main>

      {/* --- KASA İŞLEM MODALI --- */}
      {modalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                  <i className={`fas ${islemTipi === 'GELIR' ? 'fa-plus-circle' : 'fa-minus-circle'} mr-2`}></i>
                  {islemTipi === 'GELIR' ? 'Kasa Girişi (Gelir Ekle)' : 'Kasa Çıkışı (Gider Ekle)'}
              </h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times"></i></button>
            </div>

            <div className="p-4 bg-white space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">İşlem Tutarı (TL)</label>
                        <input type="number" min="0" value={form.tutar} onChange={(e) => setForm({...form, tutar: e.target.value})} className={`input-kurumsal w-full px-4 py-3 font-semibold text-2xl text-center ${islemTipi === 'GELIR' ? 'text-[#059669]' : 'text-[#dc2626]'}`} placeholder="0,00" />
                    </div>

                    <div>
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">İşlem Tarihi</label>
                        <input type="date" value={form.tarih} onChange={(e) => setForm({...form, tarih: e.target.value})} className="input-kurumsal w-full px-4 py-2.5 font-semibold text-sm text-slate-700" />
                    </div>

                    <div>
                        <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Kategori Seçimi</label>
                        <select value={form.kategori} onChange={(e) => setForm({...form, kategori: e.target.value})} className="input-kurumsal w-full px-4 py-2.5 font-semibold text-sm text-slate-700 cursor-pointer">
                            {islemTipi === 'GELIR' ? (
                                <>
                                    <option value="Satış Geliri">Satış Geliri</option>
                                    <option value="Toptan Satış">Toptan Satış</option>
                                    <option value="Diğer Gelir">Diğer Gelir</option>
                                </>
                            ) : (
                                <>
                                    <option value="Tedarikçi Ödemesi">Tedarikçi Ödemesi (Mal Alımı)</option>
                                    <option value="İşletme Gideri">İşletme Gideri</option>
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
                    <label className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 block">Açıklama / Detay</label>
                    <textarea value={form.aciklama} onChange={(e) => setForm({...form, aciklama: e.target.value})} placeholder="Örn: Akşam kasası nakit teslimi, Ahmet toptancıya nakit ödeme vb." className="input-kurumsal w-full px-4 py-3 font-semibold text-sm text-slate-800 resize-none h-20"></textarea>
                </div>
            </div>

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setModalAcik(false)} className="btn-secondary text-xs font-semibold whitespace-nowrap px-3 py-1.5">İptal</button>
              <button onClick={islemKaydet} className={`flex items-center px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white ${islemTipi === 'GELIR' ? 'bg-[#059669] hover:bg-emerald-700 border border-emerald-700' : 'bg-[#dc2626] hover:bg-red-700 border border-red-700'}`}>
                  <i className="fas fa-check mr-2"></i> Kasaya İşle
              </button>
            </div>
          </div>
        </div>
      )}
      <OnayModal />
    </>
  );
}
