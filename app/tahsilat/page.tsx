"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { useToast } from "@/app/lib/toast";
import { useOnayModal } from "@/app/lib/useOnayModal";
interface CariOzet { id: string; gercekId: number; tip: string; isim: string; bakiye: number; }
interface Kalem { id: number; cinsi: string; adi: string; tutar: string; aciklama: string; }
interface Evrak { islemTipi: string; seri: string; sira: string; tarih: string; cariId: string; cariAdi: string; bakiye: number; proje: string; personel: string; aciklama: string; }
interface FirmaRow { id: number; unvan: string; bakiye: string | number | null; }
interface CariKartRow { id: number; cari_adi: string; bakiye: string | number | null; borc_bakiye: string | number | null; alacak_bakiye: string | number | null; }
interface CariHareketRow { id: number; tarih?: string; created_at?: string; islem_tipi: string; aciklama?: string; borc: string | number | null; alacak: string | number | null; firma_id?: number; cari_kart_id?: number; }
interface CariHareketInsert { sahip_sirket_id: number | undefined; islem_tipi: string; aciklama: string; tarih: string; borc: number; alacak: number; firma_id?: number; cari_kart_id?: number; }

// METNİ ONDALIKLI SAYIYA ÇEVİREN ERP FONKSİYONU
const parseTutarToFloat = (val: string | number | null | undefined): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str.includes('.') && str.includes(',')) { str = str.replace(/\./g, '').replace(',', '.'); }
    else if (str.includes(',')) { str = str.replace(',', '.'); }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

