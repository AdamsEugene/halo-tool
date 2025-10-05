import { EventEmitter } from 'eventemitter3';
import * as _ from 'lodash';
import { IStateEvent, IStatePatch, IStateStore } from '../core/interfaces';

export interface StateSnapshot {
  id: string;
  state: any;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface StateStoreConfig {
  enablePersistence?: boolean;
  persistenceKey?: string;
  maxHistorySize?: number;
  maxSnapshotSize?: number;
  enableCompression?: boolean;
}

export class StateStore extends EventEmitter implements IStateStore {
  private currentState: any = {};
  private history: IStateEvent[] = [];
  private snapshots: Map<string, StateSnapshot> = new Map();
  private config: StateStoreConfig;
  private eventCounter = 0;

  constructor(initialState: any = {}, config: StateStoreConfig = {}) {
    super();

    this.config = {
      enablePersistence: false,
      persistenceKey: 'halo_state_store',
      maxHistorySize: 1000,
      maxSnapshotSize: 50,
      enableCompression: false,
      ...config,
    };

    this.currentState = _.cloneDeep(initialState);

    // Load persisted state if enabled
    if (this.config.enablePersistence) {
      this.loadPersistedState();
    }
  }

  public getCurrentState(): any {
    return _.cloneDeep(this.currentState);
  }

  public applyPatches(patches: IStatePatch[]): void {
    if (patches.length === 0) return;

    const previousState = _.cloneDeep(this.currentState);
    const eventId = this.generateEventId();

    // Apply patches to current state
    patches.forEach(patch => {
      this.applyPatch(patch);
    });

    // Create state event
    const stateEvent: IStateEvent = {
      id: eventId,
      timestamp: Date.now(),
      patches,
      metadata: {
        previousStateChecksum: this.generateChecksum(previousState),
        newStateChecksum: this.generateChecksum(this.currentState),
      },
    };

    // Add to history
    this.addToHistory(stateEvent);

    // Persist if enabled
    if (this.config.enablePersistence) {
      this.persistState();
    }

    this.emit('patchesApplied', {
      eventId,
      patches,
      previousState,
      newState: this.currentState,
    });
  }

  public getHistory(): IStateEvent[] {
    return [...this.history];
  }

  public createSnapshot(id: string, metadata?: Record<string, any>): void {
    const snapshot: StateSnapshot = {
      id,
      state: _.cloneDeep(this.currentState),
      timestamp: Date.now(),
      metadata,
    };

    this.snapshots.set(id, snapshot);

    // Limit snapshot count
    if (this.snapshots.size > this.config.maxSnapshotSize!) {
      const oldestSnapshot = Array.from(this.snapshots.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp
      )[0];

      this.snapshots.delete(oldestSnapshot[0]);
      this.emit('snapshotEvicted', { id: oldestSnapshot[0] });
    }

    this.emit('snapshotCreated', { id, timestamp: snapshot.timestamp });
  }

