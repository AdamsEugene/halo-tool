import { EventEmitter } from 'eventemitter3';

export interface ErrorInfo {
  id: string;
  error: Error;
  timestamp: number;
  context?: Record<string, any>;
  tags?: Record<string, string>;
  fingerprint?: string;
  stackTrace?: string;
  userAgent?: string;
  url?: string;
  userId?: string;
  sessionId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  handled: boolean;
}

export interface ErrorSummary {
  fingerprint: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedUsers: Set<string>;
  occurrences: ErrorInfo[];
}

export interface ErrorTrackerConfig {
  enabled?: boolean;
  maxErrors?: number;
  maxErrorsPerFingerprint?: number;
  retentionPeriod?: number;
  enableStackTrace?: boolean;
  enableUserTracking?: boolean;
  enableSessionTracking?: boolean;
  enableContextCapture?: boolean;
  beforeSend?: (errorInfo: ErrorInfo) => ErrorInfo | null;
}

export class ErrorTracker extends EventEmitter {
  private errors: Map<string, ErrorInfo> = new Map();
  private errorSummaries: Map<string, ErrorSummary> = new Map();
  private config: ErrorTrackerConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private globalErrorHandler?: (event: ErrorEvent) => void;
  private unhandledRejectionHandler?: (event: PromiseRejectionEvent) => void;

  constructor(config: ErrorTrackerConfig = {}) {
    super();

    this.config = {
      enabled: true,
      maxErrors: 1000,
      maxErrorsPerFingerprint: 50,
      retentionPeriod: 86400000, // 24 hours
      enableStackTrace: true,
      enableUserTracking: true,
      enableSessionTracking: true,
      enableContextCapture: true,
      ...config,
    };

    if (this.config.enabled) {
      this.setupGlobalErrorHandling();
      this.startCleanup();
    }
  }

  public captureError(
    error: Error,
    context?: Record<string, any>,
    tags?: Record<string, string>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    handled: boolean = true
  ): string {
    if (!this.config.enabled) return '';

    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      error,
      timestamp: Date.now(),
      context,
      tags,
      fingerprint: this.generateFingerprint(error),
      stackTrace: this.config.enableStackTrace ? error.stack : undefined,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      severity,
      handled,
    };

    // Apply beforeSend filter
    const processedError = this.config.beforeSend ? this.config.beforeSend(errorInfo) : errorInfo;
    if (!processedError) return '';

    this.storeError(processedError);
    this.updateErrorSummary(processedError);

    this.emit('errorCaptured', processedError);

