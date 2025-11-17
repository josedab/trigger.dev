/**
 * Circuit Breaker Implementation (RFC-0005)
 *
 * Provides circuit breaker pattern for resilient external service calls.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail fast without calling service
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 *
 * Benefits:
 * - Prevents cascading failures
 * - Fail fast when service is down
 * - Automatic recovery detection
 * - Configurable thresholds
 *
 * Note: This is a simple implementation. For production use with the `opossum` library,
 * install it with: pnpm add opossum @types/opossum
 */

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Service name for logging */
  name: string;

  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;

  /** Time in ms to wait before trying again (default: 60000 = 1 minute) */
  resetTimeout?: number;

  /** Number of successful requests needed to close circuit (default: 2) */
  successThreshold?: number;

  /** Request timeout in ms (default: 10000 = 10 seconds) */
  timeout?: number;

  /** Optional error filter - return true to count as failure */
  errorFilter?: (error: Error) => boolean;

  /** Optional callback when circuit opens */
  onOpen?: () => void;

  /** Optional callback when circuit closes */
  onClose?: () => void;

  /** Optional callback when circuit half-opens */
  onHalfOpen?: () => void;
}

/**
 * Circuit breaker error (thrown when circuit is open)
 */
export class CircuitBreakerError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly state: CircuitState,
    public readonly nextAttempt?: Date
  ) {
    super(
      `Circuit breaker is ${state} for service "${serviceName}". ` +
        (nextAttempt ? `Will retry at ${nextAttempt.toISOString()}` : "")
    );
    this.name = "CircuitBreakerError";
  }
}

/**
 * Simple Circuit Breaker implementation
 *
 * For production use, consider using the `opossum` library which provides
 * more features like metrics, fallbacks, and better state management.
 *
 * @example
 * const breaker = new CircuitBreaker({
 *   name: "stripe-api",
 *   failureThreshold: 5,
 *   resetTimeout: 60_000, // 1 minute
 * });
 *
 * try {
 *   const result = await breaker.execute(async () => {
 *     return await stripe.charges.create({ amount: 1000, currency: "usd" });
 *   });
 * } catch (error) {
 *   if (error instanceof CircuitBreakerError) {
 *     // Circuit is open, service is down
 *     console.log("Service is down, failing fast");
 *   } else {
 *     // Other error
 *     throw error;
 *   }
 * }
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt: Date | null = null;
  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      name: config.name,
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeout: config.resetTimeout ?? 60_000,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 10_000,
      errorFilter: config.errorFilter ?? (() => true),
      onOpen: config.onOpen ?? (() => {}),
      onClose: config.onClose ?? (() => {}),
      onHalfOpen: config.onHalfOpen ?? (() => {}),
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.nextAttempt && Date.now() >= this.nextAttempt.getTime()) {
        // Time to try again
        this.transition(CircuitState.HALF_OPEN);
      } else {
        // Still too soon, fail fast
        throw new CircuitBreakerError(this.config.name, this.state, this.nextAttempt || undefined);
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);

      // Success!
      this.onSuccess();

      return result;
    } catch (error) {
      // Failure
      this.onFailure(error as Error);

      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${this.config.timeout}ms`)),
          this.config.timeout
        )
      ),
    ]);
  }

  /**
   * Handle successful execution
   */
  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        // Enough successes, close the circuit
        this.transition(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error) {
    // Check if this error should count as failure
    if (!this.config.errorFilter(error)) {
      return; // Ignore this error
    }

    this.failureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during test, reopen immediately
      this.transition(CircuitState.OPEN);
    } else if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    ) {
      // Too many failures, open the circuit
      this.transition(CircuitState.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  private transition(newState: CircuitState) {
    const oldState = this.state;
    this.state = newState;

    console.log(`[CircuitBreaker:${this.config.name}] ${oldState} → ${newState}`);

    switch (newState) {
      case CircuitState.OPEN:
        this.nextAttempt = new Date(Date.now() + this.config.resetTimeout);
        this.successCount = 0;
        this.config.onOpen();
        break;

      case CircuitState.HALF_OPEN:
        this.nextAttempt = null;
        this.successCount = 0;
        this.failureCount = 0;
        this.config.onHalfOpen();
        break;

      case CircuitState.CLOSED:
        this.nextAttempt = null;
        this.successCount = 0;
        this.failureCount = 0;
        this.config.onClose();
        break;
    }
  }

  /**
   * Manually open the circuit (useful for maintenance)
   */
  open() {
    this.transition(CircuitState.OPEN);
  }

  /**
   * Manually close the circuit (useful for testing)
   */
  close() {
    this.transition(CircuitState.CLOSED);
  }

  /**
   * Reset the circuit to initial state
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = null;
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 *
 * @example
 * const manager = new CircuitBreakerManager();
 *
 * const stripeBreaker = manager.create({
 *   name: "stripe-api",
 *   failureThreshold: 5,
 * });
 *
 * const githubBreaker = manager.create({
 *   name: "github-api",
 *   failureThreshold: 3,
 * });
 *
 * // Execute through manager
 * const result = await manager.execute("stripe-api", async () => {
 *   return await stripe.charges.create({ amount: 1000 });
 * });
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Create or get a circuit breaker
   */
  create(config: CircuitBreakerConfig): CircuitBreaker {
    if (this.breakers.has(config.name)) {
      return this.breakers.get(config.name)!;
    }

    const breaker = new CircuitBreaker(config);
    this.breakers.set(config.name, breaker);

    return breaker;
  }

  /**
   * Get an existing circuit breaker
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Execute through a named circuit breaker
   */
  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.breakers.get(name);

    if (!breaker) {
      throw new Error(`Circuit breaker "${name}" not found. Create it first with create().`);
    }

    return breaker.execute(fn);
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats() {
    const stats: Record<string, ReturnType<CircuitBreaker["getStats"]>> = {};

    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/**
 * Global circuit breaker manager instance
 */
export const circuitBreakers = new CircuitBreakerManager();
