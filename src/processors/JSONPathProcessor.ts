import { JSONPath } from 'jsonpath-plus';
import { EventEmitter } from 'eventemitter3';
import * as _ from 'lodash';

export class JSONPathProcessor extends EventEmitter {
  public getValue(obj: any, path: string): any {
    try {
      // Handle both JSONPath and simple dot notation
      if (path.startsWith('$.')) {
        const results = JSONPath({ path, json: obj, wrap: false });
        return results;
      } else {
        // Use lodash for simple dot notation
        return _.get(obj, path);
      }
    } catch (error) {
      this.emit('evaluationError', { path, error, obj });
      return undefined;
    }
  }

  public setValue(obj: any, path: string, value: any): boolean {
    try {
      if (path.startsWith('$.')) {
        // Convert JSONPath to lodash path for setting
        const lodashPath = this.convertJSONPathToLodashPath(path);
        _.set(obj, lodashPath, value);
      } else {
        _.set(obj, path, value);
      }

      this.emit('valueSet', { path, value, obj });
      return true;
    } catch (error) {
      this.emit('setError', { path, value, error, obj });
      return false;
    }
  }

  public deletePath(obj: any, path: string): boolean {
    try {
      if (path.startsWith('$.')) {
        const lodashPath = this.convertJSONPathToLodashPath(path);
        _.unset(obj, lodashPath);
      } else {
        _.unset(obj, path);
      }

      this.emit('pathDeleted', { path, obj });
      return true;
    } catch (error) {
      this.emit('deleteError', { path, error, obj });
      return false;
    }
  }

  public hasPath(obj: any, path: string): boolean {
    try {
      if (path.startsWith('$.')) {
        const results = JSONPath({ path, json: obj, wrap: false });
        return results !== undefined;
      } else {
        return _.has(obj, path);
      }
    } catch (error) {
      this.emit('hasError', { path, error, obj });
      return false;
    }
  }

  public getMultiple(obj: any, paths: string[]): Record<string, any> {
    const results: Record<string, any> = {};

    paths.forEach(path => {
      try {
        results[path] = this.getValue(obj, path);
      } catch (error) {
        this.emit('multipleGetError', { path, error, obj });
        results[path] = undefined;
      }
    });

    return results;
  }

  public setMultiple(obj: any, updates: Record<string, any>): Record<string, boolean> {
    const results: Record<string, boolean> = {};

    Object.entries(updates).forEach(([path, value]) => {
      results[path] = this.setValue(obj, path, value);
    });

    return results;
  }

  public query(
    obj: any,
    path: string,
    options?: {
      wrap?: boolean;
      resultType?: 'value' | 'path' | 'pointer' | 'parent' | 'parentProperty' | 'all';
      flatten?: boolean;
    }
  ): any {
    try {
      const queryOptions = {
        path,
        json: obj,
        wrap: options?.wrap !== false,
        resultType: options?.resultType || 'value',
        flatten: options?.flatten || false,
      };

      const results = JSONPath(queryOptions);

      this.emit('queryExecuted', { path, options, results, obj });

      return results;
    } catch (error) {
      this.emit('queryError', { path, options, error, obj });
      return options?.wrap !== false ? [] : undefined;
    }
  }

  public filter(obj: any, filterExpression: string): any[] {
    try {
      // Use JSONPath filter expressions like $[?(@.age > 18)]
      const results = JSONPath({ path: filterExpression, json: obj });

      this.emit('filterExecuted', { filterExpression, results, obj });

      return Array.isArray(results) ? results : [results];
    } catch (error) {
      this.emit('filterError', { filterExpression, error, obj });
      return [];
    }
  }

  public transform(
    obj: any,
    transformations: Array<{
      path: string;
      operation: 'set' | 'delete' | 'merge' | 'push' | 'unshift';
      value?: any;
    }>
  ): any {
    const result = _.cloneDeep(obj);

    transformations.forEach(({ path, operation, value }) => {
      try {
        switch (operation) {
          case 'set':
            this.setValue(result, path, value);
            break;

          case 'delete':
            this.deletePath(result, path);
            break;

          case 'merge': {
            const existing = this.getValue(result, path);
            if (_.isObject(existing) && _.isObject(value)) {
              this.setValue(result, path, _.merge({}, existing, value));
            } else {
              this.setValue(result, path, value);
            }
            break;
          }

          case 'push': {
            const pushTarget = this.getValue(result, path);
            if (Array.isArray(pushTarget)) {
              pushTarget.push(value);
            } else {
              this.setValue(result, path, [value]);
            }
            break;
          }

          case 'unshift': {
            const unshiftTarget = this.getValue(result, path);
            if (Array.isArray(unshiftTarget)) {
              unshiftTarget.unshift(value);
            } else {
              this.setValue(result, path, [value]);
            }
            break;
          }
        }

        this.emit('transformationApplied', { path, operation, value });
      } catch (error) {
        this.emit('transformationError', { path, operation, value, error });
      }
    });

    return result;
  }

