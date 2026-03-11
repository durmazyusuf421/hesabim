"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function CariKartlar() {
  const pathname = usePathname();
  const [aktifSirket, setAktifSirket] = useState<any>(null);

  // YETKİ KONTROL STATELERİ
  const [kullaniciRol, setKullaniciRol] = useState<string>("");
  const isYonetici = kullaniciRol.includes("YONETICI");
  const isPlasiyer = kullaniciRol.includes("PLASIYER") || isYonetici;
  const isDepocu = kullaniciRol.includes("DEPOCU") || isYonetici;
  const isMuhasebe = kullaniciRol.includes("MUHASEBE") || isYonetici;
  const hasAccess = isYonetici || isPlasiyer || isMuhasebe; // CARİ ERİŞİM YETKİSİ

  const [firmalar, setFirmalar] = useState<any[]>([]);
  const [aramaTerimi, setAramaTerimi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [seciliFirmaId, setSeciliFirmaId] = useState<number | null>(null);

  const [modalAcik, setModalAcik] = useState(false);
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [firmaForm, setFirmaForm] = useState({ unvan: "", firma_tipi: "Müşteri", telefon: "", vergi_no: "", adres: "" });

  useEffect(() => {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    
    if (!sirketStr || !kullaniciStr) { window.location.href = "/login"; return; }
    
    const sirket = JSON.parse(sirketStr);
    const kullanici = JSON.parse(kullaniciStr);
    if (sirket.rol !== "TOPTANCI") { window.location.href = "/login"; return; }
    
    const rolStr = kullanici.rol || "";
    setKullaniciRol(rolStr);
    setAktifSirket(sirket);

    if (rolStr.includes("YONETICI") || rolStr.includes("PLASIYER") || rolStr.includes("MUHASEBE")) {
        firmalariGetir(sirket.id);
    } else {
        setYukleniyor(false);
    }
  }, []);

  async function firmalariGetir(sirketId: number) {
    setYukleniyor(true);
    const { data } = await supabase.from("firmalar").select("*").eq("sahip_sirket_id", sirketId).order('unvan');
    setFirmalar(data || []);
    setYukleniyor(false);
  }

  const yeniEkle = () => { setDuzenlemeModu(false); setFirmaForm({ unvan: "", firma_tipi: "Müşteri", telefon: "", vergi_no: "", adres: "" }); setModalAcik(true); };
  
  const duzelt = () => {
    if (!seciliFirmaId) return alert("Lütfen listeden bir cari seçin!");
    const seciliFirma = firmalar.find(f => f.id === seciliFirmaId);
    if (seciliFirma) { setFirmaForm(seciliFirma); setDuzenlemeModu(true); setModalAcik(true); }
  };

  const kaydet = async () => {
    if (!firmaForm.unvan) return alert("Unvan zorunludur!");
    if (duzenlemeModu && seciliFirmaId) {
        const { error } = await supabase.from("firmalar").update(firmaForm).eq("id", seciliFirmaId);
        if (error) alert("Hata: " + error.message);
    } else {
        const yeniFirma = { ...firmaForm, sahip_sirket_id: aktifSirket.id };
        const { error } = await supabase.from("firmalar").insert([yeniFirma]);
        if (error) alert("Hata: " + error.message);
    }
    setModalAcik(false); firmalariGetir(aktifSirket.id);
  };

  const sil = async () => {
    if (!seciliFirmaId) return alert("Lütfen listeden bir cari seçin!");
    if(window.confirm("Bu cariyi silmek istediğinize emin misiniz?")) {
        const { error } = await supabase.from("firmalar").delete().eq("id", seciliFirmaId);
        if (!error) { setSeciliFirmaId(null); firmalariGetir(aktifSirket.id); } else { alert("Silinemedi: " + error.message); }
    }
  };

  const cikisYap = () => { localStorage.removeItem("aktifSirket"); localStorage.removeItem("aktifKullanici"); window.location.href = "/login"; };
  const filtrelenmisFirmalar = firmalar.filter(f => f.unvan.toLowerCase().includes(aramaTerimi.toLowerCase()));

  if (!aktifSirket) return <div className="h-screen flex items-center justify-center bg-slate-100 font-bold text-slate-500">Yükleniyor...</div>;

  return (
    <div className="bg-slate-100 font-sans h-screen flex overflow-hidden text-slate-800">
      
      {/* SOL MENÜ (AKILLI VE KİLİTLİ) */}
      <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col shrink-0 text-sm border-r border-slate-800 print:hidden">
        <div className="h-16 flex flex-col items-center justify-center border-b border-slate-700 bg-slate-950 font-black text-white tracking-widest px-2 text-center">
            <span className="text-orange-500 text-[10px] uppercase mb-0.5">{isYonetici ? 'Sistem Yöneticisi' : 'Personel Hesabı'}</span>
            <span className="text-xs truncate w-full">{aktifSirket.isletme_adi}</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
  {aktifSirket.rol === "TOPTANCI" ? (
      <>
          {isYonetici ? <Link href="/dashboard" className={`flex items-center px-6 py-3 transition-all ${pathname === "/dashboard" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-chart-pie w-6"></i> Ana Sayfa</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-chart-pie w-6"></i> Ana Sayfa <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          
          {/* YENİ EKLENEN POS EKRANI LİNKİ */}
          {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) ? <Link href="/pos" className={`flex items-center px-6 py-3 transition-all ${pathname === "/pos" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}

          {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("DEPOCU")) ? <Link href="/" className={`flex items-center px-6 py-3 transition-all ${pathname === "/" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-th-large w-6"></i> Siparişler (Fiş)</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-th-large w-6"></i> Siparişler (Fiş) <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/faturalar" className={`flex items-center px-6 py-3 transition-all ${pathname === "/faturalar" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-file-invoice w-6"></i> Faturalar</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-file-invoice w-6"></i> Faturalar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Stok Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-box w-6"></i> Stok Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || kullaniciRol.includes("DEPOCU") ? <Link href="/stok-hareketleri" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok-hareketleri" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-dolly-flatbed w-6"></i> Stok Hareketleri <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || (kullaniciRol.includes("PLASIYER") || kullaniciRol.includes("MUHASEBE")) ? <Link href="/cari" className={`flex items-center px-6 py-3 transition-all ${pathname === "/cari" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-users w-6"></i> Cari Kartları</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-users w-6"></i> Cari Kartları <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          {isYonetici || kullaniciRol.includes("MUHASEBE") ? <Link href="/ekstre" className={`flex items-center px-6 py-3 transition-all ${pathname === "/ekstre" ? "bg-slate-800 text-white border-l-4 border-blue-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler</Link> : <div className="flex items-center px-6 py-3 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400" title="Yetkiniz yok"><i className="fas fa-clipboard-list w-6"></i> Cari Hareketler <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
      </>
  ) : (
      <>
          <Link href="/portal/pos" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/pos" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-desktop w-6"></i> Hızlı Satış (POS)</Link>
          <Link href="/stok" className={`flex items-center px-6 py-3 transition-all ${pathname === "/stok" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-box w-6"></i> Market Stokları</Link>
          <Link href="/portal" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-store w-6"></i> Toptan Sipariş</Link>
          <Link href="/portal/siparisler" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/siparisler" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-list-alt w-6"></i> Siparişlerim</Link>
          <Link href="/portal/kasa" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/kasa" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-cash-register w-6"></i> Kasa & Nakit Akışı</Link>
          <Link href="/portal/veresiye" className={`flex items-center px-6 py-3 transition-all ${pathname === "/portal/veresiye" ? "bg-slate-800 text-white border-l-4 border-cyan-500" : "text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent"}`}><i className="fas fa-book w-6"></i> Veresiye Defteri</Link>
      </>
  )}
</nav>
        <div className="p-4 border-t border-slate-800 space-y-2">
          {isYonetici ? <Link href="/ayarlar" className="flex items-center px-2 py-2 transition w-full text-xs uppercase tracking-widest rounded hover:text-white"><i className="fas fa-cog w-6"></i> Ayarlar</Link> : <div className="flex items-center px-2 py-2 opacity-40 cursor-not-allowed text-slate-500 hover:text-red-400 w-full text-xs uppercase tracking-widest"><i className="fas fa-cog w-6"></i> Ayarlar <i className="fas fa-lock ml-auto text-[10px]"></i></div>}
          <button onClick={cikisYap} className="flex items-center px-2 py-2 hover:text-red-400 text-slate-500 transition w-full text-xs uppercase tracking-widest"><i className="fas fa-sign-out-alt w-6"></i> Çıkış Yap</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white relative">
        
        {!hasAccess ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 animate-in zoom-in-95 duration-500">
                <div className="w-32 h-32 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner border-4 border-white"><i className="fas fa-lock"></i></div>
                <h1 className="text-3xl font-black text-slate-800 mb-2">Erişim Engellendi</h1>
                <p className="text-slate-500 font-bold max-w-md mx-auto">Bu sayfaya sadece "YÖNETİCİ", "PLASİYER" veya "MUHASEBE" yetkisine sahip kullanıcılar erişebilir.</p>
                <Link href="/" className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg transition-all"><i className="fas fa-arrow-left mr-2"></i> Siparişlere Dön</Link>
            </div>
        ) : (
            <>
                <div className="h-14 bg-slate-100 border-b border-slate-300 flex items-center px-2 space-x-1 shrink-0">
                    <button onClick={yeniEkle} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-plus text-emerald-600 mr-2"></i> Yeni Ekle</button>
                    <button onClick={duzelt} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-edit text-blue-600 mr-2"></i> Düzelt</button>
                    {(isYonetici || isMuhasebe) && <button onClick={sil} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm"><i className="fas fa-trash-alt text-red-600 mr-2"></i> Sil</button>}
                </div>

                <div className="h-10 bg-slate-200 border-b border-slate-300 flex items-center px-4 shrink-0 space-x-4">
                    <span className="text-xs font-bold text-slate-600 uppercase">Aktif Cari Kartlar</span>
                    <div className="flex-1 max-w-md relative">
                        <input type="text" placeholder="Cari unvan ile arama yapın..." value={aramaTerimi} onChange={(e) => setAramaTerimi(e.target.value)} className="w-full text-xs px-3 py-1 border border-slate-300 rounded shadow-inner outline-none focus:border-blue-500" />
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-white relative">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10 shadow-sm">
                            <tr className="text-[11px] font-bold text-slate-700">
                                <th className="p-2 border-r border-slate-300 w-8 text-center"><i className="fas fa-caret-down"></i></th>
                                <th className="p-2 border-r border-slate-300 w-24">Kodu</th>
                                <th className="p-2 border-r border-slate-300">Cari / Adı Unvanı</th>
                                <th className="p-2 border-r border-slate-300 w-32">Grup / Sınıfı</th>
                                <th className="p-2 border-r border-slate-300 w-32">Telefon</th>
                                <th className="p-2 border-r border-slate-300 w-32 text-right">Borç Bakiye</th>
                                <th className="p-2 w-32 text-right">Alacak Bakiye</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtrelenmisFirmalar.map((f) => {
                                const isSelected = seciliFirmaId === f.id;
                                const bakiye = Number(f.bakiye) || 0;
                                return (
                                    <tr key={f.id} onClick={() => setSeciliFirmaId(f.id)} onDoubleClick={duzelt} className={`text-[11px] font-medium border-b border-slate-200 cursor-pointer select-none ${isSelected ? 'bg-[#000080] text-white' : 'hover:bg-slate-100 bg-white text-slate-800'}`}>
                                        <td className="p-1 border-r border-slate-200 text-center">{isSelected && <i className="fas fa-caret-right text-white"></i>}</td>
                                        <td className="p-1.5 border-r border-slate-200">{f.id.toString().padStart(5, '0')}</td>
                                        <td className="p-1.5 border-r border-slate-200 font-bold">{f.unvan}</td>
                                        <td className="p-1.5 border-r border-slate-200">{f.firma_tipi}</td>
                                        <td className="p-1.5 border-r border-slate-200">{f.telefon}</td>
                                        <td className="p-1.5 border-r border-slate-200 text-right font-bold text-red-600">{bakiye > 0 ? bakiye.toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                        <td className="p-1.5 text-right font-bold text-emerald-600">{bakiye < 0 ? Math.abs(bakiye).toLocaleString('tr-TR', {minimumFractionDigits: 2}) : ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </>
        )}
      </main>

      {modalAcik && hasAccess && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-slate-100 rounded shadow-2xl w-full max-w-lg overflow-hidden border border-slate-400">
            <div className="bg-slate-200 border-b border-slate-300 p-2 flex justify-between items-center cursor-move">
              <h3 className="text-xs font-bold text-slate-800 flex items-center"><i className="fas fa-users text-blue-600 mr-2 text-sm"></i> Cari Kartı {duzenlemeModu ? '(Düzeltme)' : '(Yeni Kayıt)'}</h3>
              <button onClick={() => setModalAcik(false)} className="text-slate-500 hover:text-red-600 px-2"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="p-4 bg-white border-b border-slate-300 space-y-3">
              <div className="flex items-center"><label className="w-24 text-xs font-semibold text-slate-700">Kodu</label><input type="text" value={duzenlemeModu ? seciliFirmaId?.toString().padStart(5, '0') : "YENI"} disabled className="flex-1 border border-slate-300 px-2 py-1.5 text-xs bg-yellow-50 font-bold outline-none" /></div>
              <div className="flex items-center"><label className="w-24 text-xs font-semibold text-slate-700">Adı / Ünvanı</label><input type="text" value={firmaForm.unvan} onChange={(e) => setFirmaForm({...firmaForm, unvan: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs focus:bg-blue-50 outline-none" /></div>
              <div className="flex items-center"><label className="w-24 text-xs font-semibold text-slate-700">Sınıfı</label>
                  <select value={firmaForm.firma_tipi} onChange={(e) => setFirmaForm({...firmaForm, firma_tipi: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs focus:bg-blue-50 outline-none">
                      <option value="Müşteri">Müşteri (Alıcı)</option>
                      <option value="Tedarikçi">Tedarikçi (Satıcı)</option>
                  </select>
              </div>
              <div className="flex items-center"><label className="w-24 text-xs font-semibold text-slate-700">Telefon</label><input type="text" value={firmaForm.telefon} onChange={(e) => setFirmaForm({...firmaForm, telefon: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs focus:bg-blue-50 outline-none" /></div>
              <div className="flex items-center"><label className="w-24 text-xs font-semibold text-slate-700">Vergi No</label><input type="text" value={firmaForm.vergi_no} onChange={(e) => setFirmaForm({...firmaForm, vergi_no: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs focus:bg-blue-50 outline-none" /></div>
              <div className="flex items-start"><label className="w-24 text-xs font-semibold text-slate-700 mt-1">Adres</label><textarea value={firmaForm.adres} onChange={(e) => setFirmaForm({...firmaForm, adres: e.target.value})} className="flex-1 border border-slate-300 px-2 py-1.5 text-xs focus:bg-blue-50 outline-none h-16 resize-none"></textarea></div>
            </div>

            <div className="bg-slate-100 p-2 flex justify-end space-x-2">
              <button onClick={() => setModalAcik(false)} className="px-4 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center shadow-sm"><i className="fas fa-times text-red-500 mr-2"></i> İptal</button>
              <button onClick={kaydet} className="px-4 py-1.5 border border-blue-700 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center shadow-sm"><i className="fas fa-save mr-2"></i> Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}