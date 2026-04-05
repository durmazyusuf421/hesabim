import { NextResponse } from "next/server";

export async function GET() {
    try {
        const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", {
            headers: { "Accept": "application/xml" },
            next: { revalidate: 3600 },
        });

        if (!res.ok) throw new Error("TCMB erişilemedi");

        const xml = await res.text();

        // USD parse
        const usdMatch = xml.match(/<Currency[^>]*Kod="USD"[^>]*>[\s\S]*?<ForexSelling>([\d.,]+)<\/ForexSelling>/);
        const usdKur = usdMatch ? parseFloat(usdMatch[1].replace(",", ".")) : 0;

        // EUR parse
        const eurMatch = xml.match(/<Currency[^>]*Kod="EUR"[^>]*>[\s\S]*?<ForexSelling>([\d.,]+)<\/ForexSelling>/);
        const eurKur = eurMatch ? parseFloat(eurMatch[1].replace(",", ".")) : 0;

        // Tarih parse
        const tarihMatch = xml.match(/<Tarih_Date[^>]*Tarih="([\d.]+)"/);
        const tarih = tarihMatch ? tarihMatch[1] : new Date().toLocaleDateString("tr-TR");

        return NextResponse.json({
            USD: usdKur,
            EUR: eurKur,
            tarih,
            guncellenmeSaati: new Date().toISOString(),
        });
    } catch {
        // Fallback: boş dön
        return NextResponse.json({ USD: 0, EUR: 0, tarih: "", guncellenmeSaati: "", hata: "TCMB verisi alınamadı" }, { status: 200 });
    }
}
