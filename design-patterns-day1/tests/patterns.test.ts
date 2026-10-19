import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrder, total } from "../src/domain/order.ts";
import {
  CreditCardPayment,
  PayPalPayment,
  CashOnDeliveryPayment,
  PaymentService,
} from "../src/patterns/strategy.ts";
import {
  StandardOrderProcessor,
  ExpressOrderProcessor,
} from "../src/patterns/template-method.ts";
import { EventBus, type OrderEvents } from "../src/patterns/observer.ts";
import {
  OrderLifecycle,
  InvalidTransitionError,
} from "../src/patterns/state.ts";
import {
  CommandHistory,
  AddItemCommand,
  RemoveItemCommand,
  ApplyDiscountCommand,
} from "../src/patterns/command.ts";

const sampleOrder = () =>
  createOrder("O1", "a@b.c", [{ sku: "A", price: 40, quantity: 2 }]);
const validCard = () => new CreditCardPayment("4111111111111111");

test("strategy: swap payment methods at runtime", () => {
  const svc = new PaymentService(validCard());
  assert.equal(svc.checkout(100).fee, 2.9);
  svc.setStrategy(new PayPalPayment("a@b.c"));
  assert.equal(svc.checkout(100).fee, 3.7);
  svc.setStrategy(new CashOnDeliveryPayment());
  assert.equal(svc.checkout(600).success, false);
  assert.equal(svc.checkout(0).success, false);
  assert.equal(new CreditCardPayment("123").pay(10).success, false);
});

test("template method: shared skeleton, custom steps", () => {
  const std = new StandardOrderProcessor().process(sampleOrder(), validCard());
  assert.equal(std.amount, 85); // 80 + 5 shipping
  const exp = new ExpressOrderProcessor().process(sampleOrder(), validCard());
  assert.equal(exp.amount, 100);
  assert.ok(exp.steps.includes("priority dispatch scheduled"));

  const empty = new StandardOrderProcessor().process(
    createOrder("O2", "x"),
    validCard(),
  );
  assert.equal(empty.success, false);
  assert.equal(empty.error, "Order has no items");

  const declined = new StandardOrderProcessor().process(
    sampleOrder(),
    new CreditCardPayment("bad"),
  );
  assert.deepEqual(declined.steps, ["validated", "total=85"]);
});

test("observer: subscribe, unsubscribe, isolate failing listeners", () => {
  const bus = new EventBus<OrderEvents>();
  const got: number[] = [];
  bus.subscribe("order.paid", () => {
    throw new Error("smtp down");
  });
  const off = bus.subscribe("order.paid", (p) => got.push(p.amount));

  const errors = bus.publish("order.paid", { orderId: "O1", amount: 42 });
  assert.deepEqual(got, [42]);
  assert.equal(errors.length, 1);

  off();
  bus.publish("order.paid", { orderId: "O1", amount: 1 });
  assert.deepEqual(got, [42]);
});

test("state: valid lifecycle and blocked transitions", () => {
  const changes: string[] = [];
  const o = new OrderLifecycle("O1", (f, t) => changes.push(`${f}>${t}`));
  o.pay();
  o.ship();
  o.deliver();
  assert.equal(o.status, "delivered");
  assert.deepEqual(o.history, ["pending", "paid", "shipped", "delivered"]);
  assert.equal(changes.length, 3);
  assert.throws(() => o.cancel(), InvalidTransitionError);

  const p = new OrderLifecycle("O2");
  assert.throws(() => p.ship(), /Cannot ship an order that is pending/);
  p.cancel();
  assert.throws(() => p.pay(), InvalidTransitionError);
});

test("command: execute, undo, redo", () => {
  const order = createOrder("O1", "a@b.c");
  const h = new CommandHistory();
  h.run(new AddItemCommand(order, { sku: "A", price: 10, quantity: 1 }));
  h.run(new AddItemCommand(order, { sku: "B", price: 20, quantity: 1 }));
  h.run(new ApplyDiscountCommand(order, 5));
  assert.equal(total(order), 25);

  h.undo();
  assert.equal(total(order), 30);
  h.redo();
  assert.equal(total(order), 25);

  h.run(new RemoveItemCommand(order, "A"));
  assert.deepEqual(
    order.items.map((i) => i.sku),
    ["B"],
  );
  h.undo();
  assert.deepEqual(
    order.items.map((i) => i.sku),
    ["A", "B"],
  );

  assert.throws(() => h.run(new RemoveItemCommand(order, "Z")));
  assert.equal(h.log.length, 3); // failed command not recorded
  assert.equal(h.redo(), true); // failed run leaves redo stack intact

  h.undo();
  h.run(new ApplyDiscountCommand(order, 1));
  assert.equal(h.redo(), false); // a successful new run clears redo
});
