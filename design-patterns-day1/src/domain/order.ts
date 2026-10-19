import { OrderStateMachine, type OrderStatus } from "../patterns/state";
import { OrderEventEmitter } from "../patterns/observer";
import { PaymentService, type PaymentStrategy } from "../patterns/strategy";

export class OrderService {
  private readonly orders = new Map<
    string,
    {
      total: number;
      state: OrderStateMachine;
    }
  >();

  constructor(
    private readonly payment: PaymentStrategy,
    private readonly events: OrderEventEmitter,
  ) {}

  async create(orderId: string, total: number): Promise<void> {
    if (!orderId.trim()) {
      throw new Error("Order ID is required");
    }

    if (this.orders.has(orderId)) {
      throw new Error("Order already exists");
    }

    if (!Number.isFinite(total) || total <= 0) {
      throw new Error("Total must be greater than zero");
    }

    this.orders.set(orderId, {
      total,
      state: new OrderStateMachine(),
    });
  }

  async pay(orderId: string): Promise<string> {
    const order = this.getOrder(orderId);

    if (order.state.status !== "PENDING") {
      throw new Error("Order is not awaiting payment");
    }

    const paymentReference = await new PaymentService(this.payment).execute(
      order.total,
    );

    order.state.transitionTo("PAID");

    await this.events.publish({
      orderId,
      total: order.total,
    });

    return paymentReference;
  }

  transition(orderId: string, next: OrderStatus): void {
    this.getOrder(orderId).state.transitionTo(next);
  }

  getStatus(orderId: string): OrderStatus {
    return this.getOrder(orderId).state.status;
  }

  private getOrder(orderId: string) {
    const order = this.orders.get(orderId);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    return order;
  }
}
