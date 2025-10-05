import { IStatePatch } from '../core/interfaces';
import { JSONPathProcessor } from '../processors/JSONPathProcessor';
import { EventEmitter } from 'eventemitter3';
import * as _ from 'lodash';

export interface PatchOperation {
  type: 'add' | 'replace' | 'remove' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string; // for move and copy operations
}

export interface PatchResult {
  success: boolean;
  appliedPatches: IStatePatch[];
  failedPatches: Array<{ patch: IStatePatch; error: string }>;
  resultingState: any;
}

export interface PatchValidationResult {
  valid: boolean;
  errors: Array<{ patch: IStatePatch; error: string }>;
}

export class StatePatcher extends EventEmitter {
  private jsonPathProcessor: JSONPathProcessor;

  constructor() {
    super();
    this.jsonPathProcessor = new JSONPathProcessor();
  }

  public applyPatches(state: any, patches: IStatePatch[]): PatchResult {
    const workingState = _.cloneDeep(state);
    const appliedPatches: IStatePatch[] = [];
    const failedPatches: Array<{ patch: IStatePatch; error: string }> = [];

    this.emit('patchingStarted', {
      initialState: state,
      patchCount: patches.length,
    });

    for (const patch of patches) {
      try {
        this.applyPatch(workingState, patch);
        appliedPatches.push(patch);

        this.emit('patchApplied', { patch, state: workingState });
      } catch (error) {
        const errorInfo = {
          patch,
          error: (error as Error).message,
        };
        failedPatches.push(errorInfo);

        this.emit('patchFailed', errorInfo);
      }
    }

    const result: PatchResult = {
      success: failedPatches.length === 0,
      appliedPatches,
      failedPatches,
      resultingState: workingState,
    };

    this.emit('patchingCompleted', result);

    return result;
  }

