"use client";
export const dynamic = "force-dynamic";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";

interface FaturaRow {
    id: number; sirket_id: number; cari_id: number; fatura_no: string;
    tip: "GELEN" | "GIDEN"; tarih: string; ara_toplam: number;
    kdv_toplam: number; genel_toplam: number; durum: string; cari_adi?: string;
}
interface DetayRow {
    id: number; fatura_id: number; urun_adi: string; miktar: number;
    birim: string; birim_fiyat: number; kdv_orani: number;
}

export default function FaturaYazdirSayfasi() {
    const params = useParams();
    const router = useRouter();
    const { aktifSirket } = useAuth();
    const faturaId = Number(params.id);

    const [fatura, setFatura] = useState<FaturaRow | null>(null);
    const [detaylar, setDetaylar] = useState<DetayRow[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);

    const [hata, setHata] = useState<string | null>(null);

    useEffect(() => {
        if (!faturaId || !aktifSirket?.id) return;
        (async () => {
            try {
                const { data: f, error: fErr } = await supabase.from("faturalar").select("*").eq("id", faturaId).eq("sirket_id", aktifSirket.id).single();
                if (fErr || !f) { setHata(fErr?.message || "Fatura bulunamadı."); setYukleniyor(false); return; }
                setFatura(f as FaturaRow);
                const { data: d, error: dErr } = await supabase.from("fatura_detaylari").select("*").eq("fatura_id", faturaId);
                if (dErr) { setHata(dErr.message); setYukleniyor(false); return; }
                setDetaylar((d || []) as DetayRow[]);
            } catch (e: any) {
                setHata(e?.message || "Beklenmeyen hata oluştu.");
            } finally {
                setYukleniyor(false);
            }
        })();
    }, [faturaId, aktifSirket?.id]);

    useEffect(() => {
        if (fatura) {
            setTimeout(() => { window.print(); }, 800);
        }
    }, [fatura]);

    if (yukleniyor) return <div style={{ textAlign: "center", padding: 60, fontSize: 18, color: "#64748b" }}>Fatura yükleniyor...</div>;
    if (hata) return <div style={{ textAlign: "center", padding: 60, fontSize: 18, color: "#ef4444" }}>Hata: {hata}</div>;
    if (!fatura) return <div style={{ textAlign: "center", padding: 60, fontSize: 18, color: "#ef4444" }}>Fatura bulunamadı.</div>;

    const fmt = (v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tarihStr = new Date(fatura.tarih).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const firmaAdi = aktifSirket?.isletme_adi || aktifSirket?.unvan || "Firma";
    const firmaAdres = [aktifSirket?.adres, [aktifSirket?.ilce, aktifSirket?.il].filter(Boolean).join("/")].filter(Boolean).join(", ");
    const firmaVergi = [aktifSirket?.vergi_dairesi ? `V.D.: ${aktifSirket.vergi_dairesi}` : "", aktifSirket?.vergi_no ? `V.K.N.: ${aktifSirket.vergi_no}` : ""].filter(Boolean).join(" · ");
    const firmaTel = aktifSirket?.telefon ? `Tel: ${aktifSirket.telefon}` : "";
    const cariAdi = fatura.cari_adi || "-";
    const faturaTipiLabel = fatura.tip === "GIDEN" ? "Satış Faturası" : "Alış Faturası";

    const araToplamHesapla = () => detaylar.reduce((t, k) => t + k.miktar * k.birim_fiyat, 0);
    const kdvToplamHesapla = () => detaylar.reduce((t, k) => t + (k.miktar * k.birim_fiyat * k.kdv_orani / 100), 0);
    const genelToplamHesapla = () => araToplamHesapla() + kdvToplamHesapla();

    return (
        <div style={{ minHeight: "100vh", background: "white" }}>
            <style>{`
                @page { size: A4; margin: 15mm; }
                @media print {
                    .no-print { display: none !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body { margin: 0 !important; }
                }
            `}</style>

            <div style={{ maxWidth: "210mm", margin: "0 auto", padding: "15mm", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10pt", color: "#1a1a1a" }}>
                {/* HEADER */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottom: "2px solid #1e3a5f" }}>
                    <div style={{ maxWidth: "55%" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a5f", lineHeight: 1.2, letterSpacing: 0.3 }}>{firmaAdi}</div>
                        {firmaAdres && <div style={{ fontSize: 9, color: "#64748b", marginTop: 5, lineHeight: 1.5 }}>{firmaAdres}</div>}
                        {firmaVergi && <div style={{ fontSize: 9, color: "#64748b", lineHeight: 1.5 }}>{firmaVergi}</div>}
                        {firmaTel && <div style={{ fontSize: 9, color: "#64748b", lineHeight: 1.5 }}>{firmaTel}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 26, fontWeight: 800, color: "#1e3a5f", letterSpacing: 3 }}>FATURA</div>
                        <table style={{ width: "auto", marginLeft: "auto", marginTop: 8, fontSize: 10 }}>
                            <tbody>
                                <tr><td style={{ padding: "2px 10px 2px 0", color: "#64748b", fontWeight: 600, textAlign: "left" }}>Fatura No:</td><td style={{ padding: "2px 0", fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{fatura.fatura_no}</td></tr>
                                <tr><td style={{ padding: "2px 10px 2px 0", color: "#64748b", fontWeight: 600, textAlign: "left" }}>Tarih:</td><td style={{ padding: "2px 0", fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{tarihStr}</td></tr>
                                <tr><td style={{ padding: "2px 10px 2px 0", color: "#64748b", fontWeight: 600, textAlign: "left" }}>Vade:</td><td style={{ padding: "2px 0", fontWeight: 600, color: "#94a3b8", textAlign: "right" }}>-</td></tr>
                            </tbody>
                        </table>
                        <div style={{ fontSize: 8, color: "#94a3b8", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{faturaTipiLabel}</div>
                    </div>
                </div>

                {/* MÜŞTERİ BİLGİLERİ */}
                <div className="no-break" style={{ display: "flex", gap: 20, marginTop: 18, marginBottom: 22 }}>
                    <div style={{ flex: 1, background: "#f8fafc", padding: "14px 16px", border: "1px solid #e2e8f0", borderTop: "3px solid #1e3a5f" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>SAYIN:</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{cariAdi}</div>
                    </div>
                    <div style={{ flex: 1, background: "#f8fafc", padding: "14px 16px", border: "1px solid #e2e8f0", borderTop: "3px solid #1e3a5f" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>ÖDEME BİLGİSİ</div>
                        <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.6 }}>Ödeme Şekli: -</div>
                    </div>
                </div>

                {/* KALEMLER TABLOSU */}
                <table className="no-break" style={{ fontSize: 10, width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "#1e3a5f", color: "#ffffff" }}>
                            <th style={{ padding: "10px 8px", textAlign: "center", width: 30, fontWeight: 700, fontSize: 9 }}>#</th>
                            <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 700, fontSize: 9 }}>ÜRÜN / HİZMET ADI</th>
                            <th style={{ padding: "10px 8px", textAlign: "center", width: 55, fontWeight: 700, fontSize: 9 }}>MİKTAR</th>
                            <th style={{ padding: "10px 8px", textAlign: "center", width: 50, fontWeight: 700, fontSize: 9 }}>BİRİM</th>
                            <th style={{ padding: "10px 8px", textAlign: "right", width: 85, fontWeight: 700, fontSize: 9 }}>BİRİM FİYAT</th>
                            <th style={{ padding: "10px 8px", textAlign: "center", width: 45, fontWeight: 700, fontSize: 9 }}>KDV%</th>
                            <th style={{ padding: "10px 8px", textAlign: "right", width: 95, fontWeight: 700, fontSize: 9 }}>TUTAR</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detaylar.map((k, i) => {
                            const araTutar = k.miktar * k.birim_fiyat;
                            const toplamTutar = araTutar + araTutar * (k.kdv_orani / 100);
                            return (
                                <tr key={k.id} style={{ background: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                                    <td style={{ padding: "9px 8px", textAlign: "center", color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #e8ecf1" }}>{i + 1}</td>
                                    <td style={{ padding: "9px 8px", fontWeight: 500, color: "#1e293b", borderBottom: "1px solid #e8ecf1" }}>{k.urun_adi}</td>
                                    <td style={{ padding: "9px 8px", textAlign: "center", fontWeight: 600, color: "#334155", borderBottom: "1px solid #e8ecf1" }}>{k.miktar}</td>
                                    <td style={{ padding: "9px 8px", textAlign: "center", color: "#64748b", textTransform: "uppercase", fontSize: 10, borderBottom: "1px solid #e8ecf1" }}>{k.birim}</td>
                                    <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 600, color: "#334155", borderBottom: "1px solid #e8ecf1" }}>{fmt(k.birim_fiyat)}</td>
                                    <td style={{ padding: "9px 8px", textAlign: "center", color: "#64748b", borderBottom: "1px solid #e8ecf1" }}>%{k.kdv_orani}</td>
                                    <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #e8ecf1" }}>{fmt(toplamTutar)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* TOPLAM BÖLÜMÜ */}
                <div className="no-break" style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                    <div style={{ width: 280 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #e2e8f0", fontSize: 11 }}>
                            <span style={{ color: "#64748b", fontWeight: 600 }}>Ara Toplam</span>
                            <span style={{ fontWeight: 700, color: "#334155" }}>{fmt(araToplamHesapla())} TL</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #e2e8f0", fontSize: 11 }}>
                            <span style={{ color: "#64748b", fontWeight: 600 }}>KDV Toplam</span>
                            <span style={{ fontWeight: 700, color: "#ea580c" }}>{fmt(kdvToplamHesapla())} TL</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: 12, fontSize: 15, background: "#1e3a5f", color: "#ffffff", marginTop: 6 }}>
                            <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>GENEL TOPLAM</span>
                            <span style={{ fontWeight: 800 }}>{fmt(genelToplamHesapla())} TL</span>
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="no-break" style={{ display: "flex", justifyContent: "space-between", marginTop: 40, gap: 20 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Notlar / Açıklama</div>
                        <div style={{ border: "1px solid #e2e8f0", padding: 10, minHeight: 55, fontSize: 10, color: "#94a3b8", background: "#fafbfc" }}></div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Banka Bilgileri</div>
                        <div style={{ border: "1px solid #e2e8f0", padding: 10, minHeight: 55, fontSize: 10, color: "#94a3b8", background: "#fafbfc" }}></div>
                    </div>
                    <div style={{ width: 180, textAlign: "center" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Kaşe / İmza</div>
                        <div style={{ border: "1px solid #e2e8f0", minHeight: 55, background: "#fafbfc" }}></div>
                    </div>
                </div>

                <div style={{ textAlign: "center", marginTop: 28, paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 8, color: "#94a3b8", letterSpacing: 0.5 }}>
                    Bu belge elektronik ortamda oluşturulmuştur.
                </div>
            </div>
        </div>
    );
}
