"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Line, ComposedChart } from "recharts";
import { excelExport, pdfExport } from "@/app/lib/export";

interface SiparisRaw { id: number; toplam_tutar: string | number | null; durum: string; created_at?: string; alici_firma_id?: number; }
interface CariHareketRaw { id: number; borc: number; alacak: number; tarih: string; }
interface FirmaRaw { id: number; unvan: string; bakiye?: number; }
interface BankaHareketiRaw { id: number; islem_tipi: string; tutar: number; tarih: string; }
interface CekSenetRaw { id: number; yon: string; tutar: number; durum: string; vade_tarihi: string; }
interface SiparisKalemiRaw { id: number; alis_fiyati: number; miktar: number; siparis_id: number; kdv_orani?: number; birim_fiyat?: number; }

type Sekme = "genel" | "kar-zarar" | "kdv" | "plasiyer" | "masraf" | "gelir-tablosu" | "yevmiye" | "mizan" | "bilanco";
interface MasrafRaw { id: number; masraf_kategorisi: string; tutar: number; kdv_tutari: number; tarih: string; }
interface FaturaRaw2 { id: number; tip: string; genel_toplam: number; tarih: string; }
interface YevmiyeRaw { id: number; tarih: string; fis_no: string; aciklama: string; hesap_kodu: string; hesap_adi: string; borc: number; alacak: number; kaynak: string; }
interface MizanSatir { hesap_kodu: string; hesap_adi: string; toplamBorc: number; toplamAlacak: number; borcBakiye: number; alacakBakiye: number; }
const HESAP_SIRA = ["100", "102", "120", "153", "320", "391", "600", "770"];
const KAYNAK_RENK: Record<string, string> = { FATURA: "#3b82f6", TAHSILAT: "#059669", MASRAF: "#dc2626", KASA: "#f59e0b", BANKA: "#8b5cf6", MANUEL: "#64748b" };

const parseTutar = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === "number") return val;
    let str = String(val).trim();
    if (str.includes(".") && str.includes(",")) { str = str.replace(/\./g, "").replace(",", "."); }
    else if (str.includes(",")) { str = str.replace(",", "."); }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
};
const fmtTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Donem = "hafta" | "ay" | "yil" | "ozel";

