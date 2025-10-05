export type JSONSchema = {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  [key: string]: any;
};

export type ToolType = 'server' | 'client' | 'system';

export type TriggerType = 'onTreeLaunch' | 'onPageEnter' | 'onPageExit' | 'manual';

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type RetryStrategy = 'exponential' | 'fixed' | 'linear';

export type ErrorHandlingStrategy = 'bubble' | 'toast' | 'fallback' | 'silent';

export type CacheStrategy = 'memory' | 'localStorage' | 'sessionStorage';

export type RateLimitStrategy = 'sliding' | 'fixed';

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export type ToolExecutionState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type StateOperation = 'add' | 'replace' | 'remove';

export type TransformType = 'jsonata' | 'javascript';

export interface ToolMetadata {
  version: string;
  author?: string;
  description?: string;
  tags?: string[];
  category?: string;
  deprecated?: boolean;
}

export interface ToolExecutionOptions {
  timeout?: number;
  retries?: number;
  priority?: number;
  skipCache?: boolean;
  abortSignal?: AbortSignal;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  code?: string;
  value?: any;
}
