export interface LineItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly items: readonly LineItem[];
  readonly shippingAddress: string;
  readonly couponCode?: string;
  readonly total: number;
}

const COUPONS: Record<string, number> = { SALE10: 0.1 };

export class OrderBuilder {
  private id = "";
  private customerId = "";
  private items: LineItem[] = [];
  private shippingAddress = "";
  private couponCode?: string;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  forCustomer(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  addItem(sku: string, quantity: number, unitPrice: number): this {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantity must be a positive integer");
    }

    if (unitPrice < 0) {
      throw new Error("Unit price cannot be negative");
    }

    this.items.push({ sku, quantity, unitPrice });
    return this;
  }

  shipTo(address: string): this {
    this.shippingAddress = address;
    return this;
  }

  withCoupon(code: string): this {
    if (!(code in COUPONS)) {
      throw new Error(`Unknown coupon: ${code}`);
    }

    this.couponCode = code;
    return this;
  }

  // All invariants are checked here, so an invalid Order can never exist.
  build(): Order {
    if (!this.id.trim()) {
      throw new Error("Order ID is required");
    }

    if (!this.customerId.trim()) {
      throw new Error("Customer is required");
    }

    if (this.items.length === 0) {
      throw new Error("At least one item is required");
    }

    if (!this.shippingAddress.trim()) {
      throw new Error("Shipping address is required");
    }

    const subtotal = this.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const discount = this.couponCode ? COUPONS[this.couponCode] : 0;

    return Object.freeze({
      id: this.id,
      customerId: this.customerId,
      items: Object.freeze(this.items.map((item) => ({ ...item }))),
      shippingAddress: this.shippingAddress,
      couponCode: this.couponCode,
      total: subtotal * (1 - discount),
    });
  }
}
