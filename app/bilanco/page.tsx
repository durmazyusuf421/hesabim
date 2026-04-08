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

export default function BilancoSayfasi() {
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

    // BAKİYE HESAPLA
    const bakiyeHesapla = useMemo(() => {
        const map: Record<string, { hesap_adi: string; borc: number; alacak: number }> = {};
        kayitlar.forEach(k => {
            const kod = k.hesap_kodu || "999";
            if (!map[kod]) map[kod] = { hesap_adi: k.hesap_adi || kod, borc: 0, alacak: 0 };
            map[kod].borc += Number(k.borc || 0);
            map[kod].alacak += Number(k.alacak || 0);
        });
        const bakiye = (kod: string) => {
            const h = map[kod];
            if (!h) return 0;
            return h.borc - h.alacak;
        };
        return { map, bakiye };
    }, [kayitlar]);

    const { bakiye } = bakiyeHesapla;

    // AKTİF (Varlıklar)
    const kasa = Math.max(bakiye("100"), 0);
    const bankalar = Math.max(bakiye("102"), 0);
    const alicilar = Math.max(bakiye("120"), 0);
    const ticariMallar = Math.max(bakiye("153"), 0);
    const toplamDonenVarliklar = kasa + bankalar + alicilar + ticariMallar;
    const toplamAktif = toplamDonenVarliklar;

    // PASİF (Kaynaklar)
    const saticilar = Math.max(-bakiye("320"), 0); // 320 normalde alacak bakiye verir
    const toplamKisaVadeliYukumlulukler = saticilar;

    // Özkaynaklar: Satışlar (600 alacak bakiye) - Giderler (770 borç bakiye)
    const satisGeliri = Math.max(-bakiye("600"), 0); // 600 alacak bakiyeli
    const giderler = Math.max(bakiye("770"), 0); // 770 borç bakiyeli
    const netKarZarar = satisGeliri - giderler;
    const toplamOzkaynaklar = netKarZarar;
    const toplamPasif = toplamKisaVadeliYukumlulukler + toplamOzkaynaklar;

    const dengeli = Math.abs(toplamAktif - toplamPasif) < 0.01;
    const { baslangic, bitis } = donemTarih(donem, ozelBas, ozelBit);

    // EXCEL
    const excelIndir = () => {
        const satirlar = [
            { "Bolum": "AKTIF (VARLIKLAR)", "Kalem": "", "Tutar (TL)": "" },
            { "Bolum": "", "Kalem": "Kasa (100)", "Tutar (TL)": kasa },
            { "Bolum": "", "Kalem": "Bankalar (102)", "Tutar (TL)": bankalar },
            { "Bolum": "", "Kalem": "Alicilar (120)", "Tutar (TL)": alicilar },
            { "Bolum": "", "Kalem": "Ticari Mallar (153)", "Tutar (TL)": ticariMallar },
            { "Bolum": "", "Kalem": "TOPLAM AKTIF", "Tutar (TL)": toplamAktif },
            { "Bolum": "", "Kalem": "", "Tutar (TL)": "" },
            { "Bolum": "PASIF (KAYNAKLAR)", "Kalem": "", "Tutar (TL)": "" },
            { "Bolum": "Kisa Vadeli Yukumlulukler", "Kalem": "Saticilar (320)", "Tutar (TL)": saticilar },
            { "Bolum": "", "Kalem": "TOPLAM KISA VADELI", "Tutar (TL)": toplamKisaVadeliYukumlulukler },
            { "Bolum": "Ozkaynaklar", "Kalem": "Net Kar/Zarar", "Tutar (TL)": netKarZarar },
            { "Bolum": "", "Kalem": "TOPLAM PASIF", "Tutar (TL)": toplamPasif },
        ];
        const ws = XLSX.utils.json_to_sheet(satirlar);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bilanco");
        XLSX.writeFile(wb, `bilanco_${baslangic}_${bitis}.xlsx`);
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
        doc.text("BILANCO", 15, 28);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(trFix(`Donem: ${baslangic} - ${bitis}`), 15, 34);

        let y = 45;
        const baslik = (text: string) => {
            doc.setFillColor(30, 58, 95);
            doc.rect(15, y, 85, 7, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(trFix(text), 18, y + 5);
            y += 7;
            doc.setTextColor(0, 0, 0);
        };
        const satir = (label: string, tutar: number, bold?: boolean) => {
            if (bold) {
                doc.setFillColor(241, 245, 249);
                doc.rect(15, y, 85, 6, "F");
                doc.setFont("helvetica", "bold");
            } else {
                doc.setFont("helvetica", "normal");
            }
            doc.setFontSize(8);
            doc.text(trFix(label), 18, y + 4);
            doc.text(fmtTL(tutar), 97, y + 4, { align: "right" });
            y += 6;
        };

        // AKTİF
        baslik("AKTIF (VARLIKLAR)");
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        doc.text(trFix("Donen Varliklar"), 18, y + 4); y += 5;
        satir("Kasa (100)", kasa);
        satir("Bankalar (102)", bankalar);
        satir("Alicilar (120)", alicilar);
        satir("Ticari Mallar (153)", ticariMallar);
        satir("TOPLAM AKTIF", toplamAktif, true);

        y += 8;

        // PASİF
        baslik("PASIF (KAYNAKLAR)");
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        doc.text(trFix("Kisa Vadeli Yukumlulukler"), 18, y + 4); y += 5;
        satir("Saticilar (320)", saticilar);
        satir("Toplam Kisa Vadeli", toplamKisaVadeliYukumlulukler, true);

        y += 4;
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        doc.text("Ozkaynaklar", 18, y + 4); y += 5;
        satir("Net Kar/Zarar", netKarZarar);
        satir("TOPLAM PASIF", toplamPasif, true);

        y += 8;
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        if (dengeli) {
            doc.setTextColor(5, 150, 105);
            doc.text("Bilanco dengede. Aktif = Pasif", 15, y);
        } else {
            doc.setTextColor(220, 38, 38);
            doc.text(trFix(`Bilanco dengede degil! Fark: ${fmtTL(Math.abs(toplamAktif - toplamPasif))} TL`), 15, y);
        }

        doc.save(`bilanco_${baslangic}_${bitis}.pdf`);
        toast.success("PDF indirildi.");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "#f8fafc" }}>Sistem Dogrulaniyor...</div>;

    if (!hasAccess) return (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "#f8fafc" }}>
            <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erisim Engellendi</h1>
            <p className="text-slate-500 font-bold max-w-md mx-auto">Bilanco ekranina sadece &quot;YONETICI&quot; veya &quot;MUHASEBE&quot; yetkisine sahip kullanicilar erisebilir.</p>
        </main>
    );

    const BilancoSatir = ({ label, tutar, bold, sub }: { label: string; tutar: number; bold?: boolean; sub?: boolean }) => (
        <div className={`flex justify-between items-center px-4 py-2 ${bold ? "bg-slate-50" : ""}`} style={{ borderBottom: `1px solid ${bold ? "var(--c-border)" : "#f1f5f9"}` }}>
            <span className={`text-xs ${sub ? "pl-4 text-slate-500" : bold ? "font-bold text-[#0f172a] uppercase" : "text-slate-700"}`}>{label}</span>
            <span className={`text-xs tabular-nums ${bold ? "font-bold text-sm" : "font-semibold"} ${tutar >= 0 ? "text-[#0f172a]" : "text-[#dc2626]"}`}>{fmtTL(tutar)} TL</span>
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

            {/* DENGE KONTROLÜ */}
            {!yukleniyor && kayitlar.length > 0 && (
                <div className={`mx-4 mt-3 px-4 py-2 text-xs font-bold flex items-center gap-2 ${dengeli ? "bg-[#f0fdf4] text-[#059669]" : "bg-[#fef2f2] text-[#dc2626]"}`} style={{ border: `1px solid ${dengeli ? "#bbf7d0" : "#fecaca"}` }}>
                    <i className={`fas ${dengeli ? "fa-check-circle" : "fa-exclamation-triangle"}`} />
                    {dengeli ? "Bilanco dengede. Aktif = Pasif" : `Bilanco dengede degil! Fark: ${fmtTL(Math.abs(toplamAktif - toplamPasif))} TL`}
                </div>
            )}

            {/* İÇERİK */}
            <div className="flex-1 overflow-auto p-4">
                {yukleniyor ? (
                    <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest">Yukleniyor...</div>
                ) : kayitlar.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                        Yevmiye kaydi bulunamadi. Once Yevmiye Defteri sayfasindan kayitlari senkronize edin.
                    </div>
                ) : (
                    <>
                        {/* TOPLAM KARTLARI */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div className={`p-4 text-center ${toplamAktif > 0 ? "bg-[#eff6ff]" : "bg-slate-50"}`} style={{ border: "2px solid #bfdbfe" }}>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Toplam Aktif</div>
                                <div className="text-2xl font-bold text-[#1d4ed8]">{fmtTL(toplamAktif)} TL</div>
                            </div>
                            <div className={`p-4 text-center ${toplamPasif > 0 ? "bg-[#faf5ff]" : "bg-slate-50"}`} style={{ border: "2px solid #d8b4fe" }}>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Toplam Pasif</div>
                                <div className="text-2xl font-bold text-[#7c3aed]">{fmtTL(toplamPasif)} TL</div>
                            </div>
                        </div>

                        {/* İKİ SÜTUN: AKTİF / PASİF */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* AKTİF */}
                            <div className="card-kurumsal">
                                <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#1e3a5f", borderBottom: "1px solid var(--c-border)" }}>
                                    <i className="fas fa-arrow-circle-up text-white text-xs" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Aktif (Varliklar)</span>
                                </div>

                                <div className="px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    Donen Varliklar
                                </div>
                                <BilancoSatir label="Kasa" tutar={kasa} sub />
                                <BilancoSatir label="Bankalar" tutar={bankalar} sub />
                                <BilancoSatir label="Alicilar (Musteriler)" tutar={alicilar} sub />
                                <BilancoSatir label="Ticari Mallar" tutar={ticariMallar} sub />
                                <BilancoSatir label="Toplam Donen Varliklar" tutar={toplamDonenVarliklar} bold />

                                <div className="px-4 py-3 bg-[#1e3a5f] flex justify-between items-center">
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Toplam Aktif</span>
                                    <span className="text-sm font-bold text-white">{fmtTL(toplamAktif)} TL</span>
                                </div>
                            </div>

                            {/* PASİF */}
                            <div className="card-kurumsal">
                                <div className="px-4 py-3 flex items-center gap-2" style={{ background: "#581c87", borderBottom: "1px solid var(--c-border)" }}>
                                    <i className="fas fa-arrow-circle-down text-white text-xs" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Pasif (Kaynaklar)</span>
                                </div>

                                <div className="px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    Kisa Vadeli Yukumlulukler
                                </div>
                                <BilancoSatir label="Saticilar (Tedarikciler)" tutar={saticilar} sub />
                                <BilancoSatir label="Toplam Kisa Vadeli Yukumlulukler" tutar={toplamKisaVadeliYukumlulukler} bold />

                                <div className="px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    Ozkaynaklar
                                </div>
                                <div className="flex justify-between items-center px-4 py-2" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <span className="text-xs pl-4 text-slate-500">Net Kar / Zarar</span>
                                    <span className={`text-xs font-semibold tabular-nums ${netKarZarar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>{fmtTL(netKarZarar)} TL</span>
                                </div>
                                <BilancoSatir label="Toplam Ozkaynaklar" tutar={toplamOzkaynaklar} bold />

                                <div className="px-4 py-3 flex justify-between items-center" style={{ background: "#581c87" }}>
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Toplam Pasif</span>
                                    <span className="text-sm font-bold text-white">{fmtTL(toplamPasif)} TL</span>
                                </div>
                            </div>
                        </div>

                        {/* HESAP DETAY */}
                        <div className="mt-4 card-kurumsal">
                            <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-[#0f172a] uppercase tracking-wider" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                Hesap Detay
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
                                {[
                                    { kod: "100", adi: "Kasa", tutar: kasa, renk: "#3b82f6" },
                                    { kod: "102", adi: "Bankalar", tutar: bankalar, renk: "#8b5cf6" },
                                    { kod: "120", adi: "Alicilar", tutar: alicilar, renk: "#059669" },
                                    { kod: "153", adi: "Ticari Mallar", tutar: ticariMallar, renk: "#f59e0b" },
                                    { kod: "320", adi: "Saticilar", tutar: saticilar, renk: "#dc2626" },
                                    { kod: "600", adi: "Satislar", tutar: satisGeliri, renk: "#059669" },
                                    { kod: "770", adi: "Giderler", tutar: giderler, renk: "#dc2626" },
                                ].map(h => (
                                    <div key={h.kod} className="p-3 text-center" style={{ borderRight: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                                        <div className="text-[10px] font-mono font-bold" style={{ color: h.renk }}>{h.kod}</div>
                                        <div className="text-[10px] text-slate-500 mb-1">{h.adi}</div>
                                        <div className="text-xs font-bold text-[#0f172a]">{fmtTL(h.tutar)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
