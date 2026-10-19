export type OrderStatus =
  "PENDING" | "PAID" | "SHIPPED" | "COMPLETED" | "CANCELLED";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export class OrderStateMachine {
  constructor(private currentStatus: OrderStatus = "PENDING") {}

  get status(): OrderStatus {
    return this.currentStatus;
  }

  transitionTo(next: OrderStatus): void {
    const allowed = transitions[this.currentStatus];

    if (!allowed.includes(next)) {
      throw new Error(`Invalid transition: ${this.currentStatus} -> ${next}`);
    }

    this.currentStatus = next;
  }
}
