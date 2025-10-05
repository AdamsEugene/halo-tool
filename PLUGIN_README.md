# 🔧 Halo Tools System - Plugin Architecture

A powerful, extensible tool execution framework that can be used as a plugin in any JavaScript/TypeScript application.

## 🚀 Quick Start

### Browser Usage

```html
<!-- Include the script -->
<script src="path/to/halo-tool.js"></script>

<script>
  // HaloTool is automatically available globally
  
  // Make a quick API call
  HaloTool.get('https://api.example.com/users')
    .then(result => console.log('Users:', result.data));
  
  // Update application state
  HaloTool.state.set({ currentUser: { name: 'John', role: 'admin' } });
  
  // Execute a workflow
  HaloTool.workflow(['fetchUser', 'updateProfile', 'sendNotification'])
    .then(results => console.log('Workflow completed:', results));
</script>
```

### Node.js Usage

```javascript
const HaloTool = require('halo-tool');

// Or with ES modules
import HaloTool from 'halo-tool';

async function example() {
  // Make API calls
  const userData = await HaloTool.get('https://api.example.com/user/123');
  
  // Manage state
  HaloTool.state.set({ user: userData.data });
  
  // Create and execute tools
  await HaloTool.createServerTool({
    id: 'fetchOrders',
    name: 'Fetch User Orders',
    description: 'Fetches orders for the current user',
    url: 'https://api.example.com/orders?userId={{$.user.id}}',
    method: 'GET',
    assignments: [{
      source: 'response',
      valuePath: '$.orders',
      statePath: '$.userOrders'
    }]
  });
  
  const context = {
    toolId: 'fetchOrders',
    instanceId: 'order_fetch_1',
    startTime: Date.now(),
    triggeredBy: 'manual',
    state: HaloTool.state.get()
  };
  
  const result = await HaloTool.executeTool('fetchOrders', context);
  console.log('Orders fetched:', result);
}
```

### React/Vue/Angular Integration

```javascript
import HaloTool from 'halo-tool';

// In a React component
function UserProfile() {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    // Fetch user data
    HaloTool.get('https://api.example.com/profile')
      .then(result => {
        setUser(result.data);
        HaloTool.state.set({ currentUser: result.data });
      });
  }, []);
  
  const updateProfile = async (updates) => {
    const result = await HaloTool.post('/api/profile', updates);
    if (result.success) {
      setUser(result.data);
      HaloTool.state.update('$.currentUser', result.data);
    }
  };
  
  return (
    <div>
      {user && <h1>Welcome, {user.name}!</h1>}
      {/* ... rest of component */}
    </div>
  );
}
```

## 🎯 Plugin API

### Quick Actions

```javascript
// HTTP calls
await HaloTool.get(url, statePath?)
await HaloTool.post(url, data?, statePath?)
await HaloTool.put(url, data?, statePath?)
await HaloTool.delete(url, statePath?)
await HaloTool.call(url, method, data?, statePath?)

// State management
HaloTool.state.get()
HaloTool.state.set(newState)
HaloTool.state.update(path, value)

// Workflows
await HaloTool.workflow(['tool1', 'tool2', 'tool3'], initialState?)
```

### Tool Creation

```javascript
// Server Tool (API calls)
await HaloTool.createServerTool({
  id: 'fetchUserData',
  name: 'Fetch User Data',
  description: 'Fetches user information from API',
  url: 'https://api.example.com/users/{{$.userId}}',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer {{$.auth.token}}'
  },
  assignments: [{
    source: 'response',
    valuePath: '$.user',
    statePath: '$.currentUser'
  }],
  cache: {
    ttlSec: 300,
    strategy: 'memory'
  },
  retry: {
    max: 3,
    strategy: 'exponential'
  }
});

// Client Tool (Browser actions)
await HaloTool.createClientTool({
  id: 'showNotification',
  name: 'Show Notification',
  description: 'Shows a notification to the user',
  fn: 'showNotification',
  rollback: {
    fn: 'hideNotification'
  }
});

// System Tool (State operations)
await HaloTool.createSystemTool({
  id: 'calculateTotal',
  name: 'Calculate Order Total',
  description: 'Calculates the total price of an order',
  op: 'transform',
  path: '$.order.total',
  transform: {
    type: 'javascript',
    expression: 'value.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)'
  }
});
```

### Advanced Usage

```javascript
// Direct tool execution
const context = {
  toolId: 'myTool',
  instanceId: 'execution_1',
  startTime: Date.now(),
  triggeredBy: 'manual',
  state: { /* your state */ }
};

const result = await HaloTool.executeTool('myTool', context);

// Access underlying HaloTools instance
const coreSystem = HaloTool.core;
const metrics = coreSystem.getSystemStats();

// Event handling
HaloTool.on('toolExecutionCompleted', (data) => {
  console.log('Tool completed:', data);
});

HaloTool.on('stateChanged', (data) => {
  console.log('State updated:', data);
});
```

