import { EventEmitter } from 'eventemitter3';

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface MetricSummary {
  name: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  unit: string;
  lastUpdated: number;
}

export interface CounterMetric extends Metric {
  type: 'counter';
}

export interface GaugeMetric extends Metric {
  type: 'gauge';
}

export interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets?: number[];
}

export interface TimerMetric extends Metric {
  type: 'timer';
  duration: number;
}

export type MetricType = CounterMetric | GaugeMetric | HistogramMetric | TimerMetric;

export interface MetricsCollectorConfig {
  enableCollection?: boolean;
  maxMetrics?: number;
  aggregationInterval?: number;
  enableExport?: boolean;
  exportInterval?: number;
  retentionPeriod?: number;
}

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, Metric[]> = new Map();
  private summaries: Map<string, MetricSummary> = new Map();
  private config: MetricsCollectorConfig;
  private aggregationTimer?: NodeJS.Timeout;
  private exportTimer?: NodeJS.Timeout;

  constructor(config: MetricsCollectorConfig = {}) {
    super();
    
    this.config = {
      enableCollection: true,
      maxMetrics: 10000,
      aggregationInterval: 60000, // 1 minute
      enableExport: false,
      exportInterval: 300000, // 5 minutes
      retentionPeriod: 3600000, // 1 hour
      ...config
    };

    if (this.config.enableCollection) {
      this.startAggregation();
    }

    if (this.config.enableExport) {
      this.startExport();
    }
  }

  public recordCounter(
    name: string,
    value: number = 1,
    tags?: Record<string, string>,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enableCollection) return;

    const metric: CounterMetric = {
      name,
      value,
      unit: 'count',
      timestamp: Date.now(),
      tags,
      metadata,
      type: 'counter'
    };

    this.addMetric(metric);
    this.emit('counterRecorded', metric);
  }

  public recordGauge(
    name: string,
    value: number,
    unit: string = 'units',
    tags?: Record<string, string>,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enableCollection) return;

    const metric: GaugeMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
      metadata,
      type: 'gauge'
    };

    this.addMetric(metric);
    this.emit('gaugeRecorded', metric);
  }

  public recordHistogram(
    name: string,
    value: number,
    unit: string = 'units',
    buckets?: number[],
    tags?: Record<string, string>,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enableCollection) return;

    const metric: HistogramMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
      metadata,
      type: 'histogram',
      buckets
    };

    this.addMetric(metric);
    this.emit('histogramRecorded', metric);
  }

  public recordTimer(
    name: string,
    duration: number,
    tags?: Record<string, string>,
    metadata?: Record<string, any>
  ): void {
    if (!this.config.enableCollection) return;

    const metric: TimerMetric = {
      name,
      value: duration,
      unit: 'milliseconds',
      timestamp: Date.now(),
      tags,
      metadata,
      type: 'timer',
      duration
    };

    this.addMetric(metric);
    this.emit('timerRecorded', metric);
  }

  public startTimer(name: string): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.recordTimer(name, duration);
    };
  }

  public timeFunction<T>(name: string, fn: () => T): T;
  public timeFunction<T>(name: string, fn: () => Promise<T>): Promise<T>;
  public timeFunction<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result
          .then((value) => {
            this.recordTimer(name, Date.now() - startTime, { status: 'success' });
            return value;
          })
          .catch((error) => {
            this.recordTimer(name, Date.now() - startTime, { status: 'error' });
            throw error;
          });
      } else {
        this.recordTimer(name, Date.now() - startTime, { status: 'success' });
        return result;
      }
    } catch (error) {
      this.recordTimer(name, Date.now() - startTime, { status: 'error' });
      throw error;
    }
  }

  public getMetrics(name?: string): Metric[] {
    if (name) {
      return this.metrics.get(name) || [];
    }
    
    const allMetrics: Metric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }
    
    return allMetrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  public getSummary(name: string): MetricSummary | undefined {
    return this.summaries.get(name);
  }

  public getAllSummaries(): MetricSummary[] {
    return Array.from(this.summaries.values());
  }

  public getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  public clearMetrics(name?: string): void {
    if (name) {
      this.metrics.delete(name);
      this.summaries.delete(name);
    } else {
      this.metrics.clear();
      this.summaries.clear();
    }
    
    this.emit('metricsCleared', { name });
  }

  public exportMetrics(): {
    metrics: Metric[];
    summaries: MetricSummary[];
    metadata: {
      exportTime: number;
      totalMetrics: number;
      uniqueMetricNames: number;
    };
  } {
    const metrics = this.getMetrics();
    const summaries = this.getAllSummaries();
    
    const exportData = {
      metrics,
      summaries,
      metadata: {
        exportTime: Date.now(),
        totalMetrics: metrics.length,
        uniqueMetricNames: this.getMetricNames().length
      }
    };

    this.emit('metricsExported', exportData);
    
    return exportData;
  }

  public getStats(): {
    totalMetrics: number;
    uniqueNames: number;
    oldestMetric: number;
    newestMetric: number;
    memoryUsage: number;
  } {
    const allMetrics = this.getMetrics();
    const oldest = allMetrics.length > 0 ? Math.min(...allMetrics.map(m => m.timestamp)) : 0;
    const newest = allMetrics.length > 0 ? Math.max(...allMetrics.map(m => m.timestamp)) : 0;
    
    return {
      totalMetrics: allMetrics.length,
      uniqueNames: this.getMetricNames().length,
      oldestMetric: oldest,
      newestMetric: newest,
      memoryUsage: this.calculateMemoryUsage()
    };
  }

  public query(options: {
    name?: string;
    tags?: Record<string, string>;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Metric[] {
    let results = this.getMetrics(options.name);

    // Filter by tags
    if (options.tags) {
      results = results.filter(metric => {
        if (!metric.tags) return false;
        
        return Object.entries(options.tags!).every(([key, value]) => 
          metric.tags![key] === value
        );
      });
    }

    // Filter by time range
    if (options.startTime || options.endTime) {
      results = results.filter(metric => {
        if (options.startTime && metric.timestamp < options.startTime) return false;
        if (options.endTime && metric.timestamp > options.endTime) return false;
        return true;
      });
    }

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  public createSnapshot(): {
    timestamp: number;
    metrics: Record<string, Metric[]>;
    summaries: Record<string, MetricSummary>;
  } {
    const snapshot = {
      timestamp: Date.now(),
      metrics: Object.fromEntries(this.metrics),
      summaries: Object.fromEntries(this.summaries)
    };

    this.emit('snapshotCreated', snapshot);
    
    return snapshot;
  }

  public restoreSnapshot(snapshot: {
    metrics: Record<string, Metric[]>;
    summaries: Record<string, MetricSummary>;
  }): void {
    this.metrics.clear();
    this.summaries.clear();

    Object.entries(snapshot.metrics).forEach(([name, metrics]) => {
      this.metrics.set(name, metrics);
    });

    Object.entries(snapshot.summaries).forEach(([name, summary]) => {
      this.summaries.set(name, summary);
    });

    this.emit('snapshotRestored', { 
      metricCount: this.getMetrics().length,
      summaryCount: this.getAllSummaries().length
    });
  }

  private addMetric(metric: Metric): void {
    const metricList = this.metrics.get(metric.name) || [];
    metricList.push(metric);
    
    // Limit metrics per name
    if (metricList.length > this.config.maxMetrics! / this.getMetricNames().length) {
      metricList.shift(); // Remove oldest
    }
    
    this.metrics.set(metric.name, metricList);
    this.updateSummary(metric);
  }

  private updateSummary(metric: Metric): void {
    const existing = this.summaries.get(metric.name);
    
    if (existing) {
      existing.count++;
      existing.sum += metric.value;
      existing.avg = existing.sum / existing.count;
      existing.min = Math.min(existing.min, metric.value);
      existing.max = Math.max(existing.max, metric.value);
      existing.lastUpdated = metric.timestamp;
    } else {
      this.summaries.set(metric.name, {
        name: metric.name,
        count: 1,
        sum: metric.value,
        avg: metric.value,
        min: metric.value,
        max: metric.value,
        unit: metric.unit,
        lastUpdated: metric.timestamp
      });
    }
  }

  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.performAggregation();
    }, this.config.aggregationInterval);
  }

  private startExport(): void {
    this.exportTimer = setInterval(() => {
      this.exportMetrics();
    }, this.config.exportInterval);
  }

  private performAggregation(): void {
    const now = Date.now();
    const cutoff = now - this.config.retentionPeriod!;
    
    // Remove old metrics
    for (const [name, metrics] of this.metrics) {
      const filtered = metrics.filter(m => m.timestamp > cutoff);
      
      if (filtered.length === 0) {
        this.metrics.delete(name);
        this.summaries.delete(name);
      } else if (filtered.length !== metrics.length) {
        this.metrics.set(name, filtered);
        // Recalculate summary
        this.recalculateSummary(name, filtered);
      }
    }

    this.emit('aggregationCompleted', {
      timestamp: now,
      metricsCount: this.getMetrics().length,
      summariesCount: this.getAllSummaries().length
    });
  }

  private recalculateSummary(name: string, metrics: Metric[]): void {
    if (metrics.length === 0) {
      this.summaries.delete(name);
      return;
    }

    const values = metrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    
    this.summaries.set(name, {
      name,
      count: metrics.length,
      sum,
      avg: sum / metrics.length,
      min: Math.min(...values),
      max: Math.max(...values),
      unit: metrics[0].unit,
      lastUpdated: Math.max(...metrics.map(m => m.timestamp))
    });
  }

  private calculateMemoryUsage(): number {
    try {
      const metricsSize = JSON.stringify(Object.fromEntries(this.metrics)).length;
      const summariesSize = JSON.stringify(Object.fromEntries(this.summaries)).length;
      return metricsSize + summariesSize;
    } catch {
      return 0;
    }
  }

  public destroy(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
    }
    
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
    }
    
    this.clearMetrics();
    this.removeAllListeners();
  }
}