  public validatePatches(state: any, patches: IStatePatch[]): PatchValidationResult {
    const errors: Array<{ patch: IStatePatch; error: string }> = [];

    for (const patch of patches) {
      try {
        this.validatePatch(state, patch);
      } catch (error) {
        errors.push({
          patch,
          error: (error as Error).message,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public generatePatches(oldState: any, newState: any): IStatePatch[] {
    const patches: IStatePatch[] = [];

    this.generatePatchesRecursive(oldState, newState, '', patches);

    this.emit('patchesGenerated', {
      oldState,
      newState,
      patchCount: patches.length,
    });

    return patches;
  }

  public reversePatch(patch: IStatePatch, originalValue?: any): IStatePatch {
    switch (patch.op) {
      case 'add':
        return {
          op: 'remove',
          path: patch.path,
        };

      case 'replace':
        return {
          op: 'replace',
          path: patch.path,
          value: originalValue,
        };

      case 'remove':
        return {
          op: 'add',
          path: patch.path,
          value: originalValue,
        };

      default:
        throw new Error(`Cannot reverse patch operation: ${patch.op}`);
    }
  }

  public reversePatches(patches: IStatePatch[], originalState: any): IStatePatch[] {
    const reversedPatches: IStatePatch[] = [];

    // Reverse patches in reverse order
    for (let i = patches.length - 1; i >= 0; i--) {
      const patch = patches[i];
      const originalValue = this.jsonPathProcessor.getValue(originalState, patch.path);

      try {
        const reversedPatch = this.reversePatch(patch, originalValue);
        reversedPatches.push(reversedPatch);
      } catch (error) {
        this.emit('reverseError', { patch, error });
      }
    }

    return reversedPatches;
  }

  public optimizePatches(patches: IStatePatch[]): IStatePatch[] {
    const pathMap = new Map<string, IStatePatch>();

    // Group patches by path
    for (const patch of patches) {
      const existing = pathMap.get(patch.path);

      if (existing) {
        // Merge or replace based on operations
        if (patch.op === 'remove') {
          // Remove operation overrides any previous operation
          pathMap.set(patch.path, patch);
        } else if (existing.op === 'remove') {
          // If previous was remove, current becomes add
          pathMap.set(patch.path, { ...patch, op: 'add' });
        } else {
          // Replace with latest value
          pathMap.set(patch.path, patch);
        }
      } else {
        pathMap.set(patch.path, patch);
      }
    }

    // Convert back to array and sort by path depth (deeper paths first for removes)
    const sortedPatches = Array.from(pathMap.values()).sort((a, b) => {
      const depthA = a.path.split('.').length;
      const depthB = b.path.split('.').length;

      if (a.op === 'remove' && b.op === 'remove') {
        return depthB - depthA; // Deeper paths first for removes
      } else if (a.op === 'remove') {
        return 1; // Removes after adds/replaces
      } else if (b.op === 'remove') {
        return -1; // Adds/replaces before removes
      }

      return depthA - depthB; // Shallower paths first for adds/replaces
    });

    this.emit('patchesOptimized', {
      originalCount: patches.length,
      optimizedCount: sortedPatches.length,
    });

    return sortedPatches;
  }

  public createPatch(
    operation: 'add' | 'replace' | 'remove',
    path: string,
    value?: any
  ): IStatePatch {
    const patch: IStatePatch = {
      op: operation,
      path,
    };

    if (operation === 'add' || operation === 'replace') {
      if (value === undefined) {
        throw new Error(`${operation} operation requires a value`);
      }
      patch.value = value;
    }

    return patch;
  }

  public testPatch(state: any, patch: IStatePatch): boolean {
    try {
      const testState = _.cloneDeep(state);
      this.applyPatch(testState, patch);
      return true;
    } catch {
      return false;
    }
  }

  public getPatchSize(patch: IStatePatch): number {
    try {
      return JSON.stringify(patch).length;
    } catch {
      return 0;
    }
  }

  public comparePaths(
    path1: string,
    path2: string
  ): {
    isParent: boolean;
    isChild: boolean;
    isEqual: boolean;
    commonAncestor?: string;
  } {
    const parts1 = path1.split('.');
    const parts2 = path2.split('.');

    const minLength = Math.min(parts1.length, parts2.length);
    let commonParts = 0;

    for (let i = 0; i < minLength; i++) {
      if (parts1[i] === parts2[i]) {
        commonParts++;
      } else {
        break;
      }
    }

    return {
      isParent: commonParts === parts1.length && parts1.length < parts2.length,
      isChild: commonParts === parts2.length && parts2.length < parts1.length,
      isEqual: path1 === path2,
      commonAncestor: commonParts > 0 ? parts1.slice(0, commonParts).join('.') : undefined,
    };
  }

  private applyPatch(state: any, patch: IStatePatch): void {
    switch (patch.op) {
      case 'add':
      case 'replace':
        this.jsonPathProcessor.setValue(state, patch.path, patch.value);
        break;

      case 'remove':
        this.jsonPathProcessor.deletePath(state, patch.path);
        break;

      default:
        throw new Error(`Unsupported patch operation: ${(patch as any).op}`);
    }
  }

  private validatePatch(state: any, patch: IStatePatch): void {
    if (!patch.op) {
      throw new Error('Patch must have an operation');
    }

    if (!patch.path) {
      throw new Error('Patch must have a path');
    }

    if (!['add', 'replace', 'remove'].includes(patch.op)) {
      throw new Error(`Invalid patch operation: ${patch.op}`);
    }

    if ((patch.op === 'add' || patch.op === 'replace') && patch.value === undefined) {
      throw new Error(`${patch.op} operation requires a value`);
    }

    // Validate path exists for replace and remove operations
    if (patch.op === 'replace' || patch.op === 'remove') {
      const exists = this.jsonPathProcessor.hasPath(state, patch.path);
      if (!exists) {
        throw new Error(`Path does not exist: ${patch.path}`);
      }
    }

    // Validate JSONPath syntax
    const pathValidation = this.jsonPathProcessor.validatePath(patch.path);
    if (!pathValidation.valid) {
      throw new Error(`Invalid path: ${pathValidation.error}`);
    }
  }

  private generatePatchesRecursive(
    oldValue: any,
    newValue: any,
    path: string,
    patches: IStatePatch[]
  ): void {
    if (_.isEqual(oldValue, newValue)) {
      return; // No changes
    }

    if (oldValue === undefined) {
      // Value was added
      patches.push({
        op: 'add',
        path: path || '$',
        value: newValue,
      });
      return;
    }

    if (newValue === undefined) {
      // Value was removed
      patches.push({
        op: 'remove',
        path: path || '$',
      });
      return;
    }

    if (
      !_.isObject(oldValue) ||
      !_.isObject(newValue) ||
      _.isArray(oldValue) !== _.isArray(newValue)
    ) {
      // Different types or non-objects, replace entirely
      patches.push({
        op: 'replace',
        path: path || '$',
        value: newValue,
      });
      return;
    }

    if (_.isArray(oldValue) && _.isArray(newValue)) {
      // Handle array changes
      this.generateArrayPatches(oldValue, newValue, path, patches);
      return;
    }

    // Handle object changes
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

    for (const key of allKeys) {
      const childPath = path ? `${path}.${key}` : key;
      this.generatePatchesRecursive(
        (oldValue as any)[key],
        (newValue as any)[key],
        childPath,
        patches
      );
    }
  }

  private generateArrayPatches(
    oldArray: any[],
    newArray: any[],
    path: string,
    patches: IStatePatch[]
  ): void {
    // Simplified array patching - replace entire array
    // In practice, you might want more sophisticated array diffing
    patches.push({
      op: 'replace',
      path: path || '$',
      value: newArray,
    });
  }

  // Utility methods for common patch patterns
  public static createAddPatch(path: string, value: any): IStatePatch {
    return { op: 'add', path, value };
  }

  public static createReplacePatch(path: string, value: any): IStatePatch {
    return { op: 'replace', path, value };
  }

  public static createRemovePatch(path: string): IStatePatch {
    return { op: 'remove', path };
  }

  public static createMergePatch(path: string, value: any): IStatePatch[] {
    // Create patches to merge an object at a path
    const patches: IStatePatch[] = [];

    if (_.isObject(value)) {
      Object.entries(value).forEach(([key, val]) => {
        patches.push({
          op: 'replace',
          path: `${path}.${key}`,
          value: val,
        });
      });
    } else {
      patches.push({
        op: 'replace',
        path,
        value,
      });
    }

    return patches;
  }
}