function donemTarih(donem: Donem, ozelBaslangic?: string, ozelBitis?: string): { baslangic: string; bitis: string } {
    const now = new Date();
    const bitis = ozelBitis || now.toISOString().split("T")[0];
    if (donem === "ozel" && ozelBaslangic) return { baslangic: ozelBaslangic, bitis };
    if (donem === "hafta") { const d = new Date(now); d.setDate(d.getDate() - d.getDay() + 1); return { baslangic: d.toISOString().split("T")[0], bitis }; }
    if (donem === "ay") return { baslangic: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-01`, bitis };
    return { baslangic: `${now.getFullYear()}-01-01`, bitis };
}

const PIE_COLORS = ["#059669", "#3b82f6", "#f59e0b", "#dc2626"];
const MASRAF_COLORS = ["#6366f1", "#f59e0b", "#06b6d4", "#ef4444", "#8b5cf6", "#10b981", "#3b82f6", "#f97316", "#ec4899", "#64748b"];

export default function RaporlarSayfasi() {
    const { aktifSirket, kullaniciRol, isYonetici, isMuhasebe } = useAuth();
    const toast = useToast();
    const hasAccess = isYonetici || isMuhasebe;

    const [yukleniyor, setYukleniyor] = useState(true);
    const [sekme, setSekme] = useState<Sekme>("genel");
    const [donem, setDonem] = useState<Donem>("ay");
    const [ozelBaslangic, setOzelBaslangic] = useState("");
    const [ozelBitis, setOzelBitis] = useState("");
    const [siparisler, setSiparisler] = useState<SiparisRaw[]>([]);
    const [tumSiparisler, setTumSiparisler] = useState<SiparisRaw[]>([]);
    const [hareketler, setHareketler] = useState<CariHareketRaw[]>([]);
    const [firmalar, setFirmalar] = useState<FirmaRaw[]>([]);
    // Kar/Zarar verileri
    const [bankaHareketleri, setBankaHareketleri] = useState<BankaHareketiRaw[]>([]);
    const [cekSenetler, setCekSenetler] = useState<CekSenetRaw[]>([]);
    const [siparisKalemleri, setSiparisKalemleri] = useState<SiparisKalemiRaw[]>([]);
    const [tumBankaHareketleri, setTumBankaHareketleri] = useState<BankaHareketiRaw[]>([]);
    const [tumCariHareketler, setTumCariHareketler] = useState<CariHareketRaw[]>([]);
    const [tumSiparisKalemleri, setTumSiparisKalemleri] = useState<SiparisKalemiRaw[]>([]);
    // KDV verileri
    const [kdvAy, setKdvAy] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, "0")}`; });
    const [kdvSatisKalemleri, setKdvSatisKalemleri] = useState<SiparisKalemiRaw[]>([]);
    const [kdvAlisKalemleri, setKdvAlisKalemleri] = useState<SiparisKalemiRaw[]>([]);
    const [kdvYukleniyor, setKdvYukleniyor] = useState(false);
    // Plasiyer verileri
    const [plasiyerSiparisler, setPlasiyerSiparisler] = useState<{id:number;plasiyer_id:number;plasiyer_adi:string;toplam_tutar:string|number|null;alici_firma_id?:number;created_at?:string}[]>([]);
    const [plasiyerZiyaretler, setPlasiyerZiyaretler] = useState<{personel_adi:string;id:number}[]>([]);
    const [plasiyerYukleniyor, setPlasiyerYukleniyor] = useState(false);
    // Masraf verileri
    const [masraflar, setMasraflar] = useState<MasrafRaw[]>([]);
    // Fatura verileri (gelir tablosu)
    const [raporFaturalar, setRaporFaturalar] = useState<FaturaRaw2[]>([]);
    // Yevmiye verileri
    const [yevmiyeKayitlari, setYevmiyeKayitlari] = useState<YevmiyeRaw[]>([]);

    const sirketId = aktifSirket?.id;

    useEffect(() => {
        if (!sirketId) return;
        if (!hasAccess) { setYukleniyor(false); return; }
        verileriGetir();
    }, [sirketId, kullaniciRol, donem, ozelBaslangic, ozelBitis]);

    async function verileriGetir() {
        if (!aktifSirket) return;
        setYukleniyor(true);
        try {
            const sirketId = aktifSirket.id;
            const { baslangic, bitis } = donemTarih(donem, ozelBaslangic, ozelBitis);

            // 1. Ana sorgular (sirket scope icinde olanlar)
            const [sRes, fRes, tumRes, bhRes, csRes, tumBhRes] = await Promise.all([
                supabase.from("siparisler").select("id, toplam_tutar, durum, created_at, alici_firma_id").eq("satici_sirket_id", sirketId).gte("created_at", baslangic).lte("created_at", bitis + "T23:59:59"),
                supabase.from("firmalar").select("id, unvan, bakiye").eq("sahip_sirket_id", sirketId),
                supabase.from("siparisler").select("id, toplam_tutar, durum, created_at, alici_firma_id").eq("satici_sirket_id", sirketId).order("created_at", { ascending: false }),
                supabase.from("banka_hareketleri").select("id, islem_tipi, tutar, tarih").eq("sirket_id", sirketId).gte("tarih", baslangic).lte("tarih", bitis),
                supabase.from("cek_senetler").select("id, yon, tutar, durum, vade_tarihi").eq("sirket_id", sirketId).gte("vade_tarihi", baslangic).lte("vade_tarihi", bitis),
                supabase.from("banka_hareketleri").select("id, islem_tipi, tutar, tarih").eq("sirket_id", sirketId).order("tarih", { ascending: false }),
            ]);

            setSiparisler(sRes.data || []);
            setTumSiparisler(tumRes.data || []);
            setFirmalar(fRes.data || []);
            setBankaHareketleri(bhRes.data || []);
            setCekSenetler(csRes.data || []);
            setTumBankaHareketleri(tumBhRes.data || []);

            // 2. cari_hareketler: firma_id uzerinden scope (hem eski hem yeni kayitlari yakalar)
            const firmaIdList = (fRes.data || []).map(f => f.id);
            if (firmaIdList.length > 0) {
                const [hRes, tumHRes] = await Promise.all([
                    supabase.from("cari_hareketler").select("id, borc, alacak, tarih").in("firma_id", firmaIdList).gte("tarih", baslangic).lte("tarih", bitis + "T23:59:59"),
                    supabase.from("cari_hareketler").select("id, borc, alacak, tarih").in("firma_id", firmaIdList).order("tarih", { ascending: false }),
                ]);
                setHareketler(hRes.data || []);
                setTumCariHareketler(tumHRes.data || []);
            } else {
                setHareketler([]);
                setTumCariHareketler([]);
            }

            // 3. siparis_kalemleri: siparis_id uzerinden scope (sirketin kendi siparisleri)
            const tumSiparisIds = (tumRes.data || []).map(s => s.id);
            if (tumSiparisIds.length > 0) {
                const { data: tumKalemler } = await supabase.from("siparis_kalemleri")
                    .select("id, alis_fiyati, miktar, siparis_id, kdv_orani, birim_fiyat")
                    .in("siparis_id", tumSiparisIds);
                const donemSiparisIds = new Set((sRes.data || []).map(s => s.id));
                const tumSiparisIdsSet = new Set(tumSiparisIds);
                setSiparisKalemleri((tumKalemler || []).filter(k => donemSiparisIds.has(k.siparis_id)));
                setTumSiparisKalemleri((tumKalemler || []).filter(k => tumSiparisIdsSet.has(k.siparis_id)));
            } else {
                setSiparisKalemleri([]);
                setTumSiparisKalemleri([]);
            }

            // Masraf verileri
            const { data: masrafData } = await supabase.from("masraflar").select("id, masraf_kategorisi, tutar, kdv_tutari, tarih").eq("sirket_id", sirketId).order("tarih", { ascending: false });
            setMasraflar(masrafData || []);
            // Fatura verileri (gelir tablosu)
            const { data: faturaData } = await supabase.from("faturalar").select("id, tip, genel_toplam, tarih").eq("sirket_id", sirketId);
            setRaporFaturalar(faturaData || []);
            // Yevmiye verileri
            const { data: yevmiyeData } = await supabase.from("yevmiye_kayitlari").select("id, tarih, fis_no, aciklama, hesap_kodu, hesap_adi, borc, alacak, kaynak").eq("sirket_id", sirketId).gte("tarih", baslangic).lte("tarih", bitis + "T23:59:59").order("tarih", { ascending: false }).order("id", { ascending: false });
            setYevmiyeKayitlari(yevmiyeData || []);
        } catch { /* */ }
        setYukleniyor(false);
    }

    // KDV VERİLERİNİ ÇEK
    useEffect(() => {
        if (!sirketId || sekme !== "kdv") return;
        async function kdvVerileriGetir() {
            setKdvYukleniyor(true);
            const ayBas = `${kdvAy}-01`;
            const ayBitD = new Date(Number(kdvAy.split("-")[0]), Number(kdvAy.split("-")[1]), 0);
            const ayBit = ayBitD.toISOString().split("T")[0];
            // Satış siparişleri (bu firma satıcı)
            const { data: satisS } = await supabase.from("siparisler").select("id").eq("satici_sirket_id", sirketId).gte("created_at", ayBas).lte("created_at", ayBit + "T23:59:59").neq("durum", "IPTAL");
            const satisSIds = (satisS || []).map(s => s.id);
            if (satisSIds.length > 0) {
                const { data: sk } = await supabase.from("siparis_kalemleri").select("id, alis_fiyati, miktar, siparis_id, kdv_orani, birim_fiyat").in("siparis_id", satisSIds);
                setKdvSatisKalemleri(sk || []);
            } else { setKdvSatisKalemleri([]); }
            // Alış siparişleri (bu firma alıcı)
            const { data: alisS } = await supabase.from("siparisler").select("id").eq("alici_firma_id", sirketId).gte("created_at", ayBas).lte("created_at", ayBit + "T23:59:59").neq("durum", "IPTAL");
            const alisSIds = (alisS || []).map(s => s.id);
            if (alisSIds.length > 0) {
                const { data: ak } = await supabase.from("siparis_kalemleri").select("id, alis_fiyati, miktar, siparis_id, kdv_orani, birim_fiyat").in("siparis_id", alisSIds);
                setKdvAlisKalemleri(ak || []);
            } else { setKdvAlisKalemleri([]); }
            setKdvYukleniyor(false);
        }
        kdvVerileriGetir();
    }, [sirketId, sekme, kdvAy]);

    // KDV HESAPLAMALARI
    const KDV_ORANLARI = [1, 10, 20];
    const kdvHesapla = (kalemler: SiparisKalemiRaw[], fiyatAlani: "birim_fiyat" | "alis_fiyati") => {
        const sonuc: Record<number, { matrah: number; kdv: number }> = {};
        KDV_ORANLARI.forEach(o => { sonuc[o] = { matrah: 0, kdv: 0 }; });
        kalemler.forEach(k => {
            const oran = Number(k.kdv_orani) || 20;
            const fiyat = Number(k[fiyatAlani]) || Number(k.birim_fiyat) || 0;
            const miktar = Number(k.miktar) || 0;
            const matrah = fiyat * miktar;
            const kdv = matrah * (oran / 100);
            if (!sonuc[oran]) sonuc[oran] = { matrah: 0, kdv: 0 };
            sonuc[oran].matrah += matrah;
            sonuc[oran].kdv += kdv;
        });
        return sonuc;
    };
    const kdvSatis = useMemo(() => kdvHesapla(kdvSatisKalemleri, "birim_fiyat"), [kdvSatisKalemleri]);
    const kdvAlis = useMemo(() => kdvHesapla(kdvAlisKalemleri, "alis_fiyati"), [kdvAlisKalemleri]);
    const toplamHesaplananKdv = useMemo(() => Object.values(kdvSatis).reduce((a, v) => a + v.kdv, 0), [kdvSatis]);
    const toplamIndirilecekKdv = useMemo(() => Object.values(kdvAlis).reduce((a, v) => a + v.kdv, 0), [kdvAlis]);
    const odenecekKdv = toplamHesaplananKdv - toplamIndirilecekKdv;

    // Ay listesi oluştur (son 12 ay)
    const ayListesi = useMemo(() => {
        const ayIsimleri = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        const list: { value: string; label: string }[] = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const val = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            list.push({ value: val, label: `${ayIsimleri[d.getMonth()]} ${d.getFullYear()}` });
        }
        return list;
    }, []);

    // PLASİYER VERİLERİNİ ÇEK
    useEffect(() => {
        if (!sirketId || sekme !== "plasiyer") return;
        async function plasiyerVerileriGetir() {
            setPlasiyerYukleniyor(true);
            const { baslangic, bitis } = donemTarih(donem, ozelBaslangic, ozelBitis);
            const [{ data: sipData }, { data: ziyData }] = await Promise.all([
                supabase.from("siparisler").select("id, plasiyer_id, plasiyer_adi, toplam_tutar, alici_firma_id, created_at").eq("satici_sirket_id", sirketId).not("plasiyer_id", "is", null).gte("created_at", baslangic).lte("created_at", bitis + "T23:59:59"),
                supabase.from("musteri_ziyaretleri").select("id, personel_adi").eq("sirket_id", sirketId).gte("ziyaret_tarihi", baslangic).lte("ziyaret_tarihi", bitis),
            ]);
            setPlasiyerSiparisler(sipData || []);
            setPlasiyerZiyaretler(ziyData || []);
            setPlasiyerYukleniyor(false);
        }
        plasiyerVerileriGetir();
    }, [sirketId, sekme, donem, ozelBaslangic, ozelBitis]);

    // PLASİYER HESAPLAMALARI
    const plasiyerRapor = useMemo(() => {
        const map: Record<string, { ad: string; siparisSayisi: number; ciro: number; ziyaretSayisi: number; musteriMap: Record<number, number> }> = {};
        plasiyerSiparisler.forEach(s => {
            const ad = s.plasiyer_adi || "Bilinmiyor";
            if (!map[ad]) map[ad] = { ad, siparisSayisi: 0, ciro: 0, ziyaretSayisi: 0, musteriMap: {} };
            map[ad].siparisSayisi++;
            map[ad].ciro += parseTutar(s.toplam_tutar);
            if (s.alici_firma_id) map[ad].musteriMap[s.alici_firma_id] = (map[ad].musteriMap[s.alici_firma_id] || 0) + 1;
        });
        plasiyerZiyaretler.forEach(z => {
            const ad = z.personel_adi || "Bilinmiyor";
            if (!map[ad]) map[ad] = { ad, siparisSayisi: 0, ciro: 0, ziyaretSayisi: 0, musteriMap: {} };
            map[ad].ziyaretSayisi++;
        });
        return Object.values(map).sort((a, b) => b.ciro - a.ciro).map(p => {
            const enCokMusteri = Object.entries(p.musteriMap).sort((a, b) => b[1] - a[1])[0];
            const enCokMusteriAdi = enCokMusteri ? (firmalar.find(f => f.id === Number(enCokMusteri[0]))?.unvan || "—") : "—";
            return { ...p, enCokMusteri: enCokMusteriAdi };
        });
    }, [plasiyerSiparisler, plasiyerZiyaretler, firmalar]);

    const plasiyerGrafik = useMemo(() => plasiyerRapor.map(p => ({ ad: p.ad, ciro: p.ciro, siparis: p.siparisSayisi })), [plasiyerRapor]);

    // HESAPLAMALAR
    const toplamCiro = useMemo(() => siparisler.filter(s => s.durum !== "IPTAL").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0), [siparisler]);
    const toplamTahsilat = useMemo(() => hareketler.reduce((a, h) => a + (Number(h.alacak) || 0), 0), [hareketler]);
    const acikAlacak = useMemo(() => firmalar.reduce((a, f) => a + Math.max(Number(f.bakiye) || 0, 0), 0), [firmalar]);
    const siparisSayisi = useMemo(() => siparisler.filter(s => s.durum !== "IPTAL").length, [siparisler]);

    // AYLIK GRAFİK (son 12 ay, tüm siparişlerden)
    const aylikGrafik = useMemo(() => {
        const ayIsimleri = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
        const result: { ay: string; tutar: number }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            const label = `${ayIsimleri[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
            const toplam = tumSiparisler.filter(s => s.created_at?.startsWith(key) && s.durum !== "IPTAL").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0);
            result.push({ ay: label, tutar: toplam });
        }
        return result;
    }, [tumSiparisler]);

    // EN ÇOK SİPARİŞ VEREN 5 MÜŞTERİ
    const enCokSiparisVeren = useMemo(() => {
        const sayac: Record<number, { unvan: string; adet: number; tutar: number }> = {};
        siparisler.filter(s => s.durum !== "IPTAL" && s.alici_firma_id).forEach(s => {
            const fid = s.alici_firma_id!;
            if (!sayac[fid]) { const f = firmalar.find(ff => ff.id === fid); sayac[fid] = { unvan: f?.unvan || "Bilinmiyor", adet: 0, tutar: 0 }; }
            sayac[fid].adet++;
            sayac[fid].tutar += parseTutar(s.toplam_tutar);
        });
        return Object.values(sayac).sort((a, b) => b.tutar - a.tutar).slice(0, 5);
    }, [siparisler, firmalar]);

    // SİPARİŞ DURUM DAĞILIMI
    const durumDagilimi = useMemo(() => {
        const map: Record<string, number> = {};
        siparisler.forEach(s => { map[s.durum] = (map[s.durum] || 0) + 1; });
        const labels: Record<string, string> = { TAMAMLANDI: "Tamamlandı", HAZIRLANIYOR: "Hazırlanıyor", YENI: "Bekliyor", "Onay Bekliyor": "Bekliyor", IPTAL: "İptal" };
        const result: { name: string; value: number }[] = [];
        Object.entries(map).forEach(([k, v]) => {
            const name = labels[k] || k;
            const existing = result.find(r => r.name === name);
            if (existing) existing.value += v; else result.push({ name, value: v });
        });
        return result.sort((a, b) => b.value - a.value);
    }, [siparisler]);

    // KAR/ZARAR HESAPLAMALARI
    const kzSatisCirosu = useMemo(() => siparisler.filter(s => s.durum === "TAMAMLANDI").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0), [siparisler]);
    const kzTahsilat = useMemo(() => hareketler.reduce((a, h) => a + (Number(h.alacak) || 0), 0), [hareketler]);
    const kzBankaGelir = useMemo(() => bankaHareketleri.filter(b => b.islem_tipi === "YATIRMA").reduce((a, b) => a + Number(b.tutar), 0), [bankaHareketleri]);
    const kzToplamGelir = kzSatisCirosu + kzBankaGelir;

    const kzToplamAlis = useMemo(() => siparisKalemleri.reduce((a, k) => a + (Number(k.alis_fiyati) || 0) * (Number(k.miktar) || 0), 0), [siparisKalemleri]);
    const kzBankaGider = useMemo(() => bankaHareketleri.filter(b => b.islem_tipi === "CEKME").reduce((a, b) => a + Number(b.tutar), 0), [bankaHareketleri]);
    const kzCekBorc = useMemo(() => cekSenetler.filter(c => c.yon === "BORC" && c.durum === "BEKLIYOR").reduce((a, c) => a + Number(c.tutar), 0), [cekSenetler]);
    const kzToplamGider = kzToplamAlis + kzBankaGider + kzCekBorc;

    const kzBrutKar = kzSatisCirosu - kzToplamAlis;
    const kzNetKar = kzToplamGelir - kzToplamGider;
    const kzKarMarji = kzSatisCirosu > 0 ? (kzNetKar / kzSatisCirosu) * 100 : 0;

    // AYLIK KAR/ZARAR GRAFİĞİ (son 12 ay)
    const aylikKarZarar = useMemo(() => {
        const ayIsimleri = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
        const result: { ay: string; gelir: number; gider: number; net: number }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            const label = `${ayIsimleri[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
            const aySatis = tumSiparisler.filter(s => s.created_at?.startsWith(key) && s.durum === "TAMAMLANDI").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0);
            const ayBankaGelir = tumBankaHareketleri.filter(b => b.tarih?.startsWith(key) && b.islem_tipi === "YATIRMA").reduce((a, b) => a + Number(b.tutar), 0);
            const gelir = aySatis + ayBankaGelir;

            const aySiparisIds = new Set(tumSiparisler.filter(s => s.created_at?.startsWith(key)).map(s => s.id));
            const ayAlis = tumSiparisKalemleri.filter(k => aySiparisIds.has(k.siparis_id)).reduce((a, k) => a + (Number(k.alis_fiyati) || 0) * (Number(k.miktar) || 0), 0);
            const ayBankaGider = tumBankaHareketleri.filter(b => b.tarih?.startsWith(key) && b.islem_tipi === "CEKME").reduce((a, b) => a + Number(b.tutar), 0);
            const gider = ayAlis + ayBankaGider;

            result.push({ ay: label, gelir, gider, net: gelir - gider });
        }
        return result;
    }, [tumSiparisler, tumBankaHareketleri, tumSiparisKalemleri]);

    // MASRAF RAPORLARI
    const masrafKategoriDagilimi = useMemo(() => {
        const map: Record<string, number> = {};
        masraflar.forEach(m => { map[m.masraf_kategorisi] = (map[m.masraf_kategorisi] || 0) + Number(m.tutar || 0) + Number(m.kdv_tutari || 0); });
        return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [masraflar]);

    const aylikMasrafTrend = useMemo(() => {
        const ayIsimleri = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];
        const result: { ay: string; tutar: number }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            const label = `${ayIsimleri[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
            const ayMasraf = masraflar.filter(m => m.tarih?.startsWith(key)).reduce((a, m) => a + Number(m.tutar || 0) + Number(m.kdv_tutari || 0), 0);
            result.push({ ay: label, tutar: ayMasraf });
        }
        return result;
    }, [masraflar]);

    const gelirGiderKarsilastirma = useMemo(() => {
        const ayIsimleri = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];
        const result: { ay: string; gelir: number; gider: number }[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            const label = `${ayIsimleri[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
            const gelir = tumSiparisler.filter(s => s.created_at?.startsWith(key) && s.durum === "TAMAMLANDI").reduce((a, s) => a + parseTutar(s.toplam_tutar), 0);
            const gider = masraflar.filter(m => m.tarih?.startsWith(key)).reduce((a, m) => a + Number(m.tutar || 0) + Number(m.kdv_tutari || 0), 0);
            result.push({ ay: label, gelir, gider });
        }
        return result;
    }, [tumSiparisler, masraflar]);

    const toplamMasraf = useMemo(() => masraflar.reduce((a, m) => a + Number(m.tutar || 0) + Number(m.kdv_tutari || 0), 0), [masraflar]);

    // GELİR TABLOSU HESAPLAMALARI
    const gtBrutSatislar = useMemo(() => raporFaturalar.filter(f => f.tip === "GIDEN").reduce((a, f) => a + Number(f.genel_toplam || 0), 0), [raporFaturalar]);
    const gtAlislar = useMemo(() => raporFaturalar.filter(f => f.tip === "GELEN").reduce((a, f) => a + Number(f.genel_toplam || 0), 0), [raporFaturalar]);
    const gtNetSatislar = gtBrutSatislar;
    const gtBrutKar = gtNetSatislar - gtAlislar;
    const gtFaaliyetGiderleri = toplamMasraf;
    const gtNetKar = gtBrutKar - gtFaaliyetGiderleri;

    // YEVMIYE TOPLAMI
    const yevToplamBorc = useMemo(() => yevmiyeKayitlari.reduce((a, k) => a + Number(k.borc || 0), 0), [yevmiyeKayitlari]);
    const yevToplamAlacak = useMemo(() => yevmiyeKayitlari.reduce((a, k) => a + Number(k.alacak || 0), 0), [yevmiyeKayitlari]);

    // MİZAN HESAPLA
    const mizanSatirlari = useMemo((): MizanSatir[] => {
        const map: Record<string, { hesap_adi: string; borc: number; alacak: number }> = {};
        yevmiyeKayitlari.forEach(k => {
            const kod = k.hesap_kodu || "999";
            if (!map[kod]) map[kod] = { hesap_adi: k.hesap_adi || kod, borc: 0, alacak: 0 };
            map[kod].borc += Number(k.borc || 0);
            map[kod].alacak += Number(k.alacak || 0);
        });
        return Object.entries(map).map(([kod, v]) => {
            const fark = v.borc - v.alacak;
            return { hesap_kodu: kod, hesap_adi: v.hesap_adi, toplamBorc: v.borc, toplamAlacak: v.alacak, borcBakiye: fark > 0 ? fark : 0, alacakBakiye: fark < 0 ? Math.abs(fark) : 0 };
        }).sort((a, b) => {
            const ai = HESAP_SIRA.indexOf(a.hesap_kodu); const bi = HESAP_SIRA.indexOf(b.hesap_kodu);
            return (ai >= 0 ? ai : 100) - (bi >= 0 ? bi : 100);
        });
    }, [yevmiyeKayitlari]);
    const mizBorc = useMemo(() => mizanSatirlari.reduce((a, s) => a + s.toplamBorc, 0), [mizanSatirlari]);
    const mizAlacak = useMemo(() => mizanSatirlari.reduce((a, s) => a + s.toplamAlacak, 0), [mizanSatirlari]);
    const mizDengeli = Math.abs(mizBorc - mizAlacak) < 0.01;

    // BİLANCO HESAPLA
    const bilBakiye = useMemo(() => {
        const map: Record<string, number> = {};
        yevmiyeKayitlari.forEach(k => {
            const kod = k.hesap_kodu || "999";
            map[kod] = (map[kod] || 0) + Number(k.borc || 0) - Number(k.alacak || 0);
        });
        return (kod: string) => map[kod] || 0;
    }, [yevmiyeKayitlari]);
    const bilKasa = Math.max(bilBakiye("100"), 0);
    const bilBanka = Math.max(bilBakiye("102"), 0);
    const bilAlici = Math.max(bilBakiye("120"), 0);
    const bilTicMal = Math.max(bilBakiye("153"), 0);
    const bilToplamAktif = bilKasa + bilBanka + bilAlici + bilTicMal;
    const bilSatici = Math.max(-bilBakiye("320"), 0);
    const bilSatisGeliri = Math.max(-bilBakiye("600"), 0);
    const bilGiderler = Math.max(bilBakiye("770"), 0);
    const bilNetKar = bilSatisGeliri - bilGiderler;
    const bilToplamPasif = bilSatici + bilNetKar;
    const bilDengeli = Math.abs(bilToplamAktif - bilToplamPasif) < 0.01;

    // EXCEL / PDF EXPORT
    const raporExcelExport = () => {
        const cols = [{header:"Ay",key:"ay",width:15},{header:"Ciro (TL)",key:"tutar",width:18}];
        excelExport(aylikGrafik as unknown as Record<string,unknown>[], cols, "rapor_aylik_ciro");
        toast.success("Excel indirildi!");
    };
    const raporPdfExport = () => {
        const cols = [{header:"Ay",key:"ay",width:15},{header:"Ciro (TL)",key:"tutar",width:18}];
        pdfExport(aylikGrafik as unknown as Record<string,unknown>[], cols, "rapor_aylik_ciro", `Aylık Ciro Raporu - ${donemTarih(donem, ozelBaslangic, ozelBitis).baslangic} / ${donemTarih(donem, ozelBaslangic, ozelBitis).bitis}`);
        toast.success("PDF indirildi!");
    };

    if (!aktifSirket) return <div className="h-full flex items-center justify-center" style={{ background: "var(--c-bg)" }}><span className="text-[12px] font-semibold text-[#64748b] tracking-widest uppercase">Sistem Doğrulanıyor</span></div>;

    if (!hasAccess) return (
        <main className="flex-1 flex flex-col items-center justify-center h-full" style={{ background: "var(--c-bg)" }}>
            <div className="w-16 h-16 bg-[#fef2f2] text-[#dc2626] flex items-center justify-center mb-4"><i className="fas fa-lock text-2xl" /></div>
            <h1 className="text-[15px] font-semibold text-[#0f172a] mb-1">Erişim Engellendi</h1>
            <p className="text-[12px] text-[#64748b]">Bu sayfaya yalnızca Yönetici veya Muhasebe yetkisi ile erişilebilir.</p>
        </main>
    );

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
            {/* SEKME BAR */}
            <div className="flex items-center gap-0 shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--c-border)", background: "white" }}>
                {([{ key: "genel", label: "Genel Raporlar", icon: "fa-chart-bar" }, { key: "kar-zarar", label: "Kar / Zarar", icon: "fa-balance-scale" }, { key: "masraf", label: "Masraf Raporu", icon: "fa-receipt" }, { key: "kdv", label: "KDV Beyannamesi", icon: "fa-file-invoice-dollar" }, { key: "plasiyer", label: "Plasiyer Raporu", icon: "fa-user-tie" }, { key: "gelir-tablosu", label: "Gelir Tablosu", icon: "fa-chart-line" }, { key: "yevmiye", label: "Yevmiye", icon: "fa-book" }, { key: "mizan", label: "Mizan", icon: "fa-balance-scale" }, { key: "bilanco", label: "Bilanco", icon: "fa-file-invoice-dollar" }] as { key: Sekme; label: string; icon: string }[]).map(s => (
                    <button key={s.key} onClick={() => setSekme(s.key)}
                        className={`px-3 md:px-5 py-2 md:py-2.5 text-[10px] md:text-[11px] font-semibold transition-colors border-b-2 whitespace-nowrap ${sekme === s.key ? "text-[#0f172a] border-[#0f172a]" : "text-[#94a3b8] border-transparent hover:text-[#64748b]"}`}>
                        <i className={`fas ${s.icon} mr-1 md:mr-1.5 text-[9px] md:text-[10px]`} />{s.label}
                    </button>
                ))}
            </div>

            {/* TOOLBAR */}
            <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                {(["hafta", "ay", "yil"] as Donem[]).map(d => (
                    <button key={d} onClick={() => setDonem(d)} className={donem === d && donem !== "ozel" ? "btn-primary" : "btn-secondary"}>
                        {d === "hafta" ? "Bu Hafta" : d === "ay" ? "Bu Ay" : "Bu Yıl"}
                    </button>
                ))}
                <button onClick={() => setDonem("ozel")} className={donem === "ozel" ? "btn-primary" : "btn-secondary"}>Özel Aralık</button>
                {donem === "ozel" && (
                    <>
                        <input type="date" value={ozelBaslangic} onChange={e => setOzelBaslangic(e.target.value)} className="input-kurumsal w-36" />
                        <span className="text-[10px] text-[#94a3b8]">—</span>
                        <input type="date" value={ozelBitis} onChange={e => setOzelBitis(e.target.value)} className="input-kurumsal w-36" />
                    </>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={raporExcelExport} className="btn-secondary flex items-center gap-2"><i className="fas fa-file-excel text-[#059669] text-[10px]" /> EXCEL</button>
                    <button onClick={raporPdfExport} className="btn-secondary flex items-center gap-2"><i className="fas fa-file-pdf text-[#dc2626] text-[10px]" /> PDF</button>
                    <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 hidden sm:flex"><i className="fas fa-print text-[10px]" /> YAZDIR</button>
                    {yukleniyor && <i className="fas fa-circle-notch fa-spin text-[#64748b]" />}
                </div>
            </div>

            {/* İÇERİK */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 custom-scrollbar h-0">

                {/* ═══ KAR / ZARAR SEKMESİ ═══ */}
                {sekme === "kar-zarar" && (
                    <>
                        {/* ÖZET KARTLAR */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className={`bg-white border border-slate-200 border-l-4 ${kzNetKar >= 0 ? "border-l-emerald-500" : "border-l-red-500"} p-4`}>
                                <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Net Kar / Zarar</div>
                                <div className={`text-2xl font-semibold tabular-nums ${kzNetKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>
                                    {kzNetKar >= 0 ? "+" : ""}₺{fmtTL(kzNetKar)}
                                </div>
                                <div className="text-[10px] text-[#94a3b8] mt-1">{kzNetKar >= 0 ? "Kar" : "Zarar"}</div>
                            </div>
                            <div className="bg-white border border-slate-200 border-l-4 border-l-blue-500 p-4">
                                <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Brüt Kar</div>
                                <div className={`text-2xl font-semibold tabular-nums ${kzBrutKar >= 0 ? "text-[#0f172a]" : "text-[#dc2626]"}`}>₺{fmtTL(kzBrutKar)}</div>
                                <div className="text-[10px] text-[#94a3b8] mt-1">Satış - Alış</div>
                            </div>
                            <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 p-4">
                                <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Kar Marjı</div>
                                <div className={`text-2xl font-semibold tabular-nums ${kzKarMarji >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>%{kzKarMarji.toFixed(1)}</div>
                                <div className="text-[10px] text-[#94a3b8] mt-1">Net Kar / Satış Cirosu</div>
                            </div>
                        </div>

                        {/* GELİR / GİDER DETAY */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {/* GELİRLER */}
                            <div className="card-kurumsal">
                                <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    <div className="w-6 h-6 bg-emerald-50 text-[#059669] flex items-center justify-center shrink-0"><i className="fas fa-arrow-down text-[10px]" /></div>
                                    <div>
                                        <div className="text-[13px] font-semibold text-[#059669]">Gelirler</div>
                                        <div className="text-[10px] text-[#94a3b8]">Seçili dönem toplam gelir</div>
                                    </div>
                                    <div className="ml-auto text-[16px] font-bold text-[#059669] tabular-nums">₺{fmtTL(kzToplamGelir)}</div>
                                </div>
                                <div className="p-2">
                                    {[
                                        { label: "Satış Cirosu (Tamamlanan)", value: kzSatisCirosu, icon: "fa-shopping-cart", sub: "siparisler → TAMAMLANDI" },
                                        { label: "Tahsilat", value: kzTahsilat, icon: "fa-hand-holding-usd", sub: "cari_hareketler → alacak" },
                                        { label: "Banka Gelirleri", value: kzBankaGelir, icon: "fa-university", sub: "banka_hareketleri → YATIRMA" },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: i < 2 ? "1px solid #f1f5f9" : "none" }}>
                                            <div className="w-7 h-7 bg-emerald-50 text-[#059669] flex items-center justify-center shrink-0"><i className={`fas ${item.icon} text-[10px]`} /></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[12px] font-medium text-[#0f172a]">{item.label}</div>
                                                <div className="text-[9px] text-[#94a3b8]">{item.sub}</div>
                                            </div>
                                            <div className="text-[13px] font-semibold text-[#059669] tabular-nums shrink-0">+₺{fmtTL(item.value)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* GİDERLER */}
                            <div className="card-kurumsal">
                                <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    <div className="w-6 h-6 bg-red-50 text-[#dc2626] flex items-center justify-center shrink-0"><i className="fas fa-arrow-up text-[10px]" /></div>
                                    <div>
                                        <div className="text-[13px] font-semibold text-[#dc2626]">Giderler</div>
                                        <div className="text-[10px] text-[#94a3b8]">Seçili dönem toplam gider</div>
                                    </div>
                                    <div className="ml-auto text-[16px] font-bold text-[#dc2626] tabular-nums">₺{fmtTL(kzToplamGider)}</div>
                                </div>
                                <div className="p-2">
                                    {[
                                        { label: "Toplam Alış Maliyeti", value: kzToplamAlis, icon: "fa-truck", sub: "siparis_kalemleri → alis_fiyati" },
                                        { label: "Banka Giderleri", value: kzBankaGider, icon: "fa-university", sub: "banka_hareketleri → CEKME" },
                                        { label: "Çek/Senet Borçlar", value: kzCekBorc, icon: "fa-money-check", sub: "cek_senetler → BORC (Bekliyor)" },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-3 px-3 py-3" style={{ borderBottom: i < 2 ? "1px solid #f1f5f9" : "none" }}>
                                            <div className="w-7 h-7 bg-red-50 text-[#dc2626] flex items-center justify-center shrink-0"><i className={`fas ${item.icon} text-[10px]`} /></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[12px] font-medium text-[#0f172a]">{item.label}</div>
                                                <div className="text-[9px] text-[#94a3b8]">{item.sub}</div>
                                            </div>
                                            <div className="text-[13px] font-semibold text-[#dc2626] tabular-nums shrink-0">-₺{fmtTL(item.value)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* AYLIK KAR/ZARAR GRAFİĞİ */}
                        <div className="card-kurumsal">
                            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <div>
                                    <div className="text-[13px] font-semibold text-[#0f172a]">Aylık Kar / Zarar Grafiği</div>
                                    <div className="text-[10px] text-[#94a3b8] mt-0.5 tracking-wide">Son 12 aylık gelir, gider ve net kar</div>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-medium text-[#94a3b8]">
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: "#059669" }} /> Gelir</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: "#dc2626" }} /> Gider</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-1 inline-block" style={{ background: "#3b82f6" }} /> Net Kar</span>
                                </div>
                            </div>
                            <div className="p-4 md:p-5" style={{ height: 340 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={aylikKarZarar} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="ay" tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 12, fontWeight: 600 }} formatter={(value) => [`₺${fmtTL(Number(value))}`, ""]} />
                                        <Bar dataKey="gelir" fill="#059669" radius={[2, 2, 0, 0]} maxBarSize={28} />
                                        <Bar dataKey="gider" fill="#dc2626" radius={[2, 2, 0, 0]} maxBarSize={28} />
                                        <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </>
                )}

                {/* ═══ KDV BEYANNAMESİ SEKMESİ ═══ */}
                {sekme === "kdv" && (
                    <>
                        {/* KDV Toolbar */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <select value={kdvAy} onChange={e => setKdvAy(e.target.value)} className="input-kurumsal text-[12px] h-9 w-auto font-semibold">
                                {ayListesi.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                            </select>
                            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-[11px]"><i className="fas fa-print text-[10px]" /> PDF / Yazdır</button>
                            {kdvYukleniyor && <i className="fas fa-circle-notch fa-spin text-[#64748b]" />}
                        </div>

                        {/* SONUÇ KARTI */}
                        <div className={`bg-white border border-slate-200 border-l-4 ${odenecekKdv >= 0 ? "border-l-red-500" : "border-l-emerald-500"} p-5`}>
                            <div className="flex items-center justify-between flex-wrap gap-4">
                                <div>
                                    <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">
                                        {odenecekKdv >= 0 ? "Ödenecek KDV" : "İade Alınacak KDV"}
                                    </div>
                                    <div className={`text-3xl font-bold tabular-nums ${odenecekKdv >= 0 ? "text-[#dc2626]" : "text-[#059669]"}`}>
                                        ₺{fmtTL(Math.abs(odenecekKdv))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-[12px]">
                                    <div className="text-center">
                                        <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">Hesaplanan</div>
                                        <div className="text-[16px] font-bold text-[#dc2626] tabular-nums">₺{fmtTL(toplamHesaplananKdv)}</div>
                                    </div>
                                    <div className="text-[20px] text-[#cbd5e1] font-light">−</div>
                                    <div className="text-center">
                                        <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">İndirilecek</div>
                                        <div className="text-[16px] font-bold text-[#059669] tabular-nums">₺{fmtTL(toplamIndirilecekKdv)}</div>
                                    </div>
                                    <div className="text-[20px] text-[#cbd5e1] font-light">=</div>
                                    <div className="text-center">
                                        <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">{odenecekKdv >= 0 ? "Ödenecek" : "İade"}</div>
                                        <div className={`text-[16px] font-bold tabular-nums ${odenecekKdv >= 0 ? "text-[#dc2626]" : "text-[#059669]"}`}>₺{fmtTL(Math.abs(odenecekKdv))}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {/* HESAPLANAN KDV */}
                            <div className="card-kurumsal">
                                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    <div>
                                        <div className="text-[13px] font-semibold text-[#dc2626]">Hesaplanan KDV (Satışlardan)</div>
                                        <div className="text-[10px] text-[#94a3b8]">Satış faturalarındaki KDV</div>
                                    </div>
                                    <div className="text-[14px] font-bold text-[#dc2626] tabular-nums">₺{fmtTL(toplamHesaplananKdv)}</div>
                                </div>
                                <table className="tbl-kurumsal">
                                    <thead>
                                        <tr><th>KDV Oranı</th><th className="text-right">Matrah (TL)</th><th className="text-right">KDV (TL)</th></tr>
                                    </thead>
                                    <tbody>
                                        {KDV_ORANLARI.map(oran => (
                                            <tr key={oran}>
                                                <td className="font-semibold">%{oran}</td>
                                                <td className="text-right tabular-nums text-[#475569]">₺{fmtTL(kdvSatis[oran]?.matrah || 0)}</td>
                                                <td className="text-right tabular-nums font-semibold text-[#dc2626]">₺{fmtTL(kdvSatis[oran]?.kdv || 0)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ borderTop: "2px solid var(--c-border)" }}>
                                            <td className="font-bold text-[#0f172a]">TOPLAM</td>
                                            <td className="text-right tabular-nums font-bold text-[#0f172a]">₺{fmtTL(Object.values(kdvSatis).reduce((a, v) => a + v.matrah, 0))}</td>
                                            <td className="text-right tabular-nums font-bold text-[#dc2626]">₺{fmtTL(toplamHesaplananKdv)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* İNDİRİLECEK KDV */}
                            <div className="card-kurumsal">
                                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                    <div>
                                        <div className="text-[13px] font-semibold text-[#059669]">İndirilecek KDV (Alışlardan)</div>
                                        <div className="text-[10px] text-[#94a3b8]">Alış faturalarındaki KDV</div>
                                    </div>
                                    <div className="text-[14px] font-bold text-[#059669] tabular-nums">₺{fmtTL(toplamIndirilecekKdv)}</div>
                                </div>
                                <table className="tbl-kurumsal">
                                    <thead>
                                        <tr><th>KDV Oranı</th><th className="text-right">Matrah (TL)</th><th className="text-right">KDV (TL)</th></tr>
                                    </thead>
                                    <tbody>
                                        {KDV_ORANLARI.map(oran => (
                                            <tr key={oran}>
                                                <td className="font-semibold">%{oran}</td>
                                                <td className="text-right tabular-nums text-[#475569]">₺{fmtTL(kdvAlis[oran]?.matrah || 0)}</td>
                                                <td className="text-right tabular-nums font-semibold text-[#059669]">₺{fmtTL(kdvAlis[oran]?.kdv || 0)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ borderTop: "2px solid var(--c-border)" }}>
                                            <td className="font-bold text-[#0f172a]">TOPLAM</td>
                                            <td className="text-right tabular-nums font-bold text-[#0f172a]">₺{fmtTL(Object.values(kdvAlis).reduce((a, v) => a + v.matrah, 0))}</td>
                                            <td className="text-right tabular-nums font-bold text-[#059669]">₺{fmtTL(toplamIndirilecekKdv)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

                {/* ═══ PLASİYER RAPORU SEKMESİ ═══ */}
                {sekme === "plasiyer" && (
                    <>
                        {plasiyerYukleniyor ? (
                            <div className="flex items-center justify-center py-16"><i className="fas fa-circle-notch fa-spin text-[#475569] text-lg" /></div>
                        ) : plasiyerRapor.length === 0 ? (
                            <div className="text-center py-16">
                                <i className="fas fa-user-tie text-[36px] text-[#e2e8f0] mb-3" />
                                <div className="text-[12px] font-semibold text-[#94a3b8]">Bu dönemde plasiyer verisi bulunamadı</div>
                                <div className="text-[10px] text-[#cbd5e1] mt-1">Sipariş oluştururken plasiyer seçimi yapılmalıdır</div>
                            </div>
                        ) : (
                            <>
                                {/* Plasiyer Tablosu */}
                                <div className="card-kurumsal">
                                    <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                        <div>
                                            <div className="text-[13px] font-semibold text-[#0f172a]">Plasiyer Performansı</div>
                                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Seçili dönem · Ciroya göre sıralı</div>
                                        </div>
                                    </div>
                                    <table className="tbl-kurumsal">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Plasiyer</th>
                                                <th className="text-right">Sipariş</th>
                                                <th className="text-right">Toplam Ciro</th>
                                                <th className="text-right">Ziyaret</th>
                                                <th>En Çok Sipariş Aldığı Müşteri</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {plasiyerRapor.map((p, i) => (
                                                <tr key={p.ad}>
                                                    <td className="text-[#94a3b8] font-semibold">{i + 1}</td>
                                                    <td className="font-semibold text-[#0f172a]">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 bg-[#f1f5f9] text-[#475569] flex items-center justify-center text-[10px] font-semibold shrink-0"><i className="fas fa-user-tie" /></div>
                                                            {p.ad}
                                                        </div>
                                                    </td>
                                                    <td className="text-right tabular-nums font-semibold text-[#3b82f6]">{p.siparisSayisi}</td>
                                                    <td className="text-right tabular-nums font-bold text-[#0f172a]">₺{fmtTL(p.ciro)}</td>
                                                    <td className="text-right tabular-nums font-semibold text-[#059669]">{p.ziyaretSayisi}</td>
                                                    <td className="text-[#475569]">{p.enCokMusteri}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Plasiyer Ciro Grafiği */}
                                {plasiyerGrafik.length > 0 && (
                                    <div className="card-kurumsal">
                                        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                            <div>
                                                <div className="text-[13px] font-semibold text-[#0f172a]">Plasiyer Ciro Karşılaştırması</div>
                                                <div className="text-[10px] text-[#94a3b8] mt-0.5">Seçili dönem</div>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] font-medium text-[#94a3b8]">
                                                <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: "#0f172a" }} /> Ciro</span>
                                            </div>
                                        </div>
                                        <div className="p-4 md:p-5" style={{ height: 300 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={plasiyerGrafik} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} layout="vertical">
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis type="number" tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                                    <YAxis type="category" dataKey="ad" tick={{ fontSize: 11, fontWeight: 600, fill: "#475569" }} axisLine={false} tickLine={false} width={120} />
                                                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }} formatter={(value) => [`₺${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, "Ciro"]} />
                                                    <Bar dataKey="ciro" fill="#0f172a" radius={[0, 2, 2, 0]} maxBarSize={28} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {sekme === "genel" && <>
                {/* ÖZET KARTLARI */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: "Toplam Ciro", value: `₺${fmtTL(toplamCiro)}`, color: "#0f172a", border: "border-l-blue-500" },
                        { label: "Toplam Tahsilat", value: `₺${fmtTL(toplamTahsilat)}`, color: "#059669", border: "border-l-emerald-500" },
                        { label: "Açık Alacak", value: `₺${fmtTL(acikAlacak)}`, color: "#dc2626", border: "border-l-red-500" },
                        { label: "Sipariş Sayısı", value: siparisSayisi.toString(), color: "#3b82f6", border: "border-l-blue-500" },
                    ].map((k, i) => (
                        <div key={i} className={`bg-white border border-slate-200 border-l-4 ${k.border} p-4`}>
                            <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">{k.label}</div>
                            <div className="text-2xl font-semibold tabular-nums" style={{ color: k.color }}>{k.value}</div>
                        </div>
                    ))}
                </div>

                {/* AYLIK CİRO GRAFİĞİ */}
                <div className="card-kurumsal">
                    <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                        <div>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Aylık Ciro Grafiği</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5 tracking-wide">Son 12 aylık ciro dağılımı</div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-medium text-[#94a3b8]">
                            <div className="w-3 h-3" style={{ background: "#1e293b" }} /> Ciro (TL)
                        </div>
                    </div>
                    <div className="p-4 md:p-5" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={aylikGrafik} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="ay" tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }} formatter={(value) => [`₺${Number(value).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, "Ciro"]} />
                                <Bar dataKey="tutar" fill="#0f172a" radius={[2, 2, 0, 0]} maxBarSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* ALT BÖLÜM: 3 SÜTUN */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* EN ÇOK SİPARİŞ VEREN 5 MÜŞTERİ */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">En Çok Sipariş Veren Müşteriler</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Seçili dönemde ilk 5</div>
                        </div>
                        <div className="p-2">
                            {enCokSiparisVeren.length === 0 ? (
                                <div className="p-6 text-center text-[#94a3b8] text-[11px] font-semibold tracking-widest uppercase">Veri bulunamadı</div>
                            ) : enCokSiparisVeren.map((m, i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#f8fafc] transition-colors" style={{ borderBottom: i < enCokSiparisVeren.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                    <div className="w-6 h-6 bg-[#f1f5f9] text-[#64748b] flex items-center justify-center text-[11px] font-semibold shrink-0">{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-semibold text-[#0f172a] truncate">{m.unvan}</div>
                                        <div className="text-[10px] text-[#94a3b8]">{m.adet} sipariş</div>
                                    </div>
                                    <div className="text-[12px] font-semibold text-[#0f172a] tabular-nums shrink-0">₺{fmtTL(m.tutar)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* SİPARİŞ DURUM DAĞILIMI */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Sipariş Durum Dağılımı</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Seçili dönem bazında</div>
                        </div>
                        <div className="p-4" style={{ height: 260 }}>
                            {durumDagilimi.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[#94a3b8] text-[11px] font-semibold tracking-widest uppercase">Veri bulunamadı</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={durumDagilimi} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} %${((percent ?? 0) * 100).toFixed(0)}`} labelLine={false} style={{ fontSize: 10, fontWeight: 600 }}>
                                            {durumDagilimi.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                                        </Pie>
                                        <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} itemStyle={{ color: "#f1f5f9", fontWeight: 700 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* HIZLI BİLGİLER */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Dönem Özeti</div>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { label: "Toplam Müşteri", value: firmalar.length.toString(), icon: "fa-users", color: "#3b82f6" },
                                { label: "Borçlu Müşteri", value: firmalar.filter(f => (Number(f.bakiye) || 0) > 0).length.toString(), icon: "fa-exclamation-circle", color: "#dc2626" },
                                { label: "Ortalama Sipariş Tutarı", value: siparisSayisi > 0 ? `₺${fmtTL(toplamCiro / siparisSayisi)}` : "—", icon: "fa-calculator", color: "#0f172a" },
                                { label: "Tahsilat Oranı", value: toplamCiro > 0 ? `%${((toplamTahsilat / toplamCiro) * 100).toFixed(1)}` : "—", icon: "fa-percentage", color: "#059669" },
                                { label: "İptal Edilen Sipariş", value: siparisler.filter(s => s.durum === "IPTAL").length.toString(), icon: "fa-ban", color: "#dc2626" },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: i < 4 ? "1px solid #f1f5f9" : "none" }}>
                                    <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ background: `${item.color}10`, color: item.color }}>
                                        <i className={`fas ${item.icon} text-[12px]`} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[11px] text-[#64748b] font-medium">{item.label}</div>
                                    </div>
                                    <div className="text-[13px] font-semibold text-[#0f172a] tabular-nums">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                </>}

                {sekme === "masraf" && <>
                    {/* MASRAF ÖZET */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 p-4">
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Toplam Masraf</div>
                            <div className="text-[18px] font-bold text-[#dc2626]">{`₺${fmtTL(toplamMasraf)}`}</div>
                        </div>
                        <div className="bg-white border border-slate-200 border-l-4 border-l-blue-500 p-4">
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Kategori Sayisi</div>
                            <div className="text-[18px] font-bold text-[#3b82f6]">{masrafKategoriDagilimi.length}</div>
                        </div>
                        <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 p-4">
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">En Yuksek Kategori</div>
                            <div className="text-[14px] font-bold text-[#0f172a]">{masrafKategoriDagilimi[0]?.name || "-"}</div>
                            {masrafKategoriDagilimi[0] && <div className="text-[11px] font-semibold text-[#f59e0b]">{`₺${fmtTL(masrafKategoriDagilimi[0].value)}`}</div>}
                        </div>
                    </div>

                    {/* KATEGORİYE GÖRE DAĞILIM (PIE) + LİSTE */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="card-kurumsal">
                            <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <div className="text-[13px] font-semibold text-[#0f172a]">Kategoriye Gore Masraf Dagilimi</div>
                            </div>
                            <div className="p-4" style={{ height: 300 }}>
                                {masrafKategoriDagilimi.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={masrafKategoriDagilimi} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} %${((percent ?? 0) * 100).toFixed(0)}`} labelLine={false} style={{ fontSize: 10, fontWeight: 600 }}>
                                                {masrafKategoriDagilimi.map((_, idx) => <Cell key={idx} fill={MASRAF_COLORS[idx % MASRAF_COLORS.length]} />)}
                                            </Pie>
                                            <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} itemStyle={{ color: "#f1f5f9", fontWeight: 700 }} formatter={(value) => [`₺${fmtTL(Number(value))}`, ""]} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : <div className="h-full flex items-center justify-center text-sm text-slate-400 font-bold">Masraf verisi yok</div>}
                            </div>
                        </div>
                        <div className="card-kurumsal">
                            <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <div className="text-[13px] font-semibold text-[#0f172a]">Kategori Detay</div>
                            </div>
                            <div className="p-4 space-y-2">
                                {masrafKategoriDagilimi.map((k, i) => (
                                    <div key={k.name} className="flex items-center gap-3 py-1.5" style={{ borderBottom: i < masrafKategoriDagilimi.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: MASRAF_COLORS[i % MASRAF_COLORS.length] }}></span>
                                        <div className="flex-1 text-[12px] font-medium text-[#334155]">{k.name}</div>
                                        <div className="text-[12px] font-bold text-[#0f172a] tabular-nums">{`₺${fmtTL(k.value)}`}</div>
                                        <div className="text-[10px] text-[#94a3b8] w-10 text-right">{toplamMasraf > 0 ? `%${((k.value / toplamMasraf) * 100).toFixed(0)}` : "-"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* AYLIK MASRAF TRENDİ */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Aylik Masraf Trendi</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Son 12 ay</div>
                        </div>
                        <div className="p-4 md:p-5" style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={aylikMasrafTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="ay" tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }} formatter={(value) => [`₺${fmtTL(Number(value))}`, "Masraf"]} />
                                    <Bar dataKey="tutar" fill="#dc2626" radius={[2, 2, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* GELİR vs GİDER KARŞILAŞTIRMASI */}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Gelir vs Gider Karsilastirmasi</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">Son 12 ay satis geliri ile masraf karsilastirmasi</div>
                        </div>
                        <div className="p-4 md:p-5" style={{ height: 340 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={gelirGiderKarsilastirma} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="ay" tick={{ fontSize: 10, fontWeight: 600, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fontWeight: 500, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()} />
                                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: 0, padding: "8px 14px", fontSize: 12 }} labelStyle={{ color: "#64748b", fontSize: 11, fontWeight: 600 }} itemStyle={{ color: "#f1f5f9", fontSize: 12, fontWeight: 600 }} formatter={(value) => [`₺${fmtTL(Number(value))}`, ""]} />
                                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                                    <Bar dataKey="gelir" fill="#059669" name="Gelir" radius={[2, 2, 0, 0]} maxBarSize={28} />
                                    <Bar dataKey="gider" fill="#dc2626" name="Gider" radius={[2, 2, 0, 0]} maxBarSize={28} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>}

                {sekme === "gelir-tablosu" && <>
                    {/* NET KAR ÖZET */}
                    <div className={`p-5 text-center ${gtNetKar >= 0 ? "bg-[#f0fdf4]" : "bg-[#fef2f2]"}`} style={{ border: `2px solid ${gtNetKar >= 0 ? "#bbf7d0" : "#fecaca"}` }}>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Net Kar / Zarar</div>
                        <div className={`text-2xl font-bold ${gtNetKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>{`₺${fmtTL(gtNetKar)}`}</div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* BRÜT SATIŞLAR */}
                        <div className="bg-white border border-slate-200">
                            <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-[#0f172a] uppercase tracking-wider" style={{ borderBottom: "1px solid var(--c-border)" }}>A. Brut Satislar</div>
                            <div className="flex justify-between px-4 py-2 text-xs" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <span className="pl-3 text-slate-600">Yurt Ici Satislar</span>
                                <span className="font-bold">{`₺${fmtTL(gtBrutSatislar)}`}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2 bg-slate-50 text-xs font-bold" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <span>= NET SATISLAR</span>
                                <span className={gtNetSatislar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}>{`₺${fmtTL(gtNetSatislar)}`}</span>
                            </div>
                        </div>

                        {/* SATIŞLARIN MALİYETİ */}
                        <div className="bg-white border border-slate-200">
                            <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-[#0f172a] uppercase tracking-wider" style={{ borderBottom: "1px solid var(--c-border)" }}>B. Satislarin Maliyeti</div>
                            <div className="flex justify-between px-4 py-2 text-xs" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <span className="pl-3 text-slate-600">Ticari Mal Alislari</span>
                                <span className="font-bold text-[#dc2626]">{`-₺${fmtTL(gtAlislar)}`}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2 bg-slate-50 text-xs font-bold" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <span>= BRUT KAR / ZARAR</span>
                                <span className={gtBrutKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}>{`₺${fmtTL(gtBrutKar)}`}</span>
                            </div>
                        </div>

                        {/* FAALİYET GİDERLERİ */}
                        <div className="bg-white border border-slate-200">
                            <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-[#0f172a] uppercase tracking-wider" style={{ borderBottom: "1px solid var(--c-border)" }}>C. Faaliyet Giderleri</div>
                            <div className="flex justify-between px-4 py-2 text-xs" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <span className="pl-3 text-slate-600">Toplam Masraflar</span>
                                <span className="font-bold text-[#dc2626]">{`-₺${fmtTL(gtFaaliyetGiderleri)}`}</span>
                            </div>
                            <div className="flex justify-between px-4 py-2 bg-slate-50 text-xs font-bold" style={{ borderBottom: "1px solid var(--c-border)" }}>
                                <span>= FAALIYET KARI / ZARARI</span>
                                <span className={gtNetKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}>{`₺${fmtTL(gtNetKar)}`}</span>
                            </div>
                        </div>

                        {/* ÖZET */}
                        <div className="bg-white border border-slate-200">
                            <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-[#0f172a] uppercase tracking-wider" style={{ borderBottom: "1px solid var(--c-border)" }}>Ozet</div>
                            <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                                <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}><span className="text-slate-500">Satis Faturasi</span><span className="font-bold">{`₺${fmtTL(gtBrutSatislar)}`}</span></div>
                                <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}><span className="text-slate-500">Alis Faturasi</span><span className="font-bold text-[#dc2626]">{`₺${fmtTL(gtAlislar)}`}</span></div>
                                <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}><span className="text-slate-500">Masraflar</span><span className="font-bold text-[#dc2626]">{`₺${fmtTL(gtFaaliyetGiderleri)}`}</span></div>
                                <div className="flex justify-between py-1" style={{ borderBottom: "1px solid #f1f5f9" }}><span className="text-slate-500">Net Kar</span><span className={`font-bold ${gtNetKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>{`₺${fmtTL(gtNetKar)}`}</span></div>
                            </div>
                            {gtNetSatislar > 0 && <div className="px-4 pb-3 text-[10px] text-slate-400 text-center">Kar Marji: %{((gtNetKar / gtNetSatislar) * 100).toFixed(1)}</div>}
                        </div>
                    </div>
                </>}

                {/* YEVMİYE SEKMESİ */}
                {sekme === "yevmiye" && <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 p-4">
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Toplam Borc</div>
                            <div className="text-[16px] font-bold text-[#dc2626]">{`₺${fmtTL(yevToplamBorc)}`}</div>
                        </div>
                        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 p-4">
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Toplam Alacak</div>
                            <div className="text-[16px] font-bold text-[#059669]">{`₺${fmtTL(yevToplamAlacak)}`}</div>
                        </div>
                        <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 p-4">
                            <div className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Fark</div>
                            <div className={`text-[16px] font-bold ${Math.abs(yevToplamBorc - yevToplamAlacak) < 0.01 ? "text-[#059669]" : "text-[#f59e0b]"}`}>{`₺${fmtTL(Math.abs(yevToplamBorc - yevToplamAlacak))}`}</div>
                        </div>
                    </div>
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Yevmiye Kayitlari</div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">{yevmiyeKayitlari.length} kayit</div>
                        </div>
                        <div className="overflow-auto" style={{ maxHeight: 400 }}>
                            <table className="tbl-kurumsal">
                                <thead><tr><th className="w-24 text-center">Tarih</th><th className="w-28">Fis No</th><th>Aciklama</th><th className="w-20 text-center">Hesap</th><th className="w-28 text-right">Borc</th><th className="w-28 text-right">Alacak</th><th className="w-20 text-center">Kaynak</th></tr></thead>
                                <tbody>
                                    {yevmiyeKayitlari.length === 0 ? (
                                        <tr><td colSpan={7} className="p-6 text-center text-slate-400 text-xs font-bold uppercase">Yevmiye kaydi bulunamadi. Yevmiye Defteri sayfasindan senkronize edin.</td></tr>
                                    ) : yevmiyeKayitlari.slice(0, 200).map(k => (
                                        <tr key={k.id} className="bg-white hover:bg-slate-50">
                                            <td className="text-center text-xs">{new Date(k.tarih).toLocaleDateString("tr-TR")}</td>
                                            <td className="font-mono text-xs font-bold text-slate-600">{k.fis_no}</td>
                                            <td className="text-xs text-slate-700 truncate max-w-[200px]">{k.aciklama}</td>
                                            <td className="text-center font-mono text-xs font-bold">{k.hesap_kodu}</td>
                                            <td className="text-right text-xs font-semibold">{Number(k.borc) > 0 ? <span className="text-[#dc2626]">{fmtTL(Number(k.borc))}</span> : ""}</td>
                                            <td className="text-right text-xs font-semibold">{Number(k.alacak) > 0 ? <span className="text-[#059669]">{fmtTL(Number(k.alacak))}</span> : ""}</td>
                                            <td className="text-center"><span className="inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ background: (KAYNAK_RENK[k.kaynak] || "#64748b") + "18", color: KAYNAK_RENK[k.kaynak] || "#64748b" }}>{k.kaynak}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {yevmiyeKayitlari.length > 0 && (
                            <div className="px-4 py-2 bg-slate-50 flex justify-between text-xs font-bold" style={{ borderTop: "1px solid var(--c-border)" }}>
                                <span className="text-slate-500">{yevmiyeKayitlari.length} kayit {yevmiyeKayitlari.length > 200 ? "(ilk 200 gosteriliyor)" : ""}</span>
                                <div className="flex gap-4"><span className="text-[#dc2626]">B: {fmtTL(yevToplamBorc)}</span><span className="text-[#059669]">A: {fmtTL(yevToplamAlacak)}</span></div>
                            </div>
                        )}
                    </div>
                </>}

                {/* MİZAN SEKMESİ */}
                {sekme === "mizan" && <>
                    {mizanSatirlari.length > 0 && (
                        <div className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${mizDengeli ? "bg-[#f0fdf4] text-[#059669]" : "bg-[#fef2f2] text-[#dc2626]"}`} style={{ border: `1px solid ${mizDengeli ? "#bbf7d0" : "#fecaca"}` }}>
                            <i className={`fas ${mizDengeli ? "fa-check-circle" : "fa-exclamation-triangle"}`} />
                            {mizDengeli ? "Mizan dengede" : `Mizan dengede degil! Fark: ${fmtTL(Math.abs(mizBorc - mizAlacak))} TL`}
                        </div>
                    )}
                    <div className="card-kurumsal">
                        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="text-[13px] font-semibold text-[#0f172a]">Mizan Tablosu</div>
                        </div>
                        <table className="tbl-kurumsal">
                            <thead><tr><th className="w-24 text-center">Hesap Kodu</th><th>Hesap Adi</th><th className="w-28 text-right">Toplam Borc</th><th className="w-28 text-right">Toplam Alacak</th><th className="w-28 text-right">Borc Bakiye</th><th className="w-28 text-right">Alacak Bakiye</th></tr></thead>
                            <tbody>
                                {mizanSatirlari.length === 0 ? (
                                    <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-xs font-bold uppercase">Yevmiye kaydi bulunamadi</td></tr>
                                ) : <>
                                    {mizanSatirlari.map(s => (
                                        <tr key={s.hesap_kodu} className="bg-white hover:bg-slate-50">
                                            <td className="text-center font-mono text-xs font-bold">{s.hesap_kodu}</td>
                                            <td className="text-xs font-semibold text-slate-700">{s.hesap_adi}</td>
                                            <td className="text-right text-xs font-semibold text-[#dc2626]">{s.toplamBorc > 0 ? fmtTL(s.toplamBorc) : "-"}</td>
                                            <td className="text-right text-xs font-semibold text-[#059669]">{s.toplamAlacak > 0 ? fmtTL(s.toplamAlacak) : "-"}</td>
                                            <td className="text-right text-xs font-bold text-[#dc2626]">{s.borcBakiye > 0 ? fmtTL(s.borcBakiye) : "-"}</td>
                                            <td className="text-right text-xs font-bold text-[#059669]">{s.alacakBakiye > 0 ? fmtTL(s.alacakBakiye) : "-"}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-100 font-bold" style={{ borderTop: "2px solid var(--c-border)" }}>
                                        <td className="text-center text-xs">-</td><td className="text-xs uppercase">Toplam</td>
                                        <td className="text-right text-xs text-[#dc2626]">{fmtTL(mizBorc)}</td>
                                        <td className="text-right text-xs text-[#059669]">{fmtTL(mizAlacak)}</td>
                                        <td className="text-right text-xs text-[#dc2626]">{fmtTL(mizanSatirlari.reduce((a, s) => a + s.borcBakiye, 0))}</td>
                                        <td className="text-right text-xs text-[#059669]">{fmtTL(mizanSatirlari.reduce((a, s) => a + s.alacakBakiye, 0))}</td>
                                    </tr>
                                </>}
                            </tbody>
                        </table>
                    </div>
                </>}

                {/* BİLANCO SEKMESİ */}
                {sekme === "bilanco" && <>
                    {yevmiyeKayitlari.length > 0 && (
                        <div className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${bilDengeli ? "bg-[#f0fdf4] text-[#059669]" : "bg-[#fef2f2] text-[#dc2626]"}`} style={{ border: `1px solid ${bilDengeli ? "#bbf7d0" : "#fecaca"}` }}>
                            <i className={`fas ${bilDengeli ? "fa-check-circle" : "fa-exclamation-triangle"}`} />
                            {bilDengeli ? "Bilanco dengede. Aktif = Pasif" : `Bilanco dengede degil! Fark: ${fmtTL(Math.abs(bilToplamAktif - bilToplamPasif))} TL`}
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className={`p-4 text-center ${bilToplamAktif > 0 ? "bg-[#eff6ff]" : "bg-slate-50"}`} style={{ border: "2px solid #bfdbfe" }}>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Toplam Aktif</div>
                            <div className="text-xl font-bold text-[#1d4ed8]">{`₺${fmtTL(bilToplamAktif)}`}</div>
                        </div>
                        <div className={`p-4 text-center ${bilToplamPasif > 0 ? "bg-[#faf5ff]" : "bg-slate-50"}`} style={{ border: "2px solid #d8b4fe" }}>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Toplam Pasif</div>
                            <div className="text-xl font-bold text-[#7c3aed]">{`₺${fmtTL(bilToplamPasif)}`}</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* AKTİF */}
                        <div className="bg-white border border-slate-200">
                            <div className="px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider" style={{ background: "#1e3a5f" }}>Aktif (Varliklar)</div>
                            <div className="px-4 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ borderBottom: "1px solid var(--c-border)" }}>Donen Varliklar</div>
                            {[{ l: "Kasa (100)", v: bilKasa }, { l: "Bankalar (102)", v: bilBanka }, { l: "Alicilar (120)", v: bilAlici }, { l: "Ticari Mallar (153)", v: bilTicMal }].map(r => (
                                <div key={r.l} className="flex justify-between px-4 py-2 text-xs" style={{ borderBottom: "1px solid #f1f5f9" }}><span className="pl-3 text-slate-600">{r.l}</span><span className="font-semibold">{fmtTL(r.v)} TL</span></div>
                            ))}
                            <div className="flex justify-between px-4 py-2 bg-slate-50 text-xs font-bold" style={{ borderBottom: "1px solid var(--c-border)" }}><span>TOPLAM AKTIF</span><span className="text-[#1d4ed8]">{fmtTL(bilToplamAktif)} TL</span></div>
                        </div>
                        {/* PASİF */}
                        <div className="bg-white border border-slate-200">
                            <div className="px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider" style={{ background: "#581c87" }}>Pasif (Kaynaklar)</div>
                            <div className="px-4 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ borderBottom: "1px solid var(--c-border)" }}>Kisa Vadeli Yukumlulukler</div>
                            <div className="flex justify-between px-4 py-2 text-xs" style={{ borderBottom: "1px solid #f1f5f9" }}><span className="pl-3 text-slate-600">Saticilar (320)</span><span className="font-semibold">{fmtTL(bilSatici)} TL</span></div>
                            <div className="px-4 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ borderBottom: "1px solid var(--c-border)" }}>Ozkaynaklar</div>
                            <div className="flex justify-between px-4 py-2 text-xs" style={{ borderBottom: "1px solid #f1f5f9" }}><span className="pl-3 text-slate-600">Net Kar / Zarar</span><span className={`font-semibold ${bilNetKar >= 0 ? "text-[#059669]" : "text-[#dc2626]"}`}>{fmtTL(bilNetKar)} TL</span></div>
                            <div className="flex justify-between px-4 py-2 bg-slate-50 text-xs font-bold" style={{ borderBottom: "1px solid var(--c-border)" }}><span>TOPLAM PASIF</span><span className="text-[#7c3aed]">{fmtTL(bilToplamPasif)} TL</span></div>
                        </div>
                    </div>
                </>}
            </div>
        </main>
    );
}
