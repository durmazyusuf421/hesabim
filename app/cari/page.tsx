"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
import { bildirimEkle } from "@/app/lib/bildirim";
import { excelExport, pdfExport } from "@/app/lib/export";

interface CariOzet { id: string; gercekId: number; tip: string; isim: string; bakiye: number; telefon?: string; puan?: number; musteri_seviyesi?: string; }
interface HareketKaydi { id: string; tarih: string; islemTipi: string; aciklama: string; borc: number; alacak: number; kategori: 'SIPARIS' | 'ODEME'; }
interface YeniCariData { kodu: string; isim: string; tip: 'firma' | 'cari'; bakiye: string; telefon: string; telefon2: string; email: string; il: string; ilce: string; adres: string; vergiDairesi: string; vergiNo: string; }
interface B2BIstek { id: number; market_id: number; durum: string; created_at?: string; market_adi: string; market_il: string; }
interface B2BDetay { isletme_adi: string; unvan: string; vergi_dairesi: string; vergi_no: string; il: string; ilce: string; adres: string; telefon: string; eposta: string; sektor: string; created_at: string; }

interface FirmaRow { id: number; unvan: string; bakiye: string | number | null; telefon?: string; puan?: number; musteri_seviyesi?: string; }
interface OzelFiyat { id: number; urun_id: number; ozel_fiyat: number; }
interface UrunOzet { id: number; urun_adi: string; satis_fiyati: number; birim: string; }
interface CariKartRow { id: number; cari_adi: string; bakiye: string | number | null; borc_bakiye: string | number | null; alacak_bakiye: string | number | null; telefon?: string; }
interface Ziyaret { id: number; ziyaret_tarihi: string; ziyaret_saati: string; personel_adi: string; ziyaret_notu: string | null; sonuc: string; }
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
    const { aktifSirket, kullanici } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();
    const [yukleniyor, setYukleniyor] = useState<boolean>(true);
    const [cariler, setCariler] = useState<CariOzet[]>([]);
    const [aramaMetni, setAramaMetni] = useState("");
    const [seviyeFiltre, setSeviyeFiltre] = useState<string>("TUMU");
    const [puanGuncelleniyor, setPuanGuncelleniyor] = useState(false);
    const [seciliCariler, setSeciliCariler] = useState<Set<string>>(new Set());
    const [cariExportMenu, setCariExportMenu] = useState(false);

    const [modalAcik, setModalAcik] = useState<boolean>(false);
    const [seciliCari, setSeciliCari] = useState<CariOzet | null>(null);
    const [hareketler, setHareketler] = useState<HareketKaydi[]>([]);
    const [hareketYukleniyor, setHareketYukleniyor] = useState<boolean>(false);
    const [filtre, setFiltre] = useState<'TUMU' | 'SIPARIS' | 'ODEME'>('TUMU');

    const [yeniCariModalAcik, setYeniCariModalAcik] = useState<boolean>(false);
    const [islemBekliyor, setIslemBekliyor] = useState<boolean>(false);
    const [aktifSekme, setAktifSekme] = useState<"genel" | "iletisim">("genel");
    const [duzenleCarId, setDuzenleCarId] = useState<number | null>(null);
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

    // Özel Fiyat & Ziyaret Stateleri
    const [detaySekme, setDetaySekme] = useState<"hareketler" | "ozel-fiyat" | "ziyaretler">("hareketler");
    const [ozelFiyatlar, setOzelFiyatlar] = useState<OzelFiyat[]>([]);
    const [urunListesi, setUrunListesi] = useState<UrunOzet[]>([]);
    const [ozelFiyatDuzenlemeler, setOzelFiyatDuzenlemeler] = useState<Record<number, string>>({});
    const [ozelFiyatYukleniyor, setOzelFiyatYukleniyor] = useState(false);
    const [ozelFiyatKaydediliyor, setOzelFiyatKaydediliyor] = useState(false);
    const [ozelFiyatArama, setOzelFiyatArama] = useState("");

    // Ziyaret Stateleri
    const [ziyaretler, setZiyaretler] = useState<Ziyaret[]>([]);
    const [ziyaretYukleniyor, setZiyaretYukleniyor] = useState(false);
    const [ziyaretModalAcik, setZiyaretModalAcik] = useState(false);
    const [ziyaretKaydediliyor, setZiyaretKaydediliyor] = useState(false);
    const [zFormTarih, setZFormTarih] = useState(new Date().toISOString().split("T")[0]);
    const [zFormSaat, setZFormSaat] = useState(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    const [zFormPersonel, setZFormPersonel] = useState("");
    const [zFormNot, setZFormNot] = useState("");
    const [zFormSonuc, setZFormSonuc] = useState("BILGI_VERILDI");

    useEffect(() => {
        if (!aktifSirket) return;
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
            const resF = await supabase.from("firmalar").select("id, unvan, bakiye, telefon, puan, musteri_seviyesi").eq("sahip_sirket_id", sirketId);
            const firmalar: CariOzet[] = (resF.data || []).map((f: FirmaRow) => ({
                id: `F-${f.id}`, gercekId: Number(f.id), tip: 'firma', isim: String(f.unvan || ""), bakiye: parseTutar(f.bakiye), telefon: f.telefon || "", puan: f.puan || 0, musteri_seviyesi: f.musteri_seviyesi || "BRONZ"
            }));

            const resC = await supabase.from("firmalar").select("id, unvan, bakiye, telefon, puan, musteri_seviyesi").eq("sahip_sirket_id", sirketId).eq("firma_tipi", "Bireysel");
            const cariKartlar: CariOzet[] = (resC.data || []).map((c: FirmaRow) => ({
                id: `C-${c.id}`, gercekId: Number(c.id), tip: 'cari', isim: String(c.unvan || ""), bakiye: parseTutar(c.bakiye), telefon: c.telefon || "", puan: c.puan || 0, musteri_seviyesi: c.musteri_seviyesi || "BRONZ"
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
        if (error) { toast.error("Güncelleme hatası: " + error.message); }
        else {
            toast.success(yeniDurum === "ONAYLANDI" ? "Bağlantı isteği onaylandı!" : "Bağlantı isteği reddedildi.");
            if (aktifSirket) {
                const istek = b2bIstekler.find(i => i.id === id);
                await bildirimEkle(aktifSirket.id, yeniDurum === "ONAYLANDI" ? "B2B Bağlantı Onaylandı" : "B2B Bağlantı Reddedildi", `${istek?.market_adi || "Market"} bağlantı isteği ${yeniDurum === "ONAYLANDI" ? "onaylandı" : "reddedildi"}`, yeniDurum === "ONAYLANDI" ? "BASARI" : "BILGI", "B2B", id);
            }
            setB2bDetayModalAcik(false);
            if (aktifSirket) b2bIstekleriGetir(aktifSirket.id);
        }
        setB2bIslemYapiliyor(false);
    };

    const yeniCariEkraniAc = () => {
        setDuzenleCarId(null);
        setYeniCari({
            kodu: "C" + Math.floor(10000 + Math.random() * 90000).toString(),
            isim: "", tip: "firma", bakiye: "", telefon: "", telefon2: "", email: "", il: "", ilce: "", adres: "", vergiDairesi: "", vergiNo: ""
        });
        setAktifSekme("genel");
        setYeniCariModalAcik(true);
    };

    const cariDuzenleAc = async (cari: CariOzet) => {
        if (!aktifSirket) return;
        const { data } = await supabase.from("firmalar").select("*").eq("id", cari.gercekId).single();
        if (!data) { toast.error("Cari bilgileri yüklenemedi"); return; }
        setDuzenleCarId(cari.gercekId);
        setYeniCari({
            kodu: `F-${cari.gercekId}`,
            isim: data.unvan || "",
            tip: data.firma_tipi === "Bireysel" ? "cari" : "firma",
            bakiye: String(data.bakiye || ""),
            telefon: data.telefon || "",
            telefon2: data.telefon2 || "",
            email: data.eposta || "",
            il: data.il || "",
            ilce: data.ilce || "",
            adres: data.adres || "",
            vergiDairesi: data.vergi_dairesi || "",
            vergiNo: data.vergi_no || "",
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

            if (duzenleCarId) {
                // GÜNCELLEME MODU
                const { error } = await supabase.from('firmalar').update({
                    unvan: yeniCari.isim.trim(),
                    bakiye: baslangicBakiyesi,
                    telefon: yeniCari.telefon || null,
                    telefon2: yeniCari.telefon2 || null,
                    eposta: yeniCari.email || null,
                    il: yeniCari.il || null,
                    ilce: yeniCari.ilce || null,
                    adres: yeniCari.adres || null,
                    vergi_dairesi: yeniCari.vergiDairesi || null,
                    vergi_no: yeniCari.vergiNo || null,
                }).eq("id", duzenleCarId);
                if (error) throw new Error(error.message || JSON.stringify(error));
                toast.success("Cari kart güncellendi!");
            } else if (yeniCari.tip === 'firma') {
                const { error } = await supabase.from('firmalar').insert([{
                    unvan: yeniCari.isim.trim(), bakiye: baslangicBakiyesi, telefon: yeniCari.telefon, sahip_sirket_id: aktifSirket.id
                }]);
                if (error) throw error;
                toast.success("Cari kart başarıyla oluşturuldu!");
            } else {
                const { error } = await supabase.from('firmalar').insert([{
                    unvan: yeniCari.isim.trim(), bakiye: baslangicBakiyesi, telefon: yeniCari.telefon, sahip_sirket_id: aktifSirket.id, firma_tipi: 'Bireysel'
                }]);
                if (error) throw new Error(error.message || JSON.stringify(error));
                toast.success("Cari kart başarıyla oluşturuldu!");
            }
            setYeniCariModalAcik(false);
            setDuzenleCarId(null);
            verileriGetir(aktifSirket.id);
        } catch (error) { toast.error(`Kayıt sırasında hata oluştu: ${error instanceof Error ? error.message : String(error)}`); }
        setIslemBekliyor(false);
    };

    const cariSil = (cari: CariOzet) => {
        onayla({
            baslik: "Cari Kartı Sil",
            mesaj: `"${cari.isim}" silinecek`,
            altMesaj: "Bu işlem geri alınamaz. Cari karta ait tüm hareketler de etkilenecektir.",
            onayMetni: "Evet, Sil",
            tehlikeli: true,
            onOnayla: async () => {
                setYukleniyor(true);
                try {
                    if (cari.tip === 'firma') {
                        const { error } = await supabase.from('firmalar').delete().eq('id', cari.gercekId);
                        if (error) throw error;
                    } else {
                        const { error } = await supabase.from('firmalar').delete().eq('id', cari.gercekId);
                        if (error) throw error;
                    }
                    toast.success("Cari başarıyla silindi.");
                    if (!aktifSirket) return;
                    verileriGetir(aktifSirket.id);
                } catch (error) { toast.error(`Silme başarısız! Muhtemelen bu cariye ait geçmiş sipariş veya tahsilat kayıtları mevcut. Sistem Hatası: ${error instanceof Error ? error.message : String(error)}`); }
                setYukleniyor(false);
            }
        });
    };

    const cariHareketleriGetir = async (cari: CariOzet) => {
        setSeciliCari(cari);
        setModalAcik(true);
        setDetaySekme("hareketler");
        setHareketYukleniyor(true);
        setFiltre('TUMU');
        setHareketler([]);
        setOzelFiyatArama("");
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


    // Özel Fiyat Fonksiyonları
    const ozelFiyatlariGetir = async (firmaId: number) => {
        if (!aktifSirket) return;
        setOzelFiyatYukleniyor(true);
        const [{ data: ofData }, { data: uData }] = await Promise.all([
            supabase.from("ozel_fiyatlar").select("id, urun_id, ozel_fiyat").eq("sirket_id", aktifSirket.id).eq("firma_id", firmaId).eq("aktif", true),
            supabase.from("urunler").select("id, urun_adi, satis_fiyati, birim").eq("sahip_sirket_id", aktifSirket.id).eq("aktif", true).order("urun_adi"),
        ]);
        setOzelFiyatlar(ofData || []);
        setUrunListesi(uData || []);
        const duzenlemeler: Record<number, string> = {};
        (ofData || []).forEach(of => { duzenlemeler[of.urun_id] = String(of.ozel_fiyat); });
        setOzelFiyatDuzenlemeler(duzenlemeler);
        setOzelFiyatYukleniyor(false);
    };

    const ozelFiyatKaydet = async (urunId: number) => {
        if (!aktifSirket || !seciliCari) return;
        const firmaId = seciliCari.gercekId;
        const deger = ozelFiyatDuzenlemeler[urunId];
        const fiyat = Number(deger);
        setOzelFiyatKaydediliyor(true);

        const mevcut = ozelFiyatlar.find(of => of.urun_id === urunId);
        if (!deger || !fiyat || fiyat <= 0) {
            // Sil
            if (mevcut) {
                await supabase.from("ozel_fiyatlar").delete().eq("id", mevcut.id);
                toast.success("Özel fiyat kaldırıldı");
            }
        } else if (mevcut) {
            await supabase.from("ozel_fiyatlar").update({ ozel_fiyat: fiyat }).eq("id", mevcut.id);
            toast.success("Özel fiyat güncellendi");
        } else {
            await supabase.from("ozel_fiyatlar").insert({ sirket_id: aktifSirket.id, firma_id: firmaId, urun_id: urunId, ozel_fiyat: fiyat });
            toast.success("Özel fiyat eklendi");
        }
        await ozelFiyatlariGetir(firmaId);
        setOzelFiyatKaydediliyor(false);
    };

    const ozelFiyatTopluKaydet = async () => {
        if (!aktifSirket || !seciliCari) return;
        setOzelFiyatKaydediliyor(true);
        const firmaId = seciliCari.gercekId;
        for (const urunId of Object.keys(ozelFiyatDuzenlemeler)) {
            const uid = Number(urunId);
            const deger = ozelFiyatDuzenlemeler[uid];
            const fiyat = Number(deger);
            const mevcut = ozelFiyatlar.find(of => of.urun_id === uid);
            if (!deger || !fiyat || fiyat <= 0) {
                if (mevcut) await supabase.from("ozel_fiyatlar").delete().eq("id", mevcut.id);
            } else if (mevcut) {
                if (fiyat !== mevcut.ozel_fiyat) await supabase.from("ozel_fiyatlar").update({ ozel_fiyat: fiyat }).eq("id", mevcut.id);
            } else {
                await supabase.from("ozel_fiyatlar").insert({ sirket_id: aktifSirket.id, firma_id: firmaId, urun_id: uid, ozel_fiyat: fiyat });
            }
        }
        toast.success("Özel fiyatlar kaydedildi");
        await ozelFiyatlariGetir(firmaId);
        setOzelFiyatKaydediliyor(false);
    };

    // Ziyaret Fonksiyonları
    const ziyaretleriGetir = async (firmaId: number) => {
        if (!aktifSirket) return;
        setZiyaretYukleniyor(true);
        const { data } = await supabase.from("musteri_ziyaretleri").select("*").eq("sirket_id", aktifSirket.id).eq("firma_id", firmaId).order("ziyaret_tarihi", { ascending: false }).order("ziyaret_saati", { ascending: false });
        setZiyaretler(data || []);
        setZiyaretYukleniyor(false);
    };

    const ziyaretKaydet = async () => {
        if (!aktifSirket || !seciliCari) return;
        if (!zFormSonuc) { toast.error("Sonuç seçiniz"); return; }
        setZiyaretKaydediliyor(true);
        const { error } = await supabase.from("musteri_ziyaretleri").insert({
            sirket_id: aktifSirket.id,
            firma_id: seciliCari.gercekId,
            ziyaret_tarihi: zFormTarih,
            ziyaret_saati: zFormSaat,
            personel_adi: zFormPersonel.trim() || null,
            ziyaret_notu: zFormNot.trim() || null,
            sonuc: zFormSonuc,
        });
        if (error) toast.error("Kayıt başarısız");
        else { toast.success("Ziyaret kaydedildi"); setZiyaretModalAcik(false); ziyaretleriGetir(seciliCari.gercekId); }
        setZiyaretKaydediliyor(false);
    };

    const ziyaretSonucBadge = (sonuc: string) => {
        const map: Record<string, { cls: string; label: string }> = {
            SIPARIS_ALINDI: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Sipariş Alındı" },
            BILGI_VERILDI: { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Bilgi Verildi" },
            GERI_DONUS: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Geri Dönüş" },
            OLUMSUZ: { cls: "bg-red-50 text-red-700 border-red-200", label: "Olumsuz" },
        };
        return map[sonuc] || { cls: "bg-gray-50 text-gray-600 border-gray-200", label: sonuc };
    };

    // Toplu seçim fonksiyonları
    const cariSecimToggle = (id: string) => { const y = new Set(seciliCariler); if (y.has(id)) y.delete(id); else y.add(id); setSeciliCariler(y); };
    const tumCarileriSec = () => { if (seciliCariler.size === filtrelenmisCariler.length) setSeciliCariler(new Set()); else setSeciliCariler(new Set(filtrelenmisCariler.map(c => c.id))); };
    const topluCariSil = () => {
        onayla({ baslik: "Toplu Sil", mesaj: `${seciliCariler.size} cariyi silmek istediğinize emin misiniz?`, altMesaj: "Bu işlem geri alınamaz.", onayMetni: "Sil", tehlikeli: true, onOnayla: async () => {
            for (const id of seciliCariler) { const cari = cariler.find(c => c.id === id); if (cari) await supabase.from("firmalar").delete().eq("id", cari.gercekId); }
            toast.success(`${seciliCariler.size} cari silindi`); setSeciliCariler(new Set());
            if (aktifSirket) verileriGetir(aktifSirket.id);
        }});
    };
    const topluPuanGuncelle = async () => {
        if (!aktifSirket) return;
        setPuanGuncelleniyor(true);
        for (const id of seciliCariler) {
            const cari = cariler.find(c => c.id === id);
            if (!cari) continue;
            const firmaId = cari.gercekId;
            const { data: sipData } = await supabase.from("siparisler").select("toplam_tutar").eq("alici_firma_id", firmaId).neq("durum", "IPTAL");
            const siparisSayisi = sipData?.length || 0;
            const toplamTutar = (sipData || []).reduce((a, s) => a + parseTutar(s.toplam_tutar), 0);
            let puan = Math.floor(toplamTutar / 1000) + siparisSayisi * 5;
            if (cari.bakiye === 0) puan += 50;
            if (cari.bakiye > 0) puan -= 20;
            puan = Math.max(0, puan);
            const seviye = seviyeHesapla(puan);
            await supabase.from("firmalar").update({ puan, musteri_seviyesi: seviye }).eq("id", firmaId);
        }
        toast.success(`${seciliCariler.size} müşterinin puanı güncellendi`);
        setSeciliCariler(new Set());
        verileriGetir(aktifSirket.id);
        setPuanGuncelleniyor(false);
    };

    // Puan ve seviye fonksiyonları
    const seviyeHesapla = (puan: number): string => {
        if (puan >= 301) return "PLATİN";
        if (puan >= 151) return "ALTIN";
        if (puan >= 51) return "GÜMÜŞ";
        return "BRONZ";
    };

    const seviyeBadge = (seviye: string) => {
        const map: Record<string, { cls: string; icon: string }> = {
            "PLATİN": { cls: "bg-purple-50 text-purple-700 border-purple-200", icon: "fa-gem" },
            "ALTIN": { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: "fa-crown" },
            "GÜMÜŞ": { cls: "bg-slate-100 text-slate-600 border-slate-300", icon: "fa-medal" },
            "BRONZ": { cls: "bg-orange-50 text-orange-600 border-orange-200", icon: "fa-award" },
        };
        return map[seviye] || map["BRONZ"];
    };

    const puanlariGuncelle = async () => {
        if (!aktifSirket) return;
        setPuanGuncelleniyor(true);
        const sirketId = aktifSirket.id;
        const { data: firmaData } = await supabase.from("firmalar").select("id, bakiye").eq("sahip_sirket_id", sirketId);
        if (!firmaData) { setPuanGuncelleniyor(false); return; }

        for (const firma of firmaData) {
            const firmaId = firma.id;
            const bakiye = parseTutar(firma.bakiye);
            // Sipariş verileri
            const { data: sipData } = await supabase.from("siparisler").select("toplam_tutar").eq("alici_firma_id", firmaId).neq("durum", "IPTAL");
            const siparisSayisi = sipData?.length || 0;
            const toplamTutar = (sipData || []).reduce((a, s) => a + parseTutar(s.toplam_tutar), 0);
            // Puan hesapla
            let puan = 0;
            puan += Math.floor(toplamTutar / 1000); // Her 1000 TL = 1 puan
            puan += siparisSayisi * 5; // Her sipariş = 5 puan
            if (bakiye === 0) puan += 50; // Bakiye sıfır = 50 bonus
            if (bakiye > 0) puan -= 20; // Borç varsa -20
            puan = Math.max(0, puan);
            const seviye = seviyeHesapla(puan);
            await supabase.from("firmalar").update({ puan, musteri_seviyesi: seviye }).eq("id", firmaId);
        }
        toast.success(`${firmaData.length} müşterinin puanı güncellendi`);
        verileriGetir(sirketId);
        setPuanGuncelleniyor(false);
    };

    const filtrelenmisUrunler = urunListesi.filter(u => !ozelFiyatArama.trim() || u.urun_adi.toLowerCase().includes(ozelFiyatArama.toLowerCase()));

    const filtrelenmisCariler = cariler
        .filter(c => c.isim.toLowerCase().includes(aramaMetni.toLowerCase()))
        .filter(c => seviyeFiltre === "TUMU" || c.musteri_seviyesi === seviyeFiltre);
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
                            <div className="flex items-center gap-1">
                                {["TUMU", "PLATİN", "ALTIN", "GÜMÜŞ", "BRONZ"].map(s => {
                                    const badge = s !== "TUMU" ? seviyeBadge(s) : null;
                                    return <button key={s} onClick={() => setSeviyeFiltre(s)} className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider border transition-colors ${seviyeFiltre === s ? "bg-[#0f172a] text-white border-[#0f172a]" : badge ? `${badge.cls}` : "bg-white text-[#64748b] border-[#e2e8f0]"}`}>
                                        {s === "TUMU" ? "Tümü" : s}
                                    </button>;
                                })}
                            </div>
                            <button onClick={puanlariGuncelle} disabled={puanGuncelleniyor} className="btn-secondary flex items-center text-[10px]" title="Tüm müşteri puanlarını yeniden hesapla">
                                {puanGuncelleniyor ? <i className="fas fa-circle-notch fa-spin mr-1"></i> : <i className="fas fa-sync mr-1"></i>} Puanları Güncelle
                            </button>
                            <div className="relative w-48 sm:w-64">
                                <input type="text" value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} placeholder="Cari Adı Ara..." className="input-kurumsal pr-8" />
                                <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            </div>
                            <div className="relative">
                                <button onClick={() => setCariExportMenu(!cariExportMenu)} className="btn-secondary flex items-center text-[10px]"><i className="fas fa-download mr-1" /> Dışa Aktar</button>
                                {cariExportMenu && (
                                    <div className="absolute top-full right-0 mt-1 bg-white border border-[#e2e8f0] shadow-lg z-20 w-36" onClick={() => setCariExportMenu(false)}>
                                        <button onClick={() => { const cols = [{header:"Müşteri Adı",key:"isim",width:30},{header:"Tip",key:"tip",width:12},{header:"Bakiye",key:"bakiye",width:15},{header:"Telefon",key:"telefon",width:15},{header:"Seviye",key:"musteri_seviyesi",width:12},{header:"Puan",key:"puan",width:8}]; excelExport(filtrelenmisCariler as unknown as Record<string,unknown>[], cols, "cari_kartlar"); }} className="w-full px-3 py-2 text-left text-[11px] font-semibold hover:bg-[#f8fafc] flex items-center gap-2"><i className="fas fa-file-excel text-[#059669]" /> Excel</button>
                                        <button onClick={() => { const cols = [{header:"Müşteri Adı",key:"isim",width:30},{header:"Tip",key:"tip",width:12},{header:"Bakiye",key:"bakiye",width:15},{header:"Telefon",key:"telefon",width:15},{header:"Seviye",key:"musteri_seviyesi",width:12},{header:"Puan",key:"puan",width:8}]; pdfExport(filtrelenmisCariler as unknown as Record<string,unknown>[], cols, "cari_kartlar", "Cari Kartlar Listesi"); }} className="w-full px-3 py-2 text-left text-[11px] font-semibold hover:bg-[#f8fafc] flex items-center gap-2"><i className="fas fa-file-pdf text-[#dc2626]" /> PDF</button>
                                    </div>
                                )}
                            </div>
                            <button onClick={yeniCariEkraniAc} className="btn-primary flex items-center">
                                <i className="fas fa-plus mr-1.5"></i> Yeni Kayıt
                            </button>
                        </>
                    )}
                </div>

                {/* CARİ LİSTESİ TABLOSU */}
                {/* TOPLU İŞLEM BARI */}
                {sayfaSekme === "cariler" && seciliCariler.size > 0 && (
                    <div className="flex items-center gap-2 px-4 py-1.5 shrink-0 flex-wrap" style={{ background: "#eff6ff", borderBottom: "1px solid #bfdbfe" }}>
                        <span className="text-[11px] font-bold text-[#1d4ed8]"><i className="fas fa-check-square mr-1" />{seciliCariler.size} cari seçildi</span>
                        <button onClick={topluPuanGuncelle} disabled={puanGuncelleniyor} className="px-2 py-1 text-[9px] font-bold bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 transition-colors"><i className="fas fa-sync mr-1" />Puanları Güncelle</button>
                        <button onClick={topluCariSil} className="px-2 py-1 text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"><i className="fas fa-trash mr-1" />Sil</button>
                        <button onClick={() => setSeciliCariler(new Set())} className="ml-auto text-[9px] text-[#64748b] hover:text-[#0f172a]"><i className="fas fa-times mr-1" />Seçimi Kaldır</button>
                    </div>
                )}

                {sayfaSekme === "cariler" && <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    {/* MOBİL KART GÖRÜNÜMÜ */}
                    <div className="md:hidden space-y-2 p-3">
                        {filtrelenmisCariler.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 font-semibold">Listelenecek Müşteri/Cari Bulunamadı.</div>
                        ) : (
                            filtrelenmisCariler.map((cari) => (
                                <div key={cari.id} className="bg-white border border-slate-200 p-3 hover:bg-slate-50">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[12px] font-semibold text-[#0f172a]">{cari.isim}</span>
                                            {cari.musteri_seviyesi && (() => { const b = seviyeBadge(cari.musteri_seviyesi); return <span className={`${b.cls} border text-[7px] font-bold px-1 py-0`} title={`${cari.puan || 0} puan`}><i className={`fas ${b.icon} mr-0.5 text-[6px]`} />{cari.musteri_seviyesi}</span>; })()}
                                        </div>
                                        <span className={`px-2 py-0.5 text-[9px] font-semibold uppercase ${cari.tip === 'firma' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'}`}>
                                            {cari.tip === 'firma' ? 'B2B Firma' : 'Bireysel'}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-[#64748b]">{cari.telefon || 'Telefon bilgisi yok'}</div>
                                    <div className="flex justify-between items-center mt-2">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => cariHareketleriGetir(cari)} className="btn-secondary flex items-center text-[10px]">
                                                <i className="fas fa-list-alt mr-1"></i> Ekstre
                                            </button>
                                            <button onClick={() => cariDuzenleAc(cari)} className="btn-secondary text-[#1d4ed8] text-[10px]" style={{ borderColor: "#bfdbfe" }} title="Düzenle">
                                                <i className="fas fa-edit"></i>
                                            </button>
                                            <button onClick={() => cariSil(cari)} className="btn-secondary text-[#dc2626] text-[10px]" style={{ borderColor: "#fecaca" }} title="Cariyi Sil">
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                        <span className={`text-[12px] font-semibold tabular-nums ${cari.bakiye > 0 ? 'text-[#dc2626]' : (cari.bakiye < 0 ? 'text-[#059669]' : 'text-slate-500')}`}>
                                            {formatTutar(cari.bakiye)} ₺
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {/* MASAÜSTÜ TABLO GÖRÜNÜMÜ */}
                    <div className="hidden md:block card-kurumsal overflow-hidden">
                        <table className="tbl-kurumsal min-w-[700px]">
                            <thead>
                                <tr>
                                    <th className="w-8 text-center"><input type="checkbox" checked={filtrelenmisCariler.length > 0 && filtrelenmisCariler.every(c => seciliCariler.has(c.id))} onChange={tumCarileriSec} className="cursor-pointer" /></th>
                                    <th className="w-12 text-center">No</th>
                                    <th>Cari Ünvanı / Müşteri Adı</th>
                                    <th className="w-28 text-center">Tipi</th>
                                    <th className="w-32 text-right">Güncel Bakiye</th>
                                    <th className="w-40 text-center">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrelenmisCariler.length === 0 ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-semibold">Listelenecek Müşteri/Cari Bulunamadı.</td></tr>
                                ) : (
                                    filtrelenmisCariler.map((cari, idx) => (
                                        <tr key={cari.id} className="group bg-white hover:bg-slate-50">
                                            <td className="text-center"><input type="checkbox" checked={seciliCariler.has(cari.id)} onChange={() => cariSecimToggle(cari.id)} className="cursor-pointer" /></td>
                                            <td className="text-center text-slate-400 font-semibold">{idx + 1}</td>
                                            <td className="font-semibold text-slate-800 group-hover:text-[#1d4ed8]">
                                                <div className="flex items-center gap-1.5">
                                                    {cari.isim}
                                                    {cari.musteri_seviyesi && (() => { const b = seviyeBadge(cari.musteri_seviyesi); return <span className={`${b.cls} border text-[7px] font-bold px-1 py-0 shrink-0`} title={`${cari.puan || 0} puan · Sipariş tutarı, sipariş sayısı ve ödeme durumuna göre hesaplanır`}><i className={`fas ${b.icon} mr-0.5 text-[6px]`} />{cari.musteri_seviyesi} ({cari.puan})</span>; })()}
                                                </div>
                                            </td>
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
                                                    <button onClick={() => cariDuzenleAc(cari)} className="btn-secondary text-[#1d4ed8] opacity-0 group-hover:opacity-100" style={{ borderColor: "#bfdbfe" }} title="Düzenle">
                                                        <i className="fas fa-edit"></i>
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
                                                <tr key={istek.id} className="bg-white hover:bg-slate-50">
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
                    <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl md:rounded overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>

                        <div className="p-3 flex justify-between items-center shrink-0 gap-2" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <div className="flex items-center gap-2">
                                <button onClick={cariKaydet} disabled={islemBekliyor} className="btn-primary flex items-center disabled:opacity-50 text-sm md:text-xs h-10 md:h-auto px-3">
                                    <i className="fas fa-save mr-1.5"></i> {duzenleCarId ? "Güncelle" : "Kaydet"}
                                </button>
                                {!duzenleCarId && (
                                    <button disabled className="btn-secondary flex items-center opacity-50 text-sm md:text-xs h-10 md:h-auto px-3">
                                        <i className="fas fa-trash-alt mr-1.5"></i> Sil
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setYeniCariModalAcik(false)} className="btn-secondary text-[#dc2626] flex items-center text-sm md:text-xs h-10 md:h-auto px-3"><i className="fas fa-times mr-1"></i> Kapat</button>
                        </div>

                        <div className="p-3 shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                                <div className="flex-1 space-y-2 md:space-y-1.5">
                                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                                        <label className="text-left md:text-right md:w-24 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Kodu</label>
                                        <input type="text" disabled value={yeniCari.kodu} className="input-kurumsal w-full md:w-32 h-10 md:h-auto text-sm md:text-xs bg-amber-50 font-semibold text-[#1d4ed8]" />
                                    </div>
                                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                                        <label className="text-left md:text-right md:w-24 md:pr-2 text-[#dc2626] font-semibold text-xs md:text-[11px]">Cari Adı / Ünvan</label>
                                        <input type="text" autoFocus value={yeniCari.isim} onChange={(e) => setYeniCari({...yeniCari, isim: e.target.value.toUpperCase()})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs uppercase font-semibold text-slate-800" />
                                    </div>
                                </div>
                                <div className="w-full md:w-80 space-y-2 md:space-y-1.5">
                                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                                        <label className="text-left md:text-right md:w-24 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Döviz Cinsi</label>
                                        <select disabled className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs" style={{ background: "#f8fafc" }}><option>TL</option></select>
                                    </div>
                                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0">
                                        <label className="text-left md:text-right md:w-24 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Cari Tipi</label>
                                        <select value={yeniCari.tip} onChange={(e) => setYeniCari({...yeniCari, tip: e.target.value as 'firma' | 'cari'})} disabled={!!duzenleCarId} className={`input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs font-semibold text-slate-800 ${duzenleCarId ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <option value="firma">B2B Kurumsal Firma</option>
                                            <option value="cari">Bireysel Müşteri</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="hidden md:flex w-24 h-24 bg-white flex-col items-center justify-center text-slate-400 shrink-0" style={{ border: "1px solid var(--c-border)" }}>
                                    <i className="fas fa-camera text-2xl mb-1"></i>
                                    <span className="text-[9px] text-center px-1 leading-tight">Resim Dosyası Yok</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex px-2 pt-2 shrink-0 overflow-x-auto" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <button onClick={() => setAktifSekme('genel')} className={`whitespace-nowrap text-sm md:text-xs ${aktifSekme === 'genel' ? 'btn-primary -mb-[1px]' : 'btn-secondary -mb-[1px]'}`}>1: Genel Bilgiler</button>
                            <button onClick={() => setAktifSekme('iletisim')} className={`whitespace-nowrap text-sm md:text-xs ${aktifSekme === 'iletisim' ? 'btn-primary -mb-[1px]' : 'btn-secondary -mb-[1px]'}`}>2: İletişim ve Adres</button>
                        </div>

                        <div className="flex-1 bg-white p-4 overflow-y-auto">
                            {aktifSekme === 'genel' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 max-w-4xl">
                                    <div className="space-y-3 md:space-y-2">
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Vergi Dairesi</label><input type="text" value={yeniCari.vergiDairesi} onChange={e=>setYeniCari({...yeniCari, vergiDairesi: e.target.value.toUpperCase()})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs uppercase" /></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">V.D. No / T.C.</label><input type="text" value={yeniCari.vergiNo} onChange={e=>setYeniCari({...yeniCari, vergiNo: e.target.value})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs" /></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0 pt-4" style={{ borderTop: "1px dashed var(--c-border)" }}><label className="text-left md:text-right md:w-28 md:pr-2 text-orange-600 font-semibold text-xs md:text-[11px]">Açılış Bakiyesi</label><input type="number" min="0" value={yeniCari.bakiye} onChange={e=>setYeniCari({...yeniCari, bakiye: e.target.value})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs font-semibold text-right" style={{ background: "#f8fafc" }} placeholder="0.00" /></div>
                                        <div className="flex justify-end"><span className="text-[10px] md:text-[9px] text-slate-400">* Geçmişten devreden alacağınız varsa buraya yazınız.</span></div>
                                    </div>
                                    <div className="space-y-3 md:space-y-2">
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Grubu</label><select className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs"><option></option></select></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Sektörü</label><select className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs"><option></option></select></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Çalışma Şekli</label><select className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs"><option>Kredi</option><option>Peşin</option></select></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Vade (Gün)</label><input type="number" min="0" defaultValue="0" className="input-kurumsal w-full md:w-16 h-10 md:h-auto text-sm md:text-xs text-right" /></div>
                                    </div>
                                </div>
                            )}

                            {aktifSekme === 'iletisim' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 max-w-4xl">
                                    <div className="space-y-3 md:space-y-2">
                                        <div className="flex flex-col md:flex-row md:items-start gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 md:mt-1 text-slate-500 font-semibold text-xs md:text-[11px]">Açık Adres</label><textarea value={yeniCari.adres} onChange={e=>setYeniCari({...yeniCari, adres: e.target.value})} className="input-kurumsal w-full md:flex-1 h-20 md:h-16 text-sm md:text-xs resize-none" /></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">İl</label><input type="text" value={yeniCari.il} onChange={e=>setYeniCari({...yeniCari, il: e.target.value.toUpperCase()})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs uppercase" /></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">İlçe</label><input type="text" value={yeniCari.ilce} onChange={e=>setYeniCari({...yeniCari, ilce: e.target.value.toUpperCase()})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs uppercase" /></div>
                                    </div>
                                    <div className="space-y-3 md:space-y-2">
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Telefon 1 (Gsm)</label><input type="text" value={yeniCari.telefon} onChange={e=>setYeniCari({...yeniCari, telefon: e.target.value})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs" placeholder="05XX XXX XX XX" /></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">Telefon 2</label><input type="text" value={yeniCari.telefon2} onChange={e=>setYeniCari({...yeniCari, telefon2: e.target.value})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs" /></div>
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-0"><label className="text-left md:text-right md:w-28 md:pr-2 text-slate-500 font-semibold text-xs md:text-[11px]">E-Mail</label><input type="email" value={yeniCari.email} onChange={e=>setYeniCari({...yeniCari, email: e.target.value})} className="input-kurumsal w-full md:flex-1 h-10 md:h-auto text-sm md:text-xs" /></div>
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

                        {/* SEKME BAR */}
                        <div className="px-4 py-2 flex gap-2 shrink-0 flex-wrap" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                            <button onClick={() => setDetaySekme("hareketler")} className={`text-[11px] font-semibold px-3 py-1.5 border-b-2 transition-colors ${detaySekme === "hareketler" ? "text-[#0f172a] border-[#0f172a]" : "text-[#94a3b8] border-transparent hover:text-[#64748b]"}`}>
                                <i className="fas fa-list mr-1 text-[9px]" /> Hareketler
                            </button>
                            {seciliCari.tip === "firma" && (
                                <button onClick={() => { setDetaySekme("ozel-fiyat"); ozelFiyatlariGetir(seciliCari.gercekId); }} className={`text-[11px] font-semibold px-3 py-1.5 border-b-2 transition-colors ${detaySekme === "ozel-fiyat" ? "text-[#0f172a] border-[#0f172a]" : "text-[#94a3b8] border-transparent hover:text-[#64748b]"}`}>
                                    <i className="fas fa-tags mr-1 text-[9px]" /> Özel Fiyatlar
                                </button>
                            )}
                            {seciliCari.tip === "firma" && (
                                <button onClick={() => { setDetaySekme("ziyaretler"); ziyaretleriGetir(seciliCari.gercekId); }} className={`text-[11px] font-semibold px-3 py-1.5 border-b-2 transition-colors ${detaySekme === "ziyaretler" ? "text-[#0f172a] border-[#0f172a]" : "text-[#94a3b8] border-transparent hover:text-[#64748b]"}`}>
                                    <i className="fas fa-route mr-1 text-[9px]" /> Ziyaretler
                                </button>
                            )}
                            {detaySekme === "hareketler" && (
                                <div className="flex gap-2 ml-4">
                                    <button onClick={() => setFiltre('TUMU')} className={filtre === 'TUMU' ? 'btn-primary' : 'btn-secondary'}><i className="fas fa-list mr-1"></i> Tümü</button>
                                    <button onClick={() => setFiltre('SIPARIS')} className={filtre === 'SIPARIS' ? 'btn-primary' : 'btn-secondary'}><i className="fas fa-box-open mr-1"></i> Siparişler</button>
                                    <button onClick={() => setFiltre('ODEME')} className={filtre === 'ODEME' ? 'btn-primary' : 'btn-secondary'}><i className="fas fa-money-bill-wave mr-1"></i> Ödemeler</button>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto bg-white p-4 custom-scrollbar">
                            {/* HAREKETLER SEKMESİ */}
                            {detaySekme === "hareketler" && (
                                <>
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
                                                                <tr key={h.id} className="bg-white hover:bg-slate-50">
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
                                </>
                            )}

                            {/* ÖZEL FİYATLAR SEKMESİ */}
                            {detaySekme === "ozel-fiyat" && (
                                <>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="flex-1 relative">
                                            <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8]" />
                                            <input type="text" value={ozelFiyatArama} onChange={e => setOzelFiyatArama(e.target.value)} placeholder="Ürün ara..." className="input-kurumsal w-full pl-7 text-[11px] h-8" />
                                        </div>
                                        <button onClick={ozelFiyatTopluKaydet} disabled={ozelFiyatKaydediliyor} className="btn-primary text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                                            {ozelFiyatKaydediliyor ? <i className="fas fa-circle-notch fa-spin text-[9px]" /> : <i className="fas fa-save text-[9px]" />}
                                            Tümünü Kaydet
                                        </button>
                                    </div>
                                    {ozelFiyatYukleniyor ? (
                                        <div className="flex items-center justify-center py-12"><i className="fas fa-circle-notch fa-spin text-[#475569]" /></div>
                                    ) : (
                                        <div className="card-kurumsal overflow-hidden">
                                            <table className="tbl-kurumsal">
                                                <thead>
                                                    <tr>
                                                        <th>Ürün Adı</th>
                                                        <th>Birim</th>
                                                        <th className="text-right">Normal Fiyat</th>
                                                        <th className="text-right w-40">Özel Fiyat</th>
                                                        <th className="text-center w-20">Durum</th>
                                                        <th className="text-center w-16"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filtrelenmisUrunler.length === 0 ? (
                                                        <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-semibold uppercase text-xs">Ürün bulunamadı</td></tr>
                                                    ) : filtrelenmisUrunler.map(u => {
                                                        const mevcutOzel = ozelFiyatlar.find(of => of.urun_id === u.id);
                                                        const duzenleme = ozelFiyatDuzenlemeler[u.id] || "";
                                                        return (
                                                            <tr key={u.id}>
                                                                <td className="font-semibold text-[#0f172a]">{u.urun_adi}</td>
                                                                <td className="text-[#64748b]">{u.birim}</td>
                                                                <td className="text-right tabular-nums text-[#475569]">{parseTutar(u.satis_fiyati).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</td>
                                                                <td className="text-right p-1">
                                                                    <input type="number" value={duzenleme} onChange={e => setOzelFiyatDuzenlemeler({ ...ozelFiyatDuzenlemeler, [u.id]: e.target.value })} className="input-kurumsal w-full text-right text-[12px] font-semibold" placeholder="—" step="0.01" min="0" />
                                                                </td>
                                                                <td className="text-center">
                                                                    {mevcutOzel ? (
                                                                        <span className="bg-emerald-50 text-[#059669] border border-emerald-200 text-[9px] font-semibold px-1.5 py-0.5">Özel Fiyat</span>
                                                                    ) : (
                                                                        <span className="text-[9px] text-[#94a3b8]">Normal</span>
                                                                    )}
                                                                </td>
                                                                <td className="text-center">
                                                                    <button onClick={() => ozelFiyatKaydet(u.id)} disabled={ozelFiyatKaydediliyor} className="text-[9px] font-semibold px-2 py-1 text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors" title="Kaydet">
                                                                        <i className="fas fa-check text-[8px]" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ZİYARETLER SEKMESİ */}
                            {detaySekme === "ziyaretler" && (
                                <>
                                    <div className="flex items-center gap-3 mb-3">
                                        <button onClick={() => {
                                            setZFormTarih(new Date().toISOString().split("T")[0]);
                                            setZFormSaat(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
                                            setZFormPersonel(kullanici?.ad_soyad || "");
                                            setZFormNot(""); setZFormSonuc("BILGI_VERILDI");
                                            setZiyaretModalAcik(true);
                                        }} className="btn-primary text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                                            <i className="fas fa-plus text-[9px]" /> Yeni Ziyaret Ekle
                                        </button>
                                        <span className="text-[10px] text-[#94a3b8]">{ziyaretler.length} kayıt</span>
                                    </div>
                                    {ziyaretYukleniyor ? (
                                        <div className="flex items-center justify-center py-12"><i className="fas fa-circle-notch fa-spin text-[#475569]" /></div>
                                    ) : ziyaretler.length === 0 ? (
                                        <div className="text-center py-12">
                                            <i className="fas fa-route text-[28px] text-[#e2e8f0] mb-2" />
                                            <div className="text-[11px] text-[#94a3b8] font-medium">Ziyaret kaydı bulunamadı</div>
                                        </div>
                                    ) : (
                                        <div className="card-kurumsal overflow-hidden">
                                            <table className="tbl-kurumsal">
                                                <thead>
                                                    <tr>
                                                        <th className="w-28">Tarih</th>
                                                        <th className="w-16 text-center">Saat</th>
                                                        <th>Personel</th>
                                                        <th className="text-center">Sonuç</th>
                                                        <th>Not</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {ziyaretler.map(z => {
                                                        const badge = ziyaretSonucBadge(z.sonuc);
                                                        return (
                                                            <tr key={z.id}>
                                                                <td className="font-medium text-[#475569]">{new Date(z.ziyaret_tarihi).toLocaleDateString("tr-TR")}</td>
                                                                <td className="text-center text-[#64748b]">{z.ziyaret_saati?.slice(0, 5) || "—"}</td>
                                                                <td className="font-semibold text-[#0f172a]">{z.personel_adi || "—"}</td>
                                                                <td className="text-center"><span className={`badge-durum ${badge.cls}`}>{badge.label}</span></td>
                                                                <td className="text-[#475569]">{z.ziyaret_notu || "—"}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Yeni Ziyaret Modalı */}
                                    {ziyaretModalAcik && (
                                        <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4" onClick={() => setZiyaretModalAcik(false)}>
                                            <div className="bg-white w-full max-w-md" onClick={e => e.stopPropagation()}>
                                                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                                    <div className="text-[13px] font-semibold text-[#0f172a]">Yeni Ziyaret Kaydı</div>
                                                    <button onClick={() => setZiyaretModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                                                </div>
                                                <div className="p-5 space-y-3">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Tarih</label>
                                                            <input type="date" value={zFormTarih} onChange={e => setZFormTarih(e.target.value)} className="input-kurumsal w-full" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Saat</label>
                                                            <input type="time" value={zFormSaat} onChange={e => setZFormSaat(e.target.value)} className="input-kurumsal w-full" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Personel Adı</label>
                                                        <input type="text" value={zFormPersonel} onChange={e => setZFormPersonel(e.target.value)} className="input-kurumsal w-full" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Sonuç *</label>
                                                        <select value={zFormSonuc} onChange={e => setZFormSonuc(e.target.value)} className="input-kurumsal w-full">
                                                            <option value="SIPARIS_ALINDI">Sipariş Alındı</option>
                                                            <option value="BILGI_VERILDI">Bilgi Verildi</option>
                                                            <option value="GERI_DONUS">Geri Dönüş Yapılacak</option>
                                                            <option value="OLUMSUZ">Olumsuz</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Ziyaret Notu</label>
                                                        <textarea value={zFormNot} onChange={e => setZFormNot(e.target.value)} className="input-kurumsal w-full" rows={3} placeholder="Ziyaret detayları..." />
                                                    </div>
                                                </div>
                                                <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                                                    <button onClick={() => setZiyaretModalAcik(false)} className="btn-secondary text-[11px]">İptal</button>
                                                    <button onClick={ziyaretKaydet} disabled={ziyaretKaydediliyor} className="btn-primary text-[11px] flex items-center gap-1.5">
                                                        {ziyaretKaydediliyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-save text-[10px]" />}
                                                        Kaydet
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <OnayModal />
        </>
    );
}
