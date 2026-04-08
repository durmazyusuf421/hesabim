"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

interface Masraf {
    id: number;
    sirket_id: number;
    masraf_kategorisi: string;
    aciklama: string;
    tutar: number;
    tarih: string;
    odeme_turu: string;
    belge_no: string;
    kdv_tutari: number;
    kdv_orani: number;
    created_at: string;
}
interface Kategori {
    id: number;
    sirket_id: number;
    kategori_adi: string;
    renk: string;
}

const VARSAYILAN_KATEGORILER = [
    { kategori_adi: "Kira", renk: "#6366f1" },
    { kategori_adi: "Elektrik", renk: "#f59e0b" },
    { kategori_adi: "Su", renk: "#06b6d4" },
    { kategori_adi: "Dogalgaz", renk: "#ef4444" },
    { kategori_adi: "Internet", renk: "#8b5cf6" },
    { kategori_adi: "Telefon", renk: "#10b981" },
    { kategori_adi: "Personel", renk: "#3b82f6" },
    { kategori_adi: "Nakliye", renk: "#f97316" },
    { kategori_adi: "Pazarlama", renk: "#ec4899" },
    { kategori_adi: "Diger", renk: "#64748b" },
];

const ODEME_TURLERI = [
    { value: "NAKIT", label: "Nakit" },
    { value: "BANKA", label: "Banka" },
    { value: "KREDI_KARTI", label: "Kredi Karti" },
];

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const trFix = (text: string) => (text || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c');

export default function MasraflarSayfasi() {
    const { aktifSirket, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();
    const hasAccess = isYonetici || isMuhasebe;

    const [masraflar, setMasraflar] = useState<Masraf[]>([]);
    const [kategoriler, setKategoriler] = useState<Kategori[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [aramaTerimi, setAramaTerimi] = useState("");

    // Tarih filtresi
    const simdi = new Date();
    const [filtreBas, setFiltreBas] = useState(() => `${simdi.getFullYear()}-${(simdi.getMonth() + 1).toString().padStart(2, "0")}-01`);
    const [filtreBit, setFiltreBit] = useState(() => simdi.toISOString().split("T")[0]);

    // Masraf modal
    const [modalAcik, setModalAcik] = useState(false);
    const [duzenleId, setDuzenleId] = useState<number | null>(null);
    const [form, setForm] = useState({
        masraf_kategorisi: "", aciklama: "", tutar: "", kdv_orani: "20",
        tarih: new Date().toISOString().split("T")[0], odeme_turu: "NAKIT", belge_no: ""
    });

    // Kategori modal
    const [katModalAcik, setKatModalAcik] = useState(false);
    const [yeniKatAdi, setYeniKatAdi] = useState("");
    const [yeniKatRenk, setYeniKatRenk] = useState("#3B82F6");

    const sirketId = aktifSirket?.id;

    const verileriGetir = useCallback(async (sId: number) => {
        setYukleniyor(true);
        const [{ data: mData }, { data: kData }] = await Promise.all([
            supabase.from("masraflar").select("*").eq("sirket_id", sId).gte("tarih", filtreBas).lte("tarih", filtreBit).order("tarih", { ascending: false }),
            supabase.from("masraf_kategorileri").select("*").eq("sirket_id", sId).order("kategori_adi"),
        ]);
        setMasraflar(mData || []);
        if (kData && kData.length > 0) {
            setKategoriler(kData);
        } else if (kData && kData.length === 0) {
            // Varsayilan kategorileri ekle
            const eklenecek = VARSAYILAN_KATEGORILER.map(k => ({ ...k, sirket_id: sId }));
            const { data: yeniKat } = await supabase.from("masraf_kategorileri").insert(eklenecek).select();
            setKategoriler(yeniKat || []);
        }
        setYukleniyor(false);
    }, [filtreBas, filtreBit]);

    useEffect(() => {
        if (!sirketId || !hasAccess) { setYukleniyor(false); return; }
        verileriGetir(sirketId);
    }, [sirketId, hasAccess, verileriGetir]);

    // ÖZET HESAPLARI
    const buAyStr = `${simdi.getFullYear()}-${(simdi.getMonth() + 1).toString().padStart(2, "0")}`;
    const buAyMasraflar = useMemo(() => masraflar.filter(m => m.tarih.startsWith(buAyStr)), [masraflar, buAyStr]);
    const toplamMasraf = useMemo(() => buAyMasraflar.reduce((a, m) => a + Number(m.tutar || 0), 0), [buAyMasraflar]);
    const toplamKdvliMasraf = useMemo(() => buAyMasraflar.reduce((a, m) => a + Number(m.tutar || 0) + Number(m.kdv_tutari || 0), 0), [buAyMasraflar]);
    const enYuksekKategori = useMemo(() => {
        const map: Record<string, number> = {};
        buAyMasraflar.forEach(m => { map[m.masraf_kategorisi] = (map[m.masraf_kategorisi] || 0) + Number(m.tutar || 0); });
        const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
        return sorted.length > 0 ? sorted[0] : null;
    }, [buAyMasraflar]);

    // FİLTRELENMİŞ LİSTE
    const filtrelenmis = useMemo(() => {
        const q = aramaTerimi.toLowerCase();
        if (!q) return masraflar;
        return masraflar.filter(m =>
            (m.masraf_kategorisi || "").toLowerCase().includes(q) ||
            (m.aciklama || "").toLowerCase().includes(q) ||
            (m.belge_no || "").toLowerCase().includes(q)
        );
    }, [masraflar, aramaTerimi]);

    const kategoriRenk = useCallback((adi: string) => {
        return kategoriler.find(k => k.kategori_adi === adi)?.renk || "#64748b";
    }, [kategoriler]);

    // KAYDET
    const kaydet = async () => {
        if (!aktifSirket) return;
        if (!form.masraf_kategorisi) { toast.error("Kategori secin!"); return; }
        if (!form.tutar || Number(form.tutar) <= 0) { toast.error("Tutar girin!"); return; }

        const tutar = Number(form.tutar);
        const kdvOrani = Number(form.kdv_orani);
        const kdvTutari = tutar * (kdvOrani / 100);

        const kayit = {
            sirket_id: aktifSirket.id,
            masraf_kategorisi: form.masraf_kategorisi,
            aciklama: form.aciklama,
            tutar,
            tarih: form.tarih,
            odeme_turu: form.odeme_turu,
            belge_no: form.belge_no,
            kdv_tutari: kdvTutari,
            kdv_orani: kdvOrani,
        };

        if (duzenleId) {
            const { error } = await supabase.from("masraflar").update(kayit).eq("id", duzenleId);
            if (error) { toast.error("Guncelleme hatasi: " + error.message); return; }
            toast.success("Masraf guncellendi.");
        } else {
            const { error } = await supabase.from("masraflar").insert([kayit]);
            if (error) { toast.error("Kayit hatasi: " + error.message); return; }
            toast.success("Masraf kaydedildi.");
        }
        setModalAcik(false);
        setDuzenleId(null);
        verileriGetir(aktifSirket.id);
    };

    const masrafSil = (id: number) => {
        onayla({
            baslik: "Masraf Sil",
            mesaj: "Bu masraf kaydini silmek istediginize emin misiniz?",
            onayMetni: "Evet, Sil",
            tehlikeli: true,
            onOnayla: async () => {
                await supabase.from("masraflar").delete().eq("id", id);
                toast.success("Masraf silindi.");
                if (aktifSirket) verileriGetir(aktifSirket.id);
            }
        });
    };

    const masrafDuzenle = (m: Masraf) => {
        setDuzenleId(m.id);
        setForm({
            masraf_kategorisi: m.masraf_kategorisi,
            aciklama: m.aciklama || "",
            tutar: String(m.tutar),
            kdv_orani: String(m.kdv_orani || 0),
            tarih: m.tarih,
            odeme_turu: m.odeme_turu || "NAKIT",
            belge_no: m.belge_no || "",
        });
        setModalAcik(true);
    };

    const yeniMasrafAc = () => {
        setDuzenleId(null);
        setForm({
            masraf_kategorisi: kategoriler.length > 0 ? kategoriler[0].kategori_adi : "",
            aciklama: "", tutar: "", kdv_orani: "20",
            tarih: new Date().toISOString().split("T")[0], odeme_turu: "NAKIT", belge_no: ""
        });
        setModalAcik(true);
    };

    // KATEGORİ İŞLEMLERİ
    const kategoriEkle = async () => {
        if (!aktifSirket || !yeniKatAdi.trim()) return;
        const { error } = await supabase.from("masraf_kategorileri").insert([{ sirket_id: aktifSirket.id, kategori_adi: yeniKatAdi.trim(), renk: yeniKatRenk }]);
        if (error) { toast.error("Hata: " + error.message); return; }
        toast.success("Kategori eklendi.");
        setYeniKatAdi("");
        verileriGetir(aktifSirket.id);
    };

    const kategoriSil = async (id: number) => {
        if (!aktifSirket) return;
        await supabase.from("masraf_kategorileri").delete().eq("id", id);
        toast.success("Kategori silindi.");
        verileriGetir(aktifSirket.id);
    };

    // EXCEL EXPORT
    const excelIndir = () => {
        const satirlar = filtrelenmis.map(m => ({
            "Tarih": new Date(m.tarih).toLocaleDateString("tr-TR"),
            "Kategori": m.masraf_kategorisi,
            "Aciklama": m.aciklama,
            "Tutar": Number(m.tutar),
            "KDV %": Number(m.kdv_orani),
            "KDV Tutari": Number(m.kdv_tutari),
            "Toplam": Number(m.tutar) + Number(m.kdv_tutari),
            "Odeme Turu": m.odeme_turu,
            "Belge No": m.belge_no,
        }));
        const ws = XLSX.utils.json_to_sheet(satirlar);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Masraflar");
        XLSX.writeFile(wb, `masraflar_${filtreBas}_${filtreBit}.xlsx`);
        toast.success("Excel indirildi.");
    };

    // PDF EXPORT
    const pdfIndir = () => {
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const sirket = aktifSirket;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(trFix(sirket?.isletme_adi || sirket?.unvan || "Firma"), 15, 15);
        doc.setFontSize(10);
        doc.text(trFix(`Masraf Raporu: ${filtreBas} - ${filtreBit}`), 15, 22);

        let y = 32;
        // Tablo basligi
        doc.setFillColor(30, 58, 95);
        doc.rect(15, y, 267, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const cols = [
            { label: "Tarih", x: 18 },
            { label: "Kategori", x: 50 },
            { label: trFix("Aciklama"), x: 95 },
            { label: "Tutar", x: 170 },
            { label: "KDV", x: 195 },
            { label: "Toplam", x: 220 },
            { label: trFix("Odeme Turu"), x: 248 },
        ];
        cols.forEach(c => doc.text(c.label, c.x, y + 5.5));
        y += 8;

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        filtrelenmis.forEach((m, i) => {
            if (y > 190) { doc.addPage(); y = 15; }
            const bg = i % 2 === 0 ? 255 : 248;
            doc.setFillColor(bg, bg, bg);
            doc.rect(15, y, 267, 7, "F");
            doc.setFontSize(8);
            doc.text(new Date(m.tarih).toLocaleDateString("tr-TR"), 18, y + 5);
            doc.text(trFix(m.masraf_kategorisi), 50, y + 5);
            doc.text(trFix((m.aciklama || "").substring(0, 40)), 95, y + 5);
            doc.text(fmtTL(Number(m.tutar)), 170, y + 5);
            doc.text(fmtTL(Number(m.kdv_tutari)), 195, y + 5);
            doc.text(fmtTL(Number(m.tutar) + Number(m.kdv_tutari)), 220, y + 5);
            doc.text(trFix(m.odeme_turu), 248, y + 5);
            y += 7;
        });

        y += 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        const genelToplam = filtrelenmis.reduce((a, m) => a + Number(m.tutar) + Number(m.kdv_tutari), 0);
        doc.text(trFix(`GENEL TOPLAM: ${fmtTL(genelToplam)} TL`), 267, y, { align: "right" });

        doc.save(`masraflar_${filtreBas}_${filtreBit}.pdf`);
        toast.success("PDF indirildi.");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "#f8fafc" }}>Sistem Dogrulanıyor...</div>;

    if (!hasAccess) return (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "#f8fafc" }}>
            <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erisim Engellendi</h1>
            <p className="text-slate-500 font-bold max-w-md mx-auto">Masraflar ekranina sadece &quot;YONETICI&quot; veya &quot;MUHASEBE&quot; yetkisine sahip kullanicilar erisebilir.</p>
        </main>
    );

    return (
        <>
            <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
                {/* ÖZET KARTLARI */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 shrink-0">
                    <div className="card-kurumsal p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center shrink-0"><i className="fas fa-receipt text-sm" /></div>
                            <div>
                                <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">Bu Ay Toplam Masraf</div>
                                <div className="text-[16px] font-bold text-[#dc2626]">{fmtTL(toplamMasraf)} TL</div>
                            </div>
                        </div>
                    </div>
                    <div className="card-kurumsal p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-[#fef3c7] text-[#f59e0b] flex items-center justify-center shrink-0"><i className="fas fa-percent text-sm" /></div>
                            <div>
                                <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">KDV Dahil Toplam</div>
                                <div className="text-[16px] font-bold text-[#f59e0b]">{fmtTL(toplamKdvliMasraf)} TL</div>
                            </div>
                        </div>
                    </div>
                    <div className="card-kurumsal p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-[#eff6ff] text-[#3b82f6] flex items-center justify-center shrink-0"><i className="fas fa-chart-pie text-sm" /></div>
                            <div>
                                <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">En Yuksek Kategori</div>
                                <div className="text-[14px] font-bold text-[#0f172a]">{enYuksekKategori ? enYuksekKategori[0] : "-"}</div>
                                {enYuksekKategori && <div className="text-[11px] font-semibold text-[#3b82f6]">{fmtTL(enYuksekKategori[1])} TL</div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* TOOLBAR */}
                <div className="flex items-center justify-between px-4 py-2 shrink-0 flex-wrap gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={yeniMasrafAc} className="btn-primary flex items-center gap-2"><i className="fas fa-plus text-[10px]" /> Yeni Masraf</button>
                        <button onClick={() => setKatModalAcik(true)} className="btn-secondary flex items-center gap-2"><i className="fas fa-tags text-[10px]" /> Kategoriler</button>
                        <button onClick={excelIndir} className="btn-secondary flex items-center gap-2" style={{ color: "#059669" }}><i className="fas fa-file-excel text-[10px]" /> Excel</button>
                        <button onClick={pdfIndir} className="btn-secondary flex items-center gap-2" style={{ color: "#dc2626" }}><i className="fas fa-file-pdf text-[10px]" /> PDF</button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <input type="date" value={filtreBas} onChange={e => setFiltreBas(e.target.value)} className="input-kurumsal w-32 text-xs" />
                        <span className="text-xs text-slate-400">-</span>
                        <input type="date" value={filtreBit} onChange={e => setFiltreBit(e.target.value)} className="input-kurumsal w-32 text-xs" />
                        <div className="relative">
                            <input type="text" placeholder="Ara..." value={aramaTerimi} onChange={e => setAramaTerimi(e.target.value)} className="input-kurumsal w-40 text-xs" />
                            <i className="fas fa-search absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                        </div>
                    </div>
                </div>

                {/* MASRAF LİSTESİ */}
                <div className="flex-1 overflow-auto" style={{ background: "var(--c-bg)" }}>
                    {/* MASAÜSTÜ TABLO */}
                    <table className="tbl-kurumsal hidden md:table">
                        <thead>
                            <tr>
                                <th className="w-28 text-center">Tarih</th>
                                <th className="w-36">Kategori</th>
                                <th>Aciklama</th>
                                <th className="w-28 text-right">Tutar</th>
                                <th className="w-24 text-right">KDV</th>
                                <th className="w-28 text-right">Toplam</th>
                                <th className="w-28 text-center">Odeme Turu</th>
                                <th className="w-24 text-center">Belge No</th>
                                <th className="w-24 text-center">Islem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yukleniyor ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yukleniyor...</td></tr>
                            ) : filtrelenmis.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Masraf Bulunamadi</td></tr>
                            ) : filtrelenmis.map(m => (
                                <tr key={m.id} className="bg-white hover:bg-slate-50">
                                    <td className="text-center">{new Date(m.tarih).toLocaleDateString("tr-TR")}</td>
                                    <td>
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: kategoriRenk(m.masraf_kategorisi) + "18", color: kategoriRenk(m.masraf_kategorisi), border: `1px solid ${kategoriRenk(m.masraf_kategorisi)}30` }}>
                                            <span className="w-2 h-2 rounded-full" style={{ background: kategoriRenk(m.masraf_kategorisi) }}></span>
                                            {m.masraf_kategorisi}
                                        </span>
                                    </td>
                                    <td className="text-slate-600 text-xs">{m.aciklama || "-"}</td>
                                    <td className="text-right font-semibold">{fmtTL(Number(m.tutar))}</td>
                                    <td className="text-right text-orange-600 text-xs">{fmtTL(Number(m.kdv_tutari))}</td>
                                    <td className="text-right font-bold">{fmtTL(Number(m.tutar) + Number(m.kdv_tutari))}</td>
                                    <td className="text-center text-xs">{ODEME_TURLERI.find(o => o.value === m.odeme_turu)?.label || m.odeme_turu}</td>
                                    <td className="text-center text-xs text-slate-500">{m.belge_no || "-"}</td>
                                    <td className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => masrafDuzenle(m)} className="w-7 h-7 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 flex items-center justify-center transition-colors" title="Duzenle"><i className="fas fa-edit text-[9px]"></i></button>
                                            <button onClick={() => masrafSil(m.id)} className="w-7 h-7 bg-red-50 text-[#dc2626] border border-red-200 hover:bg-red-100 flex items-center justify-center transition-colors" title="Sil"><i className="fas fa-trash text-[9px]"></i></button>
                                        </div>
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
                            <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Masraf Bulunamadi</div>
                        ) : filtrelenmis.map(m => (
                            <div key={m.id} className="bg-white p-3" style={{ border: "1px solid var(--c-border)" }}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: kategoriRenk(m.masraf_kategorisi) + "18", color: kategoriRenk(m.masraf_kategorisi), border: `1px solid ${kategoriRenk(m.masraf_kategorisi)}30` }}>
                                        <span className="w-2 h-2 rounded-full" style={{ background: kategoriRenk(m.masraf_kategorisi) }}></span>
                                        {m.masraf_kategorisi}
                                    </span>
                                    <span className="text-xs text-slate-400">{new Date(m.tarih).toLocaleDateString("tr-TR")}</span>
                                </div>
                                {m.aciklama && <p className="text-xs text-slate-600 mb-2">{m.aciklama}</p>}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-bold text-slate-800">{fmtTL(Number(m.tutar) + Number(m.kdv_tutari))} TL</div>
                                        <div className="text-[10px] text-slate-400">{ODEME_TURLERI.find(o => o.value === m.odeme_turu)?.label || m.odeme_turu} {m.belge_no ? `/ ${m.belge_no}` : ""}</div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => masrafDuzenle(m)} className="w-8 h-8 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 flex items-center justify-center transition-colors"><i className="fas fa-edit text-xs"></i></button>
                                        <button onClick={() => masrafSil(m.id)} className="w-8 h-8 bg-red-50 text-[#dc2626] border border-red-200 hover:bg-red-100 flex items-center justify-center transition-colors"><i className="fas fa-trash text-xs"></i></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* TOPLAM BAR */}
                    {filtrelenmis.length > 0 && (
                        <div className="sticky bottom-0 bg-white px-4 py-2 flex items-center justify-between text-xs font-bold" style={{ borderTop: "2px solid var(--c-border)" }}>
                            <span className="text-slate-500">{filtrelenmis.length} kayit</span>
                            <span className="text-[#dc2626]">Toplam: {fmtTL(filtrelenmis.reduce((a, m) => a + Number(m.tutar) + Number(m.kdv_tutari), 0))} TL</span>
                        </div>
                    )}
                </div>
            </main>

            {/* YENİ MASRAF MODALI */}
            {modalAcik && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-w-lg flex flex-col overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
                        <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <h3 className="text-sm font-semibold text-slate-800 flex items-center"><i className="fas fa-receipt mr-2 text-[#dc2626]"></i>{duzenleId ? "Masraf Duzenle" : "Yeni Masraf"}</h3>
                            <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Kategori</label>
                                <select value={form.masraf_kategorisi} onChange={e => setForm({ ...form, masraf_kategorisi: e.target.value })} className="input-kurumsal w-full">
                                    <option value="">--- Kategori Secin ---</option>
                                    {kategoriler.map(k => <option key={k.id} value={k.kategori_adi}>{k.kategori_adi}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Aciklama</label>
                                <input type="text" value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} placeholder="Masraf aciklamasi..." className="input-kurumsal w-full" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tutar (TL)</label>
                                    <input type="text" inputMode="decimal" value={form.tutar} onChange={e => { const val = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(val) || val === '') setForm({ ...form, tutar: val }); }} placeholder="0.00" className="input-kurumsal w-full text-right font-bold" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">KDV Orani</label>
                                    <select value={form.kdv_orani} onChange={e => setForm({ ...form, kdv_orani: e.target.value })} className="input-kurumsal w-full">
                                        <option value="0">%0</option>
                                        <option value="1">%1</option>
                                        <option value="10">%10</option>
                                        <option value="20">%20</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tarih</label>
                                    <input type="date" value={form.tarih} onChange={e => setForm({ ...form, tarih: e.target.value })} className="input-kurumsal w-full" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Odeme Turu</label>
                                    <select value={form.odeme_turu} onChange={e => setForm({ ...form, odeme_turu: e.target.value })} className="input-kurumsal w-full">
                                        {ODEME_TURLERI.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Belge No (Istege Bagli)</label>
                                <input type="text" value={form.belge_no} onChange={e => setForm({ ...form, belge_no: e.target.value })} placeholder="Fatura/fis numarasi" className="input-kurumsal w-full" />
                            </div>
                            {/* KDV Onizleme */}
                            {form.tutar && Number(form.tutar) > 0 && (
                                <div className="bg-slate-50 p-3 text-xs" style={{ border: "1px solid var(--c-border)" }}>
                                    <div className="flex justify-between mb-1"><span className="text-slate-500">Tutar:</span><span className="font-bold">{fmtTL(Number(form.tutar))} TL</span></div>
                                    <div className="flex justify-between mb-1"><span className="text-slate-500">KDV (%{form.kdv_orani}):</span><span className="font-bold text-orange-600">{fmtTL(Number(form.tutar) * (Number(form.kdv_orani) / 100))} TL</span></div>
                                    <div className="flex justify-between pt-1" style={{ borderTop: "1px solid var(--c-border)" }}><span className="font-bold text-slate-800">Toplam:</span><span className="font-bold text-[#dc2626]">{fmtTL(Number(form.tutar) * (1 + Number(form.kdv_orani) / 100))} TL</span></div>
                                </div>
                            )}
                        </div>
                        <div className="p-3 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                            <button onClick={kaydet} className="btn-primary w-full py-3 font-semibold text-xs uppercase tracking-widest flex items-center justify-center" style={{ background: "#dc2626" }}>
                                <i className="fas fa-save mr-2"></i> {duzenleId ? "Guncelle" : "Kaydet"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* KATEGORİ MODALI */}
            {katModalAcik && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-w-md flex flex-col overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
                        <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <h3 className="text-sm font-semibold text-slate-800 flex items-center"><i className="fas fa-tags mr-2 text-[#3b82f6]"></i>Masraf Kategorileri</h3>
                            <button onClick={() => setKatModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            {/* Yeni kategori ekle */}
                            <div className="flex items-center gap-2 mb-4">
                                <input type="color" value={yeniKatRenk} onChange={e => setYeniKatRenk(e.target.value)} className="w-8 h-8 cursor-pointer border-0 p-0" />
                                <input type="text" value={yeniKatAdi} onChange={e => setYeniKatAdi(e.target.value)} placeholder="Yeni kategori adi..." className="input-kurumsal flex-1 text-xs" onKeyDown={e => e.key === "Enter" && kategoriEkle()} />
                                <button onClick={kategoriEkle} className="btn-primary text-xs px-3"><i className="fas fa-plus"></i></button>
                            </div>
                            {/* Mevcut kategoriler */}
                            <div className="space-y-1">
                                {kategoriler.map(k => (
                                    <div key={k.id} className="flex items-center justify-between px-3 py-2 bg-white hover:bg-slate-50" style={{ border: "1px solid var(--c-border)" }}>
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full" style={{ background: k.renk }}></span>
                                            <span className="text-xs font-semibold text-slate-700">{k.kategori_adi}</span>
                                        </div>
                                        <button onClick={() => kategoriSil(k.id)} className="text-slate-400 hover:text-red-600 text-xs"><i className="fas fa-trash"></i></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <OnayModal />
        </>
    );
}
