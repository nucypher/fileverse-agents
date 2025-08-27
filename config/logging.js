/**
 * Logging Configuration for Fileverse Agents SDK
 */

// Default logging configuration
export const LOGGING_CONFIG = {
  // Log levels: ERROR=0, WARN=1, INFO=2, DEBUG=3, TRACE=4
  DEFAULT_LEVEL: 'INFO',
  
  // Environment-based log levels
  ENVIRONMENT_LEVELS: {
    production: 'ERROR',
    staging: 'WARN', 
    development: 'DEBUG',
    test: 'WARN'
  },

  // Component-specific log levels (override default)
  COMPONENT_LEVELS: {
    'Agent': 'INFO',
    'TacoService': 'INFO',
    'PinataStorage': 'WARN',
    'KeyManager': 'WARN'
  },

  // Formatting options
  FORMATTING: {
    enableColors: true,
    enableTimestamps: true,
    timestampFormat: 'ISO', // ISO, LOCAL, or EPOCH
  },

  // Output options
  OUTPUT: {
    console: true,
    // file: './logs/fileverse-agents.log', // Optional file logging
    // maxFileSize: '10MB',
    // maxFiles: 5
  }
};

/**
 * Get effective log level for a component
 */
export function getLogLevel(component = null) {
  // Check environment variable first
  const envLevel = process.env.FILEVERSE_LOG_LEVEL || process.env.LOG_LEVEL;
  if (envLevel) {
    return envLevel.toUpperCase();
  }

  // Check component-specific level
  if (component && LOGGING_CONFIG.COMPONENT_LEVELS[component]) {
    return LOGGING_CONFIG.COMPONENT_LEVELS[component];
  }

  // Check environment-based level
  const env = process.env.NODE_ENV?.toLowerCase();
  if (env && LOGGING_CONFIG.ENVIRONMENT_LEVELS[env]) {
    return LOGGING_CONFIG.ENVIRONMENT_LEVELS[env];
  }

  // Default level
  return LOGGING_CONFIG.DEFAULT_LEVEL;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled() {
  return (
    process.env.DEBUG === '1' || 
    process.env.FILEVERSE_DEBUG === '1' ||
    process.env.NODE_ENV === 'development'
  );
}

/**
 * Check if production mode
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}
