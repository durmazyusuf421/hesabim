import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Iyzipay from "iyzipay";
import iyzipay from "@/app/lib/iyzipay";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const token = formData.get("token") as string;

    if (!token) {
      return redirectWithStatus("error", "Token bulunamadı");
    }

    // Ödeme sonucunu sorgula
    const result = await new Promise<{
      status: string;
      paymentStatus?: string;
      price?: string;
      errorMessage?: string;
      conversationId?: string;
    }>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iyzipay.checkoutForm.retrieve({ locale: Iyzipay.LOCALE.TR, token } as any, (err: Error | null, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (result.status !== "success" || result.paymentStatus !== "SUCCESS") {
      return redirectWithStatus("error", result.errorMessage || "Ödeme başarısız");
    }

    // Cookie'den metadata al
    const metaCookie = req.cookies.get("iyzico_meta")?.value;
    if (!metaCookie) {
      return redirectWithStatus("error", "Oturum bilgisi bulunamadı");
    }

    const meta = JSON.parse(metaCookie);
    const { cariTip, gercekId, sahipSirketId, tutar } = meta;

    // Supabase service role ile bakiye güncelle
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return redirectWithStatus("error", "Server yapılandırma hatası");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // cari_hareketler tablosuna kaydet
    const insertData: Record<string, unknown> = {
      sahip_sirket_id: sahipSirketId,
      islem_tipi: "Tahsilat",
      aciklama: `Kredi Kartı Tahsilatı (Iyzico) - ${tutar.toFixed(2)} TL`,
      tarih: new Date().toISOString(),
      borc: 0,
      alacak: tutar,
    };

    if (cariTip === "firma") insertData.firma_id = gercekId;
    else insertData.cari_kart_id = gercekId;

    const { error: insertError } = await supabaseAdmin.from("cari_hareketler").insert([insertData]);
    if (insertError) {
      return redirectWithStatus("error", "Hareket kaydedilemedi: " + insertError.message);
    }

    // Bakiyeyi düş
    const table = cariTip === "firma" ? "firmalar" : "cari_kartlar";
    const { data: current } = await supabaseAdmin.from(table).select("bakiye").eq("id", gercekId).single();
    const mevcutBakiye = current?.bakiye ? parseFloat(String(current.bakiye)) : 0;
    const yeniBakiye = mevcutBakiye - tutar;

    await supabaseAdmin.from(table).update({ bakiye: yeniBakiye }).eq("id", gercekId);

    // Başarılı - cookie'yi temizle ve yönlendir
    const response = redirectWithStatus("success", `${tutar.toFixed(2)} TL tahsilat başarıyla alındı`);
    response.cookies.set("iyzico_meta", "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Beklenmeyen hata";
    return redirectWithStatus("error", message);
  }
}

function redirectWithStatus(status: string, message: string) {
  const url = `/tahsilat?iyzico_status=${status}&iyzico_msg=${encodeURIComponent(message)}`;
  return NextResponse.redirect(new URL(url, process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"), { status: 303 });
}
