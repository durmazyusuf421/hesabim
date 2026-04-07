"use client";
import { useEffect, useState } from "react";
import { supabase, siparisNoUret } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";

interface Toptanci {
  id: number;
  isletme_adi: string;
  unvan?: string;
  il?: string;
  ilce?: string;
  telefon?: string;
  adres?: string;
  rol: string;
}

interface Baglanti {
  id: number;
  toptanci_id: number;
  market_id: number;
  durum: string;
}

interface AltBirim {
  birim: string;
  fiyat: number;
}

interface Urun {
  id: number;
  urun_adi: string;
  birim: string;
  satis_fiyati: number;
  sahip_sirket_id: number;
  alt_birimler?: AltBirim[];
}

interface SepetItem extends Urun {
  secilen_birim: string;
  gecerli_fiyat: number;
  miktar: number;
}

export default function MusteriPortali() {
  const { aktifSirket: aktifMusteri } = useAuth();
  const toast = useToast();
  const { onayla, OnayModal } = useOnayModal();

  const [toptancilar, setToptancilar] = useState<Toptanci[]>([]);
  const [baglantilar, setBaglantilar] = useState<Baglanti[]>([]);
  const [tumUrunler, setTumUrunler] = useState<Urun[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [seciliToptanciId, setSeciliToptanciId] = useState<string>("TUM");

  const [sepet, setSepet] = useState<SepetItem[]>([]);
  const [aktifBirimler, setAktifBirimler] = useState<{[key: number]: number}>({});

  const [sepetModalAcik, setSepetModalAcik] = useState(false);
  const [kesfetModalAcik, setKesfetModalAcik] = useState(false);
  const [seciliUrunId, setSeciliUrunId] = useState<number | null>(null);

  const [kesfetArama, setKesfetArama] = useState("");
  const [kesfetIl, setKesfetIl] = useState("");
  const [siparisGonderiliyor, setSiparisGonderiliyor] = useState(false);
  const [acikDetayId, setAcikDetayId] = useState<number | null>(null);
  const [detayUrunler, setDetayUrunler] = useState<{[key: number]: { sayi: number; ornekler: string[] }}>({});
  // WhatsApp bildirim modal state
  const [whatsappModal, setWhatsappModal] = useState<{ linkler: { toptanciAdi: string; url: string }[] } | null>(null);
  // Onay bekleyen sipariş sayısı
  const [onayBekleyenSayisi, setOnayBekleyenSayisi] = useState(0);
  const [ozelFiyatMap, setOzelFiyatMap] = useState<Record<string, number>>({});
  const [dovizKurlari, setDovizKurlari] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!aktifMusteri) return;
    if (aktifMusteri.rol !== "PERAKENDE") { window.location.href = "/login"; return; }
  }, [aktifMusteri]);

  const verileriGetir = async () => {
    if (!aktifMusteri) return;
    setYukleniyor(true);

    const { data: toptanciData } = await supabase.from("sirketler").select("*").eq("rol", "TOPTANCI").order('isletme_adi');
    setToptancilar(toptanciData || []);

    const { data: baglantiData } = await supabase.from("b2b_baglantilar").select("*").eq("market_id", aktifMusteri.id);
    setBaglantilar(baglantiData || []);

    const onaylilar = (baglantiData || []).filter(b => b.durum === 'ONAYLANDI').map(b => b.toptanci_id);
    if (onaylilar.length > 0) {
        const { data: urunData } = await supabase.from("urunler").select("*").in("sahip_sirket_id", onaylilar).neq("aktif", false).order('urun_adi');
        setTumUrunler(urunData || []);
        // Özel fiyatları çek - her toptancıdaki bu markete ait cari kartını bul
        const { data: cariKartlarFiyat } = await supabase.from("firmalar").select("id, sahip_sirket_id").eq("bagli_sirket_id", aktifMusteri.id);
        if (cariKartlarFiyat && cariKartlarFiyat.length > 0) {
            const cariIds = cariKartlarFiyat.map(c => c.id);
            const { data: ofData } = await supabase.from("ozel_fiyatlar").select("urun_id, ozel_fiyat, firma_id").in("firma_id", cariIds).eq("aktif", true);
            const map: Record<string, number> = {};
            (ofData || []).forEach(of => { map[`${of.urun_id}`] = Number(of.ozel_fiyat); });
            setOzelFiyatMap(map);
        }
        // Döviz kurlarını çek
        const { data: kurData } = await supabase.from("doviz_kurlari").select("doviz_turu, kur").order("tarih", { ascending: false }).limit(10);
        const kurMap: Record<string, number> = {};
        (kurData || []).forEach(k => { if (!kurMap[k.doviz_turu]) kurMap[k.doviz_turu] = Number(k.kur); });
        setDovizKurlari(kurMap);
    } else {
        setTumUrunler([]);
    }
    // Onay bekleyen sipariş sayısını çek
    const { data: cariKartlar } = await supabase.from("firmalar").select("id").eq("bagli_sirket_id", aktifMusteri.id);
    if (cariKartlar && cariKartlar.length > 0) {
        const cariIdler = cariKartlar.map(c => c.id);
        const { count } = await supabase.from("siparisler").select("id", { count: "exact", head: true }).in("alici_firma_id", cariIdler).eq("durum", "MARKET_ONAYI_BEKLENIYOR");
        setOnayBekleyenSayisi(count || 0);
    }

    setYukleniyor(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { verileriGetir(); }, [aktifMusteri]);

  const detayAcKapat = async (toptanciId: number) => {
      if (acikDetayId === toptanciId) { setAcikDetayId(null); return; }
      setAcikDetayId(toptanciId);
      if (!detayUrunler[toptanciId]) {
          const { data, count } = await supabase.from("urunler").select("urun_adi", { count: "exact" }).eq("sahip_sirket_id", toptanciId).neq("aktif", false).order("urun_adi").limit(5);
          setDetayUrunler(prev => ({ ...prev, [toptanciId]: { sayi: count || 0, ornekler: (data || []).map(u => u.urun_adi) } }));
      }
  };

  const istekGonder = async (toptanciId: number, toptanciAdi: string) => {
      if (!aktifMusteri) return;
      onayla({
          baslik: "Bağlantı İsteği",
          mesaj: `${toptanciAdi} firmasına çalışma isteği göndermek istiyor musunuz?`,
          tehlikeli: false,
          onayMetni: "Evet, Gönder",
          onOnayla: async () => {
              const { error } = await supabase.from("b2b_baglantilar").insert([{ toptanci_id: toptanciId, market_id: aktifMusteri.id, durum: 'BEKLIYOR' }]);
              if (!error) { toast.success("İstek gönderildi."); verileriGetir(); }
          }
      });
  };

  const sepeteEkle = (urun: Urun, miktar: number, gecerliBirim: string, gecerliFiyat: number) => {
      if (miktar <= 0) {
          setSepet(sepet.filter(s => !(s.id === urun.id && s.secilen_birim === gecerliBirim)));
          return;
      }

      const varMi = sepet.find(s => s.id === urun.id && s.secilen_birim === gecerliBirim);

      if (varMi) {
          setSepet(sepet.map(s => (s.id === urun.id && s.secilen_birim === gecerliBirim) ? { ...s, miktar: miktar } : s));
      } else {
          setSepet([...sepet, { ...urun, secilen_birim: gecerliBirim, gecerli_fiyat: gecerliFiyat, miktar: miktar }]);
      }
  };

  const siparisiTamamla = async () => {
      if (!aktifMusteri) return;
      if (sepet.length === 0) { toast.error("Sepetiniz boş!"); return; }
      setSiparisGonderiliyor(true);

      const siparisGruplari = sepet.reduce((gruplar: Record<string, SepetItem[]>, item: SepetItem) => {
          const toptanciId = item.sahip_sirket_id;
          if (!gruplar[toptanciId]) gruplar[toptanciId] = [];
          gruplar[toptanciId].push(item);
          return gruplar;
      }, {});

      const whatsappLinkler: { toptanciAdi: string; url: string }[] = [];

      for (const toptanciIdStr in siparisGruplari) {
          const toptanciId = Number(toptanciIdStr);
          const kalemler = siparisGruplari[toptanciIdStr];
          const toplamTutar = kalemler.reduce((acc: number, item: SepetItem) => acc + (item.gecerli_fiyat * item.miktar), 0);

          const { data: mevcutCari } = await supabase.from("firmalar").select("id").eq("sahip_sirket_id", toptanciId).eq("bagli_sirket_id", aktifMusteri.id).single();
          let cariFirmaId = mevcutCari?.id;

          if (!cariFirmaId) {
              const yeniCari = { sahip_sirket_id: toptanciId, bagli_sirket_id: aktifMusteri.id, unvan: aktifMusteri.unvan, telefon: aktifMusteri.telefon, adres: aktifMusteri.adres, vergi_no: aktifMusteri.vergi_no, firma_tipi: "Müşteri" };
              const { data: eklenenCari } = await supabase.from("firmalar").insert([yeniCari]).select().single();
              cariFirmaId = eklenenCari?.id;
          }

          const yeniNo = await siparisNoUret("SIP");
          const { data: siparisData, error: siparisError } = await supabase.from("siparisler").insert([{
              siparis_no: yeniNo, satici_sirket_id: toptanciId, alici_firma_id: cariFirmaId, durum: "Onay Bekliyor", toplam_tutar: toplamTutar
          }]).select().single();

          if (!siparisError && siparisData) {
              const eklenecekler = kalemler.map((item: SepetItem) => ({
                  siparis_id: siparisData.id,
                  urun_adi: `${item.urun_adi} (${item.secilen_birim})`,
                  miktar: item.miktar,
                  birim_fiyat: item.gecerli_fiyat
              }));
              await supabase.from("siparis_kalemleri").insert(eklenecekler);

              // WhatsApp link oluştur
              const toptanci = toptancilar.find(t => t.id === toptanciId);
              if (toptanci?.telefon) {
                  const tel = toptanci.telefon.replace(/\D/g, "").replace(/^0/, "90");
                  const kalemDetay = kalemler.map(k =>
                      `- ${k.urun_adi} (${k.secilen_birim}) x${k.miktar} = ${(k.gecerli_fiyat * k.miktar).toLocaleString("tr-TR")} TL`
                  ).join("\n");
                  const mesaj = [
                      `YENI SIPARIS - ${yeniNo}`,
                      `Musteri: ${aktifMusteri.isletme_adi}`,
                      `Tutar: ${toplamTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL`,
                      `${kalemler.length} kalem urun`,
                      `Detaylar:`,
                      kalemDetay
                  ].join("\n");
                  whatsappLinkler.push({
                      toptanciAdi: toptanci.isletme_adi,
                      url: `https://wa.me/${tel}?text=${encodeURIComponent(mesaj)}`
                  });
              }
          }
      }

      toast.success("Siparişleriniz ilgili tedarikçilerinize başarıyla iletildi!");
      setSepet([]); setSepetModalAcik(false); setSiparisGonderiliyor(false);

      // WhatsApp bildirim modalını göster
      if (whatsappLinkler.length > 0) {
          setWhatsappModal({ linkler: whatsappLinkler });
      }
  };

  if (!aktifMusteri) return <div className="h-full flex items-center justify-center font-semibold text-slate-500" style={{ background: "var(--c-bg)" }}>Yükleniyor...</div>;

  const onayliToptanciIdleri = baglantilar.filter(b => b.durum === 'ONAYLANDI').map(b => b.toptanci_id);
  const benimTedarikcilerim = toptancilar.filter(t => onayliToptanciIdleri.includes(t.id));
  const gosterilenUrunler = seciliToptanciId === "TUM" ? tumUrunler : tumUrunler.filter(u => u.sahip_sirket_id.toString() === seciliToptanciId);

  const digerToptancilar = toptancilar.filter(t => !onayliToptanciIdleri.includes(t.id));
  const iller = Array.from(new Set(digerToptancilar.map(t => t.il).filter((il): il is string => Boolean(il)))).sort();
  const filtrelenmisDigerToptancilar = digerToptancilar.filter(t => {
      const adUyumu = (t.isletme_adi || "").toLowerCase().includes(kesfetArama.toLowerCase());
      const ilUyumu = kesfetIl ? t.il === kesfetIl : true;
      return adUyumu && ilUyumu;
  });

  const sepetToplami = sepet.reduce((acc, item) => acc + (item.gecerli_fiyat * item.miktar), 0);

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
          {/* TOOLBAR */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
              <button onClick={() => setKesfetModalAcik(true)} className="btn-secondary text-xs"><i className="fas fa-search-location mr-2"></i>Yeni Tedarikçi Bul</button>
              <div className="w-px h-6 mx-1" style={{ background: "var(--c-border)" }}></div>
              <button onClick={() => setSepetModalAcik(true)} disabled={sepet.length === 0} className="btn-primary text-xs disabled:opacity-50"><i className="fas fa-shopping-cart mr-2"></i>Siparişi Tamamla ({sepet.length} Kalem)</button>
              <div className="flex-1"></div>
              <span className="text-xs font-semibold" style={{ color: "var(--c-text-muted)" }}>Tedarikçi:</span>
              <select value={seciliToptanciId} onChange={(e) => setSeciliToptanciId(e.target.value)} className="input-kurumsal text-xs max-w-xs">
                  <option value="TUM">-- TÜM TEDARİKÇİLERİM --</option>
                  {benimTedarikcilerim.map(t => <option key={t.id} value={t.id}>{t.isletme_adi} ({t.il})</option>)}
              </select>
          </div>

          {/* ONAY BEKLEYEN SİPARİŞ UYARISI */}
          {onayBekleyenSayisi > 0 && (
              <div className="mx-4 mt-2 p-3 bg-amber-50 flex items-center justify-between gap-3" style={{ border: "1px solid #fbbf24" }}>
                  <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><i className="fas fa-bell"></i></div>
                      <div>
                          <div className="text-[12px] font-semibold text-amber-800">Onay bekleyen siparişleriniz var! <span className="ml-1 bg-[#dc2626] text-white text-[10px] font-bold px-1.5 py-0.5 inline-block">{onayBekleyenSayisi}</span></div>
                          <div className="text-[10px] text-amber-600">Toptancınız fiyat/miktar düzenlemesi yaptı. Kontrol edin.</div>
                      </div>
                  </div>
                  <a href="/portal/siparisler" className="btn-primary text-xs whitespace-nowrap" style={{ background: "#f59e0b" }}><i className="fas fa-arrow-right mr-1.5"></i> Siparişlerime Git</a>
              </div>
          )}

          <div className="flex-1 overflow-auto relative">
            {/* MASAÜSTÜ TABLO (md+) */}
            <div className="overflow-x-auto hidden md:block">
              <table className="tbl-kurumsal min-w-[800px]">
                  <thead>
                      <tr>
                          <th className="w-8 text-center"><i className="fas fa-caret-down"></i></th>
                          <th className="w-24">Stok Kodu</th>
                          <th>Stok Adı</th>
                          <th className="w-48" style={{ color: "#0891b2" }}>Tedarikçi / Satıcı</th>
                          <th className="w-32 text-[#1d4ed8]">Sipariş Birimi Seç</th>
                          <th className="w-24 text-right">Birim Fiyatı</th>
                          <th className="w-32 text-center">Sipariş Miktarı</th>
                          <th className="w-32 text-right">Tutar</th>
                      </tr>
                  </thead>
                  <tbody>
                      {yukleniyor ? (
                          <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-semibold">Ürünler Yükleniyor...</td></tr>
                      ) : gosterilenUrunler.length === 0 ? (
                          <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-semibold uppercase tracking-widest">Kayıtlı ürün bulunamadı.</td></tr>
                      ) : (
                          gosterilenUrunler.map((u) => {
                              const isSelected = seciliUrunId === u.id;
                              const saticiFirma = benimTedarikcilerim.find(t => t.id === u.sahip_sirket_id)?.isletme_adi || "-";
                              const aktifBirimNo = aktifBirimler[u.id] !== undefined ? aktifBirimler[u.id] : -1;
                              const gecerliBirim = (aktifBirimNo === -1 || !u.alt_birimler || !u.alt_birimler[aktifBirimNo]) ? u.birim : u.alt_birimler[aktifBirimNo].birim;
                              const ozelFiyatVar = aktifBirimNo === -1 && ozelFiyatMap[`${u.id}`];
                              const urunDoviz = (u as unknown as { doviz_turu?: string; doviz_fiyati?: number });
                              const dovizliMi = !ozelFiyatVar && aktifBirimNo === -1 && urunDoviz.doviz_turu && urunDoviz.doviz_turu !== "TRY" && Number(urunDoviz.doviz_fiyati) > 0 && dovizKurlari[urunDoviz.doviz_turu];
                              const gecerliFiyat = ozelFiyatVar ? ozelFiyatMap[`${u.id}`] : (dovizliMi ? Math.round(Number(urunDoviz.doviz_fiyati) * dovizKurlari[urunDoviz.doviz_turu!] * 100) / 100 : ((aktifBirimNo === -1 || !u.alt_birimler || !u.alt_birimler[aktifBirimNo]) ? u.satis_fiyati : u.alt_birimler[aktifBirimNo].fiyat));
                              const sepettekiUrun = sepet.find(s => s.id === u.id && s.secilen_birim === gecerliBirim);
                              const miktar = sepettekiUrun ? sepettekiUrun.miktar : 0;
                              const tutar = miktar * gecerliFiyat;
                              return (
                                  <tr key={u.id} onClick={() => setSeciliUrunId(u.id)} className={`cursor-pointer select-none ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'bg-white hover:bg-slate-50'}`}>
                                      <td className="text-center">{isSelected && <i className="fas fa-caret-right text-blue-500"></i>}</td>
                                      <td className="text-slate-500">{u.id.toString().padStart(5, '0')}</td>
                                      <td className="font-semibold text-[#0f172a]">{u.urun_adi}</td>
                                      <td className="font-semibold text-cyan-700">{saticiFirma}</td>
                                      <td className="text-center">
                                          <select value={aktifBirimNo} onChange={(e) => setAktifBirimler({...aktifBirimler, [u.id]: Number(e.target.value)})} onClick={(e) => e.stopPropagation()} className="input-kurumsal w-full px-1 py-0.5 text-[10px] font-semibold cursor-pointer">
                                              <option value={-1}>{u.birim}</option>
                                              {u.alt_birimler && u.alt_birimler.map((ab: AltBirim, idx: number) => (<option key={idx} value={idx}>{ab.birim}</option>))}
                                          </select>
                                      </td>
                                      <td className="text-right font-semibold text-[#1d4ed8]">
                                          <div className="flex items-center justify-end gap-1.5">
                                              {ozelFiyatVar && <span className="bg-emerald-50 text-[#059669] border border-emerald-200 text-[7px] font-bold px-1 py-0 shrink-0">Size Özel</span>}
                                              {dovizliMi && <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[7px] font-bold px-1 py-0 shrink-0">{urunDoviz.doviz_turu}</span>}
                                              {Number(gecerliFiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                          </div>
                                      </td>
                                      <td className="p-0">
                                          <input type="number" min="1" value={miktar || ''} onChange={(e) => sepeteEkle(u, Number(e.target.value), gecerliBirim, gecerliFiyat)} onClick={(e) => e.stopPropagation()} placeholder="0" className="w-full h-full px-2 py-1 text-center font-semibold outline-none bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-400" />
                                      </td>
                                      <td className="text-right font-semibold text-[#0f172a]">{tutar > 0 ? tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
            </div>

            {/* MOBİL KART GÖRÜNÜMÜ (md altı) */}
            <div className="md:hidden px-3 py-2 space-y-2 overflow-x-hidden">
                {yukleniyor ? (
                    <div className="p-8 text-center text-slate-400 font-semibold">Ürünler Yükleniyor...</div>
                ) : gosterilenUrunler.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-semibold text-xs uppercase tracking-widest">Kayıtlı ürün bulunamadı.</div>
                ) : (
                    gosterilenUrunler.map((u) => {
                        const aktifBirimNo = aktifBirimler[u.id] !== undefined ? aktifBirimler[u.id] : -1;
                        const gecerliBirim = (aktifBirimNo === -1 || !u.alt_birimler || !u.alt_birimler[aktifBirimNo]) ? u.birim : u.alt_birimler[aktifBirimNo].birim;
                        const ozelFiyatVar = aktifBirimNo === -1 && ozelFiyatMap[`${u.id}`];
                        const urunDoviz = (u as unknown as { doviz_turu?: string; doviz_fiyati?: number });
                        const dovizliMi = !ozelFiyatVar && aktifBirimNo === -1 && urunDoviz.doviz_turu && urunDoviz.doviz_turu !== "TRY" && Number(urunDoviz.doviz_fiyati) > 0 && dovizKurlari[urunDoviz.doviz_turu];
                        const gecerliFiyat = ozelFiyatVar ? ozelFiyatMap[`${u.id}`] : (dovizliMi ? Math.round(Number(urunDoviz.doviz_fiyati) * dovizKurlari[urunDoviz.doviz_turu!] * 100) / 100 : ((aktifBirimNo === -1 || !u.alt_birimler || !u.alt_birimler[aktifBirimNo]) ? u.satis_fiyati : u.alt_birimler[aktifBirimNo].fiyat));
                        const sepettekiUrun = sepet.find(s => s.id === u.id && s.secilen_birim === gecerliBirim);
                        const miktar = sepettekiUrun ? sepettekiUrun.miktar : 0;
                        const saticiFirma = benimTedarikcilerim.find(t => t.id === u.sahip_sirket_id)?.isletme_adi || "-";
                        return (
                            <div key={u.id} className="bg-white px-3 py-2.5 rounded max-w-full overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
                                {/* Üst: Ürün adı + Fiyat */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-[13px] font-bold text-[#0f172a] leading-tight flex-1 min-w-0">{u.urun_adi}</div>
                                    <div className="text-[13px] font-bold text-[#059669] shrink-0 whitespace-nowrap">
                                        {ozelFiyatVar && <span className="bg-emerald-50 text-[#059669] border border-emerald-200 text-[7px] font-bold px-1 py-0 mr-1">Özel</span>}
                                        {Number(gecerliFiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                    </div>
                                </div>
                                {/* Orta: Tedarikçi */}
                                <div className="text-[10px] font-semibold text-cyan-700 mt-0.5 mb-2">{saticiFirma}</div>
                                {/* Alt: Birim + Miktar + Tutar */}
                                <div className="flex items-center gap-2 mt-2 w-full overflow-hidden">
                                    <select value={aktifBirimNo} onChange={(e) => setAktifBirimler({...aktifBirimler, [u.id]: Number(e.target.value)})} className="input-kurumsal text-[11px] font-semibold cursor-pointer px-1.5 py-2" style={{ width: "80px", flexShrink: 0 }}>
                                        <option value={-1}>{u.birim}</option>
                                        {u.alt_birimler && u.alt_birimler.map((ab: AltBirim, idx: number) => (<option key={idx} value={idx}>{ab.birim}</option>))}
                                    </select>
                                    <input type="text" inputMode="decimal" value={miktar || ''} onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v) || v === '') sepeteEkle(u, Number(v) || 0, gecerliBirim, gecerliFiyat); }} placeholder="0" className="input-kurumsal h-10 text-center text-[14px] font-bold" style={{ flex: 1, minWidth: 0 }} />
                                    <div className="text-[12px] font-bold text-[#059669] text-right" style={{ width: "70px", flexShrink: 0 }}>{miktar > 0 ? `${(miktar * gecerliFiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})}` : ''}</div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
          </div>
          <div className="h-8 flex items-center justify-between px-4 text-[10px] font-semibold shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)", color: "var(--c-text-muted)" }}>
              <span>Listelenen Ürün: {gosterilenUrunler.length}</span>
              <span style={{ color: "#1d4ed8" }}>Genel Sepet Tutarı: {sepetToplami.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
          </div>
      </main>

      {/* KEŞFETMODALI */}
      {kesfetModalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-2 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-xs font-semibold text-slate-800 flex items-center"><i className="fas fa-search-location text-[#1d4ed8] mr-2"></i> Tedarikçi Ağı ve İstek Gönderimi</h3>
              <button onClick={() => setKesfetModalAcik(false)} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times"></i></button>
            </div>
            <div className="p-3 flex space-x-4 items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                <div className="flex-1 relative">
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input type="text" placeholder="Tedarikçi adı ile arama yapın..." value={kesfetArama} onChange={(e) => setKesfetArama(e.target.value)} className="input-kurumsal w-full pl-8 pr-3 py-1.5 text-xs" />
                </div>
                <div className="w-64 flex items-center">
                    <label className="text-xs font-semibold text-slate-600 mr-2 whitespace-nowrap">İl Seçimi:</label>
                    <select value={kesfetIl} onChange={(e) => setKesfetIl(e.target.value)} className="input-kurumsal w-full text-xs">
                        <option value="">Tüm İller</option>{iller.map((il: string) => <option key={il} value={il}>{il}</option>)}
                    </select>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-3 space-y-2">
                {filtrelenmisDigerToptancilar.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-semibold uppercase tracking-widest">Aradığınız kritere uygun toptancı bulunamadı.</div>
                ) : (
                    filtrelenmisDigerToptancilar.map(t => {
                        const durum = baglantilar.find(b => b.toptanci_id === t.id)?.durum;
                        const acik = acikDetayId === t.id;
                        const urunBilgi = detayUrunler[t.id];
                        return (
                            <div key={t.id} className={`border bg-white transition-colors ${acik ? 'border-blue-300 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                                {/* Satır Başlığı */}
                                <button onClick={() => detayAcKapat(t.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 group">
                                    <i className={`fas fa-chevron-right text-[10px] text-slate-400 transition-transform ${acik ? 'rotate-90' : ''}`}></i>
                                    <div className="flex-1 min-w-0 flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><i className="fas fa-store text-xs"></i></div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[12px] font-semibold text-slate-800 truncate">{t.isletme_adi}</div>
                                            <div className="text-[10px] text-slate-400">{t.il}{t.ilce ? ` / ${t.ilce}` : ''}</div>
                                        </div>
                                    </div>
                                    {durum && (
                                        <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest shrink-0 ${durum === 'BEKLIYOR' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-red-50 text-[#dc2626] border border-red-200'}`}>
                                            {durum === 'BEKLIYOR' ? 'Bekliyor' : 'Reddedildi'}
                                        </span>
                                    )}
                                </button>

                                {/* Genişletilmiş Detay */}
                                {acik && (
                                    <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid var(--c-border)" }}>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                                            <div>
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Firma Ünvanı</div>
                                                <div className="text-[11px] font-semibold text-slate-700">{t.unvan || t.isletme_adi}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">İl / İlçe</div>
                                                <div className="text-[11px] font-semibold text-slate-700">{t.il || '-'}{t.ilce ? ` / ${t.ilce}` : ''}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Telefon</div>
                                                <div className="text-[11px] font-semibold text-slate-700">{t.telefon || '-'}</div>
                                            </div>
                                        </div>

                                        {/* Ürün Bilgisi */}
                                        <div className="bg-slate-50 border border-slate-200 p-3 mb-3">
                                            {!urunBilgi ? (
                                                <div className="text-[11px] text-slate-400 flex items-center gap-2"><i className="fas fa-circle-notch fa-spin text-[10px]"></i> Ürünler yükleniyor...</div>
                                            ) : urunBilgi.sayi === 0 ? (
                                                <div className="text-[11px] text-slate-400 font-semibold">Henüz ürün bilgisi yok</div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <i className="fas fa-boxes text-[#1d4ed8] text-[10px]"></i>
                                                        <span className="text-[11px] font-semibold text-[#1d4ed8]">{urunBilgi.sayi} çeşit ürün</span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-600">
                                                        {urunBilgi.ornekler.join(', ')}{urunBilgi.sayi > 5 ? '...' : ''}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Aksiyon */}
                                        {!durum ? (
                                            <button onClick={(e) => { e.stopPropagation(); istekGonder(t.id, t.isletme_adi); }} className="btn-primary text-xs w-full sm:w-auto">
                                                <i className="fas fa-handshake mr-2"></i>Çalışma İsteği Gönder
                                            </button>
                                        ) : (
                                            <div className={`flex items-center gap-2 text-[11px] font-semibold ${durum === 'BEKLIYOR' ? 'text-amber-600' : 'text-[#dc2626]'}`}>
                                                <i className={`fas ${durum === 'BEKLIYOR' ? 'fa-clock' : 'fa-times-circle'}`}></i>
                                                {durum === 'BEKLIYOR' ? 'Bağlantı isteğiniz onay bekliyor' : 'Bağlantı isteğiniz reddedildi'}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
          </div>
        </div>
      )}

      {/* SEPET MODALI */}
      {sepetModalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto max-w-2xl overflow-hidden flex flex-col md:max-h-[90vh]" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-3 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-xs font-semibold text-slate-800 flex items-center"><i className="fas fa-file-invoice text-[#059669] mr-2 text-sm"></i> Toplu Sipariş Onayı</h3>
              <button onClick={() => setSepetModalAcik(false)} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ borderBottom: "1px solid var(--c-border)" }}>
                {/* Masaüstü tablo */}
                <table className="tbl-kurumsal hidden md:table">
                    <thead><tr><th>Stok Adı (Birim)</th><th className="w-32" style={{ color: "#0891b2" }}>Tedarikçi</th><th className="w-16 text-center">Miktar</th><th className="w-24 text-right">B.Fiyat</th><th className="w-24 text-right">Tutar</th></tr></thead>
                    <tbody>
                        {sepet.map((item, i) => (
                            <tr key={i}>
                                <td className="font-semibold">{item.urun_adi} <span className="text-[#1d4ed8]">({item.secilen_birim})</span></td>
                                <td className="font-semibold" style={{ color: "#0891b2" }}>{benimTedarikcilerim.find(t => t.id === item.sahip_sirket_id)?.isletme_adi}</td>
                                <td className="text-center font-semibold text-slate-800">{item.miktar}</td>
                                <td className="text-right">{item.gecerli_fiyat} TL</td>
                                <td className="text-right font-semibold">{(item.miktar * item.gecerli_fiyat).toLocaleString('tr-TR')} TL</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {/* Mobil liste */}
                <div className="md:hidden">
                    {sepet.map((item, i) => (
                        <div key={i} className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                            <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-bold text-[#0f172a]">{item.urun_adi} <span className="text-[#1d4ed8] font-semibold">({item.secilen_birim})</span></div>
                                <div className="text-[10px] text-cyan-700 font-semibold mt-0.5">{benimTedarikcilerim.find(t => t.id === item.sahip_sirket_id)?.isletme_adi}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{item.miktar} x {Number(item.gecerli_fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
                            </div>
                            <div className="text-[13px] font-bold text-[#0f172a] shrink-0">{(item.miktar * item.gecerli_fiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-3 flex flex-col gap-3 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Genel Toplam</span>
                  <span className="text-xl font-bold text-[#059669]">{sepetToplami.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
              </div>
              <div className="flex gap-2">
                  <button onClick={() => setSepetModalAcik(false)} className="btn-secondary text-xs flex-1 sm:flex-none"><i className="fas fa-times text-[#dc2626] mr-2"></i>İptal</button>
                  <button onClick={siparisiTamamla} disabled={siparisGonderiliyor} className="btn-primary text-xs flex-1 sm:flex-none disabled:opacity-50"><i className="fas fa-check mr-2"></i>{siparisGonderiliyor ? "Gönderiliyor..." : "Siparişi İlet"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP BİLDİRİM MODAL */}
      {whatsappModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white w-full max-w-md overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-5 text-center" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                <div className="w-16 h-16 bg-emerald-100 text-[#059669] flex items-center justify-center text-3xl mx-auto mb-3">
                    <i className="fab fa-whatsapp"></i>
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Sipariş Başarıyla İletildi!</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">Tedarikçilerinize WhatsApp ile bildirim gönderebilirsiniz</p>
            </div>

            <div className="p-4 space-y-2">
                {whatsappModal.linkler.map((link, i) => (
                    <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-emerald-50 hover:bg-emerald-100 transition-colors group"
                        style={{ border: "1px solid var(--c-border)" }}
                    >
                        <div className="w-10 h-10 bg-emerald-500 text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <i className="fab fa-whatsapp text-xl"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{link.toptanciAdi}</p>
                            <p className="text-[10px] font-semibold text-[#059669]">WhatsApp ile bildir</p>
                        </div>
                        <i className="fas fa-external-link-alt text-emerald-400 text-xs shrink-0"></i>
                    </a>
                ))}
            </div>

            <div className="p-4" style={{ borderTop: "1px solid var(--c-border)" }}>
                <button
                    onClick={() => setWhatsappModal(null)}
                    className="btn-secondary w-full py-3 text-xs uppercase tracking-widest"
                >
                    Atla / Kapat
                </button>
            </div>
          </div>
        </div>
      )}
      <OnayModal />
    </>
  );
}
