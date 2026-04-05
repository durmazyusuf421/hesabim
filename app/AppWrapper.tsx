"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import { supabase } from "@/app/lib/supabase";
import { bildirimEkle } from "@/app/lib/bildirim";

interface MenuItem {
    href: string;
    label: string;
    icon: string;
    section?: string;
    yetkiler?: string[];
}

const TOPTANCI_MENU: MenuItem[] = [
    { href: "/dashboard", label: "Genel Bakış", icon: "fa-chart-pie", yetkiler: ["YONETICI"] },
    { href: "/pos", label: "Hızlı Satış (POS)", icon: "fa-desktop", section: "SATIŞ", yetkiler: ["YONETICI", "PLASIYER", "DEPOCU"] },
    { href: "/", label: "Siparişler (Fiş)", icon: "fa-th-large", yetkiler: ["YONETICI", "PLASIYER", "DEPOCU"] },
    { href: "/kampanyalar", label: "Kampanyalar", icon: "fa-tags", yetkiler: ["YONETICI"] },
    { href: "/tahsilat", label: "Tahsilat / Ödeme", icon: "fa-money-bill-wave", section: "FİNANS", yetkiler: ["YONETICI", "MUHASEBE"] },
    { href: "/banka", label: "Banka Hesapları", icon: "fa-university", yetkiler: ["YONETICI", "MUHASEBE"] },
    { href: "/cek-senet", label: "Çek / Senet", icon: "fa-money-check", yetkiler: ["YONETICI", "MUHASEBE"] },
    { href: "/faturalar", label: "Faturalar", icon: "fa-file-invoice", yetkiler: ["YONETICI", "MUHASEBE"] },
    { href: "/stok", label: "Stok Kartları", icon: "fa-box", section: "DEPO", yetkiler: ["YONETICI", "DEPOCU"] },
    { href: "/stok-hareketleri", label: "Stok Hareketleri", icon: "fa-dolly-flatbed", yetkiler: ["YONETICI", "DEPOCU"] },
    { href: "/stok/sayim", label: "Stok Sayımı", icon: "fa-clipboard-check", yetkiler: ["YONETICI", "DEPOCU"] },
    { href: "/cari", label: "Cari Kartları", icon: "fa-users", section: "MUHASEBE", yetkiler: ["YONETICI", "PLASIYER", "MUHASEBE"] },
    { href: "/ekstre", label: "Cari Hareketler", icon: "fa-clipboard-list", yetkiler: ["YONETICI", "MUHASEBE"] },
    { href: "/raporlar", label: "Raporlar", icon: "fa-chart-bar", yetkiler: ["YONETICI", "MUHASEBE"] },
];

const MUSTERI_MENU: MenuItem[] = [
    { href: "/portal/pos", label: "Hızlı Satış (POS)", icon: "fa-barcode", section: "SATIŞ" },
    { href: "/kampanyalar", label: "Kampanyalar", icon: "fa-tags" },
    { href: "/portal", label: "Toptan Sipariş", icon: "fa-store", section: "TEDARİK" },
    { href: "/portal/siparisler", label: "Siparişlerim", icon: "fa-list-alt" },
    { href: "/portal/toptancilar", label: "Toptancılarım", icon: "fa-handshake" },
    { href: "/stok", label: "Stok Kartları", icon: "fa-box", section: "DEPO" },
    { href: "/stok-hareketleri", label: "Stok Hareketleri", icon: "fa-dolly-flatbed" },
    { href: "/stok/sayim", label: "Stok Sayımı", icon: "fa-clipboard-check" },
    { href: "/portal/kasa", label: "Kasa & Nakit Akışı", icon: "fa-cash-register", section: "FİNANS" },
    { href: "/banka", label: "Banka Hesapları", icon: "fa-university" },
    { href: "/cek-senet", label: "Çek / Senet", icon: "fa-money-check" },
    { href: "/faturalar", label: "Faturalar", icon: "fa-file-invoice" },
    { href: "/portal/veresiye", label: "Veresiye Defteri", icon: "fa-book" },
    { href: "/portal/ekstre", label: "Hesap Ekstresi", icon: "fa-clipboard-list" },
    { href: "/cari", label: "Cari Kartlar", icon: "fa-users", section: "MUHASEBE" },
    { href: "/ekstre", label: "Cari Hareketler", icon: "fa-clipboard-list" },
    { href: "/portal/raporlar", label: "Raporlarım", icon: "fa-chart-bar" },
];

