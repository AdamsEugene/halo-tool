import { BaseToolExecutor } from '../core/base/ToolExecutor.base';
import { ITool, IToolExecutionContext, IToolResult } from '../core/interfaces';
import { CircuitBreakerError, NetworkError, TimeoutError, ValidationResult } from '../core/types';
import { HTTPClient } from '../http/HTTPClient';
import { CircuitBreaker } from '../resilience/CircuitBreaker';
import { RequestDeduplicator } from '../resilience/RequestDeduplicator';
import { RetryManager } from '../resilience/RetryManager';
import { CacheManager } from '../resilience/CacheManager';
import { TemplateProcessor } from '../processors/TemplateProcessor';
import { AssignmentProcessor } from '../processors/AssignmentProcessor';
import axios, { AxiosError, AxiosResponse } from 'axios';

export class ServerToolExecutor extends BaseToolExecutor {
  private httpClient: HTTPClient;
  private circuitBreaker: CircuitBreaker;
  private deduplicator: RequestDeduplicator;
  private retryManager: RetryManager;
  private cacheManager: CacheManager;
  private templateProcessor: TemplateProcessor;
  private assignmentProcessor: AssignmentProcessor;

  constructor() {
    super('server');
    this.httpClient = new HTTPClient();
    this.circuitBreaker = new CircuitBreaker();
    this.deduplicator = new RequestDeduplicator();
    this.retryManager = new RetryManager();
    this.cacheManager = new CacheManager();
    this.templateProcessor = new TemplateProcessor();
    this.assignmentProcessor = new AssignmentProcessor();
  }

  protected async executeInternal(
    tool: ITool,
    context: IToolExecutionContext
  ): Promise<IToolResult> {
    if (!tool.api) {
      throw new Error('Server tool must have API configuration');
    }

    const startTime = Date.now();
    let retryCount = 0;

    try {
      // Check circuit breaker
      if (tool.api.circuitBreaker?.enabled && this.circuitBreaker.isOpen(tool.id)) {
        throw new CircuitBreakerError('Circuit breaker is open', tool.id);
      }

      // Process dynamic variables and build request
      const processedUrl = this.templateProcessor.process(
        tool.api.url,
        context.state,
        tool.dynamicVariables
      );
      const processedHeaders = this.processHeaders(
        tool.api.headers || {},
        context.state,
        tool.dynamicVariables
      );

      // Check cache
      const cacheKey = this.buildCacheKey(tool, processedUrl, context);
      if (tool.api.cache) {
        const cachedResult = await this.cacheManager.get(
          cacheKey,
          tool.api.cache.strategy || 'memory'
        );
        if (cachedResult) {
          return {
            success: true,
            data: cachedResult,
            executionTime: Date.now() - startTime,
            cached: true,
            retryCount: 0,
          };
        }
      }

      // Check for duplicate requests
      if (tool.api.deduplication?.enabled) {
        const dedupKey = this.buildDeduplicationKey(tool, processedUrl, context);
        const existingRequest = await this.deduplicator.checkAndWait(dedupKey);
        if (existingRequest) {
          return existingRequest;
        }
      }

      // Execute with retry logic
      const executeRequest = async (): Promise<AxiosResponse> => {
        const requestConfig = {
          url: processedUrl,
          method: tool.api!.method,
          headers: processedHeaders,
          timeout: tool.api!.timeoutMs || 30000,
          data: this.buildRequestBody(tool, context),
          params: this.buildQueryParams(tool, context),
        };

        return await this.httpClient.request(requestConfig);
      };

      let response: AxiosResponse;

      if (tool.retry) {
        response = await this.retryManager.execute(executeRequest, tool.retry, error =>
          this.shouldRetry(error, tool.retry?.retryOn || ['timeout', '5xx', 'network'])
        );
        retryCount = this.retryManager.getRetryCount(tool.id) || 0;
      } else {
        response = await executeRequest();
      }

      // Process response and assignments
      let processedData = response.data;
      if (tool.assignments && tool.assignments.length > 0) {
        processedData = await this.assignmentProcessor.process(
          response.data,
          tool.assignments,
          context.state
        );
      }

      // Cache successful response
      if (tool.api.cache && response.status >= 200 && response.status < 300) {
        await this.cacheManager.set(
          cacheKey,
          processedData,
          tool.api.cache.ttlSec || 300,
          tool.api.cache.strategy || 'memory'
        );
      }

      // Update circuit breaker on success
      if (tool.api.circuitBreaker?.enabled) {
        this.circuitBreaker.recordSuccess(tool.id);
      }

      return {
        success: true,
        data: processedData,
        executionTime: Date.now() - startTime,
        cached: false,
        retryCount,
      };
    } catch (error) {
      // Update circuit breaker on failure
      if (tool.api.circuitBreaker?.enabled) {
        this.circuitBreaker.recordFailure(tool.id);
      }

      const executionTime = Date.now() - startTime;

      if (axios.isAxiosError(error)) {
        if ((error as AxiosError).code === 'ECONNABORTED') {
          throw new TimeoutError('Request timeout', tool.id, { timeout: tool.api.timeoutMs });
        }
        if (
          (error as AxiosError).response?.status &&
          (error as AxiosError).response!.status >= 500
        ) {
          throw new NetworkError(
            `Server error: ${(error as AxiosError).response!.status}`,
            tool.id,
            (error as AxiosError).response!.data
          );
        }
      }

      return {
        success: false,
        error: error as Error,
        executionTime,
        retryCount,
      };
    }
  }

