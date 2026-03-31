-- B2B Karşılıklı Mutabakat Sistemi - Supabase SQL
ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS toptanci_onay TEXT DEFAULT 'BEKLIYOR';
ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS market_onay TEXT DEFAULT 'BEKLIYOR';
ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS toptanci_notu TEXT;

-- Red sebebi
ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS red_sebebi TEXT;

-- Alış fiyatı takibi
ALTER TABLE urunler ADD COLUMN IF NOT EXISTS alis_fiyati NUMERIC DEFAULT 0;
ALTER TABLE urunler ADD COLUMN IF NOT EXISTS onceki_alis_fiyati NUMERIC DEFAULT 0;

-- Aktif/Pasif ürün sistemi
ALTER TABLE urunler ADD COLUMN IF NOT EXISTS aktif BOOLEAN DEFAULT true;
