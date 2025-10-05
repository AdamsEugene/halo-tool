import { BaseToolExecutor } from '../core/base/ToolExecutor.base';
import { ITool, IToolExecutionContext, IToolResult } from '../core/interfaces';
import { ValidationResult } from '../core/types';

export class ClientToolExecutor extends BaseToolExecutor {
  private rollbackStack: Array<{ fn: string; params: any }> = [];

  constructor() {
    super('client');
  }

  protected async executeInternal(
    tool: ITool,
    context: IToolExecutionContext
  ): Promise<IToolResult> {
    if (!tool.client) {
      throw new Error('Client tool must have client configuration');
    }

    const startTime = Date.now();

    try {
      const result = await this.executeClientFunction(tool.client.fn, context);

      // Store rollback function if provided
      if (tool.client.rollback) {
        this.rollbackStack.push({
          fn: tool.client.rollback.fn,
          params: tool.client.rollback.params || result,
        });
      }

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        cached: false,
        retryCount: 0,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        executionTime: Date.now() - startTime,
        retryCount: 0,
      };
    }
  }

  protected async validateTool(tool: ITool): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!tool.client) {
      errors.push('Client tool must have client configuration');
      return { valid: false, errors: errors.map(msg => ({ path: 'client', message: msg })) };
    }

    if (!tool.client.fn) {
      errors.push('Client function name is required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.map(msg => ({ path: 'client', message: msg })),
    };
  }

  private async executeClientFunction(
    functionName: string,
    context: IToolExecutionContext
  ): Promise<any> {
    switch (functionName) {
      case 'openModal':
        return this.openModal(context);

      case 'scrollIntoView':
        return this.scrollIntoView(context);

      case 'focusElement':
        return this.focusElement(context);

      case 'setValue':
        return this.setValue(context);

      default:
        // Try to execute custom function if it exists in global scope
        if (typeof window !== 'undefined' && (window as any)[functionName]) {
          return await (window as any)[functionName](context);
        }
        throw new Error(`Unknown client function: ${functionName}`);
    }
  }

  private async openModal(context: IToolExecutionContext): Promise<any> {
    // Implementation for opening a modal
    // This would typically interact with your UI framework
    if (typeof window === 'undefined') {
      throw new Error('openModal can only be executed in browser environment');
    }

    // Extract modal configuration from context
    const modalConfig = this.extractModalConfig(context);

    // Create and show modal (simplified implementation)
    const modal = document.createElement('div');
    modal.className = 'halo-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>${modalConfig.title || 'Modal'}</h2>
        <p>${modalConfig.content || ''}</p>
        <button onclick="this.closest('.halo-modal').remove()">Close</button>
      </div>
    `;

    document.body.appendChild(modal);

    return { modalId: modal.id, opened: true };
  }

  private async scrollIntoView(context: IToolExecutionContext): Promise<any> {
    if (typeof window === 'undefined') {
      throw new Error('scrollIntoView can only be executed in browser environment');
    }

    const selector = this.extractSelector(context);
    const element = document.querySelector(selector);

    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    return { scrolled: true, element: selector };
  }

  private async focusElement(context: IToolExecutionContext): Promise<any> {
    if (typeof window === 'undefined') {
      throw new Error('focusElement can only be executed in browser environment');
    }

    const selector = this.extractSelector(context);
    const element = document.querySelector(selector) as HTMLElement;

    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    element.focus();

    return { focused: true, element: selector };
  }

  private async setValue(context: IToolExecutionContext): Promise<any> {
    if (typeof window === 'undefined') {
      throw new Error('setValue can only be executed in browser environment');
    }

    const { selector, value } = this.extractSetValueConfig(context);
    const element = document.querySelector(selector) as HTMLInputElement;

    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const oldValue = element.value;
    element.value = value;

    // Trigger change event
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return {
      set: true,
      element: selector,
      oldValue,
      newValue: value,
    };
  }

  private extractModalConfig(context: IToolExecutionContext): any {
    // Extract modal configuration from context state
    // This is a simplified version - in practice, you'd use JSONPath
    return {
      title: context.state?.modal?.title,
      content: context.state?.modal?.content,
    };
  }

  private extractSelector(context: IToolExecutionContext): string {
    // Extract element selector from context
    return context.state?.selector || context.state?.element || 'body';
  }

  private extractSetValueConfig(context: IToolExecutionContext): { selector: string; value: any } {
    return {
      selector: context.state?.selector || context.state?.element,
      value: context.state?.value,
    };
  }

  public async rollback(): Promise<void> {
    // Execute rollback functions in reverse order
    while (this.rollbackStack.length > 0) {
      const rollbackAction = this.rollbackStack.pop()!;
      try {
        await this.executeClientFunction(rollbackAction.fn, {
          toolId: 'rollback',
          instanceId: 'rollback',
          startTime: Date.now(),
          triggeredBy: 'manual',
          state: rollbackAction.params,
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Rollback failed:', error);
        }
      }
    }
  }

  public clearRollbackStack(): void {
    this.rollbackStack = [];
  }
}
