"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

interface CariOzet { id: string; gercekId: number; tip: string; isim: string; bakiye: number; telefon?: string; }
interface HareketKaydi { id: string; tarih: string; islemTipi: string; aciklama: string; borc: number; alacak: number; kategori: 'SIPARIS' | 'ODEME'; }
interface YeniCariData { kodu: string; isim: string; tip: 'firma' | 'cari'; bakiye: string; telefon: string; telefon2: string; email: string; il: string; ilce: string; adres: string; vergiDairesi: string; vergiNo: string; }
interface B2BIstek { id: number; market_id: number; durum: string; created_at?: string; market_adi: string; market_il: string; }
interface B2BDetay { isletme_adi: string; unvan: string; vergi_dairesi: string; vergi_no: string; il: string; ilce: string; adres: string; telefon: string; eposta: string; sektor: string; created_at: string; }

interface FirmaRow { id: number; unvan: string; bakiye: string | number | null; telefon?: string; }
interface CariKartRow { id: number; cari_adi: string; bakiye: string | number | null; borc_bakiye: string | number | null; alacak_bakiye: string | number | null; telefon?: string; }
interface CariHareketRow { id: number; tarih?: string; created_at?: string; islem_tipi: string; aciklama?: string; borc: string | number | null; alacak: string | number | null; }
interface SiparisRow { id: number; tarih?: string; created_at?: string; siparis_no?: string; durum: string; toplam_tutar: string | number | null; }

const parseTutar = (val: string | number | null | undefined): number => {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); }
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

