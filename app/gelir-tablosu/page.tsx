"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

interface FaturaRaw { id: number; tip: string; genel_toplam: number; ara_toplam: number; kdv_toplam: number; tarih: string; }
interface MasrafRaw { id: number; masraf_kategorisi: string; tutar: number; kdv_tutari: number; tarih: string; }

type Donem = "ay" | "yil" | "ozel";

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const trFix = (text: string) => (text || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c');

function donemTarih(donem: Donem, ozelBas: string, ozelBit: string) {
    const simdi = new Date();
    if (donem === "ay") {
        const bas = `${simdi.getFullYear()}-${(simdi.getMonth() + 1).toString().padStart(2, "0")}-01`;
        return { baslangic: bas, bitis: simdi.toISOString().split("T")[0] };
    }
    if (donem === "yil") {
        return { baslangic: `${simdi.getFullYear()}-01-01`, bitis: simdi.toISOString().split("T")[0] };
    }
    return { baslangic: ozelBas, bitis: ozelBit };
}

export default function GelirTablosu() {
    const { aktifSirket, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const hasAccess = isYonetici || isMuhasebe;

    const [faturalar, setFaturalar] = useState<FaturaRaw[]>([]);
    const [masraflar, setMasraflar] = useState<MasrafRaw[]>([]);
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
            const [{ data: fData }, { data: mData }] = await Promise.all([
                supabase.from("faturalar").select("id, tip, genel_toplam, ara_toplam, kdv_toplam, tarih")
                    .eq("sirket_id", sirketId).gte("tarih", baslangic).lte("tarih", bitis),
                supabase.from("masraflar").select("id, masraf_kategorisi, tutar, kdv_tutari, tarih")
                    .eq("sirket_id", sirketId).gte("tarih", baslangic).lte("tarih", bitis),
            ]);
            setFaturalar(fData || []);
            setMasraflar(mData || []);
            setYukleniyor(false);
        };
        getir();
    }, [sirketId, hasAccess, donem, ozelBas, ozelBit]);

    // HESAPLAMALAR
    const satisFaturalari = useMemo(() => faturalar.filter(f => f.tip === "GIDEN"), [faturalar]);
    const alisFaturalari = useMemo(() => faturalar.filter(f => f.tip === "GELEN"), [faturalar]);

    // A. BRÜT SATIŞLAR
    const brutSatislar = useMemo(() => satisFaturalari.reduce((a, f) => a + Number(f.genel_toplam || 0), 0), [satisFaturalari]);
    const satisIadeleri = 0; // İade sistemi yoksa 0
    const satisIskontosu = 0; // İskonto sistemi yoksa 0
    const netSatislar = brutSatislar - satisIadeleri - satisIskontosu;

    // B. SATIŞLARIN MALİYETİ
    const ticariMalAlislari = useMemo(() => alisFaturalari.reduce((a, f) => a + Number(f.genel_toplam || 0), 0), [alisFaturalari]);
    const brutKar = netSatislar - ticariMalAlislari;

    // C. FAALİYET GİDERLERİ
    const masrafKategorileri = useMemo(() => {
        const map: Record<string, number> = {};
        masraflar.forEach(m => {
            const kat = m.masraf_kategorisi || "Diger";
            map[kat] = (map[kat] || 0) + Number(m.tutar || 0) + Number(m.kdv_tutari || 0);
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [masraflar]);

    const genelYonetimGiderleri = useMemo(() => {
        const pazarlamaKat = ["Pazarlama"];
        return masraflar.filter(m => !pazarlamaKat.includes(m.masraf_kategorisi))
            .reduce((a, m) => a + Number(m.tutar || 0) + Number(m.kdv_tutari || 0), 0);
    }, [masraflar]);

    const pazarlamaGiderleri = useMemo(() => {
        return masraflar.filter(m => m.masraf_kategorisi === "Pazarlama")
            .reduce((a, m) => a + Number(m.tutar || 0) + Number(m.kdv_tutari || 0), 0);
    }, [masraflar]);

    const toplamFaaliyetGiderleri = genelYonetimGiderleri + pazarlamaGiderleri;
    const faaliyetKari = brutKar - toplamFaaliyetGiderleri;

    // D. NET KAR/ZARAR
    const netKar = faaliyetKari;

    const { baslangic, bitis } = donemTarih(donem, ozelBas, ozelBit);

    // EXCEL
    const excelIndir = () => {
        const satirlar = [
            { "Kalem": "A. BRUT SATISLAR", "Tutar (TL)": "" },
            { "Kalem": "  Yurt Ici Satislar", "Tutar (TL)": brutSatislar },
            { "Kalem": "  Satis Iadeleri (-)", "Tutar (TL)": -satisIadeleri },
            { "Kalem": "  Satis Iskontosu (-)", "Tutar (TL)": -satisIskontosu },
            { "Kalem": "= NET SATISLAR", "Tutar (TL)": netSatislar },
            { "Kalem": "", "Tutar (TL)": "" },
            { "Kalem": "B. SATISLARIN MALIYETI", "Tutar (TL)": "" },
            { "Kalem": "  Ticari Mal Alislari", "Tutar (TL)": ticariMalAlislari },
            { "Kalem": "= BRUT KAR/ZARAR", "Tutar (TL)": brutKar },
            { "Kalem": "", "Tutar (TL)": "" },
            { "Kalem": "C. FAALIYET GIDERLERI", "Tutar (TL)": "" },
            { "Kalem": "  Genel Yonetim Giderleri", "Tutar (TL)": genelYonetimGiderleri },
            { "Kalem": "  Pazarlama Giderleri", "Tutar (TL)": pazarlamaGiderleri },
            { "Kalem": "= FAALIYET KARI/ZARARI", "Tutar (TL)": faaliyetKari },
            { "Kalem": "", "Tutar (TL)": "" },
            { "Kalem": "D. NET KAR/ZARAR", "Tutar (TL)": netKar },
        ];
        const ws = XLSX.utils.json_to_sheet(satirlar);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Gelir Tablosu");
        XLSX.writeFile(wb, `gelir_tablosu_${baslangic}_${bitis}.xlsx`);
        toast.success("Excel indirildi.");
    };

    // PDF
    const pdfIndir = () => {
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const sirket = aktifSirket;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(trFix(sirket?.isletme_adi || sirket?.unvan || "Firma"), 15, 20);
        doc.setFontSize(12);
        doc.text(trFix("GELIR TABLOSU"), 15, 28);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(trFix(`Donem: ${baslangic} - ${bitis}`), 15, 34);

        let y = 45;
        const satir = (label: string, tutar: number | string, bold?: boolean, color?: string) => {
            if (bold) doc.setFont("helvetica", "bold");
            else doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            if (color === "green") doc.setTextColor(5, 150, 105);
            else if (color === "red") doc.setTextColor(220, 38, 38);
            else doc.setTextColor(15, 23, 42);
            doc.text(trFix(label), 20, y);
            if (typeof tutar === "number") {
                doc.text(trFix(`${fmtTL(tutar)} TL`), 190, y, { align: "right" });
            }
            y += 6;
        };
        const cizgi = () => { doc.setDrawColor(226, 232, 240); doc.line(15, y - 2, 195, y - 2); };
        const kalinCizgi = () => { doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.5); doc.line(15, y - 2, 195, y - 2); doc.setLineWidth(0.2); };

        satir("A. BRUT SATISLAR", "", true);
        satir("    Yurt Ici Satislar", brutSatislar);
        if (satisIadeleri > 0) satir("    Satis Iadeleri (-)", -satisIadeleri, false, "red");
        if (satisIskontosu > 0) satir("    Satis Iskontosu (-)", -satisIskontosu, false, "red");
        cizgi();
        satir("= NET SATISLAR", netSatislar, true, netSatislar >= 0 ? "green" : "red");
        y += 4;

        satir("B. SATISLARIN MALIYETI", "", true);
        satir("    Ticari Mal Alislari", ticariMalAlislari, false, "red");
        cizgi();
        satir("= BRUT KAR / ZARAR", brutKar, true, brutKar >= 0 ? "green" : "red");
        y += 4;

        satir("C. FAALIYET GIDERLERI", "", true);
        satir("    Genel Yonetim Giderleri", genelYonetimGiderleri, false, "red");
        satir("    Pazarlama Giderleri", pazarlamaGiderleri, false, "red");
        cizgi();
        satir("= FAALIYET KARI / ZARARI", faaliyetKari, true, faaliyetKari >= 0 ? "green" : "red");
        y += 6;

        kalinCizgi();
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        if (netKar >= 0) doc.setTextColor(5, 150, 105);
        else doc.setTextColor(220, 38, 38);
        doc.text(trFix("D. NET KAR / ZARAR"), 20, y);
        doc.text(trFix(`${fmtTL(netKar)} TL`), 190, y, { align: "right" });

        doc.save(`gelir_tablosu_${baslangic}_${bitis}.pdf`);
        toast.success("PDF indirildi.");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "#f8fafc" }}>Sistem Dogrulaniyor...</div>;

    if (!hasAccess) return (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "#f8fafc" }}>
            <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erisim Engellendi</h1>
            <p className="text-slate-500 font-bold max-w-md mx-auto">Gelir tablosuna sadece &quot;YONETICI&quot; veya &quot;MUHASEBE&quot; yetkisine sahip kullanicilar erisebilir.</p>
        </main>
    );

    const SatirKalem = ({ label, tutar, indent, bold, negative }: { label: string; tutar?: number; indent?: boolean; bold?: boolean; negative?: boolean }) => (
        <div className={`flex items-center justify-between py-2 px-4 ${bold ? "bg-slate-50" : ""}`} style={!bold ? { borderBottom: "1px solid #f1f5f9" } : { borderBottom: "1px solid var(--c-border)" }}>
            <span className={`text-xs ${indent ? "pl-4" : ""} ${bold ? "font-bold text-[#0f172a]" : "text-slate-600"}`}>{label}</span>
            {tutar !== undefined && (
                <span className={`text-xs font-bold tabular-nums ${
                    bold ? (tutar >= 0 ? "text-[#059669] text-sm" : "text-[#dc2626] text-sm") :
                    negative ? "text-[#dc2626]" : "text-[#0f172a]"
                }`}>
                    {negative && tutar > 0 ? "-" : ""}{fmtTL(Math.abs(tutar))} TL
                </span>
            )}
        </div>
    );

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
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

            {/* İÇERİK */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {yukleniyor ? (
                    <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest">Yukleniyor...</div>
                ) : (
                    <>
                        {/* NET KAR ÖZET KARTI */}
                        <div className={`p-6 text-center ${netKar >= 0 ? "bg-[#f0fdf4]" : "bg-[#fef2f2]"}`} style={{ border: `2px solid ${netKar >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Net Kar / Zarar</div>
                            <div className={`text-3xl font-bold ${netKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>{fmtTL(netKar)} TL</div>
                            <div className="text-[10px] text-slate-400 mt-1">{baslangic} - {bitis}</div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* A. BRÜT SATIŞLAR */}
                            <div className="card-kurumsal">
                                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                                    <div className="w-6 h-6 bg-[#eff6ff] text-[#3b82f6] flex items-center justify-center text-[10px]"><i className="fas fa-file-invoice" /></div>
                                    <span className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">A. Brut Satislar</span>
                                </div>
                                <div>
                                    <SatirKalem label="Yurt Ici Satislar" tutar={brutSatislar} indent />
                                    <SatirKalem label="Satis Iadeleri" tutar={satisIadeleri} indent negative />
                                    <SatirKalem label="Satis Iskontosu" tutar={satisIskontosu} indent negative />
                                    <SatirKalem label="= NET SATISLAR" tutar={netSatislar} bold />
                                </div>
                            </div>

                            {/* B. SATIŞLARIN MALİYETİ */}
                            <div className="card-kurumsal">
                                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                                    <div className="w-6 h-6 bg-[#fef3c7] text-[#f59e0b] flex items-center justify-center text-[10px]"><i className="fas fa-shopping-cart" /></div>
                                    <span className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">B. Satislarin Maliyeti</span>
                                </div>
                                <div>
                                    <SatirKalem label="Ticari Mal Alislari" tutar={ticariMalAlislari} indent negative />
                                    <SatirKalem label="= BRUT KAR / ZARAR" tutar={brutKar} bold />
                                </div>
                            </div>

                            {/* C. FAALİYET GİDERLERİ */}
                            <div className="card-kurumsal">
                                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                                    <div className="w-6 h-6 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center text-[10px]"><i className="fas fa-receipt" /></div>
                                    <span className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">C. Faaliyet Giderleri</span>
                                </div>
                                <div>
                                    <SatirKalem label="Genel Yonetim Giderleri" tutar={genelYonetimGiderleri} indent negative />
                                    <SatirKalem label="Pazarlama Giderleri" tutar={pazarlamaGiderleri} indent negative />
                                    {/* Kategori detay */}
                                    {masrafKategorileri.length > 0 && (
                                        <div className="px-4 py-2" style={{ background: "#fafbfc", borderBottom: "1px solid #f1f5f9" }}>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Kategori Detay</div>
                                            {masrafKategorileri.map(([kat, tutar]) => (
                                                <div key={kat} className="flex justify-between text-[10px] py-0.5">
                                                    <span className="text-slate-500">{kat}</span>
                                                    <span className="font-semibold text-slate-700">{fmtTL(tutar)} TL</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <SatirKalem label="= FAALIYET KARI / ZARARI" tutar={faaliyetKari} bold />
                                </div>
                            </div>

                            {/* D. NET KAR/ZARAR */}
                            <div className="card-kurumsal">
                                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: netKar >= 0 ? "#f0fdf4" : "#fef2f2", borderBottom: "1px solid var(--c-border)" }}>
                                    <div className={`w-6 h-6 flex items-center justify-center text-[10px] ${netKar >= 0 ? "bg-[#dcfce7] text-[#059669]" : "bg-[#fee2e2] text-[#dc2626]"}`}><i className="fas fa-chart-line" /></div>
                                    <span className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">D. Net Kar / Zarar</span>
                                </div>
                                <div className="p-4">
                                    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                                        <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <span className="text-slate-500">Net Satislar</span>
                                            <span className="font-bold">{fmtTL(netSatislar)}</span>
                                        </div>
                                        <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <span className="text-slate-500">Satis Maliyeti</span>
                                            <span className="font-bold text-[#dc2626]">-{fmtTL(ticariMalAlislari)}</span>
                                        </div>
                                        <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <span className="text-slate-500">Brut Kar</span>
                                            <span className={`font-bold ${brutKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>{fmtTL(brutKar)}</span>
                                        </div>
                                        <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <span className="text-slate-500">Faaliyet Giderleri</span>
                                            <span className="font-bold text-[#dc2626]">-{fmtTL(toplamFaaliyetGiderleri)}</span>
                                        </div>
                                    </div>
                                    <div className={`p-3 text-center ${netKar >= 0 ? "bg-[#f0fdf4]" : "bg-[#fef2f2]"}`} style={{ border: `1px solid ${netKar >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase">Net Kar / Zarar</div>
                                        <div className={`text-xl font-bold ${netKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>{fmtTL(netKar)} TL</div>
                                        {netSatislar > 0 && <div className="text-[10px] text-slate-400 mt-0.5">Kar Marji: %{((netKar / netSatislar) * 100).toFixed(1)}</div>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* FATURA VE MASRAF ÖZETİ */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="card-kurumsal p-4">
                                <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Satis Faturasi</div>
                                <div className="text-lg font-bold text-[#3b82f6]">{satisFaturalari.length} <span className="text-xs text-slate-400 font-medium">adet</span></div>
                                <div className="text-xs font-semibold text-[#0f172a]">{fmtTL(brutSatislar)} TL</div>
                            </div>
                            <div className="card-kurumsal p-4">
                                <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Alis Faturasi</div>
                                <div className="text-lg font-bold text-[#f59e0b]">{alisFaturalari.length} <span className="text-xs text-slate-400 font-medium">adet</span></div>
                                <div className="text-xs font-semibold text-[#0f172a]">{fmtTL(ticariMalAlislari)} TL</div>
                            </div>
                            <div className="card-kurumsal p-4">
                                <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Masraflar</div>
                                <div className="text-lg font-bold text-[#dc2626]">{masraflar.length} <span className="text-xs text-slate-400 font-medium">adet</span></div>
                                <div className="text-xs font-semibold text-[#0f172a]">{fmtTL(toplamFaaliyetGiderleri)} TL</div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
