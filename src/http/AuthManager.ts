import { EventEmitter } from 'eventemitter3';

export interface AuthConfig {
  id: string;
  type: 'bearer' | 'basic' | 'apiKey' | 'oauth2' | 'custom';
  name?: string;
  description?: string;

  // Bearer token auth
  token?: string;

  // Basic auth
  username?: string;
  password?: string;

  // API Key auth
  value?: string;
  location?: 'header' | 'query' | 'cookie';

  // OAuth2 auth
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenEndpoint?: string;
  scope?: string[];

  // Custom auth
  customHeaders?: Record<string, string>;
  customParams?: Record<string, string>;

  // Common properties
  expiresAt?: number;
  refreshable?: boolean;
  metadata?: Record<string, any>;
}

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

export class AuthManager extends EventEmitter {
  private authConfigs: Map<string, AuthConfig> = new Map();
  private refreshPromises: Map<string, Promise<TokenRefreshResult>> = new Map();

  public async setAuthConfig(config: AuthConfig): Promise<void> {
    // Validate the configuration
    this.validateAuthConfig(config);

    // Encrypt sensitive data before storing
    const encryptedConfig = this.encryptSensitiveData(config);

    this.authConfigs.set(config.id, encryptedConfig);
    this.emit('authConfigSet', { id: config.id, type: config.type });
  }

  public async getAuthConfig(connectionId: string): Promise<AuthConfig> {
    const config = this.authConfigs.get(connectionId);
    if (!config) {
      throw new Error(`Auth configuration not found: ${connectionId}`);
    }

    // Decrypt sensitive data
    const decryptedConfig = this.decryptSensitiveData(config);

    // Check if token needs refresh
    if (this.needsRefresh(decryptedConfig)) {
      return await this.refreshAuthConfig(decryptedConfig);
    }

    return decryptedConfig;
  }

  public async removeAuthConfig(connectionId: string): Promise<boolean> {
    const removed = this.authConfigs.delete(connectionId);
    if (removed) {
      this.emit('authConfigRemoved', { id: connectionId });
    }
    return removed;
  }

  public listAuthConfigs(): Array<{ id: string; type: string; name?: string }> {
    return Array.from(this.authConfigs.values()).map(config => ({
      id: config.id,
      type: config.type,
      name: config.name,
    }));
  }

