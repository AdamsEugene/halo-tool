import { IToolExecutionContext, IToolResult } from '../core/interfaces';
import { TriggerEvent } from '../core/types/trigger.types';
import { ServerToolExecutor } from './ServerToolExecutor';
import { ClientToolExecutor } from './ClientToolExecutor';
import { SystemToolExecutor } from './SystemToolExecutor';
import { ToolRegistry } from '../core/registry/ToolRegistry';
import { EventBus } from '../core/events/EventBus';
import { EventEmitter } from 'eventemitter3';

export class ToolOrchestrator extends EventEmitter {
  private serverExecutor: ServerToolExecutor;
  private clientExecutor: ClientToolExecutor;
  private systemExecutor: SystemToolExecutor;
  private registry: ToolRegistry;
  private eventBus: EventBus;

  constructor(registry: ToolRegistry) {
    super();
    this.registry = registry;
    this.eventBus = EventBus.getInstance();

    this.serverExecutor = new ServerToolExecutor();
    this.clientExecutor = new ClientToolExecutor();
    this.systemExecutor = new SystemToolExecutor();

    this.setupEventListeners();
  }

  public async executeTool(
    toolId: string,
    context: IToolExecutionContext,
    _options?: { timeout?: number; priority?: number }
  ): Promise<IToolResult> {
    const tool = this.registry.get(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    this.emit('toolExecutionStarted', { toolId, context });

    try {
      let result: IToolResult;

      switch (tool.type) {
        case 'server':
          result = await this.serverExecutor.execute(tool, context);
          break;

        case 'client':
          result = await this.clientExecutor.execute(tool, context);
          break;

        case 'system':
          result = await this.systemExecutor.execute(tool, context);
          break;

        default:
          throw new Error(`Unknown tool type: ${(tool as any).type}`);
      }

      this.emit('toolExecutionCompleted', { toolId, result });
      return result;
    } catch (error) {
      this.emit('toolExecutionFailed', { toolId, error, context });
      throw error;
    }
  }

  public async executeSequence(
    toolIds: string[],
    initialContext: IToolExecutionContext,
    options?: {
      continueOnError?: boolean;
      timeout?: number;
    }
  ): Promise<IToolResult[]> {
    const results: IToolResult[] = [];
    let currentContext = { ...initialContext };

    for (const toolId of toolIds) {
      try {
        const result = await this.executeTool(toolId, currentContext);
        results.push(result);

        // Update context with result data for next tool
        if (result.success && result.data) {
          currentContext = {
            ...currentContext,
            state: { ...currentContext.state, ...result.data },
            previousResults: result.data,
          };
        }
      } catch (error) {
        const errorResult: IToolResult = {
          success: false,
          error: error as Error,
          executionTime: 0,
        };
        results.push(errorResult);

        if (!options?.continueOnError) {
          break;
        }
      }
    }

    return results;
  }

  public async executeParallel(
    toolIds: string[],
    context: IToolExecutionContext,
    options?: {
      maxConcurrency?: number;
      timeout?: number;
    }
  ): Promise<IToolResult[]> {
    const maxConcurrency = options?.maxConcurrency || 5;
    const results: IToolResult[] = new Array(toolIds.length);

    const executeWithIndex = async (index: number): Promise<void> => {
      try {
        const result = await this.executeTool(toolIds[index], context);
        results[index] = result;
      } catch (error) {
        results[index] = {
          success: false,
          error: error as Error,
          executionTime: 0,
        };
      }
    };

    // Execute tools in batches to respect concurrency limit
    for (let i = 0; i < toolIds.length; i += maxConcurrency) {
      const batch = toolIds.slice(i, i + maxConcurrency);
      const batchPromises = batch.map((_, batchIndex) => executeWithIndex(i + batchIndex));

      await Promise.all(batchPromises);
    }

    return results;
  }

  public async executeConditional(
    conditions: Array<{
      condition: string; // JSONata expression
      toolId: string;
    }>,
    context: IToolExecutionContext
  ): Promise<IToolResult[]> {
    const results: IToolResult[] = [];

    for (const { condition, toolId } of conditions) {
      try {
        // Evaluate condition (simplified - in practice use JSONata)
        const shouldExecute = this.evaluateCondition(condition, context.state);

        if (shouldExecute) {
          const result = await this.executeTool(toolId, context);
          results.push(result);
        }
      } catch (error) {
        results.push({
          success: false,
          error: error as Error,
          executionTime: 0,
        });
      }
    }

    return results;
  }

  public async handleTrigger(event: TriggerEvent): Promise<void> {
    // Find tools that should be executed for this trigger
    const tools = this.registry
      .getAll()
      .filter(tool => tool.triggers?.some(trigger => trigger === event.type));

    if (tools.length === 0) {
      return;
    }

    const context: IToolExecutionContext = {
      toolId: 'trigger',
      instanceId: `trigger_${Date.now()}`,
      startTime: Date.now(),
      triggeredBy: 'lifecycle',
      state: event.context,
      metadata: event.metadata,
    };

    // Execute tools in parallel for triggers
    const toolIds = tools.map(t => t.id);
    await this.executeParallel(toolIds, context);
  }

  public getExecutorStats(): {
    server: any;
    client: any;
    system: any;
  } {
    return {
      server: {
        enabled: this.serverExecutor.enabled,
        // Add more stats as needed
      },
      client: {
        enabled: this.clientExecutor.enabled,
        rollbackStackSize: (this.clientExecutor as any).rollbackStack?.length || 0,
      },
      system: {
        enabled: this.systemExecutor.enabled,
      },
    };
  }

  private setupEventListeners(): void {
    // Listen for tool execution requests from event bus
    this.eventBus.on('executeToolRequest', async request => {
      const context: IToolExecutionContext = {
        toolId: request.toolId,
        instanceId: `${request.toolId}_${Date.now()}`,
        startTime: Date.now(),
        triggeredBy: 'lifecycle',
        state: request.context,
        metadata: request.metadata,
      };

      try {
        await this.executeTool(request.toolId, context);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error(`Failed to execute tool ${request.toolId}:`, error);
        }
        throw error;
      }
    });
  }

  private evaluateCondition(condition: string, state: any): boolean {
    // Simplified condition evaluation
    // In practice, you'd use JSONata or a similar expression evaluator
    try {
      // Very basic evaluation - just check if a path exists
      if (condition.startsWith('$.')) {
        const path = condition.substring(2);
        return this.getValueByPath(state, path) !== undefined;
      }
      return true;
    } catch {
      return false;
    }
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
