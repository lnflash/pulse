import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
  type?: 'counter' | 'gauge' | 'histogram' | 'timer';
}

export interface MetricSummary {
  name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly metrics = new Map<string, Metric[]>();
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly timers = new Map<string, number[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Record a metric value
   */
  recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string>,
    type: Metric['type'] = 'gauge',
  ): void {
    const metric: Metric = {
      name,
      value,
      timestamp: new Date(),
      tags,
      type,
    };

    // Store in appropriate collection based on type
    switch (type) {
      case 'counter':
        this.incrementCounter(name, value);
        break;
      case 'gauge':
        this.setGauge(name, value);
        break;
      case 'timer':
        this.recordTimer(name, value);
        break;
      case 'histogram':
        this.recordHistogram(name, value);
        break;
    }

    // Store raw metric
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricArray = this.metrics.get(name)!;
    metricArray.push(metric);

    // Keep only last 1000 values per metric
    if (metricArray.length > 1000) {
      metricArray.shift();
    }

    // Emit metric event
    this.eventEmitter.emit('metrics.recorded', metric);
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, valueOrTags?: number | Record<string, any>, tags?: Record<string, any>): void {
    let value = 1;
    let actualTags: Record<string, any> | undefined;
    
    // Handle overloaded parameters
    if (typeof valueOrTags === 'number') {
      value = valueOrTags;
      actualTags = tags;
    } else if (typeof valueOrTags === 'object') {
      actualTags = valueOrTags;
    }
    
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
    
    // Store metric with tags if provided
    if (actualTags) {
      const taggedName = `${name}_${JSON.stringify(actualTags)}`;
      const taggedCurrent = this.counters.get(taggedName) || 0;
      this.counters.set(taggedName, taggedCurrent + value);
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /**
   * Record a timer value
   */
  recordTimer(name: string, milliseconds: number): void {
    if (!this.timers.has(name)) {
      this.timers.set(name, []);
    }

    const timerArray = this.timers.get(name)!;
    timerArray.push(milliseconds);

    // Keep only last 100 timer values
    if (timerArray.length > 100) {
      timerArray.shift();
    }
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number, tags?: Record<string, any>): void {
    this.recordTimer(name, value); // Reuse timer logic for now
    
    // Store with tags if provided
    if (tags) {
      const taggedName = `${name}_${JSON.stringify(tags)}`;
      this.recordTimer(taggedName, value);
    }
  }

  /**
   * Start a timer
   */
  startTimer(): { end: () => number } {
    const start = Date.now();
    return {
      end: () => {
        const duration = Date.now() - start;
        return duration;
      },
    };
  }

  /**
   * Get metric summary
   */
  getMetricSummary(name: string): MetricSummary | null {
    const metricArray = this.metrics.get(name);
    if (!metricArray || metricArray.length === 0) {
      return null;
    }

    const values = metricArray.map((m) => m.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      name,
      count: values.length,
      sum,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      p50: this.getPercentile(values, 0.5),
      p95: this.getPercentile(values, 0.95),
      p99: this.getPercentile(values, 0.99),
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {
      counters: {},
      gauges: {},
      timers: {},
      summaries: {},
    };

    // Add counters
    this.counters.forEach((value, name) => {
      result.counters[name] = value;
    });

    // Add gauges
    this.gauges.forEach((value, name) => {
      result.gauges[name] = value;
    });

    // Add timer summaries
    this.timers.forEach((values, name) => {
      if (values.length > 0) {
        const sorted = values.sort((a, b) => a - b);
        result.timers[name] = {
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          p50: this.getPercentile(sorted, 0.5),
          p95: this.getPercentile(sorted, 0.95),
          p99: this.getPercentile(sorted, 0.99),
        };
      }
    });

    // Add metric summaries
    this.metrics.forEach((_, name) => {
      const summary = this.getMetricSummary(name);
      if (summary) {
        result.summaries[name] = summary;
      }
    });

    return result;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.timers.clear();
    this.logger.log('All metrics reset');
  }

  /**
   * Reset specific metric
   */
  resetMetric(name: string): void {
    this.metrics.delete(name);
    this.counters.delete(name);
    this.gauges.delete(name);
    this.timers.delete(name);
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Export counters
    this.counters.forEach((value, name) => {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    });

    // Export gauges
    this.gauges.forEach((value, name) => {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    });

    // Export histograms/timers
    this.timers.forEach((values, name) => {
      if (values.length > 0) {
        const sorted = values.sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);

        lines.push(`# TYPE ${name} histogram`);
        lines.push(`${name}_count ${values.length}`);
        lines.push(`${name}_sum ${sum}`);
        lines.push(`${name}_bucket{le="50"} ${values.filter((v) => v <= 50).length}`);
        lines.push(`${name}_bucket{le="100"} ${values.filter((v) => v <= 100).length}`);
        lines.push(`${name}_bucket{le="250"} ${values.filter((v) => v <= 250).length}`);
        lines.push(`${name}_bucket{le="500"} ${values.filter((v) => v <= 500).length}`);
        lines.push(`${name}_bucket{le="1000"} ${values.filter((v) => v <= 1000).length}`);
        lines.push(`${name}_bucket{le="+Inf"} ${values.length}`);
      }
    });

    return lines.join('\n');
  }

  /**
   * Calculate percentile
   */
  private getPercentile(sortedValues: number[], percentile: number): number {
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  /**
   * Periodically clean old metrics
   */
  @Interval(300000) // Every 5 minutes
  private cleanOldMetrics(): void {
    const cutoff = Date.now() - 3600000; // 1 hour ago

    this.metrics.forEach((metricArray, name) => {
      const filtered = metricArray.filter((m) => m.timestamp.getTime() > cutoff);
      if (filtered.length !== metricArray.length) {
        this.metrics.set(name, filtered);
      }
    });
  }

  /**
   * Log metrics summary
   */
  @Interval(60000) // Every minute
  private logMetricsSummary(): void {
    const activeMetrics =
      this.metrics.size + this.counters.size + this.gauges.size + this.timers.size;

    if (activeMetrics > 0) {
      this.logger.debug(`Active metrics: ${activeMetrics}`);
    }
  }
}
