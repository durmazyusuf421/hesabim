"use client";
import { useEffect, useState } from "react";
import { supabase, siparisNoUret } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";

interface Toptanci {
  id: number;
  isletme_adi: string;
  il?: string;
  telefon?: string;
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
  // WhatsApp bildirim modal state
  const [whatsappModal, setWhatsappModal] = useState<{ linkler: { toptanciAdi: string; url: string }[] } | null>(null);

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
        const { data: urunData } = await supabase.from("urunler").select("*").in("sahip_sirket_id", onaylilar).order('urun_adi');
        setTumUrunler(urunData || []);
    } else {
        setTumUrunler([]);
    }
    setYukleniyor(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { verileriGetir(); }, [aktifMusteri]);

  const istekGonder = async (toptanciId: number, toptanciAdi: string) => {
      if (!aktifMusteri) return;
      if(window.confirm(`${toptanciAdi} firmasına çalışma isteği göndermek istiyor musunuz?`)) {
          const { error } = await supabase.from("b2b_baglantilar").insert([{ toptanci_id: toptanciId, market_id: aktifMusteri.id, durum: 'BEKLIYOR' }]);
          if (!error) { toast.success("İstek gönderildi."); verileriGetir(); }
      }
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

          <div className="flex-1 overflow-auto relative">
              <table className="tbl-kurumsal">
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
                          <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-semibold uppercase tracking-widest">Kayıtlı ürün bulunamadı. Lütfen yeni tedarikçi ekleyin.</td></tr>
                      ) : (
                          gosterilenUrunler.map((u) => {
                              const isSelected = seciliUrunId === u.id;
                              const saticiFirma = benimTedarikcilerim.find(t => t.id === u.sahip_sirket_id)?.isletme_adi || "-";

                              const aktifBirimNo = aktifBirimler[u.id] !== undefined ? aktifBirimler[u.id] : -1;
                              const gecerliBirim = (aktifBirimNo === -1 || !u.alt_birimler || !u.alt_birimler[aktifBirimNo]) ? u.birim : u.alt_birimler[aktifBirimNo].birim;
                              const gecerliFiyat = (aktifBirimNo === -1 || !u.alt_birimler || !u.alt_birimler[aktifBirimNo]) ? u.satis_fiyati : u.alt_birimler[aktifBirimNo].fiyat;

                              const sepettekiUrun = sepet.find(s => s.id === u.id && s.secilen_birim === gecerliBirim);
                              const miktar = sepettekiUrun ? sepettekiUrun.miktar : 0;
                              const tutar = miktar * gecerliFiyat;

                              return (
                                  <tr key={u.id} onClick={() => setSeciliUrunId(u.id)} className={`cursor-pointer select-none ${isSelected ? 'bg-[#1d4ed8] text-white' : ''}`}>
                                      {/* Sol Ok */}
                                      <td className="text-center">
                                          {isSelected && <i className="fas fa-caret-right text-white"></i>}
                                      </td>

                                      <td>{u.id.toString().padStart(5, '0')}</td>
                                      <td className="font-semibold">{u.urun_adi}</td>

                                      {/* Tedarikçi Adı */}
                                      <td className={`font-semibold ${isSelected ? 'text-cyan-200' : 'text-cyan-700'}`}>{saticiFirma}</td>

                                      {/* AÇILIR MENÜ (SELECT) */}
                                      <td className="text-center">
                                          <select
                                              value={aktifBirimNo}
                                              onChange={(e) => setAktifBirimler({...aktifBirimler, [u.id]: Number(e.target.value)})}
                                              className={`w-full px-1 py-0.5 text-[10px] font-semibold outline-none cursor-pointer ${isSelected ? 'bg-[#1e40af] text-white border-none' : 'input-kurumsal'}`}
                                          >
                                              <option value={-1}>{u.birim}</option>
                                              {u.alt_birimler && u.alt_birimler.map((ab: AltBirim, idx: number) => (
                                                  <option key={idx} value={idx}>{ab.birim}</option>
                                              ))}
                                          </select>
                                      </td>

                                      {/* FİYAT */}
                                      <td className={`text-right font-semibold ${isSelected ? 'text-white' : 'text-blue-700'}`}>
                                          {Number(gecerliFiyat).toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL
                                      </td>

                                      {/* MİKTAR GİRİŞ ALANI */}
                                      <td className="p-0">
                                          <input
                                              type="number"
                                              min="1"
                                              value={miktar || ''}
                                              onChange={(e) => sepeteEkle(u, Number(e.target.value), gecerliBirim, gecerliFiyat)}
                                              placeholder="0"
                                              className={`w-full h-full px-2 py-1 text-center font-semibold outline-none ${isSelected ? 'bg-[#1e40af] text-white placeholder-white/50' : 'bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-400'}`}
                                          />
                                      </td>

                                      {/* TUTAR */}
                                      <td className={`text-right font-semibold ${isSelected ? 'text-white' : ''}`}>
                                          {tutar > 0 ? tutar.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}
                                      </td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
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
            <div className="flex-1 overflow-auto p-0">
                <table className="tbl-kurumsal">
                    <thead><tr><th className="w-16 text-center">İl</th><th>Tedarikçi Firma Ünvanı</th><th className="w-32">Telefon</th><th className="w-32 text-center">İşlem</th></tr></thead>
                    <tbody>
                        {filtrelenmisDigerToptancilar.length === 0 ? ( <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-semibold uppercase tracking-widest">Aradığınız kritere uygun toptancı bulunamadı.</td></tr> ) : (
                            filtrelenmisDigerToptancilar.map(t => {
                                const durum = baglantilar.find(b => b.toptanci_id === t.id)?.durum;
                                return (
                                    <tr key={t.id}>
                                        <td className="text-center font-semibold text-slate-500 uppercase">{t.il}</td><td className="font-semibold text-slate-800">{t.isletme_adi}</td><td>{t.telefon}</td>
                                        <td className="text-center">{!durum ? <button onClick={() => istekGonder(t.id, t.isletme_adi)} className="btn-primary text-xs w-full">İstek Gönder</button> : durum === 'BEKLIYOR' ? <span className="badge-durum badge-bekliyor">Bekliyor</span> : <span className="badge-durum badge-iptal">Reddedildi</span>}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
          </div>
        </div>
      )}

      {/* SEPET MODALI */}
      {sepetModalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ border: "1px solid var(--c-border)" }}>
            <div className="p-2 flex justify-between items-center shrink-0" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
              <h3 className="text-xs font-semibold text-slate-800 flex items-center"><i className="fas fa-file-invoice text-[#059669] mr-2 text-sm"></i> Toplu Sipariş Onayı</h3>
              <button onClick={() => setSepetModalAcik(false)} className="text-slate-500 hover:text-[#dc2626] px-2"><i className="fas fa-times"></i></button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <table className="tbl-kurumsal">
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
            </div>
            <div className="p-3 flex flex-col sm:flex-row justify-between items-center gap-2 shrink-0" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
              <div className="text-sm font-semibold text-slate-800 uppercase">Genel Toplam: <span className="text-[#059669]">{sepetToplami.toLocaleString('tr-TR')} TL</span></div>
              <div className="flex gap-2">
                  <button onClick={() => setSepetModalAcik(false)} className="btn-secondary text-xs"><i className="fas fa-times text-[#dc2626] mr-2"></i>İptal</button>
                  <button onClick={siparisiTamamla} disabled={siparisGonderiliyor} className="btn-primary text-xs disabled:opacity-50"><i className="fas fa-check mr-2"></i>{siparisGonderiliyor ? "Gönderiliyor..." : "Siparişi İlet"}</button>
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
    </>
  );
}
