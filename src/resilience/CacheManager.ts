import { EventEmitter } from 'eventemitter3';
import * as NodeCache from 'node-cache';

interface CacheEntry<T = any> {
  value: T;
  ttl: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export class CacheManager extends EventEmitter {
  private memoryCache: NodeCache;
  private localStoragePrefix = 'halo_cache_';
  private sessionStoragePrefix = 'halo_session_cache_';

  constructor() {
    super();

    // Initialize in-memory cache with default settings
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    this.memoryCache = new (require('node-cache'))({
      stdTTL: 300, // 5 minutes default TTL
      checkperiod: 60, // Check for expired keys every minute
      useClones: false, // Don't clone objects for performance
      deleteOnExpire: true,
    });

    // Listen to cache events
    this.memoryCache.on('set', (key, value) => {
      this.emit('set', { key, strategy: 'memory', size: this.getValueSize(value) });
    });

    this.memoryCache.on('get', (key, _value) => {
      this.emit('hit', { key, strategy: 'memory' });
    });

    this.memoryCache.on('del', (key, _value) => {
      this.emit('delete', { key, strategy: 'memory' });
    });

    this.memoryCache.on('expired', (key, _value) => {
      this.emit('expired', { key, strategy: 'memory' });
    });
  }

  public async get<T = any>(
    key: string,
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<T | null> {
    try {
      let value: T | null = null;

      switch (strategy) {
        case 'memory':
          value = this.memoryCache.get<T>(key) || null;
          break;

        case 'localStorage':
          value = this.getFromLocalStorage<T>(key);
          break;

        case 'sessionStorage':
          value = this.getFromSessionStorage<T>(key);
          break;
      }

      if (value !== null) {
        this.emit('hit', { key, strategy });
        return value;
      } else {
        this.emit('miss', { key, strategy });
        return null;
      }
    } catch (error) {
      this.emit('error', { key, strategy, error, operation: 'get' });
      return null;
    }
  }

  public async set<T = any>(
    key: string,
    value: T,
    ttlSeconds: number = 300,
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<boolean> {
    try {
      switch (strategy) {
        case 'memory':
          return this.memoryCache.set(key, value, ttlSeconds);

        case 'localStorage':
          return this.setToLocalStorage(key, value, ttlSeconds);

        case 'sessionStorage':
          return this.setToSessionStorage(key, value, ttlSeconds);
      }
    } catch (error) {
      this.emit('error', { key, strategy, error, operation: 'set' });
      return false;
    }
  }

  public async delete(
    key: string,
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<boolean> {
    try {
      switch (strategy) {
        case 'memory':
          return this.memoryCache.del(key) > 0;

        case 'localStorage':
          return this.deleteFromLocalStorage(key);

        case 'sessionStorage':
          return this.deleteFromSessionStorage(key);
      }
    } catch (error) {
      this.emit('error', { key, strategy, error, operation: 'delete' });
      return false;
    }
  }

  public async clear(strategy?: 'memory' | 'localStorage' | 'sessionStorage'): Promise<void> {
    try {
      if (!strategy || strategy === 'memory') {
        this.memoryCache.flushAll();
        this.emit('cleared', { strategy: 'memory' });
      }

      if (!strategy || strategy === 'localStorage') {
        this.clearLocalStorage();
        this.emit('cleared', { strategy: 'localStorage' });
      }

      if (!strategy || strategy === 'sessionStorage') {
        this.clearSessionStorage();
        this.emit('cleared', { strategy: 'sessionStorage' });
      }
    } catch (error) {
      this.emit('error', { strategy, error, operation: 'clear' });
    }
  }

  public async has(
    key: string,
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<boolean> {
    try {
      switch (strategy) {
        case 'memory':
          return this.memoryCache.has(key);

        case 'localStorage':
          return this.hasInLocalStorage(key);

        case 'sessionStorage':
          return this.hasInSessionStorage(key);
      }
    } catch (error) {
      this.emit('error', { key, strategy, error, operation: 'has' });
      return false;
    }
  }

  public getStats(strategy?: 'memory' | 'localStorage' | 'sessionStorage'): any {
    const stats: any = {};

    if (!strategy || strategy === 'memory') {
      stats.memory = {
        keys: this.memoryCache.keys().length,
        hits: this.memoryCache.getStats().hits,
        misses: this.memoryCache.getStats().misses,
        vsize: this.memoryCache.getStats().vsize,
        ksize: this.memoryCache.getStats().ksize,
      };
    }

    if (!strategy || strategy === 'localStorage') {
      stats.localStorage = this.getStorageStats('localStorage');
    }

    if (!strategy || strategy === 'sessionStorage') {
      stats.sessionStorage = this.getStorageStats('sessionStorage');
    }

    return stats;
  }

  public async getMulti<T = any>(
    keys: string[],
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<Record<string, T | null>> {
    const results: Record<string, T | null> = {};

    await Promise.all(
      keys.map(async key => {
        results[key] = await this.get<T>(key, strategy);
      })
    );

    return results;
  }

  public async setMulti<T = any>(
    entries: Record<string, T>,
    ttlSeconds: number = 300,
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    await Promise.all(
      Object.entries(entries).map(async ([key, value]) => {
        results[key] = await this.set(key, value, ttlSeconds, strategy);
      })
    );

    return results;
  }

  public async deleteMulti(
    keys: string[],
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    await Promise.all(
      keys.map(async key => {
        results[key] = await this.delete(key, strategy);
      })
    );

    return results;
  }

  // Utility method to create cache key with prefix
  public createKey(namespace: string, ...parts: string[]): string {
    return [namespace, ...parts].join(':');
  }

  // Pattern-based operations
  public async deletePattern(
    pattern: string,
    strategy: 'memory' | 'localStorage' | 'sessionStorage' = 'memory'
  ): Promise<number> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let deletedCount = 0;

    switch (strategy) {
      case 'memory': {
        const memoryKeys = this.memoryCache.keys().filter(key => regex.test(key));
        deletedCount = this.memoryCache.del(memoryKeys);
        break;
      }

      case 'localStorage':
        deletedCount = this.deletePatternFromStorage('localStorage', regex);
        break;

      case 'sessionStorage':
        deletedCount = this.deletePatternFromStorage('sessionStorage', regex);
        break;
    }

    this.emit('patternDeleted', { pattern, strategy, count: deletedCount });
    return deletedCount;
  }

  private getFromLocalStorage<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    const item = localStorage.getItem(this.localStoragePrefix + key);
    if (!item) return null;

    try {
      const entry: CacheEntry<T> = JSON.parse(item);

      // Check if expired
      if (Date.now() > entry.createdAt + entry.ttl * 1000) {
        localStorage.removeItem(this.localStoragePrefix + key);
        return null;
      }

      // Update access stats
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      localStorage.setItem(this.localStoragePrefix + key, JSON.stringify(entry));

      return entry.value;
    } catch {
      localStorage.removeItem(this.localStoragePrefix + key);
      return null;
    }
  }

  private setToLocalStorage<T>(key: string, value: T, ttlSeconds: number): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const entry: CacheEntry<T> = {
        value,
        ttl: ttlSeconds,
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };

      localStorage.setItem(this.localStoragePrefix + key, JSON.stringify(entry));
      return true;
    } catch {
      return false;
    }
  }

  private deleteFromLocalStorage(key: string): boolean {
    if (typeof window === 'undefined') return false;

    try {
      localStorage.removeItem(this.localStoragePrefix + key);
      return true;
    } catch {
      return false;
    }
  }

  private hasInLocalStorage(key: string): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(this.localStoragePrefix + key) !== null;
  }

  private clearLocalStorage(): void {
    if (typeof window === 'undefined') return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.localStoragePrefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  private getFromSessionStorage<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    const item = sessionStorage.getItem(this.sessionStoragePrefix + key);
    if (!item) return null;

    try {
      const entry: CacheEntry<T> = JSON.parse(item);

      // Check if expired
      if (Date.now() > entry.createdAt + entry.ttl * 1000) {
        sessionStorage.removeItem(this.sessionStoragePrefix + key);
        return null;
      }

      return entry.value;
    } catch {
      sessionStorage.removeItem(this.sessionStoragePrefix + key);
      return null;
    }
  }

  private setToSessionStorage<T>(key: string, value: T, ttlSeconds: number): boolean {
    if (typeof window === 'undefined') return false;

    try {
      const entry: CacheEntry<T> = {
        value,
        ttl: ttlSeconds,
        createdAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };

      sessionStorage.setItem(this.sessionStoragePrefix + key, JSON.stringify(entry));
      return true;
    } catch {
      return false;
    }
  }

  private deleteFromSessionStorage(key: string): boolean {
    if (typeof window === 'undefined') return false;

    try {
      sessionStorage.removeItem(this.sessionStoragePrefix + key);
      return true;
    } catch {
      return false;
    }
  }

  private hasInSessionStorage(key: string): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(this.sessionStoragePrefix + key) !== null;
  }

  private clearSessionStorage(): void {
    if (typeof window === 'undefined') return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.sessionStoragePrefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  }

  private getStorageStats(storageType: 'localStorage' | 'sessionStorage'): any {
    if (typeof window === 'undefined') {
      return { keys: 0, totalSize: 0, error: 'Not in browser environment' };
    }

    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const prefix =
      storageType === 'localStorage' ? this.localStoragePrefix : this.sessionStoragePrefix;

    let keys = 0;
    let totalSize = 0;

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) {
        keys++;
        const value = storage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
    }

    return { keys, totalSize };
  }

  private deletePatternFromStorage(
    storageType: 'localStorage' | 'sessionStorage',
    regex: RegExp
  ): number {
    if (typeof window === 'undefined') return 0;

    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const prefix =
      storageType === 'localStorage' ? this.localStoragePrefix : this.sessionStoragePrefix;

    const keysToRemove: string[] = [];

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) {
        const cleanKey = key.substring(prefix.length);
        if (regex.test(cleanKey)) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => storage.removeItem(key));
    return keysToRemove.length;
  }

  private getValueSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  public destroy(): void {
    this.memoryCache.close();
    this.removeAllListeners();
  }
}
