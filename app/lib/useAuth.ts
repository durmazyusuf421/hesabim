"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// --- TİP TANIMLAMALARI ---
export interface AktifSirket {
  id: number;
  isletme_adi: string;
  rol: string;
  unvan?: string;
  eposta?: string;
  telefon?: string;
  vergi_no?: string;
  vergi_dairesi?: string;
  il?: string;
  ilce?: string;
  adres?: string;
  [key: string]: unknown;
}

export interface AktifKullanici {
  id?: number;
  ad_soyad: string;
  rol: string;
  eposta?: string;
  durum?: string;
  sirket_id?: number;
  [key: string]: unknown;
}

interface AuthState {
  aktifSirket: AktifSirket | null;
  kullanici: AktifKullanici | null;
  kullaniciRol: string;
  yukleniyor: boolean;
  isYonetici: boolean;
  isPlasiyer: boolean;
  isDepocu: boolean;
  isMuhasebe: boolean;
  cikisYap: () => Promise<void>;
}

// localStorage'dan oku
function localStorageOku(): { sirket: AktifSirket; kul: AktifKullanici } | null {
  try {
    const sirketStr = localStorage.getItem("aktifSirket");
    const kullaniciStr = localStorage.getItem("aktifKullanici");
    if (!sirketStr || !kullaniciStr) return null;

    const sirket = JSON.parse(sirketStr) as AktifSirket;
    const kul = JSON.parse(kullaniciStr) as AktifKullanici;

    if (!kul.rol || kul.rol === "") kul.rol = "YONETICI";
    if (!kul.sirket_id && !kul.id) kul.rol = "YONETICI";

    return { sirket, kul };
  } catch {
    return null;
  }
}

export function useAuth(): AuthState {
  const [aktifSirket, setAktifSirket] = useState<AktifSirket | null>(() => {
    // İlk render'da localStorage'dan anında oku (flash yok)
    const ls = localStorageOku();
    return ls ? ls.sirket : null;
  });
  const [kullanici, setKullanici] = useState<AktifKullanici | null>(() => {
    const ls = localStorageOku();
    return ls ? ls.kul : null;
  });
  const [yukleniyor, setYukleniyor] = useState(() => {
    // localStorage'da veri varsa yükleniyor false başlasın
    return !localStorageOku();
  });
  const cozuldu = useRef(false);

  useEffect(() => {
    let mounted = true;

    function tamamla(sirket: AktifSirket, kul: AktifKullanici) {
      if (!mounted || cozuldu.current) return;
      cozuldu.current = true;
      setAktifSirket(sirket);
      setKullanici(kul);
      localStorage.setItem("aktifSirket", JSON.stringify(sirket));
      localStorage.setItem("aktifKullanici", JSON.stringify(kul));
      setYukleniyor(false);
    }

    async function authBaslat() {
      // 1. localStorage'dan zaten okundu (useState initializer'da)
      if (localStorageOku()) {
        cozuldu.current = true;
        return;
      }

      // 2. localStorage yoksa Supabase Auth dene
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeout = new Promise<null>(r => setTimeout(() => r(null), 6000));
        const sonuc = await Promise.race([sessionPromise, timeout]);

        if (sonuc && 'data' in sonuc) {
          const email = sonuc.data.session?.user?.email?.toLowerCase();
          if (email) {
            // Patron kontrolü
            const { data: sirketData } = await supabase
              .from("sirketler").select("*").eq("eposta", email).single();

            if (sirketData) {
              tamamla(sirketData, { ad_soyad: sirketData.isletme_adi, rol: "YONETICI" });
              return;
            }

            // Personel kontrolü
            const { data: personelData } = await supabase
              .from("alt_kullanicilar").select("*, sirketler(*)").eq("eposta", email).single();

            if (personelData?.sirketler) {
              tamamla(personelData.sirketler, personelData);
              return;
            }
          }
        }
      } catch {
        // Supabase hatası - sessizce devam et
      }

      // 3. Hiçbiri çalışmadı
      if (mounted && !cozuldu.current) {
        cozuldu.current = true;
        setYukleniyor(false);
      }
    }

    authBaslat();

    // Auth state değişikliği
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT") {
        cozuldu.current = false;
        setAktifSirket(null);
        setKullanici(null);
        localStorage.removeItem("aktifSirket");
        localStorage.removeItem("aktifKullanici");
      }

      if (event === "TOKEN_REFRESHED" && !session) {
        // Token yenilenemedi - geçersiz refresh token
        localStorage.removeItem("aktifSirket");
        localStorage.removeItem("aktifKullanici");
        localStorage.removeItem("_lastActivity");
        window.location.href = "/login";
      }
    });

    // Geçersiz refresh token kontrolü
    supabase.auth.getSession().then(({ error }) => {
      if (error?.message?.includes("Invalid Refresh Token")) {
        localStorage.removeItem("aktifSirket");
        localStorage.removeItem("aktifKullanici");
        localStorage.removeItem("_lastActivity");
        window.location.href = "/login";
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const kullaniciRol = kullanici?.rol || "";
  const isYonetici = kullaniciRol.includes("YONETICI");

  const cikisYap = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("aktifSirket");
    localStorage.removeItem("aktifKullanici");
    localStorage.removeItem("_lastActivity");
    window.location.href = "/login";
  }, []);

  // --- SESSION TIMEOUT (30 dakika boşta kalınca oturumu kapat) ---
  useEffect(() => {
    if (!aktifSirket) return;
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 dakika

    const updateActivity = () => localStorage.setItem("_lastActivity", Date.now().toString());

    const checkTimeout = () => {
      const last = Number(localStorage.getItem("_lastActivity") || Date.now());
      if (Date.now() - last > SESSION_TIMEOUT_MS) {
        cikisYap();
      }
    };

    // Aktivite takibi
    updateActivity();
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach(ev => window.addEventListener(ev, updateActivity, { passive: true }));

    // Her 60 saniyede timeout kontrolü
    const interval = setInterval(checkTimeout, 60_000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, updateActivity));
      clearInterval(interval);
    };
  }, [aktifSirket, cikisYap]);

  return {
    aktifSirket,
    kullanici,
    kullaniciRol,
    yukleniyor,
    isYonetici,
    isPlasiyer: kullaniciRol.includes("PLASIYER") || isYonetici,
    isDepocu: kullaniciRol.includes("DEPOCU") || isYonetici,
    isMuhasebe: kullaniciRol.includes("MUHASEBE") || isYonetici,
    cikisYap,
  };
}
