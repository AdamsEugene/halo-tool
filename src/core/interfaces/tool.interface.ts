import { JSONSchema } from '../types/tool.types';

export interface ITool {
  id: string;
  type: 'server' | 'client' | 'system';
  name: string;
  description: string;
  triggers?: ('onTreeLaunch' | 'onPageEnter' | 'onPageExit' | 'manual')[];
  metadata?: {
    version?: string;
    author?: string;
    tags?: string[];
    category?: string;
    deprecated?: boolean;
  };

  api?: IServerToolConfig;
  client?: IClientToolConfig;
  system?: ISystemToolConfig;

  dynamicVariables?: Record<string, string>;
  assignments?: IAssignment[];
  retry?: IRetryConfig;
  onError?: 'bubble' | 'toast' | 'fallback' | 'silent';
  rateLimit?: IRateLimitConfig;
  validation?: IValidationConfig;
  telemetry?: ITelemetryConfig;
}

export interface IServerToolConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  bodySchema?: JSONSchema;
  querySchema?: JSONSchema;
  auth?: { connectionId: string };
  timeoutMs?: number;
  cache?: ICacheConfig;
  circuitBreaker?: ICircuitBreakerConfig;
  deduplication?: IDeduplicationConfig;
}

export interface IClientToolConfig {
  fn: 'openModal' | 'scrollIntoView' | 'focusElement' | 'setValue' | string;
  rollback?: { fn: string; params?: unknown };
}

export interface ISystemToolConfig {
  op: 'assign' | 'merge' | 'delete' | 'transform';
  path: string;
  value?: unknown;
  transform?: {
    type: 'jsonata' | 'javascript';
    expression: string;
  };
}

export interface IAssignment {
  source: 'response' | 'computed';
  valuePath: string;
  statePath: string;
  merge?: boolean;
  required?: boolean;
  default?: unknown;
}

export interface IRetryConfig {
  max: number;
  strategy: 'exponential' | 'fixed' | 'linear';
  backoffMs?: number;
  retryOn?: Array<'timeout' | '5xx' | 'network' | 'all'>;
}

export interface IRateLimitConfig {
  maxRequests: number;
  windowMs: number;
  strategy: 'sliding' | 'fixed';
}

export interface IValidationConfig {
  requestSchema?: JSONSchema;
  responseSchema?: JSONSchema;
  validateResponse?: boolean;
}

export interface ITelemetryConfig {
  trackTiming: boolean;
  trackErrors: boolean;
  customMetrics?: Record<string, string>;
}

export interface ICacheConfig {
  key?: string;
  ttlSec?: number;
  strategy?: 'memory' | 'localStorage' | 'sessionStorage';
}

export interface ICircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeoutMs: number;
}

export interface IDeduplicationConfig {
  enabled: boolean;
  keyPath?: string;
}

export interface IToolExecutor {
  execute(tool: ITool, context: IToolExecutionContext): Promise<IToolResult>;
}

export interface IToolExecutionContext {
  toolId: string;
  instanceId: string;
  startTime: number;
  triggeredBy: 'lifecycle' | 'dependency' | 'manual';
  state: any;
  previousResults?: unknown;
  abortSignal?: AbortSignal;
  metadata?: Record<string, any>;
}

export interface IToolResult {
  success: boolean;
  data?: any;
  error?: Error;
  executionTime: number;
  cached?: boolean;
  retryCount?: number;
}
