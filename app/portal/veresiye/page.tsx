"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

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
  const [kullaniciAdi, setKullaniciAdi] = useState<string>("");

  const [musteriler, setMusteriler] = useState<VeresiyeMusteri[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [toplamAlacak, setToplamAlacak] = useState(0);

  // MÜŞTERİ EKLEME/DÜZENLEME MODALI
  const [modalAcik, setModalAcik] = useState(false);
  const [seciliMusteriId, setSeciliMusteriId] = useState<number | null>(null);
  const [musteriForm, setMusteriForm] = useState({ ad_soyad: "", telefon: "", adres: "" });

  // İŞLEM (BORÇ/TAHSİLAT) MODALI
  const [islemModalAcik, setIslemModalAcik] = useState(false);
  const [islemTipi, setIslemTipi] = useState<"BORCLANDIRMA" | "TAHSILAT">("BORCLANDIRMA");
  const [islemForm, setIslemForm] = useState({ tutar: "", aciklama: "", tarih: new Date().toISOString().split('T')[0] });

  // YENİ: GEÇMİŞ / EKSTRE MODALI STATELERİ
  const [gecmisModalAcik, setGecmisModalAcik] = useState(false);
  const [musteriHareketleri, setMusteriHareketleri] = useState<VeresiyeHareket[]>([]);
  const [hareketYukleniyor, setHareketYukleniyor] = useState(false);

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

      if(window.confirm("Bu müşteriyi silmek istediğinize emin misiniz?")) {
          await supabase.from("veresiye_hareketler").delete().eq("musteri_id", seciliMusteriId);
          await supabase.from("veresiye_musteriler").delete().eq("id", seciliMusteriId);
          setSeciliMusteriId(null); if (aktifMusteri) verileriGetir(aktifMusteri.id);
          toast.success("Müşteri başarıyla silindi.");
      }
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

  const filtrelenmisMusteriler = musteriler.filter(m => m.ad_soyad.toLowerCase().includes(aramaTerimi.toLowerCase()));
  const acikMusteri = musteriler.find(m => m.id === seciliMusteriId);

  if (!aktifMusteri) return <div className="h-full flex items-center justify-center font-semibold" style={{ background: "var(--c-bg)", color: "var(--c-text-muted)" }}>Yükleniyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        {/* METRIC BAR */}
        <div className="metric-bar shrink-0">
          <div className="metric-block">
            <div className="metric-label">Toplam Alacak</div>
            <div className="metric-value">{toplamAlacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
          </div>
          <div className="metric-block">
            <div className="metric-label">Toplam Müşteri</div>
            <div className="metric-value">{filtrelenmisMusteriler.length}</div>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
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

        {/* DATA GRID */}
        <div className="flex-1 overflow-auto relative" style={{ background: "white" }}>
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
                                <tr key={m.id} onClick={() => setSeciliMusteriId(m.id)} onDoubleClick={() => gecmisiGor(m.id)} className="cursor-pointer select-none" style={isSelected ? { background: "#1d4ed8", color: "white" } : {}}>
                                    <td style={{ textAlign: "center" }}>{isSelected && <i className="fas fa-check-circle" style={{ color: "white" }}></i>}</td>
                                    <td className="font-semibold">
                                        <i className={`fas fa-user-circle mr-2 text-lg align-middle`} style={{ color: isSelected ? "rgba(255,255,255,0.5)" : "var(--c-border)" }}></i> {m.ad_soyad}
                                    </td>
                                    <td className="font-semibold">{m.telefon || '-'}</td>
                                    <td className="text-xs truncate" style={{ maxWidth: 200 }}>{m.adres || '-'}</td>
                                    <td className="font-semibold" style={{ textAlign: "right", color: isSelected ? "white" : (bakiye > 0 ? "#dc2626" : "#059669") }}>
                                        {bakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                        <button onClick={(e) => { e.stopPropagation(); gecmisiGor(m.id); }} className={isSelected ? "btn-primary" : "btn-secondary"} style={isSelected ? { background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)" } : {}}>
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

        {/* ALT DURUM ÇUBUĞU */}
        <div className="flex items-center justify-between px-4 shrink-0 print:hidden" style={{ height: 32, background: "var(--c-bg)", borderTop: "1px solid var(--c-border)", fontSize: 10, fontWeight: 600, color: "var(--c-text-secondary)" }}>
            <span>Toplam Müşteri: {filtrelenmisMusteriler.length}</span>
            <span>Toplam Alacak: {toplamAlacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
        </div>
      </main>

      {/* --- MÜŞTERİ GEÇMİŞİ (EKSTRE) MODALI --- */}
      {gecmisModalAcik && acikMusteri && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                <div>
                    <h3 className="text-sm font-semibold flex items-center" style={{ color: "var(--c-text)" }}>
                        <i className="fas fa-book-reader mr-2" style={{ color: "#1d4ed8" }}></i> {acikMusteri.ad_soyad} - Hesap Dökümü
                    </h3>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mt-1" style={{ color: "var(--c-text-muted)" }}>{acikMusteri.telefon} | {acikMusteri.adres}</p>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="text-right">
                        <p className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "var(--c-text-muted)" }}>Güncel Borç</p>
                        <p className="text-xl font-semibold leading-tight" style={{ color: Number(acikMusteri.bakiye) > 0 ? "#dc2626" : "#059669" }}>{Number(acikMusteri.bakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</p>
                    </div>
                    <button onClick={() => setGecmisModalAcik(false)} className="px-2" style={{ color: "var(--c-text-secondary)" }}><i className="fas fa-times"></i></button>
                </div>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto" style={{ background: "white" }}>
                <table className="tbl-kurumsal" style={{ minWidth: 600 }}>
                    <thead>
                        <tr>
                            <th style={{ width: 128, textAlign: "center" }}>İşlem Tarihi</th>
                            <th style={{ width: 128, textAlign: "center" }}>İşlem Tipi</th>
                            <th>Açıklama</th>
                            <th style={{ width: 128, textAlign: "right" }}>Tutar (TL)</th>
                            <th style={{ width: 128, textAlign: "center" }}>İşlemi Yapan</th>
                        </tr>
                    </thead>
                    <tbody>
                        {hareketYukleniyor ? (
                            <tr><td colSpan={5} className="p-8 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}><i className="fas fa-circle-notch fa-spin mr-2"></i> Geçmiş Yükleniyor...</td></tr>
                        ) : musteriHareketleri.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>Henüz hiçbir işlem yapılmamış.</td></tr>
                        ) : (
                            musteriHareketleri.map((h) => {
                                const isBorc = h.islem_tipi === 'BORCLANDIRMA';
                                return (
                                    <tr key={h.id}>
                                        <td className="font-semibold" style={{ textAlign: "center", color: "var(--c-text-secondary)" }}>{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                                        <td style={{ textAlign: "center" }}>
                                            <span className={`badge-durum ${isBorc ? 'badge-kritik' : 'badge-teslim'}`}>
                                                <i className={`fas ${isBorc ? 'fa-cart-arrow-down' : 'fa-hand-holding-usd'} mr-1`}></i> {isBorc ? 'Veresiye' : 'Tahsilat'}
                                            </span>
                                        </td>
                                        <td className="font-semibold truncate" style={{ maxWidth: 240, color: "var(--c-text)" }}>{h.aciklama || '-'}</td>
                                        <td className="font-semibold" style={{ textAlign: "right", color: isBorc ? "#dc2626" : "#059669" }}>
                                            {isBorc ? '+' : '-'}{Number(h.tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}
                                        </td>
                                        <td className="text-[10px] font-semibold uppercase" style={{ textAlign: "center", color: "var(--c-text-secondary)" }}>{h.islem_yapan}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                <button onClick={() => window.print()} className="btn-secondary whitespace-nowrap">
                    <i className="fas fa-print mr-2"></i> Ekstreyi Yazdır
                </button>
                <button onClick={() => islemBaslat("BORCLANDIRMA")} className="btn-primary whitespace-nowrap" style={{ background: "#dc2626" }}><i className="fas fa-cart-plus mr-1.5"></i> Yeni Borç Ekle</button>
                <button onClick={() => islemBaslat("TAHSILAT")} className="btn-primary whitespace-nowrap" style={{ background: "#059669" }}><i className="fas fa-hand-holding-usd mr-1.5"></i> Tahsilat Yap</button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}
