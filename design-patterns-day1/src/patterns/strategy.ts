// Strategy: swap the payment algorithm without touching checkout logic.

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  fee: number;
  message: string;
}

export interface PaymentStrategy {
  readonly name: string;
  pay(amount: number): PaymentResult;
}

export class CreditCardPayment implements PaymentStrategy {
  readonly name = "credit-card";
  private cardNumber: string;
  constructor(cardNumber: string) {
    this.cardNumber = cardNumber;
  }
  pay(amount: number): PaymentResult {
    if (!/^\d{16}$/.test(this.cardNumber)) {
      return { success: false, fee: 0, message: "Invalid card number" };
    }
    const fee = +(amount * 0.029).toFixed(2); // 2.9% processing fee
    return {
      success: true,
      transactionId: `CC-${Date.now()}`,
      fee,
      message: `Charged card ****${this.cardNumber.slice(-4)}`,
    };
  }
}

export class PayPalPayment implements PaymentStrategy {
  readonly name = "paypal";
  private email: string;
  constructor(email: string) {
    this.email = email;
  }
  pay(amount: number): PaymentResult {
    const fee = +(amount * 0.034 + 0.3).toFixed(2);
    return {
      success: true,
      transactionId: `PP-${Date.now()}`,
      fee,
      message: `Charged PayPal ${this.email}`,
    };
  }
}

export class CashOnDeliveryPayment implements PaymentStrategy {
  readonly name = "cod";
  static readonly LIMIT = 500;
  pay(amount: number): PaymentResult {
    if (amount > CashOnDeliveryPayment.LIMIT) {
      return {
        success: false,
        fee: 0,
        message: `COD limit is ${CashOnDeliveryPayment.LIMIT}`,
      };
    }
    return { success: true, fee: 0, message: "Pay on delivery" };
  }
}

// Context: knows nothing about concrete strategies.
export class PaymentService {
  private strategy: PaymentStrategy;
  constructor(strategy: PaymentStrategy) {
    this.strategy = strategy;
  }
  setStrategy(strategy: PaymentStrategy): void {
    this.strategy = strategy;
  }
  checkout(amount: number): PaymentResult {
    if (amount <= 0)
      return { success: false, fee: 0, message: "Amount must be positive" };
    return this.strategy.pay(amount);
  }
}
