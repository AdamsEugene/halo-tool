import { ITool, IToolExecutionContext, IToolResult } from '../interfaces';
import { ToolExecutionOptions, ToolMetadata } from '../types';
import { EventEmitter } from 'eventemitter3';

export abstract class BaseTool extends EventEmitter {
  public readonly id: string;
  public readonly type: ITool['type'];
  public readonly name: string;
  public readonly description: string;
  public readonly metadata: ToolMetadata;

  protected _config: ITool;
  protected _enabled: boolean = true;

  constructor(config: ITool) {
    super();
    this.id = config.id;
    this.type = config.type;
    this.name = config.name;
    this.description = config.description;
    this._config = config;
    this.metadata = {
      version: '1.0.0',
      ...config.metadata,
    };
  }

  public get config(): ITool {
    return { ...this._config };
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public enable(): void {
    this._enabled = true;
    this.emit('enabled', this.id);
  }

  public disable(): void {
    this._enabled = false;
    this.emit('disabled', this.id);
  }

  public updateConfig(updates: Partial<ITool>): void {
    this._config = { ...this._config, ...updates };
    this.emit('configUpdated', this.id, updates);
  }

  public abstract validate(): Promise<boolean>;

  public abstract execute(
    context: IToolExecutionContext,
    options?: ToolExecutionOptions
  ): Promise<IToolResult>;

  protected createExecutionId(): string {
    return `${this.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected createResult(
    success: boolean,
    data?: any,
    error?: Error,
    executionTime: number = 0,
    cached: boolean = false,
    retryCount: number = 0
  ): IToolResult {
    return {
      success,
      data,
      error,
      executionTime,
      cached,
      retryCount,
    };
  }

  protected log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, any>
  ): void {
    this.emit('log', {
      level,
      message,
      toolId: this.id,
      timestamp: Date.now(),
      context,
    });
  }
}
