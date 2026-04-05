"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface Sayim {
    id: number;
    sirket_id: number;
    sayim_adi: string;
    tarih: string;
    durum: string;
    aciklama: string | null;
    created_at: string;
}

interface SayimKalemi {
    id: number;
    sayim_id: number;
    urun_id: number;
    sistemdeki_miktar: number;
    sayilan_miktar: number;
    fark: number;
    urun_adi?: string;
    birim?: string;
}

const fmtN = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function StokSayimSayfasi() {
    const { aktifSirket, kullaniciRol, isYonetici, isDepocu } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();

    const [sayimlar, setSayimlar] = useState<Sayim[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);

    // Yeni sayım modal
    const [yeniModal, setYeniModal] = useState(false);
    const [formAdi, setFormAdi] = useState("");
    const [formTarih, setFormTarih] = useState(new Date().toISOString().split("T")[0]);
    const [formAciklama, setFormAciklama] = useState("");
    const [kayitYukleniyor, setKayitYukleniyor] = useState(false);

    // Detay modal
    const [detayModal, setDetayModal] = useState(false);
    const [seciliSayim, setSeciliSayim] = useState<Sayim | null>(null);
    const [kalemler, setKalemler] = useState<SayimKalemi[]>([]);
    const [kalemYukleniyor, setKalemYukleniyor] = useState(false);
    const [tamamlaniyorMu, setTamamlaniyorMu] = useState(false);
    const [kalemArama, setKalemArama] = useState("");

    const hasAccess = isYonetici || isDepocu || aktifSirket?.rol === "PERAKENDE";

    const verileriGetir = useCallback(async () => {
        if (!aktifSirket) return;
        setYukleniyor(true);
        const { data } = await supabase.from("stok_sayimlari").select("*").eq("sirket_id", aktifSirket.id).order("created_at", { ascending: false });
        setSayimlar(data || []);
        setYukleniyor(false);
    }, [aktifSirket]);

    useEffect(() => {
        if (!aktifSirket) return;
        verileriGetir();
    }, [aktifSirket, verileriGetir]);

    // Özet
    const devamEdenSayisi = useMemo(() => sayimlar.filter(s => s.durum === "DEVAM").length, [sayimlar]);
    const tamamlananSayisi = useMemo(() => sayimlar.filter(s => s.durum === "TAMAMLANDI").length, [sayimlar]);
    const sonTamamlanan = useMemo(() => sayimlar.find(s => s.durum === "TAMAMLANDI"), [sayimlar]);

    // Yeni sayım başlat
    const sayimBaslat = async () => {
        if (!aktifSirket || !formAdi.trim()) { toast.error("Sayım adı zorunludur"); return; }
        setKayitYukleniyor(true);
        try {
            const { data: sayimData, error: sErr } = await supabase.from("stok_sayimlari").insert({
                sirket_id: aktifSirket.id,
                sayim_adi: formAdi.trim(),
                tarih: formTarih,
                aciklama: formAciklama.trim() || null,
            }).select().single();
            if (sErr) throw sErr;

            // Tüm aktif ürünleri ekle
            const { data: urunData } = await supabase.from("urunler").select("id, stok_miktari").eq("sahip_sirket_id", aktifSirket.id).eq("aktif", true);
            if (urunData && urunData.length > 0) {
                const kalemVerileri = urunData.map(u => ({
                    sayim_id: sayimData.id,
                    urun_id: u.id,
                    sistemdeki_miktar: Number(u.stok_miktari) || 0,
                    sayilan_miktar: 0,
                    fark: -(Number(u.stok_miktari) || 0),
                }));
                await supabase.from("stok_sayim_kalemleri").insert(kalemVerileri);
            }

            toast.success(`Sayım başlatıldı: ${urunData?.length || 0} ürün eklendi`);
            setYeniModal(false);
            await verileriGetir();
            // Otomatik olarak detayı aç
            sayimDetayAc(sayimData);
        } catch {
            toast.error("Sayım başlatılamadı");
        }
        setKayitYukleniyor(false);
    };

    // Sayım detayını aç
    const sayimDetayAc = async (sayim: Sayim) => {
        setSeciliSayim(sayim);
        setDetayModal(true);
        setKalemYukleniyor(true);
        setKalemArama("");
        const { data } = await supabase.from("stok_sayim_kalemleri").select("*, urunler(urun_adi, birim)").eq("sayim_id", sayim.id).order("id");
        const kalemlerMapped: SayimKalemi[] = (data || []).map((k: Record<string, unknown>) => ({
            id: k.id as number,
            sayim_id: k.sayim_id as number,
            urun_id: k.urun_id as number,
            sistemdeki_miktar: Number(k.sistemdeki_miktar) || 0,
            sayilan_miktar: Number(k.sayilan_miktar) || 0,
            fark: Number(k.fark) || 0,
            urun_adi: (k.urunler as Record<string, string>)?.urun_adi || "Bilinmiyor",
            birim: (k.urunler as Record<string, string>)?.birim || "Adet",
        }));
        setKalemler(kalemlerMapped);
        setKalemYukleniyor(false);
    };

    // Sayılan miktar güncelle
    const sayilanMiktarGuncelle = (kalemId: number, yeniMiktar: number) => {
        setKalemler(prev => prev.map(k => {
            if (k.id !== kalemId) return k;
            const fark = yeniMiktar - k.sistemdeki_miktar;
            return { ...k, sayilan_miktar: yeniMiktar, fark };
        }));
    };

    // Tekil kaydet
    const kalemKaydet = async (kalem: SayimKalemi) => {
        await supabase.from("stok_sayim_kalemleri").update({
            sayilan_miktar: kalem.sayilan_miktar,
            fark: kalem.fark,
        }).eq("id", kalem.id);
    };

    // Sayımı tamamla
    const sayimiTamamla = () => {
        if (!seciliSayim) return;
        const farkliKalemler = kalemler.filter(k => k.fark !== 0);
        onayla({
            baslik: "Sayımı Tamamla",
            mesaj: `"${seciliSayim.sayim_adi}" sayımını tamamlamak istediğinize emin misiniz?`,
            altMesaj: `${farkliKalemler.length} üründe fark tespit edildi. Stoklar güncellenecek ve hareketler kaydedilecektir.`,
            onayMetni: "Tamamla",
            tehlikeli: false,
            onOnayla: async () => {
                setTamamlaniyorMu(true);
                try {
                    // Tüm kalemleri kaydet
                    for (const k of kalemler) {
                        await supabase.from("stok_sayim_kalemleri").update({
                            sayilan_miktar: k.sayilan_miktar,
                            fark: k.fark,
                        }).eq("id", k.id);
                    }

                    // Farklı olanlar için stok güncelle ve hareket kaydet
                    for (const k of farkliKalemler) {
                        // Stok güncelle
                        await supabase.from("urunler").update({ stok_miktari: k.sayilan_miktar }).eq("id", k.urun_id);
                        // Stok hareketi kaydet
                        await supabase.from("stok_hareketleri").insert({
                            sirket_id: aktifSirket!.id,
                            urun_id: k.urun_id,
                            islem_tipi: k.fark > 0 ? "GIRIS" : "CIKIS",
                            miktar: Math.abs(k.fark),
                            aciklama: `Stok Sayımı: ${seciliSayim.sayim_adi} (Fark: ${k.fark > 0 ? "+" : ""}${fmtN(k.fark)})`,
                            islem_yapan: "Sistem (Sayım)",
                        });
                    }

                    // Sayım durumunu güncelle
                    await supabase.from("stok_sayimlari").update({ durum: "TAMAMLANDI" }).eq("id", seciliSayim.id);

                    toast.success(`Sayım tamamlandı! ${farkliKalemler.length} üründe stok güncellendi.`);
                    setDetayModal(false);
                    await verileriGetir();
                } catch {
                    toast.error("Sayım tamamlanırken hata oluştu");
                }
                setTamamlaniyorMu(false);
            },
        });
    };

    // Sayım iptal
    const sayimIptal = (sayim: Sayim) => {
        onayla({
            baslik: "Sayımı İptal Et",
            mesaj: `"${sayim.sayim_adi}" sayımını iptal etmek istediğinize emin misiniz?`,
            onayMetni: "İptal Et",
            tehlikeli: true,
            onOnayla: async () => {
                await supabase.from("stok_sayim_kalemleri").delete().eq("sayim_id", sayim.id);
                await supabase.from("stok_sayimlari").update({ durum: "IPTAL" }).eq("id", sayim.id);
                toast.success("Sayım iptal edildi");
                if (seciliSayim?.id === sayim.id) setDetayModal(false);
                await verileriGetir();
            },
        });
    };

    const durumBadge = (durum: string) => {
        if (durum === "DEVAM") return { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Devam Ediyor" };
        if (durum === "TAMAMLANDI") return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Tamamlandı" };
        return { cls: "bg-red-50 text-red-700 border-red-200", label: "İptal" };
    };

    const filtreliKalemler = useMemo(() => {
        if (!kalemArama.trim()) return kalemler;
        const q = kalemArama.toLowerCase();
        return kalemler.filter(k => k.urun_adi?.toLowerCase().includes(q));
    }, [kalemler, kalemArama]);

    if (!aktifSirket) return null;

    if (!hasAccess) {
        return (
            <main className="flex-1 flex items-center justify-center" style={{ background: "var(--c-bg)" }}>
                <div className="text-center">
                    <i className="fas fa-lock text-[32px] text-[#cbd5e1] mb-3" />
                    <div className="text-[13px] font-semibold text-[#64748b]">Bu sayfaya erişim yetkiniz yok</div>
                    <div className="text-[11px] text-[#94a3b8] mt-1">Yönetici veya Depocu yetkisi gereklidir</div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* Metric Bar */}
            <div className="metric-bar shrink-0 flex-wrap">
                <div className="metric-block">
                    <div className="metric-label">Devam Eden</div>
                    <div className="metric-value" style={{ color: devamEdenSayisi > 0 ? "#f59e0b" : "#94a3b8" }}>{devamEdenSayisi}</div>
                    <div className="metric-sub">aktif sayım</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Tamamlanan</div>
                    <div className="metric-value" style={{ color: "#059669" }}>{tamamlananSayisi}</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Son Sayım Tarihi</div>
                    <div className="metric-value text-[14px]">{sonTamamlanan ? new Date(sonTamamlanan.tarih).toLocaleDateString("tr-TR") : "—"}</div>
                </div>
                {yukleniyor && <div className="metric-block flex items-center"><i className="fas fa-circle-notch fa-spin text-[#475569] text-sm" /></div>}
            </div>

            {/* Toolbar */}
            <div className="shrink-0 px-4 md:px-5 py-3 flex items-center gap-3" style={{ background: "white", borderBottom: "1px solid var(--c-border)" }}>
                <button onClick={() => { setFormAdi(""); setFormTarih(new Date().toISOString().split("T")[0]); setFormAciklama(""); setYeniModal(true); }} className="btn-primary flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                    <i className="fas fa-plus text-[9px]" /> Yeni Sayım Başlat
                </button>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {yukleniyor ? (
                    <div className="flex items-center justify-center py-16"><i className="fas fa-circle-notch fa-spin text-[#475569] text-lg" /></div>
                ) : sayimlar.length === 0 ? (
                    <div className="text-center py-16">
                        <i className="fas fa-clipboard-check text-[36px] text-[#e2e8f0] mb-3" />
                        <div className="text-[12px] font-semibold text-[#94a3b8]">Henüz stok sayımı yapılmamış</div>
                    </div>
                ) : (
                    <div className="hidden md:block">
                        <table className="tbl-kurumsal">
                            <thead>
                                <tr>
                                    <th>Sayım Adı</th>
                                    <th className="text-center">Tarih</th>
                                    <th className="text-center">Durum</th>
                                    <th>Açıklama</th>
                                    <th className="text-center">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sayimlar.filter(s => s.durum !== "IPTAL").map(s => {
                                    const badge = durumBadge(s.durum);
                                    return (
                                        <tr key={s.id}>
                                            <td className="font-semibold text-[#0f172a]">{s.sayim_adi}</td>
                                            <td className="text-center text-[#64748b]">{new Date(s.tarih).toLocaleDateString("tr-TR")}</td>
                                            <td className="text-center"><span className={`badge-durum ${badge.cls}`}>{badge.label}</span></td>
                                            <td className="text-[#94a3b8]">{s.aciklama || "—"}</td>
                                            <td className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button onClick={() => sayimDetayAc(s)} className="text-[9px] font-semibold px-2 py-1 text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors">
                                                        <i className={`fas ${s.durum === "DEVAM" ? "fa-pen" : "fa-eye"} text-[8px] mr-1`} />
                                                        {s.durum === "DEVAM" ? "Sayıma Devam" : "Görüntüle"}
                                                    </button>
                                                    {s.durum === "DEVAM" && (
                                                        <button onClick={() => sayimIptal(s)} className="text-[9px] font-semibold px-2 py-1 text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors">
                                                            <i className="fas fa-times text-[8px]" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Mobile Cards */}
                {!yukleniyor && sayimlar.length > 0 && (
                    <div className="md:hidden space-y-2 p-3">
                        {sayimlar.filter(s => s.durum !== "IPTAL").map(s => {
                            const badge = durumBadge(s.durum);
                            return (
                                <div key={s.id} className="p-3 border border-[#e2e8f0] space-y-2" style={{ background: "#f8fafc" }}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-semibold text-[#0f172a]">{s.sayim_adi}</span>
                                        <span className={`badge-durum ${badge.cls}`}>{badge.label}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-[#94a3b8]">{new Date(s.tarih).toLocaleDateString("tr-TR")}</span>
                                        <button onClick={() => sayimDetayAc(s)} className="text-[9px] font-semibold px-2 py-1 text-[#475569] border border-[#e2e8f0]">
                                            <i className={`fas ${s.durum === "DEVAM" ? "fa-pen" : "fa-eye"} text-[8px] mr-1`} />
                                            {s.durum === "DEVAM" ? "Devam" : "Görüntüle"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Yeni Sayım Modal */}
            {yeniModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setYeniModal(false)}>
                    <div className="bg-white w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Yeni Stok Sayımı</div>
                            <button onClick={() => setYeniModal(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Sayım Adı *</label>
                                <input type="text" value={formAdi} onChange={e => setFormAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Örn: Nisan 2026 Sayımı" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Tarih</label>
                                <input type="date" value={formTarih} onChange={e => setFormTarih(e.target.value)} className="input-kurumsal w-full" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Açıklama</label>
                                <input type="text" value={formAciklama} onChange={e => setFormAciklama(e.target.value)} className="input-kurumsal w-full" placeholder="Not..." />
                            </div>
                            <div className="p-3 bg-amber-50 border border-amber-200">
                                <div className="text-[10px] font-semibold text-amber-700"><i className="fas fa-info-circle mr-1" /> Sayım başlatıldığında tüm aktif ürünler mevcut stok miktarlarıyla listeye eklenir.</div>
                            </div>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <button onClick={() => setYeniModal(false)} className="btn-secondary text-[11px]">İptal</button>
                            <button onClick={sayimBaslat} disabled={kayitYukleniyor} className="btn-primary text-[11px] flex items-center gap-1.5">
                                {kayitYukleniyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-play text-[10px]" />}
                                Sayımı Başlat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detay Modal */}
            {detayModal && seciliSayim && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-5xl overflow-hidden flex flex-col">
                        <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <div>
                                <div className="text-[13px] font-semibold text-[#0f172a] flex items-center gap-2">
                                    <i className="fas fa-clipboard-check text-[#3b82f6]" /> {seciliSayim.sayim_adi}
                                </div>
                                <div className="text-[10px] text-[#94a3b8] mt-0.5">
                                    {new Date(seciliSayim.tarih).toLocaleDateString("tr-TR")} · {kalemler.length} ürün
                                    {seciliSayim.durum === "DEVAM" && <span className="ml-2 text-amber-600 font-semibold">Sayım Devam Ediyor</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {seciliSayim.durum === "DEVAM" && (
                                    <button onClick={sayimiTamamla} disabled={tamamlaniyorMu} className="btn-primary text-[11px] flex items-center gap-1.5">
                                        {tamamlaniyorMu ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-check text-[10px]" />}
                                        Sayımı Tamamla
                                    </button>
                                )}
                                <button onClick={() => setDetayModal(false)} className="w-8 h-8 flex items-center justify-center bg-slate-200 hover:bg-red-100 transition-colors text-slate-600 hover:text-red-600"><i className="fas fa-times" /></button>
                            </div>
                        </div>

                        {/* Arama */}
                        <div className="px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="relative">
                                <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8]" />
                                <input type="text" value={kalemArama} onChange={e => setKalemArama(e.target.value)} placeholder="Ürün ara..." className="input-kurumsal w-full pl-7 text-[11px] h-8" />
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {kalemYukleniyor ? (
                                <div className="flex items-center justify-center py-12"><i className="fas fa-circle-notch fa-spin text-[#475569]" /></div>
                            ) : (
                                <table className="tbl-kurumsal">
                                    <thead>
                                        <tr>
                                            <th>Ürün Adı</th>
                                            <th>Birim</th>
                                            <th className="text-right">Sistemdeki</th>
                                            <th className="text-right w-32">Sayılan</th>
                                            <th className="text-right">Fark</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtreliKalemler.map(k => (
                                            <tr key={k.id} className={k.fark !== 0 ? (k.fark > 0 ? "bg-emerald-50/50" : "bg-red-50/50") : ""}>
                                                <td className="font-semibold text-[#0f172a]">{k.urun_adi}</td>
                                                <td className="text-[#64748b]">{k.birim}</td>
                                                <td className="text-right tabular-nums text-[#475569]">{fmtN(k.sistemdeki_miktar)}</td>
                                                <td className="text-right p-1">
                                                    {seciliSayim.durum === "DEVAM" ? (
                                                        <input
                                                            type="number"
                                                            value={k.sayilan_miktar}
                                                            onChange={e => sayilanMiktarGuncelle(k.id, Number(e.target.value))}
                                                            onBlur={() => kalemKaydet(k)}
                                                            className="input-kurumsal w-full text-right text-[12px] font-semibold"
                                                            min="0"
                                                            step="1"
                                                        />
                                                    ) : (
                                                        <span className="tabular-nums font-semibold">{fmtN(k.sayilan_miktar)}</span>
                                                    )}
                                                </td>
                                                <td className={`text-right tabular-nums font-bold ${k.fark > 0 ? "text-[#059669]" : k.fark < 0 ? "text-[#dc2626]" : "text-[#94a3b8]"}`}>
                                                    {k.fark > 0 ? "+" : ""}{fmtN(k.fark)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Alt özet */}
                        <div className="px-4 py-2 shrink-0 flex items-center justify-between flex-wrap gap-2" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                            <div className="flex items-center gap-4 text-[11px]">
                                <span className="text-[#94a3b8]">Toplam: <span className="font-semibold text-[#0f172a]">{kalemler.length}</span> ürün</span>
                                <span className="text-[#059669]">Fazla: <span className="font-semibold">{kalemler.filter(k => k.fark > 0).length}</span></span>
                                <span className="text-[#dc2626]">Eksik: <span className="font-semibold">{kalemler.filter(k => k.fark < 0).length}</span></span>
                                <span className="text-[#94a3b8]">Eşit: <span className="font-semibold">{kalemler.filter(k => k.fark === 0).length}</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <OnayModal />
        </main>
    );
}