const SAYFA_BASLIK: Record<string, { baslik: string; alt: string }> = {
    "/dashboard": { baslik: "Genel Bakış", alt: "Anlık iş verileri ve raporlar" },
    "/pos": { baslik: "Hızlı Satış (POS)", alt: "Toptan satış terminali" },
    "/": { baslik: "Siparişler", alt: "Sipariş fiş yönetimi" },
    "/tahsilat": { baslik: "Tahsilat / Ödeme", alt: "Alacak ve ödeme kayıtları" },
    "/kampanyalar": { baslik: "Kampanyalar", alt: "Kampanya ve indirim yönetimi" },
    "/banka": { baslik: "Banka Hesapları", alt: "Banka hesap takibi ve hareketler" },
    "/cek-senet": { baslik: "Çek / Senet", alt: "Çek ve senet takibi" },
    "/faturalar": { baslik: "Faturalar", alt: "e-Fatura ve e-Arşiv yönetimi" },
    "/stok": { baslik: "Stok Kartları", alt: "Ürün ve envanter yönetimi" },
    "/stok-hareketleri": { baslik: "Stok Hareketleri", alt: "Giriş / çıkış kayıtları" },
    "/stok/sayim": { baslik: "Stok Sayımı", alt: "Fiziksel stok sayımı ve fark tespiti" },
    "/cari": { baslik: "Cari Kartları", alt: "Müşteri ve tedarikçi hesapları" },
    "/ekstre": { baslik: "Cari Hareketler", alt: "Hesap ekstresi ve yürüyen bakiye" },
    "/raporlar": { baslik: "Raporlar", alt: "Satış, tahsilat ve performans analizleri" },
    "/ayarlar": { baslik: "Sistem Ayarları", alt: "Firma bilgileri ve personel yönetimi" },
    "/portal/pos": { baslik: "Hızlı Satış (POS)", alt: "Perakende satış terminali" },
    "/portal": { baslik: "Toptan Sipariş", alt: "Toptancıdan ürün sipariş edin" },
    "/portal/siparisler": { baslik: "Siparişlerim", alt: "Sipariş geçmişi ve takip" },
    "/portal/kasa": { baslik: "Kasa & Nakit Akışı", alt: "Günlük kasa işlemleri" },
    "/portal/veresiye": { baslik: "Veresiye Defteri", alt: "Veresiye müşteri takibi" },
    "/portal/ekstre": { baslik: "Hesap Ekstresi", alt: "Toptancı nezdinde cari hesap" },
    "/portal/toptancilar": { baslik: "Toptancılarım", alt: "Kayıtlı toptancı bağlantıları" },
    "/portal/raporlar": { baslik: "Raporlarım", alt: "Satış, kasa ve veresiye analizleri" },
};

