import { describe, it, expect, vi } from "vitest";

import {
  CardPayment,
  PayPalPayment,
  PaymentService,
} from "../src/patterns/strategy";

import { StandardOrderProcessor } from "../src/patterns/template-method";

import { OrderEventEmitter } from "../src/patterns/observer";

import { OrderStateMachine } from "../src/patterns/state";

import { CommandInvoker, ChangeStatusCommand } from "../src/patterns/command";

describe("Day 1 Design Patterns", () => {
  it("Strategy: supports different payment algorithms", async () => {
    const card = new PaymentService(new CardPayment());
    const paypal = new PaymentService(new PayPalPayment());

    expect(await card.execute(100)).toMatch(/^CARD-/);
    expect(await paypal.execute(100)).toMatch(/^PAYPAL-/);
  });

  it("Strategy: rejects invalid amounts", async () => {
    const service = new PaymentService(new CardPayment());

    await expect(service.execute(0)).rejects.toThrow(
      "Amount must be greater than zero",
    );
  });

  it("Template Method: runs the processing workflow", async () => {
    const processor = new StandardOrderProcessor();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await processor.process("ORD-001");

      expect(log).toHaveBeenCalledWith("Processing standard order ORD-001");
      expect(log).toHaveBeenCalledWith("Processed order: ORD-001");
    } finally {
      log.mockRestore();
    }
  });

  it("Template Method: rejects an empty order ID", async () => {
    const processor = new StandardOrderProcessor();

    await expect(processor.process(" ")).rejects.toThrow(
      "Order ID is required",
    );
  });

  it("Observer: notifies subscribers", async () => {
    const events = new OrderEventEmitter();
    const handler = vi.fn();

    events.subscribe(handler);

    await events.publish({
      orderId: "ORD-001",
      total: 100,
    });

    expect(handler).toHaveBeenCalledWith({
      orderId: "ORD-001",
      total: 100,
    });
  });

  it("Observer: allows subscribers to unsubscribe", async () => {
    const events = new OrderEventEmitter();
    const handler = vi.fn();

    const unsubscribe = events.subscribe(handler);
    unsubscribe();

    await events.publish({
      orderId: "ORD-001",
      total: 100,
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("State: permits valid transitions", () => {
    const state = new OrderStateMachine();

    state.transitionTo("PAID");
    state.transitionTo("SHIPPED");

    expect(state.status).toBe("SHIPPED");
  });

  it("State: rejects invalid transitions", () => {
    const state = new OrderStateMachine();

    expect(() => state.transitionTo("SHIPPED")).toThrow(
      "Invalid transition: PENDING -> SHIPPED",
    );
  });

  it("Command: executes and undoes a change", async () => {
    let status = "PENDING";

    const command = new ChangeStatusCommand(
      () => status,
      (next) => {
        status = next;
      },
      "PAID",
    );

    const invoker = new CommandInvoker();

    await invoker.execute(command);
    expect(status).toBe("PAID");
    expect(invoker.getHistory()).toHaveLength(1);

    command.undo();
    expect(status).toBe("PENDING");
  });
});
