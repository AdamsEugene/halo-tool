import { IToolResult } from './tool.interface';

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

export interface IExecutionResult extends IToolResult {
  context: IToolExecutionContext;
  metrics?: IExecutionMetrics;
}

export interface IExecutionMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  cacheHit: boolean;
  retryCount: number;
  circuitBreakerState?: 'closed' | 'open' | 'half-open';
}

export interface IExecutionPipeline {
  addMiddleware(middleware: IExecutionMiddleware): void;
  execute(context: IToolExecutionContext): Promise<IExecutionResult>;
}

export interface IExecutionMiddleware {
  name: string;
  execute(
    context: IToolExecutionContext,
    next: () => Promise<IExecutionResult>
  ): Promise<IExecutionResult>;
}
