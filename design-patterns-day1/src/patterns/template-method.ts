export abstract class OrderProcessor {
  async process(orderId: string): Promise<void> {
    this.validate(orderId);

    await this.execute(orderId);

    this.log(orderId);
  }

  private validate(orderId: string): void {
    if (!orderId.trim()) {
      throw new Error("Order ID is required");
    }
  }

  protected abstract execute(orderId: string): Promise<void>;

  private log(orderId: string): void {
    console.log(`Processed order: ${orderId}`);
  }
}

export class StandardOrderProcessor extends OrderProcessor {
  protected async execute(orderId: string): Promise<void> {
    console.log(`Processing standard order ${orderId}`);
  }
}

export class DigitalOrderProcessor extends OrderProcessor {
  protected async execute(orderId: string): Promise<void> {
    console.log(`Delivering digital order ${orderId}`);
  }
}
