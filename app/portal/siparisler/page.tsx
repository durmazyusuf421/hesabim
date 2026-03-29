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

  useEffect(() => {
    if (!aktifMusteri) return;
    if (aktifMusteri.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
  }, [aktifMusteri]);

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
  useEffect(() => { if (aktifMusteri) verileriGetir(); }, [aktifMusteri]);

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

  const getDurumBadge = (durum: string) => {
    let metni = "Bilinmiyor";
    let cls = "badge-durum badge-bekliyor";
    if (durum === "Onay Bekliyor") { metni = "Onay Bekliyor"; cls = "badge-durum badge-bekliyor"; }
    else if (durum === "YENI") { metni = "Yeni"; cls = "badge-durum badge-bekliyor"; }
    else if (durum === "HAZIRLANIYOR") { metni = "Hazırlaniyor"; cls = "badge-durum badge-hazirlaniyor"; }
    else if (durum === "TAMAMLANDI") { metni = "Tamamlandi"; cls = "badge-durum badge-teslim"; }
    else if (durum === "IPTAL") { metni = "Iptal Edildi"; cls = "badge-durum badge-iptal"; }
    else if (durum === "BITTI") { metni = "Tamamlandi"; cls = "badge-durum badge-teslim"; }
    else if (durum === "Onaylandi") { metni = "Onaylandi"; cls = "badge-durum badge-sevkiyat"; }
    return <span className={cls}>{metni}</span>;
  };

  if (!aktifMusteri) return <div className="h-full flex items-center justify-center font-semibold" style={{ background: "var(--c-bg)", color: "var(--c-text-muted)" }}>Yukleniyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>

          {/* SEKMELER + TOOLBAR */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
              <button onClick={() => setAktifSekme("YENI")} className={aktifSekme === "YENI" ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}>
                  Yeni Siparişler {siparisler.filter(s => ["Onay Bekliyor", "HAZIRLANIYOR", "YENI"].includes(s.durum)).length > 0 && <span className="ml-1.5 bg-[#dc2626] text-white text-[9px] font-semibold px-1.5 py-0.5 inline-block">{siparisler.filter(s => ["Onay Bekliyor", "HAZIRLANIYOR", "YENI"].includes(s.durum)).length}</span>}
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
                      {(aktifSekme === "YENI"
                          ? siparisler.filter(s => ["Onay Bekliyor", "HAZIRLANIYOR", "YENI"].includes(s.durum))
                          : siparisler.filter(s => ["TAMAMLANDI", "BITTI", "IPTAL", "Onaylandı"].includes(s.durum))
                      ).map((s) => {
                          const isSelected = seciliSiparisId === s.id;

                          return (
                              <tr key={s.id} onClick={() => setSeciliSiparisId(s.id)} onDoubleClick={incele} className={`cursor-pointer select-none ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'bg-white hover:bg-slate-50'}`}>
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

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
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
          </div>
        </div>
      )}
    </>
  );
}
