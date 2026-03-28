import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL environment variable is not set");
if (!SUPABASE_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set");

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Tarih bazlı benzersiz sipariş numarası üretir.
 * Format: PREFIX-YYYYMMDD-NNN (örn: SIP-20260320-001)
 * Son numarayı supabase'den çekip bir sonrakini döner.
 * Çakışma durumunda 3 denemeye kadar retry yapar.
 */
export async function siparisNoUret(prefix: "SIP" | "POS" = "SIP"): Promise<string> {
  const bugun = new Date();
  const tarihStr = bugun.getFullYear().toString() +
    (bugun.getMonth() + 1).toString().padStart(2, "0") +
    bugun.getDate().toString().padStart(2, "0");

  const onEk = `${prefix}-${tarihStr}-`;

  for (let deneme = 0; deneme < 3; deneme++) {
    // Bugünkü son sipariş numarasını bul
    const { data } = await supabase
      .from("siparisler")
      .select("siparis_no")
      .like("siparis_no", `${onEk}%`)
      .order("siparis_no", { ascending: false })
      .limit(1);

    let sira = 1;
    if (data && data.length > 0) {
      const sonNo = data[0].siparis_no as string;
      const sonSira = parseInt(sonNo.split("-").pop() || "0", 10);
      if (!isNaN(sonSira)) sira = sonSira + 1;
    }

    const yeniNo = `${onEk}${sira.toString().padStart(3, "0")}`;

    // Çakışma kontrolü: bu numara zaten var mı?
    const { data: kontrol } = await supabase
      .from("siparisler")
      .select("id")
      .eq("siparis_no", yeniNo)
      .limit(1);

    if (!kontrol || kontrol.length === 0) {
      return yeniNo;
    }
    // Çakışma varsa, bekle ve tekrar dene
    await new Promise(r => setTimeout(r, 100));
  }

  // 3 denemede de çakışma olursa timestamp ekle
  return `${onEk}${Date.now().toString().slice(-4)}`;
}
