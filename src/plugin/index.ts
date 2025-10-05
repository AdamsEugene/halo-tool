export * from './HaloToolPlugin';

// Re-export core types for convenience
export type {
  ITool,
  IToolExecutionContext,
  IToolResult,
  IServerToolConfig,
  IClientToolConfig,
  ISystemToolConfig,
} from '../core/interfaces';

export type {
  ToolType,
  TriggerType,
  HTTPMethod,
  RetryStrategy,
  ErrorHandlingStrategy,
  CacheStrategy,
  RateLimitStrategy,
} from '../core/types';

// Plugin-specific exports
export { HaloToolPlugin, createHaloToolPlugin, haloToolPlugin } from './HaloToolPlugin';
