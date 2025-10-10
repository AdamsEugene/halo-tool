# 🔄 Halo State Management Plugin

A comprehensive state management solution designed specifically for the Halo Tools System, providing event-sourced state management, validation, dependency tracking, and lifecycle management.

## 🚀 Quick Start

### Browser Usage

```html
<!-- Include the built state plugin -->
<script src="./dist/state/halo-state-plugin.browser.js"></script>

<script>
  // Create and configure the state plugin
  const statePlugin = createHaloStatePlugin({
    enableEventSourcing: true,
    enableCheckpoints: true,
    enableValidation: true,
    enableDependencyTracking: true,
    debugMode: true,
    maxEventLogSize: 500,
    maxCheckpoints: 5
  });

  // Use with HaloTool
  haloTool.getState = () => statePlugin.getState();
  haloTool.setState = (state) => statePlugin.setState(state);

  // Listen to state changes
  statePlugin.on('stateChanged', (newState, oldState) => {
    console.log('State updated:', newState);
  });
</script>
```

### Node.js Usage

```javascript
const { createHaloStatePlugin } = require('./dist/state/halo-state-plugin.js');

// Create state plugin
const statePlugin = createHaloStatePlugin({
  enableEventSourcing: true,
  enableValidation: true,
  debugMode: false
});

// Update form fields with validation and dependencies
statePlugin.updateFormField('make', 'Toyota', {
  triggerValidation: true,
  triggerDependencies: true
});

// Register dependencies
statePlugin.registerDependency('make', ['model']);

// Create checkpoints for rollback
statePlugin.createCheckpoint('user-selection', 'User made initial selection');
```

## 🎯 Features

### ✅ **Event Sourcing**
- Complete audit trail of all state changes
- Event replay and debugging capabilities
- Configurable event log size limits

### ✅ **State Management**
- Structured state with session, context, form, ui, tools, and metadata
- JSONPath-based value access and updates
- Deep state updates with change detection

### ✅ **Form Management**
- Field-level validation with multiple rule types
- Touch tracking and error management
- Dependency cascade updates

### ✅ **UI State Management**
- Widget option management
- Loading states and error handling
- Modal and notification tracking

### ✅ **Dependency Tracking**
- Parent-child field relationships
- Automatic dependent field clearing
- Cascade update processing

### ✅ **Validation System**
- Built-in validation rules (required, minLength, maxLength, pattern, custom)
- Field-level and form-level validation
- Custom validator functions

### ✅ **Checkpoint System**
- Create named state snapshots
- Restore to previous states
- Configurable checkpoint limits

### ✅ **Lifecycle Events**
- onTreeLaunch, onPageEnter, onPageExit, onTreeComplete
- Event-driven state transitions
- Navigation flow control

## 📊 State Structure

The plugin manages a comprehensive state structure:

```typescript
interface HaloState {
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
    notifications: { active: Array<Record<string, unknown>>; history: Array<Record<string, unknown>> };
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
    metrics: Record<string, unknown>;
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
    validation: { isValid: boolean; errors: string[]; warnings: string[] };
    performance: { stateSize: number; updateCount: number; lastUpdateDuration: number };
    debug: { enabled: boolean; traceUpdates: boolean; logLevel: string };
  };
}
```

## 🔧 Configuration Options

```typescript
interface HaloStateConfig {
  enableEventSourcing?: boolean;     // Default: true
  enableCheckpoints?: boolean;       // Default: true
  enableValidation?: boolean;        // Default: true
  enableDependencyTracking?: boolean; // Default: true
  maxEventLogSize?: number;          // Default: 1000
  maxCheckpoints?: number;           // Default: 10
  debugMode?: boolean;               // Default: false
}
```

## 📚 API Reference

### Core Methods

- `getState()`: Get the current state
- `setState(state)`: Update the entire state
- `getValueByPath(path)`: Get value using JSONPath
- `setValueByPath(path, value, metadata?)`: Set value using JSONPath

### Form Management

- `updateFormField(fieldName, value, options?)`: Update form field with validation
- `validateField(fieldName)`: Validate a specific field
- `validateForm()`: Validate entire form

### UI Management

- `updateUIField(fieldName, updates, metadata?)`: Update UI field state

### Dependencies

- `registerDependency(parentField, dependentFields)`: Register field dependencies

### Validation

- `registerValidationRules(fieldName, rules)`: Register validation rules for a field

### Checkpoints

- `createCheckpoint(id, description?)`: Create a state checkpoint
- `restoreCheckpoint(id)`: Restore to a checkpoint

### Lifecycle

- `onTreeLaunch()`: Initialize tree launch
- `onPageEnter(pageId)`: Handle page entry
- `onPageExit()`: Handle page exit (returns boolean for navigation control)
- `onTreeComplete()`: Handle tree completion

### Events

The plugin emits various events:

- `stateChanged`: When state is updated
- `formFieldChanged`: When a form field changes
- `dependentFieldCleared`: When dependent fields are cleared
- `fieldValidated`: When field validation occurs
- `eventLogged`: When an event is logged
- `checkpointCreated`: When a checkpoint is created
- `checkpointRestored`: When a checkpoint is restored

## 🏗️ Build System

The state plugin uses Rollup for building:

```bash
# Build state plugin
npm run build:state-plugin

# Build with production optimizations
npm run build:state-plugin:prod

# Build all plugins
npm run build:all
```

Generated files:
- `dist/state/halo-state-plugin.browser.js` - UMD bundle for browser
- `dist/state/halo-state-plugin.browser.esm.js` - ES Module for modern browsers
- `dist/state/halo-state-plugin.js` - CommonJS for Node.js
- `dist/state/halo-state-plugin.esm.js` - ES Module for Node.js

## 🧪 Testing

The plugin includes comprehensive error handling for circular references and safe serialization of complex objects, ensuring reliable operation in all environments.

## 📄 License

MIT License - see the main project LICENSE file for details.
