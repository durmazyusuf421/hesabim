import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Vercel cron job endpoint - Supabase'i uyutmamak icin periyodik ping atar.
// vercel.json'daki crons alaninda tanimli ve her 3 gunde bir calisir.

export async function GET(req: NextRequest) {
    // Cron secret dogrulamasi (Vercel cron requests "Authorization: Bearer <CRON_SECRET>" header'i gonderir)
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        // Kucuk ve hizli bir sorgu - sirketler tablosundan 1 kayit say
        const { count, error } = await supabase
            .from("sirketler")
            .select("id", { count: "exact", head: true });

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            pinged_at: new Date().toISOString(),
            sirket_count: count ?? 0,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