export default function AppWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { aktifSirket, isYonetici, isPlasiyer, isDepocu, isMuhasebe, cikisYap, yukleniyor: authYukleniyor } = useAuth();
    const [mobilMenuAcik, setMobilMenuAcik] = useState<boolean>(false);
    const [isMounted, setIsMounted] = useState(false);
    const [authTimeout, setAuthTimeout] = useState(false);
    const [bekleyenB2B, setBekleyenB2B] = useState(0);
    // Bildirim sistemi
    const [bildirimler, setBildirimler] = useState<{id:number;baslik:string;mesaj:string;tip:string;kaynak:string|null;kaynak_id:number|null;okundu:boolean;created_at:string}[]>([]);
    const [bildirimPanelAcik, setBildirimPanelAcik] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        const timer = setTimeout(() => { setAuthTimeout(true); }, 8000);
        const handleMenuOpen = () => setMobilMenuAcik(true);
        window.addEventListener('openMobilMenu', handleMenuOpen);
        return () => { clearTimeout(timer); window.removeEventListener('openMobilMenu', handleMenuOpen); };
    }, []);

    useEffect(() => { if (aktifSirket) setAuthTimeout(false); }, [aktifSirket]);

    // Günlük otomatik döviz kuru güncelleme
    useEffect(() => {
        if (!aktifSirket) return;
        if (localStorage.getItem("doviz_otomatik_guncelleme") === "false") return;
        const LS_KEY = "_dovizSonGuncelleme";
        const bugun = new Date().toISOString().split("T")[0];
        const sonGuncelleme = localStorage.getItem(LS_KEY);
        if (sonGuncelleme === bugun) return;
        (async () => {
            try {
                const res = await fetch("/api/doviz");
                const data = await res.json();
                if (data.USD > 0) await supabase.from("doviz_kurlari").upsert({ doviz_turu: "USD", kur: data.USD, tarih: bugun }, { onConflict: "doviz_turu,tarih", ignoreDuplicates: false });
                if (data.EUR > 0) await supabase.from("doviz_kurlari").upsert({ doviz_turu: "EUR", kur: data.EUR, tarih: bugun }, { onConflict: "doviz_turu,tarih", ignoreDuplicates: false });
                if (data.USD > 0 || data.EUR > 0) localStorage.setItem(LS_KEY, bugun);
            } catch { /* sessizce devam */ }
        })();
    }, [aktifSirket]);

    useEffect(() => {
        if (!aktifSirket || aktifSirket.rol !== "TOPTANCI") return;
        async function b2bSayisiniGetir() {
            const { count } = await supabase.from("b2b_baglantilar").select("id", { count: "exact", head: true }).eq("toptanci_id", aktifSirket!.id).eq("durum", "BEKLIYOR");
            setBekleyenB2B(count || 0);
        }
        b2bSayisiniGetir();
        const interval = setInterval(b2bSayisiniGetir, 30000);
        return () => clearInterval(interval);
    }, [aktifSirket]);

    // Bildirimleri çek ve periyodik kontrol
    const bildirimGetir = async () => {
        if (!aktifSirket) return;
        const { data } = await supabase.from("bildirimler").select("*").eq("sirket_id", aktifSirket.id).order("created_at", { ascending: false }).limit(50);
        setBildirimler(data || []);
    };

    useEffect(() => {
        if (!aktifSirket) return;
        bildirimGetir();
        const interval = setInterval(bildirimGetir, 60000);
        return () => clearInterval(interval);
    }, [aktifSirket]);

    // Otomatik bildirim oluşturma (günde bir kez)
    useEffect(() => {
        if (!aktifSirket) return;
        const LS_KEY = "_bildirimOtoKontrol";
        const bugun = new Date().toISOString().split("T")[0];
        if (localStorage.getItem(LS_KEY) === bugun) return;
        (async () => {
            const sid = aktifSirket.id;
            // Kritik stok kontrolü
            const { data: stokData } = await supabase.from("urunler").select("urun_adi, stok_miktari, min_stok_miktari").eq("sahip_sirket_id", sid).eq("aktif", true).gt("min_stok_miktari", 0);
            const kritikler = (stokData || []).filter(u => Number(u.stok_miktari) <= Number(u.min_stok_miktari));
            if (kritikler.length > 0) {
                await bildirimEkle(sid, "Kritik Stok Uyarısı", `${kritikler.length} ürün kritik stok seviyesinde: ${kritikler.slice(0, 3).map(u => u.urun_adi).join(", ")}${kritikler.length > 3 ? "..." : ""}`, "UYARI", "STOK");
            }
            // Çek/senet vade kontrolü (3 gün içinde)
            const ucGunSonra = new Date(); ucGunSonra.setDate(ucGunSonra.getDate() + 3);
            const ucGunStr = ucGunSonra.toISOString().split("T")[0];
            const { data: cekData } = await supabase.from("cek_senetler").select("id, cek_no, tutar, vade_tarihi").eq("sirket_id", sid).eq("durum", "BEKLIYOR").gte("vade_tarihi", bugun).lte("vade_tarihi", ucGunStr);
            if (cekData && cekData.length > 0) {
                await bildirimEkle(sid, "Çek/Senet Vade Yaklaşıyor", `${cekData.length} adet çek/senet 3 gün içinde vadesi doluyor`, "UYARI", "CEK_SENET");
            }
            localStorage.setItem(LS_KEY, bugun);
            bildirimGetir();
        })();
    }, [aktifSirket]);

    const okunmamisSayisi = bildirimler.filter(b => !b.okundu).length;

    const tumunuOkunduYap = async () => {
        if (!aktifSirket) return;
        await supabase.from("bildirimler").update({ okundu: true }).eq("sirket_id", aktifSirket.id).eq("okundu", false);
        bildirimGetir();
    };

    const tumunuTemizle = async () => {
        if (!aktifSirket) return;
        await supabase.from("bildirimler").delete().eq("sirket_id", aktifSirket.id);
        setBildirimler([]);
    };

    const bildirimIkon = (tip: string) => {
        if (tip === "BASARI") return { icon: "fa-check-circle", color: "#059669", bg: "#ecfdf5" };
        if (tip === "UYARI") return { icon: "fa-exclamation-triangle", color: "#f59e0b", bg: "#fffbeb" };
        if (tip === "HATA") return { icon: "fa-times-circle", color: "#dc2626", bg: "#fef2f2" };
        return { icon: "fa-info-circle", color: "#3b82f6", bg: "#eff6ff" };
    };

    const bildirimYonlendir = (kaynak: string | null) => {
        if (kaynak === "SIPARIS") return "/";
        if (kaynak === "STOK") return "/stok";
        if (kaynak === "CARI" || kaynak === "B2B") return "/cari";
        if (kaynak === "CEK_SENET") return "/cek-senet";
        if (kaynak === "VERESIYE") return "/portal/veresiye";
        return null;
    };

    const isLoginPage = pathname === '/login' || pathname.startsWith('/login');

    useEffect(() => {
        if (isLoginPage) return;
        if (authTimeout && !aktifSirket && !authYukleniyor) { window.location.href = "/login"; }
    }, [authTimeout, aktifSirket, authYukleniyor, isLoginPage]);

    const menuYetkiliMi = (item: MenuItem): boolean => {
        if (!item.yetkiler || item.yetkiler.length === 0) return true;
        const set = new Set<string>();
        if (isYonetici) set.add("YONETICI");
        if (isPlasiyer) set.add("PLASIYER");
        if (isDepocu) set.add("DEPOCU");
        if (isMuhasebe) set.add("MUHASEBE");
        return item.yetkiler.some(y => set.has(y));
    };

    if (isLoginPage) return <>{children}</>;

    if (!isMounted || authYukleniyor || !aktifSirket) {
        return (
            <div className="h-screen h-[100dvh] flex flex-col items-center justify-center" style={{ background: "var(--c-bg)" }}>
                <div className="w-8 h-8 border-2 border-[#0f172a] border-t-transparent animate-spin mb-4" />
                <span className="text-[12px] font-semibold text-[#64748b] tracking-widest uppercase">Sistem Doğrulanıyor</span>
            </div>
        );
    }

    const sirketRol = aktifSirket?.rol || "TOPTANCI";
    const isToptanci = sirketRol === "TOPTANCI";
    const menu = isToptanci ? TOPTANCI_MENU : MUSTERI_MENU;
    const accentColor = isToptanci ? "var(--c-accent-toptanci)" : "var(--c-accent-musteri)";
    const sayfaBilgi = SAYFA_BASLIK[pathname] || { baslik: "Sayfa", alt: "" };
    let lastSection: string | undefined;

    return (
        <div className="h-screen h-[100dvh] flex overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {mobilMenuAcik && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobilMenuAcik(false)} />}

            {/* ═══ SIDEBAR ═══ */}
            <aside className={`w-[var(--sidebar-w)] flex flex-col shrink-0 print:hidden fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 ${mobilMenuAcik ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} style={{ background: "var(--c-sidebar)" }}>
                {/* Logo / Firma */}
                <div className="h-14 flex items-center justify-between px-3 shrink-0" style={{ borderBottom: "1px solid var(--c-sidebar-border)" }}>
                    <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-semibold tracking-[0.2em] uppercase mb-0.5" style={{ color: accentColor }}>
                            {isToptanci ? "TOPTANCI PANELİ" : "MÜŞTERİ PANELİ"}
                            {isYonetici && <span className="ml-1.5 text-[#f59e0b]">· YÖNETİCİ</span>}
                        </div>
                        <div className="text-[12px] font-semibold text-[#e2e8f0] truncate">{aktifSirket?.isletme_adi}</div>
                    </div>
                    <button onClick={() => setMobilMenuAcik(false)} className="md:hidden text-[#475569] hover:text-white ml-2"><i className="fas fa-times" /></button>
                </div>

                {/* Menü */}
                <nav className="flex-1 py-2 overflow-y-auto custom-scrollbar">
                    {menu.map((item, i) => {
                        const yetkili = menuYetkiliMi(item);
                        const active = pathname === item.href;
                        const showSection = item.section && item.section !== lastSection;
                        if (item.section) lastSection = item.section;
                        return (
                            <React.Fragment key={i}>
                                {showSection && (
                                    <div className="px-3 pt-5 pb-1.5">
                                        <span className="text-[9px] font-semibold tracking-[0.2em] text-[#475569] uppercase">{item.section}</span>
                                    </div>
                                )}
                                {yetkili ? (
                                    <Link href={item.href} onClick={() => setMobilMenuAcik(false)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition-colors border-l-2 ${active ? 'text-white font-semibold' : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#1e293b]/50 border-transparent'}`}
                                        style={active ? { background: "var(--c-sidebar-active)", borderLeftColor: accentColor } : {}}>
                                        <i className={`fas ${item.icon} w-5 text-center text-[11px]`} />
                                        <span className="flex-1">{item.label}</span>
                                        {item.href === "/cari" && bekleyenB2B > 0 && (
                                            <span className="bg-red-600 text-white text-[9px] font-semibold w-5 h-5 flex items-center justify-center animate-pulse">{bekleyenB2B}</span>
                                        )}
                                    </Link>
                                ) : (
                                    <div className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#334155] opacity-40 cursor-not-allowed border-l-2 border-transparent" title="Yetkiniz yok">
                                        <i className={`fas ${item.icon} w-5 text-center text-[11px]`} />
                                        <span className="flex-1">{item.label}</span>
                                        <i className="fas fa-lock text-[8px]" />
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </nav>

                {/* Alt Butonlar */}
                <div className="p-2 shrink-0 space-y-0.5" style={{ borderTop: "1px solid var(--c-sidebar-border)" }}>
                    {isYonetici || sirketRol === "PERAKENDE" ? (
                        <Link href="/ayarlar" onClick={() => setMobilMenuAcik(false)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium transition-colors ${pathname === "/ayarlar" ? "text-white bg-[#1e293b]" : "text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e293b]/50"}`}>
                            <i className="fas fa-cog w-5 text-center text-[10px]" />
                            <span className="uppercase tracking-widest">Ayarlar</span>
                        </Link>
                    ) : (
                        <div className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-[#334155] opacity-40 cursor-not-allowed" title="Yetkiniz yok">
                            <i className="fas fa-cog w-5 text-center text-[10px]" />
                            <span className="uppercase tracking-widest">Ayarlar</span>
                            <i className="fas fa-lock ml-auto text-[8px]" />
                        </div>
                    )}
                    <button onClick={cikisYap} className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-medium text-[#64748b] hover:text-[#ef4444] hover:bg-[#ef4444]/5 transition-colors text-left">
                        <i className="fas fa-sign-out-alt w-5 text-center text-[10px]" />
                        <span className="uppercase tracking-widest">Oturumu Kapat</span>
                    </button>
                </div>
            </aside>

            {/* ═══ ANA İÇERİK ═══ */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-4 md:px-5 shrink-0" style={{ height: "var(--header-h)", background: "white", borderBottom: "1px solid var(--c-border)" }}>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setMobilMenuAcik(true)} className="md:hidden w-8 h-8 flex items-center justify-center text-[#64748b] hover:bg-[#f8fafc] transition-colors" style={{ border: "1px solid var(--c-border)" }}>
                            <i className="fas fa-bars text-sm" />
                        </button>
                        <div>
                            <h1 className="text-[13px] font-semibold text-[#0f172a] tracking-tight leading-tight">{sayfaBilgi.baslik}</h1>
                            {sayfaBilgi.alt && <p className="text-[9px] font-medium text-[#94a3b8] tracking-wide uppercase mt-0.5 hidden sm:block">{sayfaBilgi.alt}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setBildirimPanelAcik(!bildirimPanelAcik)} className="relative w-8 h-8 flex items-center justify-center text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors" style={{ border: "1px solid var(--c-border)" }}>
                            <i className="fas fa-bell text-[12px]" />
                            {okunmamisSayisi > 0 && (
                                <span className="absolute -top-1 -right-1 bg-[#dc2626] text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center animate-pulse">{okunmamisSayisi > 9 ? "9+" : okunmamisSayisi}</span>
                            )}
                        </button>
                        <span className="text-[11px] text-[#94a3b8] hidden sm:block">{aktifSirket.isletme_adi}</span>
                        <div className="w-7 h-7 bg-[#0f172a] text-white flex items-center justify-center text-[11px] font-semibold">
                            {(aktifSirket.isletme_adi || "D").substring(0, 2).toUpperCase()}
                        </div>
                    </div>
                </header>

                {/* Bildirim Paneli */}
                {bildirimPanelAcik && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setBildirimPanelAcik(false)} />
                        <div className="fixed top-[var(--header-h)] right-0 w-full sm:w-96 h-[calc(100vh-var(--header-h)-var(--footer-h))] bg-white z-50 flex flex-col" style={{ borderLeft: "1px solid var(--c-border)", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)" }}>
                            <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <div className="text-[13px] font-semibold text-[#0f172a]"><i className="fas fa-bell mr-2 text-[#3b82f6]" />Bildirimler</div>
                                <div className="flex items-center gap-2">
                                    {okunmamisSayisi > 0 && (
                                        <button onClick={tumunuOkunduYap} className="text-[9px] font-semibold text-[#3b82f6] hover:text-[#1d4ed8] uppercase tracking-wider">
                                            <i className="fas fa-check-double mr-1 text-[8px]" />Okundu
                                        </button>
                                    )}
                                    {bildirimler.length > 0 && (
                                        <button onClick={tumunuTemizle} className="text-[9px] font-semibold text-[#dc2626] hover:text-[#b91c1c] uppercase tracking-wider">
                                            <i className="fas fa-trash mr-1 text-[8px]" />Temizle
                                        </button>
                                    )}
                                    <button onClick={() => setBildirimPanelAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a] ml-1"><i className="fas fa-times" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {bildirimler.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                        <i className="fas fa-bell-slash text-[32px] text-[#e2e8f0] mb-3" />
                                        <div className="text-[11px] text-[#94a3b8] font-medium">Bildirim yok</div>
                                    </div>
                                ) : bildirimler.map(b => {
                                    const ikon = bildirimIkon(b.tip);
                                    const hedef = bildirimYonlendir(b.kaynak);
                                    const zamanFark = () => {
                                        const dk = Math.floor((Date.now() - new Date(b.created_at).getTime()) / 60000);
                                        if (dk < 1) return "Az önce";
                                        if (dk < 60) return `${dk} dk önce`;
                                        const saat = Math.floor(dk / 60);
                                        if (saat < 24) return `${saat} saat önce`;
                                        return `${Math.floor(saat / 24)} gün önce`;
                                    };
                                    return (
                                        <div key={b.id} onClick={() => { if (hedef) { setBildirimPanelAcik(false); window.location.href = hedef; } }} className={`flex items-start gap-3 px-4 py-3 transition-colors border-b border-[#f1f5f9] ${!b.okundu ? "bg-blue-50/30" : "bg-white"} ${hedef ? "cursor-pointer hover:bg-[#f8fafc]" : ""}`}>
                                            <div className="w-7 h-7 flex items-center justify-center shrink-0 mt-0.5" style={{ background: ikon.bg, color: ikon.color }}>
                                                <i className={`fas ${ikon.icon} text-[10px]`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[11px] font-semibold ${!b.okundu ? "text-[#0f172a]" : "text-[#64748b]"}`}>{b.baslik}</span>
                                                    {!b.okundu && <span className="w-1.5 h-1.5 bg-[#3b82f6] shrink-0" />}
                                                </div>
                                                {b.mesaj && <div className="text-[10px] text-[#94a3b8] mt-0.5 line-clamp-2">{b.mesaj}</div>}
                                                <div className="text-[9px] text-[#cbd5e1] mt-1">{zamanFark()}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {/* Sayfa İçeriği */}
                {children}

                {/* Footer */}
                <footer className="flex items-center justify-between px-4 md:px-5 shrink-0 print:hidden" style={{ height: "var(--footer-h)", background: "white", borderTop: "1px solid var(--c-border)" }}>
                    <span className="text-[9px] text-[#cbd5e1] tracking-wide font-medium">DURMAZ B2B TİCARET SİSTEMİ v2.4</span>
                    <span className="text-[9px] text-[#cbd5e1]">© 2026 Tüm Hakları Saklıdır</span>
                </footer>
            </div>
        </div>
    );
}