  public async testAuthConfig(
    connectionId: string,
    testEndpoint?: string
  ): Promise<{
    success: boolean;
    status?: number;
    error?: string;
  }> {
    try {
      const config = await this.getAuthConfig(connectionId);

      if (testEndpoint) {
        // Test against provided endpoint
        return await this.performAuthTest(config, testEndpoint);
      } else {
        // Perform basic validation
        return { success: this.isValidAuthConfig(config) };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  public async refreshToken(connectionId: string): Promise<TokenRefreshResult> {
    const config = this.authConfigs.get(connectionId);
    if (!config) {
      return {
        success: false,
        error: `Auth configuration not found: ${connectionId}`,
      };
    }

    // Check if refresh is already in progress
    const existingPromise = this.refreshPromises.get(connectionId);
    if (existingPromise) {
      return existingPromise;
    }

    // Start refresh process
    const refreshPromise = this.performTokenRefresh(config);
    this.refreshPromises.set(connectionId, refreshPromise);

    try {
      const result = await refreshPromise;

      if (result.success && result.accessToken) {
        // Update stored config with new tokens
        const updatedConfig = {
          ...config,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || config.refreshToken,
          expiresAt: result.expiresIn ? Date.now() + result.expiresIn * 1000 : undefined,
        };

        await this.setAuthConfig(updatedConfig);
        this.emit('tokenRefreshed', { id: connectionId });
      }

      return result;
    } finally {
      this.refreshPromises.delete(connectionId);
    }
  }

  public async createBearerAuth(
    id: string,
    token: string,
    options?: {
      name?: string;
      description?: string;
      expiresAt?: number;
    }
  ): Promise<void> {
    const config: AuthConfig = {
      id,
      type: 'bearer',
      token,
      name: options?.name,
      description: options?.description,
      expiresAt: options?.expiresAt,
    };

    await this.setAuthConfig(config);
  }

  public async createBasicAuth(
    id: string,
    username: string,
    password: string,
    options?: {
      name?: string;
      description?: string;
    }
  ): Promise<void> {
    const config: AuthConfig = {
      id,
      type: 'basic',
      username,
      password,
      name: options?.name,
      description: options?.description,
    };

    await this.setAuthConfig(config);
  }

  public async createApiKeyAuth(
    id: string,
    name: string,
    value: string,
    location: 'header' | 'query' | 'cookie' = 'header',
    options?: {
      displayName?: string;
      description?: string;
    }
  ): Promise<void> {
    const config: AuthConfig = {
      id,
      type: 'apiKey',
      name: options?.displayName || name,
      value,
      location,
      description: options?.description,
    };

    await this.setAuthConfig(config);
  }

  public async createOAuth2Auth(
    id: string,
    clientId: string,
    clientSecret: string,
    tokenEndpoint: string,
    options?: {
      name?: string;
      description?: string;
      scope?: string[];
      accessToken?: string;
      refreshToken?: string;
    }
  ): Promise<void> {
    const config: AuthConfig = {
      id,
      type: 'oauth2',
      clientId,
      clientSecret,
      tokenEndpoint,
      scope: options?.scope,
      accessToken: options?.accessToken,
      refreshToken: options?.refreshToken,
      refreshable: true,
      name: options?.name,
      description: options?.description,
    };

    await this.setAuthConfig(config);
  }

  private validateAuthConfig(config: AuthConfig): void {
    if (!config.id) {
      throw new Error('Auth configuration must have an id');
    }

    if (!config.type) {
      throw new Error('Auth configuration must have a type');
    }

    switch (config.type) {
      case 'bearer':
        if (!config.token) {
          throw new Error('Bearer auth requires a token');
        }
        break;

      case 'basic':
        if (!config.username || !config.password) {
          throw new Error('Basic auth requires username and password');
        }
        break;

      case 'apiKey':
        if (!config.name || !config.value) {
          throw new Error('API Key auth requires name and value');
        }
        if (!['header', 'query', 'cookie'].includes(config.location || '')) {
          throw new Error('API Key location must be header, query, or cookie');
        }
        break;

      case 'oauth2':
        if (!config.clientId || !config.clientSecret || !config.tokenEndpoint) {
          throw new Error('OAuth2 auth requires clientId, clientSecret, and tokenEndpoint');
        }
        break;
    }
  }

  private isValidAuthConfig(config: AuthConfig): boolean {
    try {
      this.validateAuthConfig(config);
      return true;
    } catch {
      return false;
    }
  }

  private needsRefresh(config: AuthConfig): boolean {
    if (!config.refreshable || config.type !== 'oauth2') {
      return false;
    }

    if (!config.expiresAt) {
      return false;
    }

    // Refresh if token expires within next 5 minutes
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() + bufferTime >= config.expiresAt;
  }

  private async refreshAuthConfig(config: AuthConfig): Promise<AuthConfig> {
    if (config.type !== 'oauth2' || !config.refreshable) {
      return config;
    }

    const refreshResult = await this.refreshToken(config.id);

    if (refreshResult.success) {
      return await this.getAuthConfig(config.id); // Get updated config
    }

    // If refresh failed, return original config and let the request fail
    this.emit('tokenRefreshFailed', {
      id: config.id,
      error: refreshResult.error,
    });

    return config;
  }

  private async performTokenRefresh(config: AuthConfig): Promise<TokenRefreshResult> {
    if (config.type !== 'oauth2' || !config.refreshToken || !config.tokenEndpoint) {
      return {
        success: false,
        error: 'Invalid OAuth2 configuration for token refresh',
      };
    }

    try {
      const response = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken,
          ...(config.scope && { scope: config.scope.join(' ') }),
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();

      return {
        success: true,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async performAuthTest(
    config: AuthConfig,
    testEndpoint: string
  ): Promise<{
    success: boolean;
    status?: number;
    error?: string;
  }> {
    try {
      const headers: Record<string, string> = {};
      const params = new URLSearchParams();

      // Apply auth based on type
      switch (config.type) {
        case 'bearer':
          headers.Authorization = `Bearer ${config.token}`;
          break;

        case 'basic': {
          const credentials = Buffer.from(`${config.username}:${config.password}`).toString(
            'base64'
          );
          headers.Authorization = `Basic ${credentials}`;
          break;
        }

        case 'apiKey':
          if (config.location === 'header' && config.name && config.value) {
            headers[config.name] = config.value;
          } else if (config.location === 'query' && config.name && config.value) {
            params.append(config.name, config.value);
          }
          break;

        case 'oauth2':
          if (config.accessToken) {
            headers.Authorization = `Bearer ${config.accessToken}`;
          }
          break;
      }

      const url =
        config.location === 'query' && params.toString()
          ? `${testEndpoint}?${params.toString()}`
          : testEndpoint;

      const response = await fetch(url, { headers });

      return {
        success: response.ok,
        status: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private encryptSensitiveData(config: AuthConfig): AuthConfig {
    // In a real implementation, you'd use proper encryption
    // For now, this is a placeholder that just returns the config
    // You should implement actual encryption for sensitive fields like:
    // - token, password, clientSecret, accessToken, refreshToken
    return { ...config };
  }

  private decryptSensitiveData(config: AuthConfig): AuthConfig {
    // In a real implementation, you'd decrypt the sensitive data
    // For now, this is a placeholder that just returns the config
    return { ...config };
  }

  public clear(): void {
    this.authConfigs.clear();
    this.refreshPromises.clear();
    this.emit('cleared');
  }

  public getStats(): {
    totalConfigs: number;
    configsByType: Record<string, number>;
    activeRefreshes: number;
  } {
    const configsByType: Record<string, number> = {};

    for (const config of this.authConfigs.values()) {
      configsByType[config.type] = (configsByType[config.type] || 0) + 1;
    }

    return {
      totalConfigs: this.authConfigs.size,
      configsByType,
      activeRefreshes: this.refreshPromises.size,
    };
  }
}
