import { supabase } from "./supabase";

export type BildirimTip = "BILGI" | "UYARI" | "HATA" | "BASARI";
export type BildirimKaynak = "SIPARIS" | "STOK" | "CARI" | "B2B" | "VERESIYE" | "CEK_SENET" | "SISTEM";

export async function bildirimEkle(
    sirketId: number,
    baslik: string,
    mesaj: string,
    tip: BildirimTip = "BILGI",
    kaynak?: BildirimKaynak,
    kaynakId?: number
) {
    await supabase.from("bildirimler").insert({
        sirket_id: sirketId,
        baslik,
        mesaj,
        tip,
        kaynak: kaynak || null,
        kaynak_id: kaynakId || null,
    });
}
