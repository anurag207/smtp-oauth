/**
 * Logger Utility
 *
 * Centralized logging using Winston with multiple transports:
 * - Console: Colored output for development
 * - File: Persistent logs for debugging and auditing
 *
 * Log Levels (in order of severity):
 * - error: Critical failures that need immediate attention
 * - warn: Warning conditions that should be reviewed
 * - info: General operational information
 * - debug: Detailed debugging information (disabled in production)
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom log format for console output
 * Format: [TIMESTAMP] [LEVEL] [COMPONENT] Message
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, component }) => {
    const comp = component ? `[${component}]` : '';
    return `[${timestamp}] ${level} ${comp} ${message}`;
  })
);

/**
 * Custom log format for file output
 * Format: JSON for easy parsing and analysis
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Determine log level based on environment
 * - Development: debug (all logs)
 * - Production: info (info, warn, error only)
 */
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Winston logger instance with multiple transports
 */
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { service: 'smtp-gmail-relay' },
  transports: [
    // Console transport - colorized output for terminal
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // Error log file - only errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5, // Keep 5 rotated files
    }),

    // Combined log file - all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5, // Keep 5 rotated files
    }),
  ],
});

/**
 * Component-specific logger factory
 *
 * Creates a child logger with a component tag for easier filtering.
 *
 * @param component - The component name (e.g., 'SMTP', 'OAuth', 'Gmail', 'DB')
 * @returns Logger instance with component metadata
 *
 * @example
 * const smtpLogger = createComponentLogger('SMTP');
 * smtpLogger.info('Client connected');
 * // Output: [12:30:45] info [SMTP] Client connected
 */
export function createComponentLogger(component: string) {
  return logger.child({ component });
}

/**
 * Pre-configured loggers for each component
 */
export const smtpLogger = createComponentLogger('SMTP');
export const oauthLogger = createComponentLogger('OAuth');
export const gmailLogger = createComponentLogger('Gmail');
export const dbLogger = createComponentLogger('DB');
export const serverLogger = createComponentLogger('Server');

/**
 * Default logger export for general use
 */
export default logger;

