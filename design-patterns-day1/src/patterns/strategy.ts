export interface PaymentStrategy {
  pay(amount: number): Promise<string>;
}

export class CardPayment implements PaymentStrategy {
  async pay(amount: number): Promise<string> {
    if (amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    console.log(`Paying ${amount} via Card`);
    return `CARD-${Date.now()}`;
  }
}

export class PayPalPayment implements PaymentStrategy {
  async pay(amount: number): Promise<string> {
    if (amount <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    console.log(`Paying ${amount} via PayPal`);
    return `PAYPAL-${Date.now()}`;
  }
}

export class PaymentService {
  constructor(private readonly strategy: PaymentStrategy) {}

  async execute(amount: number): Promise<string> {
    return this.strategy.pay(amount);
  }
}
