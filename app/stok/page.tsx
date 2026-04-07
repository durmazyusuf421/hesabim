"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
import Link from "next/link";
import { excelExport, pdfExport } from "@/app/lib/export";
import { useBirimler } from "@/app/lib/useBirimler";
interface Urun {
    id: number; urun_adi: string; barkod?: string; stok_miktari: number;
    birim: string; alis_fiyati: number; satis_fiyati: number; kdv_orani: number;
    aktif?: boolean; min_stok_miktari?: number; kategori_id?: number | null;
    doviz_turu?: string; doviz_fiyati?: number; lot_takibi?: boolean; seri_takibi?: boolean;
}
interface FormDataState {
    urun_adi: string; barkod: string; stok_miktari: number; birim: string;
    alis_fiyati: number; satis_fiyati: number; kdv_orani: number; min_stok_miktari: number;
    kategori_id: number | null; doviz_turu: string; doviz_fiyati: number; lot_takibi: boolean; seri_takibi: boolean;
}
interface LotSeriHareket { id: number; lot_no: string; seri_no: string; miktar: number; islem_tipi: string; uretim_tarihi: string | null; son_kullanma_tarihi: string | null; tedarikci: string | null; created_at: string; }
interface DovizKuru { doviz_turu: string; kur: number; tarih: string; }
interface Kategori {
    id: number; sirket_id: number; kategori_adi: string; renk: string; aktif: boolean;
}
interface Depo { id: number; sirket_id: number; depo_adi: string; adres: string | null; aktif: boolean; }
interface DepoStok { depo_id: number; urun_id: number; miktar: number; }

