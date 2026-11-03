export interface DomainEvent<TPayload = unknown> {
  readonly name: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
  readonly payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (event: DomainEvent<TPayload>) => Promise<void> | void;

export interface EventBus {
  subscribe<TPayload = unknown>(eventName: string, handler: EventHandler<TPayload>): void;
  publish<TPayload = unknown>(event: DomainEvent<TPayload>): Promise<void>;
}

export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler<unknown>[]>();
  private readonly onError?: (error: unknown, event: DomainEvent<unknown>) => void;

  public constructor(options?: { onError?: (error: unknown, event: DomainEvent<unknown>) => void }) {
    this.onError = options?.onError;
  }

  public subscribe<TPayload = unknown>(eventName: string, handler: EventHandler<TPayload>): void {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push(handler as EventHandler<unknown>);
    this.handlers.set(eventName, existing);
  }

  public async publish<TPayload = unknown>(event: DomainEvent<TPayload>): Promise<void> {
    const registered = this.handlers.get(event.name);
    if (!registered || registered.length === 0) {
      return;
    }

    for (const handler of registered) {
      try {
        await handler(event as DomainEvent<unknown>);
      } catch (err) {
        if (this.onError) {
          this.onError(err, event as DomainEvent<unknown>);
        }
      }
    }
  }
}

export const defaultEventBus = new InProcessEventBus();

