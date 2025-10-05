import { EventEmitter } from 'eventemitter3';
import { TriggerEvent, TriggerHandler } from '../types/trigger.types';

export class EventBus extends EventEmitter {
  private static instance: EventBus;
  private handlers: Map<string, TriggerHandler[]> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public registerHandler(handler: TriggerHandler): void {
    const triggerHandlers = this.handlers.get(handler.trigger) || [];
    triggerHandlers.push(handler);
    
    // Sort by priority (higher priority first)
    triggerHandlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    this.handlers.set(handler.trigger, triggerHandlers);
    
    this.emit('handlerRegistered', handler);
  }

  public unregisterHandler(handlerId: string): boolean {
    for (const [trigger, handlers] of this.handlers) {
      const index = handlers.findIndex(h => h.id === handlerId);
      if (index !== -1) {
        handlers.splice(index, 1);
        if (handlers.length === 0) {
          this.handlers.delete(trigger);
        }
        this.emit('handlerUnregistered', handlerId);
        return true;
      }
    }
    return false;
  }

  public getHandlers(trigger: string): TriggerHandler[] {
    return this.handlers.get(trigger) || [];
  }

  public async emitTrigger(event: TriggerEvent): Promise<void> {
    const handlers = this.getHandlers(event.type);
    
    if (handlers.length === 0) {
      return;
    }

    this.emit('triggerEmitted', event);

    const promises = handlers
      .filter(h => h.enabled)
      .filter(h => this.shouldExecuteHandler(h, event))
      .map(async (handler) => {
        try {
          this.emit('handlerExecuting', { handler, event });
          await this.executeHandler(handler, event);
          this.emit('handlerExecuted', { handler, event });
        } catch (error) {
          this.emit('handlerError', { handler, event, error });
        }
      });

    await Promise.allSettled(promises);
  }

  private shouldExecuteHandler(handler: TriggerHandler, event: TriggerEvent): boolean {
    if (!handler.condition) {
      return true;
    }

    switch (handler.condition.type) {
      case 'always':
        return true;
      
      case 'conditional':
        if (handler.condition.expression) {
          // TODO: Implement JSONata expression evaluation
          return true;
        }
        return true;
      
      case 'dependency':
        if (handler.condition.dependsOn) {
          // TODO: Check if dependencies are satisfied
          return true;
        }
        return true;
      
      default:
        return true;
    }
  }

  private async executeHandler(handler: TriggerHandler, event: TriggerEvent): Promise<void> {
    // This would typically call the tool executor
    // For now, just emit an event that the tool runner can listen to
    this.emit('executeToolRequest', {
      toolId: handler.toolId,
      trigger: event.type,
      context: event.context,
      metadata: event.metadata
    });
  }

  public clear(): void {
    this.handlers.clear();
    this.removeAllListeners();
  }

  public getStats(): {
    totalHandlers: number;
    handlersByTrigger: Record<string, number>;
  } {
    const stats = {
      totalHandlers: 0,
      handlersByTrigger: {} as Record<string, number>
    };

    for (const [trigger, handlers] of this.handlers) {
      stats.handlersByTrigger[trigger] = handlers.length;
      stats.totalHandlers += handlers.length;
    }

    return stats;
  }
}
