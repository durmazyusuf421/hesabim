"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface VeresiyeMusteri {
  id: number;
  sirket_id: number;
  ad_soyad: string;
  telefon?: string;
  adres?: string;
  bakiye: number;
}

interface VeresiyeHareket {
  id: number;
  musteri_id: number;
  islem_tipi: string;
  tutar: number;
  aciklama: string;
  tarih: string;
  islem_yapan: string;
}

export default function VeresiyeDefteri() {
  const { aktifSirket: aktifMusteri, kullanici } = useAuth();
  const toast = useToast();
  const { onayla, OnayModal } = useOnayModal();
  const [kullaniciAdi, setKullaniciAdi] = useState<string>("");

  const [musteriler, setMusteriler] = useState<VeresiyeMusteri[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [toplamAlacak, setToplamAlacak] = useState(0);
  const [aktifSekme, setAktifSekme] = useState<"TUMU" | "BORCLULAR">("TUMU");

  // MÜŞTERİ EKLEME/DÜZENLEME MODALI
  const [modalAcik, setModalAcik] = useState(false);
  const [seciliMusteriId, setSeciliMusteriId] = useState<number | null>(null);
  const [musteriForm, setMusteriForm] = useState({ ad_soyad: "", telefon: "", adres: "" });

  // İŞLEM (BORÇ/TAHSİLAT) MODALI
  const [islemModalAcik, setIslemModalAcik] = useState(false);
  const [islemTipi, setIslemTipi] = useState<"BORCLANDIRMA" | "TAHSILAT">("BORCLANDIRMA");
  const [islemForm, setIslemForm] = useState({ tutar: "", aciklama: "", tarih: new Date().toISOString().split('T')[0] });

  // GEÇMİŞ / EKSTRE MODALI STATELERİ
  const [gecmisModalAcik, setGecmisModalAcik] = useState(false);
  const [musteriHareketleri, setMusteriHareketleri] = useState<VeresiyeHareket[]>([]);
  const [hareketYukleniyor, setHareketYukleniyor] = useState(false);

  // HAREKET DETAY MODALI
  const [detayHareket, setDetayHareket] = useState<VeresiyeHareket | null>(null);
  const [detayKalemler, setDetayKalemler] = useState<{ urun_adi: string; miktar: number; birim_fiyat: number; toplam_tutar: number }[]>([]);
  const [detayYukleniyor, setDetayYukleniyor] = useState(false);

  const hareketDetayAc = async (h: VeresiyeHareket) => {
      setDetayHareket(h);
      setDetayKalemler([]);
      if (h.islem_tipi === "BORCLANDIRMA") {
          // aciklama'dan sipariş id'si çıkarmaya çalış: "Satış İşlemi (#123)" veya "Satış (#123)"
          const match = h.aciklama?.match(/#(\d+)/);
          if (match) {
              setDetayYukleniyor(true);
              const { data } = await supabase.from("perakende_satis_kalemleri").select("urun_adi, miktar, birim_fiyat, toplam_tutar").eq("satis_id", Number(match[1]));
              setDetayKalemler(data || []);
              setDetayYukleniyor(false);
          }
      }
  };

  const detayIslemSil = () => {
      if (!detayHareket || !acikMusteri || !aktifMusteri) return;
      onayla({
          baslik: "İşlem Sil",
          mesaj: "Bu işlemi silmek istediğinize emin misiniz?",
          altMesaj: "Bakiye otomatik güncellenir.",
          onayMetni: "Evet, Sil",
          tehlikeli: true,
          onOnayla: async () => {
              try {
                  const { error } = await supabase.from("veresiye_hareketler").delete().eq("id", detayHareket.id);
                  if (error) throw error;
                  // Bakiye güncelle
                  const tutar = Number(detayHareket.tutar);
                  const mevcutBakiye = Number(acikMusteri.bakiye);
                  const yeniBakiye = detayHareket.islem_tipi === "BORCLANDIRMA" ? mevcutBakiye - tutar : mevcutBakiye + tutar;
                  await supabase.from("veresiye_musteriler").update({ bakiye: yeniBakiye }).eq("id", acikMusteri.id);
                  toast.success("İşlem silindi, bakiye güncellendi.");
                  setDetayHareket(null);
                  // Listeyi yenile
                  gecmisiGor(acikMusteri.id);
                  verileriGetir(aktifMusteri.id);
              } catch (err: unknown) { toast.error("Silme hatası: " + (err instanceof Error ? err.message : "Bilinmeyen hata")); }
          }
      });
  };

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const { data } = await supabase.from("veresiye_musteriler").select("*").eq("sirket_id", sirketId).order('ad_soyad');

      if (data) {
          setMusteriler(data);
          const alacaklar = data.reduce((acc, m) => acc + Number(m.bakiye), 0);
          setToplamAlacak(alacaklar);
      }
      setYukleniyor(false);
  }

  useEffect(() => {
    if (!aktifMusteri) return;
    if (aktifMusteri.rol !== "PERAKENDE") { window.location.href = "/login"; return; }

    setKullaniciAdi(kullanici?.ad_soyad || "Yönetici");
    verileriGetir(aktifMusteri.id);
  }, [aktifMusteri, kullanici]);

  const yeniMusteri = () => { setSeciliMusteriId(null); setMusteriForm({ ad_soyad: "", telefon: "", adres: "" }); setModalAcik(true); };

  const musteriKaydet = async () => {
      if (!musteriForm.ad_soyad) { toast.error("Müşteri Adı zorunludur!"); return; }
      if (!aktifMusteri) return;

      if (seciliMusteriId) {
          await supabase.from("veresiye_musteriler").update(musteriForm).eq("id", seciliMusteriId);
      } else {
          await supabase.from("veresiye_musteriler").insert([{ ...musteriForm, sirket_id: aktifMusteri.id }]);
      }
      setModalAcik(false); verileriGetir(aktifMusteri.id);
      toast.success("Müşteri başarıyla kaydedildi!");
  };

  const islemBaslat = (tip: "BORCLANDIRMA" | "TAHSILAT") => {
      if (!seciliMusteriId) { toast.error("Lütfen listeden işlem yapılacak müşteriyi seçin!"); return; }
      setIslemTipi(tip);
      setIslemForm({ tutar: "", aciklama: tip === "BORCLANDIRMA" ? "Veresiye Satış: " : "Nakit Ödeme", tarih: new Date().toISOString().split('T')[0] });
      setIslemModalAcik(true);
  };

  const islemKaydet = async () => {
      if (!islemForm.tutar || Number(islemForm.tutar) <= 0) { toast.error("Geçerli bir tutar giriniz!"); return; }

      const seciliMusteri = musteriler.find(m => m.id === seciliMusteriId);
      if (!seciliMusteri) return;

      const tutar = Number(islemForm.tutar);

      // Hareketi Kaydet
      await supabase.from("veresiye_hareketler").insert([{
          musteri_id: seciliMusteriId,
          islem_tipi: islemTipi,
          tutar: tutar,
          aciklama: islemForm.aciklama,
          tarih: islemForm.tarih,
          islem_yapan: kullaniciAdi
      }]);

      // Bakiyeyi Güncelle
      let yeniBakiye = Number(seciliMusteri.bakiye);
      if (islemTipi === "BORCLANDIRMA") yeniBakiye += tutar;
      else yeniBakiye -= tutar;

      await supabase.from("veresiye_musteriler").update({ bakiye: yeniBakiye }).eq("id", seciliMusteriId);

      setIslemModalAcik(false);
      if (aktifMusteri) verileriGetir(aktifMusteri.id);
      toast.success("İşlem başarıyla kaydedildi!");
  };

  const musteriSil = async () => {
      if (!seciliMusteriId) { toast.error("Lütfen müşteri seçin!"); return; }
      const m = musteriler.find(x => x.id === seciliMusteriId);
      if (Number(m?.bakiye) !== 0) { toast.error("Bakiyesi sıfırlanmamış (borcu olan) müşteri silinemez!"); return; }

      onayla({
          baslik: "Müşteri Sil",
          mesaj: "Bu müşteriyi silmek istediğinize emin misiniz?",
          altMesaj: "Bu işlem geri alınamaz.",
          onayMetni: "Evet, Sil",
          tehlikeli: true,
          onOnayla: async () => {
              await supabase.from("veresiye_hareketler").delete().eq("musteri_id", seciliMusteriId);
              await supabase.from("veresiye_musteriler").delete().eq("id", seciliMusteriId);
              setSeciliMusteriId(null); if (aktifMusteri) verileriGetir(aktifMusteri.id);
              toast.success("Müşteri başarıyla silindi.");
          }
      });
  };

  // YENİ: GEÇMİŞİ GETİR FONKSİYONU
  const gecmisiGor = async (id: number) => {
      setSeciliMusteriId(id);
      setGecmisModalAcik(true);
      setHareketYukleniyor(true);

      const { data } = await supabase.from("veresiye_hareketler")
          .select("*")
          .eq("musteri_id", id)
          .order('tarih', { ascending: false })
          .order('id', { ascending: false });

      setMusteriHareketleri(data || []);
      setHareketYukleniyor(false);
  };

  const aramaFiltrelenmis = musteriler.filter(m => m.ad_soyad.toLowerCase().includes(aramaTerimi.toLowerCase()));
  const filtrelenmisMusteriler = aktifSekme === "BORCLULAR"
      ? [...aramaFiltrelenmis].filter(m => Number(m.bakiye) > 0).sort((a, b) => Number(b.bakiye) - Number(a.bakiye))
      : aramaFiltrelenmis;
  const acikMusteri = musteriler.find(m => m.id === seciliMusteriId);

  if (!aktifMusteri) return <div className="h-full flex items-center justify-center font-semibold" style={{ background: "var(--c-bg)", color: "var(--c-text-muted)" }}>Yükleniyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        {/* ÖZET KARTLARI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 shrink-0" style={{ background: "#f8fafc" }}>
          <div className="bg-white border border-slate-200 p-4 border-l-4 border-l-red-500">
            <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Toplam Alacak</div>
            <div className="text-2xl font-semibold text-[#dc2626]">{toplamAlacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})} <span className="text-sm text-[#94a3b8]">TL</span></div>
          </div>
          <div className="bg-white border border-slate-200 p-4 border-l-4 border-l-blue-500">
            <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Toplam Müşteri</div>
            <div className="text-2xl font-semibold text-slate-800">{filtrelenmisMusteriler.length}</div>
          </div>
        </div>

        {/* SEKMELER + TOOLBAR */}
        <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <button onClick={() => setAktifSekme("TUMU")} className={aktifSekme === "TUMU" ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}>Tüm Müşteriler</button>
          <button onClick={() => setAktifSekme("BORCLULAR")} className={aktifSekme === "BORCLULAR" ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"} style={aktifSekme === "BORCLULAR" ? { background: "#dc2626" } : {}}>
              Borçlular ({toplamAlacak.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL)
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />
          <button onClick={yeniMusteri} className="btn-primary whitespace-nowrap"><i className="fas fa-user-plus mr-1.5"></i> Müşteri Ekle</button>
          <button onClick={() => islemBaslat("BORCLANDIRMA")} className="btn-primary whitespace-nowrap" style={{ background: "#dc2626" }}><i className="fas fa-cart-plus mr-1.5"></i> Veresiye Yaz</button>
          <button onClick={() => islemBaslat("TAHSILAT")} className="btn-primary whitespace-nowrap" style={{ background: "#059669" }}><i className="fas fa-hand-holding-usd mr-1.5"></i> Ödeme Al</button>
          <button onClick={musteriSil} className="btn-secondary whitespace-nowrap"><i className="fas fa-trash mr-1.5" style={{ color: "#dc2626" }}></i> Müşteriyi Sil</button>
          <div className="flex-1"></div>
          <div className="flex items-center" style={{ border: "1px solid var(--c-border)", background: "white", padding: "0.375rem 0.75rem" }}>
            <i className="fas fa-search mr-2" style={{ color: "var(--c-text-muted)", fontSize: 11 }}></i>
            <input type="text" placeholder="Müşteri ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal" style={{ border: "none", padding: 0, width: 180, background: "transparent" }} />
          </div>
        </div>

        {/* DATA GRID - Desktop Table */}
        <div className="flex-1 overflow-auto relative hidden md:block" style={{ background: "white" }}>
            <div className="overflow-x-auto">
                <table className="tbl-kurumsal" style={{ minWidth: 700 }}>
                    <thead>
                        <tr>
                            <th style={{ width: 32, textAlign: "center" }}><i className="fas fa-check"></i></th>
                            <th>Müşteri Adı Soyadı</th>
                            <th style={{ width: 160 }}>Telefon Numarası</th>
                            <th style={{ width: 192 }}>Adres Bilgisi</th>
                            <th style={{ width: 160, textAlign: "right" }}>Borç Bakiyesi</th>
                            <th style={{ width: 128, textAlign: "center" }}>Detay / Geçmiş</th>
                        </tr>
                    </thead>
                    <tbody>
                        {yukleniyor ? (
                            <tr><td colSpan={6} className="p-10 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Müşteriler Yükleniyor...</td></tr>
                        ) : filtrelenmisMusteriler.length === 0 ? (
                            <tr><td colSpan={6} className="p-10 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Kayıtlı Müşteri Bulunamadı</td></tr>
                        ) : (
                            filtrelenmisMusteriler.map((m) => {
                                const isSelected = seciliMusteriId === m.id;
                                const bakiye = Number(m.bakiye);
                                return (
                                    <tr key={m.id} onClick={() => setSeciliMusteriId(m.id)} onDoubleClick={() => gecmisiGor(m.id)} className={`cursor-pointer select-none ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : (aktifSekme === "BORCLULAR" ? 'bg-red-50' : 'bg-white hover:bg-slate-50')}`}>
                                        <td style={{ textAlign: "center" }}>{isSelected && <i className="fas fa-check-circle text-blue-500"></i>}</td>
                                        <td className="font-semibold">
                                            <i className={`fas fa-user-circle mr-2 text-lg align-middle`} style={{ color: isSelected ? "#3b82f6" : "var(--c-border)" }}></i> {m.ad_soyad}
                                        </td>
                                        <td className="font-semibold">{m.telefon || '-'}</td>
                                        <td className="text-xs truncate" style={{ maxWidth: 200 }}>{m.adres || '-'}</td>
                                        <td className="font-semibold" style={{ textAlign: "right", color: bakiye > 0 ? "#dc2626" : "#059669" }}>
                                            {bakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                            <button onClick={(e) => { e.stopPropagation(); gecmisiGor(m.id); }} className="btn-secondary">
                                                <i className="fas fa-history mr-1"></i> İncele
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* DATA GRID - Mobile Card View */}
        <div className="flex-1 overflow-auto md:hidden space-y-2 p-3" style={{ background: "white" }}>
            {yukleniyor ? (
                <div className="p-10 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Müşteriler Yükleniyor...</div>
            ) : filtrelenmisMusteriler.length === 0 ? (
                <div className="p-10 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Kayıtlı Müşteri Bulunamadı</div>
            ) : (
                filtrelenmisMusteriler.map((m) => {
                    const isSelected = seciliMusteriId === m.id;
                    const bakiye = Number(m.bakiye);
                    return (
                        <div
                            key={m.id}
                            onClick={() => setSeciliMusteriId(m.id)}
                            className="p-3 border cursor-pointer select-none transition-colors"
                            style={isSelected ? { background: "#eff6ff", borderColor: "#3b82f6", borderLeftWidth: 2 } : { borderColor: aktifSekme === "BORCLULAR" ? "#fecaca" : "var(--c-border)", background: aktifSekme === "BORCLULAR" ? "#fef2f2" : "#f8fafc" }}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-user-circle text-lg" style={{ color: isSelected ? "#3b82f6" : "var(--c-border)" }}></i>
                                    <span className="font-semibold text-[13px]">{m.ad_soyad}</span>
                                </div>
                                {isSelected && <i className="fas fa-check-circle text-blue-500"></i>}
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[12px] font-semibold" style={{ color: bakiye > 0 ? "#dc2626" : "#059669" }}>
                                    {bakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                </span>
                                {m.telefon && (
                                    <span className="text-[11px]" style={{ color: "var(--c-text-secondary)" }}>
                                        <i className="fas fa-phone mr-1"></i>{m.telefon}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); gecmisiGor(m.id); }} className="btn-secondary text-[11px] px-2 py-1">
                                    <i className="fas fa-history mr-1"></i> İncele
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setSeciliMusteriId(m.id); islemBaslat("BORCLANDIRMA"); }} className="text-[11px] px-2 py-1" style={{ background: "#dc2626", color: "white", border: "none", fontWeight: 600 }}>
                                    <i className="fas fa-cart-plus mr-1"></i> Borç
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setSeciliMusteriId(m.id); islemBaslat("TAHSILAT"); }} className="text-[11px] px-2 py-1" style={{ background: "#059669", color: "white", border: "none", fontWeight: 600 }}>
                                    <i className="fas fa-hand-holding-usd mr-1"></i> Ödeme
                                </button>
                            </div>
                        </div>
                    );
                })
            )}
        </div>

        {/* ALT DURUM ÇUBUĞU */}
        <div className="flex items-center justify-between px-4 shrink-0 print:hidden" style={{ height: 32, background: "var(--c-bg)", borderTop: "1px solid var(--c-border)", fontSize: 10, fontWeight: 600, color: "var(--c-text-secondary)" }}>
            <span>Toplam Müşteri: {filtrelenmisMusteriler.length}</span>
            <span>Toplam Alacak: {toplamAlacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
        </div>
      </main>

      {/* --- MÜŞTERİ GEÇMİŞİ (EKSTRE) MODALI --- */}
      {gecmisModalAcik && acikMusteri && (() => {
          let yuruyen = 0;
          const toplamBorc = musteriHareketleri.filter(h => h.islem_tipi === "BORCLANDIRMA").reduce((a, h) => a + Number(h.tutar), 0);
          const toplamTahsilat = musteriHareketleri.filter(h => h.islem_tipi === "TAHSILAT").reduce((a, h) => a + Number(h.tutar), 0);
          return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
            {/* Header */}
            <div className="px-5 py-3 flex justify-between items-center shrink-0 print:hidden" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                <div>
                    <h3 className="text-[14px] font-semibold text-[#0f172a] flex items-center">
                        <i className="fas fa-book-reader mr-2 text-[#1d4ed8]"></i> {acikMusteri.ad_soyad} — Veresiye Ekstresi
                    </h3>
                </div>
                <button onClick={() => setGecmisModalAcik(false)} className="w-8 h-8 flex items-center justify-center text-[#64748b] hover:text-[#dc2626]"><i className="fas fa-times"></i></button>
            </div>

            {/* Yazdırılabilir İçerik */}
            <div id="print-veresiye-ekstre" className="flex-1 overflow-y-auto">
                {/* Print Header */}
                <div className="hidden print:block px-8 pt-8 pb-4 text-center" style={{ borderBottom: "2px solid #0f172a" }}>
                    <h1 className="text-xl font-bold uppercase tracking-widest">{aktifMusteri?.isletme_adi}</h1>
                    <p className="text-xs mt-1 text-[#64748b]">{aktifMusteri && (aktifMusteri as Record<string, unknown>).adres ? String((aktifMusteri as Record<string, unknown>).adres) : ""}</p>
                    <h2 className="text-lg font-semibold mt-3 uppercase tracking-wider">VERESİYE EKSTRESİ</h2>
                </div>

                {/* Müşteri Bilgi Kartı */}
                <div className="p-4 md:p-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                        <div className="bg-white border border-slate-200 p-3 print:border-black">
                            <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Müşteri</div>
                            <div className="text-[13px] font-semibold text-[#0f172a]">{acikMusteri.ad_soyad}</div>
                        </div>
                        <div className="bg-white border border-slate-200 p-3 print:border-black">
                            <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Telefon</div>
                            <div className="text-[13px] font-semibold text-[#0f172a]">{acikMusteri.telefon || "-"}</div>
                        </div>
                        <div className="bg-white border border-slate-200 p-3 print:border-black">
                            <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Adres</div>
                            <div className="text-[12px] font-semibold text-[#0f172a] truncate">{acikMusteri.adres || "-"}</div>
                        </div>
                        <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 p-3 print:border-black">
                            <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Güncel Borç</div>
                            <div className="text-xl font-semibold text-[#dc2626]">{Number(acikMusteri.bakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
                        </div>
                    </div>

                    {/* Hareketler Tablosu */}
                    <div className="overflow-x-auto">
                        <table className="tbl-kurumsal" style={{ minWidth: 700 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 90, textAlign: "center" }}>Tarih</th>
                                    <th style={{ width: 100, textAlign: "center" }}>İşlem</th>
                                    <th>Ürün Detayı / Açıklama</th>
                                    <th style={{ width: 110, textAlign: "right" }}>Borç</th>
                                    <th style={{ width: 110, textAlign: "right" }}>Ödeme</th>
                                    <th style={{ width: 120, textAlign: "right" }}>Bakiye</th>
                                    <th style={{ width: 60, textAlign: "center" }} className="print:hidden"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {hareketYukleniyor ? (
                                    <tr><td colSpan={7} className="p-8 text-center font-semibold uppercase tracking-widest text-[#94a3b8]"><i className="fas fa-circle-notch fa-spin mr-2"></i> Yükleniyor...</td></tr>
                                ) : musteriHareketleri.length === 0 ? (
                                    <tr><td colSpan={7} className="p-8 text-center font-semibold uppercase tracking-widest text-[#94a3b8]">Henüz işlem yapılmamış.</td></tr>
                                ) : (
                                    musteriHareketleri.map((h) => {
                                        const isBorc = h.islem_tipi === 'BORCLANDIRMA';
                                        const tutar = Number(h.tutar);
                                        yuruyen += isBorc ? tutar : -tutar;
                                        return (
                                            <tr key={h.id} className="bg-white hover:bg-slate-50 print:hover:bg-white">
                                                <td className="text-center text-[#64748b]">{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                                                <td className="text-center">
                                                    <span className={`badge-durum ${isBorc ? 'badge-kritik' : 'badge-teslim'}`}>
                                                        {isBorc ? 'Veresiye' : 'Tahsilat'}
                                                    </span>
                                                </td>
                                                <td className="text-[#0f172a] truncate" style={{ maxWidth: 280 }}>{h.aciklama || '-'}</td>
                                                <td className="text-right font-semibold tabular-nums text-[#dc2626] print:text-black">{isBorc ? tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                                <td className="text-right font-semibold tabular-nums text-[#059669] print:text-black">{!isBorc ? tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                                <td className="text-right font-semibold tabular-nums text-[#1d4ed8] print:text-black">{yuruyen.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                                <td className="text-center print:hidden"><button onClick={() => hareketDetayAc(h)} className="text-[10px] text-[#3b82f6] hover:text-[#1d4ed8] font-semibold"><i className="fas fa-eye" /></button></td>
                                            </tr>
                                        );
                                    })
                                )}
                                {musteriHareketleri.length > 0 && (
                                    <tr className="font-semibold" style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                                        <td colSpan={3} className="text-right uppercase tracking-widest text-[11px] text-[#64748b]">TOPLAM</td>
                                        <td className="text-right tabular-nums text-[#dc2626]">{toplamBorc.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="text-right tabular-nums text-[#059669]">{toplamTahsilat.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="text-right tabular-nums text-[#1d4ed8]">{Number(acikMusteri.bakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                        <td className="print:hidden"></td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Print İmza Alanı */}
                    <div className="hidden print:flex justify-between mt-12 pt-8 px-4">
                        <div className="text-center w-48">
                            <div style={{ borderTop: "1px solid #0f172a", paddingTop: 8 }}>
                                <p className="text-xs font-semibold">Teslim Eden</p>
                                <p className="text-[10px] text-[#64748b] mt-1">{aktifMusteri?.isletme_adi}</p>
                            </div>
                        </div>
                        <div className="text-center w-48">
                            <div style={{ borderTop: "1px solid #0f172a", paddingTop: 8 }}>
                                <p className="text-xs font-semibold">Teslim Alan</p>
                                <p className="text-[10px] text-[#64748b] mt-1">{acikMusteri.ad_soyad}</p>
                            </div>
                        </div>
                    </div>
                    <div className="hidden print:block text-center mt-8 pt-4 text-[9px] text-[#94a3b8]" style={{ borderTop: "1px solid #e2e8f0" }}>
                        {aktifMusteri?.isletme_adi} · {new Date().toLocaleDateString('tr-TR')} · Durmaz B2B Sistemi
                    </div>
                </div>
            </div>

            {/* Footer Butonları */}
            <div className="px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0 print:hidden" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                <button onClick={() => window.print()} className="btn-secondary whitespace-nowrap">
                    <i className="fas fa-print mr-2"></i> Ekstreyi Yazdır
                </button>
                <button onClick={() => islemBaslat("BORCLANDIRMA")} className="btn-primary whitespace-nowrap" style={{ background: "#dc2626" }}><i className="fas fa-cart-plus mr-1.5"></i> Yeni Borç Ekle</button>
                <button onClick={() => islemBaslat("TAHSILAT")} className="btn-primary whitespace-nowrap" style={{ background: "#059669" }}><i className="fas fa-hand-holding-usd mr-1.5"></i> Tahsilat Yap</button>
            </div>
          </div>
        </div>
          );
      })()}

      {/* --- MÜŞTERİ EKLEME MODALI --- */}
      {modalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-sm font-semibold flex items-center" style={{ color: "var(--c-text)" }}><i className="fas fa-user-plus mr-2" style={{ color: "#1d4ed8" }}></i> Yeni Müşteri Kaydı</h3>
              <button onClick={() => setModalAcik(false)} className="px-2" style={{ color: "var(--c-text-secondary)" }}><i className="fas fa-times"></i></button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto" style={{ background: "white" }}>
                <div>
                    <label className="text-[9px] font-semibold uppercase tracking-widest mb-0.5 block" style={{ color: "var(--c-text-muted)" }}>Müşteri Adı Soyadı</label>
                    <input type="text" value={musteriForm.ad_soyad} onChange={(e) => setMusteriForm({...musteriForm, ad_soyad: e.target.value})} className="input-kurumsal" style={{ padding: "0.75rem" }} placeholder="Örn: Ahmet Amca, Ayşe Teyze" />
                </div>
                <div>
                    <label className="text-[9px] font-semibold uppercase tracking-widest mb-0.5 block" style={{ color: "var(--c-text-muted)" }}>Telefon Numarası</label>
                    <input type="text" value={musteriForm.telefon} onChange={(e) => setMusteriForm({...musteriForm, telefon: e.target.value})} className="input-kurumsal" style={{ padding: "0.75rem" }} placeholder="İsteğe bağlı" />
                </div>
                <div>
                    <label className="text-[9px] font-semibold uppercase tracking-widest mb-0.5 block" style={{ color: "var(--c-text-muted)" }}>Adres / Açıklama</label>
                    <textarea value={musteriForm.adres} onChange={(e) => setMusteriForm({...musteriForm, adres: e.target.value})} className="input-kurumsal" style={{ padding: "0.75rem", resize: "none", height: 80 }} placeholder="Hangi apartman, bina vs."></textarea>
                </div>
            </div>

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setModalAcik(false)} className="btn-secondary whitespace-nowrap">İptal</button>
              <button onClick={musteriKaydet} className="btn-primary whitespace-nowrap"><i className="fas fa-check mr-2"></i> Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* --- İŞLEM (BORÇ/TAHSİLAT) MODALI --- */}
      {islemModalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-sm font-semibold flex items-center" style={{ color: "var(--c-text)" }}>
                  <i className={`fas ${islemTipi === 'BORCLANDIRMA' ? 'fa-cart-plus' : 'fa-hand-holding-usd'} mr-2`}></i>
                  {islemTipi === 'BORCLANDIRMA' ? 'Veresiye Yaz (Borçlandır)' : 'Ödeme Al (Tahsilat Yap)'}
              </h3>
              <button onClick={() => setIslemModalAcik(false)} className="px-2" style={{ color: "var(--c-text-secondary)" }}><i className="fas fa-times"></i></button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto" style={{ background: "white" }}>
                <div className="text-center mb-2">
                    <p className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "var(--c-text-muted)" }}>İşlem Yapılan Müşteri</p>
                    <h2 className="text-xl font-semibold" style={{ color: "var(--c-text)" }}>{musteriler.find(m => m.id === seciliMusteriId)?.ad_soyad}</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-[9px] font-semibold uppercase tracking-widest mb-0.5 block" style={{ color: "var(--c-text-muted)" }}>Tutar (TL)</label>
                        <input type="number" min="0" value={islemForm.tutar} onChange={(e) => setIslemForm({...islemForm, tutar: e.target.value})} className="input-kurumsal font-semibold text-3xl text-center" style={{ padding: "0.75rem", color: islemTipi === 'BORCLANDIRMA' ? '#dc2626' : '#059669', borderColor: islemTipi === 'BORCLANDIRMA' ? '#fecaca' : '#a7f3d0', borderWidth: 2 }} placeholder="0,00" />
                    </div>
                    <div className="col-span-2">
                        <label className="text-[9px] font-semibold uppercase tracking-widest mb-0.5 block" style={{ color: "var(--c-text-muted)" }}>İşlem Tarihi</label>
                        <input type="date" value={islemForm.tarih} onChange={(e) => setIslemForm({...islemForm, tarih: e.target.value})} className="input-kurumsal font-semibold" style={{ padding: "0.75rem", color: "var(--c-text)" }} />
                    </div>
                </div>

                <div>
                    <label className="text-[9px] font-semibold uppercase tracking-widest mb-0.5 block" style={{ color: "var(--c-text-muted)" }}>Açıklama (Ne alındı / Ne ödendi?)</label>
                    <textarea value={islemForm.aciklama} onChange={(e) => setIslemForm({...islemForm, aciklama: e.target.value})} className="input-kurumsal font-semibold" style={{ padding: "0.75rem", resize: "none", height: 80, color: "var(--c-text)" }}></textarea>
                </div>
            </div>

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setIslemModalAcik(false)} className="btn-secondary whitespace-nowrap">İptal</button>
              <button onClick={islemKaydet} className="btn-primary whitespace-nowrap" style={{ background: islemTipi === 'BORCLANDIRMA' ? '#dc2626' : '#059669' }}>
                  <i className="fas fa-check mr-2"></i> Hesaba İşle
              </button>
            </div>
          </div>
        </div>
      )}
      {/* HAREKET DETAY MODALI */}
      {detayHareket && (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
              <div className="bg-white border border-[#e2e8f0] w-full max-w-md flex flex-col max-h-[70vh]">
                  <div className="px-5 py-3 flex justify-between items-center shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div>
                          <div className="text-[13px] font-semibold text-[#0f172a]">İşlem Detayı — {new Date(detayHareket.tarih).toLocaleDateString("tr-TR")}</div>
                          <div className="text-[10px] text-[#64748b] mt-0.5">{acikMusteri?.ad_soyad}</div>
                      </div>
                      <button onClick={() => setDetayHareket(null)} className="text-[#64748b] hover:text-[#dc2626]"><i className="fas fa-times" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                      <div className="flex items-center gap-2 mb-4">
                          <span className={`badge-durum ${detayHareket.islem_tipi === "BORCLANDIRMA" ? "badge-kritik" : "badge-teslim"}`}>
                              {detayHareket.islem_tipi === "BORCLANDIRMA" ? "Veresiye" : "Tahsilat"}
                          </span>
                          <span className="text-[13px] font-semibold tabular-nums" style={{ color: detayHareket.islem_tipi === "BORCLANDIRMA" ? "#dc2626" : "#059669" }}>
                              {Number(detayHareket.tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL
                          </span>
                      </div>

                      {detayHareket.aciklama && (
                          <div className="text-[12px] text-[#475569] mb-4 p-3 bg-[#f8fafc] border border-slate-200">
                              <span className="text-[9px] font-semibold text-[#94a3b8] uppercase tracking-widest block mb-1">Açıklama</span>
                              {detayHareket.aciklama}
                          </div>
                      )}

                      {detayHareket.islem_tipi === "BORCLANDIRMA" && (
                          detayYukleniyor ? (
                              <div className="text-center py-4 text-[#94a3b8]"><i className="fas fa-circle-notch fa-spin mr-2" /> Ürünler yükleniyor...</div>
                          ) : detayKalemler.length > 0 ? (
                              <div>
                                  <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-widest mb-2">Satın Alınan Ürünler</div>
                                  <table className="tbl-kurumsal">
                                      <thead><tr><th>Ürün</th><th className="text-center w-16">Miktar</th><th className="text-right w-24">B.Fiyat</th><th className="text-right w-24">Tutar</th></tr></thead>
                                      <tbody>
                                          {detayKalemler.map((k, i) => (
                                              <tr key={i} className="bg-white">
                                                  <td className="font-semibold text-[#0f172a]">{k.urun_adi}</td>
                                                  <td className="text-center tabular-nums">{k.miktar}</td>
                                                  <td className="text-right tabular-nums">{Number(k.birim_fiyat).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                                                  <td className="text-right font-semibold tabular-nums text-[#0f172a]">{Number(k.toplam_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          ) : (
                              <div className="text-[11px] text-[#94a3b8] text-center py-3">Ürün detayı bulunamadı</div>
                          )
                      )}

                      {detayHareket.islem_tipi === "TAHSILAT" && (
                          <div className="text-center py-4">
                              <div className="w-12 h-12 bg-emerald-50 text-[#059669] flex items-center justify-center mx-auto mb-3"><i className="fas fa-hand-holding-usd text-xl" /></div>
                              <div className="text-[12px] text-[#64748b]">Nakit Ödeme</div>
                          </div>
                      )}

                      {detayHareket.islem_yapan && (
                          <div className="text-[10px] text-[#94a3b8] mt-4 pt-3" style={{ borderTop: "1px solid #f1f5f9" }}>
                              İşlemi yapan: <span className="font-semibold text-[#475569]">{detayHareket.islem_yapan}</span>
                          </div>
                      )}
                  </div>
                  {/* Print Şablonu (ekranda gizli) */}
                  <div id="print-veresiye-detay" className="hidden print:block p-8">
                      <div className="text-center mb-6" style={{ borderBottom: "2px solid #0f172a", paddingBottom: 12 }}>
                          <h1 className="text-lg font-bold uppercase">{aktifMusteri?.isletme_adi}</h1>
                          <h2 className="text-base font-semibold mt-2">VERESİYE İŞLEM DETAYI</h2>
                      </div>
                      <div className="flex justify-between mb-4 text-sm">
                          <div><strong>Müşteri:</strong> {acikMusteri?.ad_soyad}</div>
                          <div><strong>Tarih:</strong> {new Date(detayHareket.tarih).toLocaleDateString("tr-TR")}</div>
                      </div>
                      <div className="mb-2 text-sm"><strong>İşlem:</strong> {detayHareket.islem_tipi === "BORCLANDIRMA" ? "Veresiye Satış" : "Tahsilat"} — <strong>{Number(detayHareket.tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</strong></div>
                      {detayKalemler.length > 0 && (
                          <table className="w-full border-collapse mt-4 mb-6" style={{ fontSize: 11 }}>
                              <thead><tr style={{ borderBottom: "2px solid #333" }}><th className="text-left py-1">Ürün Adı</th><th className="text-center py-1 w-16">Miktar</th><th className="text-right py-1 w-24">B.Fiyat</th><th className="text-right py-1 w-24">Tutar</th></tr></thead>
                              <tbody>
                                  {detayKalemler.map((k, i) => <tr key={i} style={{ borderBottom: "1px solid #ccc" }}><td className="py-1">{k.urun_adi}</td><td className="text-center py-1">{k.miktar}</td><td className="text-right py-1">{Number(k.birim_fiyat).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td><td className="text-right py-1 font-bold">{Number(k.toplam_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</td></tr>)}
                              </tbody>
                          </table>
                      )}
                      <div className="text-right text-lg font-bold mt-4 p-3" style={{ border: "2px solid #0f172a" }}>TOPLAM: {Number(detayHareket.tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</div>
                      <div className="flex justify-between mt-16 pt-8">
                          <div className="text-center w-48" style={{ borderTop: "1px solid #333", paddingTop: 8 }}><p className="text-xs font-semibold">Teslim Eden</p></div>
                          <div className="text-center w-48" style={{ borderTop: "1px solid #333", paddingTop: 8 }}><p className="text-xs font-semibold">Teslim Alan</p><p className="text-[10px] text-[#64748b] mt-1">{acikMusteri?.ad_soyad}</p></div>
                      </div>
                  </div>

                  <div className="px-5 py-3 shrink-0 flex justify-between" style={{ borderTop: "1px solid var(--c-border)" }}>
                      <div className="flex gap-2">
                          <button onClick={() => window.print()} className="btn-primary flex items-center gap-1.5" style={{ background: "#3b82f6" }}><i className="fas fa-print text-[10px]" /> Yazdır</button>
                          <button onClick={detayIslemSil} className="btn-primary flex items-center gap-1.5" style={{ background: "#dc2626" }}><i className="fas fa-trash text-[10px]" /> Sil</button>
                      </div>
                      <button onClick={() => setDetayHareket(null)} className="btn-secondary">Kapat</button>
                  </div>
              </div>
          </div>
      )}

      <OnayModal />
    </>
  );
}
