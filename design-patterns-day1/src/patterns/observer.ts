export interface OrderCreatedEvent {
  orderId: string;
  total: number;
}

export type OrderCreatedHandler = (
  event: OrderCreatedEvent,
) => void | Promise<void>;

export class OrderEventEmitter {
  private readonly handlers = new Set<OrderCreatedHandler>();

  subscribe(handler: OrderCreatedHandler): () => void {
    this.handlers.add(handler);

    return () => {
      this.handlers.delete(handler);
    };
  }

  async publish(event: OrderCreatedEvent): Promise<void> {
    const results = await Promise.allSettled(
      [...this.handlers].map((handler) =>
        Promise.resolve().then(() => handler(event)),
      ),
    );

    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      throw new Error(`${failures.length} order event handler(s) failed`);
    }
  }
}

export function registerOrderObservers(events: OrderEventEmitter): void {
  events.subscribe(async (event) => {
    console.log(`Email sent for ${event.orderId}`);
  });

  events.subscribe(async (event) => {
    console.log(`Audit logged for ${event.orderId}`);
  });

  events.subscribe(async (event) => {
    console.log(`Push notification for ${event.orderId}`);
  });
}
