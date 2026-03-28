import Iyzipay from "iyzipay";

let iyzipay: Iyzipay;

try {
  iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY || "sandbox-key",
    secretKey: process.env.IYZICO_SECRET_KEY || "sandbox-secret",
    uri: process.env.IYZICO_BASE_URL || "https://sandbox.iyzipay.com",
  });
} catch {
  iyzipay = {} as Iyzipay;
}

export default iyzipay;
