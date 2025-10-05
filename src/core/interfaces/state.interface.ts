export interface IStateManager {
  getState(): any;
  setState(state: any): void;
  patchState(patches: IStatePatch[]): void;
  subscribeToPath(path: string, callback: (value: any) => void): () => void;
  createCheckpoint(id: string): void;
  restoreCheckpoint(id: string): void;
}

export interface IStatePatch {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: any;
}

export interface IStateStore {
  getCurrentState(): any;
  applyPatches(patches: IStatePatch[]): void;
  getHistory(): IStateEvent[];
  createSnapshot(id: string): void;
  restoreSnapshot(id: string): void;
}

export interface IStateEvent {
  id: string;
  timestamp: number;
  patches: IStatePatch[];
  metadata?: any;
}

export interface IStateObserver {
  subscribe(path: string, callback: (value: any, previousValue: any) => void): string;
  unsubscribe(subscriptionId: string): void;
  notifyChange(path: string, newValue: any, oldValue: any): void;
}
