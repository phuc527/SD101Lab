export interface Notifier {
  send(recipient: string, message: string): string;
}

export class EmailNotifier implements Notifier {
  send(recipient: string, message: string): string {
    console.log(`Email to ${recipient}: ${message}`);
    return `EMAIL-${Date.now()}`;
  }
}

export class SmsNotifier implements Notifier {
  send(recipient: string, message: string): string {
    console.log(`SMS to ${recipient}: ${message}`);
    return `SMS-${Date.now()}`;
  }
}

// Creator: the notify() workflow is fixed; subclasses decide which Notifier to create.
export abstract class NotificationService {
  protected abstract createNotifier(): Notifier;

  notify(recipient: string, message: string): string {
    if (!recipient.trim()) {
      throw new Error("Recipient is required");
    }

    return this.createNotifier().send(recipient, message);
  }
}

export class EmailNotificationService extends NotificationService {
  protected createNotifier(): Notifier {
    return new EmailNotifier();
  }
}

export class SmsNotificationService extends NotificationService {
  protected createNotifier(): Notifier {
    return new SmsNotifier();
  }
}
