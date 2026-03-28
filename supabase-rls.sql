-- ============================================================
-- SUPABASE ROW LEVEL SECURITY (RLS) KURULUMU
-- ============================================================
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın.
--
-- Mantık: Auth user email -> sirketler.eposta veya alt_kullanicilar.eposta
-- eşleşmesiyle sahip_sirket_id / sirket_id bazlı erişim kontrolü.
-- ============================================================

-- ============================================================
-- 1. YARDIMCI FONKSİYONLAR
-- ============================================================

-- Giriş yapan kullanıcının bağlı olduğu şirket ID'sini döner
CREATE OR REPLACE FUNCTION get_my_sirket_id()
RETURNS INTEGER AS $$
DECLARE
  sirket_id INTEGER;
BEGIN
  -- Önce sirketler tablosunda patron mu diye bak
  SELECT id INTO sirket_id
  FROM sirketler
  WHERE eposta = auth.email();

  IF sirket_id IS NOT NULL THEN
    RETURN sirket_id;
  END IF;

  -- Değilse alt_kullanicilar tablosunda personel mi diye bak
  SELECT ak.sirket_id INTO sirket_id
  FROM alt_kullanicilar ak
  WHERE ak.eposta = auth.email()
    AND ak.durum = 'AKTIF'
  LIMIT 1;

  RETURN sirket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 2. RLS AKTİFLEŞTİRME
-- ============================================================

ALTER TABLE sirketler ENABLE ROW LEVEL SECURITY;
ALTER TABLE alt_kullanicilar ENABLE ROW LEVEL SECURITY;
ALTER TABLE urunler ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmalar ENABLE ROW LEVEL SECURITY;
ALTER TABLE cari_kartlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE siparisler ENABLE ROW LEVEL SECURITY;
ALTER TABLE siparis_kalemleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE cari_hareketler ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturalar ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_hareketleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_baglantilar ENABLE ROW LEVEL SECURITY;
ALTER TABLE kasa_islemleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE veresiye_musteriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE veresiye_hareketler ENABLE ROW LEVEL SECURITY;
ALTER TABLE perakende_satislar ENABLE ROW LEVEL SECURITY;
ALTER TABLE perakende_satis_kalemleri ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. SİRKETLER TABLOSU POLİTİKALARI
-- ============================================================

-- Patron kendi şirketini görebilir
CREATE POLICY "sirketler_select_own" ON sirketler
  FOR SELECT USING (eposta = auth.email());

-- Patron kendi şirketini güncelleyebilir
CREATE POLICY "sirketler_update_own" ON sirketler
  FOR UPDATE USING (eposta = auth.email());

-- Yeni şirket kaydı (signup sırasında)
CREATE POLICY "sirketler_insert" ON sirketler
  FOR INSERT WITH CHECK (eposta = auth.email());

-- Herkes toptancı listesini görebilir (B2B keşif için)
CREATE POLICY "sirketler_select_toptanci" ON sirketler
  FOR SELECT USING (rol = 'TOPTANCI');

-- ============================================================
-- 4. ALT KULLANICILAR (PERSONEL) POLİTİKALARI
-- ============================================================

-- Personel kendi kaydını görebilir
CREATE POLICY "alt_kullanicilar_select_self" ON alt_kullanicilar
  FOR SELECT USING (eposta = auth.email());

-- Patron kendi şirketinin personellerini görebilir/yönetebilir
CREATE POLICY "alt_kullanicilar_select_company" ON alt_kullanicilar
  FOR SELECT USING (sirket_id = get_my_sirket_id());

CREATE POLICY "alt_kullanicilar_insert" ON alt_kullanicilar
  FOR INSERT WITH CHECK (sirket_id = get_my_sirket_id());

CREATE POLICY "alt_kullanicilar_update" ON alt_kullanicilar
  FOR UPDATE USING (sirket_id = get_my_sirket_id());

CREATE POLICY "alt_kullanicilar_delete" ON alt_kullanicilar
  FOR DELETE USING (sirket_id = get_my_sirket_id());

-- ============================================================
-- 5. ÜRÜNLER TABLOSU POLİTİKALARI
-- ============================================================

