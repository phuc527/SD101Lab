export interface Command {
  execute(): Promise<void>;
}

export class CommandInvoker {
  private readonly history: Command[] = [];

  async execute(command: Command): Promise<void> {
    await command.execute();
    this.history.push(command);
  }

  getHistory(): readonly Command[] {
    return [...this.history];
  }
}

export class ChangeStatusCommand implements Command {
  private previousStatus: string | undefined;

  constructor(
    private readonly getStatus: () => string,
    private readonly setStatus: (status: string) => void,
    private readonly nextStatus: string,
  ) {}

  async execute(): Promise<void> {
    this.previousStatus = this.getStatus();
    this.setStatus(this.nextStatus);
  }

  undo(): void {
    if (this.previousStatus === undefined) {
      throw new Error("Command has not been executed");
    }

    this.setStatus(this.previousStatus);
    this.previousStatus = undefined;
  }
}
