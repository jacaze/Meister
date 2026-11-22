import type { PluggyWebhookDispatcher } from '../application/ports/PluggyWebhookDispatcher.js';

export type WebhookAsyncErrorHandler = (error: unknown) => void;

/**
 * Serializes asynchronous webhook jobs FIFO per key (itemId) in memory so concurrent
 * deliveries for the same connection do not race each other, while allowing different items
 * to progress independently. Call `drain()` on graceful shutdown to await in-flight jobs.
 */
export class InMemoryPluggyWebhookDispatcher implements PluggyWebhookDispatcher {
  private readonly queues = new Map<string, Promise<void>>();

  public constructor(private readonly onError?: WebhookAsyncErrorHandler) {}

  public enqueue(key: string, job: () => Promise<void>): void {
    const queueKey = key.trim() || '__global__';
    const previous = this.queues.get(queueKey) ?? Promise.resolve();

    const next = previous
      .then(async () => {
        await job();
      })
      .catch((err) => {
        this.onError?.(err);
      })
      .finally(() => {
        if (this.queues.get(queueKey) === next) {
          this.queues.delete(queueKey);
        }
      });

    this.queues.set(queueKey, next);
  }

  public async drain(): Promise<void> {
    while (this.queues.size > 0) {
      await Promise.allSettled(Array.from(this.queues.values()));
    }
  }
}
