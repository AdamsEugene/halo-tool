export class ToolError extends Error {
  public readonly code: string;
  public readonly toolId: string;
  public readonly context?: any;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    toolId: string,
    context?: any,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.toolId = toolId;
    this.context = context;
    this.retryable = retryable;
  }
}

export class ValidationError extends ToolError {
  constructor(message: string, toolId: string, context?: any) {
    super(message, 'VALIDATION_ERROR', toolId, context, false);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends ToolError {
  constructor(message: string, toolId: string, context?: any) {
    super(message, 'NETWORK_ERROR', toolId, context, true);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ToolError {
  constructor(message: string, toolId: string, context?: any) {
    super(message, 'TIMEOUT_ERROR', toolId, context, true);
    this.name = 'TimeoutError';
  }
}

export class CircuitBreakerError extends ToolError {
  constructor(message: string, toolId: string, context?: any) {
    super(message, 'CIRCUIT_BREAKER_OPEN', toolId, context, false);
    this.name = 'CircuitBreakerError';
  }
}

export class RateLimitError extends ToolError {
  constructor(message: string, toolId: string, context?: any) {
    super(message, 'RATE_LIMIT_EXCEEDED', toolId, context, true);
    this.name = 'RateLimitError';
  }
}

export class StateError extends Error {
  public readonly code: string;
  public readonly path?: string;

  constructor(message: string, code: string, path?: string) {
    super(message);
    this.name = 'StateError';
    this.code = code;
    this.path = path;
  }
}

export type ErrorCode = 
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'CIRCUIT_BREAKER_OPEN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'STATE_ERROR'
  | 'CONFIGURATION_ERROR';

export interface ErrorContext {
  toolId: string;
  executionId: string;
  timestamp: number;
  state?: any;
  metadata?: Record<string, any>;
}