  public validatePath(path: string): { valid: boolean; error?: string } {
    try {
      if (path.startsWith('$.')) {
        // Try to parse as JSONPath
        JSONPath.toPathArray(path);
      } else {
        // Validate as simple property path
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*|\[\d+\])*$/.test(path)) {
          return { valid: false, error: 'Invalid property path format' };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  public getPathInfo(
    obj: any,
    path: string
  ): {
    exists: boolean;
    type: string;
    value: any;
    parent?: any;
    parentPath?: string;
    key?: string;
  } {
    try {
      const value = this.getValue(obj, path);
      const exists = value !== undefined;

      let parent: any;
      let parentPath: string;
      let key: string;

      if (path.includes('.')) {
        const pathParts = path.split('.');
        key = pathParts[pathParts.length - 1];
        parentPath = pathParts.slice(0, -1).join('.');
        parent = this.getValue(obj, parentPath);
      } else {
        key = path;
        parent = obj;
        parentPath = '';
      }

      return {
        exists,
        type: exists ? typeof value : 'undefined',
        value,
        parent,
        parentPath,
        key,
      };
    } catch (error) {
      this.emit('pathInfoError', { path, error, obj });
      return {
        exists: false,
        type: 'undefined',
        value: undefined,
      };
    }
  }

  public findPaths(obj: any, predicate: (value: any, path: string) => boolean): string[] {
    const paths: string[] = [];

    const traverse = (current: any, currentPath: string) => {
      if (predicate(current, currentPath)) {
        paths.push(currentPath);
      }

      if (_.isObject(current)) {
        Object.keys(current).forEach(key => {
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          traverse((current as any)[key], newPath);
        });
      }
    };

    traverse(obj, '');
    return paths;
  }

  public getAllPaths(
    obj: any,
    options?: {
      includeArrayIndices?: boolean;
      maxDepth?: number;
    }
  ): string[] {
    const paths: string[] = [];
    const maxDepth = options?.maxDepth || Infinity;
    const includeArrayIndices = options?.includeArrayIndices !== false;

    const traverse = (current: any, currentPath: string, depth: number) => {
      if (depth > maxDepth) return;

      if (currentPath) {
        paths.push(currentPath);
      }

      if (_.isObject(current)) {
        Object.keys(current).forEach(key => {
          const newPath = currentPath ? `${currentPath}.${key}` : key;
          traverse((current as any)[key], newPath, depth + 1);
        });
      } else if (Array.isArray(current) && includeArrayIndices) {
        current.forEach((item, index) => {
          const newPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
          traverse(item, newPath, depth + 1);
        });
      }
    };

    traverse(obj, '', 0);
    return paths;
  }

  private convertJSONPathToLodashPath(jsonPath: string): string {
    // Convert JSONPath notation to lodash path notation
    // This is a simplified conversion - in practice, you might need more sophisticated parsing
    let path = jsonPath.startsWith('$.') ? jsonPath.substring(2) : jsonPath;

    // Convert array access from JSONPath [n] to lodash [n]
    path = path.replace(/\[(\d+)\]/g, '[$1]');

    // Convert property access from JSONPath ['prop'] to lodash.prop
    path = path.replace(/\['([^']+)'\]/g, '.$1');

    return path;
  }

  // Static utility methods
  public static isValidJSONPath(path: string): boolean {
    try {
      JSONPath.toPathArray(path);
      return true;
    } catch {
      return false;
    }
  }

  public static normalizeJSONPath(path: string): string {
    if (!path.startsWith('$.')) {
      return `$.${path}`;
    }
    return path;
  }

  public static pathToArray(path: string): string[] {
    try {
      return JSONPath.toPathArray(path);
    } catch {
      return path.split('.');
    }
  }
}
