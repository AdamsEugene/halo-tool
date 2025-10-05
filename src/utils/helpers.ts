import * as _ from 'lodash';

// Delay utilities
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
  }
): T & { cancel(): void; flush(): ReturnType<T> } {
  return _.debounce(func, wait, options) as any;
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: {
    leading?: boolean;
    trailing?: boolean;
  }
): T & { cancel(): void; flush(): ReturnType<T> } {
  return _.throttle(func, wait, options) as any;
}

// String utilities
export function generateId(prefix: string = '', length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return prefix ? `${prefix}_${result}` : result;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function camelCase(text: string): string {
  return _.camelCase(text);
}

export function kebabCase(text: string): string {
  return _.kebabCase(text);
}

export function snakeCase(text: string): string {
  return _.snakeCase(text);
}

export function truncate(text: string, length: number, suffix: string = '...'): string {
  if (text.length <= length) return text;
  return text.substring(0, length - suffix.length) + suffix;
}

// Object utilities
export function deepClone<T>(obj: T): T {
  return _.cloneDeep(obj);
}

export function deepMerge<T>(...objects: Partial<T>[]): T {
  return _.merge({}, ...objects);
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return _.pick(obj, keys) as Pick<T, K>;
}

export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  return _.omit(obj, keys) as Omit<T, K>;
}

export function flattenObject(obj: any, prefix: string = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  });

  return flattened;
}

export function unflattenObject(obj: Record<string, any>): any {
  const result: any = {};

  Object.keys(obj).forEach(key => {
    const keys = key.split('.');
    let current = result;

    keys.forEach((k, index) => {
      if (index === keys.length - 1) {
        current[k] = obj[key];
      } else {
        current[k] = current[k] || {};
        current = current[k];
      }
    });
  });

  return result;
}

// Array utilities
export function chunk<T>(array: T[], size: number): T[][] {
  return _.chunk(array, size);
}

export function unique<T>(array: T[]): T[] {
  return _.uniq(array);
}

export function uniqueBy<T>(array: T[], iteratee: (item: T) => any): T[] {
  return _.uniqBy(array, iteratee);
}

export function groupBy<T>(array: T[], iteratee: (item: T) => any): Record<string, T[]> {
  return _.groupBy(array, iteratee);
}

export function sortBy<T>(array: T[], iteratees: ((item: T) => any)[]): T[] {
  return _.sortBy(array, iteratees);
}

export function shuffle<T>(array: T[]): T[] {
  return _.shuffle(array);
}

export function sample<T>(array: T[], n?: number): T | T[] {
  return n ? _.sampleSize(array, n) : _.sample(array)!;
}

// Number utilities
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, precision: number = 0): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-US', options).format(value);
}

// Date utilities
export function formatDate(date: Date | number | string, format?: string): string {
  const d = new Date(date);

  if (!format) {
    return d.toISOString();
  }

  // Simple format implementation
  const formats: Record<string, string> = {
    YYYY: d.getFullYear().toString(),
    MM: (d.getMonth() + 1).toString().padStart(2, '0'),
    DD: d.getDate().toString().padStart(2, '0'),
    HH: d.getHours().toString().padStart(2, '0'),
    mm: d.getMinutes().toString().padStart(2, '0'),
    ss: d.getSeconds().toString().padStart(2, '0'),
  };

  let result = format;
  Object.entries(formats).forEach(([key, value]) => {
    result = result.replace(new RegExp(key, 'g'), value);
  });

  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function differenceInDays(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((date1.getTime() - date2.getTime()) / oneDay);
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function isYesterday(date: Date): boolean {
  const yesterday = addDays(new Date(), -1);
  return date.toDateString() === yesterday.toDateString();
}

// Promise utilities
export function promiseTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Promise timeout')), timeoutMs)
    ),
  ]);
}

export function promiseRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number = 1000
): Promise<T> {
  return fn().catch(async error => {
    if (maxRetries <= 0) {
      throw error;
    }

    await delay(delayMs);
    return promiseRetry(fn, maxRetries - 1, delayMs);
  });
}

export async function promiseAllSettled<T>(promises: Promise<T>[]): Promise<
  Array<{
    status: 'fulfilled' | 'rejected';
    value?: T;
    reason?: any;
  }>
> {
  return Promise.all(
    promises.map(promise =>
      promise
        .then(value => ({ status: 'fulfilled' as const, value }))
        .catch(reason => ({ status: 'rejected' as const, reason }))
    )
  );
}

// URL utilities
export function parseURL(url: string): {
  protocol: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
  searchParams: Record<string, string>;
} {
  const parsed = new URL(url);
  const searchParams: Record<string, string> = {};

  parsed.searchParams.forEach((value, key) => {
    searchParams[key] = value;
  });

  return {
    protocol: parsed.protocol,
    host: parsed.host,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    searchParams,
  };
}

export function buildURL(base: string, params?: Record<string, any>): string {
  if (!params) return base;

  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

// Environment utilities
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function isNode(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

// Performance utilities
export function measureTime<T>(fn: () => T): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;

  return { result, duration };
}

export async function measureTimeAsync<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  return { result, duration };
}

// Type utilities
export function isString(value: any): value is string {
  return typeof value === 'string';
}

export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: any): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: any): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray(value: any): value is any[] {
  return Array.isArray(value);
}

export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export function isPromise(value: any): value is Promise<any> {
  return value && typeof value.then === 'function';
}

export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (isString(value) || isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}