// SAYIYI TÜRK LİRASI FORMATINA (1.250,50) ÇEVİREN FONKSİYON
const formatTutarString = (val: number): string => {
    if (val === 0) return "";
    return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function TahsilatErpSayfasi() {
    const { aktifSirket } = useAuth();
    const toast = useToast();
    const { onayla, OnayModal } = useOnayModal();
    const [yukleniyor, setYukleniyor] = useState<boolean>(true);
    // Veri Stateleri
    const [cariler, setCariler] = useState<CariOzet[]>([]);
    const [gecmisHareketler, setGecmisHareketler] = useState<CariHareketRow[]>([]);
    const [gecmisModalAcik, setGecmisModalAcik] = useState<boolean>(false);

    // Iyzico stateleri
    const [iyzicoModalAcik, setIyzicoModalAcik] = useState<boolean>(false);
    const [iyzicoFormHtml, setIyzicoFormHtml] = useState<string>("");
    const [iyzicoYukleniyor, setIyzicoYukleniyor] = useState<boolean>(false);

    // Form Stateleri
    const [evrak, setEvrak] = useState<Evrak>({
        islemTipi: "Tahsilat",
        seri: "THS",
        sira: Math.floor(Math.random() * 10000).toString(),
        tarih: new Date().toISOString().split('T')[0],
        cariId: "",
        cariAdi: "",
        bakiye: 0,
        proje: "",
        personel: "",
        aciklama: ""
    });

    const [kalemler, setKalemler] = useState<Kalem[]>([
        { id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }
    ]);

    const sirketId = aktifSirket?.id;
    const sirketRol = aktifSirket?.rol;

    useEffect(() => {
        if (!sirketId) return;
        if (sirketRol !== "TOPTANCI") { window.location.href = "/login"; return; }
        verileriGetir(sirketId);

        // Iyzico callback sonrası URL parametrelerini kontrol et
        const params = new URLSearchParams(window.location.search);
        const iyzicoStatus = params.get("iyzico_status");
        const iyzicoMsg = params.get("iyzico_msg");
        if (iyzicoStatus && iyzicoMsg) {
            if (iyzicoStatus === "success") toast.success(iyzicoMsg);
            else toast.error(iyzicoMsg);
            window.history.replaceState({}, "", "/tahsilat");
        }
    }, [sirketId, sirketRol]);

    async function verileriGetir(sirketId: number) {
        setYukleniyor(true);
        try {
            const resF = await supabase.from("firmalar").select("id, unvan, bakiye").eq("sahip_sirket_id", sirketId);
            const firmalar: CariOzet[] = (resF.data || []).map((f: FirmaRow) => ({ id: `F-${f.id}`, gercekId: Number(f.id), tip: 'firma', isim: String(f.unvan || ""), bakiye: parseTutarToFloat(f.bakiye) }));

            const resC = await supabase.from("firmalar").select("id, unvan, bakiye").eq("sahip_sirket_id", sirketId).eq("firma_tipi", "Bireysel");
            const cariKartlar: CariOzet[] = (resC.data || []).map((c: FirmaRow) => ({ id: `C-${c.id}`, gercekId: Number(c.id), tip: 'cari', isim: String(c.unvan || ""), bakiye: parseTutarToFloat(c.bakiye) }));

            setCariler([...firmalar, ...cariKartlar].sort((a,b) => a.isim.localeCompare(b.isim)));

            const resH = await supabase.from("cari_hareketler").select("*").eq("sahip_sirket_id", sirketId).in("islem_tipi", ["Tahsilat", "Tediye"]).order("id", { ascending: false }).limit(30);
            if (resH.data) setGecmisHareketler(resH.data as CariHareketRow[]);

        } catch { /* veri çekme hatası */ }
        setYukleniyor(false);
    }

    const handleCariSecim = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const secilenId = e.target.value;
        const cari = cariler.find(c => c.id === secilenId);
        if (cari) {
            setEvrak({ ...evrak, cariId: cari.id, cariAdi: cari.isim, bakiye: cari.bakiye });
        } else {
            setEvrak({ ...evrak, cariId: "", cariAdi: "", bakiye: 0 });
        }
    };

    const formuTemizle = () => {
        setEvrak({
            ...evrak, seri: evrak.islemTipi === "Tahsilat" ? "THS" : "TDY", sira: Math.floor(Math.random() * 10000).toString(),
            cariId: "", cariAdi: "", bakiye: 0, proje: "", personel: "", aciklama: ""
        });
        setKalemler([{ id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }]);
    };

    const kalemEkle = () => {
        setKalemler([...kalemler, { id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }]);
    };

    const kalemSil = (id: number) => {
        if(kalemler.length === 1) {
            setKalemler([{ id: Date.now(), cinsi: "Nakit", adi: "KASA", tutar: "", aciklama: "" }]);
        } else {
            setKalemler(kalemler.filter(k => k.id !== id));
        }
    };

    const kalemGuncelle = (id: number, field: keyof Kalem, value: string | number) => {
        setKalemler(kalemler.map(k => k.id === id ? { ...k, [field]: value } : k));
    };

    const handleTutarFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (!evrak.cariId) {
            e.target.blur();
            toast.error("İşlem yapabilmek için lütfen önce sol üstten bir Müşteri/Cari seçiniz.");
        }
    };

    const handleTutarBlur = (id: number, val: string) => {
        const floatDeger = parseTutarToFloat(val);
        kalemGuncelle(id, "tutar", formatTutarString(floatDeger));
    };

    const evrakKaydet = async () => {
        if (!evrak.cariId) { toast.error("Lütfen Cari seçiniz!"); return; }
        const toplamTutarFloat = kalemler.reduce((acc, k) => acc + parseTutarToFloat(k.tutar), 0);
        if (toplamTutarFloat <= 0) { toast.error("Evrak toplamı 0 olamaz! Lütfen tabloya geçerli bir tutar girin."); return; }

        setYukleniyor(true);
        try {
            const seciliGercekCari = cariler.find(c => c.id === evrak.cariId);
            if(!seciliGercekCari) throw new Error("Cari verisi bulunamadı");

            const insertData: CariHareketInsert = {
                sahip_sirket_id: aktifSirket?.id,
                islem_tipi: evrak.islemTipi,
                aciklama: evrak.aciklama || `${evrak.islemTipi} Makbuzu`,
                tarih: new Date(evrak.tarih).toISOString(),
                borc: evrak.islemTipi === "Tediye" ? toplamTutarFloat : 0,
                alacak: evrak.islemTipi === "Tahsilat" ? toplamTutarFloat : 0
            };

            if (seciliGercekCari.tip === 'firma') insertData.firma_id = seciliGercekCari.gercekId;
            else insertData.cari_kart_id = seciliGercekCari.gercekId;

            const { error } = await supabase.from("cari_hareketler").insert([insertData]);
            if (error) { toast.error(`Kayıt Hatası: ${error.message}`); throw error; }

            const bakiyeDegisimi = evrak.islemTipi === "Tahsilat" ? -toplamTutarFloat : toplamTutarFloat;
            const yeniBakiye = seciliGercekCari.bakiye + bakiyeDegisimi;

            if (seciliGercekCari.tip === 'firma') {
                await supabase.from("firmalar").update({ bakiye: yeniBakiye }).eq("id", seciliGercekCari.gercekId);
            } else {
                await supabase.from("firmalar").update({ bakiye: yeniBakiye }).eq("id", seciliGercekCari.gercekId);
            }

            toast.success("Evrak başarıyla kaydedildi!");
            formuTemizle();
            verileriGetir(aktifSirket?.id || 0);
        } catch {
        }
        setYukleniyor(false);
    };

    const gecmisIslemSil = (id: number) => {
        onayla({
            baslik: "Makbuz Sil",
            mesaj: "Bu makbuzu silmek istediğinize emin misiniz?",
            altMesaj: "Cari bakiye otomatik geri alınmaz, sadece makbuz iptal edilir.",
            onayMetni: "Evet, Sil",
            tehlikeli: true,
            onOnayla: async () => {
                setYukleniyor(true);
                await supabase.from("cari_hareketler").delete().eq("id", id);
                verileriGetir(aktifSirket?.id || 0);
                toast.success("Makbuz silindi.");
            }
        });
    };

    const iyzicoOdemeBaslat = async () => {
        if (!evrak.cariId) { toast.error("Lütfen önce bir Cari seçin!"); return; }
        if (evrak.bakiye <= 0) { toast.error("Bu carinin borcu bulunmuyor!"); return; }
        const seciliCari = cariler.find(c => c.id === evrak.cariId);
        if (!seciliCari) return;

        setIyzicoYukleniyor(true);
        try {
            const res = await fetch("/api/iyzico/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tutar: seciliCari.bakiye,
                    cariAdi: seciliCari.isim,
                    cariId: seciliCari.id,
                    cariTip: seciliCari.tip,
                    gercekId: seciliCari.gercekId,
                    sahipSirketId: aktifSirket?.id,
                }),
            });
            const data = await res.json();
            if (!res.ok) { toast.error(data.error || "Iyzico hatası"); return; }
            setIyzicoFormHtml(data.checkoutFormContent);
            setIyzicoModalAcik(true);
        } catch {
            toast.error("Ödeme formu yüklenemedi!");
        } finally {
            setIyzicoYukleniyor(false);
        }
    };

    const evrakToplamiFloat = kalemler.reduce((acc, k) => acc + parseTutarToFloat(k.tutar), 0);

    if (!aktifSirket) return <div className="h-full flex items-center justify-center font-semibold text-slate-500" style={{ background: "var(--c-bg)" }}>Yükleniyor...</div>;

    const getCariIsmiGecmis = (h: CariHareketRow) => {
        if (h.firma_id) { const f = cariler.find(c => c.tip === 'firma' && c.gercekId === h.firma_id); if (f) return f.isim; }
        if (h.cari_kart_id) { const c = cariler.find(c => c.tip === 'cari' && c.gercekId === h.cari_kart_id); if (c) return c.isim; }
        return "Bilinmeyen Müşteri";
    };

    return (
        <>
            {/* ANA ERP EKRANI (Tahsilat Formu) */}
            <main className="flex-1 flex flex-col h-full overflow-hidden w-full" style={{ background: "var(--c-bg)" }}>

                {/* ERP TOOLBAR (ACTION BAR) */}
                {/* Desktop Toolbar */}
                <div className="hidden md:flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <button onClick={evrakKaydet} disabled={yukleniyor || !evrak.cariId} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                        <i className="fas fa-save text-[10px]" /> FORMU KAYDET
                    </button>
                    <button onClick={formuTemizle} className="btn-secondary flex items-center gap-2">
                        <i className="fas fa-eraser text-[10px]" /> TEMİZLE
                    </button>
                    <button onClick={iyzicoOdemeBaslat} disabled={iyzicoYukleniyor || !evrak.cariId || evrak.bakiye <= 0} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                        {iyzicoYukleniyor ? <><i className="fas fa-spinner fa-spin text-[10px]" /> Yükleniyor...</> : <><i className="fas fa-credit-card text-[10px]" /> KREDİ KARTIYLA TAHSİL ET</>}
                    </button>
                    <button onClick={() => setGecmisModalAcik(true)} className="btn-secondary flex items-center gap-2">
                        <i className="fas fa-history text-[10px]" /> GEÇMİŞ MAKBUZLAR
                    </button>
                    {yukleniyor && <span className="text-[#1d4ed8] text-xs"><i className="fas fa-spinner fa-spin mr-1"></i> İşlem Yapılıyor...</span>}
                </div>

                {/* ═══ MOBİL GÖRÜNÜM ═══ */}
                <div className="flex-1 overflow-y-auto md:hidden">
                    <div className="p-3 space-y-3">
                        {/* İşlem Tipi Toggle */}
                        <div className="grid grid-cols-2 gap-0" style={{ border: "1px solid var(--c-border)" }}>
                            <button onClick={() => setEvrak({...evrak, islemTipi: "Tahsilat", seri: "THS"})} className={`py-3 text-sm font-bold text-center transition-colors ${evrak.islemTipi === "Tahsilat" ? "bg-[#059669] text-white" : "bg-white text-slate-500"}`}>
                                <i className="fas fa-arrow-down mr-1.5"></i> TAHSİLAT
                            </button>
                            <button onClick={() => setEvrak({...evrak, islemTipi: "Tediye", seri: "TDY"})} className={`py-3 text-sm font-bold text-center transition-colors ${evrak.islemTipi === "Tediye" ? "bg-[#dc2626] text-white" : "bg-white text-slate-500"}`}>
                                <i className="fas fa-arrow-up mr-1.5"></i> ÖDEME
                            </button>
                        </div>

                        {/* Cari Seçimi */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cari Adı</label>
                            <select value={evrak.cariId} onChange={handleCariSecim} className={`input-kurumsal w-full font-semibold text-sm py-3 cursor-pointer ${!evrak.cariId ? "bg-yellow-50 border-yellow-300" : "bg-amber-50"}`}>
                                <option value="">-- Cari Seçiniz --</option>
                                {cariler.map(c => <option key={c.id} value={c.id}>{c.isim}</option>)}
                            </select>
                        </div>

                        {/* Tarih */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tarih</label>
                            <input type="date" value={evrak.tarih} onChange={(e) => setEvrak({...evrak, tarih: e.target.value})} className="input-kurumsal w-full text-sm py-2.5 cursor-pointer" />
                        </div>

                        {/* Bakiye Bilgisi */}
                        {evrak.cariId && (
                            <div className="flex items-center justify-between px-3 py-2.5 bg-white" style={{ border: "1px solid var(--c-border)" }}>
                                <span className="text-xs font-semibold text-slate-500">Mevcut Bakiye</span>
                                <span className={`font-bold text-base ${evrak.bakiye > 0 ? "text-[#dc2626]" : "text-[#059669]"}`}>{evrak.bakiye.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                            </div>
                        )}

                        {/* BÜYÜK TUTAR INPUT */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">TL Tutar</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={kalemler[0]?.tutar || ""}
                                onFocus={(e) => { handleTutarFocus(e); e.target.select(); }}
                                onChange={(e) => kalemler[0] && kalemGuncelle(kalemler[0].id, "tutar", e.target.value)}
                                onBlur={(e) => kalemler[0] && handleTutarBlur(kalemler[0].id, e.target.value)}
                                className={`w-full h-16 text-2xl font-bold text-center outline-none transition-colors ${evrak.islemTipi === "Tahsilat" ? "text-[#059669] border-[#059669] focus:ring-2 focus:ring-[#059669]/20" : "text-[#dc2626] border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/20"}`}
                                style={{ border: `2px solid ${evrak.islemTipi === "Tahsilat" ? "#059669" : "#dc2626"}`, background: evrak.islemTipi === "Tahsilat" ? "#f0fdf4" : "#fef2f2" }}
                                placeholder="0,00"
                            />
                        </div>

                        {/* Ödeme Şekli Buton Grubu */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Ödeme Şekli</label>
                            <div className="grid grid-cols-3 gap-0" style={{ border: "1px solid var(--c-border)" }}>
                                {[
                                    { val: "Nakit", label: "NAKİT", icon: "fa-money-bill-wave" },
                                    { val: "Havale/EFT", label: "BANKA", icon: "fa-university" },
                                    { val: "Çek", label: "ÇEK/SENET", icon: "fa-money-check" },
                                ].map(opt => (
                                    <button key={opt.val} onClick={() => kalemler[0] && kalemGuncelle(kalemler[0].id, "cinsi", opt.val)}
                                        className={`py-3 text-[11px] font-bold text-center transition-colors ${kalemler[0]?.cinsi === opt.val ? "bg-[#0f172a] text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                                        style={{ borderRight: opt.val !== "Çek" ? "1px solid var(--c-border)" : "none" }}>
                                        <i className={`fas ${opt.icon} block text-sm mb-1`}></i>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Açıklama */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Açıklama (isteğe bağlı)</label>
                            <textarea value={evrak.aciklama} onChange={(e) => setEvrak({...evrak, aciklama: e.target.value})} className="input-kurumsal w-full text-sm" rows={2} placeholder="Açıklama giriniz..." />
                        </div>

                        {/* Toplam ve Geçmiş Makbuzlar */}
                        <div className="flex items-center justify-between px-3 py-2 bg-white" style={{ border: "1px solid var(--c-border)" }}>
                            <span className="text-xs font-semibold text-slate-500">Evrak Toplamı</span>
                            <span className={`font-bold text-lg ${evrak.islemTipi === "Tahsilat" ? "text-[#059669]" : "text-[#dc2626]"}`}>{formatTutarString(evrakToplamiFloat) || "0,00"} ₺</span>
                        </div>

                        {/* KAYDET Butonu */}
                        <button onClick={evrakKaydet} disabled={yukleniyor || !evrak.cariId} className={`w-full py-4 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:opacity-80 transition-colors ${evrak.islemTipi === "Tahsilat" ? "bg-[#059669]" : "bg-[#dc2626]"}`}>
                            {yukleniyor ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                            {evrak.islemTipi === "Tahsilat" ? "TAHSİLATI KAYDET" : "ÖDEMEYİ KAYDET"}
                        </button>

                        {/* Yardımcı Butonlar */}
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={formuTemizle} className="btn-secondary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5">
                                <i className="fas fa-eraser text-[10px]"></i> TEMİZLE
                            </button>
                            <button onClick={() => setGecmisModalAcik(true)} className="btn-secondary py-2.5 text-xs font-bold flex items-center justify-center gap-1.5">
                                <i className="fas fa-history text-[10px]"></i> GEÇMİŞ
                            </button>
                        </div>
                    </div>
                </div>

                {/* ═══ DESKTOP GÖRÜNÜM ═══ */}
                <div className="hidden md:block p-3 shrink-0 overflow-y-auto" style={{ background: "#f8fafc", borderBottom: "1px solid var(--c-border)" }}>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-6xl">
                        <div className="card-kurumsal p-3 space-y-2">
                            <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">İşlem Tipi</label>
                                <select value={evrak.islemTipi} onChange={(e) => { setEvrak({...evrak, islemTipi: e.target.value, seri: e.target.value === "Tahsilat" ? "THS" : "TDY"}); }} className="input-kurumsal w-full font-semibold text-sm cursor-pointer">
                                    <option value="Tahsilat">Tahsilat (Giriş)</option>
                                    <option value="Tediye">Tediye (Çıkış)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Seri</label>
                                    <input type="text" value={evrak.seri} onChange={(e) => setEvrak({...evrak, seri: e.target.value.toUpperCase()})} className="input-kurumsal w-full uppercase text-sm" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Sıra No</label>
                                    <input type="text" value={evrak.sira} onChange={(e) => setEvrak({...evrak, sira: e.target.value})} className="input-kurumsal w-full text-right text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Tarih</label>
                                <input type="date" value={evrak.tarih} onChange={(e) => setEvrak({...evrak, tarih: e.target.value})} className="input-kurumsal w-full cursor-pointer text-sm" />
                            </div>
                        </div>

                        <div className="card-kurumsal p-3 space-y-2">
                            <div>
                                <label className="text-[10px] font-semibold text-[#dc2626] uppercase block mb-1">Cari Adı</label>
                                <select value={evrak.cariId} onChange={handleCariSecim} className={`input-kurumsal w-full font-semibold text-sm cursor-pointer ${!evrak.cariId ? "bg-yellow-100 animate-pulse" : "bg-amber-50"}`}>
                                    <option value="">-- İşlem İçin Cari Seçiniz --</option>
                                    {cariler.map(c => <option key={c.id} value={c.id}>{c.isim}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Döviz Cinsi</label>
                                    <input type="text" disabled value="TL" className="input-kurumsal w-full text-center text-slate-800 font-semibold text-sm" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Döviz Kuru</label>
                                    <input type="text" disabled value="1,0000" className="input-kurumsal w-full text-right text-slate-800 text-sm" />
                                </div>
                            </div>
                        </div>

                        <div className="card-kurumsal p-3 space-y-2">
                            <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Proje</label>
                                <input type="text" value={evrak.proje} onChange={(e) => setEvrak({...evrak, proje: e.target.value})} className="input-kurumsal w-full text-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Personel</label>
                                <input type="text" value={evrak.personel} onChange={(e) => setEvrak({...evrak, personel: e.target.value})} className="input-kurumsal w-full text-sm" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 max-w-6xl flex items-center gap-0">
                        <label className="w-24 text-right pr-2 text-slate-500 font-semibold text-[11px]">Genel Açıklama</label>
                        <input type="text" value={evrak.aciklama} onChange={(e) => setEvrak({...evrak, aciklama: e.target.value})} className="input-kurumsal flex-1" placeholder="Evrak geneli için açıklama giriniz..." />
                    </div>
                </div>

                <div className="hidden md:flex px-2 mt-1 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
                    <div className="px-4 py-1.5 bg-white -mb-[1px] font-semibold text-[#1d4ed8] z-10 cursor-pointer" style={{ border: "1px solid var(--c-border)", borderBottom: "1px solid white" }}>Kayıt Bilgileri (Kalemler)</div>
                </div>

                {/* Desktop Tablo */}
                <div className="flex-1 bg-white mx-2 mb-2 relative overflow-x-auto overflow-y-auto hidden md:block" style={{ border: "1px solid var(--c-border)" }}>
                    <table className="tbl-kurumsal min-w-[800px]">
                        <thead>
                            <tr>
                                <th className="w-6 text-center"></th>
                                <th className="w-28">Ödeme Cinsi</th>
                                <th className="w-36">Kasa / Banka Adı</th>
                                <th className="w-32 text-right">TL Tutar</th>
                                <th className="w-24 text-right">Döviz Kuru</th>
                                <th>Açıklama (Satır)</th>
                                <th className="w-12 text-center">
                                    <button onClick={kalemEkle} className="btn-secondary text-xs px-2 py-0.5 cursor-pointer">
                                        <i className="fas fa-plus"></i> Ekle
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {kalemler.map((kalem, i) => (
                                <tr key={kalem.id} className="hover:bg-amber-50 focus-within:bg-blue-50 transition-colors h-8">
                                    <td className="text-center text-slate-400 font-semibold" style={{ background: "#f8fafc" }}>{i + 1}</td>
                                    <td className="p-0">
                                        <select value={kalem.cinsi} onChange={(e) => kalemGuncelle(kalem.id, "cinsi", e.target.value)} className="w-full h-full p-1.5 bg-transparent outline-none focus:bg-white text-red-700 font-semibold cursor-pointer">
                                            <option value="Nakit">Nakit</option>
                                            <option value="Kredi Kartı">Kredi Kartı</option>
                                            <option value="Havale/EFT">Havale/EFT</option>
                                            <option value="Çek">Çek / Senet</option>
                                        </select>
                                    </td>
                                    <td className="p-0">
                                        <input type="text" value={kalem.adi} onChange={(e) => kalemGuncelle(kalem.id, "adi", e.target.value.toUpperCase())} className="w-full h-full p-1.5 bg-transparent outline-none text-red-700 font-semibold focus:bg-white uppercase" />
                                    </td>
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={kalem.tutar}
                                            onFocus={(e) => { handleTutarFocus(e); e.target.select(); }}
                                            onChange={(e) => kalemGuncelle(kalem.id, "tutar", e.target.value)}
                                            onBlur={(e) => handleTutarBlur(kalem.id, e.target.value)}
                                            className={`w-full h-full p-1.5 bg-transparent outline-none text-right font-semibold focus:bg-white ${evrak.islemTipi === "Tahsilat" ? "text-emerald-700" : "text-blue-700"}`}
                                            placeholder="0,00"
                                        />
                                    </td>
                                    <td className="p-0">
                                        <input disabled type="text" value="1,00" className="w-full h-full p-1.5 outline-none text-right text-slate-500 font-semibold" style={{ background: "#f8fafc" }} />
                                    </td>
                                    <td className="p-0">
                                        <input type="text" value={kalem.aciklama} onChange={(e) => kalemGuncelle(kalem.id, "aciklama", e.target.value)} className="w-full h-full p-1.5 bg-transparent outline-none focus:bg-white" />
                                    </td>
                                    <td className="p-1 text-center">
                                        <button onClick={() => kalemSil(kalem.id)} className="text-[#dc2626] hover:text-red-700 hover:bg-red-50 p-1 transition-colors"><i className="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Desktop Footer */}
                <div className="hidden md:flex h-16 shrink-0 items-center justify-between px-4" style={{ background: "#f8fafc", borderTop: "1px solid var(--c-border)" }}>
                    <div className="flex gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-semibold text-xs">Ortalama Vade :</span>
                            <input type="text" disabled value={evrak.tarih.split("-").reverse().join(".")} className="input-kurumsal w-24 text-center text-slate-800 font-semibold text-xs" />
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1" style={{ border: "1px solid var(--c-border)", background: "white" }}>
                            <span className="text-slate-500 font-semibold text-xs">Mevcut Bakiye :</span>
                            <span className={`font-semibold text-[13px] ${evrak.bakiye > 0 ? "text-[#dc2626]" : "text-[#059669]"}`}>{evrak.bakiye.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end p-1.5 min-w-[200px]" style={{ border: "1px solid var(--c-border)", background: "white" }}>
                        <div className="flex justify-between w-full mb-1" style={{ borderBottom: "1px dashed var(--c-border)" }}>
                            <span className="text-slate-500 font-semibold text-xs">Evrak Döviz Cinsi</span>
                            <span className="font-semibold text-slate-800 text-xs">TL (₺)</span>
                        </div>
                        <div className="flex justify-between w-full">
                            <span className="text-black font-semibold text-sm">TL Toplam</span>
                            <span className={`font-semibold text-[15px] ${evrak.islemTipi === "Tahsilat" ? "text-[#059669]" : "text-[#1d4ed8]"}`}>{formatTutarString(evrakToplamiFloat)}</span>
                        </div>
                    </div>
                </div>

            </main>

            {/* IYZICO ÖDEME FORMU MODALI */}
            {iyzicoModalAcik && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80] p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-auto md:max-w-lg overflow-hidden flex flex-col md:max-h-[90vh]" style={{ border: "1px solid var(--c-border)" }}>
                        <div className="p-3 flex justify-between items-center text-white shrink-0" style={{ background: "#059669", borderBottom: "1px solid var(--c-border)" }}>
                            <h3 className="text-sm font-semibold flex items-center uppercase tracking-widest">
                                <i className="fas fa-credit-card mr-2"></i> Kredi Kartı ile Ödeme
                            </h3>
                            <button onClick={() => { setIyzicoModalAcik(false); setIyzicoFormHtml(""); }} className="hover:text-red-300 transition-colors"><i className="fas fa-times text-lg"></i></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                            <div className="mb-3 p-3 text-xs" style={{ background: "#f8fafc", border: "1px solid var(--c-border)" }}>
                                <span className="font-semibold text-[#059669]">Cari:</span> <span className="font-semibold text-slate-700">{evrak.cariAdi}</span>
                                <span className="mx-3 text-slate-300">|</span>
                                <span className="font-semibold text-[#059669]">Tutar:</span> <span className="font-semibold text-[#059669]">{evrak.bakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2})} TL</span>
                            </div>
                            <div dangerouslySetInnerHTML={{ __html: iyzicoFormHtml }} />
                        </div>
                    </div>
                </div>
            )}

            {gecmisModalAcik && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-0 md:p-4">
                    <div className="bg-white w-full h-full md:h-[80vh] md:max-w-4xl overflow-hidden flex flex-col" style={{ border: "1px solid var(--c-border)" }}>
                        <div className="p-3 flex justify-between items-center text-white shrink-0" style={{ background: "#1e293b", borderBottom: "1px solid var(--c-border)" }}>
                            <h3 className="text-sm font-semibold flex items-center uppercase tracking-widest"><i className="fas fa-history mr-2 text-orange-400"></i> Geçmiş Makbuz ve Hareketler</h3>
                            <button onClick={() => setGecmisModalAcik(false)} className="hover:text-red-400 transition-colors"><i className="fas fa-times text-lg"></i></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4" style={{ background: "#f8fafc" }}>
                          <div className="overflow-x-auto">
                            <table className="tbl-kurumsal min-w-[800px]">
                                <thead>
                                    <tr>
                                        <th className="w-32">Tarih / Saat</th>
                                        <th>Cari Adı</th>
                                        <th className="w-24 text-center">İşlem Tipi</th>
                                        <th className="w-32 text-right">Tutar (TL)</th>
                                        <th>Açıklama</th>
                                        <th className="w-16 text-center">Sil</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {gecmisHareketler.length === 0 ? (
                                        <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-semibold">Kayıt Bulunamadı</td></tr>
                                    ) : (
                                        gecmisHareketler.map(h => {
                                            const isTahsilat = h.islem_tipi === "Tahsilat";
                                            const d = new Date(h.tarih || h.created_at || '');
                                            const tutarFloat = parseTutarToFloat(h.borc) > 0 ? parseTutarToFloat(h.borc) : parseTutarToFloat(h.alacak);
                                            return (
                                                <tr key={h.id} className="hover:bg-yellow-50 transition-colors text-xs text-slate-800">
                                                    <td>{d.toLocaleDateString('tr-TR')} {d.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</td>
                                                    <td className="font-semibold">{getCariIsmiGecmis(h)}</td>
                                                    <td className={`text-center font-semibold ${isTahsilat ? 'text-[#059669]' : 'text-[#1d4ed8]'}`}>{h.islem_tipi}</td>
                                                    <td className="text-right font-semibold">{formatTutarString(tutarFloat)}</td>
                                                    <td className="text-slate-500">{h.aciklama}</td>
                                                    <td className="text-center">
                                                        <button onClick={() => gecmisIslemSil(h.id)} className="btn-secondary text-[10px] px-2 py-1 text-[#dc2626] font-semibold">Sil</button>
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
                </div>
            )}
            <OnayModal />
        </>
    );
}
