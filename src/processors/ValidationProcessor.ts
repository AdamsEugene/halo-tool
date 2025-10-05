import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { EventEmitter } from 'eventemitter3';
import { IValidationConfig } from '../core/interfaces';
import { JSONSchema, ValidationError, ValidationResult } from '../core/types';

export class ValidationProcessor extends EventEmitter {
  private ajv: Ajv;
  private compiledSchemas: Map<string, ValidateFunction> = new Map();

  constructor() {
    super();

    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      removeAdditional: false,
    });

    // Add standard formats (date, email, uri, etc.)
    addFormats(this.ajv);

    // Add custom formats
    this.addCustomFormats();
  }

  public async validateRequest(data: any, config: IValidationConfig): Promise<ValidationResult> {
    if (!config.requestSchema) {
      return { valid: true };
    }

    return this.validateAgainstSchema(data, config.requestSchema, 'request');
  }

  public async validateResponse(data: any, config: IValidationConfig): Promise<ValidationResult> {
    if (!config.responseSchema || !config.validateResponse) {
      return { valid: true };
    }

    return this.validateAgainstSchema(data, config.responseSchema, 'response');
  }

  public async validateAgainstSchema(
    data: any,
    schema: JSONSchema,
    context: string = 'data'
  ): Promise<ValidationResult> {
    try {
      const schemaKey = this.getSchemaKey(schema);
      let validate = this.compiledSchemas.get(schemaKey);

      if (!validate) {
        validate = this.ajv.compile(schema);
        this.compiledSchemas.set(schemaKey, validate);
      }

      const valid = validate(data);

      if (valid) {
        this.emit('validationSuccess', { context, data, schema });
        return { valid: true };
      } else {
        const errors = this.formatAjvErrors(validate.errors || [], context);
        this.emit('validationFailure', { context, data, schema, errors });

        return {
          valid: false,
          errors,
        };
      }
    } catch (error) {
      const validationError: ValidationError = {
        path: context,
        message: `Schema validation failed: ${(error as Error).message}`,
        code: 'SCHEMA_ERROR',
      };

      this.emit('validationError', { context, error, data, schema });

      return {
        valid: false,
        errors: [validationError],
      };
    }
  }

  public async validateCustomRules(
    data: any,
    rules: Array<{
      type: 'regex' | 'function' | 'jsonata';
      expression: string;
      message: string;
      path?: string;
    }>
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      try {
        const isValid = await this.executeCustomRule(data, rule);

        if (!isValid) {
          errors.push({
            path: rule.path || 'root',
            message: rule.message,
            code: `CUSTOM_${rule.type.toUpperCase()}`,
            value: data,
          });
        }
      } catch (error) {
        errors.push({
          path: rule.path || 'root',
          message: `Custom rule execution failed: ${(error as Error).message}`,
          code: 'CUSTOM_RULE_ERROR',
          value: data,
        });
      }
    }

    const valid = errors.length === 0;

    if (valid) {
      this.emit('customValidationSuccess', { data, rules });
    } else {
      this.emit('customValidationFailure', { data, rules, errors });
    }

    return { valid, errors: errors.length > 0 ? errors : undefined };
  }

  public validateSchema(schema: JSONSchema): ValidationResult {
    try {
      this.ajv.compile(schema);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            path: 'schema',
            message: `Invalid JSON Schema: ${(error as Error).message}`,
            code: 'INVALID_SCHEMA',
          },
        ],
      };
    }
  }

  public addCustomFormat(name: string, validator: (value: any) => boolean): void {
    this.ajv.addFormat(name, validator);
  }

  public addCustomKeyword(keyword: string, definition: any): void {
    try {
      this.ajv.addKeyword({ keyword, ...definition });
    } catch (error) {
      // Fallback for compatibility issues
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(`Failed to add custom keyword ${keyword}:`, error);
      }
    }
  }

  public clearCompiledSchemas(): void {
    this.compiledSchemas.clear();
    this.emit('schemasCleared');
  }

  public getCompiledSchemaCount(): number {
    return this.compiledSchemas.size;
  }

  private async executeCustomRule(
    data: any,
    rule: {
      type: 'regex' | 'function' | 'jsonata';
      expression: string;
      path?: string;
    }
  ): Promise<boolean> {
    const targetValue = rule.path ? this.getValueByPath(data, rule.path) : data;

    switch (rule.type) {
      case 'regex':
        return this.executeRegexRule(targetValue, rule.expression);

      case 'function':
        return this.executeFunctionRule(targetValue, rule.expression, data);

      case 'jsonata':
        return this.executeJSONataRule(data, rule.expression);

      default:
        throw new Error(`Unknown custom rule type: ${(rule as any).type}`);
    }
  }

  private executeRegexRule(value: any, pattern: string): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${pattern}`);
    }
  }

  private executeFunctionRule(value: any, expression: string, fullData: any): boolean {
    try {
      // Create a safe execution context
      const context = {
        value,
        data: fullData,
        // Add safe utility functions
        isString: (v: any) => typeof v === 'string',
        isNumber: (v: any) => typeof v === 'number',
        isBoolean: (v: any) => typeof v === 'boolean',
        isArray: Array.isArray,
        isObject: (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v),
        isEmpty: (v: any) => {
          if (v == null) return true;
          if (typeof v === 'string' || Array.isArray(v)) return v.length === 0;
          if (typeof v === 'object') return Object.keys(v).length === 0;
          return false;
        },
        Math,
        Date,
        RegExp,
      };

      // Create function with restricted context
      const func = new Function(...Object.keys(context), `"use strict"; return (${expression});`);

      return Boolean(func(...Object.values(context)));
    } catch (error) {
      throw new Error(`Function rule execution failed: ${error}`);
    }
  }

  private async executeJSONataRule(data: any, expression: string): Promise<boolean> {
    try {
      // Import jsonata dynamically to avoid issues if not available
      const jsonata = await import('jsonata');
      const expr = jsonata.default(expression);
      const result = await expr.evaluate(data);
      return Boolean(result);
    } catch (error) {
      throw new Error(`JSONata rule execution failed: ${error}`);
    }
  }

  private formatAjvErrors(ajvErrors: any[], context: string): ValidationError[] {
    return ajvErrors.map(error => ({
      path: error.instancePath || context,
      message: error.message || 'Validation failed',
      code: error.keyword?.toUpperCase() || 'VALIDATION_ERROR',
      value: error.data,
    }));
  }

  private getSchemaKey(schema: JSONSchema): string {
    // Create a stable key for schema caching
    return JSON.stringify(schema);
  }

  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private addCustomFormats(): void {
    // Add custom formats for common validation scenarios

    // Phone number format
    this.ajv.addFormat('phone', /^\+?[\d\s\-()]+$/);

    // Credit card format (basic)
    this.ajv.addFormat('creditCard', /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/);

    // Social Security Number format
    this.ajv.addFormat('ssn', /^\d{3}-?\d{2}-?\d{4}$/);

    // Postal code format (flexible)
    this.ajv.addFormat('postalCode', /^[\w\s-]{3,10}$/);

    // Strong password format
    this.ajv.addFormat('strongPassword', (value: string) => {
      if (typeof value !== 'string') return false;
      return (
        value.length >= 8 &&
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value) &&
        /\d/.test(value) &&
        /[!@#$%^&*(),.?":{}|<>]/.test(value)
      );
    });

    // Color hex format
    this.ajv.addFormat('colorHex', /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);

    // Semantic version format
    this.ajv.addFormat('semver', /^\d+\.\d+\.\d+([-\w.-]+)?([+\w.-]+)?$/);
  }

  // Utility methods for creating common validation configs
  public static createBasicValidation(
    requestSchema?: JSONSchema,
    responseSchema?: JSONSchema
  ): IValidationConfig {
    return {
      requestSchema,
      responseSchema,
      validateResponse: !!responseSchema,
    };
  }

  public static createStrictValidation(
    requestSchema: JSONSchema,
    responseSchema: JSONSchema
  ): IValidationConfig {
    return {
      requestSchema,
      responseSchema,
      validateResponse: true,
    };
  }

  // Common schema builders
  public static createStringSchema(
    minLength?: number,
    maxLength?: number,
    pattern?: string,
    format?: string
  ): JSONSchema {
    const schema: JSONSchema = { type: 'string' };

    if (minLength !== undefined) schema.minLength = minLength;
    if (maxLength !== undefined) schema.maxLength = maxLength;
    if (pattern) schema.pattern = pattern;
    if (format) schema.format = format;

    return schema;
  }

  public static createNumberSchema(
    minimum?: number,
    maximum?: number,
    multipleOf?: number
  ): JSONSchema {
    const schema: JSONSchema = { type: 'number' };

    if (minimum !== undefined) schema.minimum = minimum;
    if (maximum !== undefined) schema.maximum = maximum;
    if (multipleOf !== undefined) schema.multipleOf = multipleOf;

    return schema;
  }

  public static createObjectSchema(
    properties: Record<string, JSONSchema>,
    required?: string[],
    additionalProperties: boolean = false
  ): JSONSchema {
    return {
      type: 'object',
      properties,
      required,
      additionalProperties,
    };
  }

  public static createArraySchema(
    items: JSONSchema,
    minItems?: number,
    maxItems?: number,
    uniqueItems?: boolean
  ): JSONSchema {
    const schema: JSONSchema = {
      type: 'array',
      items,
    };

    if (minItems !== undefined) schema.minItems = minItems;
    if (maxItems !== undefined) schema.maxItems = maxItems;
    if (uniqueItems !== undefined) schema.uniqueItems = uniqueItems;

    return schema;
  }
}
