"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import Link from "next/link";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
interface Personel {
    id: number;
    ad_soyad: string;
    eposta: string;
    sifre: string;
    rol: string;
    plasiyer?: boolean;
}
interface FirmaDataState {
    isletme_adi: string; unvan: string; vergi_dairesi: string; vergi_no: string;
    il: string; ilce: string; adres: string; telefon: string; eposta: string; sifre: string;
}
interface PersonelFormState {
    ad_soyad: string; eposta: string; sifre: string; roller: string[];
}

export default function AyarlarEkrani() {
  const toast = useToast();
  const { onayla, OnayModal } = useOnayModal();
  const { aktifSirket, kullaniciRol, isYonetici, sirketGuncelle } = useAuth();

  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [aktifSekme, setAktifSekme] = useState<"FIRMA" | "PERSONEL" | "DOVIZ" | "ABONELIK">("FIRMA");
  const [dovizUSD, setDovizUSD] = useState("");
  const [dovizEUR, setDovizEUR] = useState("");
  const [dovizSonGuncelleme, setDovizSonGuncelleme] = useState("");
  const [dovizSonSaat, setDovizSonSaat] = useState("");
  const [dovizKaydediliyor, setDovizKaydediliyor] = useState(false);
  const [dovizTcmbTarih, setDovizTcmbTarih] = useState("");
  const [dovizOtomatik, setDovizOtomatik] = useState(() => {
      if (typeof window !== "undefined") return localStorage.getItem("doviz_otomatik_guncelleme") !== "false";
      return true;
  });

  const [formData, setFormData] = useState<FirmaDataState>({
      isletme_adi: "", unvan: "", vergi_dairesi: "", vergi_no: "",
      il: "", ilce: "", adres: "", telefon: "", eposta: "", sifre: ""
  });

  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [personelModalAcik, setPersonelModalAcik] = useState(false);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [seciliPersonelId, setSeciliPersonelId] = useState<number | null>(null);

  const [personelForm, setPersonelForm] = useState<PersonelFormState>({
      ad_soyad: "", eposta: "", sifre: "", roller: ["PLASIYER"]
  });


  const sirketId = aktifSirket?.id;

  async function verileriGetir(sId: number) {
      setYukleniyor(true);
      const { data } = await supabase.from("sirketler").select("*").eq("id", sId).single();
      if (data) {
          setFormData({
              isletme_adi: data.isletme_adi || "", unvan: data.unvan || "", vergi_dairesi: data.vergi_dairesi || "", vergi_no: data.vergi_no || "",
              il: data.il || "", ilce: data.ilce || "", adres: data.adres || "", telefon: data.telefon || "", eposta: data.eposta || "", sifre: data.sifre || ""
          });
      }
      setYukleniyor(false);
  }

  async function personelleriGetir(sId: number) {
      const { data } = await supabase.from("alt_kullanicilar").select("*").eq("sirket_id", sId).order('id', { ascending: false });
      setPersoneller(data || []);
  }


  useEffect(() => {
    if (!sirketId) return;

    // Eğer Yönetici ise verileri çek
    if (kullaniciRol.includes("YONETICI")) {
        verileriGetir(sirketId);
        personelleriGetir(sirketId);
        // Ana Depo otomatik oluştur
        supabase.from("depolar").select("id").eq("sirket_id", sirketId).limit(1).then(async ({ data }) => {
            if (!data || data.length === 0) {
                await supabase.from("depolar").insert({ sirket_id: sirketId, depo_adi: "Ana Depo" });
            }
        });
        // Döviz kurlarını çek
        supabase.from("doviz_kurlari").select("*").order("tarih", { ascending: false }).limit(10).then(({ data }) => {
            const kurlar = data || [];
            const usd = kurlar.find(k => k.doviz_turu === "USD");
            const eur = kurlar.find(k => k.doviz_turu === "EUR");
            if (usd) { setDovizUSD(String(usd.kur)); setDovizSonGuncelleme(usd.tarih); }
            if (eur) { setDovizEUR(String(eur.kur)); if (!usd) setDovizSonGuncelleme(eur.tarih); }
        });
    } else {
        setYukleniyor(false);
    }
  }, [sirketId, kullaniciRol]);

  const ayarlariKaydet = async () => {
      if(!aktifSirket) return;
      setKaydediliyor(true);
      const { error } = await supabase.from("sirketler").update(formData).eq("id", aktifSirket.id).select().single();
      if (error) { toast.error("Güncelleme sırasında hata oluştu: " + error.message); }
      else {
          const { sifre: _s, ...sirketVerisi } = formData;
          sirketGuncelle(sirketVerisi as any);
          toast.success("Firma bilgileriniz başarıyla güncellendi!");
      }
      setKaydediliyor(false);
  };

  const rolSecimiGuncelle = (rol: string) => {
      let mevcutRoller = [...personelForm.roller];
      if (mevcutRoller.includes(rol)) mevcutRoller = mevcutRoller.filter(r => r !== rol);
      else mevcutRoller.push(rol);
      setPersonelForm({ ...personelForm, roller: mevcutRoller });
  };

  const yeniPersonelEkle = () => {
      setDuzenlemeModu(false); setSeciliPersonelId(null);
      setPersonelForm({ ad_soyad: "", eposta: "", sifre: "", roller: ["PLASIYER"] });
      setPersonelModalAcik(true);
  };

  const personelDuzenle = (p: Personel) => {
      setDuzenlemeModu(true); setSeciliPersonelId(p.id);
      setPersonelForm({ ad_soyad: p.ad_soyad, eposta: p.eposta, sifre: "", roller: p.rol ? p.rol.split(',') : [] });
      setPersonelModalAcik(true);
  };

  const personelKaydet = async () => {
      if(!aktifSirket) return;
      if(!personelForm.ad_soyad || !personelForm.eposta) { toast.error("Lütfen ad soyad ve e-posta alanlarını doldurun!"); return; }
      if(!duzenlemeModu && !personelForm.sifre) { toast.error("Yeni personel için şifre zorunludur!"); return; }
      if(personelForm.roller.length === 0) { toast.error("Lütfen en az bir yetki alanı seçin!"); return; }
      const kaydedilecekRolString = personelForm.roller.join(',');

      if (duzenlemeModu && seciliPersonelId) {
          const updateData: Record<string, string> = { ad_soyad: personelForm.ad_soyad, eposta: personelForm.eposta, rol: kaydedilecekRolString };
          const { error } = await supabase.from("alt_kullanicilar").update(updateData).eq("id", seciliPersonelId);
          if (error) toast.error("Güncelleme hatası: " + error.message); else toast.success("Personel bilgileri güncellendi.");
      } else {
          // Önce Supabase Auth'da kullanıcı oluştur
          const authRes = await fetch("/api/create-user", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: personelForm.eposta, password: personelForm.sifre }),
          });
          const authData = await authRes.json();
          if (!authRes.ok) { toast.error("Auth hesabı oluşturulamadı: " + (authData.error?.message || authData.error || "Bilinmeyen hata")); return; }

          // Sonra alt_kullanicilar tablosuna kaydet (şifre yazılmıyor)
          const { error } = await supabase.from("alt_kullanicilar").insert([{
              sirket_id: aktifSirket.id, ad_soyad: personelForm.ad_soyad, eposta: personelForm.eposta,
              rol: kaydedilecekRolString, durum: 'AKTIF', auth_uid: authData.user.id
          }]);
          if (error) toast.error("Personel eklenemedi! " + error.message);
      }
      setPersonelModalAcik(false); personelleriGetir(aktifSirket.id);
  };

  const personelSil = async (id: number) => {
      if(!aktifSirket) return;
      onayla({
          baslik: "Personel Sil",
          mesaj: "Bu personelin sisteme girişi iptal edilecek",
          altMesaj: "Bu işlem geri alınamaz.",
          onayMetni: "Evet, Sil",
          tehlikeli: true,
          onOnayla: async () => {
              // Önce auth_uid'yi al
              const { data: personel } = await supabase.from("alt_kullanicilar").select("auth_uid").eq("id", id).single();
              if (personel?.auth_uid) {
                  await fetch("/api/delete-user", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ auth_uid: personel.auth_uid }),
                  });
              }
              await supabase.from("alt_kullanicilar").delete().eq("id", id);
              personelleriGetir(aktifSirket.id);
          }
      });
  };

  if (!aktifSirket || yukleniyor) return <div className="h-full flex items-center justify-center font-semibold text-slate-500" style={{ background: "var(--c-bg)" }}>Sistem Doğrulanıyor...</div>;

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>

        {/* YETKİSİZ GİRİŞ (LOCK EKRANI) */}
        {!isYonetici ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500">
                <div className="w-32 h-32 bg-red-50 text-red-500 flex items-center justify-center text-5xl mb-6 border-4 border-white">
                    <i className="fas fa-lock"></i>
                </div>
                <h1 className="text-3xl font-semibold text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-semibold max-w-md mx-auto">
                    Ayarlar ve personel yönetimi sayfasına sadece &quot;YÖNETİCİ&quot; yetkisine sahip kullanıcılar erişebilir. Lütfen sol menüden yetkili olduğunuz bir sayfaya geçiniz.
                </p>
                <Link href={aktifSirket.rol === "TOPTANCI" ? "/" : "/portal"} className="mt-8 px-8 py-3 bg-[#0f172a] hover:bg-[#1e293b] text-white font-semibold text-xs uppercase tracking-widest transition-all">
                    <i className="fas fa-arrow-left mr-2"></i> Güvenli Sayfaya Dön
                </Link>
            </div>
        ) : (
            <>
                {/* SEKME ÇUBUĞU VE BUTONLAR (YÖNETİCİ İÇİN) */}
                <div className="bg-white border-b border-[var(--c-border)] px-4 md:px-8 pt-4 md:pt-5 shrink-0">
                    <div className="flex flex-col md:flex-row justify-between md:items-end mb-4 md:mb-5 gap-4 md:gap-0">
                        <div className="flex gap-2 overflow-x-auto custom-scrollbar">
                            <button onClick={() => setAktifSekme("FIRMA")} className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all whitespace-nowrap ${aktifSekme === "FIRMA" ? 'bg-[#0f172a] text-white' : 'bg-white text-[#475569] border border-[var(--c-border)]'}`}>Firma Bilgileri</button>
                            <button onClick={() => setAktifSekme("PERSONEL")} className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all whitespace-nowrap ${aktifSekme === "PERSONEL" ? 'bg-[#0f172a] text-white' : 'bg-white text-[#475569] border border-[var(--c-border)]'}`}>Personeller & Yetkiler</button>
                            <button onClick={() => setAktifSekme("DOVIZ")} className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all whitespace-nowrap ${aktifSekme === "DOVIZ" ? 'bg-[#0f172a] text-white' : 'bg-white text-[#475569] border border-[var(--c-border)]'}`}>Döviz Kurları</button>
                            <button onClick={() => setAktifSekme("ABONELIK")} className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-all whitespace-nowrap ${aktifSekme === "ABONELIK" ? 'bg-[#0f172a] text-white' : 'bg-white text-[#475569] border border-[var(--c-border)]'}`}>Abonelik</button>
                        </div>
                        <div className="w-full md:w-auto">
                            {aktifSekme === "FIRMA" && (
                                <button onClick={ayarlariKaydet} disabled={kaydediliyor} className="btn-primary w-full md:w-auto flex items-center justify-center disabled:opacity-50">
                                    {kaydediliyor ? <><i className="fas fa-circle-notch fa-spin mr-2"></i> Kaydediliyor...</> : <><i className="fas fa-save mr-2"></i> Firma Bilgilerini Kaydet</>}
                                </button>
                            )}
                            {aktifSekme === "PERSONEL" && (
                                <button onClick={yeniPersonelEkle} className="btn-primary w-full md:w-auto flex items-center justify-center">
                                    <i className="fas fa-user-plus mr-2"></i> Yeni Personel Ekle
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
                    <div className="max-w-5xl card-kurumsal overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {aktifSekme === "FIRMA" && (
                            <div className="p-0">
                                <div className="p-4 md:p-8 border-b border-[var(--c-border)]">
                                    <h3 className="text-sm font-semibold text-[#1d4ed8] uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-store mr-2"></i> Firma (Marka) Bilgileri</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Sistemde Görünen Marka Adı</label><input type="text" value={formData.isletme_adi} onChange={(e) => setFormData({...formData, isletme_adi: e.target.value})} className="input-kurumsal w-full" /></div>
                                    </div>
                                </div>
                                <div className="p-4 md:p-8 border-b border-[var(--c-border)]" style={{ background: "#f8fafc" }}>
                                    <h3 className="text-sm font-semibold text-orange-600 uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-file-invoice mr-2"></i> Resmi E-Fatura Bilgileri</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div className="md:col-span-2"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Resmi Vergi Ünvanı</label><input type="text" value={formData.unvan} onChange={(e) => setFormData({...formData, unvan: e.target.value})} className="input-kurumsal w-full" /></div>
                                        <div><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Vergi Dairesi</label><input type="text" value={formData.vergi_dairesi} onChange={(e) => setFormData({...formData, vergi_dairesi: e.target.value})} className="input-kurumsal w-full" /></div>
                                        <div><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Vergi No / TCKN</label><input type="text" value={formData.vergi_no} onChange={(e) => setFormData({...formData, vergi_no: e.target.value})} className="input-kurumsal w-full" /></div>
                                    </div>
                                </div>
                                <div className="p-4 md:p-8 border-b border-[var(--c-border)]">
                                    <h3 className="text-sm font-semibold text-[#059669] uppercase tracking-widest mb-4 flex items-center"><i className="fas fa-map-marker-alt mr-2"></i> İletişim ve Adres</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">İl</label><input type="text" value={formData.il} onChange={(e) => setFormData({...formData, il: e.target.value})} className="input-kurumsal w-full" /></div>
                                        <div><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">İlçe</label><input type="text" value={formData.ilce} onChange={(e) => setFormData({...formData, ilce: e.target.value})} className="input-kurumsal w-full" /></div>
                                        <div className="md:col-span-2"><label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Açık Adres</label><textarea value={formData.adres} onChange={(e) => setFormData({...formData, adres: e.target.value})} className="input-kurumsal w-full resize-none h-20"></textarea></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {aktifSekme === "PERSONEL" && (
                            <div className="p-0 animate-in fade-in overflow-x-auto custom-scrollbar">
                                <table className="tbl-kurumsal w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
                                    <thead className="border-b border-[var(--c-border)]" style={{ background: "#f8fafc" }}>
                                        <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                                            <th className="p-4 border-r border-[var(--c-border)]">Ad Soyad</th><th className="p-4 border-r border-[var(--c-border)]">Giriş E-Postası</th><th className="p-4 border-r border-[var(--c-border)] w-64 text-left">Yetki Alanları (Roller)</th><th className="p-4 border-r border-[var(--c-border)] w-24 text-center">Plasiyer</th><th className="p-4 w-24 text-center">İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {personeller.length === 0 ? (<tr><td colSpan={5} className="p-10 text-center text-slate-400 font-semibold uppercase tracking-widest">Kayıtlı alt personeliniz bulunmuyor.</td></tr>) : (
                                            personeller.map(p => {
                                                const roller = p.rol ? p.rol.split(',') : [];
                                                return (
                                                    <tr key={p.id} className="border-b border-[var(--c-border)] hover:bg-[#f8fafc] transition-colors">
                                                        <td className="p-4 font-semibold text-slate-800">{p.ad_soyad}</td><td className="p-4 font-semibold text-[#1d4ed8]">{p.eposta}</td>
                                                        <td className="p-4 text-left">
                                                            <div className="flex flex-wrap gap-1">
                                                                {roller.map((r: string, idx: number) => (
                                                                    <span key={idx} className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${r === 'YONETICI' ? 'bg-purple-100 text-purple-700 border border-purple-200' : r === 'PLASIYER' ? 'bg-blue-100 text-blue-700 border border-blue-200' : r === 'DEPOCU' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>{r}</span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <button onClick={async () => {
                                                                const yeni = !p.plasiyer;
                                                                await supabase.from("alt_kullanicilar").update({ plasiyer: yeni }).eq("id", p.id);
                                                                if (aktifSirket) personelleriGetir(aktifSirket.id);
                                                            }} className={`px-2 py-0.5 text-[10px] font-bold border transition-colors ${p.plasiyer ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}>
                                                                <i className={`fas ${p.plasiyer ? 'fa-toggle-on' : 'fa-toggle-off'} mr-1`} />{p.plasiyer ? 'Evet' : 'Hayır'}
                                                            </button>
                                                        </td>
                                                        <td className="p-4 text-center flex space-x-1 justify-center">
                                                            <button onClick={() => personelDuzenle(p)} className="w-8 h-8 bg-white border border-[var(--c-border)] text-[#1d4ed8] hover:bg-blue-50 hover:border-blue-200 transition-all" title="Düzenle"><i className="fas fa-edit"></i></button>
                                                            <button onClick={() => personelSil(p.id)} className="w-8 h-8 bg-white border border-[var(--c-border)] text-[#dc2626] hover:bg-red-50 hover:border-red-200 transition-all" title="Sil"><i className="fas fa-trash"></i></button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {aktifSekme === "DOVIZ" && (
                            <div className="p-4 md:p-8 animate-in fade-in">
                                <div className="max-w-lg space-y-4">
                                    <div>
                                        <h3 className="text-[13px] font-semibold text-[#0f172a] mb-1">Döviz Kurları (TCMB)</h3>
                                        <p className="text-[10px] text-[#94a3b8]">T.C. Merkez Bankası güncel döviz satış kurları otomatik çekilir.</p>
                                    </div>

                                    {/* Kur Kartları */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-4 border border-[#e2e8f0]" style={{ background: "#f8fafc" }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-8 h-8 bg-[#059669] text-white flex items-center justify-center text-[11px] font-bold shrink-0">$</div>
                                                <div>
                                                    <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">ABD Doları (USD)</div>
                                                    <div className="text-[10px] text-[#64748b]">1 USD = ? TL</div>
                                                </div>
                                            </div>
                                            <div className="text-[22px] font-bold text-[#0f172a] tabular-nums">{dovizUSD ? Number(dovizUSD).toLocaleString("tr-TR", { minimumFractionDigits: 4 }) : "—"} <span className="text-[12px] text-[#94a3b8]">₺</span></div>
                                        </div>
                                        <div className="p-4 border border-[#e2e8f0]" style={{ background: "#f8fafc" }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-8 h-8 bg-[#3b82f6] text-white flex items-center justify-center text-[11px] font-bold shrink-0">€</div>
                                                <div>
                                                    <div className="text-[9px] text-[#94a3b8] uppercase tracking-wider font-semibold">Euro (EUR)</div>
                                                    <div className="text-[10px] text-[#64748b]">1 EUR = ? TL</div>
                                                </div>
                                            </div>
                                            <div className="text-[22px] font-bold text-[#0f172a] tabular-nums">{dovizEUR ? Number(dovizEUR).toLocaleString("tr-TR", { minimumFractionDigits: 4 }) : "—"} <span className="text-[12px] text-[#94a3b8]">₺</span></div>
                                        </div>
                                    </div>

                                    {/* Güncelleme Bilgisi */}
                                    <div className="flex items-center gap-3 text-[10px] text-[#94a3b8]">
                                        {dovizTcmbTarih && <span>TCMB Tarihi: <span className="font-semibold text-[#475569]">{dovizTcmbTarih}</span></span>}
                                        {dovizSonSaat && <span>· Son güncelleme: <span className="font-semibold text-[#475569]">{new Date(dovizSonSaat).toLocaleString("tr-TR")}</span></span>}
                                    </div>

                                    {/* Otomatik Güncelleme Toggle */}
                                    <div className="flex items-center justify-between p-3 border border-[#e2e8f0]" style={{ background: "#f8fafc" }}>
                                        <div>
                                            <div className="text-[11px] font-semibold text-[#0f172a]">Otomatik Güncelleme</div>
                                            <div className="text-[9px] text-[#94a3b8]">Uygulama açılışında günde bir kez TCMB kurlarını otomatik çeker</div>
                                        </div>
                                        <button onClick={() => {
                                            const yeni = !dovizOtomatik;
                                            setDovizOtomatik(yeni);
                                            localStorage.setItem("doviz_otomatik_guncelleme", String(yeni));
                                            toast.success(yeni ? "Otomatik güncelleme açıldı" : "Otomatik güncelleme kapatıldı");
                                        }} className={`px-3 py-1 text-[10px] font-bold border transition-colors ${dovizOtomatik ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                            <i className={`fas ${dovizOtomatik ? 'fa-toggle-on' : 'fa-toggle-off'} mr-1 text-[12px]`} />{dovizOtomatik ? 'Aktif' : 'Pasif'}
                                        </button>
                                    </div>

                                    {/* Butonlar */}
                                    <div className="flex items-center gap-2">
                                        <button disabled={dovizKaydediliyor} onClick={async () => {
                                            setDovizKaydediliyor(true);
                                            try {
                                                const res = await fetch("/api/doviz");
                                                const data = await res.json();
                                                if (data.USD > 0) setDovizUSD(String(data.USD));
                                                if (data.EUR > 0) setDovizEUR(String(data.EUR));
                                                if (data.tarih) setDovizTcmbTarih(data.tarih);
                                                if (data.guncellenmeSaati) setDovizSonSaat(data.guncellenmeSaati);
                                                // Supabase'e kaydet
                                                const bugun = new Date().toISOString().split("T")[0];
                                                if (data.USD > 0) await supabase.from("doviz_kurlari").upsert({ doviz_turu: "USD", kur: data.USD, tarih: bugun }, { onConflict: "doviz_turu,tarih", ignoreDuplicates: false });
                                                if (data.EUR > 0) await supabase.from("doviz_kurlari").upsert({ doviz_turu: "EUR", kur: data.EUR, tarih: bugun }, { onConflict: "doviz_turu,tarih", ignoreDuplicates: false });
                                                setDovizSonGuncelleme(bugun);
                                                if (data.USD > 0 || data.EUR > 0) toast.success("TCMB kurları güncellendi ve kaydedildi");
                                                else toast.error("TCMB verisi alınamadı, kurlar güncellenemedi");
                                            } catch { toast.error("Kur güncelleme başarısız"); }
                                            setDovizKaydediliyor(false);
                                        }} className="btn-primary flex items-center gap-2">
                                            {dovizKaydediliyor ? <i className="fas fa-circle-notch fa-spin text-[10px]" /> : <i className="fas fa-sync text-[10px]" />} TCMB Kurlarını Güncelle
                                        </button>
                                    </div>

                                    {/* Manuel Düzenleme */}
                                    <div className="pt-3" style={{ borderTop: "1px solid var(--c-border)" }}>
                                        <div className="text-[10px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Manuel Düzeltme</div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="number" min="0" step="0.0001" value={dovizUSD} onChange={e => setDovizUSD(e.target.value)} className="input-kurumsal w-full" placeholder="USD kuru" />
                                            <input type="number" min="0" step="0.0001" value={dovizEUR} onChange={e => setDovizEUR(e.target.value)} className="input-kurumsal w-full" placeholder="EUR kuru" />
                                        </div>
                                        <button disabled={dovizKaydediliyor} onClick={async () => {
                                            setDovizKaydediliyor(true);
                                            const bugun = new Date().toISOString().split("T")[0];
                                            if (Number(dovizUSD) > 0) await supabase.from("doviz_kurlari").upsert({ doviz_turu: "USD", kur: Number(dovizUSD), tarih: bugun }, { onConflict: "doviz_turu,tarih", ignoreDuplicates: false });
                                            if (Number(dovizEUR) > 0) await supabase.from("doviz_kurlari").upsert({ doviz_turu: "EUR", kur: Number(dovizEUR), tarih: bugun }, { onConflict: "doviz_turu,tarih", ignoreDuplicates: false });
                                            setDovizSonGuncelleme(bugun); setDovizSonSaat(new Date().toISOString());
                                            toast.success("Manuel kurlar kaydedildi");
                                            setDovizKaydediliyor(false);
                                        }} className="btn-secondary flex items-center gap-2 mt-2 text-[10px]">
                                            <i className="fas fa-save text-[9px]" /> Manuel Kaydet
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {aktifSekme === "ABONELIK" && (
                            <div className="p-4 md:p-8 animate-in fade-in">
                                {/* Mevcut Plan */}
                                <div className="mb-8 p-4 border border-[var(--c-border)] flex flex-col md:flex-row items-start md:items-center justify-between gap-3" style={{ background: "#f8fafc" }}>
                                    <div>
                                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Mevcut Planınız</p>
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-semibold uppercase tracking-widest">Ücretsiz Başlangıç</span>
                                            <span className="text-[10px] text-slate-400 font-semibold">Temel özellikler</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-2xl font-semibold text-slate-800">0 <span className="text-sm text-slate-400">₺/ay</span></span>
                                    </div>
                                </div>

                                {/* Fiyatlandırma Kartları */}
                                <h3 className="text-sm font-semibold text-[#1d4ed8] uppercase tracking-widest mb-6 flex items-center"><i className="fas fa-crown mr-2"></i> Planınızı Yükseltin</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                                    {/* Başlangıç */}
                                    <div className="border border-[var(--c-border)] p-6 flex flex-col hover:border-blue-300 transition-all">
                                        <div className="mb-4">
                                            <div className="w-10 h-10 bg-blue-100 text-[#1d4ed8] flex items-center justify-center mb-3"><i className="fas fa-rocket"></i></div>
                                            <h4 className="text-base font-semibold text-slate-800">Başlangıç</h4>
                                            <p className="text-[10px] text-slate-400 font-semibold mt-1">Küçük işletmeler için</p>
                                        </div>
                                        <div className="mb-4">
                                            <span className="text-3xl font-semibold text-slate-800">500</span>
                                            <span className="text-sm font-semibold text-slate-400 ml-1">₺/ay</span>
                                        </div>
                                        <ul className="space-y-2 mb-6 flex-1 text-xs text-slate-600">
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> 3 Personel</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> 500 Cari Kart</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> 1.000 Stok Kartı</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> E-posta Destek</li>
                                        </ul>
                                        <button disabled className="btn-secondary w-full cursor-not-allowed flex items-center justify-center gap-2 opacity-50">
                                            <i className="fas fa-clock"></i> Yakında
                                        </button>
                                    </div>

                                    {/* Pro */}
                                    <div className="border-2 border-blue-500 p-6 flex flex-col relative transition-all">
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#1d4ed8] text-white text-[10px] font-semibold uppercase tracking-widest">Popüler</div>
                                        <div className="mb-4">
                                            <div className="w-10 h-10 bg-[#1d4ed8] text-white flex items-center justify-center mb-3"><i className="fas fa-star"></i></div>
                                            <h4 className="text-base font-semibold text-slate-800">Pro</h4>
                                            <p className="text-[10px] text-slate-400 font-semibold mt-1">Büyüyen işletmeler için</p>
                                        </div>
                                        <div className="mb-4">
                                            <span className="text-3xl font-semibold text-[#1d4ed8]">1.500</span>
                                            <span className="text-sm font-semibold text-slate-400 ml-1">₺/ay</span>
                                        </div>
                                        <ul className="space-y-2 mb-6 flex-1 text-xs text-slate-600">
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> 10 Personel</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> Sınırsız Cari Kart</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> Sınırsız Stok Kartı</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> B2B Portal</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> Öncelikli Destek</li>
                                        </ul>
                                        <button disabled className="btn-primary w-full cursor-not-allowed flex items-center justify-center gap-2 opacity-50">
                                            <i className="fas fa-clock"></i> Yakında
                                        </button>
                                    </div>

                                    {/* Kurumsal */}
                                    <div className="border border-[var(--c-border)] p-6 flex flex-col hover:border-purple-300 transition-all">
                                        <div className="mb-4">
                                            <div className="w-10 h-10 bg-purple-100 text-purple-600 flex items-center justify-center mb-3"><i className="fas fa-building"></i></div>
                                            <h4 className="text-base font-semibold text-slate-800">Kurumsal</h4>
                                            <p className="text-[10px] text-slate-400 font-semibold mt-1">Büyük firmalar için</p>
                                        </div>
                                        <div className="mb-4">
                                            <span className="text-3xl font-semibold text-slate-800">4.000</span>
                                            <span className="text-sm font-semibold text-slate-400 ml-1">₺/ay</span>
                                        </div>
                                        <ul className="space-y-2 mb-6 flex-1 text-xs text-slate-600">
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> Sınırsız Personel</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> Sınırsız Cari & Stok</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> Çoklu Şube Desteği</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> API Erişimi</li>
                                            <li className="flex items-center gap-2"><i className="fas fa-check text-[#059669] text-[10px]"></i> 7/24 Telefon Destek</li>
                                        </ul>
                                        <button disabled className="btn-secondary w-full cursor-not-allowed flex items-center justify-center gap-2 opacity-50">
                                            <i className="fas fa-clock"></i> Yakında
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </>
        )}
      </main>

      {/* --- PERSONEL EKLEME / DÜZENLEME MODALI --- */}
      {isYonetici && personelModalAcik && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-md overflow-hidden border border-[var(--c-border)] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="border-b border-[var(--c-border)] p-4 flex justify-between items-center shrink-0" style={{ background: "#f8fafc" }}>
              <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                  <i className={`fas ${duzenlemeModu ? 'fa-user-edit text-[#1d4ed8]' : 'fa-user-plus text-[#059669]'} mr-2`}></i>
                  {duzenlemeModu ? 'Personel Yetkilerini Düzenle' : 'Yeni Personel Ekle'}
              </h3>
              <button onClick={() => setPersonelModalAcik(false)} className="w-8 h-8 bg-white border border-[var(--c-border)] flex items-center justify-center text-slate-500 hover:text-[#dc2626]"><i className="fas fa-times"></i></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Personel Adı Soyadı</label>
                    <input type="text" value={personelForm.ad_soyad} onChange={(e) => setPersonelForm({...personelForm, ad_soyad: e.target.value})} className="input-kurumsal w-full" placeholder="Örn: Ahmet Yılmaz" />
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Sisteme Giriş E-Postası (Kullanıcı Adı)</label>
                    <input type="email" value={personelForm.eposta} onChange={(e) => setPersonelForm({...personelForm, eposta: e.target.value})} className="input-kurumsal w-full" placeholder="Örn: ahmet@sirketiniz.com" />
                </div>
                {!duzenlemeModu && (
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Sisteme Giriş Şifresi</label>
                    <input type="password" value={personelForm.sifre} onChange={(e) => setPersonelForm({...personelForm, sifre: e.target.value})} className="input-kurumsal w-full" placeholder="Minimum 6 karakter" />
                </div>
                )}

                <div className="pt-2">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Yetki Alanları (Birden Fazla Seçilebilir)</label>
                    <div className="space-y-2 border border-[var(--c-border)] p-3" style={{ background: "#f8fafc" }}>
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white transition-colors"><input type="checkbox" checked={personelForm.roller.includes("YONETICI")} onChange={() => rolSecimiGuncelle("YONETICI")} className="w-4 h-4 text-[#1d4ed8] border-gray-300" /><span className="text-xs font-semibold text-slate-700">YÖNETİCİ <span className="text-[10px] font-normal text-slate-400">(Tam erişim)</span></span></label>
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white transition-colors"><input type="checkbox" checked={personelForm.roller.includes("PLASIYER")} onChange={() => rolSecimiGuncelle("PLASIYER")} className="w-4 h-4 text-[#1d4ed8] border-gray-300" /><span className="text-xs font-semibold text-slate-700">PLASİYER <span className="text-[10px] font-normal text-slate-400">(Sipariş / Cari)</span></span></label>
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white transition-colors"><input type="checkbox" checked={personelForm.roller.includes("DEPOCU")} onChange={() => rolSecimiGuncelle("DEPOCU")} className="w-4 h-4 text-[#1d4ed8] border-gray-300" /><span className="text-xs font-semibold text-slate-700">DEPOCU <span className="text-[10px] font-normal text-slate-400">(Stok / Sevkiyat)</span></span></label>
                        <label className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-white transition-colors"><input type="checkbox" checked={personelForm.roller.includes("MUHASEBE")} onChange={() => rolSecimiGuncelle("MUHASEBE")} className="w-4 h-4 text-[#1d4ed8] border-gray-300" /><span className="text-xs font-semibold text-slate-700">MUHASEBE <span className="text-[10px] font-normal text-slate-400">(Fatura / Ekstre)</span></span></label>
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-[var(--c-border)] flex justify-end space-x-3 shrink-0" style={{ background: "#f8fafc" }}>
              <button onClick={() => setPersonelModalAcik(false)} className="btn-secondary">İptal</button>
              <button onClick={personelKaydet} className="btn-primary flex items-center">
                  <i className={`fas ${duzenlemeModu ? 'fa-save' : 'fa-check'} mr-2`}></i> {duzenlemeModu ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
      <OnayModal />
    </>
  );
}
