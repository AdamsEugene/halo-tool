/**
 * Halo State Management Plugin - Browser Version
 *
 * Browser-compatible version without Node.js dependencies
 */

// Simple EventEmitter implementation for browser
class SimpleEventEmitter {
  private events: Record<string, Array<(...args: unknown[]) => void>> = {};

  on(event: string, callback: (...args: unknown[]) => void): this {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    if (!this.events[event]) return false;
    this.events[event].forEach(callback => callback(...args));
    return true;
  }

  removeAllListeners(): this {
    this.events = {};
    return this;
  }
}

// Simple JSONPath processor for browser
class SimpleJSONPathProcessor {
  getValue(obj: unknown, path: string): unknown {
    if (path.startsWith('$.')) {
      path = path.substring(2);
    }
    return path
      .split('.')
      .reduce(
        (current: unknown, key) =>
          current && typeof current === 'object' && current !== null
            ? (current as Record<string, unknown>)[key]
            : undefined,
        obj
      );
  }

  setValue(obj: unknown, path: string, value: unknown): boolean {
    if (path.startsWith('$.')) {
      path = path.substring(2);
    }
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce(
      (current: Record<string, unknown>, key) => {
        if (!current[key] || typeof current[key] !== 'object') current[key] = {};
        return current[key] as Record<string, unknown>;
      },
      obj as Record<string, unknown>
    );

    if (lastKey) {
      target[lastKey] = value;
      return true;
    }
    return false;
  }
}

// ========================= INTERFACES =========================

export interface HaloStateConfig {
  enableEventSourcing?: boolean;
  enableCheckpoints?: boolean;
  enableValidation?: boolean;
  enableDependencyTracking?: boolean;
  maxEventLogSize?: number;
  maxCheckpoints?: number;
  debugMode?: boolean;
}

export interface StateEvent {
  id: string;
  type: StateEventType;
  timestamp: number;
  path: string;
  newValue: unknown;
  oldValue?: unknown;
  metadata: {
    triggeredBy: string;
    source: string;
    toolId?: string;
    widgetId?: string;
  };
}

export interface StateCheckpoint {
  id: string;
  timestamp: number;
  state: HaloState;
  metadata: {
    createdBy: string;
    description?: string;
  };
}

export interface FieldDefinition {
  value: unknown;
  errors: string[];
  touched: boolean;
  valid: boolean;
  dependencies?: string[];
  dependsOn?: string[];
  validators?: ValidationRule[];
}

export interface UIFieldDefinition {
  options: Array<{ id: string; name: string; value?: unknown }>;
  loading: boolean;
  error: string | null;
  lastFetched: string | null;
  dependsOn?: string;
}

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: unknown;
  message: string;
  validator?: (value: unknown) => boolean;
}

export interface HaloState {
  session: {
    treeId: string;
    userId: string;
    startedAt: string;
    currentPage: string;
    pageHistory: string[];
    navigationStack: Array<Record<string, unknown>>;
  };
  context: {
    orgId: string;
    locale: string;
    timezone: string;
    userPreferences: Record<string, unknown>;
    pricing: { rules: Array<Record<string, unknown>> };
    inventory: { facets: Array<Record<string, unknown>> };
    workflow: {
      currentStep: number;
      totalSteps: number;
      completedSteps: number[];
    };
  };
  form: Record<string, FieldDefinition>;
  ui: Record<string, UIFieldDefinition> & {
    modals: { active: Array<Record<string, unknown>>; history: Array<Record<string, unknown>> };
    notifications: {
      active: Array<Record<string, unknown>>;
      history: Array<Record<string, unknown>>;
    };
    widgets: {
      visible: string[];
      disabled: string[];
      focused: string | null;
      interacting: string | null;
    };
    page: {
      loading: boolean;
      error: string | null;
      validationErrors: string[];
      canNavigate: boolean;
    };
  };
  tools: {
    lastRun: Record<string, unknown>;
    cache: Record<string, unknown>;
    errors: Record<string, unknown>;
    metrics: {
      callCounts: Record<string, number>;
      avgLatency: Record<string, number>;
      errorRates: Record<string, number>;
      successRates: Record<string, number>;
      cacheHitRates: Record<string, number>;
    };
    circuitBreakers: Record<string, unknown>;
    rateLimits: Record<string, unknown>;
    pendingRequests: Record<string, unknown>;
  };
  _events: {
    log: StateEvent[];
    checkpoints: Record<string, StateCheckpoint>;
    currentCheckpoint: string | null;
  };
  _meta: {
    version: string;
    lastUpdated: string;
    validation: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
    performance: {
      stateSize: number;
      updateCount: number;
      lastUpdateDuration: number;
    };
    debug: {
      enabled: boolean;
      traceUpdates: boolean;
      logLevel: 'debug' | 'info' | 'warn' | 'error';
    };
  };
}

