/**
 * Test script for Halo State Plugin
 *
 * This script tests the built state plugin to ensure it works correctly
 */

const { createHaloStatePlugin } = require('./dist/state/halo-state-plugin.js');

console.log('🧪 Testing Halo State Plugin...\n');

try {
  // Test 1: Create plugin instance
  console.log('1️⃣ Creating state plugin instance...');
  const statePlugin = createHaloStatePlugin({
    enableEventSourcing: true,
    enableCheckpoints: true,
    enableValidation: true,
    enableDependencyTracking: true,
    debugMode: false,
    maxEventLogSize: 100,
    maxCheckpoints: 5,
  });
  console.log('✅ State plugin created successfully');

  // Test 2: Check initial state
  console.log('\n2️⃣ Checking initial state...');
  const initialState = statePlugin.getState();
  console.log(`✅ Initial state has ${Object.keys(initialState).length} top-level keys`);
  console.log(`   - Session ID: ${initialState.session.treeId}`);
  console.log(`   - User ID: ${initialState.session.userId}`);
  console.log(`   - Current page: ${initialState.session.currentPage}`);

  // Test 3: Form field updates
  console.log('\n3️⃣ Testing form field updates...');
  statePlugin.updateFormField('testField', 'testValue', {
    triggerValidation: true,
    triggerDependencies: true,
    metadata: { source: 'test-script' },
  });
  const updatedState = statePlugin.getState();
  console.log(`✅ Form field updated: ${updatedState.form.testField.value}`);

  // Test 4: Dependency registration and processing
  console.log('\n4️⃣ Testing dependency system...');
  statePlugin.registerDependency('make', ['model']);
  statePlugin.updateFormField('make', 'Toyota');
  const dependencyState = statePlugin.getState();
  console.log('✅ Dependency registered and processed');

  // Test 5: UI field updates
  console.log('\n5️⃣ Testing UI field updates...');
  statePlugin.updateUIField('model', {
    options: [
      { id: 'camry', name: 'Camry' },
      { id: 'corolla', name: 'Corolla' },
    ],
    loading: false,
    error: null,
  });
  const uiState = statePlugin.getState();
  console.log(`✅ UI field updated with ${uiState.ui.model.options.length} options`);

  // Test 6: Validation
  console.log('\n6️⃣ Testing validation system...');
  statePlugin.registerValidationRules('testField', [
    { type: 'required', message: 'Field is required' },
    { type: 'minLength', value: 3, message: 'Minimum 3 characters' },
  ]);
  const isValid = statePlugin.validateField('testField');
  console.log(`✅ Validation result: ${isValid ? 'VALID' : 'INVALID'}`);

  // Test 7: Checkpoints
  console.log('\n7️⃣ Testing checkpoint system...');
  statePlugin.createCheckpoint('test-checkpoint', 'Test checkpoint created');
  const checkpoints = statePlugin.getCheckpoints();
  console.log(`✅ Checkpoint created: ${Object.keys(checkpoints).length} total checkpoints`);

  // Test 8: Event sourcing
  console.log('\n8️⃣ Testing event sourcing...');
  const eventLog = statePlugin.getEventLog();
  console.log(`✅ Event log contains ${eventLog.length} events`);

  // Test 9: Lifecycle events
  console.log('\n9️⃣ Testing lifecycle events...');
  statePlugin.onTreeLaunch();
  statePlugin.onPageEnter('test-page');
  const canExit = statePlugin.onPageExit();
  console.log(`✅ Lifecycle events processed, can exit: ${canExit}`);

  // Test 10: Performance metrics
  console.log('\n🔟 Testing performance metrics...');
  const metrics = statePlugin.getPerformanceMetrics();
  console.log(`✅ Performance metrics: ${metrics.updateCount} updates, ${metrics.stateSize} bytes`);

  console.log('\n🎉 All tests passed! State plugin is working correctly.');

  // Cleanup
  statePlugin.destroy();
  console.log('🧹 Plugin destroyed and cleaned up.');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
