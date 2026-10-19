export interface OrderItem {
  sku: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  customerEmail: string;
  items: OrderItem[];
  discount: number; // absolute amount
}

export function subtotal(order: Order): number {
  return order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function total(order: Order): number {
  return Math.max(0, subtotal(order) - order.discount);
}

export function createOrder(
  id: string,
  customerEmail: string,
  items: OrderItem[] = [],
): Order {
  return { id, customerEmail, items: [...items], discount: 0 };
}
