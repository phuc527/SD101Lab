// State: behavior depends on the order's current lifecycle state.
//   Pending -> Paid -> Shipped -> Delivered
//   Pending | Paid -> Cancelled

export type StatusName =
  | "pending"
  | "paid"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface OrderState {
  readonly name: StatusName;
  pay(ctx: OrderLifecycle): void;
  ship(ctx: OrderLifecycle): void;
  deliver(ctx: OrderLifecycle): void;
  cancel(ctx: OrderLifecycle): void;
}

export class InvalidTransitionError extends Error {}

// Default: every action is denied. Each state only overrides what it allows.
abstract class BaseState implements OrderState {
  abstract readonly name: StatusName;
  private deny(action: string): never {
    throw new InvalidTransitionError(
      `Cannot ${action} an order that is ${this.name}`,
    );
  }
  pay(_ctx: OrderLifecycle): void {
    this.deny("pay");
  }
  ship(_ctx: OrderLifecycle): void {
    this.deny("ship");
  }
  deliver(_ctx: OrderLifecycle): void {
    this.deny("deliver");
  }
  cancel(_ctx: OrderLifecycle): void {
    this.deny("cancel");
  }
}

class PendingState extends BaseState {
  readonly name = "pending";
  pay(ctx: OrderLifecycle) {
    ctx.transitionTo(new PaidState());
  }
  cancel(ctx: OrderLifecycle) {
    ctx.transitionTo(new CancelledState());
  }
}

class PaidState extends BaseState {
  readonly name = "paid";
  ship(ctx: OrderLifecycle) {
    ctx.transitionTo(new ShippedState());
  }
  // Cancelling a paid order would trigger a refund.
  cancel(ctx: OrderLifecycle) {
    ctx.transitionTo(new CancelledState());
  }
}

class ShippedState extends BaseState {
  readonly name = "shipped";
  deliver(ctx: OrderLifecycle) {
    ctx.transitionTo(new DeliveredState());
  }
}

class DeliveredState extends BaseState {
  readonly name = "delivered";
}

class CancelledState extends BaseState {
  readonly name = "cancelled";
}

type ChangeListener = (from: StatusName, to: StatusName) => void;

export class OrderLifecycle {
  readonly orderId: string;
  readonly history: StatusName[] = ["pending"];
  private state: OrderState = new PendingState();
  private onChange?: ChangeListener;

  constructor(orderId: string, onChange?: ChangeListener) {
    this.orderId = orderId;
    this.onChange = onChange;
  }

  get status(): StatusName {
    return this.state.name;
  }

  transitionTo(next: OrderState): void {
    const from = this.state.name;
    this.state = next;
    this.history.push(next.name);
    this.onChange?.(from, next.name);
  }

  pay() {
    this.state.pay(this);
  }
  ship() {
    this.state.ship(this);
  }
  deliver() {
    this.state.deliver(this);
  }
  cancel() {
    this.state.cancel(this);
  }
}
