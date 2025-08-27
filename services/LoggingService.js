/**
 * Centralized Logging Service for Fileverse Agents SDK
 *
 * Provides structured logging with configurable levels and formatting
 * Supports environment-based configuration and filtering
 */

// Simple logging configuration without external dependencies
const LOGGING_CONFIG = {
  FORMATTING: { enableColors: true, enableTimestamps: true },
  DEFAULT_LEVEL: 'INFO',
  ENVIRONMENT_LEVELS: {
    production: 'ERROR',
    development: 'DEBUG',
    test: 'WARN'
  }
};

const getLogLevel = (component) => {
  // Check environment variable first
  if (typeof process !== 'undefined') {
    const envLevel = process.env.FILEVERSE_LOG_LEVEL || process.env.LOG_LEVEL;
    if (envLevel) return envLevel.toUpperCase();

    const env = process.env.NODE_ENV?.toLowerCase();
    if (env && LOGGING_CONFIG.ENVIRONMENT_LEVELS[env]) {
      return LOGGING_CONFIG.ENVIRONMENT_LEVELS[env];
    }
  }
  return LOGGING_CONFIG.DEFAULT_LEVEL;
};

/**
 * Log levels in order of severity
 */
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

class LoggingService {
  constructor(options = {}) {
    // Set default log level based on configuration and environment
    this.logLevel = this._determineLogLevel(options.level, options.component);
    this.enableColors = options.enableColors ?? LOGGING_CONFIG.FORMATTING.enableColors;
    this.enableTimestamps = options.enableTimestamps ?? LOGGING_CONFIG.FORMATTING.enableTimestamps;
  }

  /**
   * Determine appropriate log level based on configuration and environment
   */
  _determineLogLevel(explicitLevel, component) {
    if (explicitLevel !== undefined) {
      return typeof explicitLevel === 'string'
        ? LOG_LEVELS[explicitLevel.toUpperCase()] ?? LOG_LEVELS.INFO
        : explicitLevel;
    }

    // Use configuration-based level determination
    const configLevel = getLogLevel(component);
    return LOG_LEVELS[configLevel] || LOG_LEVELS.INFO;
  }

  /**
   * Check if a log level should be output
   */
  _shouldLog(level) {
    return LOG_LEVELS[level] <= this.logLevel;
  }

  /**
   * Format log message with timestamp and namespace
   */
  _formatMessage(level, namespace, message, data) {
    let prefix = '';

    // Add timestamp if enabled
    if (this.enableTimestamps) {
      const timestamp = new Date().toISOString();
      prefix += `[${timestamp}] `;
    }

    // Add log level and namespace
    prefix += `[${level}] `;
    if (namespace) {
      prefix += `[${this.defaultNamespace}:${namespace}] `;
    } else {
      prefix += `[${this.defaultNamespace}] `;
    }

    // Add emoji prefixes for visual clarity
    const levelEmojis = {
      ERROR: '❌',
      WARN: '⚠️',
      INFO: 'ℹ️',
      DEBUG: '🔧',
      TRACE: '🔍'
    };

    if (this.enableColors && levelEmojis[level]) {
      prefix = `${levelEmojis[level]} ${prefix}`;
    }

    return { prefix, message, data };
  }

  /**
   * Generic log method
   */
  _log(level, namespace, message, data, consoleMethod) {
    if (!this._shouldLog(level)) return;

    const formatted = this._formatMessage(level, namespace, message, data);

    if (data !== undefined) {
      consoleMethod(formatted.prefix + formatted.message, data);
    } else {
      consoleMethod(formatted.prefix + formatted.message);
    }
  }

  /**
   * Create a namespaced logger
   */
  namespace(name) {
    return new NamespacedLogger(this, name);
  }

  /**
   * Create a component-specific logger with its own log level
   */
  component(name) {
    const componentLevel = getLogLevel(name);
    return new LoggingService({
      component: name,
      level: componentLevel,
      enableColors: this.enableColors,
      enableTimestamps: this.enableTimestamps
    });
  }

  /**
   * Log methods
   */
  error(message, data) {
    this._log('ERROR', null, message, data, console.error);
  }

  warn(message, data) {
    this._log('WARN', null, message, data, console.warn);
  }

  info(message, data) {
    this._log('INFO', null, message, data, console.info);
  }

  debug(message, data) {
    this._log('DEBUG', null, message, data, console.log);
  }

  trace(message, data) {
    this._log('TRACE', null, message, data, console.log);
  }
}

/**
 * Namespaced logger for specific components
 */
class NamespacedLogger {
  constructor(parent, namespace) {
    this.parent = parent;
    this.namespace = namespace;
  }

  error(message, data) {
    this.parent._log('ERROR', this.namespace, message, data, console.error);
  }

  warn(message, data) {
    this.parent._log('WARN', this.namespace, message, data, console.warn);
  }

  info(message, data) {
    this.parent._log('INFO', this.namespace, message, data, console.info);
  }

  debug(message, data) {
    this.parent._log('DEBUG', this.namespace, message, data, console.log);
  }

  trace(message, data) {
    this.parent._log('TRACE', this.namespace, message, data, console.log);
  }
}

// Create default logger instance
const defaultLogger = new LoggingService();

// Export both class and default instance
export { LoggingService, defaultLogger as logger };
