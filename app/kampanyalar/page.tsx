"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface Kampanya {
    id: number;
    sirket_id: number;
    kampanya_adi: string;
    aciklama: string | null;
    indirim_tipi: string;
    indirim_degeri: number;
    baslangic_tarihi: string;
    bitis_tarihi: string;
    min_siparis_tutari: number;
    aktif: boolean;
    uygulama_alani: string;
    created_at: string;
}

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function KampanyalarSayfasi() {
    const { aktifSirket, isYonetici } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();

    const [kampanyalar, setKampanyalar] = useState<Kampanya[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [arama, setArama] = useState("");

    // Modal
    const [modalAcik, setModalAcik] = useState(false);
    const [duzenleKayit, setDuzenleKayit] = useState<Kampanya | null>(null);
    const [kayitYukleniyor, setKayitYukleniyor] = useState(false);

    // Form
    const [formAdi, setFormAdi] = useState("");
    const [formAciklama, setFormAciklama] = useState("");
    const [formTip, setFormTip] = useState<"YUZDE" | "TUTAR">("YUZDE");
    const [formDeger, setFormDeger] = useState("");
    const [formBaslangic, setFormBaslangic] = useState("");
    const [formBitis, setFormBitis] = useState("");
    const [formMinTutar, setFormMinTutar] = useState("");
    const [formUygulamaAlani, setFormUygulamaAlani] = useState("TUMU");
    const [formAktif, setFormAktif] = useState(true);

    const sirketId = aktifSirket?.id;

    const verileriGetir = useCallback(async () => {
        if (!sirketId) return;
        setYukleniyor(true);
        const { data, error } = await supabase.from("kampanyalar").select("*").eq("sirket_id", sirketId).order("created_at", { ascending: false });
        if (error) toast.error("Kampanyalar yüklenemedi");
        else setKampanyalar(data || []);
        setYukleniyor(false);
    }, [sirketId]);

    useEffect(() => {
        if (!sirketId) return;
        verileriGetir();
    }, [sirketId, verileriGetir]);

    const bugun = new Date().toISOString().split("T")[0];
    const aktifSayisi = useMemo(() => kampanyalar.filter(k => k.aktif && k.bitis_tarihi >= bugun).length, [kampanyalar, bugun]);
    const suresiDolanSayisi = useMemo(() => kampanyalar.filter(k => k.aktif && k.bitis_tarihi < bugun).length, [kampanyalar, bugun]);

    const filtreli = useMemo(() => {
        if (!arama.trim()) return kampanyalar;
        const q = arama.toLowerCase();
        return kampanyalar.filter(k => k.kampanya_adi.toLowerCase().includes(q) || (k.aciklama && k.aciklama.toLowerCase().includes(q)));
    }, [kampanyalar, arama]);

    const modalAc = (kayit?: Kampanya) => {
        if (kayit) {
            setDuzenleKayit(kayit);
            setFormAdi(kayit.kampanya_adi);
            setFormAciklama(kayit.aciklama || "");
            setFormTip(kayit.indirim_tipi as "YUZDE" | "TUTAR");
            setFormDeger(String(kayit.indirim_degeri));
            setFormBaslangic(kayit.baslangic_tarihi);
            setFormBitis(kayit.bitis_tarihi);
            setFormMinTutar(String(kayit.min_siparis_tutari || ""));
            setFormUygulamaAlani(kayit.uygulama_alani);
            setFormAktif(kayit.aktif);
        } else {
            setDuzenleKayit(null);
            setFormAdi(""); setFormAciklama(""); setFormTip("YUZDE"); setFormDeger("");
            setFormBaslangic(""); setFormBitis(""); setFormMinTutar(""); setFormUygulamaAlani("TUMU"); setFormAktif(true);
        }
        setModalAcik(true);
    };

    const kaydet = async () => {
        if (!aktifSirket) return;
        if (!formAdi.trim()) { toast.error("Kampanya adı zorunludur"); return; }
        if (!formDeger || Number(formDeger) <= 0) { toast.error("İndirim değeri giriniz"); return; }
        if (!formBaslangic || !formBitis) { toast.error("Tarih aralığı zorunludur"); return; }
        if (formTip === "YUZDE" && Number(formDeger) > 100) { toast.error("Yüzde değeri 100'den büyük olamaz"); return; }

        setKayitYukleniyor(true);
        const payload = {
            sirket_id: aktifSirket.id,
            kampanya_adi: formAdi.trim(),
            aciklama: formAciklama.trim() || null,
            indirim_tipi: formTip,
            indirim_degeri: Number(formDeger),
            baslangic_tarihi: formBaslangic,
            bitis_tarihi: formBitis,
            min_siparis_tutari: Number(formMinTutar) || 0,
            uygulama_alani: formUygulamaAlani,
            aktif: formAktif,
        };

        if (duzenleKayit) {
            const { error } = await supabase.from("kampanyalar").update(payload).eq("id", duzenleKayit.id);
            if (error) toast.error("Güncelleme başarısız");
            else { toast.success("Kampanya güncellendi"); setModalAcik(false); await verileriGetir(); }
        } else {
            const { error } = await supabase.from("kampanyalar").insert(payload);
            if (error) toast.error("Kampanya eklenemedi");
            else { toast.success("Yeni kampanya oluşturuldu"); setModalAcik(false); await verileriGetir(); }
        }
        setKayitYukleniyor(false);
    };

    const aktifPasifToggle = async (k: Kampanya) => {
        const { error } = await supabase.from("kampanyalar").update({ aktif: !k.aktif }).eq("id", k.id);
        if (error) toast.error("İşlem başarısız");
        else { toast.success(k.aktif ? "Kampanya pasife alındı" : "Kampanya aktife alındı"); await verileriGetir(); }
    };

    const kampanyaSil = (k: Kampanya) => {
        onayla({
            baslik: "Kampanya Sil",
            mesaj: `"${k.kampanya_adi}" kampanyasını silmek istediğinize emin misiniz?`,
            onayMetni: "Sil",
            tehlikeli: true,
            onOnayla: async () => {
                const { error } = await supabase.from("kampanyalar").delete().eq("id", k.id);
                if (error) toast.error("Silinemedi");
                else { toast.success("Kampanya silindi"); await verileriGetir(); }
            },
        });
    };

    const durumBadge = (k: Kampanya) => {
        if (!k.aktif) return { cls: "bg-gray-50 text-gray-500 border-gray-200", label: "Pasif" };
        if (k.bitis_tarihi < bugun) return { cls: "bg-red-50 text-red-700 border-red-200", label: "Süresi Doldu" };
        if (k.baslangic_tarihi > bugun) return { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Başlamadı" };
        return { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Aktif" };
    };

    if (!aktifSirket) return null;

    if (!isYonetici) {
        return (
            <main className="flex-1 flex items-center justify-center" style={{ background: "var(--c-bg)" }}>
                <div className="text-center">
                    <i className="fas fa-lock text-[32px] text-[#cbd5e1] mb-3" />
                    <div className="text-[13px] font-semibold text-[#64748b]">Bu sayfaya erişim yetkiniz yok</div>
                    <div className="text-[11px] text-[#94a3b8] mt-1">Yönetici yetkisi gereklidir</div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* Metric Bar */}
            <div className="metric-bar shrink-0 flex-wrap">
                <div className="metric-block">
                    <div className="metric-label">Aktif Kampanya</div>
                    <div className="metric-value" style={{ color: "#059669" }}>{aktifSayisi}</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Süresi Dolan</div>
                    <div className="metric-value" style={{ color: suresiDolanSayisi > 0 ? "#dc2626" : "#94a3b8" }}>{suresiDolanSayisi}</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Toplam Kampanya</div>
                    <div className="metric-value">{kampanyalar.length}</div>
                </div>
                {yukleniyor && <div className="metric-block flex items-center"><i className="fas fa-circle-notch fa-spin text-[#475569] text-sm" /></div>}
            </div>

            {/* Kontrol Çubuğu */}
            <div className="shrink-0 px-4 md:px-5 py-3 flex items-center gap-3" style={{ background: "white", borderBottom: "1px solid var(--c-border)" }}>
                <button onClick={() => modalAc()} className="btn-primary flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                    <i className="fas fa-plus text-[9px]" /> Yeni Kampanya
                </button>
                <div className="flex-1 relative">
                    <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8]" />
                    <input type="text" value={arama} onChange={e => setArama(e.target.value)} placeholder="Kampanya ara..." className="input-kurumsal w-full pl-7 text-[11px] h-8" />
                </div>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {yukleniyor ? (
                    <div className="flex items-center justify-center py-16"><i className="fas fa-circle-notch fa-spin text-[#475569] text-lg" /></div>
                ) : filtreli.length === 0 ? (
                    <div className="text-center py-16">
                        <i className="fas fa-tags text-[36px] text-[#e2e8f0] mb-3" />
                        <div className="text-[12px] font-semibold text-[#94a3b8]">Kampanya bulunamadı</div>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block">
                            <table className="tbl-kurumsal">
                                <thead>
                                    <tr>
                                        <th>Kampanya Adı</th>
                                        <th className="text-center">İndirim</th>
                                        <th className="text-center">Tarih Aralığı</th>
                                        <th className="text-right">Min. Tutar</th>
                                        <th className="text-center">Durum</th>
                                        <th className="text-center">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtreli.map(k => {
                                        const badge = durumBadge(k);
                                        return (
                                            <tr key={k.id}>
                                                <td>
                                                    <div className="font-semibold text-[#0f172a]">{k.kampanya_adi}</div>
                                                    {k.aciklama && <div className="text-[10px] text-[#94a3b8] mt-0.5">{k.aciklama}</div>}
                                                </td>
                                                <td className="text-center">
                                                    <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#7c3aed] bg-purple-50 border border-purple-200 px-2 py-0.5">
                                                        {k.indirim_tipi === "YUZDE" ? `%${k.indirim_degeri}` : `₺${fmtTL(Number(k.indirim_degeri))}`}
                                                    </span>
                                                </td>
                                                <td className="text-center text-[#64748b]">
                                                    {new Date(k.baslangic_tarihi).toLocaleDateString("tr-TR")} — {new Date(k.bitis_tarihi).toLocaleDateString("tr-TR")}
                                                </td>
                                                <td className="text-right tabular-nums text-[#475569]">{Number(k.min_siparis_tutari) > 0 ? `₺${fmtTL(Number(k.min_siparis_tutari))}` : "—"}</td>
                                                <td className="text-center">
                                                    <span className={`badge-durum ${badge.cls}`}>{badge.label}</span>
                                                </td>
                                                <td className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => aktifPasifToggle(k)} className="text-[9px] font-semibold px-2 py-1 text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors" title={k.aktif ? "Pasife Al" : "Aktife Al"}>
                                                            <i className={`fas ${k.aktif ? "fa-toggle-on text-[#059669]" : "fa-toggle-off text-[#94a3b8]"} text-[11px]`} />
                                                        </button>
                                                        <button onClick={() => modalAc(k)} className="text-[9px] font-semibold px-2 py-1 text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors" title="Düzenle">
                                                            <i className="fas fa-pen text-[8px]" />
                                                        </button>
                                                        <button onClick={() => kampanyaSil(k)} className="text-[9px] font-semibold px-2 py-1 text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors" title="Sil">
                                                            <i className="fas fa-trash text-[8px]" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-2 p-3">
                            {filtreli.map(k => {
                                const badge = durumBadge(k);
                                return (
                                    <div key={k.id} className="p-3 border border-[#e2e8f0] space-y-2" style={{ background: "#f8fafc" }}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[12px] font-semibold text-[#0f172a]">{k.kampanya_adi}</span>
                                            <span className={`badge-durum ${badge.cls}`}>{badge.label}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7c3aed] bg-purple-50 border border-purple-200 px-2 py-0.5">
                                                {k.indirim_tipi === "YUZDE" ? `%${k.indirim_degeri}` : `₺${fmtTL(Number(k.indirim_degeri))}`}
                                            </span>
                                            <span className="text-[10px] text-[#94a3b8]">
                                                {new Date(k.baslangic_tarihi).toLocaleDateString("tr-TR")} — {new Date(k.bitis_tarihi).toLocaleDateString("tr-TR")}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => aktifPasifToggle(k)} className="text-[9px] px-2 py-1 text-[#475569] border border-[#e2e8f0]">
                                                <i className={`fas ${k.aktif ? "fa-toggle-on text-[#059669]" : "fa-toggle-off"} text-[11px]`} />
                                            </button>
                                            <button onClick={() => modalAc(k)} className="text-[9px] px-2 py-1 text-[#475569] border border-[#e2e8f0]"><i className="fas fa-pen text-[8px]" /></button>
                                            <button onClick={() => kampanyaSil(k)} className="text-[9px] px-2 py-1 text-[#dc2626] border border-[#fecaca]"><i className="fas fa-trash text-[8px]" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Modal */}
            {modalAcik && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalAcik(false)}>
                    <div className="bg-white w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">{duzenleKayit ? "Kampanya Düzenle" : "Yeni Kampanya"}</div>
                            <button onClick={() => setModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Kampanya Adı *</label>
                                <input type="text" value={formAdi} onChange={e => setFormAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Örn: Yaz İndirimi" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Açıklama</label>
                                <input type="text" value={formAciklama} onChange={e => setFormAciklama(e.target.value)} className="input-kurumsal w-full" placeholder="Kampanya detayı..." />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">İndirim Tipi *</label>
                                    <div className="flex" style={{ border: "1px solid var(--c-border)" }}>
                                        <button onClick={() => setFormTip("YUZDE")} className={`flex-1 px-3 py-2 text-[11px] font-semibold transition-colors ${formTip === "YUZDE" ? "bg-[#7c3aed] text-white" : "bg-white text-[#64748b]"}`}>% Yüzde</button>
                                        <button onClick={() => setFormTip("TUTAR")} className={`flex-1 px-3 py-2 text-[11px] font-semibold transition-colors ${formTip === "TUTAR" ? "bg-[#7c3aed] text-white" : "bg-white text-[#64748b]"}`} style={{ borderLeft: "1px solid var(--c-border)" }}>₺ Tutar</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">İndirim Değeri *</label>
                                    <input type="number" value={formDeger} onChange={e => setFormDeger(e.target.value)} className="input-kurumsal w-full" placeholder={formTip === "YUZDE" ? "Örn: 15" : "Örn: 50.00"} step="0.01" min="0" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Başlangıç Tarihi *</label>
                                    <input type="date" value={formBaslangic} onChange={e => setFormBaslangic(e.target.value)} className="input-kurumsal w-full" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Bitiş Tarihi *</label>
                                    <input type="date" value={formBitis} onChange={e => setFormBitis(e.target.value)} className="input-kurumsal w-full" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Min. Sipariş Tutarı</label>
                                    <input type="number" value={formMinTutar} onChange={e => setFormMinTutar(e.target.value)} className="input-kurumsal w-full" placeholder="0.00" step="0.01" min="0" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Uygulama Alanı</label>
                                    <select value={formUygulamaAlani} onChange={e => setFormUygulamaAlani(e.target.value)} className="input-kurumsal w-full">
                                        <option value="TUMU">Tüm Ürünler</option>
                                        <option value="SECILI_URUNLER">Seçili Ürünler</option>
                                        <option value="SECILI_KATEGORILER">Seçili Kategoriler</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 pt-1">
                                <button onClick={() => setFormAktif(!formAktif)} className="flex items-center gap-2 text-[11px] font-semibold text-[#475569]">
                                    <i className={`fas ${formAktif ? "fa-toggle-on text-[#059669] text-[16px]" : "fa-toggle-off text-[#94a3b8] text-[16px]"}`} />
                                    {formAktif ? "Aktif" : "Pasif"}
                                </button>
                            </div>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <button onClick={() => setModalAcik(false)} className="btn-secondary text-[11px]">İptal</button>
                            <button onClick={kaydet} disabled={kayitYukleniyor} className="btn-primary text-[11px] flex items-center gap-1.5">
                                {kayitYukleniyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-save text-[10px]" />}
                                {duzenleKayit ? "Güncelle" : "Kaydet"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <OnayModal />
        </main>
    );
}
