import Iyzipay from "iyzipay";

let _instance: Iyzipay | null = null;

function getIyzipay(): Iyzipay {
    if (_instance) return _instance;

    const apiKey = process.env.IYZICO_API_KEY;
    const secretKey = process.env.IYZICO_SECRET_KEY;

    if (!apiKey || !secretKey) {
        throw new Error("IYZICO_API_KEY ve IYZICO_SECRET_KEY ortam değişkenleri tanımlı değil. Iyzico ödeme işlemleri kullanılamaz.");
    }

    _instance = new Iyzipay({
        apiKey,
        secretKey,
        uri: process.env.IYZICO_BASE_URL || "https://sandbox.iyzipay.com",
    });

    return _instance;
}

export default new Proxy({} as Iyzipay, {
    get(_target, prop) {
        return (getIyzipay() as unknown as Record<string | symbol, unknown>)[prop];
    }
});