  public restoreSnapshot(id: string): void {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${id}`);
    }

    const previousState = _.cloneDeep(this.currentState);
    this.currentState = _.cloneDeep(snapshot.state);

    // Create restore event
    const restoreEvent: IStateEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      patches: [
        {
          op: 'replace',
          path: '$',
          value: this.currentState,
        },
      ],
      metadata: {
        type: 'snapshot_restore',
        snapshotId: id,
        snapshotTimestamp: snapshot.timestamp,
      },
    };

    this.addToHistory(restoreEvent);

    if (this.config.enablePersistence) {
      this.persistState();
    }

    this.emit('snapshotRestored', {
      id,
      previousState,
      restoredState: this.currentState,
    });
  }

  public getSnapshot(id: string): StateSnapshot | undefined {
    return this.snapshots.get(id);
  }

  public listSnapshots(): Array<{ id: string; timestamp: number; metadata?: Record<string, any> }> {
    return Array.from(this.snapshots.values()).map(snapshot => ({
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      metadata: snapshot.metadata,
    }));
  }

  public deleteSnapshot(id: string): boolean {
    const deleted = this.snapshots.delete(id);
    if (deleted) {
      this.emit('snapshotDeleted', { id });
    }
    return deleted;
  }

  public replayFromEvent(eventId: string): void {
    const eventIndex = this.history.findIndex(event => event.id === eventId);
    if (eventIndex === -1) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // Find the closest snapshot before this event
    const baseState = {};
    const replayFromIndex = 0;

    // For simplicity, replay from the beginning
    // In practice, you'd find the closest snapshot
    this.currentState = baseState;

    // Replay events from the base point
    for (let i = replayFromIndex; i <= eventIndex; i++) {
      const event = this.history[i];
      event.patches.forEach(patch => {
        this.applyPatch(patch);
      });
    }

    if (this.config.enablePersistence) {
      this.persistState();
    }

    this.emit('stateReplayed', {
      fromEventId: eventId,
      replayedEvents: eventIndex - replayFromIndex + 1,
    });
  }

  public getEventById(eventId: string): IStateEvent | undefined {
    return this.history.find(event => event.id === eventId);
  }

  public getEventsByTimeRange(startTime: number, endTime: number): IStateEvent[] {
    return this.history.filter(event => event.timestamp >= startTime && event.timestamp <= endTime);
  }

  public getEventsByPatchPath(path: string): IStateEvent[] {
    return this.history.filter(event => event.patches.some(patch => patch.path === path));
  }

  public compactHistory(keepLastN: number = 100): void {
    if (this.history.length <= keepLastN) {
      return;
    }

    const eventsToRemove = this.history.length - keepLastN;
    const removedEvents = this.history.splice(0, eventsToRemove);

    this.emit('historyCompacted', {
      removedCount: removedEvents.length,
      remainingCount: this.history.length,
    });
  }

  public exportState(): {
    currentState: any;
    history: IStateEvent[];
    snapshots: StateSnapshot[];
    metadata: {
      exportTimestamp: number;
      version: string;
      eventCount: number;
      snapshotCount: number;
    };
  } {
    return {
      currentState: this.getCurrentState(),
      history: this.getHistory(),
      snapshots: Array.from(this.snapshots.values()),
      metadata: {
        exportTimestamp: Date.now(),
        version: '1.0.0',
        eventCount: this.history.length,
        snapshotCount: this.snapshots.size,
      },
    };
  }

  public importState(stateData: {
    currentState: any;
    history?: IStateEvent[];
    snapshots?: StateSnapshot[];
  }): void {
    this.currentState = _.cloneDeep(stateData.currentState);

    if (stateData.history) {
      this.history = [...stateData.history];
    }

    if (stateData.snapshots) {
      this.snapshots.clear();
      stateData.snapshots.forEach(snapshot => {
        this.snapshots.set(snapshot.id, snapshot);
      });
    }

    if (this.config.enablePersistence) {
      this.persistState();
    }

    this.emit('stateImported', {
      eventCount: this.history.length,
      snapshotCount: this.snapshots.size,
    });
  }

  public getStats(): {
    currentStateSize: number;
    historySize: number;
    snapshotCount: number;
    totalMemoryUsage: number;
    oldestEventAge: number;
    newestEventAge: number;
  } {
    const now = Date.now();
    const oldestEvent = this.history[0];
    const newestEvent = this.history[this.history.length - 1];

    return {
      currentStateSize: JSON.stringify(this.currentState).length,
      historySize: this.history.length,
      snapshotCount: this.snapshots.size,
      totalMemoryUsage: this.calculateMemoryUsage(),
      oldestEventAge: oldestEvent ? now - oldestEvent.timestamp : 0,
      newestEventAge: newestEvent ? now - newestEvent.timestamp : 0,
    };
  }

  private applyPatch(patch: IStatePatch): void {
    switch (patch.op) {
      case 'add':
      case 'replace':
        this.setValueAtPath(patch.path, patch.value);
        break;

      case 'remove':
        this.deleteValueAtPath(patch.path);
        break;

      default:
        throw new Error(`Unknown patch operation: ${(patch as any).op}`);
    }
  }

  private setValueAtPath(path: string, value: any): void {
    if (path === '$' || path === '') {
      this.currentState = value;
      return;
    }

    // Simple path setting - in practice, you'd use a proper JSONPath processor
    _.set(this.currentState, path.replace(/^\$\./, ''), value);
  }

  private deleteValueAtPath(path: string): void {
    if (path === '$' || path === '') {
      this.currentState = {};
      return;
    }

    _.unset(this.currentState, path.replace(/^\$\./, ''));
  }

  private addToHistory(event: IStateEvent): void {
    this.history.push(event);

    // Limit history size
    if (this.history.length > this.config.maxHistorySize!) {
      const removedEvent = this.history.shift();
      this.emit('historyEventEvicted', { eventId: removedEvent?.id });
    }
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${++this.eventCounter}`;
  }

  private generateChecksum(data: any): string {
    // Simple checksum - in practice, use a proper hash function
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private calculateMemoryUsage(): number {
    try {
      const currentStateSize = JSON.stringify(this.currentState).length;
      const historySize = JSON.stringify(this.history).length;
      const snapshotsSize = JSON.stringify(Array.from(this.snapshots.values())).length;

      return currentStateSize + historySize + snapshotsSize;
    } catch {
      return 0;
    }
  }

  private persistState(): void {
    if (typeof window === 'undefined' || !this.config.enablePersistence) {
      return;
    }

    try {
      const stateData = {
        currentState: this.currentState,
        history: this.history.slice(-100), // Keep last 100 events
        snapshots: Array.from(this.snapshots.values()),
        timestamp: Date.now(),
      };

      const serialized = JSON.stringify(stateData);
      localStorage.setItem(this.config.persistenceKey!, serialized);

      this.emit('statePersisted', { size: serialized.length });
    } catch (error) {
      this.emit('persistenceError', { error });
    }
  }

  private loadPersistedState(): void {
    if (typeof window === 'undefined' || !this.config.enablePersistence) {
      return;
    }

    try {
      const serialized = localStorage.getItem(this.config.persistenceKey!);
      if (!serialized) {
        return;
      }

      const stateData = JSON.parse(serialized);

      this.currentState = stateData.currentState || {};
      this.history = stateData.history || [];

      if (stateData.snapshots) {
        this.snapshots.clear();
        stateData.snapshots.forEach((snapshot: StateSnapshot) => {
          this.snapshots.set(snapshot.id, snapshot);
        });
      }

      this.emit('stateLoaded', {
        eventCount: this.history.length,
        snapshotCount: this.snapshots.size,
        timestamp: stateData.timestamp,
      });
    } catch (error) {
      this.emit('loadError', { error });
    }
  }

  public clear(): void {
    this.currentState = {};
    this.history = [];
    this.snapshots.clear();

    if (this.config.enablePersistence) {
      localStorage.removeItem(this.config.persistenceKey!);
    }

    this.emit('stateCleared');
  }

  public destroy(): void {
    this.clear();
    this.removeAllListeners();
  }
}