export type StateEventType =
  | 'form-update'
  | 'ui-update'
  | 'validation-update'
  | 'dependency-trigger'
  | 'checkpoint-created'
  | 'checkpoint-restored'
  | 'state-initialized'
  | 'state-update'
  | 'path-update'
  | 'page-navigation';

// ========================= MAIN PLUGIN CLASS =========================

export class HaloStatePlugin extends SimpleEventEmitter {
  private state: HaloState;
  private config: HaloStateConfig;
  private jsonPathProcessor: SimpleJSONPathProcessor;
  private dependencyGraph: Map<string, string[]> = new Map();
  private validationRules: Map<string, ValidationRule[]> = new Map();

  constructor(config: HaloStateConfig = {}) {
    super();

    this.config = {
      enableEventSourcing: true,
      enableCheckpoints: true,
      enableValidation: true,
      enableDependencyTracking: true,
      maxEventLogSize: 1000,
      maxCheckpoints: 10,
      debugMode: false,
      ...config,
    };

    this.jsonPathProcessor = new SimpleJSONPathProcessor();
    this.state = this.createInitialState();

    this.setupEventListeners();
    this.logEvent('state-initialized', '_root', this.state);
  }

  // ========================= CORE STATE METHODS =========================

  public getState(): HaloState {
    // Create a deep copy while handling circular references
    const stateCopy = JSON.parse(
      JSON.stringify(this.state, (key, value) => {
        // Handle circular references in event log
        if (key === 'newValue' || key === 'oldValue') {
          if (typeof value === 'object' && value !== null && value._events) {
            // If the value is a state object, return a simplified version
            return '[StateObject]';
          }
        }
        return value;
      })
    );
    return stateCopy;
  }

  public setState(newState: Partial<HaloState>): void {
    const oldState = this.getState();
    this.state = { ...this.state, ...newState };

    // Update metadata
    this.updateMetadata();

    // Log state change
    if (this.config.enableEventSourcing) {
      this.logEvent('state-update', '_root', newState, oldState);
    }

    this.emit('stateChanged', this.state, oldState);
  }

  public getValueByPath(path: string): unknown {
    return this.jsonPathProcessor.getValue(this.state, path);
  }

  public setValueByPath(path: string, value: unknown, metadata?: Record<string, unknown>): void {
    const oldValue = this.getValueByPath(path);
    const success = this.jsonPathProcessor.setValue(this.state, path, value);

    if (success) {
      this.updateMetadata();

      if (this.config.enableEventSourcing) {
        this.logEvent('path-update', path, value, oldValue, metadata);
      }

      this.emit('pathChanged', path, value, oldValue);
    }
  }

  // ========================= FORM MANAGEMENT =========================

  public updateFormField(
    fieldName: string,
    value: unknown,
    options: {
      triggerValidation?: boolean;
      triggerDependencies?: boolean;
      metadata?: Record<string, unknown>;
    } = {}
  ): void {
    const { triggerValidation = true, triggerDependencies = true, metadata } = options;

    // Ensure field exists
    if (!this.state.form[fieldName]) {
      this.state.form[fieldName] = {
        value: null,
        errors: [],
        touched: false,
        valid: false,
      };
    }

    const oldValue = this.state.form[fieldName].value;

    // Update field
    this.state.form[fieldName].value = value;
    this.state.form[fieldName].touched = true;

    // Validate if requested
    if (triggerValidation) {
      this.validateField(fieldName);
    }

    // Log event
    if (this.config.enableEventSourcing) {
      this.logEvent('form-update', `form.${fieldName}.value`, value, oldValue, metadata);
    }

    // Handle dependencies
    if (triggerDependencies && this.config.enableDependencyTracking) {
      this.processDependencies(fieldName, value);
    }

    this.updateMetadata();
    this.emit('formFieldChanged', fieldName, value, oldValue);
  }

