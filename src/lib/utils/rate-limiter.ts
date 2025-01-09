export class RateLimiter {
  private queue: Array<() => Promise<unknown>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private delayMs: number;

  constructor(requestsPerSecond: number) {
    this.delayMs = 1000 / requestsPerSecond;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.process();
      }
    });
  }

  private async process(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const now = Date.now();
    const timeToWait = Math.max(0, this.lastRequestTime + this.delayMs - now);

    await new Promise((resolve) => setTimeout(resolve, timeToWait));

    const fn = this.queue.shift();
    if (fn) {
      this.lastRequestTime = Date.now();
      await fn();
    }

    await this.process();
  }
}
