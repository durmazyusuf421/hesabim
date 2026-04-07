-- Birimler tablosu
CREATE TABLE IF NOT EXISTS birimler (
  id SERIAL PRIMARY KEY,
  sirket_id INTEGER REFERENCES sirketler(id),
  birim_adi TEXT NOT NULL,
  kisaltma TEXT,
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE birimler ENABLE ROW LEVEL SECURITY;
CREATE POLICY "birimler_policy" ON birimler
  FOR ALL USING (sirket_id = get_my_sirket_id());

-- Varsayılan birimleri eklemek için trigger fonksiyonu
CREATE OR REPLACE FUNCTION varsayilan_birimler_ekle()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO birimler (sirket_id, birim_adi, kisaltma) VALUES
    (NEW.id, 'Adet', 'Adet'),
    (NEW.id, 'Kilogram', 'Kg'),
    (NEW.id, 'Litre', 'Lt'),
    (NEW.id, 'Metre', 'Mt'),
    (NEW.id, 'Koli', 'Koli'),
    (NEW.id, 'Paket', 'Paket'),
    (NEW.id, 'Ton', 'Ton'),
    (NEW.id, 'Kutu', 'Kutu'),
    (NEW.id, 'Çuval', 'Çuval'),
    (NEW.id, 'Gram', 'Gr');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
