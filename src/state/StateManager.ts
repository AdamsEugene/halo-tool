import { IStateManager, IStatePatch, IStateStore } from '../core/interfaces';
import { JSONPathProcessor } from '../processors/JSONPathProcessor';
import { EventEmitter } from 'eventemitter3';
import * as _ from 'lodash';

export interface StateSubscription {
  id: string;
  path: string;
  callback: (value: any, previousValue: any) => void;
  options?: {
    immediate?: boolean;
    deep?: boolean;
  };
}

export interface StateManagerConfig {
  enableHistory?: boolean;
  maxHistorySize?: number;
  enableCheckpoints?: boolean;
  maxCheckpoints?: number;
  enableValidation?: boolean;
  schema?: any;
}

export class StateManager extends EventEmitter implements IStateManager {
  private currentState: any = {};
  private stateStore: IStateStore;
  private jsonPathProcessor: JSONPathProcessor;
  private subscriptions: Map<string, StateSubscription> = new Map();
  private subscriptionCounter = 0;
  private config: StateManagerConfig;

  constructor(stateStore: IStateStore, initialState: any = {}, config: StateManagerConfig = {}) {
    super();

    this.stateStore = stateStore;
    this.jsonPathProcessor = new JSONPathProcessor();
    this.config = {
      enableHistory: true,
      maxHistorySize: 1000,
      enableCheckpoints: true,
      maxCheckpoints: 50,
      enableValidation: false,
      ...config,
    };

    this.currentState = _.cloneDeep(initialState);
    this.setupEventListeners();
  }

  public getState(): any {
    return _.cloneDeep(this.currentState);
  }

  public setState(state: any): void {
    const previousState = _.cloneDeep(this.currentState);
    this.currentState = _.cloneDeep(state);

    // Create patches representing the complete state change
    const patches = this.generatePatches(previousState, this.currentState);

    if (patches.length > 0) {
      this.stateStore.applyPatches(patches);
      this.notifySubscribers(patches);
      this.emit('stateChanged', {
        previousState,
        newState: this.currentState,
        patches,
      });
    }
  }

  public patchState(patches: IStatePatch[]): void {
    if (patches.length === 0) return;

    const previousState = _.cloneDeep(this.currentState);

    // Validate patches if validation is enabled
    if (this.config.enableValidation) {
      this.validatePatches(patches);
    }

    // Apply patches to current state
    patches.forEach(patch => {
      this.applyPatch(patch);
    });

    // Store in state store
    this.stateStore.applyPatches(patches);

    // Notify subscribers
    this.notifySubscribers(patches);

    this.emit('statePatched', {
      previousState,
      newState: this.currentState,
      patches,
    });
  }

  public subscribeToPath(
    path: string,
    callback: (value: any, previousValue: any) => void,
    options?: {
      immediate?: boolean;
      deep?: boolean;
    }
  ): () => void {
    const subscriptionId = `sub_${++this.subscriptionCounter}`;

    const subscription: StateSubscription = {
      id: subscriptionId,
      path,
      callback,
      options,
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Call immediately if requested
    if (options?.immediate) {
      const currentValue = this.getValueAtPath(path);
      callback(currentValue, undefined);
    }

    this.emit('subscriptionAdded', { id: subscriptionId, path });

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(subscriptionId);
      this.emit('subscriptionRemoved', { id: subscriptionId, path });
    };
  }

  public createCheckpoint(id: string): void {
    if (!this.config.enableCheckpoints) {
      throw new Error('Checkpoints are disabled');
    }

    this.stateStore.createSnapshot(id);
    this.emit('checkpointCreated', { id, state: this.currentState });
  }

  public restoreCheckpoint(id: string): void {
    if (!this.config.enableCheckpoints) {
      throw new Error('Checkpoints are disabled');
    }

    const previousState = _.cloneDeep(this.currentState);

    this.stateStore.restoreSnapshot(id);

    // Reload current state from store
    this.currentState = this.stateStore.getCurrentState();

    this.emit('checkpointRestored', {
      id,
      previousState,
      restoredState: this.currentState,
    });

    // Notify all subscribers of the state change
    this.notifyAllSubscribers(previousState, this.currentState);
  }

  public getValueAtPath(path: string): any {
    return this.jsonPathProcessor.getValue(this.currentState, path);
  }

  public setValueAtPath(path: string, value: any): void {
    const patch: IStatePatch = {
      op: 'replace',
      path,
      value,
    };

    this.patchState([patch]);
  }

  public deleteValueAtPath(path: string): void {
    const patch: IStatePatch = {
      op: 'remove',
      path,
    };

    this.patchState([patch]);
  }

  public mergeAtPath(path: string, value: any): void {
    const currentValue = this.getValueAtPath(path);

    let mergedValue: any;
    if (_.isObject(currentValue) && _.isObject(value)) {
      mergedValue = _.merge({}, currentValue, value);
    } else if (_.isArray(currentValue) && _.isArray(value)) {
      mergedValue = [...currentValue, ...value];
    } else {
      mergedValue = value;
    }

    this.setValueAtPath(path, mergedValue);
  }

  public getHistory(): any[] {
    if (!this.config.enableHistory) {
      return [];
    }

    return this.stateStore.getHistory();
  }