  public updateUIField(
    fieldName: string,
    updates: Partial<UIFieldDefinition>,
    metadata?: Record<string, unknown>
  ): void {
    // Ensure field exists
    if (!this.state.ui[fieldName]) {
      this.state.ui[fieldName] = {
        options: [],
        loading: false,
        error: null,
        lastFetched: null,
      };
    }

    const oldValue = { ...this.state.ui[fieldName] };

    // Update field
    Object.assign(this.state.ui[fieldName], updates);

    // Set lastFetched if options were updated
    if (updates.options) {
      this.state.ui[fieldName].lastFetched = new Date().toISOString();
    }

    // Log event
    if (this.config.enableEventSourcing) {
      this.logEvent('ui-update', `ui.${fieldName}`, updates, oldValue, metadata);
    }

    this.updateMetadata();
    this.emit('uiFieldChanged', fieldName, this.state.ui[fieldName], oldValue);
  }

  // ========================= DEPENDENCY MANAGEMENT =========================

  public registerDependency(parentField: string, dependentFields: string[]): void {
    this.dependencyGraph.set(parentField, dependentFields);

    // Update form field definition
    if (this.state.form[parentField]) {
      this.state.form[parentField].dependencies = dependentFields;
    }

    // Update dependent fields
    dependentFields.forEach(depField => {
      if (this.state.form[depField]) {
        this.state.form[depField].dependsOn = this.state.form[depField].dependsOn || [];
        if (
          this.state.form[depField].dependsOn &&
          !this.state.form[depField].dependsOn.includes(parentField)
        ) {
          this.state.form[depField].dependsOn.push(parentField);
        }
      }

      if (this.state.ui[depField]) {
        this.state.ui[depField].dependsOn = parentField;
      }
    });

    this.emit('dependencyRegistered', parentField, dependentFields);
  }

  private processDependencies(changedField: string, newValue: unknown): void {
    const dependentFields = this.dependencyGraph.get(changedField);

    if (!dependentFields || dependentFields.length === 0) {
      return;
    }

    this.logEvent('dependency-trigger', `dependencies.${changedField}`, dependentFields, null, {
      triggeredBy: changedField,
      newValue,
    });

    dependentFields.forEach(depField => {
      // Clear dependent form field
      if (this.state.form[depField]) {
        this.state.form[depField].value = null;
        this.state.form[depField].touched = false;
        this.state.form[depField].valid = false;
        this.state.form[depField].errors = [];
      }

      // Clear dependent UI field
      if (this.state.ui[depField]) {
        this.state.ui[depField].options = [];
        this.state.ui[depField].loading = false;
        this.state.ui[depField].error = null;
      }

      this.emit('dependentFieldCleared', depField, changedField, newValue);
    });
  }

  // ========================= VALIDATION =========================

  public registerValidationRules(fieldName: string, rules: ValidationRule[]): void {
    this.validationRules.set(fieldName, rules);
  }

  public validateField(fieldName: string): boolean {
    if (!this.config.enableValidation || !this.state.form[fieldName]) {
      return true;
    }

    const field = this.state.form[fieldName];
    const rules = this.validationRules.get(fieldName) || [];
    const errors: string[] = [];

    // Run validation rules
    for (const rule of rules) {
      const isValid = this.executeValidationRule(field.value, rule);
      if (!isValid) {
        errors.push(rule.message);
      }
    }

    // Update field validation state
    field.errors = errors;
    field.valid = errors.length === 0;

    // Log validation event
    if (this.config.enableEventSourcing) {
      this.logEvent('validation-update', `form.${fieldName}.validation`, {
        valid: field.valid,
        errors,
      });
    }

    this.emit('fieldValidated', fieldName, field.valid, errors);
    return field.valid;
  }

  public validateForm(): { isValid: boolean; errors: string[] } {
    const allErrors: string[] = [];
    let isValid = true;

    // Validate all form fields
    Object.keys(this.state.form).forEach(fieldName => {
      const fieldValid = this.validateField(fieldName);
      if (!fieldValid) {
        isValid = false;
        allErrors.push(...this.state.form[fieldName].errors);
      }
    });

    // Update global validation state
    this.state._meta.validation.isValid = isValid;
    this.state._meta.validation.errors = allErrors;
    this.state.ui.page.validationErrors = allErrors;
    this.state.ui.page.canNavigate = isValid;

    this.emit('formValidated', isValid, allErrors);
    return { isValid, errors: allErrors };
  }

