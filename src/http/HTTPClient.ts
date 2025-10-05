import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { EventEmitter } from 'eventemitter3';
import { AuthManager } from './AuthManager';

export interface HTTPClientConfig {
  baseURL?: string;
  timeout?: number;
  maxRedirects?: number;
  maxContentLength?: number;
  maxBodyLength?: number;
  validateStatus?: (status: number) => boolean;
  withCredentials?: boolean;
  xsrfCookieName?: string;
  xsrfHeaderName?: string;
}

export interface RequestMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  url: string;
  method: string;
  status?: number;
  size?: number;
  cached?: boolean;
}

export interface HTTPInterceptor {
  name: string;
  request?: (
    config: InternalAxiosRequestConfig
  ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
  response?: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
  error?: (error: AxiosError) => Promise<AxiosError>;
}

export class HTTPClient extends EventEmitter {
  private client: AxiosInstance;
  private authManager: AuthManager;
  private interceptors: Map<string, { request?: number; response?: number }> = new Map();
  private requestMetrics: Map<string, RequestMetrics> = new Map();

  constructor(config?: HTTPClientConfig) {
    super();

    this.authManager = new AuthManager();

    this.client = axios.create({
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 300,
      ...config,
    });

    this.setupDefaultInterceptors();
  }

  public async request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const requestId = this.generateRequestId();

    try {
      this.startRequestMetrics(requestId, config);
      this.emit('requestStarted', { requestId, config });

      const response = await this.client.request<T>(config);

      this.endRequestMetrics(requestId, response);
      this.emit('requestCompleted', { requestId, response });

      return response;
    } catch (error) {
      this.endRequestMetrics(requestId, undefined, error as AxiosError);
      this.emit('requestFailed', { requestId, error });
      throw error;
    }
  }

  public async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  public async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  public async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  public async patch<T = unknown>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  public async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  public addInterceptor(interceptor: HTTPInterceptor): void {
    const interceptorIds: { request?: number; response?: number } = {};

    if (interceptor.request) {
      interceptorIds.request = this.client.interceptors.request.use(interceptor.request, error => {
        if (interceptor.error) {
          return interceptor.error(error);
        }
        return Promise.reject(error);
      });
    }

    if (interceptor.response) {
      interceptorIds.response = this.client.interceptors.response.use(
        interceptor.response,
        error => {
          if (interceptor.error) {
            return interceptor.error(error);
          }
          return Promise.reject(error);
        }
      );
    }

    this.interceptors.set(interceptor.name, interceptorIds);
    this.emit('interceptorAdded', { name: interceptor.name });
  }

  public removeInterceptor(name: string): boolean {
    const interceptorIds = this.interceptors.get(name);
    if (!interceptorIds) {
      return false;
    }

    if (interceptorIds.request !== undefined) {
      this.client.interceptors.request.eject(interceptorIds.request);
    }

    if (interceptorIds.response !== undefined) {
      this.client.interceptors.response.eject(interceptorIds.response);
    }

    this.interceptors.delete(name);
    this.emit('interceptorRemoved', { name });

    return true;
  }

  public setDefaultHeader(name: string, value: string): void {
    this.client.defaults.headers.common[name] = value;
    this.emit('defaultHeaderSet', { name, value });
  }

  public removeDefaultHeader(name: string): void {
    delete this.client.defaults.headers.common[name];
    this.emit('defaultHeaderRemoved', { name });
  }

  public setBaseURL(baseURL: string): void {
    this.client.defaults.baseURL = baseURL;
    this.emit('baseURLChanged', { baseURL });
  }

  public setTimeout(timeout: number): void {
    this.client.defaults.timeout = timeout;
    this.emit('timeoutChanged', { timeout });
  }

  public async setAuthentication(connectionId: string): Promise<void> {
    try {
      const authConfig = await this.authManager.getAuthConfig(connectionId);

      if (authConfig.type === 'bearer') {
        this.setDefaultHeader('Authorization', `Bearer ${authConfig.token}`);
      } else if (authConfig.type === 'basic') {
        const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString(
          'base64'
        );
        this.setDefaultHeader('Authorization', `Basic ${credentials}`);
      } else if (authConfig.type === 'apiKey') {
        if (authConfig.location === 'header' && authConfig.name && authConfig.value) {
          this.setDefaultHeader(authConfig.name, authConfig.value);
        } else if (authConfig.location === 'query' && authConfig.name) {
          // Handle query parameter auth in request interceptor
          this.addInterceptor({
            name: `auth_${connectionId}`,
            request: config => {
              if (!config.params) config.params = {};
              if (authConfig.name) {
                config.params[authConfig.name] = authConfig.value;
              }
              return config;
            },
          });
        }
      }

      this.emit('authenticationSet', { connectionId, type: authConfig.type });
    } catch (error) {
      this.emit('authenticationError', { connectionId, error });
      throw error;
    }
  }