-- Kendi şirketinin ürünlerini görebilir
CREATE POLICY "urunler_select" ON urunler
  FOR SELECT USING (sahip_sirket_id = get_my_sirket_id());

-- B2B: Bağlantılı toptancıların ürünlerini görebilir
CREATE POLICY "urunler_select_b2b" ON urunler
  FOR SELECT USING (
    sahip_sirket_id IN (
      SELECT toptanci_id FROM b2b_baglantilar
      WHERE market_id = get_my_sirket_id() AND durum = 'ONAYLANDI'
    )
  );

CREATE POLICY "urunler_insert" ON urunler
  FOR INSERT WITH CHECK (sahip_sirket_id = get_my_sirket_id());

CREATE POLICY "urunler_update" ON urunler
  FOR UPDATE USING (sahip_sirket_id = get_my_sirket_id());

CREATE POLICY "urunler_delete" ON urunler
  FOR DELETE USING (sahip_sirket_id = get_my_sirket_id());

-- ============================================================
-- 6. FİRMALAR (CARİ KARTLAR B2B) POLİTİKALARI
-- ============================================================

CREATE POLICY "firmalar_select" ON firmalar
  FOR SELECT USING (
    sahip_sirket_id = get_my_sirket_id()
    OR bagli_sirket_id = get_my_sirket_id()
  );

CREATE POLICY "firmalar_insert" ON firmalar
  FOR INSERT WITH CHECK (sahip_sirket_id = get_my_sirket_id());

CREATE POLICY "firmalar_update" ON firmalar
  FOR UPDATE USING (sahip_sirket_id = get_my_sirket_id());

CREATE POLICY "firmalar_delete" ON firmalar
  FOR DELETE USING (sahip_sirket_id = get_my_sirket_id());

-- Market kendisi için cari kayıt oluşturabilir (B2B sipariş için)
CREATE POLICY "firmalar_insert_b2b" ON firmalar
  FOR INSERT WITH CHECK (
    bagli_sirket_id = get_my_sirket_id()
  );

-- ============================================================
-- 7. CARİ KARTLAR POLİTİKALARI
-- ============================================================

CREATE POLICY "cari_kartlar_select" ON cari_kartlar
  FOR SELECT USING (sahip_sirket_id = get_my_sirket_id());

CREATE POLICY "cari_kartlar_insert" ON cari_kartlar
  FOR INSERT WITH CHECK (sahip_sirket_id = get_my_sirket_id());

CREATE POLICY "cari_kartlar_update" ON cari_kartlar
  FOR UPDATE USING (sahip_sirket_id = get_my_sirket_id());

CREATE POLICY "cari_kartlar_delete" ON cari_kartlar
  FOR DELETE USING (sahip_sirket_id = get_my_sirket_id());

-- ============================================================
-- 8. SİPARİŞLER POLİTİKALARI
-- ============================================================

-- Satıcı veya alıcı olan siparişleri görebilir
CREATE POLICY "siparisler_select" ON siparisler
  FOR SELECT USING (
    satici_sirket_id = get_my_sirket_id()
    OR toptanci_id = get_my_sirket_id()
    OR alici_firma_id IN (
      SELECT id FROM firmalar WHERE bagli_sirket_id = get_my_sirket_id()
    )
  );

CREATE POLICY "siparisler_insert" ON siparisler
  FOR INSERT WITH CHECK (
    satici_sirket_id = get_my_sirket_id()
    OR toptanci_id = get_my_sirket_id()
  );

CREATE POLICY "siparisler_update" ON siparisler
  FOR UPDATE USING (
    satici_sirket_id = get_my_sirket_id()
    OR toptanci_id = get_my_sirket_id()
  );

CREATE POLICY "siparisler_delete" ON siparisler
  FOR DELETE USING (
    satici_sirket_id = get_my_sirket_id()
    OR toptanci_id = get_my_sirket_id()
  );

-- Market sipariş oluşturabilir (alıcı olarak)
CREATE POLICY "siparisler_insert_market" ON siparisler
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM firmalar f
      WHERE f.id = alici_firma_id
      AND f.bagli_sirket_id = get_my_sirket_id()
    )
  );

