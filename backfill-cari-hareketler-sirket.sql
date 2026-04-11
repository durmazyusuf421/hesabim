-- ============================================================
-- cari_hareketler.sahip_sirket_id backfill
-- ============================================================
-- Amac: Fatura kaynakli cari hareketlerde sahip_sirket_id null
-- kaliyordu (faturalar/page.tsx'teki insert bu alani eklemiyordu).
-- Bu hareketler tahsilat sayfasinda ve bazi raporlarda gorunmuyor.
--
-- Bu SQL, null olan kayitlarin sahip_sirket_id'sini ilgili firma
-- kaydindan turetir.
--
-- Calistirma: Supabase Dashboard -> SQL Editor -> Run
-- ============================================================

UPDATE cari_hareketler ch
SET sahip_sirket_id = f.sahip_sirket_id
FROM firmalar f
WHERE ch.firma_id = f.id
  AND ch.sahip_sirket_id IS NULL;

-- Dogrulama: kac kayit guncellendi?
SELECT COUNT(*) AS hala_null
FROM cari_hareketler
WHERE sahip_sirket_id IS NULL;
