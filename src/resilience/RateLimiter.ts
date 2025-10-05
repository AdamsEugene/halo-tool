import { IRateLimitConfig } from '../core/interfaces';
import { RateLimitError } from '../core/types/error.types';
import { EventEmitter } from 'eventemitter3';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  windowStart: number;
  requestCount: number;
}

export class RateLimiter extends EventEmitter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    
    // Clean up old buckets periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Run cleanup every minute
  }

  public async checkLimit(
    key: string,
    config: IRateLimitConfig,
    tokens: number = 1
  ): Promise<boolean> {
    const bucket = this.getBucket(key, config);
    const now = Date.now();

    if (config.strategy === 'sliding') {
      return this.checkSlidingWindow(bucket, config, tokens, now);
    } else {
      return this.checkFixedWindow(bucket, config, tokens, now);
    }
  }

  public async enforce(
    key: string,
    config: IRateLimitConfig,
    tokens: number = 1
  ): Promise<void> {
    const allowed = await this.checkLimit(key, config, tokens);
    
    if (!allowed) {
      const bucket = this.getBucket(key, config);
      const resetTime = this.getResetTime(bucket, config);
      
      this.emit('rateLimitExceeded', {
        key,
        config,
        tokens,
        resetTime,
        currentCount: bucket.requestCount
      });
      
      throw new RateLimitError(
        `Rate limit exceeded for ${key}. Limit: ${config.maxRequests}/${config.windowMs}ms`,
        key,
        {
          limit: config.maxRequests,
          windowMs: config.windowMs,
          resetTime,
          strategy: config.strategy
        }
      );
    }

    this.emit('requestAllowed', {
      key,
      config,
      tokens,
      remainingTokens: this.getRemainingTokens(key, config)
    });
  }

  public async executeWithLimit<T>(
    key: string,
    config: IRateLimitConfig,
    operation: () => Promise<T>,
    tokens: number = 1
  ): Promise<T> {
    await this.enforce(key, config, tokens);
    return operation();
  }

  public getRemainingTokens(key: string, config: IRateLimitConfig): number {
    const bucket = this.getBucket(key, config);
    
    if (config.strategy === 'sliding') {
      this.refillSlidingWindow(bucket, config, Date.now());
      return Math.max(0, config.maxRequests - bucket.requestCount);
    } else {
      this.refillFixedWindow(bucket, config, Date.now());
      return bucket.tokens;
    }
  }

  public getResetTime(bucket: RateLimitBucket, config: IRateLimitConfig): number {
    if (config.strategy === 'sliding') {
      return bucket.lastRefill + config.windowMs;
    } else {
      return bucket.windowStart + config.windowMs;
    }
  }

  public reset(key: string): boolean {
    return this.buckets.delete(key);
  }

  public resetAll(): void {
    this.buckets.clear();
    this.emit('allReset');
  }

  public getStats(): {
    totalBuckets: number;
    activeBuckets: number;
    bucketsWithRequests: number;
  } {
    const now = Date.now();
    let activeBuckets = 0;
    let bucketsWithRequests = 0;

    for (const bucket of this.buckets.values()) {
      if (now - bucket.lastRefill < 300000) { // Active in last 5 minutes
        activeBuckets++;
      }
      if (bucket.requestCount > 0) {
        bucketsWithRequests++;
      }
    }

    return {
      totalBuckets: this.buckets.size,
      activeBuckets,
      bucketsWithRequests
    };
  }

  public getBucketInfo(key: string, config: IRateLimitConfig): {
    exists: boolean;
    tokens?: number;
    requestCount?: number;
    windowStart?: number;
    lastRefill?: number;
    resetTime?: number;
  } {
    const bucket = this.buckets.get(key);
    
    if (!bucket) {
      return { exists: false };
    }

    return {
      exists: true,
      tokens: bucket.tokens,
      requestCount: bucket.requestCount,
      windowStart: bucket.windowStart,
      lastRefill: bucket.lastRefill,
      resetTime: this.getResetTime(bucket, config)
    };
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.buckets.clear();
    this.removeAllListeners();
  }

  private getBucket(key: string, config: IRateLimitConfig): RateLimitBucket {
    if (!this.buckets.has(key)) {
      const now = Date.now();
      this.buckets.set(key, {
        tokens: config.maxRequests,
        lastRefill: now,
        windowStart: now,
        requestCount: 0
      });
    }
    
    return this.buckets.get(key)!;
  }

  private checkSlidingWindow(
    bucket: RateLimitBucket,
    config: IRateLimitConfig,
    tokens: number,
    now: number
  ): boolean {
    this.refillSlidingWindow(bucket, config, now);
    
    if (bucket.requestCount + tokens <= config.maxRequests) {
      bucket.requestCount += tokens;
      bucket.lastRefill = now;
      return true;
    }
    
    return false;
  }

  private checkFixedWindow(
    bucket: RateLimitBucket,
    config: IRateLimitConfig,
    tokens: number,
    now: number
  ): boolean {
    this.refillFixedWindow(bucket, config, now);
    
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      bucket.requestCount += tokens;
      return true;
    }
    
    return false;
  }

  private refillSlidingWindow(
    bucket: RateLimitBucket,
    config: IRateLimitConfig,
    now: number
  ): void {
    const timePassed = now - bucket.lastRefill;
    
    if (timePassed >= config.windowMs) {
      // Full window has passed, reset completely
      bucket.requestCount = 0;
      bucket.lastRefill = now;
    } else {
      // Partial refill based on time passed
      const refillAmount = Math.floor((timePassed / config.windowMs) * config.maxRequests);
      bucket.requestCount = Math.max(0, bucket.requestCount - refillAmount);
      
      if (refillAmount > 0) {
        bucket.lastRefill = now;
      }
    }
  }

  private refillFixedWindow(
    bucket: RateLimitBucket,
    config: IRateLimitConfig,
    now: number
  ): void {
    const windowElapsed = now - bucket.windowStart;
    
    if (windowElapsed >= config.windowMs) {
      // Start new window
      bucket.tokens = config.maxRequests;
      bucket.requestCount = 0;
      bucket.windowStart = now;
      bucket.lastRefill = now;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];
    const maxAge = 300000; // 5 minutes

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => this.buckets.delete(key));

    if (keysToRemove.length > 0) {
      this.emit('cleanup', { removedKeys: keysToRemove, count: keysToRemove.length });
    }
  }

  // Utility methods for common rate limiting scenarios
  public static createConfig(
    maxRequests: number,
    windowMs: number,
    strategy: 'sliding' | 'fixed' = 'sliding'
  ): IRateLimitConfig {
    return {
      maxRequests,
      windowMs,
      strategy
    };
  }

  // Predefined configurations
  public static readonly PRESETS = {
    STRICT: { maxRequests: 10, windowMs: 60000, strategy: 'sliding' as const },
    MODERATE: { maxRequests: 100, windowMs: 60000, strategy: 'sliding' as const },
    LENIENT: { maxRequests: 1000, windowMs: 60000, strategy: 'sliding' as const },
    BURST: { maxRequests: 50, windowMs: 1000, strategy: 'fixed' as const }
  };
}