export default function StokKartlari() {
  const toast = useToast();
  const { onayla, OnayModal } = useOnayModal();
  const { aktifSirket, kullaniciRol, isYonetici, isDepocu } = useAuth();

  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [seciliUrunId, setSeciliUrunId] = useState<number | null>(null);
  const [aktifSekme, setAktifSekme] = useState<"aktif" | "pasif">("aktif");

  const [kritikStokFiltresi, setKritikStokFiltresi] = useState(false);
  // Toplu seçim
  const [seciliUrunler, setSeciliUrunler] = useState<Set<number>>(new Set());
  const [topluFiyatModal, setTopluFiyatModal] = useState(false);
  const [topluFiyatYuzde, setTopluFiyatYuzde] = useState("");
  const [topluFiyatTip, setTopluFiyatTip] = useState<"ARTIS" | "INDIRIM">("ARTIS");
  const [topluKategoriModal, setTopluKategoriModal] = useState(false);
  const [topluKategoriId, setTopluKategoriId] = useState<string>("");
  const [exportMenuAcik, setExportMenuAcik] = useState(false);
  // Lot/Seri modal
  const [lotModalAcik, setLotModalAcik] = useState(false);
  const [lotUrunId, setLotUrunId] = useState<number | null>(null);
  const [lotHareketler, setLotHareketler] = useState<LotSeriHareket[]>([]);
  const [lotYukleniyor, setLotYukleniyor] = useState(false);

  // Kategori stateleri
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);
  const [kategoriFiltre, setKategoriFiltre] = useState<number | "TUMU">("TUMU");
  const [kategoriModalAcik, setKategoriModalAcik] = useState(false);
  const [katFormAdi, setKatFormAdi] = useState("");
  const [katFormRenk, setKatFormRenk] = useState("#3B82F6");
  const [katDuzenleId, setKatDuzenleId] = useState<number | null>(null);
  const [dovizKurlari, setDovizKurlari] = useState<Record<string, number>>({ USD: 0, EUR: 0 });
  // Depo stateleri
  const [depolar, setDepolar] = useState<Depo[]>([]);
  const [depoStoklar, setDepoStoklar] = useState<DepoStok[]>([]);
  const [depoFiltre, setDepoFiltre] = useState<number | "TUMU">("TUMU");
  const [depoModalAcik, setDepoModalAcik] = useState(false);
  const [depoFormAdi, setDepoFormAdi] = useState("");
  const [depoFormAdres, setDepoFormAdres] = useState("");
  const [depoFormDuzenleId, setDepoFormDuzenleId] = useState<number | null>(null);
  // Transfer modal
  const [transferModalAcik, setTransferModalAcik] = useState(false);
  const [transferUrunId, setTransferUrunId] = useState<number | null>(null);
  const [transferKaynakDepo, setTransferKaynakDepo] = useState<string>("");
  const [transferHedefDepo, setTransferHedefDepo] = useState<string>("");
  const [transferMiktar, setTransferMiktar] = useState("");
  const { birimler: birimListesi, yenile: birimCacheYenile } = useBirimler();
  // Birim modal
  const [birimModalAcik, setBirimModalAcik] = useState(false);
  const [tumBirimler, setTumBirimler] = useState<{id:number;birim_adi:string;kisaltma:string;aktif:boolean}[]>([]);
  const [yeniBirimAdi, setYeniBirimAdi] = useState("");
  const [yeniBirimKisaltma, setYeniBirimKisaltma] = useState("");

  const [formData, setFormData] = useState<FormDataState>({
      urun_adi: "", barkod: "", stok_miktari: 0, birim: "Adet", alis_fiyati: 0, satis_fiyati: 0, kdv_orani: 20, min_stok_miktari: 0, kategori_id: null, doviz_turu: "TRY", doviz_fiyati: 0, lot_takibi: false, seri_takibi: false
  });

  async function verileriGetir(sirketId: number) {
      setYukleniyor(true);
      const [{ data, error }, { data: katData }, { data: kurData }, { data: depoData }, { data: dsData }] = await Promise.all([
          supabase.from("urunler").select("*").eq("sahip_sirket_id", sirketId).order('id', { ascending: false }),
          supabase.from("urun_kategorileri").select("*").eq("sirket_id", sirketId).eq("aktif", true).order("kategori_adi"),
          supabase.from("doviz_kurlari").select("doviz_turu, kur").order("tarih", { ascending: false }).limit(10),
          supabase.from("depolar").select("*").eq("sirket_id", sirketId).eq("aktif", true).order("depo_adi"),
          supabase.from("depo_stok").select("depo_id, urun_id, miktar"),
      ]);
      if (!error && data) setUrunler(data);
      setKategoriler(katData || []);
      const kurMap: Record<string, number> = { USD: 0, EUR: 0 };
      (kurData || []).forEach(k => { if (!kurMap[k.doviz_turu] || kurMap[k.doviz_turu] === 0) kurMap[k.doviz_turu] = Number(k.kur); });
      setDovizKurlari(kurMap);
      setDepolar(depoData || []);
      setDepoStoklar(dsData || []);
      setYukleniyor(false);
  }

  useEffect(() => {
    if (!aktifSirket) return;

    if (kullaniciRol.includes("YONETICI") || kullaniciRol.includes("DEPOCU") || aktifSirket.rol === "PERAKENDE") {
        verileriGetir(aktifSirket.id);
    } else {
        setYukleniyor(false);
    }
  }, [aktifSirket, kullaniciRol]);

  const hasAccess = aktifSirket?.rol === "PERAKENDE" || isDepocu;

  const yeniUrunEkle = () => {
      setDuzenlemeModu(false); setSeciliUrunId(null);
      setFormData({ urun_adi: "", barkod: "", stok_miktari: 0, birim: "Adet", alis_fiyati: 0, satis_fiyati: 0, kdv_orani: 20, min_stok_miktari: 0, kategori_id: null, doviz_turu: "TRY", doviz_fiyati: 0, lot_takibi: false, seri_takibi: false });
      setModalAcik(true);
  };

  const urunDuzenle = (urun: Urun) => {
      setDuzenlemeModu(true); setSeciliUrunId(urun.id);
      setFormData({
          urun_adi: urun.urun_adi, barkod: urun.barkod || "", stok_miktari: urun.stok_miktari, birim: urun.birim,
          alis_fiyati: urun.alis_fiyati, satis_fiyati: urun.satis_fiyati, kdv_orani: urun.kdv_orani, min_stok_miktari: urun.min_stok_miktari || 0,
          kategori_id: urun.kategori_id || null, doviz_turu: urun.doviz_turu || "TRY", doviz_fiyati: Number(urun.doviz_fiyati) || 0,
          lot_takibi: urun.lot_takibi || false, seri_takibi: urun.seri_takibi || false
      });
      setModalAcik(true);
  };

  const dovizTlKarsiligi = (dovizTuru: string, dovizFiyat: number) => {
      if (dovizTuru === "TRY" || !dovizFiyat) return 0;
      return dovizFiyat * (dovizKurlari[dovizTuru] || 0);
  };

  const dovizSembol: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };

  const formuKaydet = async () => {
      if (!formData.urun_adi) { toast.error("Ürün adı zorunludur!"); return; }
      const kaydedilecekVeri = { ...formData, sahip_sirket_id: aktifSirket?.id };

      if (duzenlemeModu && seciliUrunId) {
          const { error } = await supabase.from("urunler").update(kaydedilecekVeri).eq("id", seciliUrunId);
          if (error) { toast.error("Hata: " + error.message); return; }
      } else {
          const { error } = await supabase.from("urunler").insert([kaydedilecekVeri]);
          if (error) { toast.error("Hata: " + error.message); return; }
      }
      setModalAcik(false);
      toast.success("Ürün başarıyla kaydedildi!");
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  const urunSil = (id: number) => {
      onayla({
          baslik: "Ürün Sil",
          mesaj: "Bu ürünü kalıcı olarak silmek istediğinize emin misiniz?",
          altMesaj: "Bu işlem geri alınamaz.",
          onayMetni: "Evet, Sil",
          tehlikeli: true,
          onOnayla: async () => {
              try {
                  const { error } = await supabase.from("urunler").delete().eq("id", id);
                  if (error) throw error;
                  toast.success("Ürün başarıyla silindi.");
                  if (aktifSirket) verileriGetir(aktifSirket.id);
              } catch (error: unknown) {
                  const message = error instanceof Error ? error.message : String(error);
                  toast.error("Silme hatası: " + message);
              }
          }
      });
  };

  const urunAktiflikDegistir = async (urun: Urun) => {
      const yeniDurum = !(urun.aktif !== false);
      const { error } = await supabase.from("urunler").update({ aktif: yeniDurum }).eq("id", urun.id);
      if (error) { toast.error("Hata: " + error.message); return; }
      toast.success(yeniDurum ? "Ürün aktif edildi." : "Ürün pasif edildi.");
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  // Kategori fonksiyonları
  const kategoriKaydet = async () => {
      if (!aktifSirket || !katFormAdi.trim()) { toast.error("Kategori adı zorunludur"); return; }
      if (katDuzenleId) {
          await supabase.from("urun_kategorileri").update({ kategori_adi: katFormAdi.trim(), renk: katFormRenk }).eq("id", katDuzenleId);
          toast.success("Kategori güncellendi");
      } else {
          await supabase.from("urun_kategorileri").insert({ sirket_id: aktifSirket.id, kategori_adi: katFormAdi.trim(), renk: katFormRenk });
          toast.success("Kategori eklendi");
      }
      setKatFormAdi(""); setKatFormRenk("#3B82F6"); setKatDuzenleId(null);
      verileriGetir(aktifSirket.id);
  };

  const kategoriSil = async (id: number) => {
      if (!aktifSirket) return;
      await supabase.from("urunler").update({ kategori_id: null }).eq("kategori_id", id);
      await supabase.from("urun_kategorileri").delete().eq("id", id);
      toast.success("Kategori silindi");
      if (kategoriFiltre === id) setKategoriFiltre("TUMU");
      verileriGetir(aktifSirket.id);
  };

  const kategoriMap = Object.fromEntries(kategoriler.map(k => [k.id, k]));

  // Birim fonksiyonları
  const birimModalAc = async () => {
      if (!aktifSirket) return;
      const { data } = await supabase.from("birimler").select("id, birim_adi, kisaltma, aktif").eq("sirket_id", aktifSirket.id).order("birim_adi");
      setTumBirimler(data || []);
      setYeniBirimAdi(""); setYeniBirimKisaltma("");
      setBirimModalAcik(true);
  };
  const birimEkle = async () => {
      if (!aktifSirket || !yeniBirimAdi.trim()) { toast.error("Birim adı zorunludur!"); return; }
      const { error } = await supabase.from("birimler").insert({ sirket_id: aktifSirket.id, birim_adi: yeniBirimAdi.trim(), kisaltma: yeniBirimKisaltma.trim() || yeniBirimAdi.trim() });
      if (error) { toast.error("Birim eklenemedi: " + error.message); return; }
      toast.success("Birim eklendi.");
      setYeniBirimAdi(""); setYeniBirimKisaltma("");
      const { data } = await supabase.from("birimler").select("id, birim_adi, kisaltma, aktif").eq("sirket_id", aktifSirket.id).order("birim_adi");
      setTumBirimler(data || []);
      birimCacheYenile();
  };
  const birimSil = async (b: {id:number;birim_adi:string;kisaltma:string}) => {
      if (!aktifSirket) return;
      const [{ count: c1 }, { count: c2 }] = await Promise.all([
          supabase.from("urunler").select("id", { count: "exact", head: true }).eq("sahip_sirket_id", aktifSirket.id).eq("birim", b.kisaltma),
          supabase.from("fatura_detaylari").select("id", { count: "exact", head: true }).eq("birim", b.kisaltma),
      ]);
      if ((c1 || 0) > 0 || (c2 || 0) > 0) { toast.error(`"${b.birim_adi}" kullanımda olduğu için silinemez!`); return; }
      onayla({ baslik: "Birim Sil", mesaj: `"${b.birim_adi}" silinsin mi?`, onayMetni: "Sil", tehlikeli: true, onOnayla: async () => {
          await supabase.from("birimler").delete().eq("id", b.id);
          const { data } = await supabase.from("birimler").select("id, birim_adi, kisaltma, aktif").eq("sirket_id", aktifSirket!.id).order("birim_adi");
          setTumBirimler(data || []);
          birimCacheYenile();
      }});
  };
  const birimAktifToggle = async (b: {id:number;aktif:boolean}) => {
      if (!aktifSirket) return;
      await supabase.from("birimler").update({ aktif: !b.aktif }).eq("id", b.id);
      const { data } = await supabase.from("birimler").select("id, birim_adi, kisaltma, aktif").eq("sirket_id", aktifSirket.id).order("birim_adi");
      setTumBirimler(data || []);
      birimCacheYenile();
  };
  const varsayilanBirimlerYukle = async () => {
      if (!aktifSirket) return;
      const varsayilanlar = [
          { birim_adi: "Adet", kisaltma: "Adet" }, { birim_adi: "Kilogram", kisaltma: "Kg" },
          { birim_adi: "Litre", kisaltma: "Lt" }, { birim_adi: "Metre", kisaltma: "Mt" },
          { birim_adi: "Koli", kisaltma: "Koli" }, { birim_adi: "Paket", kisaltma: "Paket" },
          { birim_adi: "Ton", kisaltma: "Ton" }, { birim_adi: "Kutu", kisaltma: "Kutu" },
          { birim_adi: "Çuval", kisaltma: "Çuval" }, { birim_adi: "Gram", kisaltma: "Gr" },
      ];
      const mevcutKisaltmalar = new Set(tumBirimler.map(b => b.kisaltma));
      const eklenecekler = varsayilanlar.filter(v => !mevcutKisaltmalar.has(v.kisaltma)).map(v => ({ ...v, sirket_id: aktifSirket.id }));
      if (eklenecekler.length === 0) { toast.info("Tüm varsayılan birimler zaten mevcut."); return; }
      await supabase.from("birimler").insert(eklenecekler);
      toast.success(`${eklenecekler.length} varsayılan birim eklendi.`);
      const { data } = await supabase.from("birimler").select("id, birim_adi, kisaltma, aktif").eq("sirket_id", aktifSirket.id).order("birim_adi");
      setTumBirimler(data || []);
      birimCacheYenile();
  };

  // Depo fonksiyonları
  const depoKaydet = async () => {
      if (!aktifSirket || !depoFormAdi.trim()) { toast.error("Depo adı zorunludur"); return; }
      if (depoFormDuzenleId) {
          await supabase.from("depolar").update({ depo_adi: depoFormAdi.trim(), adres: depoFormAdres.trim() || null }).eq("id", depoFormDuzenleId);
          toast.success("Depo güncellendi");
      } else {
          await supabase.from("depolar").insert({ sirket_id: aktifSirket.id, depo_adi: depoFormAdi.trim(), adres: depoFormAdres.trim() || null });
          toast.success("Depo eklendi");
      }
      setDepoFormAdi(""); setDepoFormAdres(""); setDepoFormDuzenleId(null);
      verileriGetir(aktifSirket.id);
  };

  const depoSil = async (id: number) => {
      if (!aktifSirket) return;
      await supabase.from("depo_stok").delete().eq("depo_id", id);
      await supabase.from("depolar").delete().eq("id", id);
      toast.success("Depo silindi");
      if (depoFiltre === id) setDepoFiltre("TUMU");
      verileriGetir(aktifSirket.id);
  };

  const depoTransferYap = async () => {
      if (!transferUrunId || !transferKaynakDepo || !transferHedefDepo || !transferMiktar) { toast.error("Tüm alanları doldurun"); return; }
      if (transferKaynakDepo === transferHedefDepo) { toast.error("Kaynak ve hedef depo aynı olamaz"); return; }
      const miktar = Number(transferMiktar);
      if (miktar <= 0) { toast.error("Geçerli miktar girin"); return; }
      const kaynakStok = depoStoklar.find(ds => ds.depo_id === Number(transferKaynakDepo) && ds.urun_id === transferUrunId);
      if (!kaynakStok || kaynakStok.miktar < miktar) { toast.error("Kaynak depoda yeterli stok yok"); return; }

      // Kaynaktan düş
      await supabase.from("depo_stok").update({ miktar: kaynakStok.miktar - miktar, updated_at: new Date().toISOString() }).eq("depo_id", Number(transferKaynakDepo)).eq("urun_id", transferUrunId);
      // Hedefe ekle
      const hedefStok = depoStoklar.find(ds => ds.depo_id === Number(transferHedefDepo) && ds.urun_id === transferUrunId);
      if (hedefStok) {
          await supabase.from("depo_stok").update({ miktar: hedefStok.miktar + miktar, updated_at: new Date().toISOString() }).eq("depo_id", Number(transferHedefDepo)).eq("urun_id", transferUrunId);
      } else {
          await supabase.from("depo_stok").insert({ depo_id: Number(transferHedefDepo), urun_id: transferUrunId, miktar });
      }
      toast.success("Transfer tamamlandı");
      setTransferModalAcik(false);
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  const urunDepoStok = (urunId: number) => depoStoklar.filter(ds => ds.urun_id === urunId && ds.miktar > 0);
  const depoMap = Object.fromEntries(depolar.map(d => [d.id, d]));

  // Lot/Seri geçmişi
  const lotGecmisiAc = async (urunId: number) => {
      if (!aktifSirket) return;
      setLotUrunId(urunId); setLotModalAcik(true); setLotYukleniyor(true);
      const { data } = await supabase.from("lot_seri_hareketleri").select("*").eq("sirket_id", aktifSirket.id).eq("urun_id", urunId).order("created_at", { ascending: false });
      setLotHareketler(data || []);
      setLotYukleniyor(false);
  };

  // Lot bazında stok durumu hesapla
  const lotStokDurumu = () => {
      const map: Record<string, { lot_no: string; miktar: number; son_kullanma: string | null; tedarikci: string | null }> = {};
      lotHareketler.forEach(h => {
          const key = h.lot_no || h.seri_no || `#${h.id}`;
          if (!map[key]) map[key] = { lot_no: key, miktar: 0, son_kullanma: h.son_kullanma_tarihi, tedarikci: h.tedarikci };
          if (h.islem_tipi === "GIRIS") map[key].miktar += Number(h.miktar);
          else map[key].miktar -= Number(h.miktar);
      });
      return Object.values(map).filter(l => l.miktar > 0);
  };

  // Toplu işlem fonksiyonları
  const topluSecimToggle = (id: number) => {
      const yeni = new Set(seciliUrunler);
      if (yeni.has(id)) yeni.delete(id); else yeni.add(id);
      setSeciliUrunler(yeni);
  };
  const tumunuSec = (urunIds: number[]) => {
      if (seciliUrunler.size === urunIds.length) setSeciliUrunler(new Set());
      else setSeciliUrunler(new Set(urunIds));
  };
  const topluPasifYap = async () => {
      for (const id of seciliUrunler) await supabase.from("urunler").update({ aktif: false }).eq("id", id);
      toast.success(`${seciliUrunler.size} ürün pasife alındı`); setSeciliUrunler(new Set());
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };
  const topluAktifYap = async () => {
      for (const id of seciliUrunler) await supabase.from("urunler").update({ aktif: true }).eq("id", id);
      toast.success(`${seciliUrunler.size} ürün aktife alındı`); setSeciliUrunler(new Set());
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };
  const topluSilIslem = () => {
      onayla({ baslik: "Toplu Sil", mesaj: `${seciliUrunler.size} ürünü silmek istediğinize emin misiniz?`, altMesaj: "Bu işlem geri alınamaz.", onayMetni: "Sil", tehlikeli: true, onOnayla: async () => {
          for (const id of seciliUrunler) await supabase.from("urunler").delete().eq("id", id);
          toast.success(`${seciliUrunler.size} ürün silindi`); setSeciliUrunler(new Set());
          if (aktifSirket) verileriGetir(aktifSirket.id);
      }});
  };
  const topluFiyatUygula = async () => {
      const yuzde = Number(topluFiyatYuzde);
      if (!yuzde || yuzde <= 0) { toast.error("Geçerli yüzde girin"); return; }
      const carpan = topluFiyatTip === "ARTIS" ? (1 + yuzde / 100) : (1 - yuzde / 100);
      for (const id of seciliUrunler) {
          const urun = urunler.find(u => u.id === id);
          if (urun) await supabase.from("urunler").update({ satis_fiyati: Math.round(Number(urun.satis_fiyati) * carpan * 100) / 100 }).eq("id", id);
      }
      toast.success(`${seciliUrunler.size} ürüne %${yuzde} ${topluFiyatTip === "ARTIS" ? "artış" : "indirim"} uygulandı`);
      setSeciliUrunler(new Set()); setTopluFiyatModal(false);
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };
  const topluKategoriAta = async () => {
      const katId = topluKategoriId ? Number(topluKategoriId) : null;
      for (const id of seciliUrunler) await supabase.from("urunler").update({ kategori_id: katId }).eq("id", id);
      toast.success(`${seciliUrunler.size} ürüne kategori atandı`);
      setSeciliUrunler(new Set()); setTopluKategoriModal(false);
      if (aktifSirket) verileriGetir(aktifSirket.id);
  };

  const kritikStokSayisi = urunler.filter(u => u.aktif !== false && (u.min_stok_miktari || 0) > 0 && Number(u.stok_miktari) <= Number(u.min_stok_miktari)).length;

  const filtrelenmisUrunler = urunler
      .filter(u => aktifSekme === "aktif" ? (u.aktif !== false) : (u.aktif === false))
      .filter(u => u.urun_adi.toLowerCase().includes(aramaTerimi.toLowerCase()) || (u.barkod && u.barkod.includes(aramaTerimi)))
      .filter(u => !kritikStokFiltresi || ((u.min_stok_miktari || 0) > 0 && Number(u.stok_miktari) <= Number(u.min_stok_miktari)))
      .filter(u => kategoriFiltre === "TUMU" || u.kategori_id === kategoriFiltre);

  if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "var(--c-bg)" }}>Sistem Doğrulanıyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ background: "#f8fafc" }}>
                <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Stok Kartları sayfasına erişim yetkiniz bulunmamaktadır.</p>
            </div>
        ) : (
            <>
                {/* ÜST SATIR: Butonlar + Arama */}
                <div className="flex items-center justify-between px-4 py-2 shrink-0 flex-wrap gap-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <div className="flex items-center gap-2">
                        <button onClick={yeniUrunEkle} className="btn-primary flex items-center gap-2"><i className="fas fa-plus text-[10px]" /> YENİ ÜRÜN</button>
                        <Link href="/stok/toplu-fiyat" className="btn-secondary flex items-center gap-2"><i className="fas fa-tags text-[10px]" /> TOPLU FİYAT</Link>
                        <Link href="/stok/sayim" className="btn-secondary flex items-center gap-2"><i className="fas fa-clipboard-check text-[10px]" /> STOK SAYIMI</Link>
                        <button onClick={() => { setKatFormAdi(""); setKatFormRenk("#3B82F6"); setKatDuzenleId(null); setKategoriModalAcik(true); }} className="btn-secondary flex items-center gap-2"><i className="fas fa-folder text-[10px]" /> KATEGORİLER</button>
                        <button onClick={birimModalAc} className="btn-secondary flex items-center gap-2"><i className="fas fa-ruler text-[10px]" /> BİRİMLER</button>
                        <button onClick={() => { setDepoFormAdi(""); setDepoFormAdres(""); setDepoFormDuzenleId(null); setDepoModalAcik(true); }} className="btn-secondary flex items-center gap-2"><i className="fas fa-warehouse text-[10px]" /> DEPOLAR</button>
                        <div className="relative">
                            <button onClick={() => setExportMenuAcik(!exportMenuAcik)} className="btn-secondary flex items-center gap-2"><i className="fas fa-download text-[10px]" /> DIŞA AKTAR</button>
                            {exportMenuAcik && (
                                <div className="absolute top-full left-0 mt-1 bg-white border border-[#e2e8f0] shadow-lg z-20 w-40" onClick={() => setExportMenuAcik(false)}>
                                    <button onClick={() => { const cols = [{header:"ID",key:"id",width:8},{header:"Ürün Adı",key:"urun_adi",width:30},{header:"Barkod",key:"barkod",width:15},{header:"Stok",key:"stok_miktari",width:10},{header:"Birim",key:"birim",width:10},{header:"Alış",key:"alis_fiyati",width:12},{header:"Satış",key:"satis_fiyati",width:12},{header:"KDV %",key:"kdv_orani",width:8},{header:"Kategori",key:"kategori",width:15},{header:"Durum",key:"durum",width:10}]; const d = filtrelenmisUrunler.map(u => ({...u, kategori: u.kategori_id && kategoriMap[u.kategori_id] ? kategoriMap[u.kategori_id].kategori_adi : "", durum: u.aktif !== false ? "Aktif" : "Pasif"})); excelExport(d as unknown as Record<string,unknown>[], cols, "stok_kartlari"); }} className="w-full px-3 py-2 text-left text-[11px] font-semibold hover:bg-[#f8fafc] flex items-center gap-2"><i className="fas fa-file-excel text-[#059669]" /> Excel (.xlsx)</button>
                                    <button onClick={() => { const cols = [{header:"ID",key:"id",width:8},{header:"Ürün Adı",key:"urun_adi",width:30},{header:"Barkod",key:"barkod",width:15},{header:"Stok",key:"stok_miktari",width:10},{header:"Birim",key:"birim",width:10},{header:"Alış",key:"alis_fiyati",width:12},{header:"Satış",key:"satis_fiyati",width:12},{header:"KDV %",key:"kdv_orani",width:8},{header:"Kategori",key:"kategori",width:15},{header:"Durum",key:"durum",width:10}]; const d = filtrelenmisUrunler.map(u => ({...u, kategori: u.kategori_id && kategoriMap[u.kategori_id] ? kategoriMap[u.kategori_id].kategori_adi : "", durum: u.aktif !== false ? "Aktif" : "Pasif"})); pdfExport(d as unknown as Record<string,unknown>[], cols, "stok_kartlari", "Stok Kartları Listesi"); }} className="w-full px-3 py-2 text-left text-[11px] font-semibold hover:bg-[#f8fafc] flex items-center gap-2"><i className="fas fa-file-pdf text-[#dc2626]" /> PDF (.pdf)</button>
                                </div>
                            )}
                        </div>
                        <button onClick={() => { setKritikStokFiltresi(!kritikStokFiltresi); if (!kritikStokFiltresi) setAktifSekme("aktif"); }} className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border transition-colors ${kritikStokFiltresi ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'}`}>
                            <i className="fas fa-exclamation-triangle text-[10px]" /> KRİTİK STOK ({kritikStokSayisi})
                        </button>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {depolar.length > 0 && (
                            <select value={depoFiltre === "TUMU" ? "TUMU" : depoFiltre} onChange={e => setDepoFiltre(e.target.value === "TUMU" ? "TUMU" : Number(e.target.value))} className="input-kurumsal text-[11px] h-8 w-auto">
                                <option value="TUMU">Tüm Depolar</option>
                                {depolar.map(d => <option key={d.id} value={d.id}>{d.depo_adi}</option>)}
                            </select>
                        )}
                        <select value={kategoriFiltre === "TUMU" ? "TUMU" : kategoriFiltre} onChange={e => setKategoriFiltre(e.target.value === "TUMU" ? "TUMU" : Number(e.target.value))} className="input-kurumsal text-[11px] h-8 w-auto">
                            <option value="TUMU">Tüm Kategoriler</option>
                            {kategoriler.map(k => <option key={k.id} value={k.id}>{k.kategori_adi}</option>)}
                        </select>
                        <div className="relative flex-1 sm:flex-none">
                            <input type="text" placeholder="Ürün adı veya barkod ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-full sm:w-64" />
                            <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] text-[10px]" />
                        </div>
                    </div>
                </div>

                {/* TOPLU İŞLEM BARI */}
                {seciliUrunler.size > 0 && (
                    <div className="flex items-center gap-2 px-4 py-1.5 shrink-0 flex-wrap" style={{ background: "#eff6ff", borderBottom: "1px solid #bfdbfe" }}>
                        <span className="text-[11px] font-bold text-[#1d4ed8]"><i className="fas fa-check-square mr-1" />{seciliUrunler.size} ürün seçildi</span>
                        <div className="flex items-center gap-1 ml-2">
                            <button onClick={topluAktifYap} className="px-2 py-1 text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors"><i className="fas fa-toggle-on mr-1" />Aktif Yap</button>
                            <button onClick={topluPasifYap} className="px-2 py-1 text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors"><i className="fas fa-toggle-off mr-1" />Pasif Yap</button>
                            <button onClick={() => { setTopluFiyatYuzde(""); setTopluFiyatTip("ARTIS"); setTopluFiyatModal(true); }} className="px-2 py-1 text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"><i className="fas fa-percent mr-1" />Fiyat Güncelle</button>
                            <button onClick={() => { setTopluKategoriId(""); setTopluKategoriModal(true); }} className="px-2 py-1 text-[9px] font-bold bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 transition-colors"><i className="fas fa-folder mr-1" />Kategori Ata</button>
                            <button onClick={topluSilIslem} className="px-2 py-1 text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"><i className="fas fa-trash mr-1" />Sil</button>
                        </div>
                        <button onClick={() => setSeciliUrunler(new Set())} className="ml-auto text-[9px] text-[#64748b] hover:text-[#0f172a]"><i className="fas fa-times mr-1" />Seçimi Kaldır</button>
                    </div>
                )}

                {/* ALT SATIR: Sekmeler */}
                <div className="flex items-center gap-0 px-4 pt-2 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <button onClick={() => { setAktifSekme("aktif"); setKritikStokFiltresi(false); }} className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider border border-slate-200 transition-colors ${aktifSekme === "aktif" && !kritikStokFiltresi ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                        <i className="fas fa-check-circle mr-1.5" />Aktif Ürünler ({urunler.filter(u => u.aktif !== false).length})
                    </button>
                    <button onClick={() => { setAktifSekme("pasif"); setKritikStokFiltresi(false); }} className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider border border-slate-200 border-l-0 transition-colors ${aktifSekme === "pasif" ? "bg-red-500 text-white border-red-500" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                        <i className="fas fa-ban mr-1.5" />Pasif Ürünler ({urunler.filter(u => u.aktif === false).length})
                    </button>
                </div>

                {/* KRİTİK STOK UYARI BANNER - sekmelerin altında, tablonun üstünde */}
                {kritikStokSayisi > 0 && !kritikStokFiltresi && (
                    <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca" }}>
                        <i className="fas fa-exclamation-triangle text-red-500"></i>
                        <span className="text-[12px] font-bold text-red-700">{kritikStokSayisi} ürün kritik stok seviyesinde!</span>
                        <button onClick={() => { setKritikStokFiltresi(true); setAktifSekme("aktif"); }} className="ml-auto text-[10px] font-bold text-red-600 hover:text-red-800 uppercase tracking-wider">Göster <i className="fas fa-arrow-right ml-1 text-[8px]"></i></button>
                    </div>
                )}

                <div className="flex-1 overflow-auto relative" style={{ background: "var(--c-bg)" }}>
                    {/* MOBİL KART GÖRÜNÜMÜ */}
                    <div className="md:hidden space-y-2 p-3">
                        {yukleniyor ? (
                            <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</div>
                        ) : filtrelenmisUrunler.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Stok Kartı Bulunamadı</div>
                        ) : (
                            filtrelenmisUrunler.map((u) => {
                                const kritik = (u.min_stok_miktari || 0) > 0 && Number(u.stok_miktari) <= Number(u.min_stok_miktari);
                                return (
                                <div key={u.id} className={`border p-3 hover:bg-slate-50 ${kritik ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[12px] font-semibold text-[#0f172a]">
                                            {kritik && <i className="fas fa-exclamation-triangle text-orange-500 mr-1.5"></i>}
                                            {u.urun_adi}
                                            {u.kategori_id && kategoriMap[u.kategori_id] && (
                                                <span className="ml-1.5 text-[8px] font-bold px-1 py-0 border inline-block align-middle" style={{ background: `${kategoriMap[u.kategori_id].renk}15`, color: kategoriMap[u.kategori_id].renk, borderColor: `${kategoriMap[u.kategori_id].renk}40` }}>{kategoriMap[u.kategori_id].kategori_adi}</span>
                                            )}
                                        </span>
                                        <span className={`text-[12px] font-semibold tabular-nums ${kritik ? 'text-[#dc2626]' : Number(u.stok_miktari) <= 0 ? 'text-[#dc2626]' : 'text-[#059669]'}`}>{u.stok_miktari} {u.birim}</span>
                                    </div>
                                    <div className="text-[11px] text-[#64748b]">
                                        {u.barkod ? `Barkod: ${u.barkod}` : 'Barkod yok'} | KDV: %{u.kdv_orani}
                                        {kritik && <span className="text-red-500 font-bold ml-2">| Min: {u.min_stok_miktari}</span>}
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => urunAktiflikDegistir(u)} className={`px-2 py-1 text-[10px] font-bold border transition-colors ${u.aktif !== false ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'}`} title={u.aktif !== false ? "Pasif Yap" : "Aktif Yap"}>
                                                <i className={`fas ${u.aktif !== false ? 'fa-toggle-on' : 'fa-toggle-off'} mr-1`}></i>{u.aktif !== false ? 'Aktif' : 'Pasif'}
                                            </button>
                                            <button onClick={() => urunDuzenle(u)} className="btn-secondary px-2 py-1 text-[10px]" title="Düzenle"><i className="fas fa-edit"></i></button>
                                            <button onClick={() => urunSil(u.id)} className="btn-secondary px-2 py-1 text-[10px]" title="Sil"><i className="fas fa-trash"></i></button>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[11px] text-[#94a3b8] mr-2">Alış: {Number(u.alis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</span>
                                            <span className="text-[12px] font-semibold tabular-nums text-[#1d4ed8]">{Number(u.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</span>
                                        </div>
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>
                    {/* MASAÜSTÜ TABLO GÖRÜNÜMÜ */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="tbl-kurumsal">
                            <thead>
                                <tr>
                                    <th className="w-8 text-center print:hidden"><input type="checkbox" checked={filtrelenmisUrunler.length > 0 && filtrelenmisUrunler.every(u => seciliUrunler.has(u.id))} onChange={() => tumunuSec(filtrelenmisUrunler.map(u => u.id))} className="cursor-pointer" /></th>
                                    <th className="w-16 text-center">ID</th>
                                    <th className="w-32 text-center">Barkod</th>
                                    <th>Ürün Adı</th>
                                    <th className="w-24 text-center">Mevcut Stok</th>
                                    <th className="w-20 text-center">Birim</th>
                                    <th className="w-28 text-right">Alış Fiyatı</th>
                                    <th className="w-28 text-right">Satış Fiyatı</th>
                                    <th className="w-20 text-center">KDV (%)</th>
                                    <th className="w-20 text-center print:hidden">Durum</th>
                                    <th className="w-24 text-center print:hidden">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {yukleniyor ? (
                                    <tr><td colSpan={11} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Yükleniyor...</td></tr>
                                ) : filtrelenmisUrunler.length === 0 ? (
                                    <tr><td colSpan={11} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Stok Kartı Bulunamadı</td></tr>
                                ) : (
                                    filtrelenmisUrunler.map((u) => {
                                        const kritik = (u.min_stok_miktari || 0) > 0 && Number(u.stok_miktari) <= Number(u.min_stok_miktari);
                                        return (
                                        <tr key={u.id} className={`text-[11px] font-medium border-b border-slate-200 transition-colors ${kritik ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                                            <td className="p-1.5 border-r border-slate-200 text-center print:hidden"><input type="checkbox" checked={seciliUrunler.has(u.id)} onChange={() => topluSecimToggle(u.id)} className="cursor-pointer" /></td>
                                            <td className="p-1.5 border-r border-slate-200 text-center text-slate-400">#{u.id}</td>
                                            <td className="p-1.5 border-r border-slate-200 text-center font-bold font-mono text-slate-600">{u.barkod || '-'}</td>
                                            <td className="p-1.5 border-r border-slate-200 font-bold text-slate-800">
                                                {kritik && <i className="fas fa-exclamation-triangle text-orange-500 mr-1.5"></i>}
                                                {u.urun_adi}
                                                {u.kategori_id && kategoriMap[u.kategori_id] && (
                                                    <span className="ml-1.5 text-[8px] font-bold px-1.5 py-0.5 border inline-block align-middle" style={{ background: `${kategoriMap[u.kategori_id].renk}15`, color: kategoriMap[u.kategori_id].renk, borderColor: `${kategoriMap[u.kategori_id].renk}40` }}>{kategoriMap[u.kategori_id].kategori_adi}</span>
                                                )}
                                                {u.lot_takibi && <span className="ml-1 text-[7px] font-bold px-1 py-0 bg-cyan-50 text-cyan-600 border border-cyan-200 inline-block align-middle" title="Lot Takibi Açık">LOT</span>}
                                                {u.seri_takibi && <span className="ml-1 text-[7px] font-bold px-1 py-0 bg-violet-50 text-violet-600 border border-violet-200 inline-block align-middle" title="Seri No Takibi Açık">SERİ</span>}
                                            </td>
                                            <td className={`p-1.5 border-r border-slate-200 text-center font-semibold text-sm ${kritik ? 'text-[#dc2626]' : Number(u.stok_miktari) <= 0 ? 'text-[#dc2626]' : 'text-[#059669]'}`}>
                                                {u.stok_miktari}
                                                {kritik && <span className="text-[9px] text-red-400 block">min: {u.min_stok_miktari}</span>}
                                                {depolar.length > 0 && urunDepoStok(u.id).length > 0 && (
                                                    <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                                                        {urunDepoStok(u.id).map(ds => (
                                                            <span key={ds.depo_id} className="text-[7px] bg-blue-50 text-blue-600 border border-blue-100 px-1" title={depoMap[ds.depo_id]?.depo_adi}>
                                                                {depoMap[ds.depo_id]?.depo_adi?.substring(0, 6)}: {ds.miktar}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-1.5 border-r border-slate-200 text-center">{u.birim}</td>
                                            <td className="p-1.5 border-r border-slate-200 text-right font-semibold text-slate-500">{Number(u.alis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</td>
                                            <td className="p-1.5 border-r border-slate-200 text-right font-semibold text-[#1d4ed8]">
                                                {u.doviz_turu && u.doviz_turu !== "TRY" && Number(u.doviz_fiyati) > 0 ? (
                                                    <div>
                                                        <span>{Number(u.doviz_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} {dovizSembol[u.doviz_turu] || u.doviz_turu}</span>
                                                        <span className="text-[9px] text-[#94a3b8] block">≈ {dovizTlKarsiligi(u.doviz_turu, Number(u.doviz_fiyati)).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</span>
                                                    </div>
                                                ) : (
                                                    <span>{Number(u.satis_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</span>
                                                )}
                                            </td>
                                            <td className="p-1.5 border-r border-slate-200 text-center text-slate-500">% {u.kdv_orani}</td>
                                            <td className="p-1.5 border-r border-slate-200 text-center print:hidden">
                                                <button onClick={() => urunAktiflikDegistir(u)} className={`px-2 py-0.5 text-[10px] font-bold border transition-colors cursor-pointer ${u.aktif !== false ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'}`}>
                                                    <i className={`fas ${u.aktif !== false ? 'fa-toggle-on' : 'fa-toggle-off'} mr-1`}></i>{u.aktif !== false ? 'Aktif' : 'Pasif'}
                                                </button>
                                            </td>
                                            <td className="p-1.5 border-r border-slate-200 text-center print:hidden">
                                                <div className="flex justify-center space-x-1">
                                                    <button onClick={() => urunDuzenle(u)} className="btn-secondary px-2 py-1" title="Düzenle"><i className="fas fa-edit"></i></button>
                                                    {(u.lot_takibi || u.seri_takibi) && (
                                                        <button onClick={() => lotGecmisiAc(u.id)} className="btn-secondary px-2 py-1" title="Lot/Seri Geçmişi"><i className="fas fa-barcode"></i></button>
                                                    )}
                                                    {depolar.length >= 2 && (
                                                        <button onClick={() => { setTransferUrunId(u.id); setTransferKaynakDepo(""); setTransferHedefDepo(""); setTransferMiktar(""); setTransferModalAcik(true); }} className="btn-secondary px-2 py-1" title="Depo Transfer"><i className="fas fa-exchange-alt"></i></button>
                                                    )}
                                                    <button onClick={() => urunSil(u.id)} className="btn-secondary px-2 py-1" title="Sil"><i className="fas fa-trash"></i></button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        )}
      </main>

      {/* --- ÜRÜN EKLEME / DÜZENLEME MODALI --- */}
      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-xl overflow-hidden border border-slate-200 flex flex-col">
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                  <i className="fas fa-box mr-2"></i> {duzenlemeModu ? 'Stok Kartını Düzenle' : 'Yeni Stok Kartı'}
              </h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times text-lg"></i></button>
            </div>

            <div className="p-4 bg-white space-y-4 overflow-y-auto">

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Ürün Adı</label>
                        <input type="text" value={formData.urun_adi} onChange={(e) => setFormData({...formData, urun_adi: e.target.value})} className="input-kurumsal w-full" placeholder="Örn: 5LT Ayçiçek Yağı" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Barkod (POS İçin)</label>
                        <input type="text" value={formData.barkod} onChange={(e) => setFormData({...formData, barkod: e.target.value})} className="input-kurumsal w-full font-mono" placeholder="Okutun..." />
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Mevcut Stok Miktarı</label>
                        <input type="number" min="0" value={formData.stok_miktari} onChange={(e) => setFormData({...formData, stok_miktari: Number(e.target.value)})} className="input-kurumsal w-full text-center" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-orange-500 uppercase tracking-widest block mb-1.5">Minimum Stok Miktarı</label>
                        <input type="number" min="0" value={formData.min_stok_miktari} onChange={(e) => setFormData({...formData, min_stok_miktari: Number(e.target.value)})} className="input-kurumsal w-full text-center" placeholder="0" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Satış Birimi</label>
                        <select value={formData.birim} onChange={(e) => setFormData({...formData, birim: e.target.value})} className="input-kurumsal w-full cursor-pointer">
                            <option value="">-- Birim Seçin --</option>
                            {birimListesi.map(b => <option key={b.id} value={b.kisaltma}>{b.kisaltma} ({b.birim_adi})</option>)}
                            {formData.birim && !birimListesi.some(b => b.kisaltma === formData.birim) && <option value={formData.birim}>{formData.birim}</option>}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Kategori</label>
                    <select value={formData.kategori_id || ""} onChange={e => setFormData({...formData, kategori_id: e.target.value ? Number(e.target.value) : null})} className="input-kurumsal w-full cursor-pointer">
                        <option value="">Kategori Yok</option>
                        {kategoriler.map(k => <option key={k.id} value={k.id}>{k.kategori_adi}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Birim Alış Fiyatı (TL)</label>
                        <input type="number" min="0" value={formData.alis_fiyati} onChange={(e) => setFormData({...formData, alis_fiyati: Number(e.target.value)})} className="input-kurumsal w-full" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Birim Satış Fiyatı (TL)</label>
                        <input type="number" min="0" value={formData.satis_fiyati} onChange={(e) => setFormData({...formData, satis_fiyati: Number(e.target.value)})} className="input-kurumsal w-full" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">KDV Oranı (%)</label>
                        <select value={formData.kdv_orani} onChange={(e) => setFormData({...formData, kdv_orani: Number(e.target.value)})} className="input-kurumsal w-full cursor-pointer">
                            <option value={0}>% 0</option>
                            <option value={1}>% 1</option>
                            <option value={10}>% 10</option>
                            <option value={20}>% 20</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                    <div>
                        <label className="text-[10px] font-bold text-[#3b82f6] uppercase tracking-widest block mb-1.5">Döviz Cinsi</label>
                        <select value={formData.doviz_turu} onChange={(e) => setFormData({...formData, doviz_turu: e.target.value})} className="input-kurumsal w-full cursor-pointer">
                            <option value="TRY">TRY (₺ Türk Lirası)</option>
                            <option value="USD">USD ($ Dolar)</option>
                            <option value="EUR">EUR (€ Euro)</option>
                        </select>
                    </div>
                    {formData.doviz_turu !== "TRY" && (
                        <>
                            <div>
                                <label className="text-[10px] font-bold text-[#3b82f6] uppercase tracking-widest block mb-1.5">Döviz Fiyatı ({dovizSembol[formData.doviz_turu]})</label>
                                <input type="number" min="0" step="0.01" value={formData.doviz_fiyati} onChange={(e) => setFormData({...formData, doviz_fiyati: Number(e.target.value)})} className="input-kurumsal w-full" placeholder="0.00" />
                            </div>
                            <div className="flex items-end">
                                <div className="p-2 bg-blue-50 border border-blue-200 w-full text-center">
                                    <div className="text-[9px] text-blue-500 font-semibold uppercase">TL Karşılığı</div>
                                    <div className="text-[14px] font-bold text-[#0f172a]">
                                        {dovizKurlari[formData.doviz_turu] ? `≈ ${dovizTlKarsiligi(formData.doviz_turu, formData.doviz_fiyati).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺` : "Kur tanımlı değil"}
                                    </div>
                                    {dovizKurlari[formData.doviz_turu] > 0 && <div className="text-[8px] text-[#94a3b8]">Kur: 1 {formData.doviz_turu} = {dovizKurlari[formData.doviz_turu].toLocaleString('tr-TR', {minimumFractionDigits:4})} ₺</div>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-6 pt-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                    <label className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest">İzlenebilirlik</label>
                    <button type="button" onClick={() => setFormData({...formData, lot_takibi: !formData.lot_takibi})} className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border transition-colors ${formData.lot_takibi ? 'bg-cyan-50 text-cyan-600 border-cyan-200' : 'bg-white text-[#94a3b8] border-[#e2e8f0]'}`}>
                        <i className={`fas ${formData.lot_takibi ? 'fa-toggle-on' : 'fa-toggle-off'} text-[12px]`} /> Lot Takibi
                    </button>
                    <button type="button" onClick={() => setFormData({...formData, seri_takibi: !formData.seri_takibi})} className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border transition-colors ${formData.seri_takibi ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-white text-[#94a3b8] border-[#e2e8f0]'}`}>
                        <i className={`fas ${formData.seri_takibi ? 'fa-toggle-on' : 'fa-toggle-off'} text-[12px]`} /> Seri No Takibi
                    </button>
                </div>
            </div>

            <div className="p-3 flex justify-end space-x-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setModalAcik(false)} className="btn-secondary">İptal</button>
              <button onClick={formuKaydet} className="btn-primary flex items-center">
                  <i className={`fas ${duzenlemeModu ? 'fa-save' : 'fa-check'} mr-2`}></i> {duzenlemeModu ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* KATEGORİ MODALI */}
      {kategoriModalAcik && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setKategoriModalAcik(false)}>
              <div className="bg-white w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div className="text-[13px] font-semibold text-[#0f172a]">Ürün Kategorileri</div>
                      <button onClick={() => setKategoriModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                  </div>
                  <div className="p-4 space-y-3">
                      {/* Ekle / Düzenle Form */}
                      <div className="flex items-end gap-2">
                          <div className="flex-1">
                              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">{katDuzenleId ? "Düzenle" : "Yeni Kategori"}</label>
                              <input type="text" value={katFormAdi} onChange={e => setKatFormAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Kategori adı..." />
                          </div>
                          <div>
                              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Renk</label>
                              <input type="color" value={katFormRenk} onChange={e => setKatFormRenk(e.target.value)} className="w-9 h-9 p-0.5 border border-[#e2e8f0] cursor-pointer" />
                          </div>
                          <button onClick={kategoriKaydet} className="btn-primary text-[11px] h-9 px-3">
                              <i className={`fas ${katDuzenleId ? "fa-save" : "fa-plus"} text-[9px]`} />
                          </button>
                          {katDuzenleId && (
                              <button onClick={() => { setKatDuzenleId(null); setKatFormAdi(""); setKatFormRenk("#3B82F6"); }} className="btn-secondary text-[11px] h-9 px-3">
                                  <i className="fas fa-times text-[9px]" />
                              </button>
                          )}
                      </div>
                      {/* Liste */}
                      <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                          {kategoriler.length === 0 ? (
                              <div className="text-center py-6 text-[11px] text-[#94a3b8]">Henüz kategori eklenmemiş</div>
                          ) : kategoriler.map(k => (
                              <div key={k.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f8fafc] transition-colors" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <div className="w-4 h-4 shrink-0" style={{ background: k.renk }} />
                                  <span className="flex-1 text-[12px] font-semibold text-[#0f172a]">{k.kategori_adi}</span>
                                  <span className="text-[9px] text-[#94a3b8]">{urunler.filter(u => u.kategori_id === k.id).length} ürün</span>
                                  <button onClick={() => { setKatDuzenleId(k.id); setKatFormAdi(k.kategori_adi); setKatFormRenk(k.renk); }} className="text-[9px] px-1.5 py-0.5 text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc]"><i className="fas fa-pen text-[7px]" /></button>
                                  <button onClick={() => kategoriSil(k.id)} className="text-[9px] px-1.5 py-0.5 text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2]"><i className="fas fa-trash text-[7px]" /></button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}
      {/* DEPO MODALI */}
      {depoModalAcik && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDepoModalAcik(false)}>
              <div className="bg-white w-full max-w-md" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div className="text-[13px] font-semibold text-[#0f172a]">Depo Yönetimi</div>
                      <button onClick={() => setDepoModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                  </div>
                  <div className="p-4 space-y-3">
                      <div className="flex items-end gap-2">
                          <div className="flex-1">
                              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">{depoFormDuzenleId ? "Düzenle" : "Yeni Depo"}</label>
                              <input type="text" value={depoFormAdi} onChange={e => setDepoFormAdi(e.target.value)} className="input-kurumsal w-full" placeholder="Depo adı..." />
                          </div>
                          <button onClick={depoKaydet} className="btn-primary text-[11px] h-9 px-3"><i className={`fas ${depoFormDuzenleId ? "fa-save" : "fa-plus"} text-[9px]`} /></button>
                          {depoFormDuzenleId && <button onClick={() => { setDepoFormDuzenleId(null); setDepoFormAdi(""); setDepoFormAdres(""); }} className="btn-secondary text-[11px] h-9 px-3"><i className="fas fa-times text-[9px]" /></button>}
                      </div>
                      <input type="text" value={depoFormAdres} onChange={e => setDepoFormAdres(e.target.value)} className="input-kurumsal w-full" placeholder="Adres (isteğe bağlı)..." />
                      <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                          {depolar.length === 0 ? (
                              <div className="text-center py-6 text-[11px] text-[#94a3b8]">Henüz depo eklenmemiş</div>
                          ) : depolar.map(d => (
                              <div key={d.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f8fafc] transition-colors" style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <div className="w-7 h-7 bg-[#f1f5f9] text-[#475569] flex items-center justify-center shrink-0"><i className="fas fa-warehouse text-[10px]" /></div>
                                  <div className="flex-1 min-w-0">
                                      <div className="text-[12px] font-semibold text-[#0f172a]">{d.depo_adi}</div>
                                      {d.adres && <div className="text-[9px] text-[#94a3b8]">{d.adres}</div>}
                                  </div>
                                  <span className="text-[9px] text-[#94a3b8]">{depoStoklar.filter(ds => ds.depo_id === d.id && ds.miktar > 0).length} ürün</span>
                                  <button onClick={() => { setDepoFormDuzenleId(d.id); setDepoFormAdi(d.depo_adi); setDepoFormAdres(d.adres || ""); }} className="text-[9px] px-1.5 py-0.5 text-[#475569] border border-[#e2e8f0] hover:bg-[#f8fafc]"><i className="fas fa-pen text-[7px]" /></button>
                                  <button onClick={() => depoSil(d.id)} className="text-[9px] px-1.5 py-0.5 text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2]"><i className="fas fa-trash text-[7px]" /></button>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* TOPLU FİYAT GÜNCELLE MODALI */}
      {topluFiyatModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTopluFiyatModal(false)}>
              <div className="bg-white w-full max-w-sm" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div className="text-[13px] font-semibold text-[#0f172a]">Toplu Fiyat Güncelle</div>
                      <button onClick={() => setTopluFiyatModal(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                  </div>
                  <div className="p-5 space-y-3">
                      <div className="text-[10px] text-[#64748b]">{seciliUrunler.size} ürüne uygulanacak</div>
                      <div className="flex gap-2">
                          <button onClick={() => setTopluFiyatTip("ARTIS")} className={`flex-1 py-2 text-[11px] font-semibold border transition-colors ${topluFiyatTip === "ARTIS" ? "bg-[#059669] text-white border-[#059669]" : "bg-white text-[#64748b] border-[#e2e8f0]"}`}>Artış</button>
                          <button onClick={() => setTopluFiyatTip("INDIRIM")} className={`flex-1 py-2 text-[11px] font-semibold border transition-colors ${topluFiyatTip === "INDIRIM" ? "bg-[#dc2626] text-white border-[#dc2626]" : "bg-white text-[#64748b] border-[#e2e8f0]"}`}>İndirim</button>
                      </div>
                      <div>
                          <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Yüzde (%)</label>
                          <input type="number" value={topluFiyatYuzde} onChange={e => setTopluFiyatYuzde(e.target.value)} className="input-kurumsal w-full text-[14px] font-semibold" placeholder="Örn: 10" min="0" max="100" />
                      </div>
                  </div>
                  <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                      <button onClick={() => setTopluFiyatModal(false)} className="btn-secondary text-[11px]">İptal</button>
                      <button onClick={topluFiyatUygula} className="btn-primary text-[11px]"><i className="fas fa-check text-[9px] mr-1" /> Uygula</button>
                  </div>
              </div>
          </div>
      )}

      {/* TOPLU KATEGORİ ATA MODALI */}
      {topluKategoriModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTopluKategoriModal(false)}>
              <div className="bg-white w-full max-w-sm" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div className="text-[13px] font-semibold text-[#0f172a]">Toplu Kategori Ata</div>
                      <button onClick={() => setTopluKategoriModal(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                  </div>
                  <div className="p-5 space-y-3">
                      <div className="text-[10px] text-[#64748b]">{seciliUrunler.size} ürüne atanacak</div>
                      <select value={topluKategoriId} onChange={e => setTopluKategoriId(e.target.value)} className="input-kurumsal w-full">
                          <option value="">Kategori Kaldır</option>
                          {kategoriler.map(k => <option key={k.id} value={k.id}>{k.kategori_adi}</option>)}
                      </select>
                  </div>
                  <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                      <button onClick={() => setTopluKategoriModal(false)} className="btn-secondary text-[11px]">İptal</button>
                      <button onClick={topluKategoriAta} className="btn-primary text-[11px]"><i className="fas fa-check text-[9px] mr-1" /> Uygula</button>
                  </div>
              </div>
          </div>
      )}

      {/* BİRİM MODALI */}
      {birimModalAcik && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setBirimModalAcik(false)}>
              <div className="bg-white w-full max-w-2xl flex flex-col" style={{ height: "min(600px, 80vh)" }} onClick={e => e.stopPropagation()}>
                  {/* HEADER - sabit üst */}
                  <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-50 text-[#1d4ed8] flex items-center justify-center"><i className="fas fa-ruler" /></div>
                          <div>
                              <div className="text-[15px] font-semibold text-[#0f172a]">Birim Yönetimi</div>
                              <div className="text-[10px] text-[#94a3b8]">{tumBirimler.length} birim tanımlı</div>
                          </div>
                      </div>
                      <div className="flex items-center gap-3">
                          <button onClick={varsayilanBirimlerYukle} className="btn-secondary text-[11px] flex items-center gap-1.5"><i className="fas fa-download text-[9px]" /> Varsayılanları Yükle</button>
                          <button onClick={() => setBirimModalAcik(false)} className="w-8 h-8 flex items-center justify-center text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f8fafc] transition-colors"><i className="fas fa-times" /></button>
                      </div>
                  </div>
                  {/* LİSTE - ortada, kaydırılabilir */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {tumBirimler.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full py-12 text-[#94a3b8]">
                              <i className="fas fa-ruler-combined text-3xl mb-3 opacity-30" />
                              <div className="text-[12px] font-semibold">Henüz birim eklenmemiş</div>
                              <div className="text-[10px] mt-1">Aşağıdan yeni birim ekleyin veya varsayılanları yükleyin</div>
                          </div>
                      ) : tumBirimler.map(b => (
                          <div key={b.id} className="flex items-center gap-4 px-6 py-3 hover:bg-[#f8fafc] transition-colors" style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <div className="flex-1 flex items-center gap-3 min-w-0">
                                  <span className="text-[13px] font-semibold text-[#0f172a]">{b.birim_adi}</span>
                                  <span className="text-[11px] font-bold text-[#1d4ed8] bg-blue-50 px-2 py-0.5">{b.kisaltma}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                  <button onClick={() => birimAktifToggle(b)} className={`text-[10px] px-2.5 py-1 font-bold border transition-colors ${b.aktif ? 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 border-gray-200 bg-gray-50 hover:bg-gray-100'}`}>
                                      <i className={`fas ${b.aktif ? 'fa-toggle-on' : 'fa-toggle-off'} mr-1`} />{b.aktif ? 'Aktif' : 'Pasif'}
                                  </button>
                                  <button onClick={() => birimSil(b)} className="w-8 h-8 flex items-center justify-center text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors"><i className="fas fa-trash text-[9px]" /></button>
                              </div>
                          </div>
                      ))}
                  </div>
                  {/* FORM - sabit alt */}
                  <div className="px-6 py-4 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                      <div className="flex items-end gap-3">
                          <div className="flex-1">
                              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1.5 block">Birim Adı</label>
                              <input type="text" value={yeniBirimAdi} onChange={e => setYeniBirimAdi(e.target.value)} className="input-kurumsal w-full h-10" placeholder="Örn: Kilogram" />
                          </div>
                          <div className="w-32">
                              <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1.5 block">Kısaltma</label>
                              <input type="text" value={yeniBirimKisaltma} onChange={e => setYeniBirimKisaltma(e.target.value)} className="input-kurumsal w-full h-10" placeholder="Örn: Kg" />
                          </div>
                          <button onClick={birimEkle} className="btn-primary h-10 px-5 flex items-center gap-2 text-xs font-semibold shrink-0"><i className="fas fa-plus text-[9px]" /> Ekle</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* LOT/SERİ GEÇMİŞİ MODALI */}
      {lotModalAcik && lotUrunId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
              <div className="bg-white w-full h-full md:h-auto md:max-h-[85vh] md:max-w-3xl overflow-hidden flex flex-col">
                  <div className="px-5 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div>
                          <div className="text-[13px] font-semibold text-[#0f172a]"><i className="fas fa-barcode mr-2 text-cyan-600" />Lot / Seri Geçmişi</div>
                          <div className="text-[10px] text-[#94a3b8]">{urunler.find(u => u.id === lotUrunId)?.urun_adi}</div>
                      </div>
                      <button onClick={() => setLotModalAcik(false)} className="w-8 h-8 flex items-center justify-center bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600"><i className="fas fa-times" /></button>
                  </div>

                  {/* Lot bazlı stok özeti */}
                  {!lotYukleniyor && lotStokDurumu().length > 0 && (
                      <div className="px-5 py-3 shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                          <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Lot Bazlı Stok Durumu</div>
                          <div className="flex flex-wrap gap-2">
                              {lotStokDurumu().map((l, i) => {
                                  const sktYakin = l.son_kullanma && new Date(l.son_kullanma) < new Date(Date.now() + 30 * 86400000);
                                  const sktGecmis = l.son_kullanma && new Date(l.son_kullanma) < new Date();
                                  return (
                                      <div key={i} className={`px-3 py-1.5 border text-[10px] ${sktGecmis ? "bg-red-50 border-red-200" : sktYakin ? "bg-amber-50 border-amber-200" : "bg-white border-[#e2e8f0]"}`}>
                                          <span className="font-bold text-[#0f172a]">{l.lot_no}</span>
                                          <span className="ml-2 font-semibold text-[#059669]">{l.miktar} adet</span>
                                          {l.son_kullanma && <span className={`ml-2 ${sktGecmis ? "text-[#dc2626] font-bold" : sktYakin ? "text-[#f59e0b]" : "text-[#94a3b8]"}`}>SKT: {new Date(l.son_kullanma).toLocaleDateString("tr-TR")}</span>}
                                          {sktGecmis && <i className="fas fa-exclamation-circle ml-1 text-[#dc2626] text-[8px]" />}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}

                  <div className="flex-1 overflow-auto custom-scrollbar">
                      {lotYukleniyor ? (
                          <div className="flex items-center justify-center py-12"><i className="fas fa-circle-notch fa-spin text-[#475569]" /></div>
                      ) : lotHareketler.length === 0 ? (
                          <div className="text-center py-12"><i className="fas fa-barcode text-[28px] text-[#e2e8f0] mb-2" /><div className="text-[11px] text-[#94a3b8]">Lot/Seri hareketi bulunamadı</div></div>
                      ) : (
                          <table className="tbl-kurumsal">
                              <thead><tr><th>Lot No</th><th>Seri No</th><th className="text-center">İşlem</th><th className="text-right">Miktar</th><th>Üretim</th><th>SKT</th><th>Tedarikçi</th><th>Tarih</th></tr></thead>
                              <tbody>
                                  {lotHareketler.map(h => (
                                      <tr key={h.id}>
                                          <td className="font-semibold text-[#0f172a] font-mono">{h.lot_no || "—"}</td>
                                          <td className="font-mono text-[#475569]">{h.seri_no || "—"}</td>
                                          <td className="text-center"><span className={`text-[9px] font-semibold px-1.5 py-0.5 ${h.islem_tipi === "GIRIS" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>{h.islem_tipi === "GIRIS" ? "Giriş" : "Çıkış"}</span></td>
                                          <td className={`text-right font-semibold ${h.islem_tipi === "GIRIS" ? "text-[#059669]" : "text-[#dc2626]"}`}>{h.islem_tipi === "GIRIS" ? "+" : "-"}{h.miktar}</td>
                                          <td className="text-[#64748b]">{h.uretim_tarihi ? new Date(h.uretim_tarihi).toLocaleDateString("tr-TR") : "—"}</td>
                                          <td className={`${h.son_kullanma_tarihi && new Date(h.son_kullanma_tarihi) < new Date() ? "text-[#dc2626] font-bold" : "text-[#64748b]"}`}>{h.son_kullanma_tarihi ? new Date(h.son_kullanma_tarihi).toLocaleDateString("tr-TR") : "—"}</td>
                                          <td className="text-[#475569]">{h.tedarikci || "—"}</td>
                                          <td className="text-[#94a3b8]">{new Date(h.created_at).toLocaleDateString("tr-TR")}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* TRANSFER MODALI */}
      {transferModalAcik && transferUrunId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setTransferModalAcik(false)}>
              <div className="bg-white w-full max-w-sm" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <div className="text-[13px] font-semibold text-[#0f172a]"><i className="fas fa-exchange-alt mr-2 text-[#3b82f6]" />Depo Transferi</div>
                      <button onClick={() => setTransferModalAcik(false)} className="text-[#94a3b8] hover:text-[#0f172a]"><i className="fas fa-times" /></button>
                  </div>
                  <div className="p-5 space-y-3">
                      <div className="p-3 bg-[#f8fafc] border border-[#e2e8f0]">
                          <div className="text-[10px] text-[#94a3b8] uppercase tracking-wider font-semibold">Ürün</div>
                          <div className="text-[12px] font-semibold text-[#0f172a] mt-0.5">{urunler.find(u => u.id === transferUrunId)?.urun_adi}</div>
                      </div>
                      <div>
                          <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Kaynak Depo *</label>
                          <select value={transferKaynakDepo} onChange={e => setTransferKaynakDepo(e.target.value)} className="input-kurumsal w-full">
                              <option value="">Seçiniz...</option>
                              {depolar.filter(d => {
                                  const ds = depoStoklar.find(s => s.depo_id === d.id && s.urun_id === transferUrunId);
                                  return ds && ds.miktar > 0;
                              }).map(d => {
                                  const ds = depoStoklar.find(s => s.depo_id === d.id && s.urun_id === transferUrunId);
                                  return <option key={d.id} value={d.id}>{d.depo_adi} ({ds?.miktar || 0} adet)</option>;
                              })}
                          </select>
                      </div>
                      <div>
                          <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Hedef Depo *</label>
                          <select value={transferHedefDepo} onChange={e => setTransferHedefDepo(e.target.value)} className="input-kurumsal w-full">
                              <option value="">Seçiniz...</option>
                              {depolar.filter(d => String(d.id) !== transferKaynakDepo).map(d => <option key={d.id} value={d.id}>{d.depo_adi}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-1 block">Miktar *</label>
                          <input type="number" value={transferMiktar} onChange={e => setTransferMiktar(e.target.value)} className="input-kurumsal w-full" min="1" step="1" />
                      </div>
                  </div>
                  <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                      <button onClick={() => setTransferModalAcik(false)} className="btn-secondary text-[11px]">İptal</button>
                      <button onClick={depoTransferYap} className="btn-primary text-[11px] flex items-center gap-1.5"><i className="fas fa-exchange-alt text-[9px]" /> Transfer Et</button>
                  </div>
              </div>
          </div>
      )}
      <OnayModal />
    </>
  );
}
