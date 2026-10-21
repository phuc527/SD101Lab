export class OrderIdGenerator {
  private static instance?: OrderIdGenerator;
  private counter = 0;

  private constructor() {}

  static getInstance(): OrderIdGenerator {
    OrderIdGenerator.instance ??= new OrderIdGenerator();
    return OrderIdGenerator.instance;
  }

  // Global state leaks between tests, so tests need a way to start fresh.
  static resetForTesting(): void {
    OrderIdGenerator.instance = undefined;
  }

  next(): string {
    this.counter += 1;
    return `ORD-${String(this.counter).padStart(3, "0")}`;
  }
}
