"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

interface YevmiyeRaw { hesap_kodu: string; hesap_adi: string; borc: number; alacak: number; }

type Donem = "ay" | "yil" | "ozel";

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const trFix = (text: string) => (text || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c');

const HESAP_SIRA = ["100", "102", "120", "153", "320", "391", "600", "770"];

function donemTarih(donem: Donem, ozelBas: string, ozelBit: string) {
    const simdi = new Date();
    if (donem === "ay") {
        return { baslangic: `${simdi.getFullYear()}-${(simdi.getMonth() + 1).toString().padStart(2, "0")}-01`, bitis: simdi.toISOString().split("T")[0] };
    }
    if (donem === "yil") {
        return { baslangic: `${simdi.getFullYear()}-01-01`, bitis: simdi.toISOString().split("T")[0] };
    }
    return { baslangic: ozelBas, bitis: ozelBit };
}

interface MizanSatir {
    hesap_kodu: string;
    hesap_adi: string;
    toplamBorc: number;
    toplamAlacak: number;
    borcBakiye: number;
    alacakBakiye: number;
}

export default function MizanSayfasi() {
    const { aktifSirket, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const hasAccess = isYonetici || isMuhasebe;

    const [kayitlar, setKayitlar] = useState<YevmiyeRaw[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);

    const [donem, setDonem] = useState<Donem>("ay");
    const simdi = new Date();
    const [ozelBas, setOzelBas] = useState(() => `${simdi.getFullYear()}-${(simdi.getMonth() + 1).toString().padStart(2, "0")}-01`);
    const [ozelBit, setOzelBit] = useState(() => simdi.toISOString().split("T")[0]);

    const sirketId = aktifSirket?.id;

    useEffect(() => {
        if (!sirketId || !hasAccess) { setYukleniyor(false); return; }
        const getir = async () => {
            setYukleniyor(true);
            const { baslangic, bitis } = donemTarih(donem, ozelBas, ozelBit);
            const { data } = await supabase.from("yevmiye_kayitlari")
                .select("hesap_kodu, hesap_adi, borc, alacak")
                .eq("sirket_id", sirketId)
                .gte("tarih", baslangic).lte("tarih", bitis);
            setKayitlar(data || []);
            setYukleniyor(false);
        };
        getir();
    }, [sirketId, hasAccess, donem, ozelBas, ozelBit]);

    // MİZAN HESAPLA
    const mizanSatirlari = useMemo((): MizanSatir[] => {
        const map: Record<string, { hesap_adi: string; borc: number; alacak: number }> = {};
        kayitlar.forEach(k => {
            const kod = k.hesap_kodu || "999";
            if (!map[kod]) map[kod] = { hesap_adi: k.hesap_adi || kod, borc: 0, alacak: 0 };
            map[kod].borc += Number(k.borc || 0);
            map[kod].alacak += Number(k.alacak || 0);
        });
        return Object.entries(map)
            .map(([kod, v]) => {
                const fark = v.borc - v.alacak;
                return {
                    hesap_kodu: kod,
                    hesap_adi: v.hesap_adi,
                    toplamBorc: v.borc,
                    toplamAlacak: v.alacak,
                    borcBakiye: fark > 0 ? fark : 0,
                    alacakBakiye: fark < 0 ? Math.abs(fark) : 0,
                };
            })
            .sort((a, b) => {
                const ai = HESAP_SIRA.indexOf(a.hesap_kodu);
                const bi = HESAP_SIRA.indexOf(b.hesap_kodu);
                const sa = ai >= 0 ? ai : 100 + a.hesap_kodu.localeCompare(b.hesap_kodu);
                const sb = bi >= 0 ? bi : 100 + b.hesap_kodu.localeCompare(a.hesap_kodu);
                return sa - sb;
            });
    }, [kayitlar]);

    // TOPLAMLAR
    const genelBorc = useMemo(() => mizanSatirlari.reduce((a, s) => a + s.toplamBorc, 0), [mizanSatirlari]);
    const genelAlacak = useMemo(() => mizanSatirlari.reduce((a, s) => a + s.toplamAlacak, 0), [mizanSatirlari]);
    const genelBorcBakiye = useMemo(() => mizanSatirlari.reduce((a, s) => a + s.borcBakiye, 0), [mizanSatirlari]);
    const genelAlacakBakiye = useMemo(() => mizanSatirlari.reduce((a, s) => a + s.alacakBakiye, 0), [mizanSatirlari]);
    const dengeli = Math.abs(genelBorc - genelAlacak) < 0.01;

    const { baslangic, bitis } = donemTarih(donem, ozelBas, ozelBit);

    // EXCEL
    const excelIndir = () => {
        const satirlar = mizanSatirlari.map(s => ({
            "Hesap Kodu": s.hesap_kodu,
            "Hesap Adi": s.hesap_adi,
            "Toplam Borc": s.toplamBorc,
            "Toplam Alacak": s.toplamAlacak,
            "Borc Bakiye": s.borcBakiye,
            "Alacak Bakiye": s.alacakBakiye,
        }));
        satirlar.push({
            "Hesap Kodu": "", "Hesap Adi": "TOPLAM",
            "Toplam Borc": genelBorc, "Toplam Alacak": genelAlacak,
            "Borc Bakiye": genelBorcBakiye, "Alacak Bakiye": genelAlacakBakiye,
        });
        const ws = XLSX.utils.json_to_sheet(satirlar);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Mizan");
        XLSX.writeFile(wb, `mizan_${baslangic}_${bitis}.xlsx`);
        toast.success("Excel indirildi.");
    };

    // PDF
    const pdfIndir = () => {
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const sirket = aktifSirket;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(trFix(sirket?.isletme_adi || sirket?.unvan || "Firma"), 15, 15);
        doc.setFontSize(11);
        doc.text("MIZAN", 15, 22);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(trFix(`Donem: ${baslangic} - ${bitis}`), 15, 28);

        let y = 36;
        doc.setFillColor(30, 58, 95);
        doc.rect(15, y, 267, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Hesap Kodu", 18, y + 5.5);
        doc.text("Hesap Adi", 50, y + 5.5);
        doc.text(trFix("Toplam Borc"), 140, y + 5.5, { align: "right" });
        doc.text("Toplam Alacak", 180, y + 5.5, { align: "right" });
        doc.text(trFix("Borc Bakiye"), 225, y + 5.5, { align: "right" });
        doc.text("Alacak Bakiye", 267, y + 5.5, { align: "right" });
        y += 8;

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        mizanSatirlari.forEach((s, i) => {
            if (y > 190) { doc.addPage(); y = 15; }
            const bg = i % 2 === 0 ? 255 : 248;
            doc.setFillColor(bg, bg, bg);
            doc.rect(15, y, 267, 7, "F");
            doc.setFontSize(8);
            doc.text(s.hesap_kodu, 18, y + 5);
            doc.text(trFix(s.hesap_adi), 50, y + 5);
            doc.text(fmtTL(s.toplamBorc), 140, y + 5, { align: "right" });
            doc.text(fmtTL(s.toplamAlacak), 180, y + 5, { align: "right" });
            doc.text(s.borcBakiye > 0 ? fmtTL(s.borcBakiye) : "", 225, y + 5, { align: "right" });
            doc.text(s.alacakBakiye > 0 ? fmtTL(s.alacakBakiye) : "", 267, y + 5, { align: "right" });
            y += 7;
        });

        y += 3;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setFillColor(240, 240, 240);
        doc.rect(15, y - 2, 267, 8, "F");
        doc.text("TOPLAM", 50, y + 4);
        doc.text(fmtTL(genelBorc), 140, y + 4, { align: "right" });
        doc.text(fmtTL(genelAlacak), 180, y + 4, { align: "right" });
        doc.text(fmtTL(genelBorcBakiye), 225, y + 4, { align: "right" });
        doc.text(fmtTL(genelAlacakBakiye), 267, y + 4, { align: "right" });

        doc.save(`mizan_${baslangic}_${bitis}.pdf`);
        toast.success("PDF indirildi.");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "#f8fafc" }}>Sistem Dogrulaniyor...</div>;

    if (!hasAccess) return (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "#f8fafc" }}>
            <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erisim Engellendi</h1>
            <p className="text-slate-500 font-bold max-w-md mx-auto">Mizan ekranina sadece &quot;YONETICI&quot; veya &quot;MUHASEBE&quot; yetkisine sahip kullanicilar erisebilir.</p>
        </main>
    );

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* ÖZET KARTLARI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 shrink-0">
                <div className="card-kurumsal p-3">
                    <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Toplam Borc</div>
                    <div className="text-[15px] font-bold text-[#dc2626]">{fmtTL(genelBorc)} TL</div>
                </div>
                <div className="card-kurumsal p-3">
                    <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Toplam Alacak</div>
                    <div className="text-[15px] font-bold text-[#059669]">{fmtTL(genelAlacak)} TL</div>
                </div>
                <div className="card-kurumsal p-3">
                    <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Borc Bakiye</div>
                    <div className="text-[15px] font-bold text-[#dc2626]">{fmtTL(genelBorcBakiye)} TL</div>
                </div>
                <div className="card-kurumsal p-3">
                    <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Alacak Bakiye</div>
                    <div className="text-[15px] font-bold text-[#059669]">{fmtTL(genelAlacakBakiye)} TL</div>
                </div>
            </div>

            {/* DENGE KONTROLÜ */}
            {!yukleniyor && mizanSatirlari.length > 0 && !dengeli && (
                <div className="mx-4 mb-2 px-4 py-2 bg-[#fef2f2] text-[#dc2626] text-xs font-bold flex items-center gap-2" style={{ border: "1px solid #fecaca" }}>
                    <i className="fas fa-exclamation-triangle" />
                    Mizan dengede degil! Borc-Alacak farki: {fmtTL(Math.abs(genelBorc - genelAlacak))} TL
                </div>
            )}
            {!yukleniyor && mizanSatirlari.length > 0 && dengeli && (
                <div className="mx-4 mb-2 px-4 py-2 bg-[#f0fdf4] text-[#059669] text-xs font-bold flex items-center gap-2" style={{ border: "1px solid #bbf7d0" }}>
                    <i className="fas fa-check-circle" />
                    Mizan dengede. Borc = Alacak
                </div>
            )}

            {/* TOOLBAR */}
            <div className="flex items-center justify-between px-4 py-2 shrink-0 flex-wrap gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                    {(["ay", "yil"] as Donem[]).map(d => (
                        <button key={d} onClick={() => setDonem(d)} className={donem === d && donem !== "ozel" ? "btn-primary" : "btn-secondary"}>
                            {d === "ay" ? "Bu Ay" : "Bu Yil"}
                        </button>
                    ))}
                    <button onClick={() => setDonem("ozel")} className={donem === "ozel" ? "btn-primary" : "btn-secondary"}>Ozel</button>
                    {donem === "ozel" && (
                        <>
                            <input type="date" value={ozelBas} onChange={e => setOzelBas(e.target.value)} className="input-kurumsal w-32 text-xs" />
                            <span className="text-xs text-slate-400">-</span>
                            <input type="date" value={ozelBit} onChange={e => setOzelBit(e.target.value)} className="input-kurumsal w-32 text-xs" />
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={excelIndir} className="btn-secondary flex items-center gap-2" style={{ color: "#059669" }}><i className="fas fa-file-excel text-[10px]" /> Excel</button>
                    <button onClick={pdfIndir} className="btn-secondary flex items-center gap-2" style={{ color: "#dc2626" }}><i className="fas fa-file-pdf text-[10px]" /> PDF</button>
                </div>
            </div>

            {/* MİZAN TABLOSU */}
            <div className="flex-1 overflow-auto" style={{ background: "var(--c-bg)" }}>
                {/* MASAÜSTÜ */}
                <table className="tbl-kurumsal hidden md:table">
                    <thead>
                        <tr>
                            <th className="w-24 text-center">Hesap Kodu</th>
                            <th>Hesap Adi</th>
                            <th className="w-32 text-right">Toplam Borc</th>
                            <th className="w-32 text-right">Toplam Alacak</th>
                            <th className="w-32 text-right">Borc Bakiye</th>
                            <th className="w-32 text-right">Alacak Bakiye</th>
                        </tr>
                    </thead>
                    <tbody>
                        {yukleniyor ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yukleniyor...</td></tr>
                        ) : mizanSatirlari.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">
                                Yevmiye kaydi bulunamadi. Once Yevmiye Defteri sayfasindan kayitlari senkronize edin.
                            </td></tr>
                        ) : (
                            <>
                                {mizanSatirlari.map(s => (
                                    <tr key={s.hesap_kodu} className="bg-white hover:bg-slate-50">
                                        <td className="text-center font-mono text-xs font-bold">{s.hesap_kodu}</td>
                                        <td className="text-xs font-semibold text-slate-700">{s.hesap_adi}</td>
                                        <td className="text-right text-xs font-semibold text-[#dc2626]">{s.toplamBorc > 0 ? fmtTL(s.toplamBorc) : "-"}</td>
                                        <td className="text-right text-xs font-semibold text-[#059669]">{s.toplamAlacak > 0 ? fmtTL(s.toplamAlacak) : "-"}</td>
                                        <td className="text-right text-xs font-bold text-[#dc2626]">{s.borcBakiye > 0 ? fmtTL(s.borcBakiye) : "-"}</td>
                                        <td className="text-right text-xs font-bold text-[#059669]">{s.alacakBakiye > 0 ? fmtTL(s.alacakBakiye) : "-"}</td>
                                    </tr>
                                ))}
                                {/* TOPLAM SATIRI */}
                                <tr className="bg-slate-100 font-bold" style={{ borderTop: "2px solid var(--c-border)" }}>
                                    <td className="text-center text-xs">-</td>
                                    <td className="text-xs uppercase">Toplam</td>
                                    <td className="text-right text-xs text-[#dc2626]">{fmtTL(genelBorc)}</td>
                                    <td className="text-right text-xs text-[#059669]">{fmtTL(genelAlacak)}</td>
                                    <td className="text-right text-xs text-[#dc2626]">{fmtTL(genelBorcBakiye)}</td>
                                    <td className="text-right text-xs text-[#059669]">{fmtTL(genelAlacakBakiye)}</td>
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>

                {/* MOBİL KART */}
                <div className="md:hidden p-3 space-y-2">
                    {yukleniyor ? (
                        <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yukleniyor...</div>
                    ) : mizanSatirlari.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                            Yevmiye kaydi bulunamadi. Once senkronize edin.
                        </div>
                    ) : (
                        <>
                            {mizanSatirlari.map(s => (
                                <div key={s.hesap_kodu} className="bg-white p-3" style={{ border: "1px solid var(--c-border)" }}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-mono text-xs font-bold text-slate-800">{s.hesap_kodu}</span>
                                        <span className="text-xs font-semibold text-slate-600">{s.hesap_adi}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="flex justify-between"><span className="text-slate-400">T.Borc:</span><span className="font-bold text-[#dc2626]">{s.toplamBorc > 0 ? fmtTL(s.toplamBorc) : "-"}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">T.Alacak:</span><span className="font-bold text-[#059669]">{s.toplamAlacak > 0 ? fmtTL(s.toplamAlacak) : "-"}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">B.Bakiye:</span><span className="font-bold text-[#dc2626]">{s.borcBakiye > 0 ? fmtTL(s.borcBakiye) : "-"}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">A.Bakiye:</span><span className="font-bold text-[#059669]">{s.alacakBakiye > 0 ? fmtTL(s.alacakBakiye) : "-"}</span></div>
                                    </div>
                                </div>
                            ))}
                            {/* TOPLAM KART */}
                            <div className="bg-slate-100 p-3" style={{ border: "2px solid var(--c-border)" }}>
                                <div className="text-xs font-bold text-slate-800 mb-2 uppercase">Toplam</div>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div className="flex justify-between"><span className="text-slate-500">T.Borc:</span><span className="font-bold text-[#dc2626]">{fmtTL(genelBorc)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">T.Alacak:</span><span className="font-bold text-[#059669]">{fmtTL(genelAlacak)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">B.Bakiye:</span><span className="font-bold text-[#dc2626]">{fmtTL(genelBorcBakiye)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">A.Bakiye:</span><span className="font-bold text-[#059669]">{fmtTL(genelAlacakBakiye)}</span></div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}
