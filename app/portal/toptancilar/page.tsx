"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface SirketBilgi {
    id: number;
    isletme_adi: string;
    il?: string;
    telefon?: string;
}

interface Baglanti {
    id: number;
    toptanci_id: number;
    durum: string;
    created_at: string;
    sirketler?: SirketBilgi | SirketBilgi[] | null;
}

export default function ToptancilarimSayfasi() {
    const { aktifSirket } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();
    const [baglantilar, setBaglantilar] = useState<Baglanti[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);

    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
        verileriGetir();
    }, [aktifSirket]);

    async function verileriGetir() {
        if (!aktifSirket) return;
        setYukleniyor(true);

        const { data: bagData } = await supabase
            .from("b2b_baglantilar")
            .select("id, durum, toptanci_id, created_at")
            .eq("market_id", aktifSirket.id);

        if (!bagData || bagData.length === 0) { setBaglantilar([]); setYukleniyor(false); return; }

        const ids = bagData.map(b => b.toptanci_id);

        const { data: sirketler } = await supabase
            .from("sirketler")
            .select("id, isletme_adi, il, telefon")
            .filter("id", "in", `(${ids.join(",")})`);

        // Birleştir
        const sirketMap: Record<number, SirketBilgi> = {};
        (sirketler || []).forEach(s => { sirketMap[s.id] = s; });

        const sonuc: Baglanti[] = bagData.map(b => ({
            ...b,
            sirketler: sirketMap[b.toptanci_id] || null,
        }));

        setBaglantilar(sonuc);
        setYukleniyor(false);
    }

    const durumGuncelle = async (id: number, yeniDurum: string, mesaj: string) => {
        const { error } = await supabase.from("b2b_baglantilar").update({ durum: yeniDurum }).eq("id", id);
        if (error) toast.error("Hata: " + error.message);
        else { toast.success(mesaj); verileriGetir(); }
    };

    const onaylilar = baglantilar.filter(b => b.durum === "ONAYLANDI");
    const bekleyenler = baglantilar.filter(b => b.durum === "BEKLIYOR");
    const reddedilenler = baglantilar.filter(b => b.durum === "REDDEDILDI");

    if (!aktifSirket) return <div className="h-full flex items-center justify-center" style={{ background: "var(--c-bg)" }}><span className="text-[12px] font-semibold text-[#64748b] tracking-widest uppercase">Sistem Doğrulanıyor</span></div>;

    const BaglantiKarti = ({ b, tip }: { b: Baglanti; tip: "aktif" | "bekliyor" | "reddedildi" }) => {
        const info = b.sirketler && !Array.isArray(b.sirketler) ? b.sirketler : null;
        const ad = info?.isletme_adi || "Bilinmiyor";
        const il = info?.il || "-";
        const tel = info?.telefon || "-";
        return (
            <div className="bg-white border border-slate-200 p-4 hover:bg-[#f8fafc] transition-colors">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 flex items-center justify-center shrink-0 text-[13px] font-semibold ${tip === "aktif" ? "bg-emerald-50 text-[#059669]" : tip === "bekliyor" ? "bg-amber-50 text-[#f59e0b]" : "bg-red-50 text-[#dc2626]"}`}>
                            <i className={`fas ${tip === "aktif" ? "fa-store" : tip === "bekliyor" ? "fa-clock" : "fa-times-circle"}`} />
                        </div>
                        <div>
                            <div className="text-[13px] font-semibold text-[#0f172a]">{ad}</div>
                            <div className="text-[10px] text-[#64748b] mt-0.5">{il}</div>
                        </div>
                    </div>
                    <span className={`badge-durum ${tip === "aktif" ? "badge-teslim" : tip === "bekliyor" ? "badge-hazirlaniyor" : "badge-iptal"}`}>
                        {tip === "aktif" ? "Aktif" : tip === "bekliyor" ? "Bekliyor" : "Reddedildi"}
                    </span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-[#64748b] mb-3">
                    {tel !== "-" && <span><i className="fas fa-phone mr-1" />{tel}</span>}
                    <span><i className="fas fa-calendar mr-1" />{new Date(b.created_at).toLocaleDateString("tr-TR")}</span>
                </div>
                <div className="flex items-center gap-2">
                    {tip === "aktif" && (
                        <>
                            <Link href="/portal" className="btn-primary text-[10px] flex items-center gap-1"><i className="fas fa-shopping-cart" /> Sipariş Ver</Link>
                            <button onClick={() => onayla({ baslik: "Bağlantıyı Kes", mesaj: `"${ad}" ile bağlantınızı kesmek istediğinize emin misiniz?`, altMesaj: "Bu işlem geri alınamaz. Tekrar bağlanmak için yeni istek göndermeniz gerekecek.", onayMetni: "Evet, Kes", tehlikeli: true, onOnayla: async () => { const { error } = await supabase.from("b2b_baglantilar").delete().eq("id", b.id); if (error) toast.error("Hata: " + error.message); else { toast.success("Bağlantı kesildi."); verileriGetir(); } } })} className="btn-secondary text-[10px] flex items-center gap-1 text-[#dc2626]"><i className="fas fa-unlink" /> Bağlantıyı Kes</button>
                        </>
                    )}
                    {tip === "bekliyor" && (
                        <button onClick={() => onayla({ baslik: "İsteği İptal Et", mesaj: "Bu bağlantı isteğini iptal etmek istiyor musunuz?", onayMetni: "Evet, İptal Et", tehlikeli: true, onOnayla: () => durumGuncelle(b.id, "REDDEDILDI", "İstek iptal edildi.") })} className="btn-secondary text-[10px] flex items-center gap-1 text-[#dc2626]"><i className="fas fa-times" /> İsteği İptal Et</button>
                    )}
                    {tip === "reddedildi" && (
                        <button onClick={() => durumGuncelle(b.id, "BEKLIYOR", "Yeni istek gönderildi!")} className="btn-primary text-[10px] flex items-center gap-1" style={{ background: "#3b82f6" }}><i className="fas fa-redo" /> Tekrar İstek Gönder</button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-6 custom-scrollbar">

                {yukleniyor ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-16">
                        <i className="fas fa-circle-notch fa-spin text-[#64748b] text-2xl mb-3" />
                        <span className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-widest">Toptancılar yükleniyor...</span>
                    </div>
                ) : baglantilar.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-16">
                        <div className="w-16 h-16 bg-[#f1f5f9] text-[#94a3b8] flex items-center justify-center mb-4"><i className="fas fa-store text-2xl" /></div>
                        <h2 className="text-[14px] font-semibold text-[#0f172a] mb-1">Henüz kayıtlı toptancınız yok</h2>
                        <p className="text-[12px] text-[#64748b] mb-4">Toptan sipariş sayfasından toptancı arayabilirsiniz.</p>
                        <Link href="/portal" className="btn-primary flex items-center gap-2"><i className="fas fa-search text-[10px]" /> Toptancı Bul</Link>
                    </div>
                ) : (<>

                {/* ONAYLANMIŞ TOPTANCILAR */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <h2 className="text-[13px] font-semibold text-[#0f172a]">Aktif Toptancılarım</h2>
                        <span className="bg-emerald-50 text-[#059669] text-[10px] font-semibold px-2 py-0.5">{onaylilar.length}</span>
                    </div>
                    {onaylilar.length === 0 ? (
                        <div className="bg-white border border-slate-200 p-8 text-center">
                            <i className="fas fa-store text-3xl text-[#e2e8f0] mb-3" />
                            <p className="text-[12px] text-[#94a3b8] font-semibold">Henüz onaylanmış toptancı bağlantınız yok.</p>
                            <Link href="/portal" className="btn-primary text-[10px] mt-3 inline-flex items-center gap-1"><i className="fas fa-search" /> Toptancı Bul</Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {onaylilar.map(b => <BaglantiKarti key={b.id} b={b} tip="aktif" />)}
                        </div>
                    )}
                </div>

                {/* BEKLEYEN İSTEKLER */}
                {bekleyenler.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-[13px] font-semibold text-[#0f172a]">Bekleyen İstekler</h2>
                            <span className="bg-amber-50 text-[#f59e0b] text-[10px] font-semibold px-2 py-0.5">{bekleyenler.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {bekleyenler.map(b => <BaglantiKarti key={b.id} b={b} tip="bekliyor" />)}
                        </div>
                    </div>
                )}

                {/* REDDEDİLEN BAĞLANTILAR */}
                {reddedilenler.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-[13px] font-semibold text-[#0f172a]">Reddedilen / Kesilen Bağlantılar</h2>
                            <span className="bg-red-50 text-[#dc2626] text-[10px] font-semibold px-2 py-0.5">{reddedilenler.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {reddedilenler.map(b => <BaglantiKarti key={b.id} b={b} tip="reddedildi" />)}
                        </div>
                    </div>
                )}

                </>)}
            </div>
            <OnayModal />
        </main>
    );
}
