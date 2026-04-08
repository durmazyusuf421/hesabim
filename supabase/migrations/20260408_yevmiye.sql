CREATE TABLE IF NOT EXISTS yevmiye_kayitlari (
  id SERIAL PRIMARY KEY,
  sirket_id INTEGER REFERENCES sirketler(id),
  tarih DATE DEFAULT CURRENT_DATE,
  fis_no TEXT,
  aciklama TEXT,
  hesap_kodu TEXT,
  hesap_adi TEXT,
  borc NUMERIC DEFAULT 0,
  alacak NUMERIC DEFAULT 0,
  kaynak TEXT,
  kaynak_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE yevmiye_kayitlari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yevmiye_policy" ON yevmiye_kayitlari
  FOR ALL USING (sirket_id = get_my_sirket_id());
