CREATE TABLE IF NOT EXISTS masraflar (
  id SERIAL PRIMARY KEY,
  sirket_id INTEGER REFERENCES sirketler(id),
  masraf_kategorisi TEXT NOT NULL,
  aciklama TEXT,
  tutar NUMERIC NOT NULL,
  tarih DATE DEFAULT CURRENT_DATE,
  odeme_turu TEXT DEFAULT 'NAKIT',
  belge_no TEXT,
  kdv_tutari NUMERIC DEFAULT 0,
  kdv_orani NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS masraf_kategorileri (
  id SERIAL PRIMARY KEY,
  sirket_id INTEGER REFERENCES sirketler(id),
  kategori_adi TEXT NOT NULL,
  renk TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE masraflar ENABLE ROW LEVEL SECURITY;
ALTER TABLE masraf_kategorileri ENABLE ROW LEVEL SECURITY;

CREATE POLICY "masraflar_policy" ON masraflar
  FOR ALL USING (sirket_id = get_my_sirket_id());

CREATE POLICY "masraf_kategorileri_policy" ON masraf_kategorileri
  FOR ALL USING (sirket_id = get_my_sirket_id());
