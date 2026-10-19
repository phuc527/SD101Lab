// Observer: publish domain events to many decoupled subscribers.

export type OrderEvents = {
  "order.created": { orderId: string; email: string };
  "order.paid": { orderId: string; amount: number };
  "order.shipped": { orderId: string; trackingCode: string };
  "order.cancelled": { orderId: string; reason: string };
};

type Listener<T> = (payload: T) => void;

export class EventBus<E extends Record<string, unknown>> {
  private listeners = new Map<keyof E, Set<Listener<any>>>();

  subscribe<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener); // unsubscribe
  }

  // One failing subscriber must not break the others or the publisher.
  publish<K extends keyof E>(event: K, payload: E[K]): Error[] {
    const errors: Error[] = [];
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(payload);
      } catch (e) {
        errors.push(e as Error);
      }
    }
    return errors;
  }
}

// Example subscribers
export function emailNotifier(log: string[]) {
  return (p: OrderEvents["order.paid"]) =>
    log.push(`email: order ${p.orderId} paid ${p.amount}`);
}

export function inventoryReleaser(log: string[]) {
  return (p: OrderEvents["order.cancelled"]) =>
    log.push(`inventory: release stock for ${p.orderId}`);
}