  public getCheckpoints(): string[] {
    // This would be implemented by the state store
    // For now, return empty array
    return [];
  }

  public validateState(_state?: any): { valid: boolean; errors: string[] } {
    if (!this.config.enableValidation || !this.config.schema) {
      return { valid: true, errors: [] };
    }

    // Basic validation - in practice, you'd use a proper schema validator
    const errors: string[] = [];

    // Add your validation logic here

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  public getSubscriptions(): Array<{ id: string; path: string }> {
    return Array.from(this.subscriptions.values()).map(sub => ({
      id: sub.id,
      path: sub.path,
    }));
  }

  public clearSubscriptions(): void {
    this.subscriptions.clear();
    this.emit('allSubscriptionsCleared');
  }

  public exportState(): {
    state: any;
    metadata: {
      timestamp: number;
      version: string;
      checksum: string;
    };
  } {
    const state = this.getState();
    const stateString = JSON.stringify(state);

    return {
      state,
      metadata: {
        timestamp: Date.now(),
        version: '1.0.0',
        checksum: this.generateChecksum(stateString),
      },
    };
  }

  public importState(
    stateData: {
      state: any;
      metadata?: {
        timestamp: number;
        version: string;
        checksum: string;
      };
    },
    options?: {
      validateChecksum?: boolean;
      merge?: boolean;
    }
  ): void {
    // Validate checksum if requested
    if (options?.validateChecksum && stateData.metadata) {
      const stateString = JSON.stringify(stateData.state);
      const computedChecksum = this.generateChecksum(stateString);

      if (computedChecksum !== stateData.metadata.checksum) {
        throw new Error('State checksum validation failed');
      }
    }

    if (options?.merge) {
      const mergedState = _.merge({}, this.currentState, stateData.state);
      this.setState(mergedState);
    } else {
      this.setState(stateData.state);
    }

    this.emit('stateImported', {
      imported: stateData.state,
      metadata: stateData.metadata,
    });
  }

  private applyPatch(patch: IStatePatch): void {
    switch (patch.op) {
      case 'add':
      case 'replace':
        this.jsonPathProcessor.setValue(this.currentState, patch.path, patch.value);
        break;

      case 'remove':
        this.jsonPathProcessor.deletePath(this.currentState, patch.path);
        break;

      default:
        throw new Error(`Unknown patch operation: ${(patch as any).op}`);
    }
  }

  private generatePatches(oldState: any, newState: any, basePath: string = ''): IStatePatch[] {
    const patches: IStatePatch[] = [];

    // This is a simplified patch generation
    // In practice, you'd want a more sophisticated diff algorithm
    if (!_.isEqual(oldState, newState)) {
      patches.push({
        op: 'replace',
        path: basePath || '$',
        value: newState,
      });
    }

    return patches;
  }

  private validatePatches(patches: IStatePatch[]): void {
    patches.forEach(patch => {
      if (!patch.op || !patch.path) {
        throw new Error('Invalid patch: missing op or path');
      }

      if (!['add', 'replace', 'remove'].includes(patch.op)) {
        throw new Error(`Invalid patch operation: ${patch.op}`);
      }

      if ((patch.op === 'add' || patch.op === 'replace') && patch.value === undefined) {
        throw new Error('Patch with add/replace operation must have a value');
      }
    });
  }

  private notifySubscribers(patches: IStatePatch[]): void {
    patches.forEach(patch => {
      this.notifySubscribersForPath(patch.path, patch.value);
    });
  }

  private notifySubscribersForPath(changedPath: string, newValue: any): void {
    for (const subscription of this.subscriptions.values()) {
      if (this.pathMatches(subscription.path, changedPath)) {
        const currentValue = this.getValueAtPath(subscription.path);
        const previousValue = newValue; // This is simplified

        try {
          subscription.callback(currentValue, previousValue);
        } catch (error) {
          this.emit('subscriptionError', {
            subscriptionId: subscription.id,
            path: subscription.path,
            error,
          });
        }
      }
    }
  }

  private notifyAllSubscribers(previousState: any, newState: any): void {
    for (const subscription of this.subscriptions.values()) {
      const previousValue = this.jsonPathProcessor.getValue(previousState, subscription.path);
      const newValue = this.jsonPathProcessor.getValue(newState, subscription.path);

      if (!_.isEqual(previousValue, newValue)) {
        try {
          subscription.callback(newValue, previousValue);
        } catch (error) {
          this.emit('subscriptionError', {
            subscriptionId: subscription.id,
            path: subscription.path,
            error,
          });
        }
      }
    }
  }

  private pathMatches(subscriptionPath: string, changedPath: string): boolean {
    // Simple path matching - in practice, you'd want more sophisticated matching
    return changedPath.startsWith(subscriptionPath) || subscriptionPath.startsWith(changedPath);
  }

  private generateChecksum(data: string): string {
    // Simple checksum - in practice, you'd use a proper hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private setupEventListeners(): void {
    // Set up any internal event listeners
    this.on('stateChanged', () => {
      if (
        this.config.enableHistory &&
        this.stateStore.getHistory().length > this.config.maxHistorySize!
      ) {
        // Trim history if it gets too large
        // This would be implemented by the state store
      }
    });
  }

  public destroy(): void {
    this.clearSubscriptions();
    this.removeAllListeners();
  }
}
