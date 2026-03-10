"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

// SUPABASE AYARLARI
const SUPABASE_URL = "https://phvtklkcgmnqnscmymxr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodnRrbGtjZ21ucW5zY215bXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTY3NDAsImV4cCI6MjA4Nzk3Mjc0MH0.JBt2MfJsFmr7j2Kd0-O_YbLtUzDIBGPQt8hODfYhRbc";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function LandingAndLogin() {
  const [aktifModal, setAktifModal] = useState<'TOPTANCI' | 'PERAKENDE' | null>(null);

  return (
    <div className="min-h-screen bg-[#0B1120] text-white relative font-sans selection:bg-blue-500 selection:text-white overflow-x-hidden">
        
        {/* --- ARKA PLAN GLOW EFEKTLERİ --- */}
        <div className="fixed inset-0 w-full h-full pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[120px]"></div>
            <div className="absolute top-[40%] right-[-10%] w-[800px] h-[800px] bg-orange-600/10 rounded-full blur-[150px]"></div>
            <div className="absolute bottom-[-20%] left-[20%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px]"></div>
        </div>

        {/* --- ÜST BİLGİ (HEADER) --- */}
        <header className="fixed top-0 w-full z-40 flex justify-between items-center p-4 md:px-12 md:py-6 border-b border-white/5 bg-[#0B1120]/80 backdrop-blur-xl">
            <div className="flex flex-col">
                <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase drop-shadow-2xl">
                    DURMAZ <span className="text-blue-500">SAAS</span>
                </h1>
                <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">B2B Ticaret Ağı</p>
            </div>
            <div className="flex space-x-2 md:space-x-4">
                <button onClick={() => setAktifModal('PERAKENDE')} className="group relative flex items-center px-4 py-2 md:px-6 md:py-2.5 bg-slate-800/80 hover:bg-cyan-600/20 border border-cyan-500/30 hover:border-cyan-500 rounded-full transition-all duration-300">
                    <i className="fas fa-store text-cyan-400 mr-2 group-hover:scale-110 transition-transform"></i>
                    <span className="text-[10px] md:text-sm font-bold text-cyan-50">Müşteri Portalı</span>
                </button>
                <button onClick={() => setAktifModal('TOPTANCI')} className="group relative flex items-center px-4 py-2 md:px-6 md:py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                    <i className="fas fa-building text-orange-50 mr-2 group-hover:scale-110 transition-transform"></i>
                    <span className="text-[10px] md:text-sm font-black text-white">Toptancı Girişi</span>
                </button>
            </div>
        </header>

        {/* --- SAYFA İÇERİĞİ (KAYDIRILABİLİR ALAN) --- */}
        <div className="relative z-10 pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto flex flex-col items-center">
            
            {/* HERO BÖLÜMÜ */}
            <div className="text-center mt-10 mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/30 px-5 py-2 rounded-full mb-8 backdrop-blur-sm">
                    <span className="flex h-2.5 w-2.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                    </span>
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-widest">Sistem 7/24 Aktif ve Kullanıma Hazır</span>
                </div>
                
                <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] mb-6">
                    Toptan Ticaretin <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500">Dijital Gücüyle</span> Tanışın.
                </h2>
                
                <p className="text-lg md:text-xl text-slate-400 font-medium max-w-3xl mx-auto leading-relaxed mb-10">
                    Toptancılar için ağır abi bir ERP, marketler için saniyeler içinde sipariş geçebilecekleri şık bir B2B portalı. Resmi muhasebenizi ve e-belgelerinizi tek bir platformdan, dünyanın her yerinden yönetin.
                </p>

                <button onClick={() => setAktifModal('TOPTANCI')} className="px-8 py-4 bg-white text-slate-900 font-black text-sm uppercase tracking-widest rounded-full shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform">
                    Hemen Ücretsiz Başlayın <i className="fas fa-arrow-right ml-2"></i>
                </button>
            </div>

            {/* ÖZELLİKLER VİTRİNİ (4'LÜ GRID) */}
            <div className="w-full mb-32">
                <div className="text-center mb-12">
                    <h3 className="text-3xl font-black text-white mb-4">Neden Durmaz SaaS?</h3>
                    <p className="text-slate-400">İşletmenizi bir üst seviyeye taşıyacak modern altyapı.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-slate-800/30 border border-slate-700/50 p-8 rounded-3xl backdrop-blur-sm hover:bg-slate-800/60 transition-colors group">
                        <div className="w-14 h-14 bg-cyan-500/20 text-cyan-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform"><i className="fas fa-shopping-basket"></i></div>
                        <h4 className="text-lg font-black text-white mb-2">B2B Müşteri Portalı</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">Müşterileriniz size WhatsApp'tan yazmasın. Kendi portalınızdan güncel fiyatlarla 7/24 sipariş geçsinler.</p>
                    </div>

                    <div className="bg-slate-800/30 border border-slate-700/50 p-8 rounded-3xl backdrop-blur-sm hover:bg-slate-800/60 transition-colors group">
                        <div className="w-14 h-14 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform"><i className="fas fa-file-invoice-dollar"></i></div>
                        <h4 className="text-lg font-black text-white mb-2">E-Fatura Tam Uyumlu</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">Resmi VUK kurallarına uygun altyapı. Tek tıkla e-fatura ve e-irsaliye oluşturup merkeze gönderin.</p>
                    </div>

                    <div className="bg-slate-800/30 border border-slate-700/50 p-8 rounded-3xl backdrop-blur-sm hover:bg-slate-800/60 transition-colors group">
                        <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform"><i className="fas fa-chart-line"></i></div>
                        <h4 className="text-lg font-black text-white mb-2">Dinamik Cari Ekstre</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">Hangi marketin ne kadar borcu var? Yürüyen bakiye sistemi ile tahsilatlarınızı sıfır hatayla takip edin.</p>
                    </div>

                    <div className="bg-slate-800/30 border border-slate-700/50 p-8 rounded-3xl backdrop-blur-sm hover:bg-slate-800/60 transition-colors group">
                        <div className="w-14 h-14 bg-purple-500/20 text-purple-400 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform"><i className="fas fa-cloud"></i></div>
                        <h4 className="text-lg font-black text-white mb-2">%100 Bulut Mimarisi</h4>
                        <p className="text-sm text-slate-400 leading-relaxed">Bilgisayara kurulum yok. Verileriniz dünyanın en güvenli sunucularında saklanır, mekandan bağımsız çalışın.</p>
                    </div>
                </div>
            </div>

            {/* İSTATİSTİK VEYA GÜVEN BANDI */}
            <div className="w-full bg-gradient-to-r from-blue-900/40 via-slate-800/40 to-cyan-900/40 border border-white/5 rounded-[40px] p-12 text-center backdrop-blur-md mb-20 flex flex-col md:flex-row justify-around items-center gap-8">
                <div>
                    <div className="text-4xl font-black text-white mb-2">Sıfır</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kurulum Maliyeti</div>
                </div>
                <div className="hidden md:block w-px h-12 bg-white/10"></div>
                <div>
                    <div className="text-4xl font-black text-white mb-2">7 / 24</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kesintisiz Erişim</div>
                </div>
                <div className="hidden md:block w-px h-12 bg-white/10"></div>
                <div>
                    <div className="text-4xl font-black text-white mb-2">Multi</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tenant Mimarisi</div>
                </div>
            </div>

            {/* FOOTER */}
            <footer className="w-full text-center border-t border-white/5 pt-8 text-slate-500 text-xs font-bold uppercase tracking-widest">
                <p>© 2026 Durmaz Business Solutions. Tüm Hakları Saklıdır.</p>
            </footer>
        </div>

        {/* --- MODAL YÜZEYİ (E-Fatura Uyumlu Kayıt/Giriş Formu) --- */}
        {aktifModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
                <AuthCard 
                    rol={aktifModal} 
                    baslik={aktifModal === 'TOPTANCI' ? "Toptancı Yönetimi" : "Müşteri Portalı"} 
                    altBaslik="Resmi Ticari Hesap İşlemleri"
                    tema={aktifModal === 'TOPTANCI' ? 'orange' : 'cyan'}
                    icon={aktifModal === 'TOPTANCI' ? "fas fa-building" : "fas fa-store"}
                    kapat={() => setAktifModal(null)}
                />
            </div>
        )}
    </div>
  );
}

