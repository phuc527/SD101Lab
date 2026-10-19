// Template Method: fixed processing skeleton, subclasses customize steps.
import { type Order, subtotal } from "../domain/order.ts";
import type { PaymentStrategy } from "./strategy.ts";

export interface ProcessResult {
  orderId: string;
  success: boolean;
  amount: number;
  steps: string[];
  error?: string;
}

export abstract class OrderProcessor {
  // The template. Subclasses override steps, never this method.
  process(order: Order, payment: PaymentStrategy): ProcessResult {
    const steps: string[] = [];
    try {
      this.validate(order);
      steps.push("validated");

      const amount = this.calculateTotal(order);
      steps.push(`total=${amount}`);

      const result = payment.pay(amount);
      if (!result.success) throw new Error(result.message);
      steps.push(`paid via ${payment.name}`);

      this.afterPayment(order, steps); // hook
      return { orderId: order.id, success: true, amount, steps };
    } catch (e) {
      return {
        orderId: order.id,
        success: false,
        amount: 0,
        steps,
        error: (e as Error).message,
      };
    }
  }

  protected validate(order: Order): void {
    if (order.items.length === 0) throw new Error("Order has no items");
    if (order.items.some((i) => i.quantity <= 0 || i.price < 0))
      throw new Error("Invalid item");
  }

  protected abstract shippingFee(order: Order): number;

  protected calculateTotal(order: Order): number {
    return (
      Math.max(0, subtotal(order) - order.discount) + this.shippingFee(order)
    );
  }

  // Hook: optional, default does nothing.
  protected afterPayment(_order: Order, _steps: string[]): void {}
}

export class StandardOrderProcessor extends OrderProcessor {
  protected shippingFee(order: Order): number {
    return subtotal(order) >= 100 ? 0 : 5; // free shipping over 100
  }
}

export class ExpressOrderProcessor extends OrderProcessor {
  protected shippingFee(): number {
    return 20;
  }
  protected afterPayment(_order: Order, steps: string[]): void {
    steps.push("priority dispatch scheduled");
  }
}