  private executeValidationRule(value: unknown, rule: ValidationRule): boolean {
    switch (rule.type) {
      case 'required':
        return value !== null && value !== undefined && value !== '';

      case 'minLength':
        return (
          typeof value === 'string' &&
          value.length >= (typeof rule.value === 'number' ? rule.value : 0)
        );

      case 'maxLength':
        return (
          typeof value === 'string' &&
          value.length <= (typeof rule.value === 'number' ? rule.value : Infinity)
        );

      case 'pattern':
        return (
          typeof value === 'string' &&
          typeof rule.value === 'string' &&
          new RegExp(rule.value).test(value)
        );

      case 'custom':
        return rule.validator ? rule.validator(value) : true;

      default:
        return true;
    }
  }

  // ========================= CHECKPOINTS & EVENT SOURCING =========================

  public createCheckpoint(id: string, description?: string): void {
    if (!this.config.enableCheckpoints) return;

    const checkpoint: StateCheckpoint = {
      id,
      timestamp: Date.now(),
      state: this.getState(),
      metadata: {
        createdBy: 'system',
        description,
      },
    };

    this.state._events.checkpoints[id] = checkpoint;
    this.state._events.currentCheckpoint = id;

    // Limit number of checkpoints
    const checkpointIds = Object.keys(this.state._events.checkpoints);
    if (this.config.maxCheckpoints && checkpointIds.length > this.config.maxCheckpoints) {
      const oldestId = checkpointIds.sort(
        (a, b) =>
          this.state._events.checkpoints[a].timestamp - this.state._events.checkpoints[b].timestamp
      )[0];
      delete this.state._events.checkpoints[oldestId];
    }

    this.logEvent('checkpoint-created', `checkpoints.${id}`, checkpoint);
    this.emit('checkpointCreated', id, checkpoint);
  }

  public restoreCheckpoint(id: string): boolean {
    if (!this.config.enableCheckpoints || !this.state._events.checkpoints[id]) {
      return false;
    }

    const checkpoint = this.state._events.checkpoints[id];
    const oldState = this.getState();

    this.state = { ...checkpoint.state };
    this.state._events.currentCheckpoint = id;

    this.logEvent('checkpoint-restored', `checkpoints.${id}`, checkpoint, oldState);
    this.emit('checkpointRestored', id, checkpoint, oldState);
    this.emit('stateChanged', this.state, oldState);

    return true;
  }

  private logEvent(
    type: StateEventType,
    path: string,
    newValue: unknown,
    oldValue?: unknown,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.config.enableEventSourcing) return;

