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
    const [kritikStokSayisi, setKritikStokSayisi] = useState(0);
    const [toplamBankaBakiye, setToplamBankaBakiye] = useState(0);
    const [vadesiYaklasanCek, setVadesiYaklasanCek] = useState(0);
    const [vadesiGecmisCek, setVadesiGecmisCek] = useState(0);
    const [bugunkuZiyaret, setBugunkuZiyaret] = useState(0);
    const [platinMusteri, setPlatinMusteri] = useState(0);
    // Hedef takibi
    const [hedefCiro, setHedefCiro] = useState(0);
    const [hedefSiparis, setHedefSiparis] = useState(0);
    const [hedefYeniMusteri, setHedefYeniMusteri] = useState(0);
    const [gercekCiro, setGercekCiro] = useState(0);
    const [gercekSiparis, setGercekSiparis] = useState(0);
    const [gercekYeniMusteri, setGercekYeniMusteri] = useState(0);
    const [hedefModalAcik, setHedefModalAcik] = useState(false);
    const [hFormCiro, setHFormCiro] = useState("");
    const [hFormSiparis, setHFormSiparis] = useState("");
    const [hFormMusteri, setHFormMusteri] = useState("");
    const [hedefKaydediliyor, setHedefKaydediliyor] = useState(false);

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
                const { data: stokData } = await supabase.from("urunler").select("stok_miktari, min_stok_miktari").eq("sahip_sirket_id", sirketId).eq("aktif", true).gt("min_stok_miktari", 0);
                if (stokData) { setKritikStokSayisi(stokData.filter(u => Number(u.stok_miktari) <= Number(u.min_stok_miktari)).length); }
                const { data: bankaData } = await supabase.from("banka_hesaplari").select("bakiye").eq("sirket_id", sirketId).eq("aktif", true);
                if (bankaData) { setToplamBankaBakiye(bankaData.reduce((t, h) => t + Number(h.bakiye), 0)); }
                const bugunStr = new Date().toISOString().split("T")[0];
                const yediGun = new Date(); yediGun.setDate(yediGun.getDate() + 7);
                const yediGunStr = yediGun.toISOString().split("T")[0];
                const { data: cekData } = await supabase.from("cek_senetler").select("vade_tarihi").eq("sirket_id", sirketId).eq("durum", "BEKLIYOR");
                if (cekData) {
                    setVadesiYaklasanCek(cekData.filter(c => c.vade_tarihi >= bugunStr && c.vade_tarihi <= yediGunStr).length);
                    setVadesiGecmisCek(cekData.filter(c => c.vade_tarihi < bugunStr).length);
                }
                const { count: ziyaretCount } = await supabase.from("musteri_ziyaretleri").select("id", { count: "exact", head: true }).eq("sirket_id", sirketId).eq("ziyaret_tarihi", bugunStr);
                setBugunkuZiyaret(ziyaretCount || 0);
                const { count: platinCount } = await supabase.from("firmalar").select("id", { count: "exact", head: true }).eq("sahip_sirket_id", sirketId).eq("musteri_seviyesi", "PLATİN");
                setPlatinMusteri(platinCount || 0);
                // Hedef takibi
                const simdi = new Date();
                const buAy = simdi.getMonth() + 1;
                const buYil = simdi.getFullYear();
                const ayBas = `${buYil}-${buAy.toString().padStart(2, "0")}-01`;
                const { data: hedefData } = await supabase.from("satis_hedefleri").select("*").eq("sirket_id", sirketId).eq("yil", buYil).eq("ay", buAy).single();
                if (hedefData) {
                    setHedefCiro(Number(hedefData.hedef_ciro) || 0);
                    setHedefSiparis(Number(hedefData.hedef_siparis_sayisi) || 0);
                    setHedefYeniMusteri(Number(hedefData.hedef_yeni_musteri) || 0);
                    setHFormCiro(String(hedefData.hedef_ciro || ""));
                    setHFormSiparis(String(hedefData.hedef_siparis_sayisi || ""));
                    setHFormMusteri(String(hedefData.hedef_yeni_musteri || ""));
                }
                // Bu ayki gerçekleşen değerler
                const buAySip = (sData || []).filter(s => s.created_at?.startsWith(ayBas.substring(0, 7)) && s.durum !== "IPTAL");
                setGercekSiparis(buAySip.length);
                setGercekCiro(buAySip.filter(s => s.durum === "TAMAMLANDI").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0));
                const { count: yeniMusteriCount } = await supabase.from("firmalar").select("id", { count: "exact", head: true }).eq("sahip_sirket_id", sirketId).gte("created_at", ayBas);
                setGercekYeniMusteri(yeniMusteriCount || 0);
            } catch { /* */ }
            setYukleniyor(false);
        }
        verileriTopla();
    }, [aktifSirket, kullaniciRol]);

    const bugun = new Date().toISOString().split("T")[0];
    const bugunkuSiparisler = useMemo(() => siparisler.filter(s => s.created_at?.startsWith(bugun)), [siparisler, bugun]);
    const bugunkuCiro = useMemo(() => bugunkuSiparisler.reduce((acc, s) => acc + parseTutar(s.toplam_tutar), 0), [bugunkuSiparisler]);
    const bekleyenSayisi = useMemo(() => siparisler.filter(s => s.durum === "YENI" || s.durum === "HAZIRLANIYOR" || s.durum === "Onay Bekliyor").length, [siparisler]);
    const marketOnayBekleyen = useMemo(() => siparisler.filter(s => s.durum === "MARKET_ONAYI_BEKLENIYOR").length, [siparisler]);

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
                <div className="metric-block">
                    <div className="metric-label">Market Onayı Bekleyen</div>
                    <div className="metric-value" style={{ color: marketOnayBekleyen > 0 ? "#dc2626" : "#f1f5f9" }}>{marketOnayBekleyen}</div>
                    <div className="metric-sub">mutabakat bekliyor</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Banka Bakiyesi</div>
                    <div className="metric-value" style={{ color: "#059669" }}>₺{fmtTL(toplamBankaBakiye)}</div>
                    <div className="metric-sub">toplam banka</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Bugünkü Ziyaretler</div>
                    <div className="metric-value" style={{ color: bugunkuZiyaret > 0 ? "#3b82f6" : "#94a3b8" }}>{bugunkuZiyaret}</div>
                    <div className="metric-sub">müşteri ziyareti</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Platin Müşteriler</div>
                    <div className="metric-value" style={{ color: platinMusteri > 0 ? "#7c3aed" : "#94a3b8" }}>{platinMusteri}</div>
                    <div className="metric-sub">en değerli</div>
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

                {marketOnayBekleyen > 0 && (
                    <div className="card-kurumsal" style={{ borderLeft: "3px solid #f59e0b" }}>
                        <div className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-amber-50 text-amber-500 flex items-center justify-center shrink-0"><i className="fas fa-clipboard-check" /></div>
                                <div>
                                    <div className="text-[12px] font-semibold text-[#0f172a]">Market Onayı Bekleyen Siparişler</div>
                                    <div className="text-[11px] text-[#64748b] mt-0.5"><span className="font-bold text-amber-600">{marketOnayBekleyen}</span> adet sipariş market onayı bekliyor</div>
                                </div>
                            </div>
                            <Link href="/" className="btn-primary flex items-center gap-2" style={{ background: "#f59e0b" }}><i className="fas fa-eye text-[10px]" /> SİPARİŞLERE GİT</Link>
                        </div>
                    </div>
                )}

                {kritikStokSayisi > 0 && (
                    <div className="card-kurumsal" style={{ borderLeft: "3px solid #dc2626" }}>
                        <div className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center shrink-0"><i className="fas fa-exclamation-triangle" /></div>
                                <div>
                                    <div className="text-[12px] font-semibold text-[#0f172a]">Kritik Stok Uyarısı</div>
                                    <div className="text-[11px] text-[#64748b] mt-0.5"><span className="font-bold text-[#dc2626]">{kritikStokSayisi}</span> ürün kritik stok seviyesinin altında</div>
                                </div>
                            </div>
                            <Link href="/stok" className="btn-primary flex items-center gap-2" style={{ background: "#dc2626" }}><i className="fas fa-box text-[10px]" /> STOKLARI İNCELE</Link>
                        </div>
                    </div>
                )}

                {(vadesiYaklasanCek > 0 || vadesiGecmisCek > 0) && (
                    <div className="card-kurumsal" style={{ borderLeft: `3px solid ${vadesiGecmisCek > 0 ? "#dc2626" : "#f59e0b"}` }}>
                        <div className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 flex items-center justify-center shrink-0 ${vadesiGecmisCek > 0 ? "bg-[#fef2f2] text-[#dc2626]" : "bg-amber-50 text-amber-500"}`}><i className="fas fa-money-check" /></div>
                                <div>
                                    <div className="text-[12px] font-semibold text-[#0f172a]">Çek / Senet Vade Uyarısı</div>
                                    <div className="text-[11px] text-[#64748b] mt-0.5">
                                        {vadesiGecmisCek > 0 && <><span className="font-bold text-[#dc2626]">{vadesiGecmisCek}</span> adet vadesi geçmiş</>}
                                        {vadesiGecmisCek > 0 && vadesiYaklasanCek > 0 && " · "}
                                        {vadesiYaklasanCek > 0 && <><span className="font-bold text-[#f59e0b]">{vadesiYaklasanCek}</span> adet vadesi yaklaşan</>}
                                    </div>
                                </div>
                            </div>
                            <Link href="/cek-senet" className="btn-primary flex items-center gap-2" style={{ background: vadesiGecmisCek > 0 ? "#dc2626" : "#f59e0b" }}><i className="fas fa-eye text-[10px]" /> İNCELE</Link>
                        </div>
                    </div>
                )}

                {/* HEDEF TAKİBİ */}
                {(hedefCiro > 0 || hedefSiparis > 0 || hedefYeniMusteri > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { label: "Aylık Ciro Hedefi", hedef: hedefCiro, gercek: gercekCiro, renk: "#059669", format: (v: number) => `₺${fmtTL(v)}` },
                            { label: "Aylık Sipariş Hedefi", hedef: hedefSiparis, gercek: gercekSiparis, renk: "#3b82f6", format: (v: number) => `${v} adet` },
                            { label: "Yeni Müşteri Hedefi", hedef: hedefYeniMusteri, gercek: gercekYeniMusteri, renk: "#7c3aed", format: (v: number) => `${v} müşteri` },
                        ].filter(h => h.hedef > 0).map((h, i) => {
                            const yuzde = h.hedef > 0 ? Math.min(Math.round((h.gercek / h.hedef) * 100), 100) : 0;
                            const asild = h.gercek >= h.hedef;
                            const kalan = h.hedef - h.gercek;
                            return (
                                <div key={i} className="card-kurumsal p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest">{h.label}</div>
                                        <span className={`text-[11px] font-bold ${asild ? "text-[#059669]" : "text-[#0f172a]"}`}>{yuzde}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-[#f1f5f9] mb-2">
                                        <div className="h-full transition-all duration-500" style={{ width: `${yuzde}%`, background: h.renk }} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold" style={{ color: h.renk }}>{h.format(h.gercek)}</span>
                                        <span className="text-[10px] text-[#94a3b8]">/ {h.format(h.hedef)}</span>
                                    </div>
                                    <div className={`text-[9px] font-semibold mt-1 ${asild ? "text-[#059669]" : "text-[#f59e0b]"}`}>
                                        {asild ? "Hedef aşıldı!" : `Hedefe ${h.label.includes("Ciro") ? `₺${fmtTL(kalan)}` : `${kalan}`} kaldı`}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {(hedefCiro === 0 && hedefSiparis === 0 && hedefYeniMusteri === 0) && (
                    <div className="card-kurumsal p-4 flex items-center justify-between">
                        <div>
                            <div className="text-[12px] font-semibold text-[#0f172a]">Aylık Hedef Belirleyin</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Ciro, sipariş ve yeni müşteri hedeflerinizi belirleyerek performansınızı takip edin</div>
                        </div>
                        <button onClick={() => setHedefModalAcik(true)} className="btn-primary text-[11px] flex items-center gap-1.5">
                            <i className="fas fa-bullseye text-[9px]" /> Hedef Belirle
                        </button>
                    </div>
                )}

                {(hedefCiro > 0 || hedefSiparis > 0 || hedefYeniMusteri > 0) && (
                    <div className="flex justify-end -mt-3">
                        <button onClick={() => setHedefModalAcik(true)} className="text-[10px] font-semibold text-[#3b82f6] hover:text-[#1d4ed8] uppercase tracking-wider">
                            <i className="fas fa-pen mr-1 text-[8px]" /> Hedefleri Düzenle
                        </button>
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

            {/* HEDEF BELİRLE MODALI */}
            {hedefModalAcik && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHedefModalAcik(false)}>
                    <div className="bg-white w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]"><i className="fas fa-bullseye mr-2 text-[#3b82f6]" />Bu Ay İçin Hedef Belirle</div>
                            <button onClick={() => setHedefModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-[10px] font-semibold text-[#059669] uppercase tracking-wider mb-1 block">Aylık Ciro Hedefi (TL)</label>
                                <input type="number" value={hFormCiro} onChange={e => setHFormCiro(e.target.value)} className="input-kurumsal w-full text-[14px] font-semibold" placeholder="Örn: 100000" min="0" step="1000" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#3b82f6] uppercase tracking-wider mb-1 block">Aylık Sipariş Hedefi (Adet)</label>
                                <input type="number" value={hFormSiparis} onChange={e => setHFormSiparis(e.target.value)} className="input-kurumsal w-full text-[14px] font-semibold" placeholder="Örn: 50" min="0" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#7c3aed] uppercase tracking-wider mb-1 block">Yeni Müşteri Hedefi (Adet)</label>
                                <input type="number" value={hFormMusteri} onChange={e => setHFormMusteri(e.target.value)} className="input-kurumsal w-full text-[14px] font-semibold" placeholder="Örn: 10" min="0" />
                            </div>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <button onClick={() => setHedefModalAcik(false)} className="btn-secondary text-[11px]">İptal</button>
                            <button disabled={hedefKaydediliyor} onClick={async () => {
                                if (!aktifSirket) return;
                                setHedefKaydediliyor(true);
                                const simdi = new Date();
                                const payload = {
                                    sirket_id: aktifSirket.id,
                                    yil: simdi.getFullYear(),
                                    ay: simdi.getMonth() + 1,
                                    hedef_ciro: Number(hFormCiro) || 0,
                                    hedef_siparis_sayisi: Number(hFormSiparis) || 0,
                                    hedef_yeni_musteri: Number(hFormMusteri) || 0,
                                };
                                const { data: existing } = await supabase.from("satis_hedefleri").select("id").eq("sirket_id", aktifSirket.id).eq("yil", payload.yil).eq("ay", payload.ay).single();
                                if (existing) {
                                    await supabase.from("satis_hedefleri").update(payload).eq("id", existing.id);
                                } else {
                                    await supabase.from("satis_hedefleri").insert(payload);
                                }
                                setHedefCiro(payload.hedef_ciro);
                                setHedefSiparis(payload.hedef_siparis_sayisi);
                                setHedefYeniMusteri(payload.hedef_yeni_musteri);
                                setHedefModalAcik(false);
                                setHedefKaydediliyor(false);
                            }} className="btn-primary text-[11px] flex items-center gap-1.5">
                                {hedefKaydediliyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-save text-[10px]" />}
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
