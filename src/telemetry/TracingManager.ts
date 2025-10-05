import { EventEmitter } from 'eventemitter3';

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, any>;
  logs: Array<{
    timestamp: number;
    fields: Record<string, any>;
  }>;
  status: 'running' | 'completed' | 'error';
  error?: Error;
}

export interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  endTime?: number;
  duration?: number;
  rootSpan?: Span;
}

export interface TracingConfig {
  enabled?: boolean;
  sampleRate?: number; // 0.0 to 1.0
  maxSpans?: number;
  maxTraces?: number;
  retentionPeriod?: number;
  enableAutoInstrumentation?: boolean;
}

export class TracingManager extends EventEmitter {
  private traces: Map<string, Trace> = new Map();
  private activeSpans: Map<string, Span> = new Map();
  private config: TracingConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: TracingConfig = {}) {
    super();
    
    this.config = {
      enabled: true,
      sampleRate: 1.0,
      maxSpans: 1000,
      maxTraces: 100,
      retentionPeriod: 3600000, // 1 hour
      enableAutoInstrumentation: true,
      ...config
    };

    if (this.config.enabled) {
      this.startCleanup();
    }
  }

  public startSpan(
    operationName: string,
    parentSpanId?: string,
    tags?: Record<string, any>
  ): Span {
    if (!this.config.enabled || !this.shouldSample()) {
      return this.createNoOpSpan(operationName);
    }

    const traceId = parentSpanId ? this.getTraceIdFromSpan(parentSpanId) : this.generateTraceId();
    const spanId = this.generateSpanId();
    
    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: Date.now(),
      tags: tags || {},
      logs: [],
      status: 'running'
    };

    this.activeSpans.set(spanId, span);
    this.addSpanToTrace(span);

    this.emit('spanStarted', span);
    
    return span;
  }

  public finishSpan(spanId: string, error?: Error): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'completed';
    
    if (error) {
      span.error = error;
      span.tags.error = true;
      span.tags.errorMessage = error.message;
    }

    this.activeSpans.delete(spanId);
    this.updateTrace(span.traceId);

    this.emit('spanFinished', span);
  }

  public addSpanTag(spanId: string, key: string, value: any): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.tags[key] = value;
      this.emit('spanTagAdded', { spanId, key, value });
    }
  }

  public addSpanLog(spanId: string, fields: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        fields
      });
      this.emit('spanLogAdded', { spanId, fields });
    }
  }

  public getSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId) || this.findSpanInTraces(spanId);
  }

  public getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  public getAllTraces(): Trace[] {
    return Array.from(this.traces.values());
  }

  public getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values());
  }

  public traceFunction<T>(
    operationName: string,
    fn: (span: Span) => T,
    parentSpanId?: string,
    tags?: Record<string, any>
  ): T {
    const span = this.startSpan(operationName, parentSpanId, tags);
    
    try {
      const result = fn(span);
      
      if (result instanceof Promise) {
        return result
          .then((value) => {
            this.finishSpan(span.spanId);
            return value;
          })
          .catch((error) => {
            this.finishSpan(span.spanId, error);
            throw error;
          }) as T;
      } else {
        this.finishSpan(span.spanId);
        return result;
      }
    } catch (error) {
      this.finishSpan(span.spanId, error as Error);
      throw error;
    }
  }

  public async traceAsyncFunction<T>(
    operationName: string,
    fn: (span: Span) => Promise<T>,
    parentSpanId?: string,
    tags?: Record<string, any>
  ): Promise<T> {
    const span = this.startSpan(operationName, parentSpanId, tags);
    
    try {
      const result = await fn(span);
      this.finishSpan(span.spanId);
      return result;
    } catch (error) {
      this.finishSpan(span.spanId, error as Error);
      throw error;
    }
  }

  public createChildSpan(
    parentSpanId: string,
    operationName: string,
    tags?: Record<string, any>
  ): Span {
    return this.startSpan(operationName, parentSpanId, tags);
  }

  public getTraceContext(spanId: string): {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
  } | null {
    const span = this.getSpan(spanId);
    if (!span) return null;

    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId
    };
  }

  public injectTraceHeaders(spanId: string): Record<string, string> {
    const context = this.getTraceContext(spanId);
    if (!context) return {};

    return {
      'X-Trace-Id': context.traceId,
      'X-Span-Id': context.spanId,
      'X-Parent-Span-Id': context.parentSpanId || ''
    };
  }

  public extractTraceHeaders(headers: Record<string, string>): {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
  } {
    return {
      traceId: headers['X-Trace-Id'] || headers['x-trace-id'],
      spanId: headers['X-Span-Id'] || headers['x-span-id'],
      parentSpanId: headers['X-Parent-Span-Id'] || headers['x-parent-span-id']
    };
  }

  public searchTraces(criteria: {
    operationName?: string;
    tags?: Record<string, any>;
    minDuration?: number;
    maxDuration?: number;
    hasError?: boolean;
    startTime?: number;
    endTime?: number;
  }): Trace[] {
    let results = this.getAllTraces();

    if (criteria.operationName) {
      results = results.filter(trace =>
        trace.spans.some(span => 
          span.operationName.includes(criteria.operationName!)
        )
      );
    }

    if (criteria.tags) {
      results = results.filter(trace =>
        trace.spans.some(span =>
          Object.entries(criteria.tags!).every(([key, value]) =>
            span.tags[key] === value
          )
        )
      );
    }

    if (criteria.minDuration !== undefined) {
      results = results.filter(trace =>
        trace.duration !== undefined && trace.duration >= criteria.minDuration!
      );
    }

    if (criteria.maxDuration !== undefined) {
      results = results.filter(trace =>
        trace.duration !== undefined && trace.duration <= criteria.maxDuration!
      );
    }

    if (criteria.hasError !== undefined) {
      results = results.filter(trace =>
        trace.spans.some(span => !!span.error) === criteria.hasError
      );
    }

    if (criteria.startTime || criteria.endTime) {
      results = results.filter(trace => {
        if (criteria.startTime && trace.startTime < criteria.startTime) return false;
        if (criteria.endTime && trace.startTime > criteria.endTime) return false;
        return true;
      });
    }

    return results;
  }

  public exportTraces(): {
    traces: Trace[];
    metadata: {
      exportTime: number;
      totalTraces: number;
      totalSpans: number;
      activeSpans: number;
    };
  } {
    const traces = this.getAllTraces();
    const totalSpans = traces.reduce((sum, trace) => sum + trace.spans.length, 0);

    const exportData = {
      traces,
      metadata: {
        exportTime: Date.now(),
        totalTraces: traces.length,
        totalSpans,
        activeSpans: this.activeSpans.size
      }
    };

    this.emit('tracesExported', exportData);
    
    return exportData;
  }

  public getStats(): {
    totalTraces: number;
    totalSpans: number;
    activeSpans: number;
    averageTraceLength: number;
    averageSpanDuration: number;
    errorRate: number;
  } {
    const traces = this.getAllTraces();
    const allSpans = traces.flatMap(trace => trace.spans);
    const completedSpans = allSpans.filter(span => span.status === 'completed' || span.status === 'error');
    const errorSpans = allSpans.filter(span => span.status === 'error');
    
    const totalDuration = completedSpans
      .filter(span => span.duration !== undefined)
      .reduce((sum, span) => sum + span.duration!, 0);

    return {
      totalTraces: traces.length,
      totalSpans: allSpans.length,
      activeSpans: this.activeSpans.size,
      averageTraceLength: traces.length > 0 ? allSpans.length / traces.length : 0,
      averageSpanDuration: completedSpans.length > 0 ? totalDuration / completedSpans.length : 0,
      errorRate: allSpans.length > 0 ? errorSpans.length / allSpans.length : 0
    };
  }

  public clearTraces(): void {
    this.traces.clear();
    this.activeSpans.clear();
    this.emit('tracesCleared');
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate!;
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSpanId(): string {
    return `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getTraceIdFromSpan(spanId: string): string {
    const span = this.activeSpans.get(spanId) || this.findSpanInTraces(spanId);
    return span?.traceId || this.generateTraceId();
  }

  private findSpanInTraces(spanId: string): Span | undefined {
    for (const trace of this.traces.values()) {
      const span = trace.spans.find(s => s.spanId === spanId);
      if (span) return span;
    }
    return undefined;
  }

  private addSpanToTrace(span: Span): void {
    let trace = this.traces.get(span.traceId);
    
    if (!trace) {
      trace = {
        traceId: span.traceId,
        spans: [],
        startTime: span.startTime
      };
      
      // Limit number of traces
      if (this.traces.size >= this.config.maxTraces!) {
        const oldestTrace = Array.from(this.traces.entries())
          .sort(([, a], [, b]) => a.startTime - b.startTime)[0];
        
        this.traces.delete(oldestTrace[0]);
        this.emit('traceEvicted', { traceId: oldestTrace[0] });
      }
      
      this.traces.set(span.traceId, trace);
    }

    trace.spans.push(span);
    
    // Set root span if this is the first span or has no parent
    if (!trace.rootSpan && !span.parentSpanId) {
      trace.rootSpan = span;
    }

    // Limit spans per trace
    if (trace.spans.length > this.config.maxSpans!) {
      trace.spans.shift(); // Remove oldest span
    }
  }

  private updateTrace(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    const completedSpans = trace.spans.filter(span => span.status !== 'running');
    
    if (completedSpans.length === trace.spans.length) {
      // All spans completed
      trace.endTime = Math.max(...completedSpans.map(span => span.endTime || 0));
      trace.duration = trace.endTime - trace.startTime;
      
      this.emit('traceCompleted', trace);
    }
  }

  private createNoOpSpan(operationName: string): Span {
    return {
      traceId: 'noop',
      spanId: 'noop',
      operationName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      status: 'completed'
    };
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 60000); // Run cleanup every minute
  }

  private performCleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod!;
    
    // Clean up old traces
    const tracesToRemove: string[] = [];
    
    for (const [traceId, trace] of this.traces) {
      if (trace.startTime < cutoff) {
        tracesToRemove.push(traceId);
      }
    }
    
    tracesToRemove.forEach(traceId => {
      this.traces.delete(traceId);
    });

    // Clean up orphaned active spans
    const spansToRemove: string[] = [];
    
    for (const [spanId, span] of this.activeSpans) {
      if (span.startTime < cutoff) {
        spansToRemove.push(spanId);
      }
    }
    
    spansToRemove.forEach(spanId => {
      this.activeSpans.delete(spanId);
    });

    if (tracesToRemove.length > 0 || spansToRemove.length > 0) {
      this.emit('cleanupCompleted', {
        removedTraces: tracesToRemove.length,
        removedSpans: spansToRemove.length
      });
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.clearTraces();
    this.removeAllListeners();
  }
}
