"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface SiparisRaw { id: number; toplam_tutar: string | number | null; durum: string; created_at?: string; alici_firma_id?: number; }
interface CariHareketRaw { id: number; borc: number; alacak: number; tarih: string; }
interface FirmaRaw { id: number; unvan: string; bakiye?: number; }

const parseTutar = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === "number") return val;
    let str = String(val).trim();
    if (str.includes(".") && str.includes(",")) { str = str.replace(/\./g, "").replace(",", "."); }
    else if (str.includes(",")) { str = str.replace(",", "."); }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};
const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Donem = "hafta" | "ay" | "yil" | "ozel";

function donemTarih(donem: Donem, ozelBaslangic?: string, ozelBitis?: string): { baslangic: string; bitis: string } {
    const now = new Date();
    const bitis = ozelBitis || now.toISOString().split("T")[0];
    if (donem === "ozel" && ozelBaslangic) return { baslangic: ozelBaslangic, bitis };
    if (donem === "hafta") { const d = new Date(now); d.setDate(d.getDate() - d.getDay() + 1); return { baslangic: d.toISOString().split("T")[0], bitis }; }
    if (donem === "ay") return { baslangic: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-01`, bitis };
    return { baslangic: `${now.getFullYear()}-01-01`, bitis };
}

const PIE_COLORS = ["#059669", "#3b82f6", "#f59e0b", "#dc2626"];

export default function RaporlarSayfasi() {
    const { aktifSirket, kullaniciRol, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const hasAccess = isYonetici || isMuhasebe;

    const [yukleniyor, setYukleniyor] = useState(true);
    const [donem, setDonem] = useState<Donem>("ay");
    const [ozelBaslangic, setOzelBaslangic] = useState("");
    const [ozelBitis, setOzelBitis] = useState("");
    const [siparisler, setSiparisler] = useState<SiparisRaw[]>([]);
    const [tumSiparisler, setTumSiparisler] = useState<SiparisRaw[]>([]);
    const [hareketler, setHareketler] = useState<CariHareketRaw[]>([]);
    const [firmalar, setFirmalar] = useState<FirmaRaw[]>([]);

    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
        if (!hasAccess) { setYukleniyor(false); return; }
        verileriGetir();
    }, [aktifSirket, kullaniciRol, donem, ozelBaslangic, ozelBitis]);

    async function verileriGetir() {
        if (!aktifSirket) return;
        setYukleniyor(true);
        try {
            const sirketId = aktifSirket.id;
            const { baslangic, bitis } = donemTarih(donem, ozelBaslangic, ozelBitis);

            const [sRes, hRes, fRes, tumRes] = await Promise.all([
                supabase.from("siparisler").select("id, toplam_tutar, durum, created_at, alici_firma_id").eq("satici_sirket_id", sirketId).gte("created_at", baslangic).lte("created_at", bitis + "T23:59:59"),
                supabase.from("cari_hareketler").select("id, borc, alacak, tarih").gte("tarih", baslangic).lte("tarih", bitis + "T23:59:59"),
                supabase.from("firmalar").select("id, unvan, bakiye").eq("sahip_sirket_id", sirketId),
                supabase.from("siparisler").select("id, toplam_tutar, durum, created_at, alici_firma_id").eq("satici_sirket_id", sirketId).order("created_at", { ascending: false }),
            ]);

            setSiparisler(sRes.data || []);
            setTumSiparisler(tumRes.data || []);
            setHareketler(hRes.data || []);
            setFirmalar(fRes.data || []);
        } catch { /* */ }
        setYukleniyor(false);
    }

    // HESAPLAMALAR
    const toplamCiro = useMemo(() => siparisler.filter(s => s.durum !== "IPTAL").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0), [siparisler]);
    const toplamTahsilat = useMemo(() => hareketler.reduce((a, h) => a + (Number(h.alacak) || 0), 0), [hareketler]);
    const acikAlacak = useMemo(() => firmalar.reduce((a, f) => a + Math.max(Number(f.bakiye) || 0, 0), 0), [firmalar]);
    const siparisSayisi = useMemo(() => siparisler.filter(s => s.durum !== "IPTAL").length, [siparisler]);

    // AYLIK GRAFİK (son 12 ay, tüm siparişlerden)
    const aylikGrafik = useMemo(() => {
        const ayIsimleri = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
        const result: { ay: string; tutar: number }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            const label = `${ayIsimleri[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
            const toplam = tumSiparisler.filter(s => s.created_at?.startsWith(key) && s.durum !== "IPTAL").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0);
            result.push({ ay: label, tutar: toplam });
        }
        return result;
    }, [tumSiparisler]);

    // EN ÇOK SİPARİŞ VEREN 5 MÜŞTERİ
    const enCokSiparisVeren = useMemo(() => {
        const sayac: Record<number, { unvan: string; adet: number; tutar: number }> = {};
        siparisler.filter(s => s.durum !== "IPTAL" && s.alici_firma_id).forEach(s => {
            const fid = s.alici_firma_id!;
            if (!sayac[fid]) { const f = firmalar.find(ff => ff.id === fid); sayac[fid] = { unvan: f?.unvan || "Bilinmiyor", adet: 0, tutar: 0 }; }
            sayac[fid].adet++;
            sayac[fid].tutar += parseTutar(s.toplam_tutar);
        });
        return Object.values(sayac).sort((a, b) => b.tutar - a.tutar).slice(0, 5);
    }, [siparisler, firmalar]);

    // SİPARİŞ DURUM DAĞILIMI
    const durumDagilimi = useMemo(() => {
        const map: Record<string, number> = {};
        siparisler.forEach(s => { map[s.durum] = (map[s.durum] || 0) + 1; });
        const labels: Record<string, string> = { TAMAMLANDI: "Tamamlandı", HAZIRLANIYOR: "Hazırlanıyor", YENI: "Bekliyor", "Onay Bekliyor": "Bekliyor", IPTAL: "İptal" };
        const result: { name: string; value: number }[] = [];
        Object.entries(map).forEach(([k, v]) => {
            const name = labels[k] || k;
            const existing = result.find(r => r.name === name);
            if (existing) existing.value += v; else result.push({ name, value: v });
        });
        return result.sort((a, b) => b.value - a.value);
    }, [siparisler]);

    // EXCEL EXPORT
    const excelExport = () => {
        const satirlar = [
            "DURMAZ B2B - RAPOR",
            `Dönem: ${donemTarih(donem, ozelBaslangic, ozelBitis).baslangic} - ${donemTarih(donem, ozelBaslangic, ozelBitis).bitis}`,
            "",
            `Toplam Ciro\t${fmtTL(toplamCiro)} TL`,
            `Toplam Tahsilat\t${fmtTL(toplamTahsilat)} TL`,
            `Açık Alacak\t${fmtTL(acikAlacak)} TL`,
            `Sipariş Sayısı\t${siparisSayisi}`,
            "",
            "EN ÇOK SİPARİŞ VEREN MÜŞTERİLER",
            "Müşteri\tSipariş Adedi\tToplam Tutar",
            ...enCokSiparisVeren.map(m => `${m.unvan}\t${m.adet}\t${fmtTL(m.tutar)} TL`),
            "",
            "AYLIK CİRO",
            "Ay\tTutar",
            ...aylikGrafik.map(a => `${a.ay}\t${fmtTL(a.tutar)} TL`),
        ];
        const blob = new Blob(["\uFEFF" + satirlar.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rapor_${new Date().toISOString().split("T")[0]}.xls`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Rapor indirildi!");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center" style={{ background: "var(--c-bg)" }}><span className="text-[12px] font-semibold text-[#64748b] tracking-widest uppercase">Sistem Doğrulanıyor</span></div>;

    if (!hasAccess) return (
        <main className="flex-1 flex flex-col items-center justify-center h-full" style={{ background: "var(--c-bg)" }}>
            <div className="w-16 h-16 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center mb-4"><i className="fas fa-lock text-2xl" /></div>
            <h1 className="text-[15px] font-semibold text-[#0f172a] mb-1">Erişim Engellendi</h1>
            <p className="text-[12px] text-[#64748b]">Bu sayfaya yalnızca Yönetici veya Muhasebe yetkisi ile erişilebilir.</p>
        </main>
    );

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* TOOLBAR */}
            <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                {(["hafta", "ay", "yil"] as Donem[]).map(d => (
                    <button key={d} onClick={() => setDonem(d)} className={donem === d && donem !== "ozel" ? "btn-primary" : "btn-secondary"}>
                        {d === "hafta" ? "Bu Hafta" : d === "ay" ? "Bu Ay" : "Bu Yıl"}
                    </button>
                ))}
                <button onClick={() => setDonem("ozel")} className={donem === "ozel" ? "btn-primary" : "btn-secondary"}>Özel Aralık</button>
                {donem === "ozel" && (
                    <>
                        <input type="date" value={ozelBaslangic} onChange={e => setOzelBaslangic(e.target.value)} className="input-kurumsal w-36" />
                        <span className="text-[10px] text-[#94a3b8]">—</span>
                        <input type="date" value={ozelBitis} onChange={e => setOzelBitis(e.target.value)} className="input-kurumsal w-36" />
                    </>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={excelExport} className="btn-secondary flex items-center gap-2"><i className="fas fa-file-excel text-[#059669] text-[10px]" /> EXCEL</button>
                    <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 hidden sm:flex"><i className="fas fa-print text-[10px]" /> YAZDIR</button>
                    {yukleniyor && <i className="fas fa-circle-notch fa-spin text-[#64748b]" />}
                </div>
            </div>

            {/* İÇERİK */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 custom-scrollbar">

                {/* ÖZET KARTLARI */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: "Toplam Ciro", value: `₺${fmtTL(toplamCiro)}`, color: "#0f172a", border: "border-l-blue-500" },
                        { label: "Toplam Tahsilat", value: `₺${fmtTL(toplamTahsilat)}`, color: "#059669", border: "border-l-emerald-500" },
                        { label: "Açık Alacak", value: `₺${fmtTL(acikAlacak)}`, color: "#dc2626", border: "border-l-red-500" },
                        { label: "Sipariş Sayısı", value: siparisSayisi.toString(), color: "#3b82f6", border: "border-l-blue-500" },
                    ].map((k, i) => (
                        <div key={i} className={`bg-white border border-slate-200 border-l-4 ${k.border} p-4`}>
                            <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">{k.label}</div>
                            <div className="text-2xl font-semibold tabular-nums" style={{ color: k.color }}>{k.value}</div>
                        </div>
                    ))}
                </div>

                {/* AYLIK CİRO GRAFİĞİ */}
                <div className="card-kurumsal">
                    <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                        <div>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Aylık Ciro Grafiği</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5 tracking-wide">Son 12 aylık ciro dağılımı</div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-medium text-[#94a3b8]">
                            <div className="w-3 h-3" style={{ background: "#1e293b" }} /> Ciro (TL)
                        </div>
                    </div>
                    <div className="p-4 md:p-5" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={aylikGrafik} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="ay" tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }} formatter={(value) => [`₺${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, "Ciro"]} />
                                <Bar dataKey="tutar" fill="#0f172a" radius={[2, 2, 0, 0]} maxBarSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* ALT BÖLÜM: 3 SÜTUN */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* EN ÇOK SİPARİŞ VEREN 5 MÜŞTERİ */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">En Çok Sipariş Veren Müşteriler</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Seçili dönemde ilk 5</div>
                        </div>
                        <div className="p-2">
                            {enCokSiparisVeren.length === 0 ? (
                                <div className="p-6 text-center text-[#94a3b8] text-[11px] font-semibold tracking-widest uppercase">Veri bulunamadı</div>
                            ) : enCokSiparisVeren.map((m, i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f8fafc] transition-colors" style={{ borderBottom: i < enCokSiparisVeren.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                    <div className="w-6 h-6 bg-[#f1f5f9] text-[#64748b] flex items-center justify-center text-[11px] font-semibold shrink-0">{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-semibold text-[#0f172a] truncate">{m.unvan}</div>
                                        <div className="text-[10px] text-[#94a3b8]">{m.adet} sipariş</div>
                                    </div>
                                    <div className="text-[12px] font-semibold text-[#0f172a] tabular-nums shrink-0">₺{fmtTL(m.tutar)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SİPARİŞ DURUM DAĞILIMI */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Sipariş Durum Dağılımı</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Seçili dönem bazında</div>
                        </div>
                        <div className="p-4" style={{ height: 260 }}>
                            {durumDagilimi.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[#94a3b8] text-[11px] font-semibold tracking-widest uppercase">Veri bulunamadı</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={durumDagilimi} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} %${((percent ?? 0) * 100).toFixed(0)}`} labelLine={false} style={{ fontSize: 10, fontWeight: 600 }}>
                                            {durumDagilimi.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                                        </Pie>
                                        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} itemStyle={{ color: "#f1f5f9", fontWeight: 700 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* HIZLI BİLGİLER */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Dönem Özeti</div>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { label: "Toplam Müşteri", value: firmalar.length.toString(), icon: "fa-users", color: "#3b82f6" },
                                { label: "Borçlu Müşteri", value: firmalar.filter(f => (Number(f.bakiye) || 0) > 0).length.toString(), icon: "fa-exclamation-circle", color: "#dc2626" },
                                { label: "Ortalama Sipariş Tutarı", value: siparisSayisi > 0 ? `₺${fmtTL(toplamCiro / siparisSayisi)}` : "—", icon: "fa-calculator", color: "#0f172a" },
                                { label: "Tahsilat Oranı", value: toplamCiro > 0 ? `%${((toplamTahsilat / toplamCiro) * 100).toFixed(1)}` : "—", icon: "fa-percentage", color: "#059669" },
                                { label: "İptal Edilen Sipariş", value: siparisler.filter(s => s.durum === "IPTAL").length.toString(), icon: "fa-ban", color: "#dc2626" },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: i < 4 ? "1px solid #f1f5f9" : "none" }}>
                                    <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ background: `${item.color}10`, color: item.color }}>
                                        <i className={`fas ${item.icon} text-[12px]`} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[11px] text-[#64748b] font-medium">{item.label}</div>
                                    </div>
                                    <div className="text-[13px] font-semibold text-[#0f172a] tabular-nums">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
