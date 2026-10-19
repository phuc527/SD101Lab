import { CardPayment } from "./patterns/strategy";
import { OrderEventEmitter, registerOrderObservers } from "./patterns/observer";
import { OrderService } from "./domain/order";

async function main() {
  const events = new OrderEventEmitter();
  registerOrderObservers(events);

  const orders = new OrderService(new CardPayment(), events);

  await orders.create("ORD-001", 250);

  console.log("Before payment:", orders.getStatus("ORD-001"));

  const reference = await orders.pay("ORD-001");

  console.log("Payment reference:", reference);
  console.log("After payment:", orders.getStatus("ORD-001"));

  orders.transition("ORD-001", "SHIPPED");
  console.log("After shipping:", orders.getStatus("ORD-001"));
}

main().catch((error: unknown) => {
  console.error("Application failed:", error);
  process.exitCode = 1;
});
