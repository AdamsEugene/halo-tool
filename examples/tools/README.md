# Halo Tools Examples

This directory contains example tool definitions and workflow configurations to help you get started with the Halo Tools System.

## Tool Examples

### Server Tools

- **fetchInitialContext.json**: Demonstrates a server tool that fetches initial context data with caching, circuit breaker, and error handling
- **getMakes.json**: Example API call to fetch vehicle makes with response mapping
- **getModels.json**: Dependent API call that fetches models based on selected make

### Client Tools

- **openModal.json**: Shows how to create a client tool that opens a modal with rollback capability
- **scrollToElement.json**: Example of DOM manipulation tool
- **focusInput.json**: Simple client tool for focusing form elements

### System Tools

- **assignValue.json**: Basic system tool for assigning values to state
- **mergeData.json**: System tool that merges data into existing state
- **transformData.json**: Advanced system tool with JSONata transformation

## Workflow Examples

- **car-shopping.json**: Complete decision tree workflow for car shopping
- **user-onboarding.json**: Multi-step user onboarding flow
- **data-collection.json**: Generic data collection workflow

## Usage

To load and use these examples:

```typescript
import { HaloTools } from 'halo-tools';

const haloTools = new HaloTools();

// Load a single tool
await haloTools.loadTool('./examples/tools/fetchInitialContext.json');

// Load all tools from directory
await haloTools.loadTools('./examples/tools');

// Execute a tool
const result = await haloTools.executeTool('fetchInitialContext', {
  toolId: 'fetchInitialContext',
  instanceId: 'instance_123',
  startTime: Date.now(),
  triggeredBy: 'lifecycle',
  state: {
    context: { orgId: 'org_123' },
    session: { userId: 'user_456' },
    secrets: { partnerKey: 'your-api-key' }
  }
});
```

## Customization

Feel free to modify these examples to match your specific use cases. Each tool definition follows the schema defined in the main documentation.

## Best Practices

1. **Use descriptive IDs**: Tool IDs should be clear and follow a consistent naming convention
2. **Handle errors gracefully**: Always specify appropriate error handling strategies
3. **Enable telemetry**: Use telemetry for monitoring and debugging
4. **Cache appropriately**: Use caching for expensive operations but consider data freshness
5. **Validate inputs**: Use validation schemas to ensure data integrity
6. **Document your tools**: Include clear descriptions and usage examples
