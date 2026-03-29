-- Supabase SQL Editor'de çalıştırın:
ALTER TABLE sirketler ADD COLUMN IF NOT EXISTS ozellikler JSONB DEFAULT '{}';
