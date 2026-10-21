export type Currency = "VND" | "USD";

export interface PaymentGateway {
  readonly currency: Currency;
  charge(amount: number): Promise<string>;
}

export interface ShippingCarrier {
  ship(orderId: string): string;
}

// One factory = one family of products that must be used together.
export interface RegionFactory {
  createPaymentGateway(): PaymentGateway;
  createShippingCarrier(): ShippingCarrier;
}

class MoMoGateway implements PaymentGateway {
  readonly currency = "VND";

  async charge(amount: number): Promise<string> {
    if (amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    console.log(`Charging ${amount} VND via MoMo`);
    return `MOMO-${Date.now()}`;
  }
}

class GhnCarrier implements ShippingCarrier {
  ship(orderId: string): string {
    console.log(`GHN picked up ${orderId}`);
    return `GHN-${orderId}`;
  }
}

class StripeGateway implements PaymentGateway {
  readonly currency = "USD";

  async charge(amount: number): Promise<string> {
    if (amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    console.log(`Charging ${amount} USD via Stripe`);
    return `STRIPE-${Date.now()}`;
  }
}

class UpsCarrier implements ShippingCarrier {
  ship(orderId: string): string {
    console.log(`UPS picked up ${orderId}`);
    return `UPS-${orderId}`;
  }
}

export class VietnamFactory implements RegionFactory {
  createPaymentGateway(): PaymentGateway {
    return new MoMoGateway();
  }

  createShippingCarrier(): ShippingCarrier {
    return new GhnCarrier();
  }
}

export class UsFactory implements RegionFactory {
  createPaymentGateway(): PaymentGateway {
    return new StripeGateway();
  }

  createShippingCarrier(): ShippingCarrier {
    return new UpsCarrier();
  }
}
