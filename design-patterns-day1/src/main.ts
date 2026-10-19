import { createOrder, total } from "./domain/order.ts";
import {
  CommandHistory,
  AddItemCommand,
  ApplyDiscountCommand,
} from "./patterns/command.ts";
import {
  CreditCardPayment,
  CashOnDeliveryPayment,
  PaymentService,
} from "./patterns/strategy.ts";
import { StandardOrderProcessor } from "./patterns/template-method.ts";
import {
  EventBus,
  type OrderEvents,
  emailNotifier,
} from "./patterns/observer.ts";
import { OrderLifecycle } from "./patterns/state.ts";

const log: string[] = [];
const bus = new EventBus<OrderEvents>();
bus.subscribe("order.paid", emailNotifier(log));
bus.subscribe("order.shipped", (p) =>
  log.push(`sms: ${p.orderId} shipped (${p.trackingCode})`),
);

// Command: build the cart with undo
const order = createOrder("ORD-1", "alice@example.com");
const history = new CommandHistory();
history.run(
  new AddItemCommand(order, { sku: "KEYBOARD", price: 80, quantity: 1 }),
);
history.run(
  new AddItemCommand(order, { sku: "MOUSE", price: 25, quantity: 2 }),
);
history.run(new ApplyDiscountCommand(order, 50));
history.undo(); // customer removed the coupon
console.log("Cart:", history.log, "total =", total(order));

// Strategy: same checkout, different payment methods
const payments = new PaymentService(new CashOnDeliveryPayment());
console.log("COD:", payments.checkout(total(order)).message);

// Template Method + State + Observer
const lifecycle = new OrderLifecycle(order.id, (from, to) =>
  console.log(`state: ${from} -> ${to}`),
);
bus.publish("order.created", { orderId: order.id, email: order.customerEmail });

const result = new StandardOrderProcessor().process(
  order,
  new CreditCardPayment("4111111111111111"),
);
console.log("Processed:", result);

if (result.success) {
  lifecycle.pay();
  bus.publish("order.paid", { orderId: order.id, amount: result.amount });
  lifecycle.ship();
  bus.publish("order.shipped", { orderId: order.id, trackingCode: "VN123" });
}

try {
  lifecycle.cancel();
} catch (e) {
  console.log("Blocked:", (e as Error).message);
}

console.log("Notifications:", log);
