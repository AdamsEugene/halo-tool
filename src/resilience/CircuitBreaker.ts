import { CircuitBreakerError, CircuitBreakerState } from '../core/types';
import { EventEmitter } from 'eventemitter3';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringPeriodMs?: number;
}

interface CircuitBreakerStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  state: CircuitBreakerState;
}

export class CircuitBreaker extends EventEmitter {
  private circuits: Map<string, CircuitBreakerStats> = new Map();
  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    monitoringPeriodMs: 10000,
  };

  public isOpen(circuitId: string, config?: CircuitBreakerConfig): boolean {
    const stats = this.getStats(circuitId);
    const effectiveConfig = { ...this.defaultConfig, ...config };

    if (stats.state === 'open') {
      // Check if we should transition to half-open
      const timeSinceLastFailure = Date.now() - stats.lastFailureTime;
      if (timeSinceLastFailure >= effectiveConfig.resetTimeoutMs) {
        this.transitionToHalfOpen(circuitId);
        return false;
      }
      return true;
    }

    return false;
  }

  public recordSuccess(circuitId: string): void {
    const stats = this.getStats(circuitId);

    stats.successes++;
    stats.lastSuccessTime = Date.now();

    if (stats.state === 'half-open') {
      // Transition back to closed after successful execution in half-open state
      this.transitionToClosed(circuitId);
    } else if (stats.state === 'open') {
      // This shouldn't happen, but handle it gracefully
      this.transitionToClosed(circuitId);
    }

    this.emit('success', { circuitId, stats: { ...stats } });
  }

  public recordFailure(circuitId: string, config?: CircuitBreakerConfig): void {
    const stats = this.getStats(circuitId);
    const effectiveConfig = { ...this.defaultConfig, ...config };

    stats.failures++;
    stats.lastFailureTime = Date.now();

    if (stats.state === 'closed' && stats.failures >= effectiveConfig.failureThreshold) {
      this.transitionToOpen(circuitId);
    } else if (stats.state === 'half-open') {
      // Failed in half-open state, go back to open
      this.transitionToOpen(circuitId);
    }

    this.emit('failure', { circuitId, stats: { ...stats } });
  }

  public getState(circuitId: string): CircuitBreakerState {
    return this.getStats(circuitId).state;
  }

  public getStats(circuitId: string): CircuitBreakerStats {
    if (!this.circuits.has(circuitId)) {
      this.circuits.set(circuitId, {
        failures: 0,
        successes: 0,
        lastFailureTime: 0,
        lastSuccessTime: 0,
        state: 'closed',
      });
    }
    return this.circuits.get(circuitId)!;
  }

  public reset(circuitId: string): void {
    this.circuits.delete(circuitId);
    this.emit('reset', { circuitId });
  }

  public resetAll(): void {
    const circuitIds = Array.from(this.circuits.keys());
    this.circuits.clear();
    this.emit('resetAll', { circuitIds });
  }

  public getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [id, stat] of this.circuits) {
      stats[id] = { ...stat };
    }
    return stats;
  }

  public forceOpen(circuitId: string): void {
    const stats = this.getStats(circuitId);
    this.transitionToOpen(circuitId);
    this.emit('forceOpen', { circuitId, stats: { ...stats } });
  }

  public forceClosed(circuitId: string): void {
    const stats = this.getStats(circuitId);
    this.transitionToClosed(circuitId);
    this.emit('forceClosed', { circuitId, stats: { ...stats } });
  }

  private transitionToOpen(circuitId: string): void {
    const stats = this.getStats(circuitId);
    const previousState = stats.state;
    stats.state = 'open';

    this.emit('stateChanged', {
      circuitId,
      previousState,
      newState: 'open',
      stats: { ...stats },
    });
  }

  private transitionToClosed(circuitId: string): void {
    const stats = this.getStats(circuitId);
    const previousState = stats.state;
    stats.state = 'closed';
    stats.failures = 0; // Reset failure count when closing

    this.emit('stateChanged', {
      circuitId,
      previousState,
      newState: 'closed',
      stats: { ...stats },
    });
  }

  private transitionToHalfOpen(circuitId: string): void {
    const stats = this.getStats(circuitId);
    const previousState = stats.state;
    stats.state = 'half-open';

    this.emit('stateChanged', {
      circuitId,
      previousState,
      newState: 'half-open',
      stats: { ...stats },
    });
  }

  public async execute<T>(
    circuitId: string,
    operation: () => Promise<T>,
    config?: CircuitBreakerConfig
  ): Promise<T> {
    if (this.isOpen(circuitId, config)) {
      throw new CircuitBreakerError(`Circuit breaker is open for ${circuitId}`, circuitId);
    }

    try {
      const result = await operation();
      this.recordSuccess(circuitId);
      return result;
    } catch (error) {
      this.recordFailure(circuitId, config);
      throw error;
    }
  }
}
