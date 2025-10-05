import { ITool } from '../interfaces';
import { EventEmitter } from 'eventemitter3';
import { ToolError } from '../types/error.types';

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ITool> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private tags: Map<string, Set<string>> = new Map();

  public register(tool: ITool): void {
    if (this.tools.has(tool.id)) {
      throw new ToolError(
        `Tool with id '${tool.id}' is already registered`,
        'DUPLICATE_TOOL_ID',
        tool.id
      );
    }

    this.tools.set(tool.id, tool);
    
    // Index by category
    const category = tool.metadata?.category || 'general';
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(tool.id);

    // Index by tags
    const tags = tool.metadata?.tags || [];
    tags.forEach(tag => {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(tool.id);
    });

    this.emit('toolRegistered', tool);
  }

  public unregister(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return false;
    }

    this.tools.delete(toolId);

    // Remove from category index
    const category = tool.metadata?.category || 'general';
    this.categories.get(category)?.delete(toolId);
    if (this.categories.get(category)?.size === 0) {
      this.categories.delete(category);
    }

    // Remove from tag index
    const tags = tool.metadata?.tags || [];
    tags.forEach(tag => {
      this.tags.get(tag)?.delete(toolId);
      if (this.tags.get(tag)?.size === 0) {
        this.tags.delete(tag);
      }
    });

    this.emit('toolUnregistered', toolId);
    return true;
  }

  public get(toolId: string): ITool | undefined {
    return this.tools.get(toolId);
  }

  public getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  public getByType(type: ITool['type']): ITool[] {
    return Array.from(this.tools.values()).filter(tool => tool.type === type);
  }

  public getByCategory(category: string): ITool[] {
    const toolIds = this.categories.get(category) || new Set();
    return Array.from(toolIds).map(id => this.tools.get(id)!);
  }

  public getByTag(tag: string): ITool[] {
    const toolIds = this.tags.get(tag) || new Set();
    return Array.from(toolIds).map(id => this.tools.get(id)!);
  }

  public search(query: {
    type?: ITool['type'];
    category?: string;
    tags?: string[];
    name?: string;
    description?: string;
  }): ITool[] {
    let results = Array.from(this.tools.values());

    if (query.type) {
      results = results.filter(tool => tool.type === query.type);
    }

    if (query.category) {
      results = results.filter(tool => 
        (tool.metadata?.category || 'general') === query.category
      );
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(tool => {
        const toolTags = tool.metadata?.tags || [];
        return query.tags!.some(tag => toolTags.includes(tag));
      });
    }

    if (query.name) {
      const nameQuery = query.name.toLowerCase();
      results = results.filter(tool => 
        tool.name.toLowerCase().includes(nameQuery)
      );
    }

    if (query.description) {
      const descQuery = query.description.toLowerCase();
      results = results.filter(tool => 
        tool.description.toLowerCase().includes(descQuery)
      );
    }

    return results;
  }

  public exists(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  public size(): number {
    return this.tools.size;
  }

  public getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  public getTags(): string[] {
    return Array.from(this.tags.keys());
  }

  public clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.tags.clear();
    this.emit('registryCleared');
  }

  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [id, tool] of this.tools) {
      if (!tool.id || tool.id !== id) {
        errors.push(`Tool ${id} has invalid or mismatched id`);
      }
      
      if (!tool.name || !tool.description) {
        errors.push(`Tool ${id} is missing required name or description`);
      }
      
      if (!['server', 'client', 'system'].includes(tool.type)) {
        errors.push(`Tool ${id} has invalid type: ${tool.type}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
