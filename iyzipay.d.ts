declare module "iyzipay" {
  interface IyzipayConfig {
    apiKey: string;
    secretKey: string;
    uri: string;
  }

  interface CheckoutFormInitialize {
    create(request: Record<string, unknown>, callback: (err: Error | null, result: Record<string, unknown>) => void): void;
  }

  interface CheckoutForm {
    retrieve(request: Record<string, unknown>, callback: (err: Error | null, result: Record<string, unknown>) => void): void;
  }

  class Iyzipay {
    constructor(config: IyzipayConfig);
    checkoutFormInitialize: CheckoutFormInitialize;
    checkoutForm: CheckoutForm;

    static LOCALE: { TR: string; EN: string };
    static CURRENCY: { TRY: string; EUR: string; USD: string; GBP: string };
    static PAYMENT_GROUP: { PRODUCT: string; LISTING: string; SUBSCRIPTION: string };
    static BASKET_ITEM_TYPE: { PHYSICAL: string; VIRTUAL: string };
  }

  export = Iyzipay;
}
