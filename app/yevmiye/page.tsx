"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

interface YevmiyeKayit {
    id: number;
    sirket_id: number;
    tarih: string;
    fis_no: string;
    aciklama: string;
    hesap_kodu: string;
    hesap_adi: string;
    borc: number;
    alacak: number;
    kaynak: string;
    kaynak_id: number;
    created_at: string;
}

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const trFix = (text: string) => (text || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c');

const KAYNAK_RENK: Record<string, string> = {
    FATURA: "#3b82f6",
    TAHSILAT: "#059669",
    MASRAF: "#dc2626",
    KASA: "#f59e0b",
    BANKA: "#8b5cf6",
    MANUEL: "#64748b",
};

export default function YevmiyeDefteri() {
    const { aktifSirket, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const hasAccess = isYonetici || isMuhasebe;

    const [kayitlar, setKayitlar] = useState<YevmiyeKayit[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [senkronEdiliyor, setSenkronEdiliyor] = useState(false);

    // Tarih filtresi
    const simdi = new Date();
    const [filtreBas, setFiltreBas] = useState(() => `${simdi.getFullYear()}-${(simdi.getMonth() + 1).toString().padStart(2, "0")}-01`);
    const [filtreBit, setFiltreBit] = useState(() => simdi.toISOString().split("T")[0]);
    const [aramaMetni, setAramaMetni] = useState("");

    const sirketId = aktifSirket?.id;

    // VERİLERİ GETİR
    const verileriGetir = useCallback(async (sId: number) => {
        setYukleniyor(true);
        const { data } = await supabase.from("yevmiye_kayitlari")
            .select("*").eq("sirket_id", sId)
            .gte("tarih", filtreBas).lte("tarih", filtreBit)
            .order("tarih", { ascending: false }).order("id", { ascending: false });
        setKayitlar(data || []);
        setYukleniyor(false);
    }, [filtreBas, filtreBit]);

    useEffect(() => {
        if (!sirketId || !hasAccess) { setYukleniyor(false); return; }
        verileriGetir(sirketId);
    }, [sirketId, hasAccess, verileriGetir]);

    // OTOMATİK YEVMIYE SENKRON
    const senkronEt = useCallback(async () => {
        if (!aktifSirket) return;
        setSenkronEdiliyor(true);
        const sId = aktifSirket.id;
        let eklenenSayisi = 0;

        try {
            // Mevcut yevmiye kaynak_id'lerini topla (tekrar eklemeyi önle)
            const { data: mevcutlar } = await supabase.from("yevmiye_kayitlari")
                .select("kaynak, kaynak_id").eq("sirket_id", sId);
            const mevcutSet = new Set((mevcutlar || []).map(m => `${m.kaynak}_${m.kaynak_id}`));

            const yeniKayitlar: Omit<YevmiyeKayit, "id" | "created_at">[] = [];
            let fisCounter = (mevcutlar || []).length + 1;
            const fisNo = () => `YEV-${String(fisCounter++).padStart(5, "0")}`;

            // 1. FATURALAR
            const { data: faturalar } = await supabase.from("faturalar")
                .select("id, fatura_no, tip, tarih, genel_toplam, cari_adi")
                .eq("sirket_id", sId);
            (faturalar || []).forEach(f => {
                if (mevcutSet.has(`FATURA_${f.id}`)) return;
                const isSatis = f.tip === "GIDEN";
                yeniKayitlar.push({
                    sirket_id: sId, tarih: f.tarih, fis_no: fisNo(),
                    aciklama: `${isSatis ? "Satis" : "Alis"} Faturasi - ${f.fatura_no} - ${f.cari_adi || ""}`,
                    hesap_kodu: isSatis ? "120" : "320",
                    hesap_adi: isSatis ? "Alicilar" : "Saticilar",
                    borc: isSatis ? Number(f.genel_toplam || 0) : 0,
                    alacak: isSatis ? 0 : Number(f.genel_toplam || 0),
                    kaynak: "FATURA", kaynak_id: f.id,
                });
                // Karşı kayıt
                yeniKayitlar.push({
                    sirket_id: sId, tarih: f.tarih, fis_no: yeniKayitlar[yeniKayitlar.length - 1].fis_no,
                    aciklama: `${isSatis ? "Satis" : "Alis"} Faturasi - ${f.fatura_no} - ${f.cari_adi || ""}`,
                    hesap_kodu: isSatis ? "600" : "153",
                    hesap_adi: isSatis ? "Yurt Ici Satislar" : "Ticari Mallar",
                    borc: isSatis ? 0 : Number(f.genel_toplam || 0),
                    alacak: isSatis ? Number(f.genel_toplam || 0) : 0,
                    kaynak: "FATURA", kaynak_id: f.id,
                });
            });

            // 2. TAHSİLAT / ÖDEME (cari_hareketler)
            const { data: hareketler } = await supabase.from("cari_hareketler")
                .select("id, tarih, evrak_no, aciklama, borc, alacak");
            (hareketler || []).forEach(h => {
                if (mevcutSet.has(`TAHSILAT_${h.id}`)) return;
                const borcTutar = Number(h.borc || 0);
                const alacakTutar = Number(h.alacak || 0);
                if (borcTutar === 0 && alacakTutar === 0) return;

                if (alacakTutar > 0) {
                    // Tahsilat
                    yeniKayitlar.push({
                        sirket_id: sId, tarih: h.tarih, fis_no: fisNo(),
                        aciklama: h.aciklama || `Tahsilat - ${h.evrak_no || ""}`,
                        hesap_kodu: "100", hesap_adi: "Kasa",
                        borc: alacakTutar, alacak: 0,
                        kaynak: "TAHSILAT", kaynak_id: h.id,
                    });
                    yeniKayitlar.push({
                        sirket_id: sId, tarih: h.tarih, fis_no: yeniKayitlar[yeniKayitlar.length - 1].fis_no,
                        aciklama: h.aciklama || `Tahsilat - ${h.evrak_no || ""}`,
                        hesap_kodu: "120", hesap_adi: "Alicilar",
                        borc: 0, alacak: alacakTutar,
                        kaynak: "TAHSILAT", kaynak_id: h.id,
                    });
                }
                if (borcTutar > 0) {
                    // Ödeme
                    yeniKayitlar.push({
                        sirket_id: sId, tarih: h.tarih, fis_no: fisNo(),
                        aciklama: h.aciklama || `Odeme - ${h.evrak_no || ""}`,
                        hesap_kodu: "320", hesap_adi: "Saticilar",
                        borc: borcTutar, alacak: 0,
                        kaynak: "TAHSILAT", kaynak_id: h.id,
                    });
                    yeniKayitlar.push({
                        sirket_id: sId, tarih: h.tarih, fis_no: yeniKayitlar[yeniKayitlar.length - 1].fis_no,
                        aciklama: h.aciklama || `Odeme - ${h.evrak_no || ""}`,
                        hesap_kodu: "100", hesap_adi: "Kasa",
                        borc: 0, alacak: borcTutar,
                        kaynak: "TAHSILAT", kaynak_id: h.id,
                    });
                }
            });

            // 3. MASRAFLAR
            const { data: masraflar } = await supabase.from("masraflar")
                .select("id, tarih, masraf_kategorisi, aciklama, tutar, kdv_tutari, belge_no")
                .eq("sirket_id", sId);
            (masraflar || []).forEach(m => {
                if (mevcutSet.has(`MASRAF_${m.id}`)) return;
                const toplam = Number(m.tutar || 0) + Number(m.kdv_tutari || 0);
                if (toplam === 0) return;
                yeniKayitlar.push({
                    sirket_id: sId, tarih: m.tarih, fis_no: fisNo(),
                    aciklama: `Masraf - ${m.masraf_kategorisi} - ${m.aciklama || ""} ${m.belge_no ? `(${m.belge_no})` : ""}`.trim(),
                    hesap_kodu: "770", hesap_adi: "Genel Yonetim Giderleri",
                    borc: toplam, alacak: 0,
                    kaynak: "MASRAF", kaynak_id: m.id,
                });
                yeniKayitlar.push({
                    sirket_id: sId, tarih: m.tarih, fis_no: yeniKayitlar[yeniKayitlar.length - 1].fis_no,
                    aciklama: `Masraf - ${m.masraf_kategorisi} - ${m.aciklama || ""}`.trim(),
                    hesap_kodu: "100", hesap_adi: "Kasa",
                    borc: 0, alacak: toplam,
                    kaynak: "MASRAF", kaynak_id: m.id,
                });
            });

            // 4. KASA HAREKETLERİ
            const { data: kasaHareketleri } = await supabase.from("kasa_hareketleri")
                .select("id, tarih, islem_tipi, tutar, aciklama")
                .eq("sirket_id", sId);
            (kasaHareketleri || []).forEach(k => {
                if (mevcutSet.has(`KASA_${k.id}`)) return;
                const tutar = Number(k.tutar || 0);
                if (tutar === 0) return;
                const isGiris = k.islem_tipi === "GIRIS";
                yeniKayitlar.push({
                    sirket_id: sId, tarih: k.tarih, fis_no: fisNo(),
                    aciklama: `Kasa ${isGiris ? "Giris" : "Cikis"} - ${k.aciklama || ""}`,
                    hesap_kodu: "100", hesap_adi: "Kasa",
                    borc: isGiris ? tutar : 0, alacak: isGiris ? 0 : tutar,
                    kaynak: "KASA", kaynak_id: k.id,
                });
                yeniKayitlar.push({
                    sirket_id: sId, tarih: k.tarih, fis_no: yeniKayitlar[yeniKayitlar.length - 1].fis_no,
                    aciklama: `Kasa ${isGiris ? "Giris" : "Cikis"} - ${k.aciklama || ""}`,
                    hesap_kodu: isGiris ? "391" : "770",
                    hesap_adi: isGiris ? "Hesaplanan KDV" : "Genel Yonetim Giderleri",
                    borc: isGiris ? 0 : tutar, alacak: isGiris ? tutar : 0,
                    kaynak: "KASA", kaynak_id: k.id,
                });
            });

            // 5. BANKA HAREKETLERİ
            const { data: bankaHareketleri } = await supabase.from("banka_hareketleri")
                .select("id, tarih, islem_tipi, tutar, aciklama")
                .eq("sirket_id", sId);
            (bankaHareketleri || []).forEach(b => {
                if (mevcutSet.has(`BANKA_${b.id}`)) return;
                const tutar = Number(b.tutar || 0);
                if (tutar === 0) return;
                const isYatirma = b.islem_tipi === "YATIRMA";
                yeniKayitlar.push({
                    sirket_id: sId, tarih: b.tarih, fis_no: fisNo(),
                    aciklama: `Banka ${isYatirma ? "Yatirma" : "Cekme"} - ${b.aciklama || ""}`,
                    hesap_kodu: "102", hesap_adi: "Bankalar",
                    borc: isYatirma ? tutar : 0, alacak: isYatirma ? 0 : tutar,
                    kaynak: "BANKA", kaynak_id: b.id,
                });
                yeniKayitlar.push({
                    sirket_id: sId, tarih: b.tarih, fis_no: yeniKayitlar[yeniKayitlar.length - 1].fis_no,
                    aciklama: `Banka ${isYatirma ? "Yatirma" : "Cekme"} - ${b.aciklama || ""}`,
                    hesap_kodu: isYatirma ? "100" : "320",
                    hesap_adi: isYatirma ? "Kasa" : "Saticilar",
                    borc: isYatirma ? 0 : tutar, alacak: isYatirma ? tutar : 0,
                    kaynak: "BANKA", kaynak_id: b.id,
                });
            });

            // TOPLU INSERT
            if (yeniKayitlar.length > 0) {
                // 50'lik batch'ler halinde ekle
                for (let i = 0; i < yeniKayitlar.length; i += 50) {
                    const batch = yeniKayitlar.slice(i, i + 50);
                    await supabase.from("yevmiye_kayitlari").insert(batch);
                }
                eklenenSayisi = yeniKayitlar.length;
            }

            if (eklenenSayisi > 0) {
                toast.success(`${eklenenSayisi} yevmiye kaydi senkronize edildi.`);
            } else {
                toast.info("Tum kayitlar zaten guncel.");
            }
            verileriGetir(sId);
        } catch (err) {
            toast.error("Senkronizasyon hatasi: " + (err instanceof Error ? err.message : String(err)));
        }
        setSenkronEdiliyor(false);
    }, [aktifSirket, toast, verileriGetir]);

    // FİLTRE
    const filtrelenmis = useMemo(() => {
        if (!aramaMetni) return kayitlar;
        const q = aramaMetni.toLowerCase();
        return kayitlar.filter(k =>
            (k.fis_no || "").toLowerCase().includes(q) ||
            (k.aciklama || "").toLowerCase().includes(q) ||
            (k.hesap_kodu || "").toLowerCase().includes(q) ||
            (k.hesap_adi || "").toLowerCase().includes(q)
        );
    }, [kayitlar, aramaMetni]);

    // TOPLAMLAR
    const toplamBorc = useMemo(() => filtrelenmis.reduce((a, k) => a + Number(k.borc || 0), 0), [filtrelenmis]);
    const toplamAlacak = useMemo(() => filtrelenmis.reduce((a, k) => a + Number(k.alacak || 0), 0), [filtrelenmis]);
    const fark = toplamBorc - toplamAlacak;

    // EXCEL
    const excelIndir = () => {
        const satirlar = filtrelenmis.map(k => ({
            "Tarih": new Date(k.tarih).toLocaleDateString("tr-TR"),
            "Fis No": k.fis_no,
            "Aciklama": k.aciklama,
            "Hesap Kodu": k.hesap_kodu,
            "Hesap Adi": k.hesap_adi,
            "Borc": Number(k.borc),
            "Alacak": Number(k.alacak),
            "Kaynak": k.kaynak,
        }));
        satirlar.push({
            "Tarih": "", "Fis No": "", "Aciklama": "TOPLAM",
            "Hesap Kodu": "", "Hesap Adi": "",
            "Borc": toplamBorc, "Alacak": toplamAlacak, "Kaynak": "",
        });
        const ws = XLSX.utils.json_to_sheet(satirlar);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Yevmiye");
        XLSX.writeFile(wb, `yevmiye_${filtreBas}_${filtreBit}.xlsx`);
        toast.success("Excel indirildi.");
    };

    // PDF
    const pdfIndir = () => {
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const sirket = aktifSirket;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(trFix(sirket?.isletme_adi || sirket?.unvan || "Firma"), 15, 15);
        doc.setFontSize(10);
        doc.text(trFix(`Yevmiye Defteri: ${filtreBas} - ${filtreBit}`), 15, 22);

        let y = 32;
        doc.setFillColor(30, 58, 95);
        doc.rect(15, y, 267, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        const cols = [
            { label: "Tarih", x: 18 },
            { label: trFix("Fis No"), x: 45 },
            { label: trFix("Aciklama"), x: 75 },
            { label: "Hesap Kodu", x: 170 },
            { label: "Hesap Adi", x: 195 },
            { label: trFix("Borc"), x: 235 },
            { label: "Alacak", x: 260 },
        ];
        cols.forEach(c => doc.text(c.label, c.x, y + 5.5));
        y += 8;

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        filtrelenmis.forEach((k, i) => {
            if (y > 190) { doc.addPage(); y = 15; }
            const bg = i % 2 === 0 ? 255 : 248;
            doc.setFillColor(bg, bg, bg);
            doc.rect(15, y, 267, 6, "F");
            doc.setFontSize(7);
            doc.text(new Date(k.tarih).toLocaleDateString("tr-TR"), 18, y + 4);
            doc.text(trFix(k.fis_no || ""), 45, y + 4);
            doc.text(trFix((k.aciklama || "").substring(0, 50)), 75, y + 4);
            doc.text(trFix(k.hesap_kodu || ""), 170, y + 4);
            doc.text(trFix((k.hesap_adi || "").substring(0, 20)), 195, y + 4);
            doc.text(Number(k.borc) > 0 ? fmtTL(Number(k.borc)) : "", 235, y + 4);
            doc.text(Number(k.alacak) > 0 ? fmtTL(Number(k.alacak)) : "", 260, y + 4);
            y += 6;
        });

        y += 4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(trFix(`Toplam Borc: ${fmtTL(toplamBorc)} TL`), 235, y);
        doc.text(trFix(`Toplam Alacak: ${fmtTL(toplamAlacak)} TL`), 235, y + 5);
        doc.text(trFix(`Fark: ${fmtTL(Math.abs(fark))} TL ${fark >= 0 ? "(Borc Fazlasi)" : "(Alacak Fazlasi)"}`), 235, y + 10);

        doc.save(`yevmiye_${filtreBas}_${filtreBit}.pdf`);
        toast.success("PDF indirildi.");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "#f8fafc" }}>Sistem Dogrulaniyor...</div>;

    if (!hasAccess) return (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "#f8fafc" }}>
            <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erisim Engellendi</h1>
            <p className="text-slate-500 font-bold max-w-md mx-auto">Yevmiye defterine sadece &quot;YONETICI&quot; veya &quot;MUHASEBE&quot; yetkisine sahip kullanicilar erisebilir.</p>
        </main>
    );

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* ÖZET KARTLARI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 shrink-0">
                <div className="card-kurumsal p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center shrink-0"><i className="fas fa-arrow-up text-sm" /></div>
                        <div>
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Toplam Borc</div>
                            <div className="text-[16px] font-bold text-[#dc2626]">{fmtTL(toplamBorc)} TL</div>
                        </div>
                    </div>
                </div>
                <div className="card-kurumsal p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#f0fdf4] text-[#059669] flex items-center justify-center shrink-0"><i className="fas fa-arrow-down text-sm" /></div>
                        <div>
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Toplam Alacak</div>
                            <div className="text-[16px] font-bold text-[#059669]">{fmtTL(toplamAlacak)} TL</div>
                        </div>
                    </div>
                </div>
                <div className="card-kurumsal p-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 flex items-center justify-center shrink-0 ${Math.abs(fark) < 0.01 ? "bg-[#f0fdf4] text-[#059669]" : "bg-[#fef3c7] text-[#f59e0b]"}`}><i className="fas fa-balance-scale text-sm" /></div>
                        <div>
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Fark</div>
                            <div className={`text-[16px] font-bold ${Math.abs(fark) < 0.01 ? "text-[#059669]" : "text-[#f59e0b]"}`}>{fmtTL(Math.abs(fark))} TL</div>
                            {Math.abs(fark) >= 0.01 && <div className="text-[10px] text-[#f59e0b]">{fark > 0 ? "Borc fazlasi" : "Alacak fazlasi"}</div>}
                        </div>
                    </div>
                </div>
            </div>

            {/* TOOLBAR */}
            <div className="flex items-center justify-between px-4 py-2 shrink-0 flex-wrap gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={senkronEt} disabled={senkronEdiliyor} className="btn-primary flex items-center gap-2" style={{ background: "#059669" }}>
                        <i className={`fas fa-sync text-[10px] ${senkronEdiliyor ? "animate-spin" : ""}`} />
                        {senkronEdiliyor ? "Senkronize Ediliyor..." : "Kayitlari Senkronize Et"}
                    </button>
                    <button onClick={excelIndir} className="btn-secondary flex items-center gap-2" style={{ color: "#059669" }}><i className="fas fa-file-excel text-[10px]" /> Excel</button>
                    <button onClick={pdfIndir} className="btn-secondary flex items-center gap-2" style={{ color: "#dc2626" }}><i className="fas fa-file-pdf text-[10px]" /> PDF</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={filtreBas} onChange={e => setFiltreBas(e.target.value)} className="input-kurumsal w-32 text-xs" />
                    <span className="text-xs text-slate-400">-</span>
                    <input type="date" value={filtreBit} onChange={e => setFiltreBit(e.target.value)} className="input-kurumsal w-32 text-xs" />
                    <div className="relative">
                        <input type="text" placeholder="Ara..." value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} className="input-kurumsal w-40 text-xs" />
                        <i className="fas fa-search absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                    </div>
                </div>
            </div>

            {/* YEVMIYE TABLOSU */}
            <div className="flex-1 overflow-auto" style={{ background: "var(--c-bg)" }}>
                {/* MASAÜSTÜ */}
                <table className="tbl-kurumsal hidden md:table">
                    <thead>
                        <tr>
                            <th className="w-24 text-center">Tarih</th>
                            <th className="w-28">Fis No</th>
                            <th>Aciklama</th>
                            <th className="w-20 text-center">Hesap Kodu</th>
                            <th className="w-36">Hesap Adi</th>
                            <th className="w-28 text-right">Borc</th>
                            <th className="w-28 text-right">Alacak</th>
                            <th className="w-20 text-center">Kaynak</th>
                        </tr>
                    </thead>
                    <tbody>
                        {yukleniyor ? (
                            <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yukleniyor...</td></tr>
                        ) : filtrelenmis.length === 0 ? (
                            <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">
                                Yevmiye kaydi bulunamadi. &quot;Kayitlari Senkronize Et&quot; butonuna basarak mevcut verileri aktarabilirsiniz.
                            </td></tr>
                        ) : filtrelenmis.map(k => (
                            <tr key={k.id} className="bg-white hover:bg-slate-50">
                                <td className="text-center text-xs">{new Date(k.tarih).toLocaleDateString("tr-TR")}</td>
                                <td className="font-mono text-xs font-bold text-slate-600">{k.fis_no}</td>
                                <td className="text-xs text-slate-700">{k.aciklama}</td>
                                <td className="text-center font-mono text-xs font-bold">{k.hesap_kodu}</td>
                                <td className="text-xs font-semibold text-slate-700">{k.hesap_adi}</td>
                                <td className="text-right text-xs font-semibold">{Number(k.borc) > 0 ? <span className="text-[#dc2626]">{fmtTL(Number(k.borc))}</span> : ""}</td>
                                <td className="text-right text-xs font-semibold">{Number(k.alacak) > 0 ? <span className="text-[#059669]">{fmtTL(Number(k.alacak))}</span> : ""}</td>
                                <td className="text-center">
                                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: (KAYNAK_RENK[k.kaynak] || "#64748b") + "18", color: KAYNAK_RENK[k.kaynak] || "#64748b", border: `1px solid ${KAYNAK_RENK[k.kaynak] || "#64748b"}30` }}>
                                        {k.kaynak}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* MOBİL KART */}
                <div className="md:hidden p-3 space-y-2">
                    {yukleniyor ? (
                        <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yukleniyor...</div>
                    ) : filtrelenmis.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                            Yevmiye kaydi bulunamadi. Senkronize Et butonuna basin.
                        </div>
                    ) : filtrelenmis.map(k => (
                        <div key={k.id} className="bg-white p-3" style={{ border: "1px solid var(--c-border)" }}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="font-mono text-[10px] font-bold text-slate-500">{k.fis_no}</span>
                                <div className="flex items-center gap-2">
                                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: (KAYNAK_RENK[k.kaynak] || "#64748b") + "18", color: KAYNAK_RENK[k.kaynak] || "#64748b" }}>{k.kaynak}</span>
                                    <span className="text-[10px] text-slate-400">{new Date(k.tarih).toLocaleDateString("tr-TR")}</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-700 mb-1.5 line-clamp-2">{k.aciklama}</p>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 font-mono">{k.hesap_kodu} - {k.hesap_adi}</span>
                                <div className="flex items-center gap-3">
                                    {Number(k.borc) > 0 && <span className="font-bold text-[#dc2626]">B: {fmtTL(Number(k.borc))}</span>}
                                    {Number(k.alacak) > 0 && <span className="font-bold text-[#059669]">A: {fmtTL(Number(k.alacak))}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* TOPLAM BAR */}
                {filtrelenmis.length > 0 && (
                    <div className="sticky bottom-0 bg-white px-4 py-2 flex items-center justify-between text-xs font-bold flex-wrap gap-2" style={{ borderTop: "2px solid var(--c-border)" }}>
                        <span className="text-slate-500">{filtrelenmis.length} kayit</span>
                        <div className="flex items-center gap-4">
                            <span className="text-[#dc2626]">Borc: {fmtTL(toplamBorc)}</span>
                            <span className="text-[#059669]">Alacak: {fmtTL(toplamAlacak)}</span>
                            <span className={Math.abs(fark) < 0.01 ? "text-[#059669]" : "text-[#f59e0b]"}>Fark: {fmtTL(Math.abs(fark))}</span>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
