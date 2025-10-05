import { ITool, IToolExecutionContext, IToolExecutor, IToolResult } from '../interfaces';
import { ValidationResult } from '../types';
import { EventEmitter } from 'eventemitter3';

export abstract class BaseToolExecutor extends EventEmitter implements IToolExecutor {
  protected readonly supportedType: ITool['type'];
  protected _enabled: boolean = true;

  constructor(supportedType: ITool['type']) {
    super();
    this.supportedType = supportedType;
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public enable(): void {
    this._enabled = true;
    this.emit('executorEnabled', this.supportedType);
  }

  public disable(): void {
    this._enabled = false;
    this.emit('executorDisabled', this.supportedType);
  }

  public canExecute(tool: ITool): boolean {
    return this._enabled && tool.type === this.supportedType;
  }

  public async execute(tool: ITool, context: IToolExecutionContext): Promise<IToolResult> {
    if (!this.canExecute(tool)) {
      throw new Error(`Executor cannot handle tool type: ${tool.type}`);
    }

    const startTime = Date.now();

    try {
      this.emit('executionStarted', { toolId: tool.id, context });

      // Validate tool configuration
      const validation = await this.validateTool(tool);
      if (!validation.valid) {
        throw new Error(
          `Tool validation failed: ${validation.errors?.map(e => e.message).join(', ')}`
        );
      }

      // Execute the tool
      const result = await this.executeInternal(tool, context);

      const executionTime = Date.now() - startTime;
      const finalResult = {
        ...result,
        executionTime,
      };

      this.emit('executionCompleted', { toolId: tool.id, result: finalResult });

      return finalResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResult: IToolResult = {
        success: false,
        error: error as Error,
        executionTime,
      };

      this.emit('executionFailed', { toolId: tool.id, error, context });

      return errorResult;
    }
  }

  protected abstract executeInternal(
    tool: ITool,
    context: IToolExecutionContext
  ): Promise<IToolResult>;

  protected abstract validateTool(tool: ITool): Promise<ValidationResult>;

  protected createExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, any>
  ): void {
    this.emit('log', {
      level,
      message,
      executor: this.supportedType,
      timestamp: Date.now(),
      context,
    });
  }
}
