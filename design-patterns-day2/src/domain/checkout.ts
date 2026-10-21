import type { RegionFactory } from "../patterns/abstract-factory";
import { OrderBuilder, type Order } from "../patterns/builder";
import type { NotificationService } from "../patterns/factory-method";
import type { OrderTemplate } from "../patterns/prototype";
import { OrderIdGenerator } from "../patterns/singleton";

export interface Receipt {
  order: Order;
  currency: string;
  paymentReference: string;
  trackingCode: string;
}

export class CheckoutService {
  constructor(
    private readonly region: RegionFactory,
    private readonly notifications: NotificationService,
  ) {}

  async checkout(
    template: OrderTemplate,
    couponCode?: string,
  ): Promise<Receipt> {
    const builder = new OrderBuilder()
      .withId(OrderIdGenerator.getInstance().next())
      .forCustomer(template.customerId)
      .shipTo(template.shippingAddress);

    for (const item of template.items) {
      builder.addItem(item.sku, item.quantity, item.unitPrice);
    }

    if (couponCode) {
      builder.withCoupon(couponCode);
    }

    const order = builder.build();

    const gateway = this.region.createPaymentGateway();
    const paymentReference = await gateway.charge(order.total);
    const trackingCode = this.region.createShippingCarrier().ship(order.id);

    this.notifications.notify(
      order.customerId,
      `Order ${order.id} paid, tracking ${trackingCode}`,
    );

    return {
      order,
      currency: gateway.currency,
      paymentReference,
      trackingCode,
    };
  }
}
