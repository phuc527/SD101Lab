import { VietnamFactory } from "./patterns/abstract-factory";
import { EmailNotificationService } from "./patterns/factory-method";
import { OrderTemplate } from "./patterns/prototype";
import { CheckoutService } from "./domain/checkout";

async function main() {
  const checkout = new CheckoutService(
    new VietnamFactory(),
    new EmailNotificationService(),
  );

  const saved = new OrderTemplate(
    "alice@example.com",
    [
      { sku: "COFFEE-1KG", quantity: 1, unitPrice: 250_000 },
      { sku: "FILTER-100", quantity: 2, unitPrice: 50_000 },
    ],
    "12 Le Loi, District 1, HCMC",
  );

  const first = await checkout.checkout(saved);
  console.log(
    "First order:",
    first.order.id,
    first.order.total,
    first.currency,
  );

  // "Buy again" with more coffee: edit a clone, the saved template stays the same.
  const reorder = saved.clone();
  reorder.items[0].quantity = 3;

  const second = await checkout.checkout(reorder, "SALE10");
  console.log("Reorder:", second.order.id, second.order.total, second.currency);
  console.log("Saved template quantity:", saved.items[0].quantity);
}

main().catch((error: unknown) => {
  console.error("Application failed:", error);
  process.exitCode = 1;
});