  protected async validateTool(tool: ITool): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!tool.api) {
      errors.push('Server tool must have API configuration');
      return { valid: false, errors: errors.map(msg => ({ path: 'api', message: msg })) };
    }

    if (!tool.api.url) {
      errors.push('API URL is required');
    }

    if (!tool.api.method) {
      errors.push('HTTP method is required');
    }

    try {
      new URL(tool.api.url.replace(/\{\{[^}]+\}\}/g, 'placeholder'));
    } catch {
      errors.push('Invalid URL format');
    }

    return {
      valid: errors.length === 0,
      errors: errors.map(msg => ({ path: 'api', message: msg })),
    };
  }

  private processHeaders(
    headers: Record<string, string>,
    state: unknown,
    dynamicVariables?: Record<string, string>
  ): Record<string, string> {
    const processed: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      processed[key] = this.templateProcessor.process(value, state, dynamicVariables);
    }

    return processed;
  }

  private buildRequestBody(tool: ITool, context: IToolExecutionContext): unknown {
    if (!tool.api?.bodySchema || tool.api.method === 'GET') {
      return undefined;
    }

    // Extract body data from state based on schema
    // This is a simplified version - in practice, you'd want more sophisticated mapping
    return this.extractDataFromState(context.state, tool.api.bodySchema);
  }

  private buildQueryParams(tool: ITool, context: IToolExecutionContext): unknown {
    if (!tool.api?.querySchema) {
      return undefined;
    }

    return this.extractDataFromState(context.state, tool.api.querySchema);
  }

  private extractDataFromState(_state: unknown, _schema: unknown): unknown {
    // Simplified implementation - extract data based on schema
    // In practice, this would be more sophisticated
    return {};
  }

  private buildCacheKey(tool: ITool, url: string, context: IToolExecutionContext): string {
    if (tool.api?.cache?.key) {
      return this.templateProcessor.process(
        tool.api.cache.key,
        context.state,
        tool.dynamicVariables
      );
    }
    return `${tool.id}:${url}:${JSON.stringify(context.state).slice(0, 100)}`;
  }

  private buildDeduplicationKey(tool: ITool, url: string, _context: IToolExecutionContext): string {
    if (tool.api?.deduplication?.keyPath) {
      // Extract key from state using JSONPath
      return `${tool.id}:${url}`;
    }
    return `${tool.id}:${url}`;
  }

  private shouldRetry(error: unknown, retryOn: string[]): boolean {
    if (retryOn.includes('all')) return true;

    if (
      retryOn.includes('timeout') &&
      ((error as AxiosError).code === 'ECONNABORTED' || error instanceof TimeoutError)
    ) {
      return true;
    }

    if (
      retryOn.includes('5xx') &&
      axios.isAxiosError(error) &&
      error.response?.status &&
      error.response.status >= 500
    ) {
      return true;
    }

    if (
      retryOn.includes('network') &&
      ((error as AxiosError).code === 'ECONNREFUSED' || (error as AxiosError).code === 'ENOTFOUND')
    ) {
      return true;
    }

    return false;
  }
}
