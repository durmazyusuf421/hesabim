"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

interface Siparis {
  id: number;
  siparis_no: string;
  satici_sirket_id: number;
  alici_firma_id: number;
  durum: string;
  toplam_tutar: number;
  created_at: string;
  toptanci_onay?: string;
  market_onay?: string;
  toptanci_notu?: string;
  red_sebebi?: string;
}

interface SiparisToptanci {
  id: number;
  isletme_adi: string;
}

interface SiparisKalemi {
  id: number;
  siparis_id: number;
  urun_adi: string;
  miktar: number;
  birim_fiyat: number;
}

interface FiyatArtis {
  urunId: number;
  urunAdi: string;
  eskiAlis: number;
  yeniAlis: number;
  artisYuzde: number;
  mevcutSatis: number;
}

export default function MusteriSiparisleri() {
  const { aktifSirket: aktifMusteri } = useAuth();
  const toast = useToast();

  const [siparisler, setSiparisler] = useState<Siparis[]>([]);
  const [toptancilar, setToptancilar] = useState<SiparisToptanci[]>([]);
  const [seciliSiparisId, setSeciliSiparisId] = useState<number | null>(null);
  const [aktifSekme, setAktifSekme] = useState<"YENI" | "GECMIS">("YENI");

  const [modalAcik, setModalAcik] = useState(false);
  const [seciliSiparis, setSeciliSiparis] = useState<Siparis | null>(null);
  const [siparisKalemleri, setSiparisKalemleri] = useState<SiparisKalemi[]>([]);
  const [onayIslem, setOnayIslem] = useState(false);

  // Fiyat artış modalı
  const [fiyatArtisModal, setFiyatArtisModal] = useState(false);
  const [fiyatArtislar, setFiyatArtislar] = useState<FiyatArtis[]>([]);
  const [fiyatGuncelleniyor, setFiyatGuncelleniyor] = useState(false);

  // Red sebebi modalı
  const [redModalAcik, setRedModalAcik] = useState(false);
  const [redSebebi, setRedSebebi] = useState("");
  const [redIslem, setRedIslem] = useState(false);

  const musteriId = aktifMusteri?.id;

  useEffect(() => {
    if (!musteriId) return;
    if (aktifMusteri.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
  }, [musteriId]);

  async function verileriGetir() {
      if (!aktifMusteri) return;
      const { data: toptanciData } = await supabase.from("sirketler").select("id, isletme_adi").eq("rol", "TOPTANCI");
      setToptancilar(toptanciData || []);

      const { data: cariKartlar } = await supabase.from("firmalar").select("id").eq("bagli_sirket_id", aktifMusteri.id);

      if (cariKartlar && cariKartlar.length > 0) {
          const cariIdler = cariKartlar.map(c => c.id);
          const { data: siparisData } = await supabase.from("siparisler").select("*").in("alici_firma_id", cariIdler).order('id', { ascending: false });
          setSiparisler(siparisData || []);
      }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (musteriId) verileriGetir(); }, [musteriId]);

  const incele = async () => {
      if (!seciliSiparisId) { toast.error("Lutfen listeden bir siparis secin!"); return; }
      const siparis = siparisler.find(s => s.id === seciliSiparisId);
      if (!siparis) { toast.error("Siparis bulunamadi!"); return; }
      setSeciliSiparis(siparis);
      const { data } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", siparis.id);
      setSiparisKalemleri(data || []);
      setModalAcik(true);
  };

  const toptanciAdiBul = (toptanciId: number) => toptancilar.find(t => t.id === toptanciId)?.isletme_adi || "Bilinmeyen";

  // --- MUTABAKAT: ONAYLA ---
  const siparisiOnayla = async () => {
      if (!seciliSiparis || !aktifMusteri) return;
      setOnayIslem(true);
      const tespit: FiyatArtis[] = [];
      const toplamTutar = Number(seciliSiparis.toplam_tutar);

      try {
          // ── ADIM 1: Sipariş durumunu güncelle ──
          const { error: sipErr } = await supabase.from("siparisler").update({
              market_onay: "ONAYLANDI",
              durum: "TAMAMLANDI"
          }).eq("id", seciliSiparis.id);
          if (sipErr) { toast.error("Sipariş durumu güncellenemedi: " + sipErr.message); setOnayIslem(false); return; }

          // ── ADIM 2: Sipariş kalemlerini çek ──
          const { data: kalemler, error: kalemErr } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", seciliSiparis.id);
          if (kalemErr) { toast.error("Sipariş kalemleri çekilemedi: " + kalemErr.message); setOnayIslem(false); return; }

          // ── ADIM 3: Market stoğu + alış fiyatı güncelle ──
          if (kalemler && kalemler.length > 0) {
              for (const kalem of kalemler) {
                  const urunAdi = kalem.urun_adi.replace(/\s*\(.*?\)\s*$/, '');
                  const birim = kalem.urun_adi.match(/\(([^)]+)\)\s*$/)?.[1] || "Adet";
                  const yeniAlisFiyati = Number(kalem.birim_fiyat);

                  const { data: marketUrun, error: stokErr } = await supabase.from("urunler")
                      .select("id, stok_miktari, alis_fiyati, satis_fiyati")
                      .eq("sahip_sirket_id", aktifMusteri.id)
                      .ilike("urun_adi", urunAdi)
                      .limit(1);

                  if (stokErr) { toast.error(`Stok sorgulanamadı (${urunAdi}): ` + stokErr.message); continue; }

                  if (marketUrun && marketUrun.length > 0) {
                      // ── Mevcut ürün var ──
                      const u = marketUrun[0];
                      const eskiAlis = Number(u.alis_fiyati || 0);
                      const yeniStok = Number(u.stok_miktari || 0) + Number(kalem.miktar);

                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const guncellemeler: Record<string, any> = {
                          stok_miktari: yeniStok,
                          alis_fiyati: yeniAlisFiyati
                      };

                      // Önceki alış fiyatını sakla
                      if (eskiAlis > 0) {
                          guncellemeler.onceki_alis_fiyati = eskiAlis;
                      }

                      // Fiyat artış kontrolü
                      if (eskiAlis > 0 && yeniAlisFiyati > eskiAlis) {
                          const artisYuzde = ((yeniAlisFiyati - eskiAlis) / eskiAlis) * 100;
                          tespit.push({
                              urunId: u.id,
                              urunAdi,
                              eskiAlis,
                              yeniAlis: yeniAlisFiyati,
                              artisYuzde: Math.round(artisYuzde * 10) / 10,
                              mevcutSatis: Number(u.satis_fiyati || 0)
                          });
                      }

                      const { error: upErr } = await supabase.from("urunler").update(guncellemeler).eq("id", u.id);
                      if (upErr) { toast.error(`Stok güncellenemedi (${urunAdi}): ` + upErr.message); }
                  } else {
                      // ── Ürün yok — yeni stok kartı oluştur ──
                      const { error: insErr } = await supabase.from("urunler").insert([{
                          sahip_sirket_id: aktifMusteri.id,
                          urun_adi: urunAdi,
                          birim: birim,
                          stok_miktari: Number(kalem.miktar),
                          satis_fiyati: Math.round(yeniAlisFiyati * 1.10 * 100) / 100,
                          alis_fiyati: yeniAlisFiyati,
                          onceki_alis_fiyati: 0
                      }]);
                      if (insErr) { toast.error(`Yeni stok kartı oluşturulamadı (${urunAdi}): ` + insErr.message); }
                  }
              }
          }

          // ── ADIM 4: İKİ TARAF bakiye güncelle ──

          // A) Toptancı tarafı: market'in toptancıdaki cari kartı (borç artar)
          const { data: toptanciCari } = await supabase.from("firmalar")
              .select("id, bakiye")
              .eq("sahip_sirket_id", seciliSiparis.satici_sirket_id)
              .eq("bagli_sirket_id", aktifMusteri.id)
              .single();

          if (toptanciCari) {
              const yeniBakiye = Number(toptanciCari.bakiye || 0) + toplamTutar;
              const { error } = await supabase.from("firmalar").update({ bakiye: yeniBakiye }).eq("id", toptanciCari.id);
              if (error) { toast.error("Toptancı tarafı bakiye güncellenemedi: " + error.message); }
          } else {
              toast.error("Toptancı tarafında cari kart bulunamadı.");
          }

          // B) Market tarafı: toptancının marketteki cari kartı (borç artar)
          const { data: marketCari } = await supabase.from("firmalar")
              .select("id, bakiye")
              .eq("sahip_sirket_id", aktifMusteri.id)
              .eq("bagli_sirket_id", seciliSiparis.satici_sirket_id)
              .maybeSingle();

          if (marketCari) {
              const yeniBakiye = Number(marketCari.bakiye || 0) + toplamTutar;
              const { error } = await supabase.from("firmalar").update({ bakiye: yeniBakiye }).eq("id", marketCari.id);
              if (error) { toast.error("Market tarafı bakiye güncellenemedi: " + error.message); }
          }
          // Market tarafında cari kart yoksa sorun değil — her markette toptancı cari kartı olmayabilir

          // ── TAMAMLANDI ──
          toast.success("Sipariş onaylandı, stoklar güncellendi!");
          setModalAcik(false);
          verileriGetir();

          // Fiyat artışı varsa uyarı modalını aç
          if (tespit.length > 0) {
              setFiyatArtislar(tespit);
              setFiyatArtisModal(true);
          }
      } catch (error) {
          toast.error("Onay hatası: " + (error instanceof Error ? error.message : String(error)));
      }
      setOnayIslem(false);
  };

  // --- SATIŞ FİYATI GÜNCELLE (mevcut satış fiyatına %10 ekle) ---
  const satisFiyatiGuncelle = async () => {
      setFiyatGuncelleniyor(true);
      try {
          for (const artis of fiyatArtislar) {
              // Mevcut satış fiyatına %10 ekle
              const yeniSatisFiyati = Math.round(artis.mevcutSatis * 1.10 * 100) / 100;
              const { error } = await supabase.from("urunler").update({ satis_fiyati: yeniSatisFiyati }).eq("id", artis.urunId);
              if (error) { toast.error(`Satış fiyatı güncellenemedi (${artis.urunAdi}): ` + error.message); }
          }
          toast.success("Satış fiyatları güncellendi!");
          setFiyatArtisModal(false);
          setFiyatArtislar([]);
      } catch (error) {
          toast.error("Fiyat güncelleme hatası: " + (error instanceof Error ? error.message : String(error)));
      }
      setFiyatGuncelleniyor(false);
  };

  // --- MUTABAKAT: REDDET ---
  const redModalAc = () => {
      setRedSebebi("");
      setRedModalAcik(true);
  };

  const siparisiReddet = async () => {
      if (!seciliSiparis) return;
      if (redSebebi.trim().length < 10) { toast.error("Lütfen en az 10 karakter red sebebi yazınız!"); return; }
      setRedIslem(true);
      try {
          const { error } = await supabase.from("siparisler").update({
              market_onay: "REDDEDILDI",
              durum: "IPTAL",
              red_sebebi: redSebebi.trim()
          }).eq("id", seciliSiparis.id);

          if (error) { toast.error("Red işlemi başarısız: " + error.message); setRedIslem(false); return; }

          toast.success("Sipariş reddedildi.");
          setRedModalAcik(false);
          setModalAcik(false);
          verileriGetir();
      } catch (error) {
          toast.error("Red hatası: " + (error instanceof Error ? error.message : String(error)));
      }
      setRedIslem(false);
  };

  const getDurumBadge = (durum: string) => {
    let metni = "Bilinmiyor";
    let cls = "badge-durum badge-bekliyor";
    if (durum === "Onay Bekliyor") { metni = "Onay Bekliyor"; cls = "badge-durum badge-bekliyor"; }
    else if (durum === "YENI") { metni = "Yeni"; cls = "badge-durum badge-bekliyor"; }
    else if (durum === "HAZIRLANIYOR") { metni = "Hazırlaniyor"; cls = "badge-durum badge-hazirlaniyor"; }
    else if (durum === "MARKET_ONAYI_BEKLENIYOR") { metni = "Onayınız Bekleniyor"; cls = "badge-durum badge-hazirlaniyor"; }
    else if (durum === "TAMAMLANDI") { metni = "Tamamlandi"; cls = "badge-durum badge-teslim"; }
    else if (durum === "IPTAL") { metni = "Iptal Edildi"; cls = "badge-durum badge-iptal"; }
    else if (durum === "BITTI") { metni = "Tamamlandi"; cls = "badge-durum badge-teslim"; }
    else if (durum === "Onaylandi") { metni = "Onaylandi"; cls = "badge-durum badge-sevkiyat"; }
    return <span className={cls}>{metni}</span>;
  };

  if (!aktifMusteri) return <div className="h-full flex items-center justify-center font-semibold" style={{ background: "var(--c-bg)", color: "var(--c-text-muted)" }}>Yukleniyor...</div>;

  const yeniSiparisler = siparisler.filter(s => ["Onay Bekliyor", "HAZIRLANIYOR", "YENI", "MARKET_ONAYI_BEKLENIYOR"].includes(s.durum));
  const gecmisSiparisler = siparisler.filter(s => ["TAMAMLANDI", "BITTI", "IPTAL", "Onaylandı"].includes(s.durum));
  const onayBekleyenSayisi = siparisler.filter(s => s.durum === "MARKET_ONAYI_BEKLENIYOR").length;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>

          {/* SEKMELER + TOOLBAR */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
              <button onClick={() => setAktifSekme("YENI")} className={aktifSekme === "YENI" ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}>
                  Yeni Siparişler {yeniSiparisler.length > 0 && <span className="ml-1.5 bg-[#dc2626] text-white text-[9px] font-semibold px-1.5 py-0.5 inline-block">{yeniSiparisler.length}</span>}
              </button>
              <button onClick={() => setAktifSekme("GECMIS")} className={aktifSekme === "GECMIS" ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}>
                  Geçmiş Siparişler
              </button>
              <div className="w-px h-6" style={{ background: "var(--c-border)" }}></div>
              <Link href="/portal" className="btn-primary flex items-center whitespace-nowrap">
                  <i className="fas fa-plus mr-2"></i> Yeni Siparis Olustur
              </Link>
              <div className="w-px h-6" style={{ background: "var(--c-border)" }}></div>
              <button onClick={incele} className="btn-secondary flex items-center whitespace-nowrap">
                  <i className="fas fa-search mr-2" style={{ color: "#1d4ed8" }}></i> Incele / Goruntule
              </button>
              <div className="w-px h-6" style={{ background: "var(--c-border)" }}></div>
              <button onClick={() => window.print()} className="btn-secondary flex items-center whitespace-nowrap">
                  <i className="fas fa-print mr-2" style={{ color: "var(--c-text-secondary)" }}></i> Yazdir
              </button>
          </div>

          {/* ONAY BEKLENİYOR UYARISI */}
          {onayBekleyenSayisi > 0 && (
              <div className="mx-4 mt-2 p-3 bg-amber-50 flex items-center gap-3" style={{ border: "1px solid #fbbf24" }}>
                  <div className="w-8 h-8 bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><i className="fas fa-exclamation-triangle"></i></div>
                  <div className="flex-1">
                      <div className="text-[12px] font-semibold text-amber-800"><span className="font-bold text-[#dc2626]">{onayBekleyenSayisi}</span> adet sipariş onayınızı bekliyor</div>
                      <div className="text-[10px] text-amber-600">Toptancınız sipariş kalemlerini düzenledi. Lütfen kontrol edip onaylayın veya reddedin.</div>
                  </div>
              </div>
          )}

          <div className="flex items-center px-4 shrink-0 space-x-4 print:hidden" style={{ height: "2.5rem", borderBottom: "1px solid var(--c-border)", background: "var(--c-bg)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--c-text-secondary)" }}>Siparis Fislerim</span>
          </div>

          <div className="flex-1 overflow-auto relative" style={{ background: "white" }}>
              <table className="tbl-kurumsal min-w-[600px]">
                  <thead>
                      <tr>
                          <th className="w-8 text-center"><i className="fas fa-caret-down"></i></th>
                          <th className="w-32">Fis No</th>
                          <th>Tedarikci Firma</th>
                          <th className="w-32 text-center">Tarih</th>
                          <th className="w-40 text-center">Durum</th>
                          <th className="w-40 text-right">Tutar (TL)</th>
                      </tr>
                  </thead>
                  <tbody>
                      {(aktifSekme === "YENI" ? yeniSiparisler : gecmisSiparisler).map((s) => {
                          const isSelected = seciliSiparisId === s.id;
                          const isOnayBekliyor = s.durum === "MARKET_ONAYI_BEKLENIYOR";

                          return (
                              <tr key={s.id} onClick={() => setSeciliSiparisId(s.id)} onDoubleClick={incele} className={`cursor-pointer select-none ${isOnayBekliyor ? 'bg-amber-50 border-l-2 border-amber-500' : isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'bg-white hover:bg-slate-50'}`}>
                                  <td className="text-center">{isSelected && <i className="fas fa-caret-right text-blue-500"></i>}</td>
                                  <td>{s.siparis_no}</td>
                                  <td className="font-semibold">{toptanciAdiBul(s.satici_sirket_id)}</td>
                                  <td className="text-center">{new Date(s.created_at).toLocaleDateString('tr-TR')}</td>
                                  <td className="text-center">{getDurumBadge(s.durum)}</td>
                                  <td className="text-right font-semibold tabular-nums">{Number(s.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </main>

      {/* SİPARİŞ DETAY MODAL */}
      {modalAcik && seciliSiparis && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-sm font-semibold flex items-center" style={{ color: "var(--c-text)" }}><i className="fas fa-file-invoice mr-2 text-sm" style={{ color: "#1d4ed8" }}></i> Siparis Fisi Inceleme</h3>
              <div className="flex space-x-2">
                 <button onClick={() => window.print()} className="btn-secondary flex items-center whitespace-nowrap"><i className="fas fa-print mr-1"></i> Yazdir</button>
                 <button onClick={() => setModalAcik(false)} className="px-2 hover:text-[#dc2626]" style={{ color: "var(--c-text-muted)" }}><i className="fas fa-times"></i></button>
              </div>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto" style={{ background: "white" }}>
                <div className="print:block hidden mb-4 pb-2" style={{ borderBottom: "2px solid black" }}>
                    <h2 className="text-xl font-semibold uppercase">{toptanciAdiBul(seciliSiparis.satici_sirket_id)}</h2>
                    <h3 className="text-lg font-semibold mt-1">SIPARIS FISI (SURET)</h3>
                </div>
                <div className="flex space-x-8">
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center"><label className="w-24 text-xs font-semibold" style={{ color: "var(--c-text-secondary)" }}>Fis No</label><input type="text" value={seciliSiparis.siparis_no} disabled className="input-kurumsal flex-1 font-semibold print:border-none" style={{ background: "#f8fafc" }} /></div>
                        <div className="flex items-center"><label className="w-24 text-xs font-semibold" style={{ color: "var(--c-text-secondary)" }}>Tedarikci</label><input type="text" value={toptanciAdiBul(seciliSiparis.satici_sirket_id)} disabled className="input-kurumsal flex-1 font-semibold print:border-none" style={{ background: "#f8fafc" }} /></div>
                    </div>
                </div>

                {/* TOPTANCI NOTU */}
                {seciliSiparis.toptanci_notu && (
                    <div className="p-3 bg-blue-50" style={{ border: "1px solid #93c5fd" }}>
                        <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest mb-1"><i className="fas fa-comment-alt mr-1"></i> Toptancı Notu</div>
                        <div className="text-[12px] font-semibold text-blue-800">{seciliSiparis.toptanci_notu}</div>
                    </div>
                )}

                {/* MARKET ONAYI BEKLENIYOR BANNER */}
                {seciliSiparis.durum === "MARKET_ONAYI_BEKLENIYOR" && (
                    <div className="p-3 bg-amber-50" style={{ border: "1px solid #fbbf24" }}>
                        <div className="text-[11px] font-semibold text-amber-800 flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle text-amber-500"></i>
                            Toptancınız bu siparişi düzenledi. Aşağıdaki güncel miktar ve fiyatları kontrol edip onaylayın veya reddedin.
                        </div>
                    </div>
                )}

                <div className="overflow-auto">
                    <table className="tbl-kurumsal" style={{ border: "1px solid var(--c-border)" }}>
                        <thead>
                            <tr>
                                <th className="w-8 text-center print:hidden">#</th>
                                <th>Stok Adi / Aciklama</th>
                                <th className="w-24 text-center">Miktar</th>
                                <th className="w-32 text-right">Birim Fiyat</th>
                                <th className="w-32 text-right">Tutar (TL)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {siparisKalemleri.map((item, index) => (
                                <tr key={index}>
                                    <td className="text-center print:hidden" style={{ color: "var(--c-text-muted)" }}>{index + 1}</td>
                                    <td className="font-semibold">{item.urun_adi}</td>
                                    <td className="text-center font-semibold">{item.miktar}</td>
                                    <td className="text-right">{item.birim_fiyat}</td>
                                    <td className="text-right font-semibold tabular-nums">{(item.miktar * item.birim_fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="p-3 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                {seciliSiparis.durum === "MARKET_ONAYI_BEKLENIYOR" ? (
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                        <div className="card-kurumsal p-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold uppercase mr-4" style={{ color: "var(--c-text)" }}>Genel Toplam</span>
                                <span className="text-lg font-semibold" style={{ color: "#1d4ed8" }}>{Number(seciliSiparis.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={redModalAc} disabled={onayIslem} className="px-4 py-2 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                                <i className="fas fa-times-circle mr-1.5"></i> Reddet
                            </button>
                            <button onClick={siparisiOnayla} disabled={onayIslem} className="btn-primary disabled:opacity-50" style={{ background: "#059669" }}>
                                <i className="fas fa-check-circle mr-1.5"></i> {onayIslem ? "İşleniyor..." : "Onayla"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-end">
                        <div className="card-kurumsal p-2 w-64">
                            <div className="flex justify-between items-center pb-1 mb-1" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--c-text-muted)" }}>Ara Toplam</span>
                                <span className="text-xs font-semibold" style={{ color: "var(--c-text)" }}>{Number(seciliSiparis.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold uppercase" style={{ color: "var(--c-text)" }}>Genel Toplam</span>
                                <span className="text-lg font-semibold" style={{ color: "#1d4ed8" }}>{Number(seciliSiparis.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* FİYAT ARTIŞ UYARI MODAL */}
      {fiyatArtisModal && fiyatArtislar.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-full max-w-md overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-5 text-center" style={{ background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
                <div className="w-16 h-16 bg-amber-100 text-amber-500 flex items-center justify-center text-3xl mx-auto mb-3">
                    <i className="fas fa-chart-line"></i>
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Fiyat Artışı Tespit Edildi!</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">Aşağıdaki ürünlerde alış fiyatı artışı var</p>
            </div>

            <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                {fiyatArtislar.map((artis, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50" style={{ border: "1px solid var(--c-border)" }}>
                        <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-slate-800 truncate">{artis.urunAdi}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                <span className="text-slate-400">{artis.eskiAlis.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                                <i className="fas fa-arrow-right mx-2 text-[8px] text-amber-500"></i>
                                <span className="font-semibold text-slate-800">{artis.yeniAlis.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                                Mevcut satış: {artis.mevcutSatis.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                <i className="fas fa-arrow-right mx-1 text-[7px]"></i>
                                Yeni satış: {(Math.round(artis.mevcutSatis * 1.10 * 100) / 100).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                            </div>
                        </div>
                        <span className="ml-3 px-2 py-1 bg-[#dc2626] text-white text-[10px] font-bold shrink-0">%{artis.artisYuzde}</span>
                    </div>
                ))}
            </div>

            <div className="p-4 space-y-2" style={{ borderTop: "1px solid var(--c-border)", background: "#f8fafc" }}>
                <button
                    onClick={satisFiyatiGuncelle}
                    disabled={fiyatGuncelleniyor}
                    className="btn-primary w-full py-3 text-xs disabled:opacity-50"
                    style={{ background: "#059669" }}
                >
                    <i className="fas fa-check mr-2"></i> {fiyatGuncelleniyor ? "Güncelleniyor..." : "Evet, Satış Fiyatına %10 Ekle"}
                </button>
                <button
                    onClick={() => { setFiyatArtisModal(false); setFiyatArtislar([]); }}
                    className="btn-secondary w-full py-3 text-xs uppercase tracking-widest"
                >
                    Hayır, Şimdilik Geç
                </button>
            </div>
          </div>
        </div>
      )}

      {/* RED SEBEBİ MODAL */}
      {redModalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-full max-w-md overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-4 flex items-center gap-3" style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca" }}>
                <div className="w-10 h-10 bg-red-100 text-red-500 flex items-center justify-center shrink-0"><i className="fas fa-times-circle text-lg"></i></div>
                <div>
                    <h3 className="text-sm font-semibold text-slate-800">Sipariş Reddetme Sebebi</h3>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Red sebebi toptancıya iletilecektir</p>
                </div>
            </div>

            <div className="p-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Reddetme Sebebi <span className="text-red-500">*</span></label>
                <textarea
                    value={redSebebi}
                    onChange={(e) => setRedSebebi(e.target.value)}
                    placeholder="Reddetme sebebinizi yazınız... (en az 10 karakter)"
                    className="input-kurumsal w-full"
                    rows={4}
                />
                <div className="flex justify-between mt-1.5">
                    <span className={`text-[10px] font-semibold ${redSebebi.trim().length < 10 ? 'text-red-400' : 'text-emerald-500'}`}>
                        {redSebebi.trim().length} / min 10 karakter
                    </span>
                </div>
            </div>

            <div className="p-4 flex justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)", background: "#f8fafc" }}>
                <button onClick={() => setRedModalAcik(false)} className="btn-secondary text-xs">
                    <i className="fas fa-arrow-left mr-1.5"></i> İptal
                </button>
                <button onClick={siparisiReddet} disabled={redIslem} className="px-4 py-2 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                    <i className="fas fa-times-circle mr-1.5"></i> {redIslem ? "İşleniyor..." : "Siparişi Reddet"}
                </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
