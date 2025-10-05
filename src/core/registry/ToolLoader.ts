import { ITool } from '../interfaces';
import { ToolRegistry } from './ToolRegistry';
import { ToolError } from '../types/error.types';
import * as fs from 'fs';
import * as path from 'path';

export class ToolLoader {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  public async loadFromFile(filePath: string): Promise<ITool> {
    try {
      const absolutePath = path.resolve(filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new ToolError(
          `Tool file not found: ${absolutePath}`,
          'FILE_NOT_FOUND',
          'unknown'
        );
      }

      const fileContent = fs.readFileSync(absolutePath, 'utf-8');
      const toolConfig = JSON.parse(fileContent) as ITool;

      await this.validateToolConfig(toolConfig);
      this.registry.register(toolConfig);

      return toolConfig;
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
      throw new ToolError(
        `Failed to load tool from file: ${error}`,
        'LOAD_ERROR',
        'unknown',
        { filePath }
      );
    }
  }

  public async loadFromDirectory(dirPath: string, recursive: boolean = false): Promise<ITool[]> {
    const tools: ITool[] = [];
    
    try {
      const absolutePath = path.resolve(dirPath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new ToolError(
          `Directory not found: ${absolutePath}`,
          'DIRECTORY_NOT_FOUND',
          'unknown'
        );
      }

      const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(absolutePath, entry.name);

        if (entry.isFile() && entry.name.endsWith('.json')) {
          try {
            const tool = await this.loadFromFile(entryPath);
            tools.push(tool);
          } catch (error) {
            console.warn(`Failed to load tool from ${entryPath}:`, error);
          }
        } else if (entry.isDirectory() && recursive) {
          const subTools = await this.loadFromDirectory(entryPath, true);
          tools.push(...subTools);
        }
      }

      return tools;
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
      throw new ToolError(
        `Failed to load tools from directory: ${error}`,
        'LOAD_ERROR',
        'unknown',
        { dirPath }
      );
    }
  }

  public async loadFromObject(toolConfig: any): Promise<ITool> {
    await this.validateToolConfig(toolConfig);
    this.registry.register(toolConfig);
    return toolConfig;
  }

  public async loadMultiple(toolConfigs: any[]): Promise<ITool[]> {
    const tools: ITool[] = [];
    
    for (const config of toolConfigs) {
      try {
        const tool = await this.loadFromObject(config);
        tools.push(tool);
      } catch (error) {
        console.warn(`Failed to load tool ${config.id}:`, error);
      }
    }

    return tools;
  }

  public async reloadTool(toolId: string): Promise<ITool | null> {
    const existingTool = this.registry.get(toolId);
    if (!existingTool) {
      return null;
    }

    // If tool has a source file, reload from there
    const sourcePath = (existingTool as any)._sourcePath;
    if (sourcePath) {
      this.registry.unregister(toolId);
      return await this.loadFromFile(sourcePath);
    }

    return null;
  }

  private async validateToolConfig(config: any): Promise<void> {
    if (!config || typeof config !== 'object') {
      throw new ToolError(
        'Tool configuration must be an object',
        'INVALID_CONFIG',
        'unknown'
      );
    }

    if (!config.id || typeof config.id !== 'string') {
      throw new ToolError(
        'Tool must have a valid id',
        'INVALID_ID',
        'unknown'
      );
    }

    if (!config.type || !['server', 'client', 'system'].includes(config.type)) {
      throw new ToolError(
        `Tool must have a valid type (server, client, or system), got: ${config.type}`,
        'INVALID_TYPE',
        config.id
      );
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new ToolError(
        'Tool must have a valid name',
        'INVALID_NAME',
        config.id
      );
    }

    if (!config.description || typeof config.description !== 'string') {
      throw new ToolError(
        'Tool must have a valid description',
        'INVALID_DESCRIPTION',
        config.id
      );
    }

    // Type-specific validations
    if (config.type === 'server' && !config.api) {
      throw new ToolError(
        'Server tool must have api configuration',
        'MISSING_API_CONFIG',
        config.id
      );
    }

    if (config.type === 'client' && !config.client) {
      throw new ToolError(
        'Client tool must have client configuration',
        'MISSING_CLIENT_CONFIG',
        config.id
      );
    }

    if (config.type === 'system' && !config.system) {
      throw new ToolError(
        'System tool must have system configuration',
        'MISSING_SYSTEM_CONFIG',
        config.id
      );
    }
  }
}
