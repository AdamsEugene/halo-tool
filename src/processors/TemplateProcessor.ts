import { EventEmitter } from 'eventemitter3';

export class TemplateProcessor extends EventEmitter {
  private variablePattern = /\{\{([^}]+)\}\}/g;

  public process(template: string, state: any, dynamicVariables?: Record<string, string>): string {
    if (!template) return template;

    try {
      let processed = template;
      const usedVariables: string[] = [];

      // Replace all template variables
      processed = processed.replace(this.variablePattern, (match, expression) => {
        const trimmedExpression = expression.trim();
        usedVariables.push(trimmedExpression);

        try {
          const value = this.evaluateExpression(trimmedExpression, state, dynamicVariables);
          return this.formatValue(value);
        } catch (error) {
          this.emit('evaluationError', {
            template,
            expression: trimmedExpression,
            error,
            state,
          });

          // Return the original placeholder on error
          return match;
        }
      });

      this.emit('processed', {
        original: template,
        processed,
        usedVariables,
        state,
      });

      return processed;
    } catch (error) {
      this.emit('processingError', {
        template,
        error,
        state,
      });

      return template;
    }
  }

  public extractVariables(template: string): string[] {
    const variables: string[] = [];
    let match;

    // Reset regex state
    this.variablePattern.lastIndex = 0;

    while ((match = this.variablePattern.exec(template)) !== null) {
      variables.push(match[1].trim());
    }

    return variables;
  }

  public hasVariables(template: string): boolean {
    return this.variablePattern.test(template);
  }

  public validateTemplate(
    template: string,
    requiredVariables?: string[]
  ): {
    valid: boolean;
    errors: string[];
    variables: string[];
  } {
    const errors: string[] = [];
    const variables = this.extractVariables(template);

    // Check for malformed template expressions
    const malformedPattern = /\{[^}]*$|\{[^{]*\{/;
    if (malformedPattern.test(template)) {
      errors.push('Template contains malformed expressions');
    }

    // Check for required variables
    if (requiredVariables) {
      const missing = requiredVariables.filter(
        required => !variables.some(variable => variable.includes(required))
      );

      if (missing.length > 0) {
        errors.push(`Missing required variables: ${missing.join(', ')}`);
      }
    }

    // Check for empty expressions
    const emptyExpressions = variables.filter(variable => !variable.trim());
    if (emptyExpressions.length > 0) {
      errors.push('Template contains empty expressions');
    }

    return {
      valid: errors.length === 0,
      errors,
      variables,
    };
  }

  public precompile(template: string): {
    template: string;
    variables: string[];
    execute: (state: any, dynamicVariables?: Record<string, string>) => string;
  } {
    const variables = this.extractVariables(template);

    return {
      template,
      variables,
      execute: (state: any, dynamicVariables?: Record<string, string>) => {
        return this.process(template, state, dynamicVariables);
      },
    };
  }

  private evaluateExpression(
    expression: string,
    state: any,
    dynamicVariables?: Record<string, string>
  ): any {
    // First check dynamic variables
    if (dynamicVariables && dynamicVariables[expression]) {
      const dynamicExpression = dynamicVariables[expression];
      return this.evaluateExpression(dynamicExpression, state);
    }

    // Handle JSONPath-like expressions ($.path.to.value)
    if (expression.startsWith('$.')) {
      return this.evaluateJSONPath(expression, state);
    }

    // Handle direct property access
    if (expression.includes('.')) {
      return this.evaluatePropertyPath(expression, state);
    }

    // Handle array access
    if (expression.includes('[') && expression.includes(']')) {
      return this.evaluateArrayAccess(expression, state);
    }

    // Handle simple variable lookup
    return this.evaluateSimpleVariable(expression, state);
  }

  private evaluateJSONPath(path: string, state: any): any {
    try {
      // Remove the $ prefix and split the path
      const cleanPath = path.substring(2);
      return this.getValueByPath(state, cleanPath);
    } catch (error) {
      throw new Error(`JSONPath evaluation failed: ${path}`);
    }
  }

  private evaluatePropertyPath(path: string, state: any): any {
    try {
      return this.getValueByPath(state, path);
    } catch (error) {
      throw new Error(`Property path evaluation failed: ${path}`);
    }
  }

  private evaluateArrayAccess(expression: string, state: any): any {
    try {
      // Parse expressions like "items[0]" or "users[id]"
      const match = expression.match(/^([^[]+)\[([^\]]+)\]$/);
      if (!match) {
        throw new Error(`Invalid array access syntax: ${expression}`);
      }

      const [, arrayPath, indexExpression] = match;
      const array = this.getValueByPath(state, arrayPath);

      if (!Array.isArray(array)) {
        throw new Error(`Path does not resolve to array: ${arrayPath}`);
      }

      // Handle numeric index
      if (/^\d+$/.test(indexExpression)) {
        const index = parseInt(indexExpression, 10);
        return array[index];
      }

      // Handle property-based lookup (find by property value)
      const propValue = this.getValueByPath(state, indexExpression);
      return array.find(
        item => typeof item === 'object' && item !== null && Object.values(item).includes(propValue)
      );
    } catch (error) {
      throw new Error(`Array access evaluation failed: ${expression}`);
    }
  }

  private evaluateSimpleVariable(variable: string, state: any): any {
    if (state && typeof state === 'object' && variable in state) {
      return state[variable];
    }

    throw new Error(`Variable not found: ${variable}`);
  }

  private getValueByPath(obj: any, path: string): any {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array access in path parts
      if (part.includes('[') && part.includes(']')) {
        const match = part.match(/^([^[]+)\[([^\]]+)\]$/);
        if (match) {
          const [, prop, index] = match;
          current = current[prop];

          if (Array.isArray(current)) {
            const idx = parseInt(index, 10);
            current = current[idx];
          }
        } else {
          current = current[part];
        }
      } else {
        current = current[part];
      }
    }

    return current;
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }

    return String(value);
  }

  // Utility methods for common template operations
  public static createTemplate(strings: TemplateStringsArray, ...expressions: string[]): string {
    let result = '';

    for (let i = 0; i < strings.length; i++) {
      result += strings[i];
      if (i < expressions.length) {
        result += `{{${expressions[i]}}}`;
      }
    }

    return result;
  }

  public static escape(value: string): string {
    return value.replace(/\{\{/g, '\\{\\{').replace(/\}\}/g, '\\}\\}');
  }

  public static unescape(value: string): string {
    return value.replace(/\\{\\{/g, '{{').replace(/\\}\\}/g, '}}');
  }

  // Built-in helper functions that can be used in templates
  public registerHelper(_name: string, _fn: (...args: unknown[]) => unknown): void {
    // This would be used for more advanced template helpers
    // For now, keeping it simple with direct variable substitution
  }
}
