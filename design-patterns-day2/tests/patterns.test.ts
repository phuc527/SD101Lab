import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EmailNotificationService,
  SmsNotificationService,
} from "../src/patterns/factory-method";

import { UsFactory, VietnamFactory } from "../src/patterns/abstract-factory";

import { OrderBuilder } from "../src/patterns/builder";

import { OrderTemplate } from "../src/patterns/prototype";

import { OrderIdGenerator } from "../src/patterns/singleton";

import { CheckoutService } from "../src/domain/checkout";

const template = () =>
  new OrderTemplate(
    "alice@example.com",
    [{ sku: "COFFEE-1KG", quantity: 2, unitPrice: 100 }],
    "12 Le Loi",
  );

describe("Day 2 Creational Patterns", () => {
  beforeEach(() => {
    OrderIdGenerator.resetForTesting();
    vi.spyOn(console, "log").mockImplementation(() => {});
    return () => vi.restoreAllMocks();
  });

  it("Factory Method: each subclass creates its own notifier", () => {
    expect(new EmailNotificationService().notify("a@b.c", "hi")).toMatch(
      /^EMAIL-/,
    );
    expect(new SmsNotificationService().notify("0900000000", "hi")).toMatch(
      /^SMS-/,
    );
  });

  it("Factory Method: rejects an empty recipient", () => {
    expect(() => new EmailNotificationService().notify(" ", "hi")).toThrow(
      "Recipient is required",
    );
  });

  it("Abstract Factory: Vietnam family is MoMo + GHN in VND", async () => {
    const factory = new VietnamFactory();
    const gateway = factory.createPaymentGateway();

    expect(gateway.currency).toBe("VND");
    expect(await gateway.charge(100)).toMatch(/^MOMO-/);
    expect(factory.createShippingCarrier().ship("ORD-001")).toBe("GHN-ORD-001");
  });

  it("Abstract Factory: US family is Stripe + UPS in USD", async () => {
    const factory = new UsFactory();
    const gateway = factory.createPaymentGateway();

    expect(gateway.currency).toBe("USD");
    expect(await gateway.charge(100)).toMatch(/^STRIPE-/);
    expect(factory.createShippingCarrier().ship("ORD-001")).toBe("UPS-ORD-001");
  });

  it("Builder: builds a frozen order with the computed total", () => {
    const order = new OrderBuilder()
      .withId("ORD-001")
      .forCustomer("alice")
      .addItem("COFFEE-1KG", 2, 100)
      .addItem("FILTER-100", 1, 50)
      .shipTo("12 Le Loi")
      .withCoupon("SALE10")
      .build();

    expect(order.total).toBe(225);
    expect(Object.isFrozen(order)).toBe(true);
  });

  it("Builder: rejects an order without items", () => {
    const builder = new OrderBuilder()
      .withId("ORD-001")
      .forCustomer("alice")
      .shipTo("12 Le Loi");

    expect(() => builder.build()).toThrow("At least one item is required");
  });

  it("Prototype: clone is a deep copy", () => {
    const original = template();
    const copy = original.clone();

    copy.items[0].quantity = 5;

    expect(copy).not.toBe(original);
    expect(original.items[0].quantity).toBe(2);
  });

  it("Singleton: every caller shares one instance", () => {
    const a = OrderIdGenerator.getInstance();
    const b = OrderIdGenerator.getInstance();

    expect(a).toBe(b);
    expect(a.next()).toBe("ORD-001");
    expect(b.next()).toBe("ORD-002");
  });

  it("Singleton: resetForTesting starts a fresh instance", () => {
    const before = OrderIdGenerator.getInstance();
    before.next();

    OrderIdGenerator.resetForTesting();

    expect(OrderIdGenerator.getInstance()).not.toBe(before);
    expect(OrderIdGenerator.getInstance().next()).toBe("ORD-001");
  });

  it("CheckoutService: combines all five patterns", async () => {
    const checkout = new CheckoutService(
      new UsFactory(),
      new SmsNotificationService(),
    );

    const receipt = await checkout.checkout(template());

    expect(receipt.order.id).toBe("ORD-001");
    expect(receipt.order.total).toBe(200);
    expect(receipt.currency).toBe("USD");
    expect(receipt.paymentReference).toMatch(/^STRIPE-/);
    expect(receipt.trackingCode).toBe("UPS-ORD-001");
  });
});
