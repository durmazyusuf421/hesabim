CREATE TABLE IF NOT EXISTS fatura_sablonlari (
  id SERIAL PRIMARY KEY,
  sirket_id INTEGER REFERENCES sirketler(id),
  sablon_adi TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fatura_sablon_kalemleri (
  id SERIAL PRIMARY KEY,
  sablon_id INTEGER REFERENCES fatura_sablonlari(id),
  urun_adi TEXT,
  miktar NUMERIC DEFAULT 1,
  birim TEXT,
  birim_fiyat NUMERIC DEFAULT 0,
  kdv_orani NUMERIC DEFAULT 20
);

ALTER TABLE fatura_sablonlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE fatura_sablon_kalemleri ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fatura_sablonlari_policy" ON fatura_sablonlari
  FOR ALL USING (sirket_id = get_my_sirket_id());

CREATE POLICY "fatura_sablon_kalemleri_policy" ON fatura_sablon_kalemleri
  FOR ALL USING (
    sablon_id IN (SELECT id FROM fatura_sablonlari WHERE sirket_id = get_my_sirket_id())
  );
