import { NextRequest, NextResponse } from "next/server";
import Iyzipay from "iyzipay";
import iyzipay from "@/app/lib/iyzipay";

export async function POST(req: NextRequest) {
  try {
    const { tutar, cariAdi, cariId, cariTip, gercekId, sahipSirketId } = await req.json();

    if (!tutar || tutar <= 0) {
      return NextResponse.json({ error: "Geçersiz tutar" }, { status: 400 });
    }
    if (!process.env.IYZICO_API_KEY || !process.env.IYZICO_SECRET_KEY) {
      return NextResponse.json({ error: "Iyzico yapılandırması eksik" }, { status: 500 });
    }

    const conversationId = `TAH-${Date.now()}`;
    const origin = req.headers.get("origin") || "http://localhost:3000";

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId,
      price: tutar.toFixed(2),
      paidPrice: tutar.toFixed(2),
      currency: Iyzipay.CURRENCY.TRY,
      basketId: conversationId,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: `${origin}/api/iyzico/callback`,
      enabledInstallments: [1, 2, 3, 6, 9, 12],
      buyer: {
        id: `CARI-${gercekId}`,
        name: cariAdi?.split(" ")[0] || "Müşteri",
        surname: cariAdi?.split(" ").slice(1).join(" ") || ".",
        gsmNumber: "+905000000000",
        email: "musteri@muhasebepro.com",
        identityNumber: "11111111111",
        registrationAddress: "Türkiye",
        ip: req.headers.get("x-forwarded-for") || "127.0.0.1",
        city: "Istanbul",
        country: "Turkey",
      },
      shippingAddress: {
        contactName: cariAdi || "Müşteri",
        city: "Istanbul",
        country: "Turkey",
        address: "Türkiye",
      },
      billingAddress: {
        contactName: cariAdi || "Müşteri",
        city: "Istanbul",
        country: "Turkey",
        address: "Türkiye",
      },
      basketItems: [
        {
          id: conversationId,
          name: `Tahsilat - ${cariAdi}`,
          category1: "Tahsilat",
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
          price: tutar.toFixed(2),
        },
      ],
    };

    // Metadata'yı conversationId ile callback'te eşleştirmek için cookie'ye yazacağız
    const metadata = JSON.stringify({ cariId, cariTip, gercekId, sahipSirketId, tutar, conversationId });

    const result = await new Promise<{ status: string; checkoutFormContent?: string; errorMessage?: string }>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iyzipay.checkoutFormInitialize.create(request as any, (err: Error | null, result: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    if (result.status !== "success") {
      return NextResponse.json({ error: result.errorMessage || "Iyzico hatası" }, { status: 400 });
    }

    const response = NextResponse.json({ checkoutFormContent: result.checkoutFormContent });
    response.cookies.set("iyzico_meta", metadata, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 600, // 10 dakika
      path: "/",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Beklenmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
