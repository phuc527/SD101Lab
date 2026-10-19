// Command: wrap cart operations as objects -> history, undo, redo.
import type { Order, OrderItem } from "../domain/order.ts";

export interface Command {
  readonly description: string;
  execute(): void;
  undo(): void;
}

export class AddItemCommand implements Command {
  readonly description: string;
  private order: Order;
  private item: OrderItem;
  constructor(order: Order, item: OrderItem) {
    this.order = order;
    this.item = item;
    this.description = `add ${item.quantity}x ${item.sku}`;
  }
  execute() {
    this.order.items.push(this.item);
  }
  undo() {
    const idx = this.order.items.lastIndexOf(this.item);
    if (idx >= 0) this.order.items.splice(idx, 1);
  }
}

export class RemoveItemCommand implements Command {
  readonly description: string;
  private order: Order;
  private sku: string;
  private removed?: { item: OrderItem; index: number };
  constructor(order: Order, sku: string) {
    this.order = order;
    this.sku = sku;
    this.description = `remove ${sku}`;
  }
  execute() {
    const index = this.order.items.findIndex((i) => i.sku === this.sku);
    if (index < 0) throw new Error(`Item ${this.sku} not in order`);
    this.removed = { item: this.order.items[index], index };
    this.order.items.splice(index, 1);
  }
  undo() {
    if (this.removed)
      this.order.items.splice(this.removed.index, 0, this.removed.item);
  }
}

export class ApplyDiscountCommand implements Command {
  readonly description: string;
  private order: Order;
  private amount: number;
  private previous = 0;
  constructor(order: Order, amount: number) {
    this.order = order;
    this.amount = amount;
    this.description = `discount ${amount}`;
  }
  execute() {
    this.previous = this.order.discount;
    this.order.discount = this.amount;
  }
  undo() {
    this.order.discount = this.previous;
  }
}

export class CommandHistory {
  private done: Command[] = [];
  private undone: Command[] = [];

  run(cmd: Command): void {
    cmd.execute(); // throws -> not recorded
    this.done.push(cmd);
    this.undone = []; // a new action invalidates redo
  }
  undo(): boolean {
    const cmd = this.done.pop();
    if (!cmd) return false;
    cmd.undo();
    this.undone.push(cmd);
    return true;
  }
  redo(): boolean {
    const cmd = this.undone.pop();
    if (!cmd) return false;
    cmd.execute();
    this.done.push(cmd);
    return true;
  }
  get log(): string[] {
    return this.done.map((c) => c.description);
  }
}
