"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

// --- TİP TANIMLAMALARI ---
interface FirmaMap { [key: number]: string; }
interface Siparis {
    id: number;
    siparis_no: string;
    alici_firma_id: number;
    durum: string;
    toplam_tutar: number;
    created_at: string;
    musteri_adi?: string;
}
interface SiparisKalemi {
    id: number;
    siparis_id: number;
    urun_adi: string;
    miktar: number;
    birim_fiyat: number;
}

const DURUM_SECENEKLERI = ["YENI", "HAZIRLANIYOR", "TAMAMLANDI", "IPTAL"] as const;

const durumStili = (durum: string) => {
    switch (durum) {
        case "YENI": return { bg: "bg-amber-100", text: "text-amber-700", icon: "fas fa-clock" };
        case "HAZIRLANIYOR": return { bg: "bg-blue-100", text: "text-blue-700", icon: "fas fa-cog fa-spin" };
        case "TAMAMLANDI": return { bg: "bg-emerald-100", text: "text-emerald-700", icon: "fas fa-check-circle" };
        case "IPTAL": return { bg: "bg-red-100", text: "text-red-700", icon: "fas fa-times-circle" };
        default: return { bg: "bg-slate-100", text: "text-slate-600", icon: "fas fa-question-circle" };
    }
};

const parseTutar = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === "number") return val;
    const num = Number(String(val).replace(/\./g, "").replace(",", "."));
    return isNaN(num) ? 0 : num;
};

