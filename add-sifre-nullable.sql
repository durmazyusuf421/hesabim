-- ============================================================
-- sirketler.sifre kolonunu nullable yap
-- ============================================================
-- Amac: Sirketler tablosundaki "sifre" kolonu eskiden plaintext
-- sifre tutuyordu. Artik kimlik dogrulama Supabase Auth ile
-- yapiliyor, yani bu kolon gereksiz ve kayit sirasinda dolduru-
-- lamiyor (NOT NULL constraint'i insert'i bozuyor).
--
-- Calistirma: Supabase Dashboard -> SQL Editor -> yeni sorgu -> Run
-- ============================================================

ALTER TABLE sirketler
    ALTER COLUMN sifre DROP NOT NULL;

-- Opsiyonel: Mevcut plaintext sifreleri temizle (guvenlik icin onerilir)
-- UPDATE sirketler SET sifre = NULL WHERE sifre IS NOT NULL;

-- Opsiyonel: Kolonu tamamen kaldir (daha sonra, tum kayitlar Auth'a
-- gectikten emin olduktan sonra calistirin)
-- ALTER TABLE sirketler DROP COLUMN sifre;