  public clearAuthentication(): void {
    this.removeDefaultHeader('Authorization');

    // Remove auth interceptors
    const authInterceptors = Array.from(this.interceptors.keys()).filter(name =>
      name.startsWith('auth_')
    );

    authInterceptors.forEach(name => this.removeInterceptor(name));

    this.emit('authenticationCleared');
  }

  public getRequestMetrics(requestId?: string): RequestMetrics | RequestMetrics[] {
    if (requestId) {
      return this.requestMetrics.get(requestId) || ({} as RequestMetrics);
    }

    return Array.from(this.requestMetrics.values());
  }

  public clearMetrics(): void {
    this.requestMetrics.clear();
    this.emit('metricsCleared');
  }

  public getStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    activeInterceptors: number;
  } {
    const metrics = Array.from(this.requestMetrics.values());
    const successful = metrics.filter(m => m.status && m.status >= 200 && m.status < 300);
    const failed = metrics.filter(m => !m.status || m.status >= 400);
    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);

    return {
      totalRequests: metrics.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      averageResponseTime: metrics.length > 0 ? totalDuration / metrics.length : 0,
      activeInterceptors: this.interceptors.size,
    };
  }

  public createCancelToken(): { token: unknown; cancel: (message?: string) => void } {
    const source = axios.CancelToken.source();
    return {
      token: source.token,
      cancel: source.cancel,
    };
  }

  public isCancel(error: unknown): boolean {
    return axios.isCancel(error);
  }

  private setupDefaultInterceptors(): void {
    // Request logging interceptor
    this.addInterceptor({
      name: 'requestLogger',
      request: config => {
        this.emit('requestLog', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: config.headers,
          timestamp: new Date().toISOString(),
        });
        return config;
      },
    });

    // Response logging interceptor
    this.addInterceptor({
      name: 'responseLogger',
      response: response => {
        this.emit('responseLog', {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          method: response.config.method?.toUpperCase(),
          duration: this.calculateDuration(response.config),
          timestamp: new Date().toISOString(),
        });
        return response;
      },
      error: async error => {
        this.emit('errorLog', {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          url: error.config?.url,
          method: error.config?.method?.toUpperCase(),
          timestamp: new Date().toISOString(),
        });
        return Promise.reject(error);
      },
    });

    // Content-Type interceptor
    this.addInterceptor({
      name: 'contentType',
      request: config => {
        if (config.data && !config.headers['Content-Type']) {
          if (typeof config.data === 'object') {
            config.headers['Content-Type'] = 'application/json';
          }
        }
        return config;
      },
    });

    // User-Agent interceptor (for Node.js environments)
    if (typeof window === 'undefined') {
      this.addInterceptor({
        name: 'userAgent',
        request: config => {
          if (!config.headers['User-Agent']) {
            config.headers['User-Agent'] = 'Halo-Tools-HTTP-Client/1.0.0';
          }
          return config;
        },
      });
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startRequestMetrics(requestId: string, config: AxiosRequestConfig): void {
    const metrics: RequestMetrics = {
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      url: config.url || '',
      method: (config.method || 'GET').toUpperCase(),
    };

    this.requestMetrics.set(requestId, metrics);
  }

  private endRequestMetrics(requestId: string, response?: AxiosResponse, error?: AxiosError): void {
    const metrics = this.requestMetrics.get(requestId);
    if (!metrics) return;

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;

    if (response) {
      metrics.status = response.status;
      metrics.size = this.calculateResponseSize(response);
    } else if (error?.response) {
      metrics.status = error.response.status;
    }

    // Keep only recent metrics (last 1000 requests)
    if (this.requestMetrics.size > 1000) {
      const oldestKey = this.requestMetrics.keys().next().value;
      if (oldestKey) {
        this.requestMetrics.delete(oldestKey);
      }
    }
  }

  private calculateDuration(_config: unknown): number {
    // This is a simplified calculation
    // In practice, you'd want to store start time in the config
    return 0;
  }

  private calculateResponseSize(response: AxiosResponse): number {
    try {
      if (response.data) {
        if (typeof response.data === 'string') {
          return response.data.length;
        } else {
          return JSON.stringify(response.data).length;
        }
      }
      return 0;
    } catch {
      return 0;
    }
  }

  public destroy(): void {
    // Clear all interceptors
    Array.from(this.interceptors.keys()).forEach(name => {
      this.removeInterceptor(name);
    });

    // Clear metrics
    this.clearMetrics();

    // Remove all listeners
    this.removeAllListeners();
  }
}