export default function GelenSiparisler() {
    const toast = useToast();
    const { aktifSirket } = useAuth();

    const [siparisler, setSiparisler] = useState<Siparis[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    // FİLTRELER
    const [durumFiltresi, setDurumFiltresi] = useState<string>("");
    const [baslangicTarih, setBaslangicTarih] = useState("");
    const [bitisTarih, setBitisTarih] = useState("");
    const [aramaTerimi, setAramaTerimi] = useState("");

    // DETAY MODAL
    const [detayModalAcik, setDetayModalAcik] = useState(false);
    const [seciliSiparis, setSeciliSiparis] = useState<Siparis | null>(null);
    const [kalemler, setKalemler] = useState<SiparisKalemi[]>([]);
    const [kalemYukleniyor, setKalemYukleniyor] = useState(false);

    // --- VERİ ÇEKME ---
    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }

        const sirketId = aktifSirket.id;
        async function verileriGetir() {
            setYukleniyor(true);
            try {
                const { data: firmalarData } = await supabase
                    .from("firmalar").select("id, unvan").eq("sahip_sirket_id", sirketId);
                const map: FirmaMap = {};
                if (firmalarData) firmalarData.forEach(f => { map[f.id] = f.unvan; });
                const { data } = await supabase
                    .from("siparisler").select("*")
                    .eq("satici_sirket_id", sirketId)
                    .order("created_at", { ascending: false });

                if (data) {
                    setSiparisler(data.map(s => ({
                        ...s,
                        musteri_adi: map[s.alici_firma_id] || "Bilinmiyor"
                    })));
                }
            } catch {
                toast.error("Siparişler yüklenirken hata oluştu.");
            }
            setYukleniyor(false);
        }

        verileriGetir();
    }, [aktifSirket, toast]);

    // --- FİLTRELENMİŞ SİPARİŞLER ---
    const filtrelenmis = useMemo(() => {
        return siparisler.filter(s => {
            if (durumFiltresi && s.durum !== durumFiltresi) return false;
            if (baslangicTarih && s.created_at < baslangicTarih) return false;
            if (bitisTarih && s.created_at > bitisTarih + "T23:59:59") return false;
            if (aramaTerimi) {
                const ara = aramaTerimi.toLocaleLowerCase("tr-TR");
                const eslesti =
                    (s.siparis_no || "").toLocaleLowerCase("tr-TR").includes(ara) ||
                    (s.musteri_adi || "").toLocaleLowerCase("tr-TR").includes(ara);
                if (!eslesti) return false;
            }
            return true;
        });
    }, [siparisler, durumFiltresi, baslangicTarih, bitisTarih, aramaTerimi]);

    // --- DURUM GÜNCELLEME ---
    const durumGuncelle = async (siparisId: number, yeniDurum: string) => {
        const { error } = await supabase
            .from("siparisler").update({ durum: yeniDurum }).eq("id", siparisId);
        if (error) {
            toast.error("Durum güncellenirken hata oluştu.");
            return;
        }
        toast.success(`Sipariş durumu "${yeniDurum}" olarak güncellendi.`);
        setSiparisler(prev => prev.map(s => s.id === siparisId ? { ...s, durum: yeniDurum } : s));
    };

    // --- DETAY MODAL ---
    const detayAc = async (siparis: Siparis) => {
        setSeciliSiparis(siparis);
        setDetayModalAcik(true);
        setKalemYukleniyor(true);
        const { data } = await supabase
            .from("siparis_kalemleri").select("*").eq("siparis_id", siparis.id);
        setKalemler(data || []);
        setKalemYukleniyor(false);
    };

    // --- FİLTRE TEMİZLE ---
    const filtreTemizle = () => { setDurumFiltresi(""); setBaslangicTarih(""); setBitisTarih(""); setAramaTerimi(""); };

    // --- ÖZET İSTATİSTİKLER ---
    const ozetler = useMemo(() => ({
        yeni: siparisler.filter(s => s.durum === "YENI").length,
        hazirlaniyor: siparisler.filter(s => s.durum === "HAZIRLANIYOR").length,
        tamamlandi: siparisler.filter(s => s.durum === "TAMAMLANDI").length,
        iptal: siparisler.filter(s => s.durum === "IPTAL").length,
    }), [siparisler]);

    if (!aktifSirket) return <div className="h-full flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-white relative w-full">
                {/* MOBİL HEADER */}
                <div className="md:hidden bg-white border-b border-slate-200 p-3 flex justify-between items-center shrink-0 print:hidden">
                    <h1 className="font-bold text-slate-800 text-sm"><i className="fas fa-inbox text-blue-600 mr-2"></i>Gelen Siparişler</h1>
                    <button onClick={() => window.dispatchEvent(new Event('openMobilMenu'))} className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded border border-slate-300"><i className="fas fa-bars"></i></button>
                </div>

                {/* ÖZET KARTLARI */}
                <div className="bg-slate-50 border-b border-slate-200 p-3 sm:p-4 shrink-0 print:hidden">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <button onClick={() => setDurumFiltresi(durumFiltresi === "YENI" ? "" : "YENI")} className={`rounded-lg p-3 border shadow-sm text-left transition-all ${durumFiltresi === "YENI" ? "bg-amber-100 border-amber-300 ring-2 ring-amber-400" : "bg-white border-amber-100 hover:border-amber-300"}`}>
                            <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-0.5"><i className="fas fa-clock mr-1"></i> Yeni</p>
                            <p className="text-2xl font-black text-amber-700">{ozetler.yeni}</p>
                        </button>
                        <button onClick={() => setDurumFiltresi(durumFiltresi === "HAZIRLANIYOR" ? "" : "HAZIRLANIYOR")} className={`rounded-lg p-3 border shadow-sm text-left transition-all ${durumFiltresi === "HAZIRLANIYOR" ? "bg-blue-100 border-blue-300 ring-2 ring-blue-400" : "bg-white border-blue-100 hover:border-blue-300"}`}>
                            <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-0.5"><i className="fas fa-cog mr-1"></i> Hazırlanıyor</p>
                            <p className="text-2xl font-black text-blue-700">{ozetler.hazirlaniyor}</p>
                        </button>
                        <button onClick={() => setDurumFiltresi(durumFiltresi === "TAMAMLANDI" ? "" : "TAMAMLANDI")} className={`rounded-lg p-3 border shadow-sm text-left transition-all ${durumFiltresi === "TAMAMLANDI" ? "bg-emerald-100 border-emerald-300 ring-2 ring-emerald-400" : "bg-white border-emerald-100 hover:border-emerald-300"}`}>
                            <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5"><i className="fas fa-check-circle mr-1"></i> Tamamlandı</p>
                            <p className="text-2xl font-black text-emerald-700">{ozetler.tamamlandi}</p>
                        </button>
                        <button onClick={() => setDurumFiltresi(durumFiltresi === "IPTAL" ? "" : "IPTAL")} className={`rounded-lg p-3 border shadow-sm text-left transition-all ${durumFiltresi === "IPTAL" ? "bg-red-100 border-red-300 ring-2 ring-red-400" : "bg-white border-red-100 hover:border-red-300"}`}>
                            <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest mb-0.5"><i className="fas fa-times-circle mr-1"></i> İptal</p>
                            <p className="text-2xl font-black text-red-700">{ozetler.iptal}</p>
                        </button>
                    </div>
                </div>

                {/* FİLTRE ÇUBUĞU */}
                <div className="bg-slate-200 border-b border-slate-300 flex flex-wrap items-center px-4 py-2 shrink-0 gap-2 print:hidden">
                    <div className="relative flex-1 min-w-[180px] max-w-sm">
                        <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]"></i>
                        <input type="text" placeholder="Fiş no veya müşteri ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="w-full text-xs px-3 py-1.5 pl-7 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500 font-bold" />
                    </div>
                    <select value={durumFiltresi} onChange={(e) => setDurumFiltresi(e.target.value)} className="text-xs px-3 py-1.5 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500 font-bold text-slate-700">
                        <option value="">Tüm Durumlar</option>
                        {DURUM_SECENEKLERI.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} className="text-xs px-2 py-1.5 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500 font-bold text-slate-600" title="Başlangıç" />
                    <span className="text-xs text-slate-400 font-bold">—</span>
                    <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} className="text-xs px-2 py-1.5 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500 font-bold text-slate-600" title="Bitiş" />
                    {(durumFiltresi || baslangicTarih || bitisTarih || aramaTerimi) && (
                        <button onClick={filtreTemizle} className="flex items-center px-3 py-1.5 bg-red-50 border border-red-200 rounded hover:bg-red-100 text-xs font-bold text-red-600 shadow-sm whitespace-nowrap">
                            <i className="fas fa-times mr-1"></i> Temizle
                        </button>
                    )}
                </div>

                {/* SİPARİŞ TABLOSU */}
                <div className="flex-1 overflow-auto bg-white relative">
                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
                        <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                            <tr className="text-[11px] font-bold text-slate-700">
                                <th className="p-2 border-r border-slate-300 w-32">Fiş No</th>
                                <th className="p-2 border-r border-slate-300">Müşteri</th>
                                <th className="p-2 border-r border-slate-300 w-44">Durum</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-right">Tutar (TL)</th>
                                <th className="p-2 border-r border-slate-300 w-28 text-center">Tarih</th>
                                <th className="p-2 w-24 text-center">Detay</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yukleniyor ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest"><i className="fas fa-circle-notch fa-spin mr-2"></i> Yükleniyor...</td></tr>
                            ) : filtrelenmis.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">{siparisler.length > 0 ? "Filtreye uygun sipariş bulunamadı" : "Henüz gelen sipariş yok"}</td></tr>
                            ) : (
                                filtrelenmis.map(s => {
                                    const stil = durumStili(s.durum);
                                    return (
                                        <tr key={s.id} className="text-[11px] font-medium border-b border-slate-200 hover:bg-slate-50 transition-colors">
                                            <td className="p-2 border-r border-slate-200 font-bold text-slate-600">{s.siparis_no || `#${s.id}`}</td>
                                            <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{s.musteri_adi}</td>
                                            <td className="p-1.5 border-r border-slate-200">
                                                <select
                                                    value={s.durum}
                                                    onChange={(e) => durumGuncelle(s.id, e.target.value)}
                                                    className={`${stil.bg} ${stil.text} px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer border-0 w-full`}
                                                >
                                                    {DURUM_SECENEKLERI.map(d => <option key={d} value={d}>{d}</option>)}
                                                </select>
                                            </td>
                                            <td className="p-2 border-r border-slate-200 text-right font-black text-slate-800">{parseTutar(s.toplam_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                            <td className="p-2 border-r border-slate-200 text-center text-slate-500">{new Date(s.created_at).toLocaleDateString('tr-TR')}</td>
                                            <td className="p-1.5 text-center">
                                                <button onClick={() => detayAc(s)} className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 rounded text-[10px] font-bold shadow-sm transition-colors">
                                                    <i className="fas fa-eye mr-1"></i> Göster
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ALT BAR */}
                <div className="h-8 bg-slate-200 border-t border-slate-300 flex items-center justify-between px-4 text-[10px] text-slate-600 font-bold shrink-0 print:hidden">
                    <span>Gösterilen: {filtrelenmis.length} / {siparisler.length} sipariş</span>
                    <span className="text-blue-700">Toplam Tutar: {filtrelenmis.reduce((a, s) => a + parseTutar(s.toplam_tutar), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                </div>

                {/* SİPARİŞ DETAY MODAL */}
            {detayModalAcik && seciliSiparis && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-100 rounded shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden border border-slate-400 max-h-[90vh]">
                        {/* BAŞLIK */}
                        <div className="bg-slate-200 border-b border-slate-300 p-3 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 flex items-center">
                                    <i className="fas fa-file-invoice text-blue-600 mr-2"></i>
                                    Sipariş Detayı — {seciliSiparis.siparis_no || `#${seciliSiparis.id}`}
                                </h3>
                                <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                                    Müşteri: {seciliSiparis.musteri_adi} | Tarih: {new Date(seciliSiparis.created_at).toLocaleDateString('tr-TR')} |{" "}
                                    <span className={`${durumStili(seciliSiparis.durum).text} font-black`}>{seciliSiparis.durum}</span>
                                </p>
                            </div>
                            <button onClick={() => setDetayModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
                        </div>

                        {/* KALEMLER TABLOSU */}
                        <div className="flex-1 overflow-auto bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0">
                                    <tr className="text-[11px] font-bold text-slate-700">
                                        <th className="p-2 border-r border-slate-300 w-8 text-center">#</th>
                                        <th className="p-2 border-r border-slate-300">Ürün Adı</th>
                                        <th className="p-2 border-r border-slate-300 w-24 text-center">Miktar</th>
                                        <th className="p-2 border-r border-slate-300 w-32 text-right">Birim Fiyat</th>
                                        <th className="p-2 w-32 text-right">Tutar (TL)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {kalemYukleniyor ? (
                                        <tr><td colSpan={5} className="p-6 text-center text-slate-400 font-bold"><i className="fas fa-circle-notch fa-spin mr-2"></i> Kalemler yükleniyor...</td></tr>
                                    ) : kalemler.length === 0 ? (
                                        <tr><td colSpan={5} className="p-6 text-center text-slate-400 font-bold uppercase tracking-widest">Bu siparişe ait kalem bulunamadı</td></tr>
                                    ) : (
                                        kalemler.map((k, i) => (
                                            <tr key={k.id} className="text-[11px] font-medium border-b border-slate-200 hover:bg-slate-50">
                                                <td className="p-2 border-r border-slate-200 text-center text-slate-500 font-bold">{i + 1}</td>
                                                <td className="p-2 border-r border-slate-200 font-bold text-slate-800">{k.urun_adi}</td>
                                                <td className="p-2 border-r border-slate-200 text-center font-bold">{k.miktar}</td>
                                                <td className="p-2 border-r border-slate-200 text-right">{parseTutar(k.birim_fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                <td className="p-2 text-right font-bold text-blue-700">{(k.miktar * parseTutar(k.birim_fiyat)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* TOPLAM */}
                        <div className="bg-slate-200 border-t border-slate-300 p-3 flex justify-between items-center shrink-0">
                            <span className="text-xs font-bold text-slate-600">{kalemler.length} kalem</span>
                            <div className="bg-white border border-slate-400 px-4 py-2 rounded shadow-inner">
                                <span className="text-[10px] font-bold text-slate-500 uppercase mr-3">Genel Toplam</span>
                                <span className="text-lg font-black text-[#000080]">{parseTutar(seciliSiparis.toplam_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
