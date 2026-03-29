"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface SatisRaw { id: number; toplam_tutar: number; odeme_tipi: string; created_at: string; }
interface SatisKalemRaw { urun_adi: string; miktar: number; toplam_tutar: number; }
interface VeresiyeMusteri { id: number; ad_soyad: string; bakiye: number; }
interface KasaIslem { id: number; islem_tipi: string; kategori: string; tutar: number; created_at: string; }

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Donem = "hafta" | "ay" | "yil" | "ozel";

function donemTarih(donem: Donem, ozelBas?: string, ozelBit?: string): { baslangic: string; bitis: string } {
    const now = new Date();
    const bitis = ozelBit || now.toISOString().split("T")[0];
    if (donem === "ozel" && ozelBas) return { baslangic: ozelBas, bitis };
    if (donem === "hafta") { const d = new Date(now); d.setDate(d.getDate() - d.getDay() + 1); return { baslangic: d.toISOString().split("T")[0], bitis }; }
    if (donem === "ay") return { baslangic: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-01`, bitis };
    return { baslangic: `${now.getFullYear()}-01-01`, bitis };
}

const PIE_COLORS = ["#059669", "#dc2626", "#3b82f6", "#f59e0b", "#8b5cf6"];

export default function PortalRaporlar() {
    const { aktifSirket } = useAuth();
    const toast = useToast();

    const [yukleniyor, setYukleniyor] = useState(true);
    const [donem, setDonem] = useState<Donem>("ay");
    const [ozelBas, setOzelBas] = useState("");
    const [ozelBit, setOzelBit] = useState("");

    const [satislar, setSatislar] = useState<SatisRaw[]>([]);
    const [tumSatislar, setTumSatislar] = useState<SatisRaw[]>([]);
    const [kalemler, setKalemler] = useState<SatisKalemRaw[]>([]);
    const [veresiyeMusteriler, setVeresiyeMusteriler] = useState<VeresiyeMusteri[]>([]);
    const [kasaIslemleri, setKasaIslemleri] = useState<KasaIslem[]>([]);
    const [toptanciBakiye, setToptanciBakiye] = useState(0);

    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
        verileriGetir();
    }, [aktifSirket, donem, ozelBas, ozelBit]);

    async function verileriGetir() {
        if (!aktifSirket) return;
        setYukleniyor(true);
        try {
            const sid = aktifSirket.id;
            const { baslangic, bitis } = donemTarih(donem, ozelBas, ozelBit);

            const [sRes, tumRes, vRes, kRes, bRes] = await Promise.all([
                supabase.from("perakende_satislar").select("id, toplam_tutar, odeme_tipi, created_at").eq("sirket_id", sid).gte("created_at", baslangic).lte("created_at", bitis + "T23:59:59"),
                supabase.from("perakende_satislar").select("id, toplam_tutar, odeme_tipi, created_at").eq("sirket_id", sid).order("created_at", { ascending: false }),
                supabase.from("veresiye_musteriler").select("id, ad_soyad, bakiye").eq("sirket_id", sid),
                supabase.from("kasa_islemleri").select("id, islem_tipi, kategori, tutar, created_at").eq("sirket_id", sid).gte("created_at", baslangic).lte("created_at", bitis + "T23:59:59"),
                supabase.from("firmalar").select("bakiye").eq("sahip_sirket_id", sid),
            ]);

            setSatislar(sRes.data || []);
            setTumSatislar(tumRes.data || []);
            setVeresiyeMusteriler(vRes.data || []);
            setKasaIslemleri(kRes.data || []);

            // Dönemdeki satış kalemlerini çek
            const satisIds = (sRes.data || []).map(s => s.id);
            if (satisIds.length > 0) {
                const { data: kData } = await supabase.from("perakende_satis_kalemleri").select("urun_adi, miktar, toplam_tutar").in("satis_id", satisIds);
                setKalemler(kData || []);
            } else {
                setKalemler([]);
            }

            const topBakiye = (bRes.data || []).reduce((a: number, f: { bakiye?: number }) => a + Math.max(Number(f.bakiye) || 0, 0), 0);
            setToptanciBakiye(topBakiye);
        } catch { /* */ }
        setYukleniyor(false);
    }

    // HESAPLAMALAR
    const toplamSatis = useMemo(() => satislar.reduce((a, s) => a + (Number(s.toplam_tutar) || 0), 0), [satislar]);
    const toplamVeresiye = useMemo(() => veresiyeMusteriler.reduce((a, m) => a + Math.max(Number(m.bakiye) || 0, 0), 0), [veresiyeMusteriler]);
    const kasaBakiye = useMemo(() => kasaIslemleri.reduce((a, k) => a + (k.islem_tipi === "GELIR" ? Number(k.tutar) : -Number(k.tutar)), 0), [kasaIslemleri]);

    // GÜNLÜK SATIŞ GRAFİĞİ (son 30 gün)
    const gunlukGrafik = useMemo(() => {
        const result: { gun: string; tutar: number }[] = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().split("T")[0];
            const label = `${d.getDate()}.${d.getMonth() + 1}`;
            const toplam = tumSatislar.filter(s => s.created_at?.startsWith(key)).reduce((a, s) => a + (Number(s.toplam_tutar) || 0), 0);
            result.push({ gun: label, tutar: toplam });
        }
        return result;
    }, [tumSatislar]);

    // EN ÇOK SATAN 5 ÜRÜN
    const enCokSatan = useMemo(() => {
        const map: Record<string, { ad: string; adet: number; tutar: number }> = {};
        kalemler.forEach(k => {
            if (!map[k.urun_adi]) map[k.urun_adi] = { ad: k.urun_adi, adet: 0, tutar: 0 };
            map[k.urun_adi].adet += Number(k.miktar) || 0;
            map[k.urun_adi].tutar += Number(k.toplam_tutar) || 0;
        });
        return Object.values(map).sort((a, b) => b.tutar - a.tutar).slice(0, 5);
    }, [kalemler]);

    // EN ÇOK BORÇLU 5 VERESİYE MÜŞTERİ
    const enCokBorclu = useMemo(() =>
        [...veresiyeMusteriler].filter(m => Number(m.bakiye) > 0).sort((a, b) => Number(b.bakiye) - Number(a.bakiye)).slice(0, 5)
    , [veresiyeMusteriler]);

    // KASA GELİR/GİDER DAĞILIMI
    const kasaDagilim = useMemo(() => {
        const map: Record<string, number> = {};
        kasaIslemleri.forEach(k => {
            const label = k.kategori || (k.islem_tipi === "GELIR" ? "Diğer Gelir" : "Diğer Gider");
            map[label] = (map[label] || 0) + Number(k.tutar);
        });
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [kasaIslemleri]);

    // EXCEL EXPORT
    const excelExport = () => {
        const { baslangic, bitis } = donemTarih(donem, ozelBas, ozelBit);
        const satirlar = [
            "MARKET RAPORU",
            `Dönem: ${baslangic} - ${bitis}`,
            "",
            `Toplam Satış\t${fmtTL(toplamSatis)} TL`,
            `Veresiye Alacak\t${fmtTL(toplamVeresiye)} TL`,
            `Toptancıya Borç\t${fmtTL(toptanciBakiye)} TL`,
            `Kasa Bakiyesi\t${fmtTL(kasaBakiye)} TL`,
            "",
            "EN ÇOK SATAN ÜRÜNLER",
            "Ürün\tAdet\tTutar",
            ...enCokSatan.map(u => `${u.ad}\t${u.adet}\t${fmtTL(u.tutar)} TL`),
            "",
            "EN ÇOK BORÇLU MÜŞTERİLER",
            "Müşteri\tBorç",
            ...enCokBorclu.map(m => `${m.ad_soyad}\t${fmtTL(Number(m.bakiye))} TL`),
        ];
        const blob = new Blob(["\uFEFF" + satirlar.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `market_rapor_${new Date().toISOString().split("T")[0]}.xls`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Rapor indirildi!");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center" style={{ background: "var(--c-bg)" }}><span className="text-[12px] font-semibold text-[#64748b] tracking-widest uppercase">Sistem Doğrulanıyor</span></div>;

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
                        <input type="date" value={ozelBas} onChange={e => setOzelBas(e.target.value)} className="input-kurumsal w-36" />
                        <span className="text-[10px] text-[#94a3b8]">—</span>
                        <input type="date" value={ozelBit} onChange={e => setOzelBit(e.target.value)} className="input-kurumsal w-36" />
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
                        { label: "Toplam Satış", value: `₺${fmtTL(toplamSatis)}`, color: "#0f172a", border: "border-l-blue-500" },
                        { label: "Veresiye Alacak", value: `₺${fmtTL(toplamVeresiye)}`, color: "#dc2626", border: "border-l-red-500" },
                        { label: "Toptancıya Borç", value: `₺${fmtTL(toptanciBakiye)}`, color: "#f59e0b", border: "border-l-amber-500" },
                        { label: "Kasa Bakiyesi", value: `₺${fmtTL(kasaBakiye)}`, color: kasaBakiye >= 0 ? "#059669" : "#dc2626", border: "border-l-emerald-500" },
                    ].map((k, i) => (
                        <div key={i} className={`bg-white border border-slate-200 border-l-4 ${k.border} p-4`}>
                            <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">{k.label}</div>
                            <div className="text-2xl font-semibold tabular-nums" style={{ color: k.color }}>{k.value}</div>
                        </div>
                    ))}
                </div>

                {/* GÜNLÜK SATIŞ GRAFİĞİ */}
                <div className="card-kurumsal">
                    <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                        <div>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Günlük Satış Grafiği</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5 tracking-wide">Son 30 günlük satış tutarı</div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-medium text-[#94a3b8]">
                            <div className="w-3 h-3" style={{ background: "#06b6d4" }} /> Satış (TL)
                        </div>
                    </div>
                    <div className="p-4 md:p-5" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={gunlukGrafik} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="gun" tick={{ fontSize: 9, fontWeight: 600, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} interval={2} />
                                <YAxis tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }} formatter={(value) => [`₺${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, "Satış"]} />
                                <Bar dataKey="tutar" fill="#06b6d4" radius={[2, 2, 0, 0]} maxBarSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* ALT BÖLÜM: 3 SÜTUN */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* EN ÇOK SATAN 5 ÜRÜN */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">En Çok Satan Ürünler</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Seçili dönemde ilk 5</div>
                        </div>
                        <div className="p-2">
                            {enCokSatan.length === 0 ? (
                                <div className="p-6 text-center text-[#94a3b8] text-[11px] font-semibold tracking-widest uppercase">Veri bulunamadı</div>
                            ) : enCokSatan.map((u, i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f8fafc] transition-colors" style={{ borderBottom: i < enCokSatan.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                    <div className="w-6 h-6 bg-[#f1f5f9] text-[#64748b] flex items-center justify-center text-[11px] font-semibold shrink-0">{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-semibold text-[#0f172a] truncate">{u.ad}</div>
                                        <div className="text-[10px] text-[#94a3b8]">{u.adet} adet satıldı</div>
                                    </div>
                                    <div className="text-[12px] font-semibold text-[#0f172a] tabular-nums shrink-0">₺{fmtTL(u.tutar)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* KASA GELİR/GİDER DAĞILIMI */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Kasa Gelir/Gider Dağılımı</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Kategorilere göre</div>
                        </div>
                        <div className="p-4" style={{ height: 260 }}>
                            {kasaDagilim.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[#94a3b8] text-[11px] font-semibold tracking-widest uppercase">Veri bulunamadı</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={kasaDagilim} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} %${((percent ?? 0) * 100).toFixed(0)}`} labelLine={false} style={{ fontSize: 10, fontWeight: 600 }}>
                                            {kasaDagilim.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                                        </Pie>
                                        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} itemStyle={{ color: "#f1f5f9", fontWeight: 700 }} formatter={(value) => [`₺${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, ""]} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* EN ÇOK BORÇLU 5 VERESİYE MÜŞTERİ */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">En Borçlu Veresiye Müşterileri</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Bakiye sıralı ilk 5</div>
                        </div>
                        <div className="p-2">
                            {enCokBorclu.length === 0 ? (
                                <div className="p-6 text-center text-[#94a3b8] text-[11px] font-semibold tracking-widest uppercase">Borçlu müşteri yok</div>
                            ) : enCokBorclu.map((m, i) => (
                                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f8fafc] transition-colors" style={{ borderBottom: i < enCokBorclu.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                    <div className="w-6 h-6 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center text-[11px] font-semibold shrink-0">{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-semibold text-[#0f172a] truncate">{m.ad_soyad}</div>
                                    </div>
                                    <div className="text-[12px] font-semibold text-[#dc2626] tabular-nums shrink-0">₺{fmtTL(Number(m.bakiye))}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
