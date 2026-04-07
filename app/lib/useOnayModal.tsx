"use client";
import React, { useState, useCallback } from "react";

interface OnayModalState {
    acik: boolean;
    baslik: string;
    mesaj: string;
    altMesaj?: string;
    onayMetni?: string;
    tehlikeli?: boolean;
    onOnayla: () => void;
    onReddet?: () => void;
}

const VARSAYILAN: OnayModalState = { acik: false, baslik: "", mesaj: "", onOnayla: () => {} };

export function useOnayModal() {
    const [state, setState] = useState<OnayModalState>(VARSAYILAN);

    const onayla = useCallback((opts: { baslik: string; mesaj: string; altMesaj?: string; onayMetni?: string; tehlikeli?: boolean; onOnayla: () => void; onReddet?: () => void }) => {
        setState({ acik: true, ...opts });
    }, []);

    const kapat = useCallback(() => {
        setState(prev => { prev.onReddet?.(); return VARSAYILAN; });
    }, []);

    const OnayModal = () => {
        if (!state.acik) return null;
        return (
            <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
                <div className="bg-white border border-[#e2e8f0] w-full max-w-md">
                    <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
                        <div className="text-[13px] font-semibold text-[#0f172a]">{state.baslik}</div>
                    </div>
                    <div className="px-5 py-6">
                        <div className={`w-12 h-12 flex items-center justify-center mx-auto mb-4 ${state.tehlikeli !== false ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#eff6ff] text-[#3b82f6]"}`}>
                            <i className={`fas ${state.tehlikeli !== false ? "fa-exclamation-triangle" : "fa-question-circle"} text-xl`} />
                        </div>
                        <p className="text-[13px] text-[#0f172a] text-center font-semibold mb-1">{state.mesaj}</p>
                        {state.altMesaj && <p className="text-[11px] text-[#64748b] text-center">{state.altMesaj}</p>}
                    </div>
                    <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: "1px solid var(--c-border)" }}>
                        <button onClick={kapat} className="btn-secondary">Vazgeç</button>
                        <button onClick={() => { state.onOnayla(); kapat(); }} className="btn-primary" style={state.tehlikeli !== false ? { background: "#dc2626" } : {}}>{state.onayMetni || "Evet, Onayla"}</button>
                    </div>
                </div>
            </div>
        );
    };

    return { onayla, OnayModal };
}
