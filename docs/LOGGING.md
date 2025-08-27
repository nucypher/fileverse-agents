# Logging System Documentation

The Fileverse Agents SDK now includes a comprehensive, structured logging system that provides better debugging capabilities and production monitoring.

## Key Improvements

### ✅ **Before vs After**

**Before (Issues):**
- Mixed usage of `console.log`, `console.debug`, `console.warn`, `console.error`
- No centralized logging control
- Debug information exposed in production
- No structured data in logs
- No environment-based log level control

**After (Solutions):**
- Centralized `LoggingService` with consistent API
- Environment-based log level configuration
- Structured logging with contextual data
- Component-specific log levels
- Production-safe defaults

## Usage

### Basic Usage

```javascript
import { logger } from './services/LoggingService.js';

// Simple logging
logger.info('Application started');
logger.error('An error occurred', { userId: 123, action: 'login' });

// Namespaced logging
const agentLogger = logger.namespace('Agent');
agentLogger.debug('Processing file', { fileId: 'abc123' });
```

### Component-Specific Logging

```javascript
// Each component gets its own logger with configured log levels
class MyComponent {
  constructor() {
    this.log = logger.namespace('MyComponent');
  }

  processData(data) {
    this.log.debug('Processing data', { size: data.length });
    // ... processing logic
    this.log.info('Data processed successfully', { processed: data.length });
  }
}
```

## Log Levels

The system supports 5 log levels in order of severity:

1. **ERROR** (0) - Critical errors that need immediate attention
2. **WARN** (1) - Warnings about potential issues
3. **INFO** (2) - General informational messages
4. **DEBUG** (3) - Detailed debugging information
5. **TRACE** (4) - Very detailed tracing information

## Configuration

### Environment Variables

Control logging behavior with environment variables:

```bash
# Set global log level
export FILEVERSE_LOG_LEVEL=DEBUG
export LOG_LEVEL=INFO

# Enable debug mode
export FILEVERSE_DEBUG=1
export DEBUG=1

# Set environment (affects default log level)
export NODE_ENV=production  # ERROR level
export NODE_ENV=development # DEBUG level
export NODE_ENV=test        # WARN level
```

### Component-Specific Levels

Configure different log levels for different components in `config/logging.js`:

```javascript
export const LOGGING_CONFIG = {
  COMPONENT_LEVELS: {
    'Agent': 'INFO',          // File operations
    'TacoService': 'DEBUG',   // Encryption operations  
    'PinataStorage': 'WARN',  // Storage operations
    'KeyManager': 'ERROR'     // Key generation
  }
};
```

### Default Levels by Environment

| Environment | Default Level | Description |
|------------|---------------|-------------|
| `production` | `ERROR` | Only critical errors |
| `staging` | `WARN` | Errors and warnings |
| `development` | `DEBUG` | Detailed debugging info |
| `test` | `WARN` | Minimal test output |

## Structured Logging Examples

### TacoService Logging
```javascript
// Before
console.debug(`🔐 Starting TACo encryption with domain: ${this.domain}, ritual: ${this.ritualId}`);
console.error("❌ TACo encryption failed:", error);

// After
this.log.debug('Starting TACo encryption', {
  domain: this.domain,
  ritualId: this.ritualId,
  dataType: typeof data,
  hasAccessCondition: !!accessCondition
});

this.log.error('TACo encryption failed', {
  domain: this.domain,
  ritualId: this.ritualId,
  errorMessage: error.message,
  errorStack: error.stack
});
```

### Agent Logging
```javascript
// Before
console.warn("Failed to initialize TACo:", error.message);
console.log("Storage already exists");

// After
this.log.warn('Failed to initialize TACo', {
  message: error.message,
  domain: this.tacoConfig?.domain,
  ritualId: this.tacoConfig?.ritualId
});

this.log.debug('Storage already exists for namespace', {
  namespace,
  portalAddress: portal?.address
});
```

## Output Format

Logs are formatted with:
- **Timestamp** (configurable format)
- **Log Level** with emoji indicators
- **Component Namespace** for easy filtering
- **Structured Data** in JSON format

Example output:
```
🔧 [2024-01-15T10:30:45.123Z] [DEBUG] [FileverseSdk:TacoService] Starting TACo encryption {"domain":"tapir","ritualId":6,"dataType":"string"}
ℹ️ [2024-01-15T10:30:46.456Z] [INFO] [FileverseSdk:Agent] File created successfully {"fileId":"123","encrypted":true}
❌ [2024-01-15T10:30:47.789Z] [ERROR] [FileverseSdk:PinataStorage] Upload failed {"message":"Network timeout","reference":"QmAbc123"}
```

## Migration Guide

### For Library Users

**No breaking changes** - existing functionality continues to work. To benefit from structured logging:

1. Set environment variables for desired log levels
2. Components automatically use the new logging system

### For Contributors

Replace direct console calls:

```javascript
// Replace this:
console.log('Something happened');
console.error('Error:', error);

// With this:
this.log.info('Something happened');
this.log.error('Error occurred', { 
  message: error.message,
  stack: error.stack 
});
```

## Benefits

### 🎯 **Production Safety**
- No debug information leaked in production
- Configurable log levels prevent verbose output
- Structured errors for monitoring systems

### 🔍 **Better Debugging**  
- Contextual data with every log entry
- Component namespacing for easy filtering
- Consistent log formats across the codebase

### ⚡ **Performance**
- Log level checking prevents expensive operations
- Minimal overhead when logging is disabled
- No string concatenation for disabled levels

### 🛠 **Maintainability**
- Centralized logging configuration
- Easy to add new components
- Consistent patterns across the codebase

## Advanced Usage

### Custom Log Levels
```javascript
// Create component-specific logger
const customLogger = logger.component('MyFeature');
customLogger.debug('Feature initialized');
```

### Conditional Logging
```javascript
// Log level is checked automatically
logger.debug('Expensive debug info', {
  // This object is only created if DEBUG level is enabled
  data: expensiveOperation()  
});
```

### Error Context
```javascript
// Rich error context
this.log.error('Operation failed', {
  operation: 'fileUpload',
  userId: user.id,
  fileSize: file.size,
  errorCode: error.code,
  retryCount: attempts,
  timestamp: Date.now()
});
```

This logging system provides a solid foundation for debugging, monitoring, and maintaining the Fileverse Agents SDK in production environments.
