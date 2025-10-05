import { EventEmitter } from 'eventemitter3';
import * as crypto from 'crypto';

export interface WebhookValidationConfig {
  secret: string;
  algorithm: 'sha1' | 'sha256' | 'sha512';
  headerName: string;
  prefix?: string; // e.g., 'sha256=' for GitHub
  encoding: 'hex' | 'base64';
}

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  computedSignature?: string;
  providedSignature?: string;
}

export class WebhookValidator extends EventEmitter {
  private configs: Map<string, WebhookValidationConfig> = new Map();

  public setConfig(id: string, config: WebhookValidationConfig): void {
    this.validateConfig(config);
    this.configs.set(id, config);
    this.emit('configSet', { id, algorithm: config.algorithm });
  }

  public removeConfig(id: string): boolean {
    const removed = this.configs.delete(id);
    if (removed) {
      this.emit('configRemoved', { id });
    }
    return removed;
  }

  public validate(
    id: string,
    payload: string | Buffer,
    signature: string
  ): WebhookValidationResult {
    const config = this.configs.get(id);
    if (!config) {
      return {
        valid: false,
        error: `Webhook configuration not found: ${id}`
      };
    }

    try {
      const computedSignature = this.computeSignature(payload, config);
      const providedSignature = this.normalizeSignature(signature, config);

      const valid = this.secureCompare(computedSignature, providedSignature);

      this.emit('validationAttempt', {
        id,
        valid,
        algorithm: config.algorithm,
        payloadSize: Buffer.isBuffer(payload) ? payload.length : payload.length
      });

      return {
        valid,
        computedSignature,
        providedSignature,
        error: valid ? undefined : 'Signature validation failed'
      };
    } catch (error) {
      this.emit('validationError', { id, error });
      return {
        valid: false,
        error: (error as Error).message
      };
    }
  }

  public validateRequest(
    id: string,
    request: {
      body: string | Buffer;
      headers: Record<string, string | string[]>;
    }
  ): WebhookValidationResult {
    const config = this.configs.get(id);
    if (!config) {
      return {
        valid: false,
        error: `Webhook configuration not found: ${id}`
      };
    }

    // Extract signature from headers
    const headerValue = request.headers[config.headerName.toLowerCase()];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!signature) {
      return {
        valid: false,
        error: `Signature header not found: ${config.headerName}`
      };
    }

    return this.validate(id, request.body, signature);
  }

  public computeSignature(
    payload: string | Buffer,
    config: WebhookValidationConfig
  ): string {
    const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    
    const hmac = crypto.createHmac(config.algorithm, config.secret);
    hmac.update(payloadBuffer);
    
    const signature = hmac.digest(config.encoding);
    
    return config.prefix ? `${config.prefix}${signature}` : signature;
  }

  public createGitHubConfig(id: string, secret: string): void {
    this.setConfig(id, {
      secret,
      algorithm: 'sha256',
      headerName: 'X-Hub-Signature-256',
      prefix: 'sha256=',
      encoding: 'hex'
    });
  }

  public createSlackConfig(id: string, secret: string): void {
    this.setConfig(id, {
      secret,
      algorithm: 'sha256',
      headerName: 'X-Slack-Signature',
      prefix: 'v0=',
      encoding: 'hex'
    });
  }

  public createStripeConfig(id: string, secret: string): void {
    this.setConfig(id, {
      secret,
      algorithm: 'sha256',
      headerName: 'Stripe-Signature',
      encoding: 'hex'
    });
  }

  public createGenericConfig(
    id: string,
    secret: string,
    algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha256',
    headerName: string = 'X-Signature',
    options?: {
      prefix?: string;
      encoding?: 'hex' | 'base64';
    }
  ): void {
    this.setConfig(id, {
      secret,
      algorithm,
      headerName,
      prefix: options?.prefix,
      encoding: options?.encoding || 'hex'
    });
  }

  public listConfigs(): Array<{
    id: string;
    algorithm: string;
    headerName: string;
    hasPrefix: boolean;
    encoding: string;
  }> {
    return Array.from(this.configs.entries()).map(([id, config]) => ({
      id,
      algorithm: config.algorithm,
      headerName: config.headerName,
      hasPrefix: !!config.prefix,
      encoding: config.encoding
    }));
  }

  public testConfig(id: string, testPayload: string = 'test'): {
    success: boolean;
    signature?: string;
    error?: string;
  } {
    const config = this.configs.get(id);
    if (!config) {
      return {
        success: false,
        error: `Configuration not found: ${id}`
      };
    }

    try {
      const signature = this.computeSignature(testPayload, config);
      return {
        success: true,
        signature
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private validateConfig(config: WebhookValidationConfig): void {
    if (!config.secret) {
      throw new Error('Webhook secret is required');
    }

    if (!['sha1', 'sha256', 'sha512'].includes(config.algorithm)) {
      throw new Error('Invalid algorithm. Must be sha1, sha256, or sha512');
    }

    if (!config.headerName) {
      throw new Error('Header name is required');
    }

    if (!['hex', 'base64'].includes(config.encoding)) {
      throw new Error('Invalid encoding. Must be hex or base64');
    }
  }

  private normalizeSignature(signature: string, config: WebhookValidationConfig): string {
    if (config.prefix && signature.startsWith(config.prefix)) {
      return signature.substring(config.prefix.length);
    }
    return signature;
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    // Use crypto.timingSafeEqual for constant-time comparison
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    
    if (bufferA.length !== bufferB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
  }

  public getStats(): {
    totalConfigs: number;
    configsByAlgorithm: Record<string, number>;
    totalValidations: number;
    successfulValidations: number;
  } {
    const configsByAlgorithm: Record<string, number> = {};
    
    for (const config of this.configs.values()) {
      configsByAlgorithm[config.algorithm] = (configsByAlgorithm[config.algorithm] || 0) + 1;
    }

    return {
      totalConfigs: this.configs.size,
      configsByAlgorithm,
      totalValidations: this.listenerCount('validationAttempt'),
      successfulValidations: this.listenerCount('validationAttempt') // This would need proper tracking
    };
  }

  public clear(): void {
    this.configs.clear();
    this.emit('cleared');
  }
}