-- Market kendi siparişlerini görebilir
CREATE POLICY "siparisler_select_market" ON siparisler
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM firmalar f
      WHERE f.id = alici_firma_id
      AND f.bagli_sirket_id = get_my_sirket_id()
    )
  );

-- ============================================================
-- 9. SİPARİŞ KALEMLERİ POLİTİKALARI
-- ============================================================

CREATE POLICY "siparis_kalemleri_select" ON siparis_kalemleri
  FOR SELECT USING (
    siparis_id IN (
      SELECT id FROM siparisler
      WHERE satici_sirket_id = get_my_sirket_id()
        OR toptanci_id = get_my_sirket_id()
        OR alici_firma_id IN (SELECT id FROM firmalar WHERE bagli_sirket_id = get_my_sirket_id())
    )
  );

CREATE POLICY "siparis_kalemleri_insert" ON siparis_kalemleri
  FOR INSERT WITH CHECK (
    siparis_id IN (
      SELECT id FROM siparisler
      WHERE satici_sirket_id = get_my_sirket_id()
        OR toptanci_id = get_my_sirket_id()
    )
  );

CREATE POLICY "siparis_kalemleri_delete" ON siparis_kalemleri
  FOR DELETE USING (
    siparis_id IN (
      SELECT id FROM siparisler
      WHERE satici_sirket_id = get_my_sirket_id()
        OR toptanci_id = get_my_sirket_id()
    )
  );

-- Market sipariş kalemleri ekleyebilir
CREATE POLICY "siparis_kalemleri_insert_market" ON siparis_kalemleri
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM siparisler s
      JOIN firmalar f ON f.id = s.alici_firma_id
      WHERE s.id = siparis_id
      AND f.bagli_sirket_id = get_my_sirket_id()
    )
  );

-- Market kendi sipariş kalemlerini görebilir
CREATE POLICY "siparis_kalemleri_select_market" ON siparis_kalemleri
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM siparisler s
      JOIN firmalar f ON f.id = s.alici_firma_id
      WHERE s.id = siparis_id
      AND f.bagli_sirket_id = get_my_sirket_id()
    )
  );

-- ============================================================
-- 10. CARİ HAREKETLER POLİTİKALARI
-- ============================================================

CREATE POLICY "cari_hareketler_select" ON cari_hareketler
  FOR SELECT USING (
    firma_id IN (SELECT id FROM firmalar WHERE sahip_sirket_id = get_my_sirket_id() OR bagli_sirket_id = get_my_sirket_id())
    OR sahip_sirket_id = get_my_sirket_id()
  );

CREATE POLICY "cari_hareketler_insert" ON cari_hareketler
  FOR INSERT WITH CHECK (
    sahip_sirket_id = get_my_sirket_id()
    OR firma_id IN (SELECT id FROM firmalar WHERE sahip_sirket_id = get_my_sirket_id())
  );

CREATE POLICY "cari_hareketler_delete" ON cari_hareketler
  FOR DELETE USING (sahip_sirket_id = get_my_sirket_id());

-- ============================================================
-- 11. FATURALAR POLİTİKALARI
-- ============================================================

CREATE POLICY "faturalar_select" ON faturalar
  FOR SELECT USING (sirket_id = get_my_sirket_id());

CREATE POLICY "faturalar_insert" ON faturalar
  FOR INSERT WITH CHECK (sirket_id = get_my_sirket_id());

CREATE POLICY "faturalar_update" ON faturalar
  FOR UPDATE USING (sirket_id = get_my_sirket_id());

CREATE POLICY "faturalar_delete" ON faturalar
  FOR DELETE USING (sirket_id = get_my_sirket_id());

-- ============================================================
-- 12. STOK HAREKETLERİ POLİTİKALARI
-- ============================================================

CREATE POLICY "stok_hareketleri_select" ON stok_hareketleri
  FOR SELECT USING (sirket_id = get_my_sirket_id());

