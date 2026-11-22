export interface PluggyWebhookDispatcher {
  enqueue(key: string, job: () => Promise<void>): void;
  drain(): Promise<void>;
}
