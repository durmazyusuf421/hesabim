"use client";
import React, { useEffect, useState } from "react";
import { supabase, siparisNoUret } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
import { bildirimEkle } from "@/app/lib/bildirim";
import { excelExport, pdfExport } from "@/app/lib/export";
import { useBirimler } from "@/app/lib/useBirimler";
interface Siparis {
    id: number;
    siparis_no: string;
    cari_adi: string;
    durum: string;
    toplam_tutar: number;
    tarih: string;
    created_at: string;
    red_sebebi?: string;
}
interface Firma { id: number; unvan: string; }
interface Urun { id: number; urun_adi: string; satis_fiyati: number | string; birim: string; barkod?: string; }
interface YeniKalem { urun_adi: string; miktar: number; birim: string; birim_fiyat: number; }
interface DetayKalem { id: number; urun_adi: string; miktar: number; birim_fiyat: number; }
interface DuzenleKalem { id: number; urun_adi: string; miktar: number; birim_fiyat: number; }

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
    const [seciliSiparisler, setSeciliSiparisler] = useState<Set<number>>(new Set());
    const [sipExportMenu, setSipExportMenu] = useState(false);

    // --- DETAY MODAL & İŞLEM MENÜSÜ STATELERİ ---
    const [detayModalAcik, setDetayModalAcik] = useState(false);
    const [detaySiparis, setDetaySiparis] = useState<Siparis | null>(null);
    const [detayKalemler, setDetayKalemler] = useState<DetayKalem[]>([]);
    const [detayYukleniyor, setDetayYukleniyor] = useState(false);

    // --- YENİ SİPARİŞ MODAL STATELERİ ---
    const [yeniModalAcik, setYeniModalAcik] = useState(false);
    const [firmalar, setFirmalar] = useState<Firma[]>([]);
    const [urunler, setUrunler] = useState<Urun[]>([]);
    const [seciliCariId, setSeciliCariId] = useState<string>("");
    const [siparisKalemleri, setSiparisKalemleri] = useState<YeniKalem[]>([{ urun_adi: "", miktar: 1, birim: "Adet", birim_fiyat: 0 }]);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [ozelFiyatMap, setOzelFiyatMap] = useState<Record<number, number>>({});
    const [plasiyerler, setPlasiyerler] = useState<{id:number;ad_soyad:string}[]>([]);
    const [seciliPlasiyerId, setSeciliPlasiyerId] = useState<string>("");
    const [dovizKurlari, setDovizKurlari] = useState<Record<string, number>>({});
    const { birimler: birimListesi } = useBirimler();
    // --- ŞABLON STATELERİ ---
    const [sablonModalAcik, setSablonModalAcik] = useState(false);
    const [sablonlar, setSablonlar] = useState<{id:number;sablon_adi:string;firma_id:number|null;kalem_sayisi?:number}[]>([]);
    const [sablonYukleniyor, setSablonYukleniyor] = useState(false);
    const [sablonKaydetAdi, setSablonKaydetAdi] = useState("");
    const [sablonKaydetModalAcik, setSablonKaydetModalAcik] = useState(false);
    const [sablonKaydediliyor, setSablonKaydediliyor] = useState(false);

    const [yazdirilacakFis, setYazdirilacakFis] = useState<{siparis: Siparis; kalemler: DetayKalem[]} | null>(null);
    const [yazdirilacakIrsaliye, setYazdirilacakIrsaliye] = useState<{siparis: Siparis; kalemler: DetayKalem[]} | null>(null);

    // --- DÜZENLE VE ONAYLA STATELERİ ---
    const [duzenleModuAcik, setDuzenleModuAcik] = useState(false);
    const [duzenleKalemler, setDuzenleKalemler] = useState<DuzenleKalem[]>([]);
    const [toptanciNotu, setToptanciNotu] = useState("");
    const [onayGonderiliyor, setOnayGonderiliyor] = useState(false);

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

            const [{ data: urunData }, { data: plasiyerData }] = await Promise.all([
                supabase.from("urunler").select("id, urun_adi, satis_fiyati, birim, barkod").eq("sahip_sirket_id", sirketId).order('urun_adi'),
                supabase.from("alt_kullanicilar").select("id, ad_soyad").eq("sirket_id", sirketId).eq("plasiyer", true).order('ad_soyad'),
            ]);
            if (urunData) setUrunler(urunData);
            setPlasiyerler(plasiyerData || []);
            // Döviz kurları
            const { data: kurData } = await supabase.from("doviz_kurlari").select("doviz_turu, kur").order("tarih", { ascending: false }).limit(10);
            const kurMap: Record<string, number> = {};
            (kurData || []).forEach(k => { if (!kurMap[k.doviz_turu]) kurMap[k.doviz_turu] = Number(k.kur); });
            setDovizKurlari(kurMap);

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

    // Özel fiyatları çek
    useEffect(() => {
        if (!aktifSirket || !seciliCariId) { setOzelFiyatMap({}); return; }
        supabase.from("ozel_fiyatlar").select("urun_id, ozel_fiyat").eq("sirket_id", aktifSirket.id).eq("firma_id", Number(seciliCariId)).eq("aktif", true)
            .then(({ data }) => {
                const map: Record<number, number> = {};
                (data || []).forEach(of => { map[of.urun_id] = Number(of.ozel_fiyat); });
                setOzelFiyatMap(map);
            });
    }, [aktifSirket, seciliCariId]);

    // --- YENİ SİPARİŞ FONKSİYONLARI ---
    const yeniSiparisAc = () => {
        setSeciliCariId("");
        setSeciliPlasiyerId("");
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
        const urun = urunler.find(u => u.id.toString() === urunId) as (typeof urunler[0] & { doviz_turu?: string; doviz_fiyati?: number }) | undefined;
        if (urun) {
            const ozelFiyat = ozelFiyatMap[urun.id];
            let fiyat = ozelFiyat || parseTutar(urun.satis_fiyati);
            // Dövizli ürünse TL'ye çevir
            if (!ozelFiyat && urun.doviz_turu && urun.doviz_turu !== "TRY" && Number(urun.doviz_fiyati) > 0 && dovizKurlari[urun.doviz_turu]) {
                fiyat = Number(urun.doviz_fiyati) * dovizKurlari[urun.doviz_turu];
            }
            setSiparisKalemleri(siparisKalemleri.map((k, i) => i === index ? {
                ...k, urun_adi: urun.urun_adi, birim: urun.birim || "Adet", birim_fiyat: Math.round(fiyat * 100) / 100
            } : k));
        }
    };

    const kalemToplamHesapla = () => siparisKalemleri.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);

    // Kampanya indirimi hesapla
    const [aktifKampanyalar, setAktifKampanyalar] = useState<{id:number;kampanya_adi:string;indirim_tipi:string;indirim_degeri:number;min_siparis_tutari:number}[]>([]);
    useEffect(() => {
        if (!aktifSirket) return;
        const bugun = new Date().toISOString().split("T")[0];
        supabase.from("kampanyalar").select("id,kampanya_adi,indirim_tipi,indirim_degeri,min_siparis_tutari").eq("sirket_id", aktifSirket.id).eq("aktif", true).lte("baslangic_tarihi", bugun).gte("bitis_tarihi", bugun).then(({ data }) => setAktifKampanyalar(data || []));
    }, [aktifSirket]);

    const kampanyaIndirimi = () => {
        const toplam = kalemToplamHesapla();
        let enIyiIndirim = 0;
        let enIyiKampanya = "";
        aktifKampanyalar.forEach(k => {
            if (toplam < (Number(k.min_siparis_tutari) || 0)) return;
            const indirim = k.indirim_tipi === "YUZDE" ? toplam * (k.indirim_degeri / 100) : Number(k.indirim_degeri);
            if (indirim > enIyiIndirim) { enIyiIndirim = indirim; enIyiKampanya = k.kampanya_adi; }
        });
        return { indirim: enIyiIndirim, kampanyaAdi: enIyiKampanya };
    };

    // --- ŞABLON FONKSİYONLARI ---
    const sablonlariGetir = async () => {
        if (!aktifSirket) return;
        setSablonYukleniyor(true);
        const { data } = await supabase.from("siparis_sablonlari").select("id, sablon_adi, firma_id").eq("sirket_id", aktifSirket.id).order("sablon_adi");
        if (data) {
            // Kalem sayılarını çek
            const sablonIds = data.map(s => s.id);
            const { data: kalemData } = sablonIds.length > 0 ? await supabase.from("siparis_sablon_kalemleri").select("sablon_id").in("sablon_id", sablonIds) : { data: [] };
            const kalemSayilari: Record<number, number> = {};
            (kalemData || []).forEach(k => { kalemSayilari[k.sablon_id] = (kalemSayilari[k.sablon_id] || 0) + 1; });
            setSablonlar(data.map(s => ({ ...s, kalem_sayisi: kalemSayilari[s.id] || 0 })));
        }
        setSablonYukleniyor(false);
    };

    const sablonYukle = async (sablonId: number) => {
        const sablon = sablonlar.find(s => s.id === sablonId);
        if (!sablon) return;
        const { data: kalemler } = await supabase.from("siparis_sablon_kalemleri").select("*").eq("sablon_id", sablonId);
        if (!kalemler || kalemler.length === 0) { toast.error("Şablonda kalem bulunamadı"); return; }

        const mevcutDolu = siparisKalemleri.some(k => k.urun_adi.trim());
        const yukle = () => {
            const yeniKalemler: YeniKalem[] = kalemler.map(k => ({
                urun_adi: k.urun_adi || "",
                miktar: Number(k.miktar) || 1,
                birim: k.birim || "Adet",
                birim_fiyat: Number(k.birim_fiyat) || 0,
            }));
            setSiparisKalemleri(yeniKalemler);
            if (sablon.firma_id) setSeciliCariId(String(sablon.firma_id));
            setSablonModalAcik(false);
            if (!yeniModalAcik) setYeniModalAcik(true);
            toast.success(`"${sablon.sablon_adi}" şablonu yüklendi`);
        };

        if (mevcutDolu) {
            onayla({
                baslik: "Şablon Yükle",
                mesaj: "Mevcut sipariş kalemleri silinecek ve şablondaki kalemlerle değiştirilecek.",
                onayMetni: "Devam Et",
                tehlikeli: false,
                onOnayla: yukle,
            });
        } else {
            yukle();
        }
    };

    const sablonSil = async (id: number) => {
        await supabase.from("siparis_sablon_kalemleri").delete().eq("sablon_id", id);
        await supabase.from("siparis_sablonlari").delete().eq("id", id);
        toast.success("Şablon silindi");
        sablonlariGetir();
    };

    const mevcutSiparisiSablonKaydet = async () => {
        if (!aktifSirket || !sablonKaydetAdi.trim()) { toast.error("Şablon adı giriniz"); return; }
        const gecerliKalemler = siparisKalemleri.filter(k => k.urun_adi.trim() && k.miktar > 0);
        if (gecerliKalemler.length === 0) { toast.error("Kaydedilecek kalem yok"); return; }
        setSablonKaydediliyor(true);
        const { data: sablonData, error } = await supabase.from("siparis_sablonlari").insert({
            sirket_id: aktifSirket.id,
            sablon_adi: sablonKaydetAdi.trim(),
            firma_id: seciliCariId ? Number(seciliCariId) : null,
        }).select().single();
        if (error || !sablonData) { toast.error("Şablon kaydedilemedi"); setSablonKaydediliyor(false); return; }

        const kalemVerileri = gecerliKalemler.map(k => {
            const urun = urunler.find(u => u.urun_adi === k.urun_adi);
            return {
                sablon_id: sablonData.id,
                urun_id: urun?.id || null,
                urun_adi: k.urun_adi,
                miktar: k.miktar,
                birim_fiyat: k.birim_fiyat,
                birim: k.birim,
            };
        });
        await supabase.from("siparis_sablon_kalemleri").insert(kalemVerileri);
        toast.success("Şablon kaydedildi");
        setSablonKaydetModalAcik(false);
        setSablonKaydetAdi("");
        setSablonKaydediliyor(false);
    };

    const siparisKaydet = async () => {
        if (!aktifSirket) return;
        if (!seciliCariId) { toast.error("Lütfen bir müşteri (cari) seçiniz!"); return; }
        const gecerliKalemler = siparisKalemleri.filter(k => k.urun_adi.trim() && k.miktar > 0 && k.birim_fiyat > 0);
        if (gecerliKalemler.length === 0) { toast.error("En az bir geçerli sipariş kalemi giriniz!"); return; }

        setKaydediliyor(true);
        try {
            const araTotal = gecerliKalemler.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);
            const { indirim } = kampanyaIndirimi();
            const toplam = Math.max(araTotal - indirim, 0);
            const siparisNo = await siparisNoUret("SIP");

            const seciliPlasiyer = plasiyerler.find(p => p.id === Number(seciliPlasiyerId));
            const { data: siparisData, error: siparisError } = await supabase.from("siparisler").insert([{
                siparis_no: siparisNo,
                satici_sirket_id: aktifSirket.id,
                alici_firma_id: Number(seciliCariId),
                durum: "Onay Bekliyor",
                toplam_tutar: toplam,
                ...(seciliPlasiyer ? { plasiyer_id: seciliPlasiyer.id, plasiyer_adi: seciliPlasiyer.ad_soyad } : {})
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
            await bildirimEkle(aktifSirket.id, "Yeni Sipariş Oluşturuldu", `${siparisNo} numaralı sipariş (₺${toplam.toLocaleString("tr-TR", {minimumFractionDigits:2})})`, "BASARI", "SIPARIS", siparisData.id);
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

    // --- DÜZENLE VE ONAYLA FONKSİYONLARI ---
    const duzenleModuBaslat = () => {
        setDuzenleKalemler(detayKalemler.map(k => ({ ...k })));
        setToptanciNotu("");
        setDuzenleModuAcik(true);
    };

    const duzenleKalemGuncelle = (index: number, alan: "miktar" | "birim_fiyat", deger: number) => {
        setDuzenleKalemler(prev => prev.map((k, i) => i === index ? { ...k, [alan]: deger } : k));
    };

    const onayaGonder = async () => {
        if (!aktifSirket || !detaySiparis) return;
        setOnayGonderiliyor(true);
        try {
            // siparis_kalemleri güncelle
            for (const kalem of duzenleKalemler) {
                await supabase.from("siparis_kalemleri").update({
                    miktar: kalem.miktar,
                    birim_fiyat: kalem.birim_fiyat
                }).eq("id", kalem.id);
            }

            // toplam_tutar hesapla
            const yeniToplam = duzenleKalemler.reduce((acc, k) => acc + (k.miktar * k.birim_fiyat), 0);

            // siparisi güncelle
            await supabase.from("siparisler").update({
                toptanci_onay: "ONAYLANDI",
                durum: "MARKET_ONAYI_BEKLENIYOR",
                toplam_tutar: yeniToplam,
                toptanci_notu: toptanciNotu || null
            }).eq("id", detaySiparis.id);

            toast.success("Sipariş düzenlendi ve market onayına gönderildi!");
            setDuzenleModuAcik(false);
            setDetayModalAcik(false);
            setSiparisler(prev => prev.map(s => s.id === detaySiparis.id ? { ...s, durum: "MARKET_ONAYI_BEKLENIYOR", toplam_tutar: yeniToplam } : s));
        } catch (error) {
            toast.error("Onaya gönderilirken hata: " + (error instanceof Error ? error.message : String(error)));
        }
        setOnayGonderiliyor(false);
    };

    // Toplu sipariş seçim fonksiyonları
    const sipSecimToggle = (id: number) => { const y = new Set(seciliSiparisler); if (y.has(id)) y.delete(id); else y.add(id); setSeciliSiparisler(y); };
    const topluSiparisSil = () => {
        onayla({ baslik: "Toplu Sil", mesaj: `${seciliSiparisler.size} siparişi silmek istediğinize emin misiniz?`, onayMetni: "Sil", tehlikeli: true, onOnayla: async () => {
            for (const id of seciliSiparisler) { await supabase.from("siparis_kalemleri").delete().eq("siparis_id", id); await supabase.from("siparisler").delete().eq("id", id); }
            toast.success(`${seciliSiparisler.size} sipariş silindi`); setSeciliSiparisler(new Set());
            if (aktifSirket) verileriGetir(aktifSirket.id);
        }});
    };
    const topluDurumDegistir = async (yeniDurum: string) => {
        for (const id of seciliSiparisler) await supabase.from("siparisler").update({ durum: yeniDurum }).eq("id", id);
        toast.success(`${seciliSiparisler.size} siparişin durumu "${yeniDurum}" olarak güncellendi`); setSeciliSiparisler(new Set());
        if (aktifSirket) verileriGetir(aktifSirket.id);
    };

    const filtrelenmisSiparisler = siparisler.filter(s =>
        (s.siparis_no || "").toLowerCase().includes(aramaTerimi.toLowerCase()) ||
        (s.cari_adi || "").toLowerCase().includes(aramaTerimi.toLowerCase())
    );

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "var(--c-bg)" }}>Sistem Doğrulanıyor...</div>;

    const getDurumBilgi = (durum: string): { cls: string; metin: string } => {
        switch (durum) {
            case "YENI": return { cls: "badge-durum badge-bekliyor", metin: "Yeni" };
            case "HAZIRLANIYOR": return { cls: "badge-durum badge-hazirlaniyor", metin: "Hazırlanıyor" };
            case "TAMAMLANDI": return { cls: "badge-durum badge-teslim", metin: "Tamamlandı" };
            case "IPTAL": return { cls: "badge-durum badge-iptal", metin: "Reddedildi" };
            case "Onay Bekliyor": return { cls: "badge-durum badge-bekliyor", metin: "Onay Bekliyor" };
            case "Onaylandı": return { cls: "badge-durum badge-teslim", metin: "Onaylandı" };
            case "MARKET_ONAYI_BEKLENIYOR": return { cls: "badge-durum badge-hazirlaniyor", metin: "Market Onayı Bekliyor" };
            default: return { cls: "badge-durum badge-bekliyor", metin: durum };
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
                            <button onClick={() => { sablonlariGetir(); setSablonModalAcik(true); }} className="btn-secondary whitespace-nowrap">
                                <i className="fas fa-copy mr-2"></i> Şablonlar
                            </button>
                            <button onClick={inceleButonuTikla} className="btn-secondary whitespace-nowrap">
                                <i className="fas fa-eye mr-2"></i> İncele / Detay
                            </button>
                            <button onClick={siparisSil} className="btn-secondary whitespace-nowrap text-[#dc2626]">
                                <i className="fas fa-trash-alt mr-2"></i> Sil
                            </button>
                            <button onClick={() => { if (!seciliSiparisId) { toast.error("Lütfen işlem yapılacak siparişi seçin."); return; } durumGuncelle("IPTAL"); }} className="btn-secondary whitespace-nowrap text-amber-600">
                                <i className="fas fa-times-circle mr-2"></i> İptal Et
                            </button>
                            <button onClick={() => window.print()} className="btn-secondary whitespace-nowrap">
                                <i className="fas fa-print mr-2"></i> Yazdır
                            </button>
                            <div className="relative">
                                <button onClick={() => setSipExportMenu(!sipExportMenu)} className="btn-secondary whitespace-nowrap"><i className="fas fa-download mr-2"></i> Dışa Aktar</button>
                                {sipExportMenu && (
                                    <div className="absolute top-full left-0 mt-1 bg-white border border-[#e2e8f0] shadow-lg z-20 w-36" onClick={() => setSipExportMenu(false)}>
                                        <button onClick={() => { const cols = [{header:"Fiş No",key:"siparis_no",width:15},{header:"Müşteri",key:"cari_adi",width:25},{header:"Durum",key:"durum",width:15},{header:"Tutar",key:"toplam_tutar",width:15},{header:"Tarih",key:"tarih",width:12},{header:"Plasiyer",key:"plasiyer_adi",width:15}]; const d = filtrelenmisSiparisler.map(s => ({siparis_no:s.siparis_no,cari_adi:s.cari_adi,durum:s.durum,toplam_tutar:s.toplam_tutar,tarih:s.created_at?new Date(s.created_at).toLocaleDateString("tr-TR"):"",plasiyer_adi:(s as unknown as Record<string,string>).plasiyer_adi||""})); excelExport(d, cols, "siparisler"); }} className="w-full px-3 py-2 text-left text-[11px] font-semibold hover:bg-[#f8fafc] flex items-center gap-2"><i className="fas fa-file-excel text-[#059669]" /> Excel</button>
                                        <button onClick={() => { const cols = [{header:"Fiş No",key:"siparis_no",width:15},{header:"Müşteri",key:"cari_adi",width:25},{header:"Durum",key:"durum",width:15},{header:"Tutar",key:"toplam_tutar",width:15},{header:"Tarih",key:"tarih",width:12},{header:"Plasiyer",key:"plasiyer_adi",width:15}]; const d = filtrelenmisSiparisler.map(s => ({siparis_no:s.siparis_no,cari_adi:s.cari_adi,durum:s.durum,toplam_tutar:s.toplam_tutar,tarih:s.created_at?new Date(s.created_at).toLocaleDateString("tr-TR"):"",plasiyer_adi:(s as unknown as Record<string,string>).plasiyer_adi||""})); pdfExport(d, cols, "siparisler", "Sipariş Listesi"); }} className="w-full px-3 py-2 text-left text-[11px] font-semibold hover:bg-[#f8fafc] flex items-center gap-2"><i className="fas fa-file-pdf text-[#dc2626]" /> PDF</button>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 max-w-lg relative ml-auto">
                                <input type="text" placeholder="Fiş No veya Cari Ünvanı ile arama yapın..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-full" />
                                <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                            </div>
                        </div>

                        {/* TOPLU İŞLEM BARI */}
                        {seciliSiparisler.size > 0 && (
                            <div className="flex items-center gap-2 px-4 py-1.5 shrink-0 flex-wrap" style={{ background: "#eff6ff", borderBottom: "1px solid #bfdbfe" }}>
                                <span className="text-[11px] font-bold text-[#1d4ed8]"><i className="fas fa-check-square mr-1" />{seciliSiparisler.size} sipariş seçildi</span>
                                <select onChange={e => { if (e.target.value) topluDurumDegistir(e.target.value); e.target.value = ""; }} className="input-kurumsal text-[10px] h-7 w-auto" defaultValue="">
                                    <option value="" disabled>Durum Değiştir...</option>
                                    <option value="TAMAMLANDI">Tamamlandı</option>
                                    <option value="HAZIRLANIYOR">Hazırlanıyor</option>
                                    <option value="IPTAL">İptal</option>
                                </select>
                                <button onClick={topluSiparisSil} className="px-2 py-1 text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"><i className="fas fa-trash mr-1" />Sil</button>
                                <button onClick={() => setSeciliSiparisler(new Set())} className="ml-auto text-[9px] text-[#64748b] hover:text-[#0f172a]"><i className="fas fa-times mr-1" />Seçimi Kaldır</button>
                            </div>
                        )}

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
                                                    <span className={getDurumBilgi(s.durum).cls}>{getDurumBilgi(s.durum).metin}</span>
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
                                        <th className="w-8 text-center"><input type="checkbox" checked={filtrelenmisSiparisler.length > 0 && filtrelenmisSiparisler.every(s => seciliSiparisler.has(s.id))} onChange={() => { if (seciliSiparisler.size === filtrelenmisSiparisler.length) setSeciliSiparisler(new Set()); else setSeciliSiparisler(new Set(filtrelenmisSiparisler.map(s => s.id))); }} className="cursor-pointer" /></th>
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
                                            const durumBilgi = getDurumBilgi(s.durum);
                                            return (
                                                <tr key={s.id} onClick={() => setSeciliSiparisId(s.id)} onDoubleClick={() => detayAc(s)} className={`cursor-pointer select-none ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500 text-slate-800' : 'bg-white hover:bg-slate-50'}`}>
                                                    <td className="text-center" onClick={e => e.stopPropagation()}>
                                                        <input type="checkbox" checked={seciliSiparisler.has(s.id)} onChange={() => sipSecimToggle(s.id)} className="cursor-pointer" />
                                                    </td>
                                                    <td className="font-bold text-slate-600">{s.siparis_no}</td>
                                                    <td className="font-bold text-slate-800">{s.cari_adi}</td>
                                                    <td className="text-center">
                                                        <span className={durumBilgi.cls}>{durumBilgi.metin}</span>
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
                                                            <button onClick={(e) => { e.stopPropagation(); durumGuncelle("IPTAL", s.id); }} className="w-6 h-6 bg-red-50 border border-red-200 text-[#dc2626] hover:bg-red-100 flex items-center justify-center transition-colors" title="İptal Et">
                                                                <i className="fas fa-times text-[9px]"></i>
                                                            </button>
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
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Plasiyer</label>
                                    <select value={seciliPlasiyerId} onChange={e => setSeciliPlasiyerId(e.target.value)} className="input-kurumsal w-full">
                                        <option value="">-- Plasiyer Seçiniz --</option>
                                        {plasiyerler.map(p => <option key={p.id} value={p.id}>{p.ad_soyad}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="px-4 pb-2">
                                <button onClick={kalemEkle} className="btn-primary">
                                    <i className="fas fa-plus mr-2"></i> Yeni Kalem Ekle
                                </button>
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
                                                <select value={kalem.birim} onChange={(e) => kalemGuncelle(index, 'birim', e.target.value)} className="input-kurumsal w-full text-center cursor-pointer">{birimListesi.map(b => <option key={b.id} value={b.kisaltma}>{b.kisaltma}</option>)}{kalem.birim && !birimListesi.some(b => b.kisaltma === kalem.birim) && <option value={kalem.birim}>{kalem.birim}</option>}</select>
                                            </td>
                                            <td>
                                                <input type="number" min={1} value={kalem.miktar} onChange={(e) => kalemGuncelle(index, 'miktar', Number(e.target.value))} className="input-kurumsal w-full text-center" />
                                            </td>
                                            <td>
                                                <div className="relative">
                                                    <input type="number" min={0} step={0.01} value={kalem.birim_fiyat} onChange={(e) => kalemGuncelle(index, 'birim_fiyat', Number(e.target.value))} className="input-kurumsal w-full text-right" />
                                                    {(() => { const u = urunler.find(ur => ur.urun_adi === kalem.urun_adi); return u && ozelFiyatMap[u.id] ? <span className="absolute -top-1.5 right-0 bg-emerald-50 text-[#059669] border border-emerald-200 text-[7px] font-bold px-1 py-0">Özel</span> : null; })()}
                                                </div>
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
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Ara Toplam</span>
                                        <p className="text-sm font-semibold text-[#475569]">{kalemToplamHesapla().toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</p>
                                    </div>
                                    {kampanyaIndirimi().indirim > 0 && (
                                        <div>
                                            <span className="text-[10px] font-bold text-[#7c3aed] uppercase"><i className="fas fa-tags mr-1 text-[8px]" />{kampanyaIndirimi().kampanyaAdi}</span>
                                            <p className="text-sm font-semibold text-[#dc2626]">-{kampanyaIndirimi().indirim.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</p>
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Genel Toplam</span>
                                        <p className="text-lg font-semibold text-[#1d4ed8]">{Math.max(kalemToplamHesapla() - kampanyaIndirimi().indirim, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setSablonKaydetAdi(""); setSablonKaydetModalAcik(true); }} className="btn-secondary text-[10px]" title="Bu siparişi şablon olarak kaydet">
                                    <i className="fas fa-copy mr-1"></i> Şablon Kaydet
                                </button>
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
                                    <span className={getDurumBilgi(detaySiparis.durum).cls}>{getDurumBilgi(detaySiparis.durum).metin}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {(detaySiparis.durum === "Onay Bekliyor" || detaySiparis.durum === "YENI") && !duzenleModuAcik && (
                                    <button onClick={duzenleModuBaslat} className="btn-primary" style={{ background: "#059669" }}>
                                        <i className="fas fa-edit mr-1.5"></i> Düzenle ve Onayla
                                    </button>
                                )}
                                <button onClick={() => fisYazdir(detaySiparis)} className="btn-primary">
                                    <i className="fas fa-receipt mr-1.5"></i> Fiş Yazdır
                                </button>
                                {(detaySiparis.durum === "TAMAMLANDI" || detaySiparis.durum === "HAZIRLANIYOR") && (
                                    <button onClick={() => irsaliyeYazdir(detaySiparis)} className="btn-primary">
                                        <i className="fas fa-truck mr-1.5"></i> İrsaliye Yazdır
                                    </button>
                                )}
                                <button onClick={() => { setDetayModalAcik(false); setDuzenleModuAcik(false); }} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times text-lg"></i></button>
                            </div>
                        </div>

                        {/* RED SEBEBİ UYARISI */}
                        {detaySiparis.durum === "IPTAL" && detaySiparis.red_sebebi && (
                            <div className="mx-4 mt-3 p-3 bg-red-50" style={{ border: "1px solid #fca5a5" }}>
                                <div className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1"><i className="fas fa-times-circle mr-1"></i> Market Red Sebebi:</div>
                                <div className="text-[12px] font-semibold text-red-800">{detaySiparis.red_sebebi}</div>
                            </div>
                        )}

                        <div className="flex-1 overflow-auto bg-white">
                            {duzenleModuAcik ? (
                                <>
                                    <div className="px-4 py-2 bg-emerald-50 text-[11px] font-semibold text-emerald-700 flex items-center gap-2" style={{ borderBottom: "1px solid #d1fae5" }}>
                                        <i className="fas fa-edit"></i> Düzenleme Modu — Miktar ve fiyatları güncelleyip onaya gönderin
                                    </div>
                                    <table className="tbl-kurumsal">
                                        <thead>
                                            <tr>
                                                <th className="w-8 text-center">#</th>
                                                <th>Ürün Adı</th>
                                                <th className="w-28 text-center">Miktar</th>
                                                <th className="w-36 text-right">Birim Fiyat (TL)</th>
                                                <th className="w-32 text-right">Tutar (TL)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {duzenleKalemler.map((k, i) => (
                                                <tr key={k.id} className="hover:bg-slate-50">
                                                    <td className="text-center text-slate-500 font-bold">{i + 1}</td>
                                                    <td className="font-bold text-slate-800">{k.urun_adi}</td>
                                                    <td className="p-0">
                                                        <input type="number" min={0} value={k.miktar} onChange={(e) => duzenleKalemGuncelle(i, "miktar", Number(e.target.value))} className="w-full h-full px-2 py-1 text-center font-semibold outline-none bg-transparent focus:bg-white focus:ring-1 focus:ring-emerald-400 input-kurumsal" />
                                                    </td>
                                                    <td className="p-0">
                                                        <input type="number" min={0} step={0.01} value={k.birim_fiyat} onChange={(e) => duzenleKalemGuncelle(i, "birim_fiyat", Number(e.target.value))} className="w-full h-full px-2 py-1 text-right font-semibold outline-none bg-transparent focus:bg-white focus:ring-1 focus:ring-emerald-400 input-kurumsal" />
                                                    </td>
                                                    <td className="text-right font-bold text-[#059669]">{(k.miktar * k.birim_fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="px-4 py-3">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Toptancı Notu (Opsiyonel)</label>
                                        <textarea value={toptanciNotu} onChange={(e) => setToptanciNotu(e.target.value)} placeholder="Markete iletmek istediğiniz not..." className="input-kurumsal w-full" rows={2} />
                                    </div>
                                </>
                            ) : (
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
                            )}
                        </div>

                        <div className="bg-[#f8fafc] p-3 flex justify-between items-center shrink-0" style={{ borderTop: "1px solid var(--c-border)" }}>
                            {duzenleModuAcik ? (
                                <>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setDuzenleModuAcik(false)} className="btn-secondary"><i className="fas fa-times text-[#dc2626] mr-1.5"></i> Vazgeç</button>
                                        <span className="text-xs font-bold text-slate-600">{duzenleKalemler.length} kalem</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="bg-white border px-4 py-2" style={{ borderColor: "var(--c-border)" }}>
                                            <span className="text-[10px] font-bold text-slate-500 uppercase mr-3">Yeni Toplam</span>
                                            <span className="text-lg font-semibold text-[#059669]">{duzenleKalemler.reduce((a, k) => a + k.miktar * k.birim_fiyat, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                                        </div>
                                        <button onClick={onayaGonder} disabled={onayGonderiliyor} className="btn-primary disabled:opacity-50" style={{ background: "#059669" }}>
                                            <i className="fas fa-paper-plane mr-1.5"></i> {onayGonderiliyor ? "Gönderiliyor..." : "Onaya Gönder"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <span className="text-xs font-bold text-slate-600">{detayKalemler.length} kalem</span>
                                    <div className="bg-white border px-4 py-2" style={{ borderColor: "var(--c-border)" }}>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase mr-3">Genel Toplam</span>
                                        <span className="text-lg font-semibold text-[#1d4ed8]">{parseTutar(detaySiparis.toplam_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                                    </div>
                                </>
                            )}
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
            {/* ŞABLONLAR MODALI */}
            {sablonModalAcik && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setSablonModalAcik(false)}>
                    <div className="bg-white w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]"><i className="fas fa-copy mr-2 text-[#3b82f6]" />Sipariş Şablonları</div>
                            <button onClick={() => setSablonModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {sablonYukleniyor ? (
                                <div className="flex items-center justify-center py-12"><i className="fas fa-circle-notch fa-spin text-[#475569]" /></div>
                            ) : sablonlar.length === 0 ? (
                                <div className="text-center py-12">
                                    <i className="fas fa-copy text-[28px] text-[#e2e8f0] mb-2" />
                                    <div className="text-[11px] text-[#94a3b8] font-medium">Kayıtlı şablon yok</div>
                                    <div className="text-[10px] text-[#cbd5e1] mt-1">Sipariş oluşturup &quot;Şablon Kaydet&quot; butonuyla kaydedin</div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sablonlar.map(s => {
                                        const firmaAdi = firmalar.find(f => f.id === s.firma_id)?.unvan;
                                        return (
                                            <div key={s.id} className="flex items-center gap-3 p-3 border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors">
                                                <div className="w-8 h-8 bg-[#f1f5f9] text-[#475569] flex items-center justify-center shrink-0"><i className="fas fa-copy text-[11px]" /></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-semibold text-[#0f172a]">{s.sablon_adi}</div>
                                                    <div className="text-[10px] text-[#94a3b8]">
                                                        {firmaAdi && <span className="mr-2">{firmaAdi}</span>}
                                                        {s.kalem_sayisi} kalem
                                                    </div>
                                                </div>
                                                <button onClick={() => sablonYukle(s.id)} className="text-[10px] font-semibold px-3 py-1.5 bg-[#0f172a] text-white hover:bg-[#1e293b] transition-colors">
                                                    <i className="fas fa-download text-[8px] mr-1" /> Yükle
                                                </button>
                                                <button onClick={() => sablonSil(s.id)} className="text-[10px] font-semibold px-2 py-1.5 text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors">
                                                    <i className="fas fa-trash text-[8px]" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ŞABLON KAYDET MODALI */}
            {sablonKaydetModalAcik && (
                <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onClick={() => setSablonKaydetModalAcik(false)}>
                    <div className="bg-white w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Şablon Olarak Kaydet</div>
                            <button onClick={() => setSablonKaydetModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Şablon Adı *</label>
                                <input type="text" value={sablonKaydetAdi} onChange={e => setSablonKaydetAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Örn: Haftalık Market Siparişi" autoFocus />
                            </div>
                            <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0]">
                                <div className="text-[10px] text-[#475569]">
                                    <span className="font-semibold">{siparisKalemleri.filter(k => k.urun_adi.trim()).length}</span> kalem kaydedilecek
                                    {seciliCariId && <span className="ml-2">· Müşteri: <span className="font-semibold">{firmalar.find(f => f.id === Number(seciliCariId))?.unvan}</span></span>}
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                            <button onClick={() => setSablonKaydetModalAcik(false)} className="btn-secondary text-[11px]">İptal</button>
                            <button onClick={mevcutSiparisiSablonKaydet} disabled={sablonKaydediliyor} className="btn-primary text-[11px] flex items-center gap-1.5">
                                {sablonKaydediliyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-save text-[10px]" />}
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <OnayModal />
        </>
    );
}