    const event: StateEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      timestamp: Date.now(),
      path,
      newValue,
      oldValue,
      metadata: {
        triggeredBy: 'system',
        source: 'halo-state-plugin',
        ...metadata,
      },
    };

    this.state._events.log.push(event);

    // Limit event log size
    if (
      this.config.maxEventLogSize &&
      this.state._events.log.length > this.config.maxEventLogSize
    ) {
      this.state._events.log = this.state._events.log.slice(-this.config.maxEventLogSize);
    }

    this.emit('eventLogged', event);
  }

  // ========================= LIFECYCLE METHODS =========================

  public onTreeLaunch(): void {
    this.state.session.startedAt = new Date().toISOString();
    this.state.context.workflow.currentStep = 1;
    this.createCheckpoint('tree-launch', 'Decision tree launched');
    this.emit('treeLaunched', this.state);
  }

  public onPageEnter(pageId: string): void {
    this.state.session.currentPage = pageId;
    this.state.session.pageHistory.push(pageId);
    this.state.ui.page.loading = false;

    this.logEvent('page-navigation', 'session.currentPage', pageId);
    this.emit('pageEntered', pageId);
  }

  public onPageExit(): boolean {
    const validation = this.validateForm();

    if (!validation.isValid) {
      this.state.ui.page.validationErrors = validation.errors;
      this.emit('pageExitBlocked', validation.errors);
      return false;
    }

    this.state.context.workflow.completedSteps.push(this.state.context.workflow.currentStep);
    this.emit('pageExited', this.state.session.currentPage);
    return true;
  }

  public onTreeComplete(): void {
    this.state.context.workflow.currentStep = this.state.context.workflow.totalSteps;
    this.state.context.workflow.completedSteps = Array.from(
      { length: this.state.context.workflow.totalSteps },
      (_, i) => i + 1
    );

    this.createCheckpoint('tree-complete', 'Decision tree completed');
    this.emit('treeCompleted', this.state);
  }

  // ========================= UTILITY METHODS =========================

  private createInitialState(): HaloState {
    return {
      session: {
        treeId: `tree_${Date.now()}`,
        userId: 'anonymous',
        startedAt: new Date().toISOString(),
        currentPage: 'initial',
        pageHistory: ['initial'],
        navigationStack: [],
      },
      context: {
        orgId: 'default',
        locale: 'en-US',
        timezone:
          typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
        userPreferences: {},
        pricing: { rules: [] },
        inventory: { facets: [] },
        workflow: {
          currentStep: 1,
          totalSteps: 3,
          completedSteps: [],
        },
      },
      form: {},
      ui: {
        modals: { active: [], history: [] },
        notifications: { active: [], history: [] },
        widgets: {
          visible: [],
          disabled: [],
          focused: null,
          interacting: null,
        },
        page: {
          loading: false,
          error: null,
          validationErrors: [],
          canNavigate: true,
        },
      } as unknown as Record<string, UIFieldDefinition> & {
        modals: { active: Array<Record<string, unknown>>; history: Array<Record<string, unknown>> };
        notifications: {
          active: Array<Record<string, unknown>>;
          history: Array<Record<string, unknown>>;
        };
        widgets: {
          visible: string[];
          disabled: string[];
          focused: string | null;
          interacting: string | null;
        };
        page: {
          loading: boolean;
          error: string | null;
          validationErrors: string[];
          canNavigate: boolean;
        };
      },
      tools: {
        lastRun: {},
        cache: {},
        errors: {},
        metrics: {
          callCounts: {},
          avgLatency: {},
          errorRates: {},
          successRates: {},
          cacheHitRates: {},
        },
        circuitBreakers: {},
        rateLimits: {},
        pendingRequests: {},
      },
      _events: {
        log: [],
        checkpoints: {},
        currentCheckpoint: null,
      },
      _meta: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        validation: {
          isValid: false,
          errors: [],
          warnings: [],
        },
        performance: {
          stateSize: 0,
          updateCount: 0,
          lastUpdateDuration: 0,
        },
        debug: {
          enabled: this.config.debugMode || false,
          traceUpdates: true,
          logLevel: 'info',
        },
      },
    };
  }

  private updateMetadata(): void {
    this.state._meta.lastUpdated = new Date().toISOString();
    this.state._meta.performance.updateCount++;
    this.state._meta.performance.stateSize = JSON.stringify(this.state).length;
  }

  private setupEventListeners(): void {
    // Set up internal event handling if needed
    this.on('formFieldChanged', (...args: unknown[]) => {
      const [fieldName, value] = args as [string, unknown];
      if (this.config.debugMode) {
        // eslint-disable-next-line no-console
        console.log(`[HaloState] Form field changed: ${fieldName} = ${JSON.stringify(value)}`);
      }
    });

    this.on('dependentFieldCleared', (...args: unknown[]) => {
      const [depField, parentField, parentValue] = args as [string, string, unknown];
      if (this.config.debugMode) {
        // eslint-disable-next-line no-console
        console.log(
          `[HaloState] Dependent field cleared: ${depField} (parent: ${parentField} = ${JSON.stringify(parentValue)})`
        );
      }
    });
  }

  // ========================= PUBLIC API =========================

  public getEventLog(): StateEvent[] {
    return [...this.state._events.log];
  }

  public getCheckpoints(): Record<string, StateCheckpoint> {
    return { ...this.state._events.checkpoints };
  }

  public getValidationState(): { isValid: boolean; errors: string[] } {
    return {
      isValid: this.state._meta.validation.isValid,
      errors: [...this.state._meta.validation.errors],
    };
  }

  public getDependencyGraph(): Map<string, string[]> {
    return new Map(this.dependencyGraph);
  }

  public getPerformanceMetrics(): Record<string, unknown> {
    return { ...this.state._meta.performance };
  }

  public destroy(): void {
    this.removeAllListeners();
    this.dependencyGraph.clear();
    this.validationRules.clear();
  }
}

// ========================= FACTORY FUNCTION =========================

export function createHaloStatePlugin(config?: HaloStateConfig): HaloStatePlugin {
  return new HaloStatePlugin(config);
}

// Global export for browser
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).HaloStatePlugin = HaloStatePlugin;
  (window as unknown as Record<string, unknown>).createHaloStatePlugin = createHaloStatePlugin;
}

export default HaloStatePlugin;
