import { IToolResult } from '../core/interfaces';
import { EventEmitter } from 'eventemitter3';

interface PendingRequest {
  key: string;
  promise: Promise<IToolResult>;
  timestamp: number;
  resolvers: Array<{
    resolve: (value: IToolResult) => void;
    reject: (error: any) => void;
  }>;
}

export class RequestDeduplicator extends EventEmitter {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private maxAge: number = 30000; // 30 seconds max age for pending requests

  constructor() {
    super();
    
    // Clean up old pending requests periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10000); // Run cleanup every 10 seconds
  }

  public async checkAndWait(key: string): Promise<IToolResult | null> {
    const existing = this.pendingRequests.get(key);
    
    if (existing) {
      this.emit('duplicateRequest', { key, timestamp: Date.now() });
      
      // Return a promise that resolves when the original request completes
      return new Promise<IToolResult>((resolve, reject) => {
        existing.resolvers.push({ resolve, reject });
      });
    }

    return null;
  }

  public registerRequest(key: string, promise: Promise<IToolResult>): void {
    // Don't register if already exists
    if (this.pendingRequests.has(key)) {
      return;
    }

    const pendingRequest: PendingRequest = {
      key,
      promise,
      timestamp: Date.now(),
      resolvers: []
    };

    this.pendingRequests.set(key, pendingRequest);
    this.emit('requestRegistered', { key, timestamp: pendingRequest.timestamp });

    // Handle completion
    promise
      .then((result) => {
        this.completeRequest(key, result, null);
      })
      .catch((error) => {
        this.completeRequest(key, null, error);
      });
  }

  public async execute<T extends IToolResult>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if there's already a pending request
    const existing = await this.checkAndWait(key);
    if (existing) {
      return existing as T;
    }

    // Create and register the new request
    const promise = operation();
    this.registerRequest(key, promise);

    return promise;
  }

  public cancelRequest(key: string): boolean {
    const request = this.pendingRequests.get(key);
    if (!request) {
      return false;
    }

    // Reject all waiting resolvers
    const error = new Error(`Request cancelled: ${key}`);
    request.resolvers.forEach(({ reject }) => reject(error));

    this.pendingRequests.delete(key);
    this.emit('requestCancelled', { key });
    
    return true;
  }

  public getPendingCount(): number {
    return this.pendingRequests.size;
  }

  public getPendingKeys(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  public isPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }

  public clear(): void {
    // Cancel all pending requests
    for (const key of this.pendingRequests.keys()) {
      this.cancelRequest(key);
    }
    
    this.emit('cleared');
  }

  public destroy(): void {
    this.clear();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.removeAllListeners();
  }

  private completeRequest(key: string, result: IToolResult | null, error: any): void {
    const request = this.pendingRequests.get(key);
    if (!request) {
      return;
    }

    // Resolve or reject all waiting promises
    if (error) {
      request.resolvers.forEach(({ reject }) => reject(error));
      this.emit('requestFailed', { key, error });
    } else if (result) {
      request.resolvers.forEach(({ resolve }) => resolve(result));
      this.emit('requestCompleted', { key, result });
    }

    // Remove from pending requests
    this.pendingRequests.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, request] of this.pendingRequests) {
      if (now - request.timestamp > this.maxAge) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      this.cancelRequest(key);
    });

    if (keysToRemove.length > 0) {
      this.emit('cleanup', { removedKeys: keysToRemove, count: keysToRemove.length });
    }
  }

  public getStats(): {
    pendingCount: number;
    oldestRequestAge: number;
    totalRegistered: number;
    totalCompleted: number;
    totalCancelled: number;
  } {
    const now = Date.now();
    let oldestAge = 0;
    
    for (const request of this.pendingRequests.values()) {
      const age = now - request.timestamp;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      pendingCount: this.pendingRequests.size,
      oldestRequestAge: oldestAge,
      totalRegistered: this.listenerCount('requestRegistered'),
      totalCompleted: this.listenerCount('requestCompleted'),
      totalCancelled: this.listenerCount('requestCancelled')
    };
  }
}