// =========================================================================
// KİMLİK DOĞRULAMA VE E-FATURA UYUMLU KAYIT FORMU (PERSONEL MANTIKLI)
// =========================================================================

function AuthCard({ rol, baslik, altBaslik, tema, icon, kapat }: { rol: string, baslik: string, altBaslik: string, tema: 'cyan' | 'orange', icon: string, kapat: () => void }) {
    const [isKayit, setIsKayit] = useState(false);
    const [yukleniyor, setYukleniyor] = useState(false);

    // Form State'leri
    const [eposta, setEposta] = useState(""); 
    const [sifre, setSifre] = useState("");
    const [telefon, setTelefon] = useState("");
    const [isletmeAdi, setIsletmeAdi] = useState(""); 
    const [unvan, setUnvan] = useState(""); 
    const [vergiDairesi, setVergiDairesi] = useState("");
    const [vergiNo, setVergiNo] = useState("");
    const [il, setIl] = useState("");
    const [ilce, setIlce] = useState("");
    const [adres, setAdres] = useState("");

    const renkler = {
        cyan: {
            text: "text-cyan-600", bgLight: "bg-cyan-50", borderFocus: "focus:border-cyan-500",
            gradient: "bg-gradient-to-r from-cyan-500 to-blue-600", btnHover: "hover:from-cyan-600 hover:to-blue-700", 
            shadow: "shadow-cyan-500/30", toggleActive: "bg-white text-cyan-600 shadow-md",
        },
        orange: {
            text: "text-orange-600", bgLight: "bg-orange-50", borderFocus: "focus:border-orange-500",
            gradient: "bg-gradient-to-r from-amber-500 to-orange-600", btnHover: "hover:from-amber-600 hover:to-orange-700", 
            shadow: "shadow-orange-500/30", toggleActive: "bg-white text-orange-600 shadow-md",
        }
    }[tema];

    const handleAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setYukleniyor(true);

        if (isKayit) {
            // KAYIT İŞLEMİ (Sadece Şirket / Patronlar için)
            if (!eposta || !isletmeAdi || !unvan || !telefon || !sifre || !vergiNo || !vergiDairesi || !il || !adres) { 
                alert("Lütfen E-Fatura için gerekli tüm zorunlu alanları doldurun!"); 
                setYukleniyor(false); 
                return; 
            }
            
            const yeniSirket = { 
                eposta: eposta.toLowerCase(), 
                isletme_adi: isletmeAdi, unvan, telefon, sifre, rol, 
                vergi_no: vergiNo, vergi_dairesi: vergiDairesi, il, ilce, adres
            };

            const { data, error } = await supabase.from("sirketler").insert([yeniSirket]).select().single();
            if (error) { alert("Kayıt sırasında hata: E-posta adresi kullanılıyor olabilir."); setYukleniyor(false); return; }
            
            localStorage.setItem("aktifSirket", JSON.stringify(data));
            localStorage.setItem("aktifKullanici", JSON.stringify({ ad_soyad: "Sistem Yöneticisi", rol: "YONETICI" }));
            window.location.href = rol === "TOPTANCI" ? "/" : "/portal";

        } else {
            // GİRİŞ İŞLEMİ (YENİ: HEM PATRON HEM PERSONEL KONTROLÜ)
            if (!eposta || !sifre) { alert("E-posta adresi ve şifre giriniz!"); setYukleniyor(false); return; }
            
            // 1. Önce PATRON (Şirket) Mu Diye Bakıyoruz
            const { data: sirketData } = await supabase.from("sirketler")
                .select("*")
                .eq("eposta", eposta.toLowerCase())
                .eq("sifre", sifre)
                .single();
                
            if (sirketData) {
                // Patron bulundu
                if (sirketData.rol !== rol) { 
                    alert(`Bu hesap ${sirketData.rol} hesabıdır. Lütfen diğer taraftaki butondan giriş yapın!`); 
                    setYukleniyor(false); 
                    return; 
                }
                localStorage.setItem("aktifSirket", JSON.stringify(sirketData));
                localStorage.setItem("aktifKullanici", JSON.stringify({ ad_soyad: sirketData.isletme_adi, rol: "YONETICI" }));
                window.location.href = rol === "TOPTANCI" ? "/" : "/portal";
                return;
            }

            // 2. Patron Değilse PERSONEL (Alt Kullanıcı) Mi Diye Bakıyoruz
            // Personel ise, bağlı olduğu şirket bilgisini de "sirketler(*)" ile çekiyoruz!
            const { data: personelData } = await supabase.from("alt_kullanicilar")
                .select("*, sirketler(*)")
                .eq("eposta", eposta.toLowerCase())
                .eq("sifre", sifre)
                .single();

            if (personelData && personelData.sirketler) {
                // Personel bulundu
                if (personelData.durum !== "AKTIF") {
                    alert("Hesabınız yöneticiniz tarafından pasife alınmış. Lütfen iletişime geçin.");
                    setYukleniyor(false);
                    return;
                }

                if (personelData.sirketler.rol !== rol) {
                    alert(`Bağlı olduğunuz firma ${personelData.sirketler.rol} firmasıdır. Lütfen doğru kapıdan giriş yapın!`);
                    setYukleniyor(false);
                    return;
                }

                // Başarılı Personel Girişi
                localStorage.setItem("aktifSirket", JSON.stringify(personelData.sirketler)); // Ana firma bilgisi
                localStorage.setItem("aktifKullanici", JSON.stringify(personelData)); // Personelin kendi yetki bilgileri
                window.location.href = rol === "TOPTANCI" ? "/" : "/portal";
                return;
            }

            // 3. Hiçbiri Değilse Hata Ver
            alert("Hatalı E-Posta veya Şifre girdiniz!"); 
            setYukleniyor(false);
        }
    };

    return (
        <div className={`w-full ${isKayit ? 'max-w-2xl' : 'max-w-[420px]'} bg-white rounded-[32px] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-300 transition-all`}>
            <button onClick={kapat} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded-full z-10">
                <i className="fas fa-times"></i>
            </button>

            <div className={`h-2 w-full ${renkler.gradient}`}></div>

            <div className="p-8 max-h-[85vh] overflow-y-auto custom-scrollbar">
                <div className="text-center mb-6">
                    <div className={`w-14 h-14 ${renkler.bgLight} ${renkler.text} rounded-2xl mx-auto flex items-center justify-center text-2xl mb-4 shadow-inner`}>
                        <i className={icon}></i>
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">{baslik}</h2>
                    <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{altBaslik}</p>
                </div>

                <div className="flex p-1.5 bg-slate-100 rounded-2xl mb-6">
                    <button type="button" onClick={() => setIsKayit(false)} className={`flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${!isKayit ? renkler.toggleActive : 'text-slate-500 hover:text-slate-800'}`}>Giriş Yap</button>
                    <button type="button" onClick={() => setIsKayit(true)} className={`flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${isKayit ? renkler.toggleActive : 'text-slate-500 hover:text-slate-800'}`}>Ticari Kayıt Oluştur</button>
                </div>

                <form onSubmit={handleAction} className="space-y-4 text-slate-800">
                    
                    {/* GİRİŞ EKRANI ALANLARI */}
                    {!isKayit && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Kayıtlı E-Posta Adresi</label>
                                <div className="relative">
                                    <i className="fas fa-envelope absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                                    <input type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} placeholder="ornek@sirket.com" className={`w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 pl-1">Şifre</label>
                                <div className="relative">
                                    <i className="fas fa-lock absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                                    <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} placeholder="••••••••" className={`w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* KAYIT EKRANI ALANLARI */}
                    {isKayit && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-300 space-y-4">
                            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl mb-4 flex items-start">
                                <i className="fas fa-info-circle text-amber-500 mt-0.5 mr-2"></i>
                                <p className="text-[10px] text-amber-800 font-bold uppercase tracking-wider leading-relaxed">Sistemde görünecek Marka Adınızı ve E-Fatura kesilebilmesi için Resmi Vergi Ünvanınızı eksiksiz giriniz.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İşletme / Marka Adı <span className="text-red-500">*</span></label>
                                    <input type="text" value={isletmeAdi} onChange={(e) => setIsletmeAdi(e.target.value)} placeholder="Örn: Durmaz Toptan" className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Resmi Vergi Ünvanı <span className="text-red-500">*</span></label>
                                    <input type="text" value={unvan} onChange={(e) => setUnvan(e.target.value)} placeholder="Örn: Yusuf Durmaz" className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Vergi Dairesi <span className="text-red-500">*</span></label>
                                    <input type="text" value={vergiDairesi} onChange={(e) => setVergiDairesi(e.target.value)} placeholder="Örn: Selçuklu V.D." className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Vergi No / TCKN <span className="text-red-500">*</span></label>
                                    <input type="text" value={vergiNo} onChange={(e) => setVergiNo(e.target.value)} placeholder="10 veya 11 Haneli" className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                                
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İl <span className="text-red-500">*</span></label>
                                    <input type="text" value={il} onChange={(e) => setIl(e.target.value)} placeholder="Örn: Konya" className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İlçe <span className="text-red-500">*</span></label>
                                    <input type="text" value={ilce} onChange={(e) => setIlce(e.target.value)} placeholder="Örn: Karatay" className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Açık Adres <span className="text-red-500">*</span></label>
                                <textarea value={adres} onChange={(e) => setAdres(e.target.value)} placeholder="Mahalle, Sokak, Kapı No..." className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all resize-none h-20 ${renkler.borderFocus} focus:bg-white`}></textarea>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                <div className="md:col-span-2">
                                     <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-1.5 pl-1">Sisteme Giriş E-Postası (Yönetici) <span className="text-red-500">*</span></label>
                                    <input type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} placeholder="patron@sirket.com" className={`w-full px-4 py-3 bg-slate-50 border-2 border-blue-200 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">İletişim Telefonu <span className="text-red-500">*</span></label>
                                    <input type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="05XX XXX XX XX" className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 pl-1">Sisteme Giriş Şifresi <span className="text-red-500">*</span></label>
                                    <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} placeholder="••••••••" className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm text-slate-800 outline-none transition-all ${renkler.borderFocus} focus:bg-white`} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-6">
                        <button type="submit" disabled={yukleniyor} className={`w-full ${renkler.gradient} ${renkler.btnHover} text-white font-black text-xs uppercase tracking-widest py-4 rounded-xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-70 flex justify-center items-center`}>
                            {yukleniyor ? <i className="fas fa-circle-notch fa-spin text-xl"></i> : (isKayit ? "Ticari Kaydı Tamamla" : "Sisteme Giriş Yap")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}