    return processedError.id;
  }

  public captureException(
    error: Error,
    options?: {
      context?: Record<string, any>;
      tags?: Record<string, string>;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      userId?: string;
      sessionId?: string;
    }
  ): string {
    return this.captureError(error, options?.context, options?.tags, options?.severity);
  }

  public captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context?: Record<string, any>,
    tags?: Record<string, string>
  ): string {
    const error = new Error(message);
    error.name = `${level.toUpperCase()}_MESSAGE`;

    const severity = this.levelToSeverity(level);

    return this.captureError(error, context, tags, severity);
  }

  public getError(errorId: string): ErrorInfo | undefined {
    return this.errors.get(errorId);
  }

  public getErrors(options?: {
    severity?: 'low' | 'medium' | 'high' | 'critical';
    handled?: boolean;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): ErrorInfo[] {
    let results = Array.from(this.errors.values());

    if (options?.severity) {
      results = results.filter(error => error.severity === options.severity);
    }

    if (options?.handled !== undefined) {
      results = results.filter(error => error.handled === options.handled);
    }

    if (options?.startTime || options?.endTime) {
      results = results.filter(error => {
        if (options.startTime && error.timestamp < options.startTime) return false;
        if (options.endTime && error.timestamp > options.endTime) return false;
        return true;
      });
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  public getErrorSummaries(): ErrorSummary[] {
    return Array.from(this.errorSummaries.values()).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  public getErrorSummary(fingerprint: string): ErrorSummary | undefined {
    return this.errorSummaries.get(fingerprint);
  }

  public searchErrors(query: {
    message?: string;
    fingerprint?: string;
    tags?: Record<string, string>;
    userId?: string;
    sessionId?: string;
  }): ErrorInfo[] {
    let results = Array.from(this.errors.values());

    if (query.message) {
      const searchTerm = query.message.toLowerCase();
      results = results.filter(error => error.error.message.toLowerCase().includes(searchTerm));
    }

    if (query.fingerprint) {
      results = results.filter(error => error.fingerprint === query.fingerprint);
    }

    if (query.tags) {
      results = results.filter(error => {
        if (!error.tags) return false;

        return Object.entries(query.tags!).every(([key, value]) => error.tags![key] === value);
      });
    }

    if (query.userId) {
      results = results.filter(error => error.userId === query.userId);
    }

    if (query.sessionId) {
      results = results.filter(error => error.sessionId === query.sessionId);
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getStats(): {
    totalErrors: number;
    uniqueErrors: number;
    handledErrors: number;
    unhandledErrors: number;
    errorsBySeverity: Record<string, number>;
    topErrors: Array<{ fingerprint: string; count: number; message: string }>;
    errorRate: number; // errors per hour
  } {
    const allErrors = Array.from(this.errors.values());
    const summaries = Array.from(this.errorSummaries.values());

    const errorsBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    allErrors.forEach(error => {
      errorsBySeverity[error.severity]++;
    });

    const topErrors = summaries
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(summary => ({
        fingerprint: summary.fingerprint,
        count: summary.count,
        message: summary.message,
      }));

    // Calculate error rate (errors per hour)
    const oneHourAgo = Date.now() - 3600000;
    const recentErrors = allErrors.filter(error => error.timestamp > oneHourAgo);
    const errorRate = recentErrors.length;

    return {
      totalErrors: allErrors.length,
      uniqueErrors: summaries.length,
      handledErrors: allErrors.filter(e => e.handled).length,
      unhandledErrors: allErrors.filter(e => !e.handled).length,
      errorsBySeverity,
      topErrors,
      errorRate,
    };
  }

  public exportErrors(): {
    errors: ErrorInfo[];
    summaries: ErrorSummary[];
    metadata: {
      exportTime: number;
      totalErrors: number;
      uniqueErrors: number;
    };
  } {
    const errors = this.getErrors();
    const summaries = this.getErrorSummaries();

    const exportData = {
      errors,
      summaries: summaries.map(summary => ({
        ...summary,
        affectedUsers: Array.from(summary.affectedUsers), // Convert Set to Array
      })) as any,
      metadata: {
        exportTime: Date.now(),
        totalErrors: errors.length,
        uniqueErrors: summaries.length,
      },
    };

    this.emit('errorsExported', exportData);

    return exportData;
  }

  public clearErrors(): void {
    this.errors.clear();
    this.errorSummaries.clear();
    this.emit('errorsCleared');
  }

  public setUser(userId: string, userData?: Record<string, any>): void {
    this.emit('userSet', { userId, userData });
    // Store user context for future errors
    // Implementation would depend on your user context management
  }

  public setSession(sessionId: string, sessionData?: Record<string, any>): void {
    this.emit('sessionSet', { sessionId, sessionData });
    // Store session context for future errors
  }

  public addBreadcrumb(
    message: string,
    category?: string,
    level: 'info' | 'warning' | 'error' = 'info',
    data?: Record<string, any>
  ): void {
    const breadcrumb = {
      message,
      category,
      level,
      data,
      timestamp: Date.now(),
    };

    this.emit('breadcrumbAdded', breadcrumb);
    // Store breadcrumb for context in future errors
  }

  private storeError(errorInfo: ErrorInfo): void {
    this.errors.set(errorInfo.id, errorInfo);

    // Limit total errors
    if (this.errors.size > this.config.maxErrors!) {
      const oldestError = Array.from(this.errors.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp
      )[0];

      this.errors.delete(oldestError[0]);
      this.emit('errorEvicted', { errorId: oldestError[0] });
    }
  }

  private updateErrorSummary(errorInfo: ErrorInfo): void {
    const fingerprint = errorInfo.fingerprint || this.generateFingerprint(errorInfo.error);
    const existing = this.errorSummaries.get(fingerprint);

    if (existing) {
      existing.count++;
      existing.lastSeen = errorInfo.timestamp;
      existing.occurrences.push(errorInfo);

      if (errorInfo.userId) {
        existing.affectedUsers.add(errorInfo.userId);
      }

      // Limit occurrences per fingerprint
      if (existing.occurrences.length > this.config.maxErrorsPerFingerprint!) {
        existing.occurrences.shift();
      }
    } else {
      const summary: ErrorSummary = {
        fingerprint,
        message: errorInfo.error.message,
        count: 1,
        firstSeen: errorInfo.timestamp,
        lastSeen: errorInfo.timestamp,
        severity: errorInfo.severity,
        affectedUsers: new Set(errorInfo.userId ? [errorInfo.userId] : []),
        occurrences: [errorInfo],
      };

      this.errorSummaries.set(fingerprint, summary);
    }
  }

  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(error: Error): string {
    // Create a fingerprint based on error type and message
    const key = `${error.name}:${error.message}`;

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return hash.toString(16);
  }

  private levelToSeverity(
    level: 'info' | 'warning' | 'error'
  ): 'low' | 'medium' | 'high' | 'critical' {
    switch (level) {
      case 'info':
        return 'low';
      case 'warning':
        return 'medium';
      case 'error':
        return 'high';
      default:
        return 'medium';
    }
  }

  private setupGlobalErrorHandling(): void {
    if (typeof window === 'undefined') return;

    // Handle uncaught errors
    this.globalErrorHandler = (event: ErrorEvent) => {
      this.captureError(
        new Error(event.message),
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        { source: 'global-error' },
        'high',
        false
      );
    };

    // Handle unhandled promise rejections
    this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));

      this.captureError(
        error,
        { type: 'unhandled-rejection' },
        { source: 'promise-rejection' },
        'high',
        false
      );
    };

    window.addEventListener('error', this.globalErrorHandler);
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 300000); // Run cleanup every 5 minutes
  }

  private performCleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod!;

    // Clean up old errors
    const errorsToRemove: string[] = [];

    for (const [errorId, error] of this.errors) {
      if (error.timestamp < cutoff) {
        errorsToRemove.push(errorId);
      }
    }

    errorsToRemove.forEach(errorId => {
      this.errors.delete(errorId);
    });

    // Clean up old error summaries
    const summariesToRemove: string[] = [];

    for (const [fingerprint, summary] of this.errorSummaries) {
      if (summary.lastSeen < cutoff) {
        summariesToRemove.push(fingerprint);
      } else {
        // Clean up old occurrences within the summary
        summary.occurrences = summary.occurrences.filter(
          occurrence => occurrence.timestamp > cutoff
        );

        if (summary.occurrences.length === 0) {
          summariesToRemove.push(fingerprint);
        }
      }
    }

    summariesToRemove.forEach(fingerprint => {
      this.errorSummaries.delete(fingerprint);
    });

    if (errorsToRemove.length > 0 || summariesToRemove.length > 0) {
      this.emit('cleanupCompleted', {
        removedErrors: errorsToRemove.length,
        removedSummaries: summariesToRemove.length,
      });
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Remove global error handlers
    if (typeof window !== 'undefined') {
      if (this.globalErrorHandler) {
        window.removeEventListener('error', this.globalErrorHandler);
      }

      if (this.unhandledRejectionHandler) {
        window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
      }
    }

    this.clearErrors();
    this.removeAllListeners();
  }
}
