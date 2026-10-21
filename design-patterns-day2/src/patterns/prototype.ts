import type { LineItem } from "./builder";

export interface Prototype<T> {
  clone(): T;
}

// A saved cart the customer can "buy again" from.
export class OrderTemplate implements Prototype<OrderTemplate> {
  constructor(
    public customerId: string,
    public items: LineItem[],
    public shippingAddress: string,
  ) {}

  // Deep copy: editing the clone's items must not touch the original.
  clone(): OrderTemplate {
    return new OrderTemplate(
      this.customerId,
      structuredClone(this.items),
      this.shippingAddress,
    );
  }
}
