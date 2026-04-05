"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface CekSenet {
    id: number;
    sirket_id: number;
    tip: string;
    yon: string;
    tutar: number;
    vade_tarihi: string;
    duzenleme_tarihi: string;
    cek_no: string | null;
    banka_adi: string | null;
    sube_adi: string | null;
    musteri_adi: string | null;
    aciklama: string | null;
    durum: string;
    firma_id: number | null;
    created_at: string;
}

interface Firma {
    id: number;
    unvan: string;
}

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DURUM_BADGE: Record<string, { cls: string; label: string }> = {
    BEKLIYOR: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Bekliyor" },
    TAHSIL_EDILDI: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Tahsil Edildi" },
    KARSILISIZ: { cls: "bg-red-50 text-red-700 border-red-200", label: "Karşılıksız" },
    IPTAL: { cls: "bg-gray-50 text-gray-500 border-gray-200", label: "İptal" },
};

export default function CekSenetSayfasi() {
    const { aktifSirket, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();

    const [kayitlar, setKayitlar] = useState<CekSenet[]>([]);
    const [firmalar, setFirmalar] = useState<Firma[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [aktifSekme, setAktifSekme] = useState<"ALACAK" | "BORC">("ALACAK");
    const [arama, setArama] = useState("");
    const [durumFiltre, setDurumFiltre] = useState<string>("HEPSI");

    // Modal
    const [modalAcik, setModalAcik] = useState(false);
    const [duzenleKayit, setDuzenleKayit] = useState<CekSenet | null>(null);
    const [kayitYukleniyor, setKayitYukleniyor] = useState(false);

    // Form
    const [formTip, setFormTip] = useState<"CEK" | "SENET">("CEK");
    const [formYon, setFormYon] = useState<"ALACAK" | "BORC">("ALACAK");
    const [formTutar, setFormTutar] = useState("");
    const [formVadeTarihi, setFormVadeTarihi] = useState("");
    const [formDuzTarihi, setFormDuzTarihi] = useState(new Date().toISOString().split("T")[0]);
    const [formCekNo, setFormCekNo] = useState("");
    const [formBankaAdi, setFormBankaAdi] = useState("");
    const [formSubeAdi, setFormSubeAdi] = useState("");
    const [formFirmaId, setFormFirmaId] = useState<number | "">("");
    const [formMusteriAdi, setFormMusteriAdi] = useState("");
    const [formAciklama, setFormAciklama] = useState("");

    const yetkili = isYonetici || isMuhasebe;

    const verileriGetir = useCallback(async () => {
        if (!aktifSirket) return;
        setYukleniyor(true);
        const [{ data: cekData }, { data: firmaData }] = await Promise.all([
            supabase.from("cek_senetler").select("*").eq("sirket_id", aktifSirket.id).order("vade_tarihi", { ascending: true }),
            supabase.from("firmalar").select("id, unvan").eq("sahip_sirket_id", aktifSirket.id).order("unvan"),
        ]);
        setKayitlar(cekData || []);
        setFirmalar(firmaData || []);
        setYukleniyor(false);
    }, [aktifSirket]);

    useEffect(() => {
        if (!aktifSirket) return;
        verileriGetir();
    }, [aktifSirket, verileriGetir]);

    // Özet hesaplamalar
    const bugun = new Date().toISOString().split("T")[0];
    const yediGunSonra = useMemo(() => {
        const d = new Date(); d.setDate(d.getDate() + 7);
        return d.toISOString().split("T")[0];
    }, []);

    const bekleyenler = useMemo(() => kayitlar.filter(k => k.durum === "BEKLIYOR"), [kayitlar]);
    const toplamAlacak = useMemo(() => bekleyenler.filter(k => k.yon === "ALACAK").reduce((t, k) => t + Number(k.tutar), 0), [bekleyenler]);
    const toplamBorc = useMemo(() => bekleyenler.filter(k => k.yon === "BORC").reduce((t, k) => t + Number(k.tutar), 0), [bekleyenler]);
    const vadesiYaklasan = useMemo(() => bekleyenler.filter(k => k.vade_tarihi >= bugun && k.vade_tarihi <= yediGunSonra).length, [bekleyenler, bugun, yediGunSonra]);
    const vadesiGecmis = useMemo(() => bekleyenler.filter(k => k.vade_tarihi < bugun).length, [bekleyenler, bugun]);

    // Filtreli liste
    const filtreli = useMemo(() => {
        let liste = kayitlar.filter(k => k.yon === aktifSekme);
        if (durumFiltre !== "HEPSI") liste = liste.filter(k => k.durum === durumFiltre);
        if (arama.trim()) {
            const q = arama.toLowerCase();
            liste = liste.filter(k =>
                (k.cek_no && k.cek_no.toLowerCase().includes(q)) ||
                (k.musteri_adi && k.musteri_adi.toLowerCase().includes(q)) ||
                (k.banka_adi && k.banka_adi.toLowerCase().includes(q)) ||
                (k.aciklama && k.aciklama.toLowerCase().includes(q))
            );
        }
        return liste;
    }, [kayitlar, aktifSekme, durumFiltre, arama]);

    const modalAc = (kayit?: CekSenet) => {
        if (kayit) {
            setDuzenleKayit(kayit);
            setFormTip(kayit.tip as "CEK" | "SENET");
            setFormYon(kayit.yon as "ALACAK" | "BORC");
            setFormTutar(String(kayit.tutar));
            setFormVadeTarihi(kayit.vade_tarihi);
            setFormDuzTarihi(kayit.duzenleme_tarihi);
            setFormCekNo(kayit.cek_no || "");
            setFormBankaAdi(kayit.banka_adi || "");
            setFormSubeAdi(kayit.sube_adi || "");
            setFormFirmaId(kayit.firma_id || "");
            setFormMusteriAdi(kayit.musteri_adi || "");
            setFormAciklama(kayit.aciklama || "");
        } else {
            setDuzenleKayit(null);
            setFormTip("CEK");
            setFormYon(aktifSekme);
            setFormTutar("");
            setFormVadeTarihi("");
            setFormDuzTarihi(new Date().toISOString().split("T")[0]);
            setFormCekNo("");
            setFormBankaAdi("");
            setFormSubeAdi("");
            setFormFirmaId("");
            setFormMusteriAdi("");
            setFormAciklama("");
        }
        setModalAcik(true);
    };

    const kaydet = async () => {
        if (!aktifSirket) return;
        const tutar = Number(formTutar);
        if (!tutar || tutar <= 0) { toast.error("Geçerli bir tutar giriniz"); return; }
        if (!formVadeTarihi) { toast.error("Vade tarihi zorunludur"); return; }

        setKayitYukleniyor(true);
        const seciliFirma = firmalar.find(f => f.id === Number(formFirmaId));
        const payload = {
            sirket_id: aktifSirket.id,
            tip: formTip,
            yon: formYon,
            tutar,
            vade_tarihi: formVadeTarihi,
            duzenleme_tarihi: formDuzTarihi,
            cek_no: formCekNo.trim() || null,
            banka_adi: formBankaAdi.trim() || null,
            sube_adi: formSubeAdi.trim() || null,
            firma_id: formFirmaId || null,
            musteri_adi: seciliFirma ? seciliFirma.unvan : (formMusteriAdi.trim() || null),
            aciklama: formAciklama.trim() || null,
        };

        if (duzenleKayit) {
            const { error } = await supabase.from("cek_senetler").update(payload).eq("id", duzenleKayit.id);
            if (error) toast.error("Güncelleme başarısız");
            else { toast.success("Kayıt güncellendi"); setModalAcik(false); await verileriGetir(); }
        } else {
            const { error } = await supabase.from("cek_senetler").insert(payload);
            if (error) toast.error("Kayıt eklenemedi");
            else { toast.success("Yeni kayıt eklendi"); setModalAcik(false); await verileriGetir(); }
        }
        setKayitYukleniyor(false);
    };

    const durumDegistir = (kayit: CekSenet, yeniDurum: string, etiket: string) => {
        onayla({
            baslik: `${etiket}`,
            mesaj: `Bu ${kayit.tip === "CEK" ? "çeki" : "senedi"} "${etiket}" olarak işaretlemek istediğinize emin misiniz?`,
            altMesaj: `${kayit.cek_no || "-"} · ₺${fmtTL(Number(kayit.tutar))} · Vade: ${new Date(kayit.vade_tarihi).toLocaleDateString("tr-TR")}`,
            onayMetni: etiket,
            tehlikeli: yeniDurum === "KARSILISIZ" || yeniDurum === "IPTAL",
            onOnayla: async () => {
                const { error } = await supabase.from("cek_senetler").update({ durum: yeniDurum }).eq("id", kayit.id);
                if (error) toast.error("İşlem başarısız");
                else { toast.success(`Durum güncellendi: ${etiket}`); await verileriGetir(); }
            },
        });
    };

    const kayitSil = (kayit: CekSenet) => {
        onayla({
            baslik: "Kaydı Sil",
            mesaj: `Bu ${kayit.tip === "CEK" ? "çek" : "senet"} kaydını silmek istediğinize emin misiniz?`,
            altMesaj: `${kayit.cek_no || "-"} · ₺${fmtTL(Number(kayit.tutar))}`,
            onayMetni: "Sil",
            tehlikeli: true,
            onOnayla: async () => {
                const { error } = await supabase.from("cek_senetler").delete().eq("id", kayit.id);
                if (error) toast.error("Kayıt silinemedi");
                else { toast.success("Kayıt silindi"); await verileriGetir(); }
            },
        });
    };

    if (!aktifSirket) return null;

    if (!yetkili) {
        return (
            <main className="flex-1 flex items-center justify-center" style={{ background: "var(--c-bg)" }}>
                <div className="text-center">
                    <i className="fas fa-lock text-[32px] text-[#cbd5e1] mb-3" />
                    <div className="text-[13px] font-semibold text-[#64748b]">Bu sayfaya erişim yetkiniz yok</div>
                    <div className="text-[11px] text-[#94a3b8] mt-1">Yönetici veya Muhasebe yetkisi gereklidir</div>
                </div>
            </main>
        );
    }

    const vadeRenk = (tarih: string, durum: string) => {
        if (durum !== "BEKLIYOR") return "";
        if (tarih < bugun) return "text-[#dc2626] font-bold";
        if (tarih <= yediGunSonra) return "text-[#f59e0b] font-bold";
        return "";
    };

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* Özet Kartlar */}
            <div className="metric-bar shrink-0 flex-wrap">
                <div className="metric-block">
                    <div className="metric-label">Alacak Çek/Senet</div>
                    <div className="metric-value" style={{ color: "#059669" }}>₺{fmtTL(toplamAlacak)}</div>
                    <div className="metric-sub">bekleyen toplam</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Borç Çek/Senet</div>
                    <div className="metric-value" style={{ color: "#dc2626" }}>₺{fmtTL(toplamBorc)}</div>
                    <div className="metric-sub">bekleyen toplam</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Vadesi Yaklaşan</div>
                    <div className="metric-value" style={{ color: vadesiYaklasan > 0 ? "#f59e0b" : "#94a3b8" }}>{vadesiYaklasan}</div>
                    <div className="metric-sub">7 gün içinde</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Vadesi Geçmiş</div>
                    <div className="flex items-center gap-2">
                        <div className="metric-value" style={{ color: vadesiGecmis > 0 ? "#dc2626" : "#94a3b8" }}>{vadesiGecmis}</div>
                        {vadesiGecmis > 0 && <span className="bg-[#dc2626] text-white text-[8px] font-bold px-1.5 py-0.5 animate-pulse uppercase tracking-wider">Acil</span>}
                    </div>
                </div>
                {yukleniyor && <div className="metric-block flex items-center"><i className="fas fa-circle-notch fa-spin text-[#475569] text-sm" /></div>}
            </div>

            {/* Kontrol Çubuğu */}
            <div className="shrink-0 px-4 md:px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3" style={{ background: "white", borderBottom: "1px solid var(--c-border)" }}>
                <div className="flex items-center gap-2">
                    <button onClick={() => modalAc()} className="btn-primary flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                        <i className="fas fa-plus text-[9px]" /> Yeni Kayıt
                    </button>
                    {/* Sekme butonları */}
                    <div className="flex" style={{ border: "1px solid var(--c-border)" }}>
                        <button onClick={() => setAktifSekme("ALACAK")}
                            className={`px-3 py-1.5 text-[10px] font-semibold transition-colors ${aktifSekme === "ALACAK" ? "bg-[#0f172a] text-white" : "bg-white text-[#64748b] hover:bg-[#f8fafc]"}`}>
                            Alacak
                        </button>
                        <button onClick={() => setAktifSekme("BORC")}
                            className={`px-3 py-1.5 text-[10px] font-semibold transition-colors ${aktifSekme === "BORC" ? "bg-[#0f172a] text-white" : "bg-white text-[#64748b] hover:bg-[#f8fafc]"}`}
                            style={{ borderLeft: "1px solid var(--c-border)" }}>
                            Borç
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                    <select value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} className="input-kurumsal text-[11px] h-8 w-auto">
                        <option value="HEPSI">Tüm Durumlar</option>
                        <option value="BEKLIYOR">Bekliyor</option>
                        <option value="TAHSIL_EDILDI">Tahsil Edildi</option>
                        <option value="KARSILISIZ">Karşılıksız</option>
                        <option value="IPTAL">İptal</option>
                    </select>
                    <div className="flex-1 relative">
                        <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8]" />
                        <input type="text" value={arama} onChange={e => setArama(e.target.value)} placeholder="Çek no, müşteri, banka ara..." className="input-kurumsal w-full pl-7 text-[11px] h-8" />
                    </div>
                </div>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {yukleniyor ? (
                    <div className="flex items-center justify-center py-16"><i className="fas fa-circle-notch fa-spin text-[#475569] text-lg" /></div>
                ) : filtreli.length === 0 ? (
                    <div className="text-center py-16">
                        <i className="fas fa-money-check text-[36px] text-[#e2e8f0] mb-3" />
                        <div className="text-[12px] font-semibold text-[#94a3b8]">{aktifSekme === "ALACAK" ? "Alacak" : "Borç"} çek/senet bulunamadı</div>
                        <div className="text-[10px] text-[#cbd5e1] mt-1">Yeni kayıt eklemek için yukarıdaki butonu kullanın</div>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block">
                            <table className="tbl-kurumsal">
                                <thead>
                                    <tr>
                                        <th>Tip</th>
                                        <th>Çek/Senet No</th>
                                        <th>Müşteri</th>
                                        <th>Banka</th>
                                        <th className="text-right">Tutar (TL)</th>
                                        <th className="text-center">Vade Tarihi</th>
                                        <th className="text-center">Durum</th>
                                        <th className="text-center">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtreli.map(k => (
                                        <tr key={k.id}>
                                            <td>
                                                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 ${k.tip === "CEK" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-purple-50 text-purple-700 border border-purple-200"}`}>
                                                    <i className={`fas ${k.tip === "CEK" ? "fa-money-check" : "fa-file-alt"} text-[8px]`} />
                                                    {k.tip === "CEK" ? "Çek" : "Senet"}
                                                </span>
                                            </td>
                                            <td className="font-semibold text-[#0f172a]">{k.cek_no || "-"}</td>
                                            <td className="text-[#475569]">{k.musteri_adi || "-"}</td>
                                            <td className="text-[#64748b]">{k.banka_adi || "-"}{k.sube_adi ? ` / ${k.sube_adi}` : ""}</td>
                                            <td className={`text-right font-semibold ${k.yon === "ALACAK" ? "text-[#059669]" : "text-[#dc2626]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                                                {k.yon === "ALACAK" ? "+" : "-"}₺{fmtTL(Number(k.tutar))}
                                            </td>
                                            <td className={`text-center ${vadeRenk(k.vade_tarihi, k.durum)}`}>
                                                {new Date(k.vade_tarihi).toLocaleDateString("tr-TR")}
                                                {k.durum === "BEKLIYOR" && k.vade_tarihi < bugun && <i className="fas fa-exclamation-circle ml-1 text-[9px] text-[#dc2626]" />}
                                            </td>
                                            <td className="text-center">
                                                <span className={`badge-durum ${DURUM_BADGE[k.durum]?.cls || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                    {DURUM_BADGE[k.durum]?.label || k.durum}
                                                </span>
                                            </td>
                                            <td className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    {k.durum === "BEKLIYOR" && (
                                                        <>
                                                            <button onClick={() => durumDegistir(k, "TAHSIL_EDILDI", "Tahsil Et")} className="text-[9px] font-semibold px-2 py-1 text-[#059669] border border-[#a7f3d0] hover:bg-[#ecfdf5] transition-colors" title="Tahsil Et">
                                                                <i className="fas fa-check text-[8px]" />
                                                            </button>
                                                            <button onClick={() => durumDegistir(k, "KARSILISIZ", "Karşılıksız")} className="text-[9px] font-semibold px-2 py-1 text-[#f59e0b] border border-[#fde68a] hover:bg-[#fffbeb] transition-colors" title="Karşılıksız">
                                                                <i className="fas fa-ban text-[8px]" />
                                                            </button>
                                                            <button onClick={() => durumDegistir(k, "IPTAL", "İptal Et")} className="text-[9px] font-semibold px-2 py-1 text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors" title="İptal">
                                                                <i className="fas fa-times text-[8px]" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button onClick={() => modalAc(k)} className="text-[9px] font-semibold px-2 py-1 text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors" title="Düzenle">
                                                        <i className="fas fa-pen text-[8px]" />
                                                    </button>
                                                    <button onClick={() => kayitSil(k)} className="text-[9px] font-semibold px-2 py-1 text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors" title="Sil">
                                                        <i className="fas fa-trash text-[8px]" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-2 p-3">
                            {filtreli.map(k => (
                                <div key={k.id} className="p-3 border border-[#e2e8f0] space-y-2" style={{ background: "#f8fafc" }}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 ${k.tip === "CEK" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-purple-50 text-purple-700 border border-purple-200"}`}>
                                                {k.tip === "CEK" ? "Çek" : "Senet"}
                                            </span>
                                            <span className="text-[11px] font-semibold text-[#0f172a]">{k.cek_no || "-"}</span>
                                        </div>
                                        <span className={`badge-durum ${DURUM_BADGE[k.durum]?.cls || ""}`}>{DURUM_BADGE[k.durum]?.label || k.durum}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-[#475569]">{k.musteri_adi || "-"}</span>
                                        <span className={`text-[13px] font-bold ${k.yon === "ALACAK" ? "text-[#059669]" : "text-[#dc2626]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                                            {k.yon === "ALACAK" ? "+" : "-"}₺{fmtTL(Number(k.tutar))}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[10px] ${vadeRenk(k.vade_tarihi, k.durum) || "text-[#94a3b8]"}`}>
                                            Vade: {new Date(k.vade_tarihi).toLocaleDateString("tr-TR")}
                                            {k.durum === "BEKLIYOR" && k.vade_tarihi < bugun && <i className="fas fa-exclamation-circle ml-1 text-[8px] text-[#dc2626]" />}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {k.durum === "BEKLIYOR" && (
                                                <>
                                                    <button onClick={() => durumDegistir(k, "TAHSIL_EDILDI", "Tahsil Et")} className="text-[9px] px-2 py-1 text-[#059669] border border-[#a7f3d0]"><i className="fas fa-check text-[8px]" /></button>
                                                    <button onClick={() => durumDegistir(k, "KARSILISIZ", "Karşılıksız")} className="text-[9px] px-2 py-1 text-[#f59e0b] border border-[#fde68a]"><i className="fas fa-ban text-[8px]" /></button>
                                                    <button onClick={() => durumDegistir(k, "IPTAL", "İptal Et")} className="text-[9px] px-2 py-1 text-[#dc2626] border border-[#fecaca]"><i className="fas fa-times text-[8px]" /></button>
                                                </>
                                            )}
                                            <button onClick={() => modalAc(k)} className="text-[9px] px-2 py-1 text-[#475569] border border-[#e2e8f0]"><i className="fas fa-pen text-[8px]" /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Yeni/Düzenle Modal */}
            {modalAcik && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalAcik(false)}>
                    <div className="bg-white w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">{duzenleKayit ? "Kayıt Düzenle" : "Yeni Çek / Senet"}</div>
                            <button onClick={() => setModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {/* Tip & Yön */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Tip *</label>
                                    <div className="flex" style={{ border: "1px solid var(--c-border)" }}>
                                        <button onClick={() => setFormTip("CEK")} className={`flex-1 px-3 py-2 text-[11px] font-semibold transition-colors ${formTip === "CEK" ? "bg-[#0f172a] text-white" : "bg-white text-[#64748b]"}`}>
                                            <i className="fas fa-money-check mr-1 text-[9px]" /> Çek
                                        </button>
                                        <button onClick={() => setFormTip("SENET")} className={`flex-1 px-3 py-2 text-[11px] font-semibold transition-colors ${formTip === "SENET" ? "bg-[#0f172a] text-white" : "bg-white text-[#64748b]"}`} style={{ borderLeft: "1px solid var(--c-border)" }}>
                                            <i className="fas fa-file-alt mr-1 text-[9px]" /> Senet
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Yön *</label>
                                    <div className="flex" style={{ border: "1px solid var(--c-border)" }}>
                                        <button onClick={() => setFormYon("ALACAK")} className={`flex-1 px-3 py-2 text-[11px] font-semibold transition-colors ${formYon === "ALACAK" ? "bg-[#059669] text-white" : "bg-white text-[#64748b]"}`}>
                                            Alacak
                                        </button>
                                        <button onClick={() => setFormYon("BORC")} className={`flex-1 px-3 py-2 text-[11px] font-semibold transition-colors ${formYon === "BORC" ? "bg-[#dc2626] text-white" : "bg-white text-[#64748b]"}`} style={{ borderLeft: "1px solid var(--c-border)" }}>
                                            Borç
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Tutar */}
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Tutar *</label>
                                <input type="number" value={formTutar} onChange={e => setFormTutar(e.target.value)} className="input-kurumsal w-full text-[14px] font-semibold" placeholder="0.00" step="0.01" min="0" />
                            </div>

                            {/* Tarihler */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Vade Tarihi *</label>
                                    <input type="date" value={formVadeTarihi} onChange={e => setFormVadeTarihi(e.target.value)} className="input-kurumsal w-full" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Düzenleme Tarihi</label>
                                    <input type="date" value={formDuzTarihi} onChange={e => setFormDuzTarihi(e.target.value)} className="input-kurumsal w-full" />
                                </div>
                            </div>

                            {/* Çek No & Banka */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">{formTip === "CEK" ? "Çek No" : "Senet No"}</label>
                                    <input type="text" value={formCekNo} onChange={e => setFormCekNo(e.target.value)} className="input-kurumsal w-full" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Banka Adı</label>
                                    <input type="text" value={formBankaAdi} onChange={e => setFormBankaAdi(e.target.value)} className="input-kurumsal w-full" />
                                </div>
                            </div>

                            {/* Şube */}
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Şube</label>
                                <input type="text" value={formSubeAdi} onChange={e => setFormSubeAdi(e.target.value)} className="input-kurumsal w-full" />
                            </div>

                            {/* Müşteri */}
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Müşteri (Cari Kart)</label>
                                <select value={formFirmaId} onChange={e => { setFormFirmaId(Number(e.target.value) || ""); const f = firmalar.find(f => f.id === Number(e.target.value)); if (f) setFormMusteriAdi(f.unvan); }} className="input-kurumsal w-full">
                                    <option value="">Listeden seçin veya aşağıya yazın...</option>
                                    {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Müşteri Adı (Manuel)</label>
                                <input type="text" value={formMusteriAdi} onChange={e => setFormMusteriAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Listede yoksa elle yazın" />
                            </div>

                            {/* Açıklama */}
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Açıklama</label>
                                <input type="text" value={formAciklama} onChange={e => setFormAciklama(e.target.value)} className="input-kurumsal w-full" placeholder="Ek not..." />
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
