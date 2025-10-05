# Halo Tools System

A comprehensive, extensible tool execution framework for decision trees and dynamic workflows. Built with TypeScript and designed for enterprise-grade applications.

## 🚀 Features

- **Multiple Tool Types**: Server tools (API calls), Client tools (UI actions), System tools (state operations)
- **Resilience Patterns**: Circuit breakers, request deduplication, retry logic, rate limiting, multi-level caching
- **State Management**: Event-sourced state store with checkpointing and time-travel debugging
- **Advanced Processing**: JSONPath evaluation, template processing, dynamic variable substitution
- **Comprehensive Telemetry**: Metrics collection, distributed tracing, error tracking
- **Developer Experience**: TypeScript support, comprehensive validation, extensible architecture

## 📦 Installation

```bash
npm install halo-tools
```

## 🏗️ Quick Start

```typescript
import { HaloTools } from 'halo-tools';

// Initialize the system
const haloTools = new HaloTools({
  enableMetrics: true,
  enableTracing: true,
  enableErrorTracking: true
});

// Load tools from configuration
await haloTools.loadTools('./tools');

// Execute a tool
const result = await haloTools.executeTool('fetchUserData', {
  toolId: 'fetchUserData',
  instanceId: 'instance_123',
  startTime: Date.now(),
  triggeredBy: 'manual',
  state: {
    user: { id: 'user_123' },
    context: { orgId: 'org_456' }
  }
});

console.log('Tool execution result:', result);
```

## 🔧 Tool Types

### Server Tools

Execute HTTP requests with advanced resilience features:

```json
{
  "id": "fetchUserProfile",
  "type": "server",
  "name": "Fetch User Profile",
  "api": {
    "url": "https://api.example.com/users/{{$.user.id}}",
    "method": "GET",
    "headers": {
      "Authorization": "Bearer {{$.auth.token}}"
    },
    "cache": {
      "ttlSec": 300,
      "strategy": "memory"
    },
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3
    }
  },
  "assignments": [
    {
      "source": "response",
      "valuePath": "$.data",
      "statePath": "$.user.profile"
    }
  ]
}
```

### Client Tools

Perform browser-side actions with rollback support:

```json
{
  "id": "openModal",
  "type": "client",
  "name": "Open Modal",
  "client": {
    "fn": "openModal",
    "rollback": {
      "fn": "closeModal"
    }
  }
}
```

### System Tools

Manipulate application state:

```json
{
  "id": "calculateTotal",
  "type": "system",
  "name": "Calculate Total",
  "system": {
    "op": "transform",
    "path": "$.cart.total",
    "transform": {
      "type": "jsonata",
      "expression": "$.cart.items.price ~> $sum()"
    }
  }
}
```

## 📊 State Management

The system includes a powerful state management solution:

```typescript
// Subscribe to state changes
const unsubscribe = haloTools.subscribeToState('$.user.profile', (newValue, oldValue) => {
  console.log('Profile updated:', newValue);
});

// Create checkpoints for rollback
haloTools.createCheckpoint('beforeUpdate');

// Modify state
haloTools.setState({
  user: { profile: { name: 'John Doe' } }
});

// Restore if needed
haloTools.restoreCheckpoint('beforeUpdate');
```

## 📈 Telemetry & Monitoring

Built-in observability features:

```typescript
// Record custom metrics
haloTools.recordMetric('api.response_time', 150, 'milliseconds');
haloTools.incrementCounter('tool.executions', 1, { toolType: 'server' });

// Trace operations
const result = await haloTools.traceOperation('complexOperation', async (span) => {
  span.tags.userId = 'user_123';
  return await performComplexOperation();
});

// Capture errors
haloTools.captureError(new Error('Something went wrong'), {
  userId: 'user_123',
  operation: 'fetchData'
});
```

## 🏛️ Architecture

The system is built with a modular architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Tool Registry │    │ Tool Executors  │    │ State Manager   │
│                 │    │                 │    │                 │
│ • Registration  │◄──►│ • Server Tools  │◄──►│ • Event Sourced │
│ • Discovery     │    │ • Client Tools  │    │ • Checkpointing │
│ • Validation    │    │ • System Tools  │    │ • Subscriptions │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │              Resilience Layer                   │
         │                                                 │
         │ • Circuit Breakers  • Request Deduplication    │
         │ • Retry Logic       • Rate Limiting             │
         │ • Caching          • Error Handling             │
         └─────────────────────────────────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │              Telemetry Layer                    │
         │                                                 │
         │ • Metrics Collection • Distributed Tracing     │
         │ • Error Tracking     • Performance Monitoring  │
         └─────────────────────────────────────────────────┘
```

## 🛠️ Configuration

### Basic Configuration

```typescript
const haloTools = new HaloTools({
  enableMetrics: true,
  enableTracing: true,
  enableErrorTracking: true,
  enableStateManagement: true,
  maxTools: 1000,
  retentionPeriod: 86400000 // 24 hours
});
```

### Tool Configuration

Tools are configured using JSON files that define their behavior:

- **Server Tools**: HTTP endpoints, authentication, caching, resilience
- **Client Tools**: JavaScript functions, rollback actions
- **System Tools**: State operations, transformations

## 📚 Examples

Check out the `examples/` directory for:

- Complete tool definitions
- Workflow configurations
- Integration examples
- Best practices

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 🔍 Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## 📖 API Documentation

### Core Classes

- **HaloTools**: Main system class
- **ToolRegistry**: Tool registration and discovery
- **ToolOrchestrator**: Tool execution coordination
- **StateManager**: State management and subscriptions
- **MetricsCollector**: Metrics collection and aggregation
- **TracingManager**: Distributed tracing
- **ErrorTracker**: Error capture and analysis

### Tool Executors

- **ServerToolExecutor**: HTTP request execution with resilience
- **ClientToolExecutor**: Browser-side action execution
- **SystemToolExecutor**: State manipulation operations

### Resilience Components

- **CircuitBreaker**: Prevent cascade failures
- **RequestDeduplicator**: Eliminate duplicate requests
- **RetryManager**: Configurable retry strategies
- **RateLimiter**: Request rate limiting
- **CacheManager**: Multi-level caching

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/your-org/halo-tools/issues)
- 💬 [Discussions](https://github.com/your-org/halo-tools/discussions)

## 🎯 Roadmap

- [ ] GraphQL support for server tools
- [ ] WebSocket tool type
- [ ] Visual tool builder
- [ ] Performance optimization tools
- [ ] Advanced analytics dashboard
- [ ] Plugin system for custom tool types

---

Built with ❤️ by the Halo Team
