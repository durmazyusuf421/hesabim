import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Supabase hata mesajlarini Turkce'ye cevir
function turkceHata(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("already exists") || m.includes("duplicate")) {
    return "Bu e-posta adresi zaten kayitli. Giris yapmayi deneyin.";
  }
  if (m.includes("password") && (m.includes("short") || m.includes("at least") || m.includes("weak"))) {
    return "Sifre en az 8 karakter olmalidir.";
  }
  if (m.includes("invalid email") || m.includes("invalid format")) {
    return "Gecersiz e-posta adresi.";
  }
  if (m.includes("rate limit")) {
    return "Cok fazla istek. Lutfen birkac dakika bekleyin.";
  }
  return msg;
}

interface SirketPayload {
  isletme_adi?: string;
  unvan?: string;
  telefon?: string;
  rol?: string;
  vergi_no?: string;
  vergi_dairesi?: string;
  il?: string;
  ilce?: string;
  adres?: string;
  sektor?: string;
}

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "Sunucu yapilandirma hatasi" }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let createdUserId: string | null = null;

  try {
    const body = await req.json();
    const email: string = body.email;
    const password: string = body.password;
    const sirket: SirketPayload | undefined = body.sirket;

    // --- Validasyon ---
    if (!email || !password) {
      return NextResponse.json({ error: "E-posta ve sifre zorunludur." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Sifre en az 8 karakter olmalidir." }, { status: 400 });
    }

    const emailLower = email.toLowerCase();

    // --- Sirketler tablosunda mevcut mu kontrolu (onden fail) ---
    if (sirket) {
      const { data: mevcut } = await supabaseAdmin
        .from("sirketler")
        .select("id")
        .eq("eposta", emailLower)
        .maybeSingle();
      if (mevcut) {
        return NextResponse.json(
          { error: "Bu e-posta adresiyle zaten bir sirket kayitli." },
          { status: 409 }
        );
      }
    }

    // --- 1. Auth kullanicisi olustur (email_confirm: true ile onay atlar) ---
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true,
    });

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: turkceHata(userError?.message || "Kullanici olusturulamadi.") },
        { status: 400 }
      );
    }

    createdUserId = userData.user.id;

    // --- 2. Sirket kaydi (payload varsa) ---
    if (sirket) {
      const yeniSirket = {
        eposta: emailLower,
        isletme_adi: sirket.isletme_adi || null,
        unvan: sirket.unvan || null,
        telefon: sirket.telefon || null,
        rol: sirket.rol || "TOPTANCI",
        vergi_no: sirket.vergi_no || null,
        vergi_dairesi: sirket.vergi_dairesi || null,
        il: sirket.il || null,
        ilce: sirket.ilce || null,
        adres: sirket.adres || null,
        sektor: sirket.sektor || null,
      };

      const { data: sirketData, error: sirketError } = await supabaseAdmin
        .from("sirketler")
        .insert([yeniSirket])
        .select()
        .single();

      if (sirketError || !sirketData) {
        // ROLLBACK: auth user'i sil (orphan onleme)
        try {
          await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        } catch { /* ignore */ }
        return NextResponse.json(
          { error: turkceHata(sirketError?.message || "Sirket kaydi olusturulamadi.") },
          { status: 400 }
        );
      }

      return NextResponse.json({
        user: { id: userData.user.id, email: userData.user.email },
        sirket: sirketData,
      });
    }

    // Sirket payload yoksa sadece user dondur (geri uyumluluk)
    return NextResponse.json({
      user: { id: userData.user.id, email: userData.user.email },
    });
  } catch (err) {
    // Beklenmeyen hata - olusturulan user'i temizle
    if (createdUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(createdUserId);
      } catch { /* ignore */ }
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Beklenmeyen bir hata olustu: " + message }, { status: 500 });
  }
}
