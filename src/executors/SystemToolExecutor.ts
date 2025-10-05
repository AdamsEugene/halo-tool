import { BaseToolExecutor } from '../core/base/ToolExecutor.base';
import { ITool, IToolExecutionContext, IToolResult } from '../core/interfaces';
import { ValidationResult } from '../core/types';
import { JSONPathProcessor } from '../processors/JSONPathProcessor';
import * as _ from 'lodash';

export class SystemToolExecutor extends BaseToolExecutor {
  private jsonPathProcessor: JSONPathProcessor;

  constructor() {
    super('system');
    this.jsonPathProcessor = new JSONPathProcessor();
  }

  protected async executeInternal(
    tool: ITool,
    context: IToolExecutionContext
  ): Promise<IToolResult> {
    if (!tool.system) {
      throw new Error('System tool must have system configuration');
    }

    const startTime = Date.now();

    try {
      let result: unknown;

      switch (tool.system.op) {
        case 'assign':
          result = await this.executeAssign(tool.system, context);
          break;

        case 'merge':
          result = await this.executeMerge(tool.system, context);
          break;

        case 'delete':
          result = await this.executeDelete(tool.system, context);
          break;

        case 'transform':
          result = await this.executeTransform(tool.system, context);
          break;

        default:
          throw new Error(`Unknown system operation: ${tool.system.op}`);
      }

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        cached: false,
        retryCount: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        executionTime: Date.now() - startTime,
        retryCount: 0,
      };
    }
  }

  protected async validateTool(tool: ITool): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!tool.system) {
      errors.push('System tool must have system configuration');
      return { valid: false, errors: errors.map(msg => ({ path: 'system', message: msg })) };
    }

    if (!tool.system.op) {
      errors.push('System operation is required');
    }

    if (!['assign', 'merge', 'delete', 'transform'].includes(tool.system.op)) {
      errors.push(`Invalid system operation: ${tool.system.op}`);
    }

    if (!tool.system.path) {
      errors.push('System path is required');
    }

    if (tool.system.op === 'transform' && !tool.system.transform) {
      errors.push('Transform configuration is required for transform operation');
    }

    return {
      valid: errors.length === 0,
      errors: errors.map(msg => ({ path: 'system', message: msg })),
    };
  }

  private async executeAssign(
    config: ITool['system'],
    context: IToolExecutionContext
  ): Promise<unknown> {
    if (!config) throw new Error('System config is required');

    const targetPath = config.path;
    const value = config.value;

    // Apply the assignment to state
    const updatedState = _.cloneDeep(context.state);
    this.jsonPathProcessor.setValue(updatedState, targetPath, value);

    return {
      operation: 'assign',
      path: targetPath,
      value,
      previousValue: this.jsonPathProcessor.getValue(context.state, targetPath),
    };
  }

  private async executeMerge(
    config: ITool['system'],
    context: IToolExecutionContext
  ): Promise<unknown> {
    if (!config) throw new Error('System config is required');

    const targetPath = config.path;
    const mergeValue = config.value;

    const currentValue = this.jsonPathProcessor.getValue(context.state, targetPath);

    let mergedValue: unknown;
    if (_.isObject(currentValue) && _.isObject(mergeValue)) {
      mergedValue = _.merge({}, currentValue, mergeValue);
    } else if (_.isArray(currentValue) && _.isArray(mergeValue)) {
      mergedValue = [...currentValue, ...mergeValue];
    } else {
      // If types don't match or aren't mergeable, replace
      mergedValue = mergeValue;
    }

    const updatedState = _.cloneDeep(context.state);
    this.jsonPathProcessor.setValue(updatedState, targetPath, mergedValue);

    return {
      operation: 'merge',
      path: targetPath,
      value: mergedValue,
      previousValue: currentValue,
    };
  }

  private async executeDelete(
    config: ITool['system'],
    context: IToolExecutionContext
  ): Promise<unknown> {
    if (!config) throw new Error('System config is required');

    const targetPath = config.path;
    const previousValue = this.jsonPathProcessor.getValue(context.state, targetPath);

    const updatedState = _.cloneDeep(context.state);
    this.jsonPathProcessor.deletePath(updatedState, targetPath);

    return {
      operation: 'delete',
      path: targetPath,
      previousValue,
      deleted: true,
    };
  }

  private async executeTransform(
    config: ITool['system'],
    context: IToolExecutionContext
  ): Promise<unknown> {
    if (!config || !config.transform) throw new Error('Transform config is required');

    const targetPath = config.path;
    const currentValue = this.jsonPathProcessor.getValue(context.state, targetPath);

    let transformedValue: unknown;

    switch (config.transform.type) {
      case 'jsonata':
        transformedValue = await this.executeJSONataTransform(
          config.transform.expression,
          currentValue,
          context.state
        );
        break;

      case 'javascript':
        transformedValue = await this.executeJavaScriptTransform(
          config.transform.expression,
          currentValue,
          context.state
        );
        break;

      default:
        throw new Error(`Unknown transform type: ${config.transform.type}`);
    }

    const updatedState = _.cloneDeep(context.state);
    this.jsonPathProcessor.setValue(updatedState, targetPath, transformedValue);

    return {
      operation: 'transform',
      path: targetPath,
      value: transformedValue,
      previousValue: currentValue,
      transformType: config.transform.type,
    };
  }

  private async executeJSONataTransform(
    expression: string,
    currentValue: unknown,
    state: unknown
  ): Promise<unknown> {
    try {
      const jsonataModule = require('jsonata'); // eslint-disable-line @typescript-eslint/no-var-requires
      const expr = jsonataModule.default
        ? jsonataModule.default(expression)
        : jsonataModule(expression);

      // Create context with current value and full state
      const context = {
        $: currentValue,
        state,
        value: currentValue,
      };

      return await expr.evaluate(context);
    } catch (error) {
      throw new Error(`JSONata transform failed: ${error}`);
    }
  }

  private async executeJavaScriptTransform(
    expression: string,
    currentValue: unknown,
    state: unknown
  ): Promise<unknown> {
    try {
      // Create a safe execution context
      const context = {
        value: currentValue,
        state,
        _,
        JSON,
        Math,
        Date,
        console: {
          log: (...args: unknown[]) => {
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.log('[Transform]', ...args);
            }
          },
          warn: (...args: unknown[]) => {
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.warn('[Transform]', ...args);
            }
          },
          error: (...args: unknown[]) => {
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.error('[Transform]', ...args);
            }
          },
        },
      };

      // Create function with restricted context
      const func = new Function(...Object.keys(context), `"use strict"; return (${expression});`);

      return func(...Object.values(context));
    } catch (error) {
      throw new Error(`JavaScript transform failed: ${error}`);
    }
  }
}
