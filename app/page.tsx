"use client";
import React, { useEffect, useState } from "react";
import { supabase, siparisNoUret } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
interface Siparis {
    id: number;
    siparis_no: string;
    cari_adi: string;
    durum: string;
    toplam_tutar: number;
    tarih: string;
    created_at: string;
}
interface Firma { id: number; unvan: string; }
interface Urun { id: number; urun_adi: string; satis_fiyati: number | string; birim: string; barkod?: string; }
interface YeniKalem { urun_adi: string; miktar: number; birim: string; birim_fiyat: number; }
interface DetayKalem { id: number; urun_adi: string; miktar: number; birim_fiyat: number; }

const parseTutar = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); }
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};

export default function SiparislerSayfasi() {
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();
    const { aktifSirket, kullaniciRol, isYonetici, isPlasiyer, isDepocu, isMuhasebe } = useAuth();

    const [siparisler, setSiparisler] = useState<Siparis[]>([]);
    const [aramaTerimi, setAramaTerimi] = useState("");
    const [yukleniyor, setYukleniyor] = useState(true);
const [seciliSiparisId, setSeciliSiparisId] = useState<number | null>(null);

    // --- DETAY MODAL & İŞLEM MENÜSÜ STATELERİ ---
    const [detayModalAcik, setDetayModalAcik] = useState(false);
    const [detaySiparis, setDetaySiparis] = useState<Siparis | null>(null);
    const [detayKalemler, setDetayKalemler] = useState<DetayKalem[]>([]);
    const [detayYukleniyor, setDetayYukleniyor] = useState(false);
    const [islemMenuAcik, setIslemMenuAcik] = useState(false);
    const [satirDurumMenuId, setSatirDurumMenuId] = useState<number | null>(null);

    // --- YENİ SİPARİŞ MODAL STATELERİ ---
    const [yeniModalAcik, setYeniModalAcik] = useState(false);
    const [firmalar, setFirmalar] = useState<Firma[]>([]);
    const [urunler, setUrunler] = useState<Urun[]>([]);
    const [seciliCariId, setSeciliCariId] = useState<string>("");
    const [siparisKalemleri, setSiparisKalemleri] = useState<YeniKalem[]>([{ urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0 }]);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [yazdirilacakFis, setYazdirilacakFis] = useState<{siparis: Siparis; kalemler: DetayKalem[]} | null>(null);
    const [yazdirilacakIrsaliye, setYazdirilacakIrsaliye] = useState<{siparis: Siparis; kalemler: DetayKalem[]} | null>(null);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            // Firma ve ürün listelerini çek (sipariş oluşturma için de kullanılacak)
            const { data: firmalarData } = await supabase.from("firmalar").select("id, unvan").eq("sahip_sirket_id", sirketId).order('unvan');
            const firmaMap: Record<number, string> = {};
            if (firmalarData) {
                firmalarData.forEach(f => firmaMap[f.id] = f.unvan);
                setFirmalar(firmalarData);
            }

            const { data: urunData } = await supabase.from("urunler").select("id, urun_adi, satis_fiyati, birim, barkod").eq("sahip_sirket_id", sirketId).order('urun_adi');
            if (urunData) setUrunler(urunData);

            // Siparişleri çek
            const { data } = await supabase.from("siparisler").select("*").eq("satici_sirket_id", sirketId).order('id', { ascending: false });

            if (data) {
                const islenmisSiparisler = data.map(s => ({
                    ...s,
                    cari_adi: firmaMap[s.alici_firma_id] || "Perakende / Bilinmiyor"
                }));
                setSiparisler(islenmisSiparisler);
            }
        } catch {
        }
        setYukleniyor(false);
    }

    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }

        if (kullaniciRol.includes("YONETICI") || kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) {
            verileriGetir(aktifSirket.id);
        } else {
            setYukleniyor(false);
        }
    }, [aktifSirket, kullaniciRol]);

    // --- YENİ SİPARİŞ FONKSİYONLARI ---
    const yeniSiparisAc = () => {
        setSeciliCariId("");
        setSiparisKalemleri([{ urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0 }]);
        setYeniModalAcik(true);
    };

    const kalemEkle = () => {
        setSiparisKalemleri([...siparisKalemleri, { urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0 }]);
    };

    const kalemSil = (index: number) => {
        if (siparisKalemleri.length <= 1) return;
        setSiparisKalemleri(siparisKalemleri.filter((_, i) => i !== index));
    };

    const kalemGuncelle = (index: number, alan: keyof YeniKalem, deger: string | number) => {
        setSiparisKalemleri(siparisKalemleri.map((k, i) => i === index ? { ...k, [alan]: deger } : k));
    };

    const urunSec = (index: number, urunId: string) => {
        const urun = urunler.find(u => u.id.toString() === urunId);
        if (urun) {
            setSiparisKalemleri(siparisKalemleri.map((k, i) => i === index ? {
                ...k, urun_adi: urun.urun_adi, birim: urun.birim || "Adet", birim_fiyat: parseTutar(urun.satis_fiyati)
            } : k));
        }
    };

    const kalemToplamHesapla = () => siparisKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);

    const siparisKaydet = async () => {
        if (!aktifSirket) return;
        if (!seciliCariId) { toast.error("Lütfen bir müşteri (cari) seçiniz!"); return; }
        const gecerliKalemler = siparisKalemleri.filter(k => k.urun_adi.trim() && k.miktar > 0 && k.birim_fiyat > 0);
        if (gecerliKalemler.length === 0) { toast.error("En az bir geçerli sipariş kalemi giriniz!"); return; }

        setKaydediliyor(true);
        try {
            const toplam = gecerliKalemler.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);
            const siparisNo = await siparisNoUret("SIP");

            const { data: siparisData, error: siparisError } = await supabase.from("siparisler").insert([{
                siparis_no: siparisNo,
                satici_sirket_id: aktifSirket.id,
                alici_firma_id: Number(seciliCariId),
                durum: "Onay Bekliyor",
                toplam_tutar: toplam
            }]).select().single();

            if (siparisError) throw siparisError;
            if (siparisData) {
                const kalemVerileri = gecerliKalemler.map(k => ({
                    siparis_id: siparisData.id,
                    urun_adi: `${k.urun_adi} (${k.birim})`,
                    miktar: k.miktar,
                    birim_fiyat: k.birim_fiyat
                }));
                await supabase.from("siparis_kalemleri").insert(kalemVerileri);
            }

            toast.success(`Sipariş başarıyla oluşturuldu! Fiş No: ${siparisNo}`);
            setYeniModalAcik(false);
            verileriGetir(aktifSirket.id);
        } catch (error) {
            toast.error("Sipariş kaydedilirken hata oluştu: " + (error instanceof Error ? error.message : String(error)));
        }
        setKaydediliyor(false);
    };

    // --- DETAY MODAL FONKSİYONLARI ---
    const detayAc = async (siparis: Siparis) => {
        setDetaySiparis(siparis);
        setDetayModalAcik(true);
        setDetayYukleniyor(true);
        const { data } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", siparis.id);
        setDetayKalemler(data || []);
        setDetayYukleniyor(false);
    };

    const inceleButonuTikla = () => {
        if (!seciliSiparisId) { toast.error("Lütfen incelemek için bir fiş seçin."); return; }
        const siparis = siparisler.find(s => s.id === seciliSiparisId);
        if (siparis) detayAc(siparis);
    };

    // --- DURUM GÜNCELLEME ---
    const durumGuncelle = async (yeniDurum: string, siparisId?: number) => {
        const hedefId = siparisId || seciliSiparisId;
        if (!hedefId) { toast.error("Lütfen işlem yapılacak siparişi seçin."); return; }
        if (!aktifSirket) return;

        const mevcutSiparis = siparisler.find(s => s.id === hedefId);
        const eskiDurum = mevcutSiparis?.durum;

        const { error } = await supabase.from("siparisler").update({ durum: yeniDurum }).eq("id", hedefId);
        if (error) { toast.error("Durum güncellenirken hata: " + error.message); return; }

        // STOK YÖNETİMİ
        if (yeniDurum === "HAZIRLANIYOR" && eskiDurum !== "HAZIRLANIYOR") {
            // Sipariş onaylandı → stok düş
            try {
                const { data: kalemler } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", hedefId);
                if (kalemler && kalemler.length > 0) {
                    let dusurulduSayisi = 0;
                    for (const kalem of kalemler) {
                        // Ürün adından ürünü bul (siparis_kalemleri'nde urun_adi saklanıyor)
                        const urunAdi = kalem.urun_adi.replace(/\s*\(.*?\)\s*$/, ''); // "(Adet)" gibi birim bilgisini kaldır
                        const { data: urunData } = await supabase.from("urunler").select("id, stok_miktari").eq("sahip_sirket_id", aktifSirket.id).ilike("urun_adi", urunAdi).limit(1);

                        if (urunData && urunData.length > 0) {
                            const urun = urunData[0];
                            const yeniStok = Number(urun.stok_miktari) - Number(kalem.miktar);

                            if (yeniStok < 0) {
                                toast.error(`Uyarı: "${urunAdi}" stok yetersiz (${urun.stok_miktari} adet). İşlem devam ediyor.`);
                            }

                            await supabase.from("urunler").update({ stok_miktari: yeniStok }).eq("id", urun.id);
                            await supabase.from("stok_hareketleri").insert([{
                                sirket_id: aktifSirket.id,
                                urun_id: urun.id,
                                islem_tipi: "CIKIS",
                                miktar: Number(kalem.miktar),
                                aciklama: `Sipariş Sevki: ${mevcutSiparis?.siparis_no || hedefId}`,
                                islem_yapan: "Sistem (Otomatik)"
                            }]);
                            dusurulduSayisi++;
                        }
                    }
                    if (dusurulduSayisi > 0) {
                        toast.success(`${dusurulduSayisi} üründe stok düşüldü.`);
                    }
                }
            } catch { /* stok düşme hatası sessizce geç */ }
        }

        if (yeniDurum === "IPTAL" && (eskiDurum === "HAZIRLANIYOR" || eskiDurum === "TAMAMLANDI")) {
            // İptal → stokları geri ekle
            try {
                const { data: kalemler } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", hedefId);
                if (kalemler && kalemler.length > 0) {
                    let iadeEdilenSayisi = 0;
                    for (const kalem of kalemler) {
                        const urunAdi = kalem.urun_adi.replace(/\s*\(.*?\)\s*$/, '');
                        const { data: urunData } = await supabase.from("urunler").select("id, stok_miktari").eq("sahip_sirket_id", aktifSirket.id).ilike("urun_adi", urunAdi).limit(1);

                        if (urunData && urunData.length > 0) {
                            const urun = urunData[0];
                            const yeniStok = Number(urun.stok_miktari) + Number(kalem.miktar);

                            await supabase.from("urunler").update({ stok_miktari: yeniStok }).eq("id", urun.id);
                            await supabase.from("stok_hareketleri").insert([{
                                sirket_id: aktifSirket.id,
                                urun_id: urun.id,
                                islem_tipi: "GIRIS",
                                miktar: Number(kalem.miktar),
                                aciklama: `Sipariş İptal İadesi: ${mevcutSiparis?.siparis_no || hedefId}`,
                                islem_yapan: "Sistem (Otomatik)"
                            }]);
                            iadeEdilenSayisi++;
                        }
                    }
                    if (iadeEdilenSayisi > 0) {
                        toast.success(`İptal nedeniyle ${iadeEdilenSayisi} üründe stok iade edildi.`);
                    }
                }
            } catch { /* stok iade hatası sessizce geç */ }
        }

        toast.success(`Sipariş durumu "${yeniDurum}" olarak güncellendi.`);
        setSiparisler(prev => prev.map(s => s.id === hedefId ? { ...s, durum: yeniDurum } : s));
        setIslemMenuAcik(false);
        setSatirDurumMenuId(null);
    };

    const fisYazdir = async (siparis: Siparis) => {
        const { data } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", siparis.id);
        setYazdirilacakFis({ siparis, kalemler: data || [] });
        setTimeout(() => window.print(), 300);
    };

    const irsaliyeYazdir = async (siparis: Siparis) => {
        const { data } = await supabase.from("siparis_kalemleri").select("*").eq("siparis_id", siparis.id);
        setYazdirilacakIrsaliye({ siparis, kalemler: data || [] });
        setTimeout(() => window.print(), 300);
    };

    const siparisSil = async () => {
        if (!seciliSiparisId) { toast.error("Lütfen silmek için bir sipariş seçin!"); return; }
        onayla({
            baslik: "Sipariş Sil",
            mesaj: "Bu siparişi kalıcı olarak silmek istediğinize emin misiniz?",
            altMesaj: "Bu işlem geri alınamaz.",
            onayMetni: "Evet, Sil",
            tehlikeli: true,
            onOnayla: async () => {
                setYukleniyor(true);
                await supabase.from("siparis_kalemleri").delete().eq("siparis_id", seciliSiparisId);
                await supabase.from("siparisler").delete().eq("id", seciliSiparisId);
                setSeciliSiparisId(null);
                if (aktifSirket) verileriGetir(aktifSirket.id);
            }
        });
    };

    const filtrelenmisSiparisler = siparisler.filter(s =>
        (s.siparis_no || "").toLowerCase().includes(aramaTerimi.toLowerCase()) ||
        (s.cari_adi || "").toLowerCase().includes(aramaTerimi.toLowerCase())
    );

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "var(--c-bg)" }}>Sistem Doğrulanıyor...</div>;

    const getDurumBadge = (durum: string) => {
        switch (durum) {
            case "YENI": return "badge-durum badge-bekliyor";
            case "HAZIRLANIYOR": return "badge-durum badge-hazirlaniyor";
            case "TAMAMLANDI": return "badge-durum badge-teslim";
            case "IPTAL": return "badge-durum badge-iptal";
            case "Onay Bekliyor": return "badge-durum badge-bekliyor";
            case "Onaylandı": return "badge-durum badge-teslim";
            default: return "badge-durum badge-bekliyor";
        }
    };

    return (
        <>
            <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>

                {!(isYonetici || isPlasiyer || isDepocu) ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "var(--c-bg)" }}>
                        <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
                        <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erişim Engellendi</h1>
                        <p className="text-slate-500 font-bold max-w-md mx-auto">Siparişler sayfasına erişim yetkiniz bulunmamaktadır.</p>
                    </div>
                ) : (
                    <>
                        {/* TOOLBAR */}
                        <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <button onClick={yeniSiparisAc} className="btn-primary whitespace-nowrap">
                                <i className="fas fa-plus mr-2"></i> Yeni Sipariş Ekle
                            </button>
                            <button onClick={inceleButonuTikla} className="btn-secondary whitespace-nowrap">
                                <i className="fas fa-eye mr-2"></i> İncele / Detay
                            </button>
                            <button onClick={siparisSil} className="btn-secondary whitespace-nowrap text-[#dc2626]">
                                <i className="fas fa-trash-alt mr-2"></i> Sil
                            </button>
                            <div className="relative" style={{ zIndex: islemMenuAcik ? 9999 : 'auto' }}>
                                <button onClick={() => { if (!seciliSiparisId) { toast.error("Lütfen işlem yapılacak siparişi seçin."); return; } setIslemMenuAcik(!islemMenuAcik); }} className="btn-primary whitespace-nowrap">
                                    <i className="fas fa-check-circle mr-2"></i> İşlem <i className="fas fa-caret-down ml-2"></i>
                                </button>
                                {islemMenuAcik && seciliSiparisId && (
                                    <>
                                        <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setIslemMenuAcik(false)}></div>
                                        <div className="absolute top-full left-0 mt-1 bg-white border w-56 overflow-hidden" style={{ zIndex: 9999, borderColor: "var(--c-border)" }}>
                                            <button onClick={() => durumGuncelle("HAZIRLANIYOR")} className="w-full text-left px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-50 flex items-center border-b" style={{ borderColor: "var(--c-border)" }}>
                                                <i className="fas fa-cog w-5 text-blue-500"></i> Siparişi Onayla (Hazırla)
                                            </button>
                                            <button onClick={() => durumGuncelle("TAMAMLANDI")} className="w-full text-left px-4 py-2.5 text-xs font-bold text-[#059669] hover:bg-emerald-50 flex items-center border-b" style={{ borderColor: "var(--c-border)" }}>
                                                <i className="fas fa-check-circle w-5 text-[#059669]"></i> Siparişi Tamamla
                                            </button>
                                            <button onClick={() => durumGuncelle("IPTAL")} className="w-full text-left px-4 py-2.5 text-xs font-bold text-[#dc2626] hover:bg-red-50 flex items-center">
                                                <i className="fas fa-times-circle w-5 text-[#dc2626]"></i> Siparişi İptal Et
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button onClick={() => window.print()} className="btn-secondary whitespace-nowrap">
                                <i className="fas fa-print mr-2"></i> Yazdır
                            </button>
                            <div className="flex-1 max-w-lg relative ml-auto">
                                <input type="text" placeholder="Fiş No veya Cari Ünvanı ile arama yapın..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-full" />
                                <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                            </div>
                        </div>

                        {/* MOBİL KART GÖRÜNÜMÜ */}
                        <div className="md:hidden flex-1 overflow-auto relative print:hidden">
                            {yukleniyor ? (
                                <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</div>
                            ) : filtrelenmisSiparisler.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Sipariş Bulunamadı</div>
                            ) : (
                                <div className="space-y-2 p-3">
                                    {filtrelenmisSiparisler.map((s) => {
                                        const isSelected = seciliSiparisId === s.id;
                                        return (
                                            <div key={s.id} onClick={() => setSeciliSiparisId(s.id)} onDoubleClick={() => detayAc(s)}
                                                className={`bg-white border p-3 cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50 border-l-4' : 'border-slate-200 hover:bg-slate-50'}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[12px] font-semibold text-[#1d4ed8]">{s.siparis_no || '#' + s.id}</span>
                                                    <span className={getDurumBadge(s.durum)}>{s.durum}</span>
                                                </div>
                                                <div className="text-[12px] font-semibold text-[#0f172a] mb-1">{s.cari_adi}</div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[11px] text-[#94a3b8]">{s.created_at ? new Date(s.created_at).toLocaleDateString('tr-TR') : '-'}</span>
                                                    <span className="text-[13px] font-semibold text-[#0f172a] tabular-nums">{parseTutar(s.toplam_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* TABLO (GRID) ALANI */}
                        <div className="hidden md:block flex-1 overflow-auto relative print:hidden">
                            <table className="tbl-kurumsal">
                                <thead>
                                    <tr>
                                        <th className="w-8 text-center"><i className="fas fa-caret-down text-slate-400"></i></th>
                                        <th className="w-32">Belge / Fiş No</th>
                                        <th>Cari Adı (Müşteri)</th>
                                        <th className="w-36 text-center">Durum</th>
                                        <th className="w-32 text-right">Tutar (TL)</th>
                                        <th className="w-28 text-center">Tarih</th>
                                        <th className="w-24 text-center">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {yukleniyor ? (
                                        <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                                    ) : filtrelenmisSiparisler.length === 0 ? (
                                        <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Sipariş Bulunamadı</td></tr>
                                    ) : (
                                        filtrelenmisSiparisler.map((s) => {
                                            const isSelected = seciliSiparisId === s.id;
                                            const badge = getDurumBadge(s.durum);
                                            return (
                                                <tr key={s.id} onClick={() => setSeciliSiparisId(s.id)} onDoubleClick={() => detayAc(s)} className={`cursor-pointer select-none ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500 text-slate-800' : 'bg-white hover:bg-slate-50'}`}>
                                                    <td className="text-center">
                                                        {isSelected ? <i className="fas fa-caret-right text-blue-500"></i> : <i className="fas fa-caret-down text-transparent"></i>}
                                                    </td>
                                                    <td className="font-bold text-slate-600">{s.siparis_no}</td>
                                                    <td className="font-bold text-slate-800">{s.cari_adi}</td>
                                                    <td className="text-center">
                                                        <span className={badge}>{s.durum}</span>
                                                    </td>
                                                    <td className="text-right font-semibold text-slate-800">
                                                        {parseTutar(s.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})}
                                                    </td>
                                                    <td className="text-center text-slate-500">
                                                        {s.created_at ? new Date(s.created_at).toLocaleDateString('tr-TR') : '-'}
                                                    </td>
                                                    <td className="text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button onClick={(e) => { e.stopPropagation(); detayAc(s); }} className="w-6 h-6 bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors" title="Detay Göster">
                                                                <i className="fas fa-eye text-[9px]"></i>
                                                            </button>
                                                            <div className="relative">
                                                                <button onClick={(e) => { e.stopPropagation(); setSatirDurumMenuId(satirDurumMenuId === s.id ? null : s.id); }} className="w-6 h-6 bg-emerald-50 border border-emerald-200 text-[#059669] hover:bg-emerald-100 flex items-center justify-center transition-colors" title="Durum Değiştir">
                                                                    <i className="fas fa-exchange-alt text-[9px]"></i>
                                                                </button>
                                                                {satirDurumMenuId === s.id && (
                                                                    <>
                                                                        <div className="fixed inset-0 z-[60]" onClick={() => setSatirDurumMenuId(null)}></div>
                                                                        <div className="absolute right-0 top-full mt-1 bg-white border z-[70] w-52 overflow-hidden" style={{ borderColor: "var(--c-border)" }}>
                                                                            <button onClick={(e) => { e.stopPropagation(); durumGuncelle("HAZIRLANIYOR", s.id); }} className="w-full text-left px-3 py-2 text-[11px] font-bold text-blue-700 hover:bg-blue-50 flex items-center border-b" style={{ borderColor: "var(--c-border)" }}>
                                                                                <i className="fas fa-cog w-5 text-blue-500 text-[10px]"></i> Onayla (Hazırla)
                                                                            </button>
                                                                            <button onClick={(e) => { e.stopPropagation(); durumGuncelle("TAMAMLANDI", s.id); }} className="w-full text-left px-3 py-2 text-[11px] font-bold text-[#059669] hover:bg-emerald-50 flex items-center border-b" style={{ borderColor: "var(--c-border)" }}>
                                                                                <i className="fas fa-check-circle w-5 text-[#059669] text-[10px]"></i> Tamamla
                                                                            </button>
                                                                            <button onClick={(e) => { e.stopPropagation(); durumGuncelle("IPTAL", s.id); }} className="w-full text-left px-3 py-2 text-[11px] font-bold text-[#dc2626] hover:bg-red-50 flex items-center">
                                                                                <i className="fas fa-times-circle w-5 text-[#dc2626] text-[10px]"></i> İptal Et
                                                                            </button>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </main>

            {/* --- YENİ SİPARİŞ MODAL --- */}
            {yeniModalAcik && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-h-[95vh] md:max-w-5xl flex flex-col overflow-hidden border" style={{ borderColor: "var(--c-border)" }}>
                        {/* MODAL BAŞLIK */}
                        <div className="bg-[#f8fafc] p-2 flex justify-between items-center shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <h3 className="text-xs font-bold text-slate-800 flex items-center">
                                <i className="fas fa-file-invoice text-[#059669] mr-2 text-sm"></i> Yeni Sipariş Fişi Oluştur
                            </h3>
                            <button onClick={() => setYeniModalAcik(false)} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times"></i></button>
                        </div>

                        {/* FORM ALANI */}
                        <div className="bg-white p-4 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Müşteri (Cari) Seçimi</label>
                                    <select value={seciliCariId} onChange={(e) => setSeciliCariId(e.target.value)} className="input-kurumsal w-full">
                                        <option value="">-- Müşteri Seçiniz --</option>
                                        {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Fiş Tarihi</label>
                                    <input type="date" defaultValue={new Date().toISOString().split('T')[0]} className="input-kurumsal w-full" />
                                </div>
                                <div className="flex items-end">
                                    <button onClick={kalemEkle} className="btn-primary">
                                        <i className="fas fa-plus mr-2"></i> Yeni Kalem Ekle
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* SİPARİŞ KALEMLERİ TABLOSU */}
                        <div className="flex-1 overflow-auto bg-white">
                            <table className="tbl-kurumsal">
                                <thead>
                                    <tr>
                                        <th className="w-8 text-center">#</th>
                                        <th>Ürün Seçimi / Stok Adı</th>
                                        <th className="w-24">Birim</th>
                                        <th className="w-28 text-center">Miktar</th>
                                        <th className="w-32 text-right">Birim Fiyat (TL)</th>
                                        <th className="w-32 text-right">Tutar (TL)</th>
                                        <th className="w-10 text-center"><i className="fas fa-trash text-slate-400"></i></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {siparisKalemleri.map((kalem, index) => (
                                        <tr key={index} className="hover:bg-slate-50">
                                            <td className="text-center text-slate-500 font-bold">{index + 1}</td>
                                            <td>
                                                <select value={urunler.find(u => u.urun_adi === kalem.urun_adi)?.id || ""} onChange={(e) => urunSec(index, e.target.value)} className="input-kurumsal w-full">
                                                    <option value="">-- Ürün Seçiniz --</option>
                                                    {urunler.map(u => <option key={u.id} value={u.id}>{u.urun_adi}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <input type="text" value={kalem.birim} onChange={(e) => kalemGuncelle(index, 'birim', e.target.value)} className="input-kurumsal w-full text-center" />
                                            </td>
                                            <td>
                                                <input type="number" min={1} value={kalem.miktar} onChange={(e) => kalemGuncelle(index, 'miktar', Number(e.target.value))} className="input-kurumsal w-full text-center" />
                                            </td>
                                            <td>
                                                <input type="number" min={0} step={0.01} value={kalem.birim_fiyat} onChange={(e) => kalemGuncelle(index, 'birim_fiyat', Number(e.target.value))} className="input-kurumsal w-full text-right" />
                                            </td>
                                            <td className="text-right font-bold text-[#1d4ed8]">
                                                {(kalem.miktar * kalem.birim_fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="text-center">
                                                <button onClick={() => kalemSil(index)} disabled={siparisKalemleri.length <= 1} className="text-slate-400 hover:text-[#dc2626] disabled:opacity-30 disabled:cursor-not-allowed">
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* ALT ÇUBUK: TOPLAM VE BUTONLAR */}
                        <div className="bg-[#f8fafc] p-3 flex justify-between items-center shrink-0" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <div className="bg-white border p-2" style={{ borderColor: "var(--c-border)" }}>
                                <div className="flex items-center space-x-6">
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Kalem Sayısı</span>
                                        <p className="text-sm font-semibold text-slate-800">{siparisKalemleri.filter(k => k.urun_adi.trim()).length}</p>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Genel Toplam</span>
                                        <p className="text-lg font-semibold text-[#1d4ed8]">{kalemToplamHesapla().toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-x-2">
                                <button onClick={() => setYeniModalAcik(false)} className="btn-secondary">
                                    <i className="fas fa-times text-[#dc2626] mr-2"></i> İptal
                                </button>
                                <button onClick={siparisKaydet} disabled={kaydediliyor} className="btn-primary disabled:opacity-50">
                                    <i className="fas fa-check mr-2"></i> {kaydediliyor ? "Kaydediliyor..." : "Siparişi Kaydet"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* --- SİPARİŞ DETAY MODAL --- */}
            {detayModalAcik && detaySiparis && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-3xl flex flex-col overflow-hidden border" style={{ borderColor: "var(--c-border)" }}>
                        <div className="bg-[#f8fafc] p-3 flex justify-between items-center shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 flex items-center">
                                    <i className="fas fa-file-invoice text-[#1d4ed8] mr-2"></i>
                                    Sipariş Detayı — {detaySiparis.siparis_no || `#${detaySiparis.id}`}
                                </h3>
                                <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                                    Müşteri: {detaySiparis.cari_adi} | Tarih: {detaySiparis.created_at ? new Date(detaySiparis.created_at).toLocaleDateString('tr-TR') : '-'} |{" "}
                                    <span className={getDurumBadge(detaySiparis.durum)}>{detaySiparis.durum}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => fisYazdir(detaySiparis)} className="btn-primary">
                                    <i className="fas fa-receipt mr-1.5"></i> Fiş Yazdır
                                </button>
                                {(detaySiparis.durum === "TAMAMLANDI" || detaySiparis.durum === "HAZIRLANIYOR") && (
                                    <button onClick={() => irsaliyeYazdir(detaySiparis)} className="btn-primary">
                                        <i className="fas fa-truck mr-1.5"></i> İrsaliye Yazdır
                                    </button>
                                )}
                                <button onClick={() => setDetayModalAcik(false)} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times text-lg"></i></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto bg-white">
                            <table className="tbl-kurumsal">
                                <thead>
                                    <tr>
                                        <th className="w-8 text-center">#</th>
                                        <th>Ürün Adı</th>
                                        <th className="w-24 text-center">Miktar</th>
                                        <th className="w-32 text-right">Birim Fiyat</th>
                                        <th className="w-32 text-right">Tutar (TL)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detayYukleniyor ? (
                                        <tr><td colSpan={5} className="p-6 text-center text-slate-400 font-bold"><i className="fas fa-circle-notch fa-spin mr-2"></i> Kalemler yükleniyor...</td></tr>
                                    ) : detayKalemler.length === 0 ? (
                                        <tr><td colSpan={5} className="p-6 text-center text-slate-400 font-bold uppercase tracking-widest">Bu siparişe ait kalem bulunamadı</td></tr>
                                    ) : (
                                        detayKalemler.map((k, i) => (
                                            <tr key={k.id} className="hover:bg-slate-50">
                                                <td className="text-center text-slate-500 font-bold">{i + 1}</td>
                                                <td className="font-bold text-slate-800">{k.urun_adi}</td>
                                                <td className="text-center font-bold">{k.miktar}</td>
                                                <td className="text-right">{parseTutar(k.birim_fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                <td className="text-right font-bold text-[#1d4ed8]">{(k.miktar * parseTutar(k.birim_fiyat)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-[#f8fafc] p-3 flex justify-between items-center shrink-0" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <span className="text-xs font-bold text-slate-600">{detayKalemler.length} kalem</span>
                            <div className="bg-white border px-4 py-2" style={{ borderColor: "var(--c-border)" }}>
                                <span className="text-[10px] font-bold text-slate-500 uppercase mr-3">Genel Toplam</span>
                                <span className="text-lg font-semibold text-[#1d4ed8]">{parseTutar(detaySiparis.toplam_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* --- SİPARİŞ FİŞİ YAZDIRMA ŞABLONU (80mm Termal) --- */}
            {yazdirilacakFis && (
                <div id="print-area" className="hidden print:block">
                    <div style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '2px dashed #333', paddingBottom: '6px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '2px' }}>{aktifSirket?.isletme_adi}</div>
                        <div style={{ fontSize: '8px', color: '#666', marginTop: '2px' }}>Tel: {aktifSirket?.telefon || '-'}</div>
                    </div>
                    <div style={{ fontSize: '9px', marginBottom: '6px' }}>
                        <div><strong>Fiş No:</strong> {yazdirilacakFis.siparis.siparis_no}</div>
                        <div><strong>Tarih:</strong> {new Date(yazdirilacakFis.siparis.created_at).toLocaleString('tr-TR')}</div>
                        <div><strong>Müşteri:</strong> {yazdirilacakFis.siparis.cari_adi}</div>
                        <div><strong>Durum:</strong> {yazdirilacakFis.siparis.durum}</div>
                    </div>
                    <table>
                        <thead>
                            <tr style={{ background: '#eee' }}>
                                <th style={{ textAlign: 'left' }}>Ürün</th>
                                <th style={{ textAlign: 'center', width: '40px' }}>Mkt</th>
                                <th style={{ textAlign: 'right', width: '55px' }}>Fiyat</th>
                                <th style={{ textAlign: 'right', width: '60px' }}>Tutar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yazdirilacakFis.kalemler.map((k, i) => (
                                <tr key={i}>
                                    <td>{k.urun_adi}</td>
                                    <td style={{ textAlign: 'center' }}>{k.miktar}</td>
                                    <td style={{ textAlign: 'right' }}>{parseTutar(k.birim_fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{(k.miktar * parseTutar(k.birim_fiyat)).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ borderTop: '2px dashed #333', marginTop: '6px', paddingTop: '6px', textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 900 }}>TOPLAM: {parseTutar(yazdirilacakFis.siparis.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '8px', color: '#999', marginTop: '8px', borderTop: '1px solid #ddd', paddingTop: '4px' }}>
                        Bizi tercih ettiğiniz için teşekkürler!
                    </div>
                </div>
            )}

            {/* --- İRSALİYE / SEVK NOTU YAZDIRMA ŞABLONU (A4) --- */}
            {yazdirilacakIrsaliye && (
                <div id="print-irsaliye" className="hidden print:block">
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '2px' }}>{aktifSirket?.isletme_adi}</div>
                            <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>{aktifSirket?.adres || ''}</div>
                            <div style={{ fontSize: '10px', color: '#555' }}>{aktifSirket?.il || ''} {aktifSirket?.ilce || ''}</div>
                            <div style={{ fontSize: '10px', color: '#555' }}>Tel: {aktifSirket?.telefon || '-'}</div>
                            {aktifSirket?.vergi_dairesi && <div style={{ fontSize: '10px', color: '#555' }}>V.D: {aktifSirket.vergi_dairesi} / {aktifSirket?.vergi_no}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: '#1d4ed8' }}>İRSALİYE / SEVK NOTU</div>
                            <div style={{ fontSize: '10px', marginTop: '6px' }}><strong>Belge No:</strong> {yazdirilacakIrsaliye.siparis.siparis_no}</div>
                            <div style={{ fontSize: '10px' }}><strong>Düzenleme Tarihi:</strong> {new Date().toLocaleDateString('tr-TR')}</div>
                            <div style={{ fontSize: '10px' }}><strong>Sipariş Tarihi:</strong> {new Date(yazdirilacakIrsaliye.siparis.created_at).toLocaleDateString('tr-TR')}</div>
                        </div>
                    </div>
                    <div style={{ border: '1px solid #333', padding: '10px', marginBottom: '15px', fontSize: '11px' }}>
                        <div style={{ fontWeight: 900, marginBottom: '4px', fontSize: '12px' }}>TESLİM ALACAK FİRMA / KİŞİ:</div>
                        <div><strong>Ünvan:</strong> {yazdirilacakIrsaliye.siparis.cari_adi}</div>
                    </div>
                    <table>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ textAlign: 'center', width: '30px' }}>S.No</th>
                                <th style={{ textAlign: 'left' }}>Ürün / Hizmet Açıklaması</th>
                                <th style={{ textAlign: 'center', width: '70px' }}>Miktar</th>
                                <th style={{ textAlign: 'right', width: '90px' }}>Birim Fiyat</th>
                                <th style={{ textAlign: 'right', width: '100px' }}>Tutar (TL)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {yazdirilacakIrsaliye.kalemler.map((k, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                    <td>{k.urun_adi}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{k.miktar}</td>
                                    <td style={{ textAlign: 'right' }}>{parseTutar(k.birim_fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{(k.miktar * parseTutar(k.birim_fiyat)).toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <div style={{ border: '2px solid #000', padding: '10px', minWidth: '200px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900 }}>
                                <span>GENEL TOPLAM:</span>
                                <span>{parseTutar(yazdirilacakIrsaliye.siparis.toplam_tutar).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', fontSize: '10px' }}>
                        <div style={{ textAlign: 'center', width: '40%' }}>
                            <div style={{ borderTop: '1px solid #333', paddingTop: '4px', fontWeight: 700 }}>TESLİM EDEN</div>
                            <div style={{ color: '#999', marginTop: '2px' }}>İmza / Kaşe</div>
                        </div>
                        <div style={{ textAlign: 'center', width: '40%' }}>
                            <div style={{ borderTop: '1px solid #333', paddingTop: '4px', fontWeight: 700 }}>TESLİM ALAN</div>
                            <div style={{ color: '#999', marginTop: '2px' }}>İmza / Kaşe</div>
                        </div>
                    </div>
                </div>
            )}
            <OnayModal />
        </>
    );
}