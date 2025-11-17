import { describe, it, expect } from 'vitest';
import { queue } from './shared.js';

describe('queue()', () => {
  it('should create queue with basic config', () => {
    const myQueue = queue({
      name: 'test-queue',
    });

    expect(myQueue).toBeDefined();
    expect(myQueue.name).toBe('test-queue');
  });

  it('should create queue with concurrency limit', () => {
    const myQueue = queue({
      name: 'limited-queue',
      concurrencyLimit: 5,
    });

    expect(myQueue.name).toBe('limited-queue');
    expect(myQueue.concurrencyLimit).toBe(5);
  });

  it('should create queue with rate limit', () => {
    const myQueue = queue({
      name: 'rate-limited-queue',
      rateLimit: {
        limit: 100,
        window: '1m',
      },
    });

    expect(myQueue.name).toBe('rate-limited-queue');
    expect(myQueue.rateLimit).toEqual({
      limit: 100,
      window: '1m',
    });
  });

  it('should create queue with both concurrency and rate limits', () => {
    const myQueue = queue({
      name: 'fully-limited-queue',
      concurrencyLimit: 10,
      rateLimit: {
        limit: 50,
        window: '5m',
      },
    });

    expect(myQueue.name).toBe('fully-limited-queue');
    expect(myQueue.concurrencyLimit).toBe(10);
    expect(myQueue.rateLimit).toEqual({
      limit: 50,
      window: '5m',
    });
  });

  it('should have queue symbol marker', () => {
    const myQueue = queue({
      name: 'marked-queue',
    });

    // @ts-expect-error - accessing internal symbol
    expect(myQueue[Symbol.for('trigger.dev/queue')]).toBe(true);
  });
});
