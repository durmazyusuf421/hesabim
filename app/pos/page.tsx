"use client";
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

interface Urun { id: number; urun_adi: string; barkod?: string; satis_fiyati: number | string; }
interface Cari { id: number; cari_adi: string; }
interface SepetItem { urun: Urun; miktar: number; fiyat: number; }

const parseTutar = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); }
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};

export default function PosEkrani() {
    const { aktifSirket } = useAuth();
    const toast = useToast();
    const [yukleniyor, setYukleniyor] = useState(true);

    const [urunler, setUrunler] = useState<Urun[]>([]);
    const [cariler, setCariler] = useState<Cari[]>([]);
    const [aramaMetni, setAramaMetni] = useState("");

    const [sepet, setSepet] = useState<SepetItem[]>([]);
    const [seciliCari, setSeciliCari] = useState<number | null>(null);
    const [islemBekliyor, setIslemBekliyor] = useState(false);

    const aramaRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
        verileriGetir(aktifSirket.id);
        if (aramaRef.current && window.innerWidth > 768) aramaRef.current.focus();
    }, [aktifSirket]);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            const [dbUrunler, dbCariler] = await Promise.all([
                supabase.from("urunler").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`),
                supabase.from("cari_kartlar").select("*").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`)
            ]);
            if (dbUrunler.data) setUrunler(dbUrunler.data);
            if (dbCariler.data) setCariler(dbCariler.data);
        } catch (error) { console.error("Veri çekme hatası:", error); }
        setYukleniyor(false);
    }

    const filtrelenmisUrunler = urunler.filter(u => {
        if (!aramaMetni) return true;
        const aramaKucuk = aramaMetni.toLocaleLowerCase('tr-TR');
        const isimKucuk = u.urun_adi ? String(u.urun_adi).toLocaleLowerCase('tr-TR') : "";
        const barkodString = u.barkod ? String(u.barkod) : "";
        return isimKucuk.includes(aramaKucuk) || barkodString.includes(aramaMetni);
    });

    const sepeteEkle = (urun: Urun) => {
        setSepet(prev => {
            const varMi = prev.find(item => item.urun.id === urun.id);
            if (varMi) return prev.map(item => item.urun.id === urun.id ? { ...item, miktar: item.miktar + 1 } : item);
            return [...prev, { urun, miktar: 1, fiyat: parseTutar(urun.satis_fiyati) }];
        });
        setAramaMetni(""); 
        if (aramaRef.current && window.innerWidth > 768) aramaRef.current.focus();
    };

    // TELEFONDA ENTER'A BASILDIĞINDA VEYA BUTONA TIKLANDIĞINDA ÇALIŞACAK FONKSİYON
    const aramaFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!aramaMetni.trim()) return;

        // 1. Önce tam barkod eşleşmesi var mı bak
        const tamBarkodEslesti = urunler.find(u => u.barkod === aramaMetni.trim());
        if (tamBarkodEslesti) {
            sepeteEkle(tamBarkodEslesti);
            return;
        }

        // 2. Barkod değilse isme göre listelenenlerden TEK BİR ürün kaldıysa onu sepete at
        if (filtrelenmisUrunler.length === 1) {
            sepeteEkle(filtrelenmisUrunler[0]);
        } else if (filtrelenmisUrunler.length === 0) {
            toast.error("Ürün bulunamadı!");
            setAramaMetni("");
        } else {
            // Birden fazla ürün varsa sadece klavyeyi kapat ki ürünleri görsün
            aramaRef.current?.blur();
        }
    };

    const miktarGuncelle = (urunId: number, yeniMiktar: number) => { if (yeniMiktar > 0) setSepet(prev => prev.map(item => item.urun.id === urunId ? { ...item, miktar: yeniMiktar } : item)); };
    const fiyatGuncelle = (urunId: number, yeniFiyat: number) => { if (yeniFiyat >= 0) setSepet(prev => prev.map(item => item.urun.id === urunId ? { ...item, fiyat: yeniFiyat } : item)); };
    const sepettenCikar = (urunId: number) => { setSepet(prev => prev.filter(item => item.urun.id !== urunId)); };

    const araToplam = sepet.reduce((acc, item) => acc + (item.fiyat * item.miktar), 0);
    const kdvToplam = araToplam * 0.20; 
    const genelToplam = araToplam + kdvToplam;

    const satisiTamamla = async (odemeTipi: 'NAKİT' | 'KREDİ KARTI' | 'VERESİYE') => {
        if (sepet.length === 0) { toast.error("Sepet boş!"); return; }
        if (odemeTipi === 'VERESİYE' && !seciliCari) { toast.error("Veresiye için lütfen bir Cari seçin!"); return; }

        setIslemBekliyor(true);
        try {
            const musteriIsmi = seciliCari ? cariler.find(c => c.id === seciliCari)?.cari_adi : "Perakende Müşteri";
            const yeniSiparis = { toptanci_id: aktifSirket!.id, cari_id: seciliCari || null, cari_adi: musteriIsmi, durum: "Onaylandı", toplam_tutar: genelToplam, odeme_tipi: odemeTipi, tarih: new Date().toISOString() };
            
            const { error } = await supabase.from("siparisler").insert([yeniSiparis]);
            if (error) throw error;

            toast.success(`Satış Başarılı! Tutar: ${genelToplam.toLocaleString('tr-TR')} ₺`);
            setSepet([]); setSeciliCari(null); setAramaMetni("");
        } catch { toast.error("Satış sırasında hata oluştu."); }
        setIslemBekliyor(false);
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-semibold text-[#64748b]" style={{ background: "var(--c-bg)" }}>Sistem Doğrulanıyor...</div>;

    return (
            <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
                {yukleniyor ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
                        <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500 mb-4"></i>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Kasa Hazırlanıyor...</span>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden w-full">
                        
                        {/* SOL ALAN: ÜRÜNLER VE ARAMA (Telefonda üst kısım) */}
                        <div className="flex-1 flex flex-col h-[55vh] md:h-full overflow-hidden border-b md:border-b-0 border-slate-200">
                            <div className="flex items-center gap-2 px-4 py-2 shrink-0 bg-white" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <form onSubmit={aramaFormSubmit} className="flex flex-1 max-w-xl gap-2">
                                    <div className="relative flex-1">
                                        <input ref={aramaRef} type="search" enterKeyHint="search" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} placeholder="Barkod okutun veya isimle arayın..." className="input-kurumsal pl-8" />
                                        <i className="fas fa-barcode absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                                    </div>
                                    <button type="submit" className="btn-primary flex items-center gap-2"><i className="fas fa-search text-[10px]" /> ARA</button>
                                </form>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50 custom-scrollbar">
                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4 pb-10">
                                    {filtrelenmisUrunler.map(urun => (
                                        <button key={urun.id} onClick={() => sepeteEkle(urun)} className="bg-white rounded-xl border border-slate-200 p-3 md:p-4 text-left hover:shadow-lg hover:border-blue-300 transition-all group relative overflow-hidden flex flex-col min-h-[100px] md:min-h-[120px] active:scale-95">
                                            <div className="flex-1">
                                                <p className="text-[9px] md:text-[10px] font-black text-slate-400 mb-1">{urun.barkod || "Barkodsuz"}</p>
                                                <h3 className="text-xs md:text-sm font-bold text-slate-800 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">{urun.urun_adi}</h3>
                                            </div>
                                            <div className="mt-3 md:mt-4 flex items-end justify-between">
                                                <span className="text-sm md:text-lg font-black text-blue-600">{parseTutar(urun.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</span>
                                                <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors"><i className="fas fa-plus text-xs md:text-sm"></i></div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* SAĞ ALAN: ADİSYON / SEPET (Telefonda alt kısım, yüksekliği h-[45vh] ile sabitlendi ezilmez) */}
                        <div className="w-full h-[45vh] md:h-full md:w-[380px] bg-white border-t md:border-t-0 md:border-l border-slate-200 shadow-2xl flex flex-col shrink-0 z-20">
                            <div className="h-10 md:h-20 bg-slate-900 text-white flex items-center justify-between px-3 md:px-6 shrink-0">
                                <h2 className="text-xs md:text-sm font-black uppercase tracking-widest flex items-center gap-2"><i className="fas fa-receipt text-blue-400"></i> Satış Fişi</h2>
                                <span className="bg-slate-800 text-slate-300 text-[9px] md:text-[10px] font-bold px-2 md:px-3 py-1 rounded-full">{sepet.length} Kalem</span>
                            </div>

                            <div className="p-2 md:p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                                <select value={seciliCari || ""} onChange={(e) => setSeciliCari(Number(e.target.value) || null)} className="w-full bg-white border border-slate-200 rounded-lg px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all">
                                    <option value="">-- Perakende (Peşin) --</option>
                                    {cariler.map(c => (<option key={c.id} value={c.id}>{c.cari_adi}</option>))}
                                </select>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/50 custom-scrollbar">
                                {sepet.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                        <i className="fas fa-shopping-cart text-3xl md:text-4xl mb-2 md:mb-3 opacity-20"></i>
                                        <p className="font-bold text-[10px] md:text-xs uppercase tracking-widest">Sepet Boş</p>
                                    </div>
                                ) : (
                                    sepet.map((item) => (
                                        <div key={item.urun.id} className="bg-white border border-slate-100 p-2 md:p-3 rounded-xl shadow-sm flex flex-col gap-2 group relative">
                                            <div className="flex justify-between items-start pr-6">
                                                <h4 className="text-[10px] md:text-xs font-bold text-slate-800 leading-tight">{item.urun.urun_adi}</h4>
                                                <button onClick={() => sepettenCikar(item.urun.id)} className="absolute right-2 md:right-3 top-2 md:top-3 text-slate-300 hover:text-red-500 transition-colors"><i className="fas fa-trash-alt text-[10px] md:text-base"></i></button>
                                            </div>
                                            <div className="flex items-center justify-between bg-slate-50 p-1.5 md:p-2 rounded-lg border border-slate-100">
                                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-0.5">
                                                    <button onClick={() => miktarGuncelle(item.urun.id, item.miktar - 1)} className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded hover:text-red-500"><i className="fas fa-minus text-[8px] md:text-[10px]"></i></button>
                                                    <input type="number" value={item.miktar} onChange={(e) => miktarGuncelle(item.urun.id, Number(e.target.value))} className="w-6 md:w-8 text-center text-[10px] md:text-xs font-black text-slate-800 bg-transparent outline-none appearance-none" />
                                                    <button onClick={() => miktarGuncelle(item.urun.id, item.miktar + 1)} className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded hover:text-blue-500"><i className="fas fa-plus text-[8px] md:text-[10px]"></i></button>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase">Fiyat</span>
                                                    <div className="flex items-center">
                                                        <input type="number" value={item.fiyat} onChange={(e) => fiyatGuncelle(item.urun.id, Number(e.target.value))} className="w-12 md:w-16 text-right text-xs md:text-sm font-bold text-blue-600 bg-transparent outline-none border-b border-transparent focus:border-blue-300 transition-colors" />
                                                        <span className="text-[9px] md:text-[10px] font-bold text-blue-600 ml-0.5 md:ml-1">₺</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="bg-white border-t border-slate-200 p-2 md:p-5 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                                <div className="flex justify-between items-end pb-2 md:pb-4 mb-2 md:mb-4 border-b border-dashed border-slate-200">
                                    <span className="text-xs md:text-sm font-black text-slate-800 uppercase tracking-widest">Toplam</span>
                                    <span className="text-xl md:text-2xl font-black text-emerald-600">{genelToplam.toLocaleString('tr-TR', {minimumFractionDigits:2})} <span className="text-sm md:text-lg">₺</span></span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                                    <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('NAKİT')} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 md:p-3 rounded-lg font-black uppercase tracking-widest text-[9px] md:text-[10px] flex items-center justify-center gap-1.5 md:gap-2 transition-all active:scale-95 disabled:opacity-50"><i className="fas fa-money-bill-wave text-xs md:text-sm"></i> Nakit</button>
                                    <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('KREDİ KARTI')} className="bg-blue-500 hover:bg-blue-600 text-white p-2 md:p-3 rounded-lg font-black uppercase tracking-widest text-[9px] md:text-[10px] flex items-center justify-center gap-1.5 md:gap-2 transition-all active:scale-95 disabled:opacity-50"><i className="fas fa-credit-card text-xs md:text-sm"></i> Kart</button>
                                </div>
                                <button disabled={islemBekliyor || sepet.length === 0} onClick={() => satisiTamamla('VERESİYE')} className={`w-full p-2 md:p-3 rounded-lg font-black uppercase tracking-widest text-[9px] md:text-[10px] flex items-center justify-center gap-1.5 md:gap-2 transition-all active:scale-95 disabled:opacity-50 ${!seciliCari ? 'bg-slate-100 text-slate-400 border-2 border-dashed border-slate-200' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
                                    <i className="fas fa-book-open text-xs md:text-sm"></i> {!seciliCari ? 'Veresiye Seç' : 'Açık Hesap'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
    );
}