CREATE POLICY "stok_hareketleri_insert" ON stok_hareketleri
  FOR INSERT WITH CHECK (sirket_id = get_my_sirket_id());

CREATE POLICY "stok_hareketleri_delete" ON stok_hareketleri
  FOR DELETE USING (sirket_id = get_my_sirket_id());

-- ============================================================
-- 13. B2B BAĞLANTILAR POLİTİKALARI
-- ============================================================

CREATE POLICY "b2b_baglantilar_select" ON b2b_baglantilar
  FOR SELECT USING (
    toptanci_id = get_my_sirket_id()
    OR market_id = get_my_sirket_id()
  );

CREATE POLICY "b2b_baglantilar_insert" ON b2b_baglantilar
  FOR INSERT WITH CHECK (
    market_id = get_my_sirket_id()
  );

CREATE POLICY "b2b_baglantilar_update" ON b2b_baglantilar
  FOR UPDATE USING (
    toptanci_id = get_my_sirket_id()
    OR market_id = get_my_sirket_id()
  );

-- ============================================================
-- 14. KASA İŞLEMLERİ POLİTİKALARI (Market/Perakende)
-- ============================================================

CREATE POLICY "kasa_islemleri_select" ON kasa_islemleri
  FOR SELECT USING (sirket_id = get_my_sirket_id());

CREATE POLICY "kasa_islemleri_insert" ON kasa_islemleri
  FOR INSERT WITH CHECK (sirket_id = get_my_sirket_id());

CREATE POLICY "kasa_islemleri_delete" ON kasa_islemleri
  FOR DELETE USING (sirket_id = get_my_sirket_id());

-- ============================================================
-- 15. VERESİYE MÜŞTERİLERİ POLİTİKALARI
-- ============================================================

CREATE POLICY "veresiye_musteriler_select" ON veresiye_musteriler
  FOR SELECT USING (sirket_id = get_my_sirket_id());

CREATE POLICY "veresiye_musteriler_insert" ON veresiye_musteriler
  FOR INSERT WITH CHECK (sirket_id = get_my_sirket_id());

CREATE POLICY "veresiye_musteriler_update" ON veresiye_musteriler
  FOR UPDATE USING (sirket_id = get_my_sirket_id());

CREATE POLICY "veresiye_musteriler_delete" ON veresiye_musteriler
  FOR DELETE USING (sirket_id = get_my_sirket_id());

-- ============================================================
-- 16. VERESİYE HAREKETLERİ POLİTİKALARI
-- ============================================================

CREATE POLICY "veresiye_hareketler_select" ON veresiye_hareketler
  FOR SELECT USING (
    musteri_id IN (SELECT id FROM veresiye_musteriler WHERE sirket_id = get_my_sirket_id())
  );

CREATE POLICY "veresiye_hareketler_insert" ON veresiye_hareketler
  FOR INSERT WITH CHECK (
    musteri_id IN (SELECT id FROM veresiye_musteriler WHERE sirket_id = get_my_sirket_id())
  );

CREATE POLICY "veresiye_hareketler_delete" ON veresiye_hareketler
  FOR DELETE USING (
    musteri_id IN (SELECT id FROM veresiye_musteriler WHERE sirket_id = get_my_sirket_id())
  );

-- ============================================================
-- 17. PERAKENDE SATIŞLAR POLİTİKALARI
-- ============================================================

CREATE POLICY "perakende_satislar_select" ON perakende_satislar
  FOR SELECT USING (sirket_id = get_my_sirket_id());

CREATE POLICY "perakende_satislar_insert" ON perakende_satislar
  FOR INSERT WITH CHECK (sirket_id = get_my_sirket_id());

CREATE POLICY "perakende_satis_kalemleri_select" ON perakende_satis_kalemleri
  FOR SELECT USING (
    satis_id IN (SELECT id FROM perakende_satislar WHERE sirket_id = get_my_sirket_id())
  );

CREATE POLICY "perakende_satis_kalemleri_insert" ON perakende_satis_kalemleri
  FOR INSERT WITH CHECK (
    satis_id IN (SELECT id FROM perakende_satislar WHERE sirket_id = get_my_sirket_id())
  );
