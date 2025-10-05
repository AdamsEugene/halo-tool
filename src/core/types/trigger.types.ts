export type TriggerType = 'onTreeLaunch' | 'onPageEnter' | 'onPageExit' | 'onElementMount' | 'onElementChange' | 'onElementUnmount' | 'onTreeComplete' | 'manual';

export type TriggerCondition = {
  type: 'always' | 'conditional' | 'dependency';
  expression?: string; // JSONata expression for conditional triggers
  dependsOn?: string[]; // Paths to watch for dependency triggers
};

export interface TriggerEvent {
  type: TriggerType;
  timestamp: number;
  context: any;
  metadata?: Record<string, any>;
}

export interface TriggerHandler {
  id: string;
  trigger: TriggerType;
  condition?: TriggerCondition;
  toolId: string;
  priority?: number;
  enabled: boolean;
}

export interface TriggerRegistry {
  register(handler: TriggerHandler): void;
  unregister(handlerId: string): void;
  getHandlers(trigger: TriggerType): TriggerHandler[];
  emit(event: TriggerEvent): Promise<void>;
}