## 🔧 Configuration

```javascript
import { createHaloToolPlugin } from 'halo-tool';

const customHaloTool = createHaloToolPlugin({
  namespace: 'MyTools',           // Global namespace (default: 'HaloTool')
  autoInit: true,                 // Auto-initialize (default: true)
  globalAccess: true,             // Add to global scope (default: true in browser)
  enableMetrics: true,            // Enable metrics collection
  enableTracing: true,            // Enable distributed tracing
  enableErrorTracking: true,      // Enable error tracking
  enableStateManagement: true,    // Enable state management
  maxTools: 1000,                 // Maximum number of tools
  retentionPeriod: 86400000       // Data retention period (24 hours)
});
```

## 🌟 Features

### ✅ **Server Tools**
- HTTP/HTTPS API calls with full configuration
- Authentication management (Bearer, Basic, API Key, OAuth2)
- Request/response transformation
- Circuit breaker pattern for resilience
- Request deduplication
- Multi-level caching (Memory, LocalStorage, SessionStorage)
- Retry strategies (Exponential, Fixed, Linear)
- Rate limiting

### ✅ **Client Tools**
- Browser DOM manipulation
- Modal management
- Element focusing and scrolling
- Value setting with rollback support
- Custom JavaScript function execution

### ✅ **System Tools**
- State operations (assign, merge, delete, transform)
- JSONPath-based data manipulation
- JSONata and JavaScript transformations
- Computed value generation

### ✅ **State Management**
- Event-sourced state updates
- JSONPath-based state access
- State subscriptions and reactivity
- Checkpointing and rollback
- State import/export

### ✅ **Resilience & Performance**
- Circuit breaker pattern
- Request deduplication
- Intelligent caching
- Retry mechanisms
- Rate limiting
- Error boundaries

### ✅ **Monitoring & Observability**
- Comprehensive metrics collection
- Distributed tracing
- Error tracking and reporting
- Performance monitoring
- Real-time dashboards

### ✅ **Developer Experience**
- TypeScript support
- Event-driven architecture
- Plugin-based extensibility
- Global API access
- Comprehensive logging

## 📊 Monitoring

```javascript
// Get system metrics
const metrics = HaloTool.metrics();
console.log('Tools executed:', metrics.length);

// Track errors
HaloTool.error(new Error('Something went wrong'));

// Monitor tool execution
HaloTool.on('toolExecutionStarted', ({ toolId }) => {
  console.log(`Started executing: ${toolId}`);
});

HaloTool.on('toolExecutionCompleted', ({ toolId, result }) => {
  console.log(`Completed: ${toolId}`, result);
});
```

## 🔌 Integration Examples

### Express.js Backend

```javascript
const express = require('express');
const HaloTool = require('halo-tool');

const app = express();

app.get('/api/user-dashboard', async (req, res) => {
  try {
    // Execute a workflow to gather dashboard data
    const results = await HaloTool.workflow([
      'fetchUserProfile',
      'fetchUserOrders', 
      'fetchRecommendations'
    ], { userId: req.user.id });
    
    res.json({
      success: true,
      data: HaloTool.state.get()
    });
  } catch (error) {
    HaloTool.error(error);
    res.status(500).json({ error: error.message });
  }
});
```

### Next.js API Route

```javascript
// pages/api/process-order.js
import HaloTool from 'halo-tool';

export default async function handler(req, res) {
  const { orderId } = req.body;
  
  // Set initial state
  HaloTool.state.set({ orderId, status: 'processing' });
  
  // Execute order processing workflow
  const results = await HaloTool.workflow([
    'validateOrder',
    'processPayment',
    'updateInventory',
    'sendConfirmation'
  ]);
  
  const finalState = HaloTool.state.get();
  
  res.json({
    success: results.every(r => r.success),
    order: finalState
  });
}
```

### Vue.js Application

```javascript
// main.js
import { createApp } from 'vue';
import HaloTool from 'halo-tool';
import App from './App.vue';

const app = createApp(App);

// Make HaloTool available globally in Vue
app.config.globalProperties.$haloTool = HaloTool;

// Or as a plugin
app.use({
  install(app) {
    app.provide('haloTool', HaloTool);
  }
});

app.mount('#app');
```

## 🏗️ Architecture

The Halo Tools System is built with a modular, plugin-based architecture:

```
HaloTool (Plugin Layer)
├── Core System (HaloTools)
├── Tool Executors (Server, Client, System)
├── Resilience Features (Circuit Breaker, Cache, Retry)
├── State Management (Event-sourced, JSONPath)
├── Processors (Template, JSONPath, Assignment)
├── HTTP Client (Auth, Interceptors, Metrics)
└── Telemetry (Metrics, Tracing, Error Tracking)
```

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## 📞 Support

- 📧 Email: support@halo-tools.com
- 📚 Documentation: https://docs.halo-tools.com
- 🐛 Issues: https://github.com/halo-tools/halo-tool/issues
