export const EventTypes = {
  // Tool Events
  TOOL_REGISTERED: 'tool:registered',
  TOOL_UNREGISTERED: 'tool:unregistered',
  TOOL_EXECUTION_STARTED: 'tool:execution:started',
  TOOL_EXECUTION_COMPLETED: 'tool:execution:completed',
  TOOL_EXECUTION_FAILED: 'tool:execution:failed',
  
  // State Events
  STATE_CHANGED: 'state:changed',
  STATE_PATCH_APPLIED: 'state:patch:applied',
  STATE_CHECKPOINT_CREATED: 'state:checkpoint:created',
  STATE_RESTORED: 'state:restored',
  
  // Trigger Events
  TREE_LAUNCH: 'trigger:tree:launch',
  PAGE_ENTER: 'trigger:page:enter',
  PAGE_EXIT: 'trigger:page:exit',
  ELEMENT_MOUNT: 'trigger:element:mount',
  ELEMENT_CHANGE: 'trigger:element:change',
  ELEMENT_UNMOUNT: 'trigger:element:unmount',
  TREE_COMPLETE: 'trigger:tree:complete',
  
  // System Events
  SYSTEM_READY: 'system:ready',
  SYSTEM_ERROR: 'system:error',
  SYSTEM_SHUTDOWN: 'system:shutdown',
  
  // Cache Events
  CACHE_HIT: 'cache:hit',
  CACHE_MISS: 'cache:miss',
  CACHE_SET: 'cache:set',
  CACHE_CLEAR: 'cache:clear',
  
  // Circuit Breaker Events
  CIRCUIT_BREAKER_OPENED: 'circuit:opened',
  CIRCUIT_BREAKER_CLOSED: 'circuit:closed',
  CIRCUIT_BREAKER_HALF_OPEN: 'circuit:half-open',
  
  // Rate Limiter Events
  RATE_LIMIT_EXCEEDED: 'rate:limit:exceeded',
  RATE_LIMIT_RESET: 'rate:limit:reset',
  
  // HTTP Events
  HTTP_REQUEST_STARTED: 'http:request:started',
  HTTP_REQUEST_COMPLETED: 'http:request:completed',
  HTTP_REQUEST_FAILED: 'http:request:failed',
  HTTP_REQUEST_TIMEOUT: 'http:request:timeout',
  
  // Validation Events
  VALIDATION_STARTED: 'validation:started',
  VALIDATION_COMPLETED: 'validation:completed',
  VALIDATION_FAILED: 'validation:failed',
  
  // Metrics Events
  METRIC_RECORDED: 'metric:recorded',
  METRICS_EXPORTED: 'metrics:exported'
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

export interface BaseEvent {
  type: EventType;
  timestamp: number;
  source?: string;
  metadata?: Record<string, any>;
}

export interface ToolEvent extends BaseEvent {
  toolId: string;
}

export interface StateEvent extends BaseEvent {
  path?: string;
  value?: any;
  previousValue?: any;
}

export interface HTTPEvent extends BaseEvent {
  url: string;
  method: string;
  status?: number;
  duration?: number;
}

export interface ErrorEvent extends BaseEvent {
  error: Error;
  context?: any;
}
