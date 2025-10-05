import { IRetryConfig } from '../core/interfaces';
import { EventEmitter } from 'eventemitter3';

export class RetryManager extends EventEmitter {
  private retryAttempts: Map<string, number> = new Map();

  public async execute<T>(
    operation: () => Promise<T>,
    config: IRetryConfig,
    shouldRetry?: (error: any) => boolean,
    operationId?: string
  ): Promise<T> {
    const id = operationId || this.generateId();
    let lastError: any;
    
    this.retryAttempts.set(id, 0);

    for (let attempt = 0; attempt <= config.max; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(config, attempt);
          this.emit('retryAttempt', { 
            operationId: id, 
            attempt, 
            delay, 
            maxRetries: config.max 
          });
          
          await this.sleep(delay);
        }

        const result = await operation();
        
        if (attempt > 0) {
          this.emit('retrySuccess', { 
            operationId: id, 
            totalAttempts: attempt + 1 
          });
        }
        
        this.retryAttempts.delete(id);
        return result;

      } catch (error) {
        lastError = error;
        this.retryAttempts.set(id, attempt + 1);
        
        this.emit('retryFailure', { 
          operationId: id, 
          attempt: attempt + 1, 
          error, 
          willRetry: attempt < config.max 
        });

        // Check if we should retry this error
        if (shouldRetry && !shouldRetry(error)) {
          this.emit('retryAborted', { 
            operationId: id, 
            reason: 'shouldRetry returned false', 
            error 
          });
          break;
        }

        // Don't retry if this was the last attempt
        if (attempt >= config.max) {
          break;
        }
      }
    }

    this.retryAttempts.delete(id);
    
    this.emit('retryExhausted', { 
      operationId: id, 
      totalAttempts: config.max + 1, 
      finalError: lastError 
    });
    
    throw lastError;
  }

  public getRetryCount(operationId: string): number | undefined {
    return this.retryAttempts.get(operationId);
  }

  public isRetrying(operationId: string): boolean {
    return this.retryAttempts.has(operationId);
  }

  public cancelRetry(operationId: string): boolean {
    return this.retryAttempts.delete(operationId);
  }

  public getActiveRetries(): string[] {
    return Array.from(this.retryAttempts.keys());
  }

  public getStats(): {
    activeRetries: number;
    totalRetryOperations: number;
  } {
    return {
      activeRetries: this.retryAttempts.size,
      totalRetryOperations: this.listenerCount('retryAttempt')
    };
  }

  private calculateDelay(config: IRetryConfig, attempt: number): number {
    const baseDelay = config.backoffMs || 1000;

    switch (config.strategy) {
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      
      case 'linear':
        return baseDelay * attempt;
      
      case 'fixed':
      default:
        return baseDelay;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public clear(): void {
    this.retryAttempts.clear();
    this.emit('cleared');
  }

  // Utility method for common retry scenarios
  public static createConfig(
    maxRetries: number = 3,
    strategy: 'exponential' | 'fixed' | 'linear' = 'exponential',
    baseDelayMs: number = 1000,
    retryOn: Array<'timeout' | '5xx' | 'network' | 'all'> = ['timeout', '5xx', 'network']
  ): IRetryConfig {
    return {
      max: maxRetries,
      strategy,
      backoffMs: baseDelayMs,
      retryOn
    };
  }

  // Predefined retry conditions
  public static shouldRetryNetworkError(error: any): boolean {
    if (!error) return false;
    
    // Axios network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNABORTED') {
      return true;
    }
    
    // HTTP 5xx errors
    if (error.response?.status >= 500) {
      return true;
    }
    
    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return true;
    }
    
    return false;
  }

  public static shouldRetryServerError(error: any): boolean {
    return error.response?.status >= 500;
  }

  public static shouldRetryTimeout(error: any): boolean {
    return error.code === 'ECONNABORTED' || error.message?.includes('timeout');
  }
}
