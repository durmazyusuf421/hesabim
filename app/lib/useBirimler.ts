"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";

export interface Birim {
    id: number;
    birim_adi: string;
    kisaltma: string;
    aktif: boolean;
}

const VARSAYILAN_BIRIMLER = [
    { birim_adi: "Adet", kisaltma: "Adet" },
    { birim_adi: "Kilogram", kisaltma: "Kg" },
    { birim_adi: "Litre", kisaltma: "Lt" },
    { birim_adi: "Metre", kisaltma: "Mt" },
    { birim_adi: "Koli", kisaltma: "Koli" },
    { birim_adi: "Paket", kisaltma: "Paket" },
    { birim_adi: "Ton", kisaltma: "Ton" },
    { birim_adi: "Kutu", kisaltma: "Kutu" },
    { birim_adi: "Çuval", kisaltma: "Çuval" },
    { birim_adi: "Gram", kisaltma: "Gr" },
];

// Module-level cache: tek fetch, tüm componentlere paylaşım
let _cache: Birim[] | null = null;
let _cacheSirketId: number | null = null;
let _fetchPromise: Promise<Birim[]> | null = null;

async function fetchBirimler(sirketId: number): Promise<Birim[]> {
    const { data } = await supabase
        .from("birimler")
        .select("id, birim_adi, kisaltma, aktif")
        .eq("sirket_id", sirketId)
        .eq("aktif", true)
        .order("birim_adi");

    let birimler = data || [];

    // Tablo boşsa varsayılanları ekle
    if (birimler.length === 0) {
        const eklenecekler = VARSAYILAN_BIRIMLER.map(v => ({ ...v, sirket_id: sirketId }));
        const { data: yeniData } = await supabase.from("birimler").insert(eklenecekler).select("id, birim_adi, kisaltma, aktif");
        birimler = yeniData || [];
    }

    return birimler;
}

export function useBirimler() {
    const { aktifSirket } = useAuth();
    const [birimler, setBirimler] = useState<Birim[]>(_cache || []);

    useEffect(() => {
        if (!aktifSirket) return;
        const sirketId = aktifSirket.id;

        // Cache geçerliyse kullan
        if (_cache && _cacheSirketId === sirketId) {
            setBirimler(_cache);
            return;
        }

        // Zaten bir fetch devam ediyorsa ona bağlan
        if (_fetchPromise && _cacheSirketId === sirketId) {
            _fetchPromise.then(data => setBirimler(data));
            return;
        }

        _cacheSirketId = sirketId;
        _fetchPromise = fetchBirimler(sirketId);
        _fetchPromise.then(data => {
            _cache = data;
            _fetchPromise = null;
            setBirimler(data);
        });
    }, [aktifSirket]);

    const yenile = async () => {
        if (!aktifSirket) return;
        _cache = null;
        _fetchPromise = null;
        const data = await fetchBirimler(aktifSirket.id);
        _cache = data;
        _cacheSirketId = aktifSirket.id;
        setBirimler(data);
    };

    return { birimler, yenile };
}
