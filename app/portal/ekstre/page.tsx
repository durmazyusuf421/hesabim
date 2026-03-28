"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

interface ToptanciBakiye {
  id: number;
  sahip_sirket_id: number;
  bagli_sirket_id: number;
  toptanci_adi?: string;
}

interface CariHareket {
  id: number;
  firma_id: number;
  tarih: string;
  evrak_no: string;
  islem_tipi: string;
  aciklama: string;
  borc: number;
  alacak: number;
}

export default function MusteriEkstre() {
  const { aktifSirket: aktifMusteri } = useAuth();
  const toast = useToast();

  const [toptanciBakiyeleri, setToptanciBakiyeleri] = useState<ToptanciBakiye[]>([]);
  const [seciliCariHesapId, setSeciliCariHesapId] = useState<string>("");
  const [hareketler, setHareketler] = useState<CariHareket[]>([]);

  useEffect(() => {
    if (!aktifMusteri) return;
    if (aktifMusteri.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
  }, [aktifMusteri]);

  async function bakiyeleriGetir() {
      if (!aktifMusteri) return;
      const { data: cariKartlar } = await supabase.from("firmalar").select("*").eq("bagli_sirket_id", aktifMusteri.id);
      if (cariKartlar && cariKartlar.length > 0) {
          const toptanciIdler = cariKartlar.map(c => c.sahip_sirket_id);
          const { data: toptancilar } = await supabase.from("sirketler").select("id, isletme_adi").in("id", toptanciIdler);
          const birlesik = cariKartlar.map(cari => {
              const toptanci = toptancilar?.find(t => t.id === cari.sahip_sirket_id);
              return { ...cari, toptanci_adi: toptanci?.isletme_adi };
          });
          setToptanciBakiyeleri(birlesik);
      }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (aktifMusteri) bakiyeleriGetir(); }, [aktifMusteri]);

  useEffect(() => {
      async function hareketleriGetir() {
          if (!seciliCariHesapId) { setHareketler([]); return; }
          const { data } = await supabase.from("cari_hareketler").select("*").eq("firma_id", seciliCariHesapId).order('tarih', { ascending: true }).order('id', { ascending: true });
          setHareketler(data || []);
      }
      hareketleriGetir();
  }, [seciliCariHesapId]);

  const seciliToptanciAd = toptanciBakiyeleri.find(t => t.id.toString() === seciliCariHesapId)?.toptanci_adi || "-";

  const toplamlar = useMemo(() => {
    let topBorc = 0;
    let topAlacak = 0;
    hareketler.forEach(h => {
      topBorc += Number(h.borc) || 0;
      topAlacak += Number(h.alacak) || 0;
    });
    const bakiye = topBorc - topAlacak;
    return { topBorc, topAlacak, bakiye };
  }, [hareketler]);

  if (!aktifMusteri) return <div className="h-full flex items-center justify-center font-semibold" style={{ background: "var(--c-bg)", color: "var(--c-text-muted)" }}>Yükleniyor...</div>;

  let yuruyenBakiye = 0;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
          {/* TOOLBAR */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
              <button onClick={() => window.print()} className="btn-secondary print:hidden">
                  <i className="fas fa-print mr-1"></i> Ekstre Yazdır
              </button>

              <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--c-text-secondary)" }}>Tedarikçi:</span>
              <select
                  value={seciliCariHesapId}
                  onChange={(e) => setSeciliCariHesapId(e.target.value)}
                  className="input-kurumsal print:hidden"
                  style={{ maxWidth: "28rem", flex: "1 1 auto" }}
              >
                  <option value="">-- Ekstresini Almak İstediğiniz Tedarikçiyi Seçin --</option>
                  {toptanciBakiyeleri.map(t => <option key={t.id} value={t.id}>{t.toptanci_adi}</option>)}
              </select>
          </div>

          {/* METRIC BAR */}
          <div className="metric-bar shrink-0">
              <div className="metric-block">
                  <div className="metric-label">Listelenen Hareket</div>
                  <div className="metric-value">{hareketler.length}</div>
              </div>
              <div className="metric-block">
                  <div className="metric-label">Toplam Borç</div>
                  <div className="metric-value negative">{toplamlar.topBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
              </div>
              <div className="metric-block">
                  <div className="metric-label">Toplam Alacak</div>
                  <div className="metric-value" style={{ color: "#34d399" }}>{toplamlar.topAlacak.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
              </div>
              <div className="metric-block">
                  <div className="metric-label">Güncel Bakiye</div>
                  <div className={`metric-value ${toplamlar.bakiye > 0 ? "negative" : ""}`}>
                      {Math.abs(toplamlar.bakiye).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL {toplamlar.bakiye > 0 ? '(Borç)' : toplamlar.bakiye < 0 ? '(Alacak)' : ''}
                  </div>
              </div>
          </div>

          {/* EKSTRE TABLOSU */}
          <div className="flex-1 overflow-auto relative" style={{ background: "white" }}>
              <div className="print:block hidden mb-4 pb-2 pt-4 px-4" style={{ borderBottom: "2px solid black" }}>
                  <h2 className="text-xl font-semibold uppercase">{seciliToptanciAd}</h2>
                  <h3 className="text-lg font-semibold mt-1">MÜŞTERİ HESAP EKSTRESİ (SURET)</h3>
                  <p className="text-sm font-semibold mt-2">Müşteri: {aktifMusteri.isletme_adi}</p>
              </div>

              <table className="tbl-kurumsal">
                  <thead>
                      <tr>
                          <th style={{ width: "6rem" }}>Tarih</th>
                          <th style={{ width: "8rem" }}>Evrak No</th>
                          <th style={{ width: "12rem" }}>İşlem Türü</th>
                          <th>Açıklama</th>
                          <th className="text-right" style={{ width: "8rem" }}>Borç (TL)</th>
                          <th className="text-right" style={{ width: "8rem" }}>Alacak (TL)</th>
                          <th className="text-right" style={{ width: "8rem" }}>Kalan Bakiye</th>
                      </tr>
                  </thead>
                  <tbody>
                      {!seciliCariHesapId ? (
                          <tr><td colSpan={7} className="p-8 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>LÜTFEN ÜSTTEN BİR TEDARİKÇİ SEÇİN</td></tr>
                      ) : hareketler.length === 0 ? (
                          <tr><td colSpan={7} className="p-8 text-center font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-muted)" }}>HESAP HAREKETİ BULUNMUYOR</td></tr>
                      ) : (
                          hareketler.map((h, index) => {
                              const borc = Number(h.borc) || 0;
                              const alacak = Number(h.alacak) || 0;
                              yuruyenBakiye += (borc - alacak);

                              return (
                                  <tr key={index}>
                                      <td>{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                                      <td>{h.evrak_no}</td>
                                      <td className="font-semibold">{h.islem_tipi}</td>
                                      <td>{h.aciklama}</td>
                                      <td className="text-right font-semibold text-[#dc2626]">{borc > 0 ? borc.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                      <td className="text-right font-semibold text-[#059669]">{alacak > 0 ? alacak.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                      <td className="text-right font-semibold text-[#1d4ed8]">{Math.abs(yuruyenBakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} {yuruyenBakiye > 0 ? '(B)' : yuruyenBakiye < 0 ? '(A)' : ''}</td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
          </div>

          {/* FOOTER STATUS BAR */}
          <div className="flex items-center justify-between px-4 shrink-0 print:hidden" style={{ height: "var(--footer-h)", background: "#0f172a", borderTop: "1px solid var(--c-border)", color: "var(--c-text-secondary)", fontSize: "10px", fontWeight: 600 }}>
              <span>Listelenen Hareket: {hareketler.length}</span>
              <span style={{ color: "#93c5fd" }}>Güncel Durum: {Math.abs(toplamlar.bakiye).toLocaleString('tr-TR')} TL {toplamlar.bakiye > 0 ? 'Borçlusunuz' : toplamlar.bakiye < 0 ? 'Alacaklısınız' : 'Kapalı'}</span>
          </div>
      </main>
  );
}
