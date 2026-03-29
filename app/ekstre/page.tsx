"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import Link from "next/link";
interface FirmaOzet { id: number; unvan: string; bakiye?: number; }
interface CariHareket {
    id: number;
    tarih: string;
    evrak_no: string;
    islem_tipi: string;
    aciklama: string;
    borc: number;
    alacak: number;
    created_at?: string;
}

export default function CariEkstre() {
  const { aktifSirket, kullaniciRol, isYonetici, isMuhasebe } = useAuth();
  const toast = useToast();
  const hasAccess = isYonetici || isMuhasebe;

  const [firmalar, setFirmalar] = useState<FirmaOzet[]>([]);
  const [seciliFirmaId, setSeciliFirmaId] = useState<string>("");
  const [hareketler, setHareketler] = useState<CariHareket[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  // YENİ: FİLTRE STATELERİ
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [baslangicTarih, setBaslangicTarih] = useState("");
  const [bitisTarih, setBitisTarih] = useState("");
  const [firmaAramaTerimi, setFirmaAramaTerimi] = useState("");

  async function firmalariGetir(sirketId: number) {
    const { data } = await supabase.from("firmalar").select("id, unvan, bakiye").eq("sahip_sirket_id", sirketId).order('unvan');
    setFirmalar(data || []);
  }

  useEffect(() => {
    if (!aktifSirket) return;
    if (aktifSirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }

    if (kullaniciRol.includes("YONETICI") || kullaniciRol.includes("MUHASEBE")) {
        firmalariGetir(aktifSirket.id);
    }
  }, [aktifSirket, kullaniciRol]);

  useEffect(() => {
      async function hareketleriCek() {
          if (!seciliFirmaId) { setHareketler([]); return; }
          setYukleniyor(true);
          const { data } = await supabase.from("cari_hareketler").select("*").eq("firma_id", seciliFirmaId).order('tarih', { ascending: true }).order('id', { ascending: true });
          setHareketler(data || []);
          setYukleniyor(false);
      }
      hareketleriCek();
  }, [seciliFirmaId]);

  // FİLTRELENMİŞ HAREKETLER
  const filtrelenmisHareketler = useMemo(() => {
      return hareketler.filter(h => {
          if (aramaTerimi) {
              const ara = aramaTerimi.toLocaleLowerCase('tr-TR');
              const eslesti = (h.aciklama || "").toLocaleLowerCase('tr-TR').includes(ara) ||
                              (h.evrak_no || "").toLocaleLowerCase('tr-TR').includes(ara) ||
                              (h.islem_tipi || "").toLocaleLowerCase('tr-TR').includes(ara);
              if (!eslesti) return false;
          }
          if (baslangicTarih && h.tarih < baslangicTarih) return false;
          if (bitisTarih && h.tarih > bitisTarih + "T23:59:59") return false;
          return true;
      });
  }, [hareketler, aramaTerimi, baslangicTarih, bitisTarih]);

  // ÖZET HESAPLAMALAR
  const ozet = useMemo(() => {
      let toplamBorc = 0;
      let toplamAlacak = 0;
      filtrelenmisHareketler.forEach(h => {
          toplamBorc += Number(h.borc) || 0;
          toplamAlacak += Number(h.alacak) || 0;
      });
      return { toplamBorc, toplamAlacak, netBakiye: toplamBorc - toplamAlacak };
  }, [filtrelenmisHareketler]);

  // FİRMA ARAMA FİLTRESİ (cari seçilmediğinde bakiye özeti için)
  const filtrelenmisFirmalar = useMemo(() => {
      if (!firmaAramaTerimi) return firmalar;
      const ara = firmaAramaTerimi.toLocaleLowerCase('tr-TR');
      return firmalar.filter(f => f.unvan.toLocaleLowerCase('tr-TR').includes(ara));
  }, [firmalar, firmaAramaTerimi]);

  // YÜRÜYEN BAKİYE (useMemo ile hesapla, render sırasında mutasyon olmadan)
  const bakiyeHaritasi = useMemo(() => {
      const harita: number[] = [];
      let toplam = 0;
      filtrelenmisHareketler.forEach(h => {
          toplam += (Number(h.borc) || 0) - (Number(h.alacak) || 0);
          harita.push(toplam);
      });
      return harita;
  }, [filtrelenmisHareketler]);

  const seciliFirmaAd = firmalar.find(f => f.id.toString() === seciliFirmaId)?.unvan || "";

  if (!aktifSirket) return <div className="h-full flex items-center justify-center font-bold text-slate-500" style={{ background: "var(--c-bg)" }}>Yükleniyor...</div>;

  // EXCEL EXPORT
  const excelExport = () => {
      if (filtrelenmisHareketler.length === 0) { toast.error("Dışa aktarılacak hareket bulunamadı."); return; }
      let bakiye = 0;
      const satirlar = filtrelenmisHareketler.map(h => {
          const borc = Number(h.borc) || 0;
          const alacak = Number(h.alacak) || 0;
          bakiye += (borc - alacak);
          return [
              new Date(h.tarih).toLocaleDateString('tr-TR'),
              h.evrak_no || "",
              h.islem_tipi || "",
              h.aciklama || "",
              borc > 0 ? borc.toFixed(2) : "",
              alacak > 0 ? alacak.toFixed(2) : "",
              bakiye.toFixed(2)
          ].join("\t");
      });
      const baslik = "Tarih\tEvrak No\tİşlem Türü\tAçıklama\tBorç\tAlacak\tBakiye";
      const icerik = [baslik, ...satirlar].join("\n");
      const blob = new Blob(["\uFEFF" + icerik], { type: 'text/tab-separated-values;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ekstre_${seciliFirmaAd.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xls`;
      a.click();
      URL.revokeObjectURL(url);
  };

  // FİLTRE TEMİZLE
  const filtreTemizle = () => { setAramaTerimi(""); setBaslangicTarih(""); setBitisTarih(""); };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>
        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500" style={{ background: "var(--c-bg)" }}>
                <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Bu sayfaya sadece &quot;YÖNETİCİ&quot; veya &quot;MUHASEBE&quot; yetkisine sahip kullanıcılar erişebilir.</p>
                <Link href="/" className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs uppercase tracking-widest transition-all"><i className="fas fa-arrow-left mr-2"></i> Siparişlere Dön</Link>
            </div>
        ) : (
            <>
                {/* TOOLBAR */}
                <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <select value={seciliFirmaId} onChange={(e) => { setSeciliFirmaId(e.target.value); filtreTemizle(); }} className="input-kurumsal max-w-xs">
                        <option value="">-- Müşteri Seçiniz --</option>
                        {firmalar.map(f => <option key={f.id} value={f.id}>{f.unvan}</option>)}
                    </select>
                    {seciliFirmaId && (
                        <>
                            <button onClick={() => { setSeciliFirmaId(""); filtreTemizle(); }} className="btn-primary flex items-center gap-2"><i className="fas fa-arrow-left text-[10px]" /> LİSTE</button>
                            <input type="text" placeholder="Hareket ara..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="input-kurumsal w-40" />
                            <input type="date" value={baslangicTarih} onChange={(e) => setBaslangicTarih(e.target.value)} className="input-kurumsal w-36" />
                            <span className="text-[10px] text-[#94a3b8]">—</span>
                            <input type="date" value={bitisTarih} onChange={(e) => setBitisTarih(e.target.value)} className="input-kurumsal w-36" />
                        </>
                    )}
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <Link href="/tahsilat" className="btn-primary flex items-center gap-2" style={{ background: "#059669" }}><i className="fas fa-money-bill-wave text-[10px]" /> TAHSİLAT</Link>
                        <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 hidden sm:flex"><i className="fas fa-print text-[10px]" /> YAZDIR</button>
                        <button onClick={excelExport} disabled={filtrelenmisHareketler.length === 0} className="btn-secondary flex items-center gap-2 disabled:opacity-40 hidden sm:flex"><i className="fas fa-file-excel text-[#059669] text-[10px]" /> EXCEL</button>
                        {(aramaTerimi || baslangicTarih || bitisTarih) && (
                            <button onClick={filtreTemizle} className="btn-secondary flex items-center gap-2 text-[#dc2626]"><i className="fas fa-times text-[10px]" /> TEMİZLE</button>
                        )}
                    </div>
                </div>

                {/* ANA İÇERİK: CARİ SEÇİLMEDİYSE BAKİYE ÖZETİ, SEÇİLDİYSE EKSTRE */}
                {!seciliFirmaId ? (
                    /* TÜM MÜŞTERİ BAKİYE ÖZETİ */
                    <div className="flex-1 overflow-auto relative" style={{ background: "var(--c-bg)" }}>
                        <div className="p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-[13px] font-semibold text-slate-800 flex items-center"><i className="fas fa-users text-[#1d4ed8] mr-3"></i> Tüm Müşteri Bakiyeleri</h2>
                                <div className="relative">
                                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                    <input type="text" placeholder="Müşteri ara..." value={firmaAramaTerimi} onChange={(e) => setFirmaAramaTerimi(e.target.value)} className="input-kurumsal w-48 pl-8" />
                                </div>
                            </div>

                            {/* ÖZET KARTLARI */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                                <div className="bg-white border border-slate-200 p-4">
                                    <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Toplam Müşteri</div>
                                    <div className="text-xl font-semibold text-[#0f172a]">{firmalar.length}</div>
                                </div>
                                <div className="bg-white border border-slate-200 p-4">
                                    <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Toplam Alacak</div>
                                    <div className="text-xl font-semibold text-[#dc2626]">{firmalar.filter(f => (Number(f.bakiye) || 0) > 0).reduce((acc, f) => acc + (Number(f.bakiye) || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
                                </div>
                                <div className="bg-white border border-slate-200 p-4">
                                    <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Bakiyesi Kapalı</div>
                                    <div className="text-xl font-semibold text-[#059669]">{firmalar.filter(f => (Number(f.bakiye) || 0) === 0).length} <span className="text-sm text-[#94a3b8]">müşteri</span></div>
                                </div>
                            </div>

                            {/* MÜŞTERİ LİSTESİ */}
                            {/* MOBİL KART GÖRÜNÜMÜ */}
                            <div className="md:hidden space-y-2">
                                {filtrelenmisFirmalar.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Kayıtlı Müşteri Bulunamadı</div>
                                ) : (
                                    filtrelenmisFirmalar.map(f => {
                                        const bakiye = Number(f.bakiye) || 0;
                                        return (
                                            <div key={f.id} className="bg-white border border-slate-200 p-3 hover:bg-slate-50">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-[12px] font-semibold text-[#0f172a]">{f.unvan}</span>
                                                    <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${bakiye > 0 ? 'bg-red-50 text-[#dc2626]' : bakiye < 0 ? 'bg-emerald-50 text-[#059669]' : 'text-slate-400'}`} style={{ background: bakiye === 0 ? '#f8fafc' : undefined }}>
                                                        {bakiye > 0 ? 'Borclu' : bakiye < 0 ? 'Alacakli' : 'Kapali'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center mt-2">
                                                    <button onClick={() => setSeciliFirmaId(f.id.toString())} className="btn-primary text-[10px]">
                                                        <i className="fas fa-clipboard-list mr-1"></i> Ekstre
                                                    </button>
                                                    <span className={`text-[12px] font-semibold tabular-nums ${bakiye > 0 ? 'text-[#dc2626]' : bakiye < 0 ? 'text-[#059669]' : 'text-slate-400'}`}>
                                                        {bakiye !== 0 ? Math.abs(bakiye).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TL' : '0,00 TL'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            {/* MASAÜSTÜ TABLO GÖRÜNÜMÜ */}
                            <div className="hidden md:block overflow-auto">
                                <table className="tbl-kurumsal min-w-[600px]">
                                    <thead>
                                        <tr>
                                            <th>Müşteri Ünvanı</th>
                                            <th className="w-40 text-right">Bakiye</th>
                                            <th className="w-32 text-center">Durum</th>
                                            <th className="w-28 text-center">İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtrelenmisFirmalar.length === 0 ? (
                                            <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Kayıtlı Müşteri Bulunamadı</td></tr>
                                        ) : (
                                            filtrelenmisFirmalar.map(f => {
                                                const bakiye = Number(f.bakiye) || 0;
                                                return (
                                                    <tr key={f.id}>
                                                        <td className="font-bold"><i className="fas fa-user-circle text-slate-300 mr-2"></i>{f.unvan}</td>
                                                        <td className={`text-right font-semibold ${bakiye > 0 ? 'text-[#dc2626]' : bakiye < 0 ? 'text-[#059669]' : 'text-slate-400'}`}>
                                                            {bakiye !== 0 ? Math.abs(bakiye).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TL' : '0,00 TL'}
                                                        </td>
                                                        <td className="text-center">
                                                            <span className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-widest ${bakiye > 0 ? 'bg-red-50 text-[#dc2626]' : bakiye < 0 ? 'bg-emerald-50 text-[#059669]' : 'text-slate-400'}`} style={{ background: bakiye === 0 ? '#f8fafc' : undefined }}>
                                                                {bakiye > 0 ? 'Borçlu' : bakiye < 0 ? 'Alacaklı' : 'Kapalı'}
                                                            </span>
                                                        </td>
                                                        <td className="text-center">
                                                            <button onClick={() => setSeciliFirmaId(f.id.toString())} className="btn-primary text-[10px]">
                                                                <i className="fas fa-clipboard-list mr-1"></i> Ekstre
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* SEÇİLİ MÜŞTERİ EKSTRESİ */
                    <>
                        {/* ÖZET KARTLARI */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 shrink-0 print:hidden" style={{ background: "var(--c-bg)" }}>
                            <div className="bg-white border border-slate-200 p-3">
                                <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Müşteri</div>
                                <div className="text-sm font-semibold text-[#0f172a] truncate">{seciliFirmaAd}</div>
                            </div>
                            <div className="bg-white border border-slate-200 p-3">
                                <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Toplam Borç</div>
                                <div className="text-lg font-semibold text-[#dc2626]">{ozet.toplamBorc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div className="bg-white border border-slate-200 p-3">
                                <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Toplam Alacak</div>
                                <div className="text-lg font-semibold text-[#059669]">{ozet.toplamAlacak.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div className={`bg-white border p-3 ${ozet.netBakiye > 0 ? 'border-[#dc2626]/30' : ozet.netBakiye < 0 ? 'border-[#059669]/30' : 'border-slate-200'}`}>
                                <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-widest mb-1">Net Bakiye</div>
                                <div className={`text-lg font-semibold ${ozet.netBakiye > 0 ? 'text-[#dc2626]' : ozet.netBakiye < 0 ? 'text-[#059669]' : 'text-[#94a3b8]'}`}>{Math.abs(ozet.netBakiye).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {ozet.netBakiye > 0 ? '(B)' : ozet.netBakiye < 0 ? '(A)' : ''}</div>
                            </div>
                        </div>

                        {/* EKSTRE TABLOSU */}
                        <div className="flex-1 overflow-auto relative" style={{ background: "var(--c-bg)" }}>
                            {/* YAZDIR BAŞLIĞI */}
                            <div className="print:block hidden mb-4 border-b-2 border-black pb-2 pt-4 px-4 text-center">
                                <h2 className="text-xl font-bold uppercase">{aktifSirket.isletme_adi}</h2>
                                <h3 className="text-lg font-semibold mt-1">MÜŞTERİ HESAP EKSTRESİ</h3>
                                <p className="text-sm font-bold mt-2">Müşteri: {seciliFirmaAd}</p>
                                {(baslangicTarih || bitisTarih) && <p className="text-xs mt-1">Dönem: {baslangicTarih || '...'} — {bitisTarih || '...'}</p>}
                            </div>

                            {/* MOBİL KART GÖRÜNÜMÜ */}
                            <div className="md:hidden space-y-2 p-3">
                                {yukleniyor ? (
                                    <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Veriler Yükleniyor...</div>
                                ) : filtrelenmisHareketler.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">{hareketler.length > 0 ? 'FİLTREYE UYGUN HAREKET BULUNAMADI' : 'HESAP HAREKETİ BULUNMUYOR'}</div>
                                ) : (
                                    <>
                                        {filtrelenmisHareketler.map((h, index) => {
                                            const borc = Number(h.borc) || 0;
                                            const alacak = Number(h.alacak) || 0;
                                            const bakiye = bakiyeHaritasi[index] || 0;
                                            return (
                                                <div key={index} className={`bg-white border border-slate-200 p-3 hover:bg-slate-50 ${borc > 0 ? 'border-l-2 border-l-[#dc2626]' : alacak > 0 ? 'border-l-2 border-l-[#059669]' : ''}`}>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[12px] font-semibold text-[#0f172a]">{h.islem_tipi}</span>
                                                        <span className="text-[11px] text-[#94a3b8]">{new Date(h.tarih).toLocaleDateString('tr-TR')}</span>
                                                    </div>
                                                    <div className="text-[11px] text-[#64748b] truncate">{h.aciklama || '-'} {h.evrak_no ? `| ${h.evrak_no}` : ''}</div>
                                                    <div className="flex justify-between items-center mt-2">
                                                        <div className="flex gap-3">
                                                            {borc > 0 && <span className="text-[11px] font-semibold text-[#dc2626]">B: {borc.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</span>}
                                                            {alacak > 0 && <span className="text-[11px] font-semibold text-[#059669]">A: {alacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</span>}
                                                        </div>
                                                        <span className="text-[12px] font-semibold tabular-nums text-[#1d4ed8]">{Math.abs(bakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} {bakiye > 0 ? '(B)' : bakiye < 0 ? '(A)' : ''}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {/* MOBİL TOPLAM KARTI */}
                                        <div className="bg-slate-50 border-2 border-slate-300 p-3">
                                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">TOPLAM</div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex gap-3">
                                                    <span className="text-[11px] font-semibold text-[#dc2626]">B: {ozet.toplamBorc.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</span>
                                                    <span className="text-[11px] font-semibold text-[#059669]">A: {ozet.toplamAlacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</span>
                                                </div>
                                                <span className="text-[12px] font-semibold tabular-nums text-[#1d4ed8]">{Math.abs(ozet.netBakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} {ozet.netBakiye > 0 ? '(B)' : ozet.netBakiye < 0 ? '(A)' : ''}</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* MASAÜSTÜ TABLO GÖRÜNÜMÜ */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="tbl-kurumsal whitespace-nowrap min-w-[700px]">
                                    <thead>
                                        <tr>
                                            <th className="w-24">Tarih</th>
                                            <th className="w-32">Evrak No</th>
                                            <th className="w-36">İşlem Türü</th>
                                            <th>Açıklama</th>
                                            <th className="w-28 text-right">Borç (TL)</th>
                                            <th className="w-28 text-right">Alacak (TL)</th>
                                            <th className="w-32 text-right">Bakiye</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {yukleniyor ? (
                                            <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">Veriler Yükleniyor...</td></tr>
                                        ) : filtrelenmisHareketler.length === 0 ? (
                                            <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest">{hareketler.length > 0 ? 'FİLTREYE UYGUN HAREKET BULUNAMADI' : 'HESAP HAREKETİ BULUNMUYOR'}</td></tr>
                                        ) : (
                                            <>
                                                {filtrelenmisHareketler.map((h, index) => {
                                                    const borc = Number(h.borc) || 0;
                                                    const alacak = Number(h.alacak) || 0;
                                                    const bakiye = bakiyeHaritasi[index] || 0;

                                                    return (
                                                        <tr key={index} className={`bg-white hover:bg-slate-50 ${borc > 0 ? 'border-l-2 border-[#dc2626]' : alacak > 0 ? 'border-l-2 border-[#059669]' : ''}`}>
                                                            <td>{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                                                            <td className="text-slate-500">{h.evrak_no || '-'}</td>
                                                            <td className="font-bold">{h.islem_tipi}</td>
                                                            <td className="truncate max-w-xs" title={h.aciklama}>{h.aciklama || '-'}</td>
                                                            <td className="text-right font-bold text-[#dc2626] print:text-black">{borc > 0 ? borc.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                                            <td className="text-right font-bold text-[#059669] print:text-black">{alacak > 0 ? alacak.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                                            <td className="text-right font-semibold text-[#1d4ed8] print:text-black">{Math.abs(bakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} {bakiye > 0 ? '(B)' : bakiye < 0 ? '(A)' : ''}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {/* TOPLAM SATIRI */}
                                                <tr className="border-t-2 border-slate-400 text-[11px] font-semibold text-slate-800 print:border-black print:border-t-2" style={{ background: "#f8fafc" }}>
                                                    <td colSpan={4} className="p-2 text-right uppercase tracking-widest" style={{ borderRight: "1px solid var(--c-border)" }}>TOPLAM</td>
                                                    <td className="p-2 text-right text-[#dc2626] print:text-black" style={{ borderRight: "1px solid var(--c-border)" }}>{ozet.toplamBorc.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                                    <td className="p-2 text-right text-[#059669] print:text-black" style={{ borderRight: "1px solid var(--c-border)" }}>{ozet.toplamAlacak.toLocaleString('tr-TR', {minimumFractionDigits: 2})}</td>
                                                    <td className="p-2 text-right text-[#1d4ed8] print:text-black">{Math.abs(ozet.netBakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2})} {ozet.netBakiye > 0 ? '(B)' : ozet.netBakiye < 0 ? '(A)' : ''}</td>
                                                </tr>
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* ALT BAR */}
                        <div className="h-8 flex items-center justify-between px-4 text-[10px] text-slate-600 font-bold shrink-0 print:hidden" style={{ background: "var(--c-bg)", borderTop: "1px solid var(--c-border)" }}>
                            <span>Gösterilen: {filtrelenmisHareketler.length} / {hareketler.length} hareket</span>
                            <span className="text-[#1d4ed8]">Net Bakiye: {Math.abs(ozet.netBakiye).toLocaleString('tr-TR', {minimumFractionDigits:2})} TL {ozet.netBakiye > 0 ? 'Borçlu' : ozet.netBakiye < 0 ? 'Alacaklı' : 'Kapalı'}</span>
                        </div>
                    </>
                )}
            </>
        )}
    </main>
  );
}
