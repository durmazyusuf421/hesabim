"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface SiparisData { id: number; alici_firma_id?: number; toplam_tutar: string | number | null; durum: string; created_at?: string; siparis_no?: string; }
interface AylikVeri { ay: string; tutar: number; }

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

export default function AnaSayfa() {
    const { aktifSirket, kullanici, kullaniciRol, isYonetici } = useAuth();
    const [yukleniyor, setYukleniyor] = useState(true);
    const [siparisler, setSiparisler] = useState<SiparisData[]>([]);
    const [firmaMap, setFirmaMap] = useState<Record<number, string>>({});
    const [toplamMusteri, setToplamMusteri] = useState(0);
    const [bekleyenB2B, setBekleyenB2B] = useState(0);

    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
        if (!kullaniciRol.includes("YONETICI")) { setYukleniyor(false); return; }
        async function verileriTopla() {
            setYukleniyor(true);
            try {
                const sirketId = aktifSirket!.id;
                const { data: fData } = await supabase.from("firmalar").select("id, unvan").eq("sahip_sirket_id", sirketId);
                const map: Record<number, string> = {};
                if (fData) fData.forEach(f => { map[f.id] = f.unvan; });
                setFirmaMap(map);
                setToplamMusteri(fData?.length || 0);
                const { data: sData } = await supabase.from("siparisler").select("*").eq("satici_sirket_id", sirketId).order("created_at", { ascending: false });
                setSiparisler(sData || []);
                const { count } = await supabase.from("b2b_baglantilar").select("id", { count: "exact", head: true }).eq("toptanci_id", sirketId).eq("durum", "BEKLIYOR");
                setBekleyenB2B(count || 0);
            } catch { /* */ }
            setYukleniyor(false);
        }
        verileriTopla();
    }, [aktifSirket, kullaniciRol]);

    const bugun = new Date().toISOString().split("T")[0];
    const bugunkuSiparisler = useMemo(() => siparisler.filter(s => s.created_at?.startsWith(bugun)), [siparisler, bugun]);
    const bugunkuCiro = useMemo(() => bugunkuSiparisler.reduce((acc, s) => acc + parseTutar(s.toplam_tutar), 0), [bugunkuSiparisler]);
    const bekleyenSayisi = useMemo(() => siparisler.filter(s => s.durum === "YENI" || s.durum === "HAZIRLANIYOR" || s.durum === "Onay Bekliyor").length, [siparisler]);

    const aylikGrafik = useMemo((): AylikVeri[] => {
        const ayIsimleri = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
        const sonAltiAy: AylikVeri[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const ayKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            const ayIsim = `${ayIsimleri[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
            const ayToplam = siparisler.filter(s => s.created_at?.startsWith(ayKey) && s.durum !== "IPTAL").reduce((acc, s) => acc + parseTutar(s.toplam_tutar), 0);
            sonAltiAy.push({ ay: ayIsim, tutar: ayToplam });
        }
        return sonAltiAy;
    }, [siparisler]);

    const sonBesSiparis = useMemo(() => siparisler.slice(0, 5).map(s => ({ ...s, musteriAdi: (s.alici_firma_id && firmaMap[s.alici_firma_id]) || "Bilinmiyor" })), [siparisler, firmaMap]);

    if (!aktifSirket) return <div className="h-full flex items-center justify-center" style={{ background: "var(--c-bg)" }}><span className="text-[12px] font-semibold text-[#64748b] tracking-widest uppercase">Sistem Doğrulanıyor</span></div>;

    const durumBadge = (durum: string) => {
        const map: Record<string, string> = {
            "YENI": "badge-durum badge-bekliyor",
            "HAZIRLANIYOR": "badge-durum badge-hazirlaniyor",
            "TAMAMLANDI": "badge-durum badge-teslim",
            "IPTAL": "badge-durum badge-iptal",
        };
        return map[durum] || "badge-durum bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]";
    };

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            <div className="metric-bar shrink-0 flex-wrap">
                <div className="metric-block">
                    <div className="metric-label">Bugünkü Sipariş</div>
                    <div className="metric-value">{bugunkuSiparisler.length}</div>
                    <div className="metric-sub">adet sipariş geldi</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Bugünkü Ciro</div>
                    <div className="metric-value">₺{fmtTL(bugunkuCiro)}</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Bekleyen Sipariş</div>
                    <div className="metric-value" style={{ color: bekleyenSayisi > 0 ? "#f59e0b" : "#f1f5f9" }}>{bekleyenSayisi}</div>
                    <div className="metric-sub">işlem bekliyor</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Toplam Müşteri</div>
                    <div className="metric-value">{toplamMusteri}</div>
                    <div className="metric-sub">kayıtlı cari kart</div>
                </div>
                {yukleniyor && <div className="metric-block flex items-center"><i className="fas fa-circle-notch fa-spin text-[#475569] text-sm" /></div>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 custom-scrollbar">
                {bekleyenB2B > 0 && (
                    <div className="card-kurumsal" style={{ borderLeft: "3px solid #dc2626" }}>
                        <div className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center shrink-0"><i className="fas fa-handshake" /></div>
                                <div>
                                    <div className="text-[12px] font-semibold text-[#0f172a]">Bekleyen B2B Bağlantı İstekleri</div>
                                    <div className="text-[11px] text-[#64748b] mt-0.5"><span className="font-bold text-[#dc2626]">{bekleyenB2B}</span> adet market sizinle bağlantı kurmak istiyor</div>
                                </div>
                            </div>
                            <Link href="/cari?sekme=istekler" className="btn-primary flex items-center gap-2" style={{ background: "#dc2626" }}><i className="fas fa-eye text-[10px]" /> İNCELE</Link>
                        </div>
                    </div>
                )}

                <div className="card-kurumsal">
                    <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                        <div>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Aylık Satış Grafiği</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5 tracking-wide">Son 6 aylık ciro dağılımı</div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-medium text-[#94a3b8]">
                            <div className="w-3 h-3" style={{ background: "#1e293b" }} /> Ciro (TL)
                        </div>
                    </div>
                    <div className="p-4 md:p-5" style={{ minHeight: 220, height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={aylikGrafik} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="ay" tick={{ fontSize: 11, fontWeight: 600, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }} formatter={(value) => [`₺${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, "Ciro"]} />
                                <Bar dataKey="tutar" fill="#0f172a" radius={[2, 2, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2 card-kurumsal">
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Son Siparişler</div>
                            <Link href="/" className="text-[10px] font-semibold text-[#3b82f6] hover:text-[#1d4ed8] tracking-wide uppercase">Tümünü Gör <i className="fas fa-arrow-right ml-1 text-[8px]" /></Link>
                        </div>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="tbl-kurumsal">
                                <thead><tr><th>Fiş No</th><th>Müşteri / Ünvan</th><th className="text-right">Tutar (TL)</th><th className="text-center">Durum</th><th className="text-center">Tarih</th></tr></thead>
                                <tbody>
                                    {sonBesSiparis.length === 0 ? (
                                        <tr><td colSpan={5} className="p-6 text-center text-[#94a3b8] text-[11px] font-medium tracking-widest uppercase">Sipariş bulunamadı</td></tr>
                                    ) : (
                                        sonBesSiparis.map(s => (
                                            <tr key={s.id}>
                                                <td className="font-semibold text-[#1d4ed8]">{s.siparis_no || `#${s.id}`}</td>
                                                <td className="font-semibold text-[#0f172a]">{s.musteriAdi}</td>
                                                <td className="text-right font-semibold text-[#0f172a]" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTL(parseTutar(s.toplam_tutar))}</td>
                                                <td className="text-center"><span className={durumBadge(s.durum)}>{s.durum}</span></td>
                                                <td className="text-center text-[#94a3b8]">{s.created_at ? new Date(s.created_at).toLocaleDateString("tr-TR") : "-"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-2 p-3">
                            {sonBesSiparis.length === 0 ? (
                                <div className="p-6 text-center text-[#94a3b8] text-[11px] font-medium tracking-widest uppercase">Sipariş bulunamadı</div>
                            ) : (
                                sonBesSiparis.map(s => (
                                    <div key={s.id} className="p-3 border border-[#e2e8f0] space-y-1.5" style={{ background: "#f8fafc" }}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[12px] font-semibold text-[#1d4ed8]">{s.siparis_no || `#${s.id}`}</span>
                                            <span className={durumBadge(s.durum)}>{s.durum}</span>
                                        </div>
                                        <div className="text-[12px] font-semibold text-[#0f172a]">{s.musteriAdi}</div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-[#94a3b8]">{s.created_at ? new Date(s.created_at).toLocaleDateString("tr-TR") : "-"}</span>
                                            <span className="text-[13px] font-semibold text-[#0f172a]" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTL(parseTutar(s.toplam_tutar))} TL</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Hızlı İşlemler</div>
                        </div>
                        <div className="p-2 space-y-0.5">
                            {[
                                { href: "/", icon: "fa-plus", label: "Yeni Sipariş Fişi Oluştur", desc: "Toptan satış kaydı aç" },
                                { href: "/pos", icon: "fa-desktop", label: "Hızlı Satış (POS)", desc: "Kasayı aç" },
                                { href: "/tahsilat", icon: "fa-money-bill-wave", label: "Tahsilat / Ödeme Kaydet", desc: "Alacak tahsil et" },
                                { href: "/stok", icon: "fa-box", label: "Stok Kartları Yönetimi", desc: "Ürünleri düzenle" },
                                { href: "/faturalar", icon: "fa-file-invoice", label: "e-Fatura Düzenle", desc: "Yeni fatura oluştur" },
                            ].map((a, i) => (
                                <Link key={i} href={a.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f8fafc] transition-colors group" style={{ borderLeft: "2px solid transparent" }}
                                    onMouseEnter={e => (e.currentTarget.style.borderLeftColor = "#0f172a")}
                                    onMouseLeave={e => (e.currentTarget.style.borderLeftColor = "transparent")}>
                                    <div className="w-7 h-7 bg-[#f1f5f9] text-[#475569] flex items-center justify-center shrink-0 group-hover:bg-[#0f172a] group-hover:text-white transition-colors">
                                        <i className={`fas ${a.icon} text-[10px]`} />
                                    </div>
                                    <div>
                                        <div className="text-[12px] font-medium text-[#0f172a]">{a.label}</div>
                                        <div className="text-[10px] text-[#94a3b8]">{a.desc}</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
