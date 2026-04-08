"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import Link from "next/link";

interface UrunFiyat {
    id: number;
    urun_adi: string;
    barkod?: string;
    alis_fiyati: number;
    satis_fiyati: number;
    stok_miktari: number;
    degisti?: boolean;
}

export default function TopluFiyatGuncelleme() {
    const { aktifSirket, isYonetici } = useAuth();
    const toast = useToast();
    const [urunler, setUrunler] = useState<UrunFiyat[]>([]);
    const [aramaTerimi, setAramaTerimi] = useState("");
    const [yukleniyor, setYukleniyor] = useState(true);
    const [kaydediliyor, setKaydediliyor] = useState(false);

    const sirketId = aktifSirket?.id;

    useEffect(() => {
        if (!sirketId) return;
        verileriGetir(sirketId);
    }, [sirketId]);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        const { data } = await supabase.from("urunler").select("id, urun_adi, barkod, alis_fiyati, satis_fiyati, stok_miktari").eq("sahip_sirket_id", sirketId).order("urun_adi");
        setUrunler((data || []).map(u => ({ ...u, alis_fiyati: Number(u.alis_fiyati) || 0, satis_fiyati: Number(u.satis_fiyati) || 0, stok_miktari: Number(u.stok_miktari) || 0, degisti: false })));
        setYukleniyor(false);
    }

    const fiyatGuncelle = (id: number, alan: "alis_fiyati" | "satis_fiyati", deger: number) => {
        setUrunler(prev => prev.map(u => u.id === id ? { ...u, [alan]: deger, degisti: true } : u));
    };

    const tumunuKaydet = async () => {
        const degisenler = urunler.filter(u => u.degisti);
        if (degisenler.length === 0) { toast.error("Değişiklik yapılmadı!"); return; }

        setKaydediliyor(true);
        let basarili = 0;
        for (const u of degisenler) {
            const { error } = await supabase.from("urunler").update({ alis_fiyati: u.alis_fiyati, satis_fiyati: u.satis_fiyati }).eq("id", u.id);
            if (!error) basarili++;
        }
        toast.success(`${basarili} ürünün fiyatı güncellendi!`);
        setUrunler(prev => prev.map(u => ({ ...u, degisti: false })));
        setKaydediliyor(false);
    };

    const filtrelenmis = urunler.filter(u =>
        u.urun_adi.toLowerCase().includes(aramaTerimi.toLowerCase()) ||
        (u.barkod || "").includes(aramaTerimi)
    );

    const degisiklikSayisi = urunler.filter(u => u.degisti).length;

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-semibold text-slate-500" style={{ background: "#f8fafc" }}>Yükleniyor...</div>;

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <Link href="/stok" className="btn-secondary flex items-center px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                    <i className="fas fa-arrow-left mr-2"></i> Stok Kartlarına Dön
                </Link>
                <div className="flex-1 max-w-md relative">
                    <input type="text" placeholder="Ürün adı veya barkod ile ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-full text-xs px-3 py-1.5" />
                    <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                </div>
                <span className="text-[10px] font-semibold text-slate-500">{filtrelenmis.length} ürün</span>
                <button onClick={tumunuKaydet} disabled={kaydediliyor || degisiklikSayisi === 0} className="btn-primary flex items-center px-3 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-50">
                    <i className="fas fa-save mr-2"></i> {kaydediliyor ? "Kaydediliyor..." : `Tümünü Kaydet (${degisiklikSayisi})`}
                </button>
            </div>

            <div className="flex-1 overflow-auto relative">
                <table className="tbl-kurumsal w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                    <thead className="sticky top-0 z-10" style={{ background: "#f8fafc", borderBottom: "2px solid var(--c-border)" }}>
                        <tr>
                            <th className="p-2 text-[11px] font-semibold text-slate-700 w-16 text-center" style={{ borderRight: "1px solid var(--c-border)" }}>#</th>
                            <th className="p-2 text-[11px] font-semibold text-slate-700" style={{ borderRight: "1px solid var(--c-border)" }}>Ürün Adı</th>
                            <th className="p-2 text-[11px] font-semibold text-slate-700 w-28 text-center" style={{ borderRight: "1px solid var(--c-border)" }}>Barkod</th>
                            <th className="p-2 text-[11px] font-semibold text-slate-700 w-24 text-center" style={{ borderRight: "1px solid var(--c-border)" }}>Stok</th>
                            <th className="p-2 text-[11px] font-semibold text-slate-700 w-36 text-right" style={{ borderRight: "1px solid var(--c-border)" }}>Alış Fiyatı (TL)</th>
                            <th className="p-2 text-[11px] font-semibold text-slate-700 w-36 text-right" style={{ borderRight: "1px solid var(--c-border)" }}>Satış Fiyatı (TL)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {yukleniyor ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-semibold uppercase tracking-widest">Yükleniyor...</td></tr>
                        ) : filtrelenmis.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-semibold uppercase tracking-widest">Ürün bulunamadı</td></tr>
                        ) : (
                            filtrelenmis.map((u, i) => (
                                <tr key={u.id} className={`text-[11px] font-medium transition-colors ${u.degisti ? 'bg-amber-50 border-l-4 border-l-amber-400' : ''}`} style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    <td className="p-1.5 text-center text-slate-400" style={{ borderRight: "1px solid var(--c-border)" }}>{i + 1}</td>
                                    <td className="p-1.5 font-semibold text-slate-800" style={{ borderRight: "1px solid var(--c-border)" }}>{u.urun_adi}</td>
                                    <td className="p-1.5 text-center font-mono text-slate-500" style={{ borderRight: "1px solid var(--c-border)" }}>{u.barkod || '-'}</td>
                                    <td className={`p-1.5 text-center font-semibold ${u.stok_miktari <= 0 ? 'text-[#dc2626]' : 'text-emerald-600'}`} style={{ borderRight: "1px solid var(--c-border)" }}>{u.stok_miktari}</td>
                                    <td className="p-0" style={{ borderRight: "1px solid var(--c-border)" }}>
                                        <input type="number" min="0" step="0.01" value={u.alis_fiyati} onChange={(e) => fiyatGuncelle(u.id, "alis_fiyati", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] text-right font-semibold text-slate-700 outline-none bg-transparent focus:bg-white border-none" />
                                    </td>
                                    <td className="p-0" style={{ borderRight: "1px solid var(--c-border)" }}>
                                        <input type="number" min="0" step="0.01" value={u.satis_fiyati} onChange={(e) => fiyatGuncelle(u.id, "satis_fiyati", Number(e.target.value))} className="w-full px-2 py-1.5 text-[11px] text-right font-semibold text-[#1d4ed8] outline-none bg-transparent focus:bg-white border-none" />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </main>
    );
}