const formatTutar = (val: number): string => {
    if (val === 0 || isNaN(val)) return "0,00";
    return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function CariKartlarSayfasi() {
    const { aktifSirket } = useAuth();
    const toast = useToast();
    const [yukleniyor, setYukleniyor] = useState<boolean>(true);
    const [cariler, setCariler] = useState<CariOzet[]>([]);
    const [aramaMetni, setAramaMetni] = useState("");

    const [modalAcik, setModalAcik] = useState<boolean>(false);
    const [seciliCari, setSeciliCari] = useState<CariOzet | null>(null);
    const [hareketler, setHareketler] = useState<HareketKaydi[]>([]);
    const [hareketYukleniyor, setHareketYukleniyor] = useState<boolean>(false);
    const [filtre, setFiltre] = useState<'TUMU' | 'SIPARIS' | 'ODEME'>('TUMU');

    const [yeniCariModalAcik, setYeniCariModalAcik] = useState<boolean>(false);
    const [islemBekliyor, setIslemBekliyor] = useState<boolean>(false);
    const [aktifSekme, setAktifSekme] = useState<"genel" | "iletisim">("genel");
    const [yeniCari, setYeniCari] = useState<YeniCariData>({
        kodu: "", isim: "", tip: "firma", bakiye: "",
        telefon: "", telefon2: "", email: "", il: "", ilce: "", adres: "", vergiDairesi: "", vergiNo: ""
    });

    // B2B İstek Stateleri
    const [sayfaSekme, setSayfaSekme] = useState<"cariler" | "istekler">("cariler");
    const [b2bIstekler, setB2bIstekler] = useState<B2BIstek[]>([]);
    const [b2bDetayModalAcik, setB2bDetayModalAcik] = useState(false);
    const [seciliB2BIstek, setSeciliB2BIstek] = useState<B2BIstek | null>(null);
    const [b2bDetay, setB2bDetay] = useState<B2BDetay | null>(null);
    const [b2bDetayYukleniyor, setB2bDetayYukleniyor] = useState(false);
    const [b2bIslemYapiliyor, setB2bIslemYapiliyor] = useState(false);

    useEffect(() => {
        if (!aktifSirket) return;
        if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/portal"; return; }
        verileriGetir(aktifSirket.id);
        b2bIstekleriGetir(aktifSirket.id);

        // URL'den sekme parametresini oku
        const params = new URLSearchParams(window.location.search);
        if (params.get("sekme") === "istekler") {
            setSayfaSekme("istekler");
            window.history.replaceState({}, "", "/cari");
        }
    }, [aktifSirket]);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            const resF = await supabase.from("firmalar").select("id, unvan, bakiye, telefon").eq("sahip_sirket_id", sirketId);
            const firmalar: CariOzet[] = (resF.data || []).map((f: FirmaRow) => ({
                id: `F-${f.id}`, gercekId: Number(f.id), tip: 'firma', isim: String(f.unvan || ""), bakiye: parseTutar(f.bakiye), telefon: f.telefon || ""
            }));

            const resC = await supabase.from("cari_kartlar").select("id, cari_adi, bakiye, borc_bakiye, alacak_bakiye, telefon").or(`sahip_sirket_id.eq.${sirketId},sirket_id.eq.${sirketId}`);
            const cariKartlar: CariOzet[] = (resC.data || []).map((c: CariKartRow) => ({
                id: `C-${c.id}`, gercekId: Number(c.id), tip: 'cari', isim: String(c.cari_adi || ""), bakiye: c.bakiye ? parseTutar(c.bakiye) : (parseTutar(c.borc_bakiye) - parseTutar(c.alacak_bakiye)), telefon: c.telefon || ""
            }));

            setCariler([...firmalar, ...cariKartlar].sort((a,b) => a.isim.localeCompare(b.isim)));
        } catch { /* veri çekme hatası */ }
        setYukleniyor(false);
    }

    async function b2bIstekleriGetir(sirketId: number) {
        const { data } = await supabase.from("b2b_baglantilar").select("*").eq("toptanci_id", sirketId).eq("durum", "BEKLIYOR").order("id", { ascending: false });
        if (data && data.length > 0) {
            const marketIds = data.map(d => d.market_id);
            const { data: marketler } = await supabase.from("sirketler").select("id, isletme_adi, il").in("id", marketIds);
            const marketMap: Record<number, { adi: string; il: string }> = {};
            if (marketler) marketler.forEach(m => { marketMap[m.id] = { adi: m.isletme_adi || "", il: m.il || "" }; });
            setB2bIstekler(data.map(d => ({
                id: d.id, market_id: d.market_id, durum: d.durum, created_at: d.created_at,
                market_adi: marketMap[d.market_id]?.adi || "Bilinmeyen", market_il: marketMap[d.market_id]?.il || ""
            })));
        } else {
            setB2bIstekler([]);
        }
    }

    const b2bDetayGor = async (istek: B2BIstek) => {
        setSeciliB2BIstek(istek);
        setB2bDetayModalAcik(true);
        setB2bDetayYukleniyor(true);
        setB2bDetay(null);
        const { data } = await supabase.from("sirketler").select("*").eq("id", istek.market_id).single();
        if (data) {
            setB2bDetay({
                isletme_adi: data.isletme_adi || "", unvan: data.unvan || "", vergi_dairesi: data.vergi_dairesi || "",
                vergi_no: data.vergi_no || "", il: data.il || "", ilce: data.ilce || "", adres: data.adres || "",
                telefon: data.telefon || "", eposta: data.eposta || "", sektor: data.sektor || "",
                created_at: data.created_at || ""
            });
        }
        setB2bDetayYukleniyor(false);
    };

    const b2bDurumGuncelle = async (id: number, yeniDurum: string) => {
        setB2bIslemYapiliyor(true);
        const { error } = await supabase.from("b2b_baglantilar").update({ durum: yeniDurum }).eq("id", id);
        if (error) { toast.error("Güncelleme hatası!"); }
        else {
            toast.success(yeniDurum === "ONAYLANDI" ? "Bağlantı isteği onaylandı!" : "Bağlantı isteği reddedildi.");
            setB2bDetayModalAcik(false);
            if (aktifSirket) b2bIstekleriGetir(aktifSirket.id);
        }
        setB2bIslemYapiliyor(false);
    };

    const yeniCariEkraniAc = () => {
        setYeniCari({
            kodu: "C" + Math.floor(10000 + Math.random() * 90000).toString(),
            isim: "", tip: "firma", bakiye: "", telefon: "", telefon2: "", email: "", il: "", ilce: "", adres: "", vergiDairesi: "", vergiNo: ""
        });
        setAktifSekme("genel");
        setYeniCariModalAcik(true);
    };

    const cariKaydet = async () => {
        if (!yeniCari.isim.trim()) { toast.error("Lütfen cari adını / ünvanını giriniz!"); return; }
        setIslemBekliyor(true);
        try {
            if (!aktifSirket) return;
            const baslangicBakiyesi = parseTutar(yeniCari.bakiye);
            if (yeniCari.tip === 'firma') {
                const { error } = await supabase.from('firmalar').insert([{
                    unvan: yeniCari.isim.trim(), bakiye: baslangicBakiyesi, telefon: yeniCari.telefon, sahip_sirket_id: aktifSirket.id
                }]);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('cari_kartlar').insert([{
                    cari_adi: yeniCari.isim.trim(), bakiye: baslangicBakiyesi, telefon: yeniCari.telefon, sahip_sirket_id: aktifSirket.id
                }]);
                if (error) throw error;
            }
            toast.success("Cari kart başarıyla oluşturuldu!");
            setYeniCariModalAcik(false);
            verileriGetir(aktifSirket.id);
        } catch (error) { toast.error(`Kayıt sırasında hata oluştu: ${error instanceof Error ? error.message : String(error)}`); }
        setIslemBekliyor(false);
    };

    const cariSil = async (cari: CariOzet) => {
        if (!window.confirm(`DİKKAT!\n\n"${cari.isim}" isimli cariyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) return;
        setYukleniyor(true);
        try {
            if (cari.tip === 'firma') {
                const { error } = await supabase.from('firmalar').delete().eq('id', cari.gercekId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('cari_kartlar').delete().eq('id', cari.gercekId);
                if (error) throw error;
            }
            toast.success("Cari başarıyla silindi.");
            if (!aktifSirket) return;
            verileriGetir(aktifSirket.id);
        } catch (error) { toast.error(`Silme başarısız! Muhtemelen bu cariye ait geçmiş sipariş veya tahsilat kayıtları mevcut. Sistem Hatası: ${error instanceof Error ? error.message : String(error)}`); }
        setYukleniyor(false);
    };

    const cariHareketleriGetir = async (cari: CariOzet) => {
        setSeciliCari(cari);
        setModalAcik(true);
        setHareketYukleniyor(true);
        setFiltre('TUMU');
        setHareketler([]);
        try {
            const combinedData: HareketKaydi[] = [];
            const hareketFiltre = cari.tip === 'firma' ? { firma_id: cari.gercekId } : { cari_kart_id: cari.gercekId };
            const { data: dHareket } = await supabase.from('cari_hareketler').select('*').match(hareketFiltre);

            if (dHareket) {
                dHareket.forEach((h: CariHareketRow) => {
                    combinedData.push({
                        id: `H-${h.id}`, tarih: h.tarih || h.created_at || '', islemTipi: h.islem_tipi, aciklama: h.aciklama || "Kasa İşlemi",
                        borc: parseTutar(h.borc), alacak: parseTutar(h.alacak), kategori: 'ODEME'
                    });
                });
            }

            const siparisFiltre = cari.tip === 'firma' ? { alici_firma_id: cari.gercekId } : { cari_id: cari.gercekId };
            const { data: dSiparis } = await supabase.from('siparisler').select('*').match(siparisFiltre);

            if (dSiparis) {
                dSiparis.forEach((s: SiparisRow) => {
                    if (s.durum !== "İptal Edildi" && s.durum !== "REDDEDILDI") {
                        const tutar = parseTutar(s.toplam_tutar);
                        combinedData.push({
                            id: `S-${s.id}`, tarih: s.tarih || s.created_at || '', islemTipi: 'Sipariş (Satış)',
                            aciklama: s.siparis_no ? `Sipariş #${s.siparis_no}` : `Sipariş Fişi`, borc: tutar, alacak: 0, kategori: 'SIPARIS'
                        });
                    }
                });
            }
            combinedData.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());
            setHareketler(combinedData);
        } catch { /* hareket çekme hatası */ }
        setHareketYukleniyor(false);
    };


    const filtrelenmisCariler = cariler.filter(c => c.isim.toLowerCase().includes(aramaMetni.toLowerCase()));
    const gosterilenHareketler = hareketler.filter(h => filtre === 'TUMU' ? true : h.kategori === filtre);

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-semibold text-slate-500" style={{ background: "var(--c-bg)" }}>Yükleniyor...</div>;

    return (
        <>
            <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>

                {/* TOOLBAR */}
                <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <button onClick={() => setSayfaSekme("cariler")} className={sayfaSekme === "cariler" ? "btn-primary" : "btn-secondary"}>
                        <i className="fas fa-address-book mr-1.5"></i> Cari Kartlar
                    </button>
                    <button onClick={() => setSayfaSekme("istekler")} className={`${sayfaSekme === "istekler" ? "btn-primary" : "btn-secondary"} flex items-center gap-2`}>
                        <i className="fas fa-handshake mr-1.5"></i> İşletme İstekleri
                        {b2bIstekler.length > 0 && <span className="bg-red-600 text-white text-[9px] font-semibold w-5 h-5 flex items-center justify-center animate-pulse">{b2bIstekler.length}</span>}
                    </button>

                    <div className="flex-1" />

                    {yukleniyor && <i className="fas fa-circle-notch fa-spin text-blue-500"></i>}

                    {sayfaSekme === "cariler" && (
                        <>
                            <div className="relative w-48 sm:w-64">
                                <input type="text" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} placeholder="Cari Adı Ara..." className="input-kurumsal pr-8" />
                                <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            </div>
                            <button onClick={yeniCariEkraniAc} className="btn-primary flex items-center">
                                <i className="fas fa-plus mr-1.5"></i> Yeni Kayıt
                            </button>
                        </>
                    )}
                </div>

                {/* CARİ LİSTESİ TABLOSU */}
                {sayfaSekme === "cariler" && <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    <div className="card-kurumsal overflow-hidden">
                        <table className="tbl-kurumsal min-w-[700px]">
                            <thead>
                                <tr>
                                    <th className="w-12 text-center">No</th>
                                    <th>Cari Ünvanı / Müşteri Adı</th>
                                    <th className="w-28 text-center">Tipi</th>
                                    <th className="w-32 text-right">Güncel Bakiye</th>
                                    <th className="w-40 text-center">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrelenmisCariler.length === 0 ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-semibold">Listelenecek Müşteri/Cari Bulunamadı.</td></tr>
                                ) : (
                                    filtrelenmisCariler.map((cari, idx) => (
                                        <tr key={cari.id} className="group">
                                            <td className="text-center text-slate-400 font-semibold">{idx + 1}</td>
                                            <td className="font-semibold text-slate-800 group-hover:text-[#1d4ed8]">{cari.isim}</td>
                                            <td className="text-center">
                                                <span className={`px-2 py-0.5 text-[9px] font-semibold uppercase ${cari.tip === 'firma' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'}`}>
                                                    {cari.tip === 'firma' ? 'B2B Firma' : 'Bireysel'}
                                                </span>
                                            </td>
                                            <td className={`text-right font-semibold text-[13px] ${cari.bakiye > 0 ? 'text-[#dc2626]' : (cari.bakiye < 0 ? 'text-[#059669]' : 'text-slate-500')}`}>
                                                {formatTutar(cari.bakiye)} ₺
                                            </td>
                                            <td className="text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => cariHareketleriGetir(cari)} className="btn-secondary flex items-center">
                                                        <i className="fas fa-list-alt mr-1.5"></i> Ekstre
                                                    </button>
                                                    <button onClick={() => cariSil(cari)} className="btn-secondary text-[#dc2626] opacity-0 group-hover:opacity-100" style={{ borderColor: "#fecaca" }} title="Cariyi Sil">
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>}

                {/* İŞLETME İSTEKLERİ SEKMESİ */}
                {sayfaSekme === "istekler" && (
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                        {b2bIstekler.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="w-20 h-20 flex items-center justify-center mb-4" style={{ background: "var(--c-bg)" }}><i className="fas fa-handshake text-3xl text-slate-300"></i></div>
                                <h3 className="text-base font-semibold text-slate-400">Bekleyen İstek Yok</h3>
                                <p className="text-xs text-slate-400 mt-1">Şu anda onay bekleyen işletme bağlantı isteği bulunmuyor.</p>
                            </div>
                        ) : (
                            <div className="card-kurumsal overflow-hidden">
                                <table className="tbl-kurumsal min-w-[600px]">
                                    <thead>
                                        <tr>
                                            <th className="w-12 text-center">No</th>
                                            <th>İşletme / Marka Adı</th>
                                            <th className="w-28">Şehir</th>
                                            <th className="w-36">Başvuru Tarihi</th>
                                            <th className="w-32 text-center">İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b2bIstekler.map((istek, idx) => {
                                            const tarih = istek.created_at ? new Date(istek.created_at) : null;
                                            return (
                                                <tr key={istek.id}>
                                                    <td className="text-center text-slate-400 font-semibold">{idx + 1}</td>
                                                    <td>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><i className="fas fa-store text-xs"></i></div>
                                                            <span className="font-semibold text-slate-800">{istek.market_adi}</span>
                                                        </div>
                                                    </td>
                                                    <td className="text-slate-600 font-semibold">
                                                        {istek.market_il ? <><i className="fas fa-map-marker-alt text-slate-400 mr-1"></i>{istek.market_il}</> : <span className="text-slate-300">-</span>}
                                                    </td>
                                                    <td className="text-slate-500 font-semibold">
                                                        {tarih ? <>{tarih.toLocaleDateString("tr-TR")} <span className="text-slate-300">{tarih.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span></> : "-"}
                                                    </td>
                                                    <td className="text-center">
                                                        <button onClick={() => b2bDetayGor(istek)} className="btn-primary">
                                                            <i className="fas fa-eye mr-1.5"></i> Detay Gör
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* --- BİLNEX / ERP TARZI YENİ CARİ KAYIT MODALI --- */}
            {yeniCariModalAcik && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80] p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>

                        <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <div className="flex items-center gap-2">
                                <button onClick={cariKaydet} disabled={islemBekliyor} className="btn-primary flex items-center disabled:opacity-50">
                                    <i className="fas fa-save mr-1.5"></i> Kaydet
                                </button>
                                <button disabled className="btn-secondary flex items-center opacity-50">
                                    <i className="fas fa-trash-alt mr-1.5"></i> Sil
                                </button>
                            </div>
                            <button onClick={() => setYeniCariModalAcik(false)} className="btn-secondary text-[#dc2626] flex items-center"><i className="fas fa-times mr-1"></i> Kapat</button>
                        </div>

                        <div className="p-3 shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-1.5">
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-slate-500 font-semibold text-[11px]">Kodu</label>
                                        <input type="text" disabled value={yeniCari.kodu} className="input-kurumsal w-32 bg-amber-50 font-semibold text-[#1d4ed8]" />
                                    </div>
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-[#dc2626] font-semibold text-[11px]">Cari Adı / Ünvan</label>
                                        <input type="text" autoFocus value={yeniCari.isim} onChange={(e) => setYeniCari({...yeniCari, isim: e.target.value.toUpperCase()})} className="input-kurumsal flex-1 uppercase font-semibold text-slate-800" />
                                    </div>
                                </div>
                                <div className="w-80 space-y-1.5">
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-slate-500 font-semibold text-[11px]">Döviz Cinsi</label>
                                        <select disabled className="input-kurumsal flex-1" style={{ background: "#f8fafc" }}><option>TL</option></select>
                                    </div>
                                    <div className="flex items-center">
                                        <label className="w-24 text-right pr-2 text-slate-500 font-semibold text-[11px]">Cari Tipi</label>
                                        <select value={yeniCari.tip} onChange={(e) => setYeniCari({...yeniCari, tip: e.target.value as 'firma' | 'cari'})} className="input-kurumsal flex-1 font-semibold text-slate-800 cursor-pointer">
                                            <option value="firma">B2B Kurumsal Firma</option>
                                            <option value="cari">Bireysel Müşteri</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="w-24 h-24 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0" style={{ border: "1px solid var(--c-border)" }}>
                                    <i className="fas fa-camera text-2xl mb-1"></i>
                                    <span className="text-[9px] text-center px-1 leading-tight">Resim Dosyası Yok</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex px-2 pt-2 shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <button onClick={() => setAktifSekme('genel')} className={aktifSekme === 'genel' ? 'btn-primary -mb-[1px]' : 'btn-secondary -mb-[1px]'}>1: Genel Bilgiler</button>
                            <button onClick={() => setAktifSekme('iletisim')} className={aktifSekme === 'iletisim' ? 'btn-primary -mb-[1px]' : 'btn-secondary -mb-[1px]'}>2: İletişim ve Adres</button>
                        </div>

                        <div className="flex-1 bg-white p-4 overflow-y-auto">
                            {aktifSekme === 'genel' && (
                                <div className="flex gap-8 max-w-4xl">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">Vergi Dairesi</label><input type="text" value={yeniCari.vergiDairesi} onChange={e=>setYeniCari({...yeniCari, vergiDairesi: e.target.value.toUpperCase()})} className="input-kurumsal flex-1 uppercase" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">V.D. No / T.C.</label><input type="text" value={yeniCari.vergiNo} onChange={e=>setYeniCari({...yeniCari, vergiNo: e.target.value})} className="input-kurumsal flex-1" /></div>
                                        <div className="flex items-center pt-4" style={{ borderTop: "1px dashed var(--c-border)" }}><label className="w-28 text-right pr-2 text-orange-600 font-semibold text-[11px]">Açılış Bakiyesi</label><input type="number" min="0" value={yeniCari.bakiye} onChange={e=>setYeniCari({...yeniCari, bakiye: e.target.value})} className="input-kurumsal flex-1 font-semibold text-right" style={{ background: "#f8fafc" }} placeholder="0.00" /></div>
                                        <div className="flex justify-end"><span className="text-[9px] text-slate-400">* Geçmişten devreden alacağınız varsa buraya yazınız.</span></div>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">Grubu</label><select className="input-kurumsal flex-1"><option></option></select></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">Sektörü</label><select className="input-kurumsal flex-1"><option></option></select></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">Çalışma Şekli</label><select className="input-kurumsal flex-1"><option>Kredi</option><option>Peşin</option></select></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">Vade (Gün)</label><input type="number" min="0" defaultValue="0" className="input-kurumsal w-16 text-right" /></div>
                                    </div>
                                </div>
                            )}

                            {aktifSekme === 'iletisim' && (
                                <div className="flex gap-8 max-w-4xl">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-start"><label className="w-28 text-right pr-2 mt-1 text-slate-500 font-semibold text-[11px]">Açık Adres</label><textarea value={yeniCari.adres} onChange={e=>setYeniCari({...yeniCari, adres: e.target.value})} className="input-kurumsal flex-1 h-16 resize-none" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">İl</label><input type="text" value={yeniCari.il} onChange={e=>setYeniCari({...yeniCari, il: e.target.value.toUpperCase()})} className="input-kurumsal flex-1 uppercase" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">İlçe</label><input type="text" value={yeniCari.ilce} onChange={e=>setYeniCari({...yeniCari, ilce: e.target.value.toUpperCase()})} className="input-kurumsal flex-1 uppercase" /></div>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">Telefon 1 (Gsm)</label><input type="text" value={yeniCari.telefon} onChange={e=>setYeniCari({...yeniCari, telefon: e.target.value})} className="input-kurumsal flex-1" placeholder="05XX XXX XX XX" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">Telefon 2</label><input type="text" value={yeniCari.telefon2} onChange={e=>setYeniCari({...yeniCari, telefon2: e.target.value})} className="input-kurumsal flex-1" /></div>
                                        <div className="flex items-center"><label className="w-28 text-right pr-2 text-slate-500 font-semibold text-[11px]">E-Mail</label><input type="email" value={yeniCari.email} onChange={e=>setYeniCari({...yeniCari, email: e.target.value})} className="input-kurumsal flex-1" /></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- B2B DETAY MODALI --- */}
            {b2bDetayModalAcik && seciliB2BIstek && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80] p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
                        <div className="bg-[#0f172a] p-4 flex justify-between items-center shrink-0">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2 uppercase tracking-widest">
                                <i className="fas fa-building text-amber-400"></i> İşletme Detayı
                            </h3>
                            <button onClick={() => setB2bDetayModalAcik(false)} className="w-8 h-8 bg-slate-700 hover:bg-red-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="flex-1 overflow-auto p-5">
                            {b2bDetayYukleniyor ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <i className="fas fa-circle-notch fa-spin text-3xl mb-3 text-blue-500"></i>
                                    <p className="font-semibold text-xs uppercase tracking-widest">Bilgiler Yükleniyor...</p>
                                </div>
                            ) : b2bDetay ? (
                                <div className="space-y-4">
                                    {/* Marka Adı */}
                                    <div className="card-kurumsal p-4" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
                                        <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1">İşletme / Marka Adı</p>
                                        <p className="text-lg font-semibold text-slate-800">{b2bDetay.isletme_adi || "-"}</p>
                                    </div>

                                    {/* Bilgi Satırları */}
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                            <i className="fas fa-file-invoice text-slate-400 mt-0.5 w-5 text-center"></i>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Resmi Vergi Ünvanı</p>
                                                <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.unvan || <span className="text-slate-300 italic">Belirtilmemiş</span>}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                                <i className="fas fa-landmark text-slate-400 mt-0.5 w-5 text-center"></i>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Vergi Dairesi</p>
                                                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.vergi_dairesi || <span className="text-slate-300 italic">-</span>}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                                <i className="fas fa-hashtag text-slate-400 mt-0.5 w-5 text-center"></i>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Vergi No</p>
                                                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.vergi_no || <span className="text-slate-300 italic">-</span>}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                                <i className="fas fa-map-marker-alt text-slate-400 mt-0.5 w-5 text-center"></i>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">İl / İlçe</p>
                                                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{[b2bDetay.il, b2bDetay.ilce].filter(Boolean).join(" / ") || <span className="text-slate-300 italic">-</span>}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                                <i className="fas fa-industry text-slate-400 mt-0.5 w-5 text-center"></i>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Sektör</p>
                                                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.sektor || <span className="text-slate-300 italic">-</span>}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                            <i className="fas fa-map text-slate-400 mt-0.5 w-5 text-center"></i>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Açık Adres</p>
                                                <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.adres || <span className="text-slate-300 italic">Belirtilmemiş</span>}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                                <i className="fas fa-phone text-slate-400 mt-0.5 w-5 text-center"></i>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Telefon</p>
                                                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.telefon || <span className="text-slate-300 italic">-</span>}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                                <i className="fas fa-envelope text-slate-400 mt-0.5 w-5 text-center"></i>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">E-Posta</p>
                                                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.eposta || <span className="text-slate-300 italic">-</span>}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 p-3 card-kurumsal" style={{ background: "#f8fafc" }}>
                                            <i className="fas fa-calendar-alt text-slate-400 mt-0.5 w-5 text-center"></i>
                                            <div>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Kayıt Tarihi</p>
                                                <p className="text-sm font-semibold text-slate-800 mt-0.5">{b2bDetay.created_at ? new Date(b2bDetay.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "-"}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-400 font-semibold">Bilgi bulunamadı.</div>
                            )}
                        </div>

                        {/* ALT BUTONLAR */}
                        <div className="p-4 flex gap-3 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                            <button
                                onClick={() => b2bDurumGuncelle(seciliB2BIstek.id, "ONAYLANDI")}
                                disabled={b2bIslemYapiliyor}
                                className="flex-1 py-3 bg-[#059669] hover:bg-emerald-700 text-white font-semibold text-sm uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {b2bIslemYapiliyor ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check-circle text-lg"></i>}
                                Onayla
                            </button>
                            <button
                                onClick={() => b2bDurumGuncelle(seciliB2BIstek.id, "REDDEDILDI")}
                                disabled={b2bIslemYapiliyor}
                                className="flex-1 py-3 bg-[#dc2626] hover:bg-red-700 text-white font-semibold text-sm uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {b2bIslemYapiliyor ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-times-circle text-lg"></i>}
                                Reddet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- CARİ EKSTRE MODALI --- */}
            {modalAcik && seciliCari && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-5xl overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
                        <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><i className="fas fa-file-invoice-dollar text-[#1d4ed8]"></i> {seciliCari.isim}</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">Cari Hesap Ekstresi ve Geçmiş İşlemler</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right hidden sm:block px-3 py-1" style={{ background: "#f8fafc", border: "1px solid var(--c-border)" }}>
                                    <span className="text-[10px] text-slate-500 block uppercase">Güncel Bakiye</span>
                                    <span className={`font-semibold text-sm ${seciliCari.bakiye > 0 ? 'text-[#dc2626]' : 'text-[#059669]'}`}>{formatTutar(seciliCari.bakiye)} ₺</span>
                                </div>
                                <button onClick={() => setModalAcik(false)} className="w-8 h-8 flex items-center justify-center bg-slate-200 hover:bg-red-100 transition-colors text-slate-600 hover:text-red-600"><i className="fas fa-times"></i></button>
                            </div>
                        </div>

                        <div className="px-4 py-2 flex gap-2 shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <button onClick={() => setFiltre('TUMU')} className={filtre === 'TUMU' ? 'btn-primary' : 'btn-secondary'}><i className="fas fa-list mr-1"></i> Tüm Hareketler</button>
                            <button onClick={() => setFiltre('SIPARIS')} className={filtre === 'SIPARIS' ? 'btn-primary' : 'btn-secondary'}><i className="fas fa-box-open mr-1"></i> Sadece Siparişler (Aldıkları)</button>
                            <button onClick={() => setFiltre('ODEME')} className={filtre === 'ODEME' ? 'btn-primary' : 'btn-secondary'}><i className="fas fa-money-bill-wave mr-1"></i> Sadece Ödemeler (Tahsilat)</button>
                        </div>

                        <div className="flex-1 overflow-auto bg-white p-4 custom-scrollbar">
                            {hareketYukleniyor ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400"><i className="fas fa-circle-notch fa-spin text-3xl mb-3 text-blue-500"></i><p className="font-semibold tracking-widest uppercase text-xs">Kayıtlar Taranıyor...</p></div>
                            ) : (
                                <div className="card-kurumsal overflow-hidden">
                                    <table className="tbl-kurumsal">
                                        <thead>
                                            <tr>
                                                <th className="w-32">Tarih</th>
                                                <th className="w-32 text-center">İşlem Tipi</th>
                                                <th>Evrak / Açıklama</th>
                                                <th className="w-28 text-right text-[#dc2626]">Borç (Sipariş)</th>
                                                <th className="w-28 text-right text-[#059669]">Alacak (Ödeme)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gosterilenHareketler.length === 0 ? (
                                                <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-semibold uppercase text-xs">Bu kritere uygun işlem bulunamadı.</td></tr>
                                            ) : (
                                                gosterilenHareketler.map((h) => {
                                                    const d = new Date(h.tarih);
                                                    const isSiparis = h.kategori === 'SIPARIS';
                                                    const isTahsilat = h.islemTipi === "Tahsilat";
                                                    return (
                                                        <tr key={h.id}>
                                                            <td className="font-medium text-slate-500">{d.toLocaleDateString('tr-TR')} <span className="text-[9px] ml-1">{d.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</span></td>
                                                            <td className="text-center"><span className={`px-2 py-0.5 font-semibold uppercase text-[9px] ${isSiparis ? 'bg-blue-100 text-[#1d4ed8]' : (isTahsilat ? 'bg-emerald-100 text-[#059669]' : 'bg-orange-100 text-orange-700')}`}>{h.islemTipi}</span></td>
                                                            <td className="font-semibold">{h.aciklama}</td>
                                                            <td className="text-right font-semibold text-[#dc2626]">{h.borc > 0 ? formatTutar(h.borc) : "-"}</td>
                                                            <td className="text-right font-semibold text-[#059669]">{h.alacak > 0 ? formatTutar(h.alacak) : "-"}</td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
