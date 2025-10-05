export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: any;
  source?: string;
  tags?: Record<string, string>;
}

export interface LoggerConfig {
  level?: LogLevel;
  enableConsole?: boolean;
  enableStorage?: boolean;
  maxEntries?: number;
  format?: 'json' | 'text';
}

export class Logger {
  private config: LoggerConfig;
  private entries: LogEntry[] = [];

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableStorage: false,
      maxEntries: 1000,
      format: 'text',
      ...config,
    };
  }

  public debug(message: string, context?: any, source?: string): void {
    this.log(LogLevel.DEBUG, message, context, source);
  }

  public info(message: string, context?: any, source?: string): void {
    this.log(LogLevel.INFO, message, context, source);
  }

  public warn(message: string, context?: any, source?: string): void {
    this.log(LogLevel.WARN, message, context, source);
  }

  public error(message: string, context?: any, source?: string): void {
    this.log(LogLevel.ERROR, message, context, source);
  }

  public fatal(message: string, context?: any, source?: string): void {
    this.log(LogLevel.FATAL, message, context, source);
  }

  private log(level: LogLevel, message: string, context?: any, source?: string): void {
    if (level < this.config.level!) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      source,
    };

    this.entries.push(entry);

    // Limit entries
    if (this.entries.length > this.config.maxEntries!) {
      this.entries.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Storage
    if (this.config.enableStorage) {
      this.logToStorage(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const timestamp = new Date(entry.timestamp).toISOString();

    if (this.config.format === 'json') {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    } else {
      const prefix = `[${timestamp}] ${levelName}${entry.source ? ` (${entry.source})` : ''}:`;

      switch (entry.level) {
        case LogLevel.DEBUG:
          // eslint-disable-next-line no-console
          console.debug(prefix, entry.message, entry.context);
          break;
        case LogLevel.INFO:
          // eslint-disable-next-line no-console
          console.info(prefix, entry.message, entry.context);
          break;
        case LogLevel.WARN:
          // eslint-disable-next-line no-console
          console.warn(prefix, entry.message, entry.context);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          // eslint-disable-next-line no-console
          console.error(prefix, entry.message, entry.context);
          break;
      }
    }
  }

  private logToStorage(entry: LogEntry): void {
    // Simple localStorage implementation
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const logs = JSON.parse(localStorage.getItem('halo_logs') || '[]');
        logs.push(entry);

        // Keep only recent logs
        if (logs.length > this.config.maxEntries!) {
          logs.splice(0, logs.length - this.config.maxEntries!);
        }

        localStorage.setItem('halo_logs', JSON.stringify(logs));
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Failed to store log entry:', error);
        }
      }
    }
  }

  public getLogs(level?: LogLevel, source?: string, limit?: number): LogEntry[] {
    let filtered = this.entries;

    if (level !== undefined) {
      filtered = filtered.filter(entry => entry.level >= level);
    }

    if (source) {
      filtered = filtered.filter(entry => entry.source === source);
    }

    if (limit) {
      filtered = filtered.slice(-limit);
    }

    return filtered;
  }

  public clear(): void {
    this.entries = [];

    if (this.config.enableStorage && typeof window !== 'undefined') {
      localStorage.removeItem('halo_logs');
    }
  }
}

// Default logger instance
export const logger = new Logger();
