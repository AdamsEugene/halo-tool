import { IAssignment } from '../core/interfaces';
import { JSONPathProcessor } from './JSONPathProcessor';
import { EventEmitter } from 'eventemitter3';
import * as _ from 'lodash';

export interface AssignmentResult {
  success: boolean;
  assignment: IAssignment;
  value?: any;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export class AssignmentProcessor extends EventEmitter {
  private jsonPathProcessor: JSONPathProcessor;

  constructor() {
    super();
    this.jsonPathProcessor = new JSONPathProcessor();
  }

  public async process(
    responseData: any,
    assignments: IAssignment[],
    targetState: any
  ): Promise<{
    success: boolean;
    results: AssignmentResult[];
    updatedState: any;
    errors: string[];
  }> {
    const results: AssignmentResult[] = [];
    const errors: string[] = [];
    const updatedState = _.cloneDeep(targetState);

    this.emit('processingStarted', { 
      responseData, 
      assignments: assignments.length, 
      targetState 
    });

    for (const assignment of assignments) {
      try {
        const result = await this.processAssignment(assignment, responseData, updatedState);
        results.push(result);

        if (!result.success && !result.skipped) {
          errors.push(result.error || 'Unknown assignment error');
        }

        this.emit('assignmentProcessed', result);
      } catch (error) {
        const errorResult: AssignmentResult = {
          success: false,
          assignment,
          error: (error as Error).message
        };
        results.push(errorResult);
        errors.push((error as Error).message);
        
        this.emit('assignmentError', { assignment, error });
      }
    }

    const overallSuccess = errors.length === 0;
    
    this.emit('processingCompleted', {
      success: overallSuccess,
      results,
      updatedState,
      errors
    });

    return {
      success: overallSuccess,
      results,
      updatedState,
      errors
    };
  }

  public async processAssignment(
    assignment: IAssignment,
    sourceData: any,
    targetState: any
  ): Promise<AssignmentResult> {
    try {
      // Extract value from source
      let value: any;
      
      if (assignment.source === 'response') {
        value = this.extractFromResponse(sourceData, assignment.valuePath);
      } else if (assignment.source === 'computed') {
        value = this.computeValue(assignment.valuePath, sourceData, targetState);
      } else {
        throw new Error(`Unknown assignment source: ${assignment.source}`);
      }

      // Handle missing required values
      if ((value === undefined || value === null) && assignment.required) {
        return {
          success: false,
          assignment,
          error: `Required value not found at path: ${assignment.valuePath}`
        };
      }

      // Apply default value if needed
      if ((value === undefined || value === null) && assignment.default !== undefined) {
        value = assignment.default;
        this.emit('defaultValueApplied', { assignment, defaultValue: value });
      }

      // Skip if value is still undefined/null and not required
      if ((value === undefined || value === null) && !assignment.required) {
        return {
          success: true,
          assignment,
          skipped: true,
          reason: 'Value is null/undefined and not required'
        };
      }

      // Apply the assignment to target state
      const success = this.applyAssignment(assignment, value, targetState);
      
      return {
        success,
        assignment,
        value,
        error: success ? undefined : 'Failed to apply assignment to target state'
      };

    } catch (error) {
      return {
        success: false,
        assignment,
        error: (error as Error).message
      };
    }
  }

  public validateAssignments(assignments: IAssignment[]): {
    valid: boolean;
    errors: Array<{ assignment: IAssignment; error: string }>;
  } {
    const errors: Array<{ assignment: IAssignment; error: string }> = [];

    assignments.forEach(assignment => {
      // Validate source
      if (!['response', 'computed'].includes(assignment.source)) {
        errors.push({
          assignment,
          error: `Invalid source: ${assignment.source}`
        });
      }

      // Validate paths
      if (!assignment.valuePath) {
        errors.push({
          assignment,
          error: 'valuePath is required'
        });
      }

      if (!assignment.statePath) {
        errors.push({
          assignment,
          error: 'statePath is required'
        });
      }

      // Validate JSONPath syntax if applicable
      if (assignment.valuePath?.startsWith('$.')) {
        const validation = this.jsonPathProcessor.validatePath(assignment.valuePath);
        if (!validation.valid) {
          errors.push({
            assignment,
            error: `Invalid valuePath JSONPath: ${validation.error}`
          });
        }
      }

      if (assignment.statePath?.startsWith('$.')) {
        const validation = this.jsonPathProcessor.validatePath(assignment.statePath);
        if (!validation.valid) {
          errors.push({
            assignment,
            error: `Invalid statePath JSONPath: ${validation.error}`
          });
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public previewAssignments(
    responseData: any,
    assignments: IAssignment[],
    targetState: any
  ): Array<{
    assignment: IAssignment;
    extractedValue: any;
    targetPath: string;
    currentValue: any;
    wouldOverwrite: boolean;
  }> {
    return assignments.map(assignment => {
      let extractedValue: any;
      
      try {
        if (assignment.source === 'response') {
          extractedValue = this.extractFromResponse(responseData, assignment.valuePath);
        } else {
          extractedValue = this.computeValue(assignment.valuePath, responseData, targetState);
        }
      } catch (error) {
        extractedValue = `Error: ${(error as Error).message}`;
      }

      // Apply default if needed
      if ((extractedValue === undefined || extractedValue === null) && assignment.default !== undefined) {
        extractedValue = assignment.default;
      }

      const currentValue = this.jsonPathProcessor.getValue(targetState, assignment.statePath);
      const wouldOverwrite = currentValue !== undefined && !assignment.merge;

      return {
        assignment,
        extractedValue,
        targetPath: assignment.statePath,
        currentValue,
        wouldOverwrite
      };
    });
  }

  private extractFromResponse(responseData: any, valuePath: string): any {
    if (valuePath.startsWith('$.')) {
      return this.jsonPathProcessor.getValue(responseData, valuePath);
    } else {
      return _.get(responseData, valuePath);
    }
  }

  private computeValue(expression: string, responseData: any, targetState: any): any {
    // For computed values, the expression could be:
    // 1. A JSONPath expression that combines response and state data
    // 2. A simple transformation expression
    // 3. A reference to another part of the state
    
    // This is a simplified implementation
    // In practice, you might want to use a more sophisticated expression evaluator
    
    if (expression.startsWith('$.')) {
      // Try to evaluate against response data first, then state
      try {
        return this.jsonPathProcessor.getValue(responseData, expression);
      } catch {
        return this.jsonPathProcessor.getValue(targetState, expression);
      }
    }

    // Handle simple property access
    return _.get(responseData, expression) || _.get(targetState, expression);
  }

  private applyAssignment(assignment: IAssignment, value: any, targetState: any): boolean {
    try {
      if (assignment.merge && value !== null && value !== undefined) {
        const currentValue = this.jsonPathProcessor.getValue(targetState, assignment.statePath);
        
        if (_.isObject(currentValue) && _.isObject(value)) {
          // Merge objects
          const mergedValue = _.merge({}, currentValue, value);
          return this.jsonPathProcessor.setValue(targetState, assignment.statePath, mergedValue);
        } else if (_.isArray(currentValue) && _.isArray(value)) {
          // Merge arrays
          const mergedArray = [...currentValue, ...value];
          return this.jsonPathProcessor.setValue(targetState, assignment.statePath, mergedArray);
        }
      }

      // Default behavior: set/replace value
      return this.jsonPathProcessor.setValue(targetState, assignment.statePath, value);
    } catch (error) {
      this.emit('assignmentApplyError', { assignment, value, error });
      return false;
    }
  }

  public createAssignment(
    source: 'response' | 'computed',
    valuePath: string,
    statePath: string,
    options?: {
      merge?: boolean;
      required?: boolean;
      default?: any;
    }
  ): IAssignment {
    return {
      source,
      valuePath,
      statePath,
      merge: options?.merge || false,
      required: options?.required || false,
      default: options?.default
    };
  }

  // Utility methods for common assignment patterns
  public static createSimpleAssignment(
    responsePath: string,
    statePath: string
  ): IAssignment {
    return {
      source: 'response',
      valuePath: responsePath,
      statePath,
      merge: false,
      required: false
    };
  }

  public static createMergeAssignment(
    responsePath: string,
    statePath: string,
    defaultValue?: any
  ): IAssignment {
    return {
      source: 'response',
      valuePath: responsePath,
      statePath,
      merge: true,
      required: false,
      default: defaultValue
    };
  }

  public static createRequiredAssignment(
    responsePath: string,
    statePath: string
  ): IAssignment {
    return {
      source: 'response',
      valuePath: responsePath,
      statePath,
      merge: false,
      required: true
    };
  }

  public static createComputedAssignment(
    expression: string,
    statePath: string
  ): IAssignment {
    return {
      source: 'computed',
      valuePath: expression,
      statePath,
      merge: false,
      required: false
    };
  }
}
