"use client";
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface BankaHesabi {
    id: number;
    sirket_id: number;
    banka_adi: string;
    sube_adi: string | null;
    hesap_no: string | null;
    iban: string | null;
    para_birimi: string;
    bakiye: number;
    aktif: boolean;
    created_at: string;
}

interface BankaHareketi {
    id: number;
    hesap_id: number;
    sirket_id: number;
    islem_tipi: string;
    tutar: number;
    aciklama: string | null;
    tarih: string;
    created_at: string;
}

const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ISLEM_TIPLERI = ["YATIRMA", "CEKME", "TRANSFER", "TAHSILAT", "ODEME"] as const;
const ISLEM_RENK: Record<string, string> = {
    YATIRMA: "#059669",
    CEKME: "#dc2626",
    TRANSFER: "#3b82f6",
    TAHSILAT: "#059669",
    ODEME: "#dc2626",
};
const ISLEM_ICON: Record<string, string> = {
    YATIRMA: "fa-arrow-down",
    CEKME: "fa-arrow-up",
    TRANSFER: "fa-exchange-alt",
    TAHSILAT: "fa-hand-holding-usd",
    ODEME: "fa-file-invoice-dollar",
};

export default function BankaHesaplariSayfasi() {
    const { aktifSirket, kullaniciRol, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();

    const [hesaplar, setHesaplar] = useState<BankaHesabi[]>([]);
    const [hareketler, setHareketler] = useState<BankaHareketi[]>([]);
    const [seciliHesap, setSeciliHesap] = useState<BankaHesabi | null>(null);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [hareketYukleniyor, setHareketYukleniyor] = useState(false);
    const [arama, setArama] = useState("");

    // Modal states
    const [hesapModal, setHesapModal] = useState(false);
    const [islemModal, setIslemModal] = useState<"YATIRMA" | "CEKME" | "TRANSFER" | null>(null);
    const [duzenleHesap, setDuzenleHesap] = useState<BankaHesabi | null>(null);

    // Form states - hesap
    const [formBankaAdi, setFormBankaAdi] = useState("");
    const [formSubeAdi, setFormSubeAdi] = useState("");
    const [formHesapNo, setFormHesapNo] = useState("");
    const [formIban, setFormIban] = useState("");
    const [formParaBirimi, setFormParaBirimi] = useState("TRY");
    const [formBakiye, setFormBakiye] = useState("");

    // Form states - islem
    const [islemTutar, setIslemTutar] = useState("");
    const [islemAciklama, setIslemAciklama] = useState("");
    const [islemTarih, setIslemTarih] = useState(new Date().toISOString().split("T")[0]);
    const [transferHedefHesap, setTransferHedefHesap] = useState<number | "">("");
    const [kayitYukleniyor, setKayitYukleniyor] = useState(false);

    const yetkili = isYonetici || isMuhasebe;

    const hesaplariGetir = useCallback(async () => {
        if (!aktifSirket) return;
        setYukleniyor(true);
        const { data, error } = await supabase
            .from("banka_hesaplari")
            .select("*")
            .eq("sirket_id", aktifSirket.id)
            .order("aktif", { ascending: false })
            .order("banka_adi", { ascending: true });
        if (error) { toast.error("Hesaplar yüklenemedi"); }
        else { setHesaplar(data || []); }
        setYukleniyor(false);
    }, [aktifSirket]);

    const hareketleriGetir = useCallback(async (hesapId: number) => {
        if (!aktifSirket) return;
        setHareketYukleniyor(true);
        const { data, error } = await supabase
            .from("banka_hareketleri")
            .select("*")
            .eq("hesap_id", hesapId)
            .eq("sirket_id", aktifSirket.id)
            .order("tarih", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(100);
        if (error) { toast.error("Hareketler yüklenemedi"); }
        else { setHareketler(data || []); }
        setHareketYukleniyor(false);
    }, [aktifSirket]);

    useEffect(() => {
        if (!aktifSirket) return;
        hesaplariGetir();
    }, [aktifSirket, hesaplariGetir]);

    useEffect(() => {
        if (seciliHesap) hareketleriGetir(seciliHesap.id);
        else setHareketler([]);
    }, [seciliHesap, hareketleriGetir]);

    const hesapModalAc = (hesap?: BankaHesabi) => {
        if (hesap) {
            setDuzenleHesap(hesap);
            setFormBankaAdi(hesap.banka_adi);
            setFormSubeAdi(hesap.sube_adi || "");
            setFormHesapNo(hesap.hesap_no || "");
            setFormIban(hesap.iban || "");
            setFormParaBirimi(hesap.para_birimi);
            setFormBakiye(String(hesap.bakiye));
        } else {
            setDuzenleHesap(null);
            setFormBankaAdi("");
            setFormSubeAdi("");
            setFormHesapNo("");
            setFormIban("");
            setFormParaBirimi("TRY");
            setFormBakiye("0");
        }
        setHesapModal(true);
    };

    const hesapKaydet = async () => {
        if (!aktifSirket || !formBankaAdi.trim()) { toast.error("Banka adı zorunludur"); return; }
        setKayitYukleniyor(true);
        const payload = {
            sirket_id: aktifSirket.id,
            banka_adi: formBankaAdi.trim(),
            sube_adi: formSubeAdi.trim() || null,
            hesap_no: formHesapNo.trim() || null,
            iban: formIban.trim() || null,
            para_birimi: formParaBirimi,
            bakiye: Number(formBakiye) || 0,
        };
        if (duzenleHesap) {
            const { error } = await supabase.from("banka_hesaplari").update(payload).eq("id", duzenleHesap.id);
            if (error) toast.error("Güncelleme başarısız");
            else { toast.success("Hesap güncellendi"); setHesapModal(false); await hesaplariGetir(); if (seciliHesap?.id === duzenleHesap.id) { setSeciliHesap({ ...seciliHesap, ...payload } as BankaHesabi); } }
        } else {
            const { error } = await supabase.from("banka_hesaplari").insert(payload);
            if (error) toast.error("Hesap eklenemedi");
            else { toast.success("Yeni hesap eklendi"); setHesapModal(false); await hesaplariGetir(); }
        }
        setKayitYukleniyor(false);
    };

    const hesapAktifPasif = async (hesap: BankaHesabi) => {
        const { error } = await supabase.from("banka_hesaplari").update({ aktif: !hesap.aktif }).eq("id", hesap.id);
        if (error) toast.error("İşlem başarısız");
        else { toast.success(hesap.aktif ? "Hesap pasife alındı" : "Hesap aktife alındı"); await hesaplariGetir(); if (seciliHesap?.id === hesap.id) setSeciliHesap({ ...hesap, aktif: !hesap.aktif }); }
    };

    const islemModalAc = (tip: "YATIRMA" | "CEKME" | "TRANSFER") => {
        setIslemTutar("");
        setIslemAciklama("");
        setIslemTarih(new Date().toISOString().split("T")[0]);
        setTransferHedefHesap("");
        setIslemModal(tip);
    };

    const islemKaydet = async () => {
        if (!aktifSirket || !seciliHesap || !islemModal) return;
        const tutar = Number(islemTutar);
        if (!tutar || tutar <= 0) { toast.error("Geçerli bir tutar giriniz"); return; }
        if (islemModal === "TRANSFER" && !transferHedefHesap) { toast.error("Hedef hesap seçiniz"); return; }
        if ((islemModal === "CEKME" || islemModal === "TRANSFER") && tutar > seciliHesap.bakiye) { toast.error("Yetersiz bakiye"); return; }

        setKayitYukleniyor(true);
        try {
            // Ana hareket
            const { error: hErr } = await supabase.from("banka_hareketleri").insert({
                hesap_id: seciliHesap.id,
                sirket_id: aktifSirket.id,
                islem_tipi: islemModal,
                tutar,
                aciklama: islemAciklama.trim() || null,
                tarih: islemTarih,
            });
            if (hErr) throw hErr;

            // Bakiye güncelle
            let yeniBakiye = seciliHesap.bakiye;
            if (islemModal === "YATIRMA") yeniBakiye += tutar;
            else if (islemModal === "CEKME") yeniBakiye -= tutar;
            else if (islemModal === "TRANSFER") yeniBakiye -= tutar;

            const { error: bErr } = await supabase.from("banka_hesaplari").update({ bakiye: yeniBakiye }).eq("id", seciliHesap.id);
            if (bErr) throw bErr;

            // Transfer: hedef hesaba yatır
            if (islemModal === "TRANSFER" && transferHedefHesap) {
                const hedefHesap = hesaplar.find(h => h.id === Number(transferHedefHesap));
                if (hedefHesap) {
                    await supabase.from("banka_hareketleri").insert({
                        hesap_id: hedefHesap.id,
                        sirket_id: aktifSirket.id,
                        islem_tipi: "TRANSFER",
                        tutar,
                        aciklama: `${seciliHesap.banka_adi} hesabından transfer${islemAciklama.trim() ? " - " + islemAciklama.trim() : ""}`,
                        tarih: islemTarih,
                    });
                    await supabase.from("banka_hesaplari").update({ bakiye: hedefHesap.bakiye + tutar }).eq("id", hedefHesap.id);
                }
            }

            toast.success("İşlem kaydedildi");
            setIslemModal(null);
            await hesaplariGetir();
            setSeciliHesap({ ...seciliHesap, bakiye: yeniBakiye });
            await hareketleriGetir(seciliHesap.id);
        } catch {
            toast.error("İşlem kaydedilemedi");
        }
        setKayitYukleniyor(false);
    };

    const hesapSil = (hesap: BankaHesabi) => {
        onayla({
            baslik: "Hesap Sil",
            mesaj: `"${hesap.banka_adi}" hesabını silmek istediğinize emin misiniz?`,
            altMesaj: "Bu işlem geri alınamaz. Hesaba ait tüm hareketler de silinecektir.",
            onayMetni: "Sil",
            tehlikeli: true,
            onOnayla: async () => {
                await supabase.from("banka_hareketleri").delete().eq("hesap_id", hesap.id);
                const { error } = await supabase.from("banka_hesaplari").delete().eq("id", hesap.id);
                if (error) toast.error("Hesap silinemedi");
                else {
                    toast.success("Hesap silindi");
                    if (seciliHesap?.id === hesap.id) { setSeciliHesap(null); setHareketler([]); }
                    await hesaplariGetir();
                }
            },
        });
    };

    const filtreliHesaplar = hesaplar.filter(h =>
        h.banka_adi.toLowerCase().includes(arama.toLowerCase()) ||
        (h.iban && h.iban.toLowerCase().includes(arama.toLowerCase())) ||
        (h.sube_adi && h.sube_adi.toLowerCase().includes(arama.toLowerCase()))
    );

    const toplamBakiye = hesaplar.filter(h => h.aktif).reduce((t, h) => t + Number(h.bakiye), 0);

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

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* Metric Bar */}
            <div className="metric-bar shrink-0 flex-wrap">
                <div className="metric-block">
                    <div className="metric-label">Toplam Bakiye</div>
                    <div className="metric-value">₺{fmtTL(toplamBakiye)}</div>
                    <div className="metric-sub">aktif hesaplar</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Aktif Hesap</div>
                    <div className="metric-value">{hesaplar.filter(h => h.aktif).length}</div>
                    <div className="metric-sub">banka hesabı</div>
                </div>
                <div className="metric-block">
                    <div className="metric-label">Pasif Hesap</div>
                    <div className="metric-value" style={{ color: "#94a3b8" }}>{hesaplar.filter(h => !h.aktif).length}</div>
                </div>
                {yukleniyor && <div className="metric-block flex items-center"><i className="fas fa-circle-notch fa-spin text-[#475569] text-sm" /></div>}
            </div>

            {/* Ana İçerik */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Sol Panel - Hesap Listesi */}
                <div className="w-full md:w-[340px] lg:w-[380px] shrink-0 flex flex-col overflow-hidden" style={{ borderRight: "1px solid var(--c-border)" }}>
                    <div className="p-3 space-y-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border)", background: "white" }}>
                        <div className="flex items-center gap-2">
                            <button onClick={() => hesapModalAc()} className="btn-primary flex items-center gap-1.5 text-[11px] whitespace-nowrap">
                                <i className="fas fa-plus text-[9px]" /> Yeni Hesap
                            </button>
                            <div className="flex-1 relative">
                                <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8]" />
                                <input type="text" value={arama} onChange={e => setArama(e.target.value)} placeholder="Hesap ara..." className="input-kurumsal w-full pl-7 text-[11px] h-8" />
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {yukleniyor ? (
                            <div className="flex items-center justify-center py-12">
                                <i className="fas fa-circle-notch fa-spin text-[#475569]" />
                            </div>
                        ) : filtreliHesaplar.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-university text-[28px] text-[#e2e8f0] mb-2" />
                                <div className="text-[11px] text-[#94a3b8] font-medium">Hesap bulunamadı</div>
                            </div>
                        ) : (
                            filtreliHesaplar.map(h => (
                                <div key={h.id} onClick={() => setSeciliHesap(h)}
                                    className={`px-4 py-3 cursor-pointer transition-colors border-l-2 ${seciliHesap?.id === h.id ? "bg-[#f8fafc] border-l-[#0f172a]" : "border-transparent hover:bg-[#f8fafc]/60"}`}
                                    style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[12px] font-semibold ${h.aktif ? "text-[#0f172a]" : "text-[#94a3b8] line-through"}`}>{h.banka_adi}</span>
                                                {!h.aktif && <span className="text-[8px] font-semibold text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0.5 uppercase tracking-wider">Pasif</span>}
                                            </div>
                                            {h.iban && <div className="text-[10px] text-[#94a3b8] mt-0.5 font-mono truncate">{h.iban}</div>}
                                            {h.sube_adi && <div className="text-[10px] text-[#94a3b8] mt-0.5">{h.sube_adi}</div>}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className={`text-[13px] font-bold ${Number(h.bakiye) >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                                                ₺{fmtTL(Number(h.bakiye))}
                                            </div>
                                            <div className="text-[9px] text-[#94a3b8] mt-0.5">{h.para_birimi}</div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Sağ Panel - Hareketler */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {!seciliHesap ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <i className="fas fa-university text-[40px] text-[#e2e8f0] mb-3" />
                                <div className="text-[12px] font-semibold text-[#94a3b8]">Hesap seçiniz</div>
                                <div className="text-[10px] text-[#cbd5e1] mt-1">Sol panelden bir banka hesabı seçerek hareketlerini görüntüleyin</div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Hesap Detay Header */}
                            <div className="shrink-0 px-4 md:px-5 py-3" style={{ background: "white", borderBottom: "1px solid var(--c-border)" }}>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 bg-[#0f172a] text-white flex items-center justify-center shrink-0">
                                            <i className="fas fa-university text-[12px]" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-semibold text-[#0f172a]">{seciliHesap.banka_adi}</div>
                                            <div className="text-[10px] text-[#94a3b8]">{seciliHesap.iban || seciliHesap.hesap_no || "IBAN girilmemiş"}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <button onClick={() => islemModalAc("YATIRMA")} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-white transition-colors" style={{ background: "#059669" }}>
                                            <i className="fas fa-arrow-down text-[8px]" /> Para Yatır
                                        </button>
                                        <button onClick={() => islemModalAc("CEKME")} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-white transition-colors" style={{ background: "#dc2626" }}>
                                            <i className="fas fa-arrow-up text-[8px]" /> Para Çek
                                        </button>
                                        <button onClick={() => islemModalAc("TRANSFER")} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-white transition-colors" style={{ background: "#3b82f6" }}>
                                            <i className="fas fa-exchange-alt text-[8px]" /> Transfer
                                        </button>
                                        <button onClick={() => hesapModalAc(seciliHesap)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors">
                                            <i className="fas fa-pen text-[8px]" /> Düzenle
                                        </button>
                                        <button onClick={() => hesapAktifPasif(seciliHesap)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors" title={seciliHesap.aktif ? "Pasife Al" : "Aktife Al"}>
                                            <i className={`fas ${seciliHesap.aktif ? "fa-toggle-on text-[#059669]" : "fa-toggle-off text-[#94a3b8]"} text-[11px]`} />
                                        </button>
                                        <button onClick={() => hesapSil(seciliHesap)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors">
                                            <i className="fas fa-trash text-[8px]" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 mt-2">
                                    <div>
                                        <span className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">Bakiye</span>
                                        <div className={`text-[18px] font-bold ${Number(seciliHesap.bakiye) >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                                            ₺{fmtTL(Number(seciliHesap.bakiye))}
                                        </div>
                                    </div>
                                    {seciliHesap.sube_adi && (
                                        <div>
                                            <span className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">Şube</span>
                                            <div className="text-[12px] font-medium text-[#0f172a]">{seciliHesap.sube_adi}</div>
                                        </div>
                                    )}
                                    {seciliHesap.hesap_no && (
                                        <div>
                                            <span className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">Hesap No</span>
                                            <div className="text-[12px] font-medium text-[#0f172a] font-mono">{seciliHesap.hesap_no}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Hareketler */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {hareketYukleniyor ? (
                                    <div className="flex items-center justify-center py-12"><i className="fas fa-circle-notch fa-spin text-[#475569]" /></div>
                                ) : hareketler.length === 0 ? (
                                    <div className="text-center py-12">
                                        <i className="fas fa-receipt text-[28px] text-[#e2e8f0] mb-2" />
                                        <div className="text-[11px] text-[#94a3b8] font-medium">Hareket bulunamadı</div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Desktop Table */}
                                        <div className="hidden md:block">
                                            <table className="tbl-kurumsal">
                                                <thead>
                                                    <tr>
                                                        <th>Tarih</th>
                                                        <th>İşlem Tipi</th>
                                                        <th>Açıklama</th>
                                                        <th className="text-right">Tutar (TL)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {hareketler.map(h => {
                                                        const giris = h.islem_tipi === "YATIRMA" || h.islem_tipi === "TAHSILAT" || (h.islem_tipi === "TRANSFER" && h.aciklama?.includes("hesabından transfer"));
                                                        return (
                                                            <tr key={h.id}>
                                                                <td className="text-[#64748b]">{new Date(h.tarih).toLocaleDateString("tr-TR")}</td>
                                                                <td>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-5 h-5 flex items-center justify-center" style={{ background: `${ISLEM_RENK[h.islem_tipi] || "#64748b"}15`, color: ISLEM_RENK[h.islem_tipi] || "#64748b" }}>
                                                                            <i className={`fas ${ISLEM_ICON[h.islem_tipi] || "fa-circle"} text-[8px]`} />
                                                                        </div>
                                                                        <span className="text-[11px] font-semibold" style={{ color: ISLEM_RENK[h.islem_tipi] || "#64748b" }}>{h.islem_tipi}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="text-[#475569]">{h.aciklama || "-"}</td>
                                                                <td className={`text-right font-semibold ${giris ? "text-[#059669]" : "text-[#dc2626]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                                                                    {giris ? "+" : "-"}₺{fmtTL(Number(h.tutar))}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        {/* Mobile Cards */}
                                        <div className="md:hidden space-y-2 p-3">
                                            {hareketler.map(h => {
                                                const giris = h.islem_tipi === "YATIRMA" || h.islem_tipi === "TAHSILAT" || (h.islem_tipi === "TRANSFER" && h.aciklama?.includes("hesabından transfer"));
                                                return (
                                                    <div key={h.id} className="p-3 border border-[#e2e8f0] space-y-1.5" style={{ background: "#f8fafc" }}>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-5 h-5 flex items-center justify-center" style={{ background: `${ISLEM_RENK[h.islem_tipi] || "#64748b"}15`, color: ISLEM_RENK[h.islem_tipi] || "#64748b" }}>
                                                                    <i className={`fas ${ISLEM_ICON[h.islem_tipi] || "fa-circle"} text-[8px]`} />
                                                                </div>
                                                                <span className="text-[11px] font-semibold" style={{ color: ISLEM_RENK[h.islem_tipi] || "#64748b" }}>{h.islem_tipi}</span>
                                                            </div>
                                                            <span className="text-[11px] text-[#94a3b8]">{new Date(h.tarih).toLocaleDateString("tr-TR")}</span>
                                                        </div>
                                                        {h.aciklama && <div className="text-[11px] text-[#475569]">{h.aciklama}</div>}
                                                        <div className="text-right">
                                                            <span className={`text-[13px] font-bold ${giris ? "text-[#059669]" : "text-[#dc2626]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                                                                {giris ? "+" : "-"}₺{fmtTL(Number(h.tutar))}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Hesap Ekle/Düzenle Modal */}
            {hesapModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setHesapModal(false)}>
                    <div className="bg-white w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">{duzenleHesap ? "Hesap Düzenle" : "Yeni Banka Hesabı"}</div>
                            <button onClick={() => setHesapModal(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Banka Adı *</label>
                                <input type="text" value={formBankaAdi} onChange={e => setFormBankaAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Örn: Ziraat Bankası" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Şube Adı</label>
                                    <input type="text" value={formSubeAdi} onChange={e => setFormSubeAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Örn: Merkez" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Hesap No</label>
                                    <input type="text" value={formHesapNo} onChange={e => setFormHesapNo(e.target.value)} className="input-kurumsal w-full" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">IBAN</label>
                                <input type="text" value={formIban} onChange={e => setFormIban(e.target.value)} className="input-kurumsal w-full font-mono" placeholder="TR00 0000 0000 0000 0000 0000 00" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Para Birimi</label>
                                    <select value={formParaBirimi} onChange={e => setFormParaBirimi(e.target.value)} className="input-kurumsal w-full">
                                        <option value="TRY">TRY (₺)</option>
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Açılış Bakiyesi</label>
                                    <input type="number" value={formBakiye} onChange={e => setFormBakiye(e.target.value)} className="input-kurumsal w-full" step="0.01" />
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <button onClick={() => setHesapModal(false)} className="btn-secondary text-[11px]">İptal</button>
                            <button onClick={hesapKaydet} disabled={kayitYukleniyor} className="btn-primary text-[11px] flex items-center gap-1.5">
                                {kayitYukleniyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-save text-[10px]" />}
                                {duzenleHesap ? "Güncelle" : "Kaydet"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* İşlem Modal (Yatırma / Çekme / Transfer) */}
            {islemModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setIslemModal(null)}>
                    <div className="bg-white w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 flex items-center justify-center text-white" style={{ background: islemModal === "YATIRMA" ? "#059669" : islemModal === "CEKME" ? "#dc2626" : "#3b82f6" }}>
                                    <i className={`fas ${islemModal === "YATIRMA" ? "fa-arrow-down" : islemModal === "CEKME" ? "fa-arrow-up" : "fa-exchange-alt"} text-[10px]`} />
                                </div>
                                <span className="text-[13px] font-semibold text-[#0f172a]">
                                    {islemModal === "YATIRMA" ? "Para Yatır" : islemModal === "CEKME" ? "Para Çek" : "Hesaplar Arası Transfer"}
                                </span>
                            </div>
                            <button onClick={() => setIslemModal(null)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0]">
                                <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">Kaynak Hesap</div>
                                <div className="text-[12px] font-semibold text-[#0f172a] mt-0.5">{seciliHesap?.banka_adi}</div>
                                <div className="text-[11px] text-[#059669] font-semibold mt-0.5">Bakiye: ₺{fmtTL(Number(seciliHesap?.bakiye || 0))}</div>
                            </div>
                            {islemModal === "TRANSFER" && (
                                <div>
                                    <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Hedef Hesap *</label>
                                    <select value={transferHedefHesap} onChange={e => setTransferHedefHesap(Number(e.target.value) || "")} className="input-kurumsal w-full">
                                        <option value="">Hesap seçiniz...</option>
                                        {hesaplar.filter(h => h.id !== seciliHesap?.id && h.aktif).map(h => (
                                            <option key={h.id} value={h.id}>{h.banka_adi} (₺{fmtTL(Number(h.bakiye))})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Tutar *</label>
                                <input type="number" value={islemTutar} onChange={e => setIslemTutar(e.target.value)} className="input-kurumsal w-full text-[16px] font-semibold" placeholder="0.00" step="0.01" min="0" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Tarih</label>
                                <input type="date" value={islemTarih} onChange={e => setIslemTarih(e.target.value)} className="input-kurumsal w-full" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Açıklama</label>
                                <input type="text" value={islemAciklama} onChange={e => setIslemAciklama(e.target.value)} className="input-kurumsal w-full" placeholder="İşlem açıklaması..." />
                            </div>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <button onClick={() => setIslemModal(null)} className="btn-secondary text-[11px]">İptal</button>
                            <button onClick={islemKaydet} disabled={kayitYukleniyor} className="text-[11px] font-semibold text-white px-4 py-2 flex items-center gap-1.5 transition-colors"
                                style={{ background: islemModal === "YATIRMA" ? "#059669" : islemModal === "CEKME" ? "#dc2626" : "#3b82f6" }}>
                                {kayitYukleniyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-check text-[10px]" />}
                                Onayla
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <OnayModal />
        </main>
    );
}
