/**
 * Tool — the base interface for every agent tool in Pulse v5.
 *
 * Tools are atomic capabilities the AI agent can invoke. Each tool has:
 * - A JSON Schema describing its parameters (for the AI model)
 * - An execute() method that performs the actual work
 * - Metadata about auth requirements and confirmation gates
 */

import type { CompletionSignal } from '../agent/CompletionSignal.js';
import type { UserContext } from '../context/UserContext.js';

/** Category grouping for tools. */
export type ToolCategory =
  | 'wallet'
  | 'contacts'
  | 'identity'
  | 'merchant'
  | 'discovery'
  | 'system';

/** The result returned by a tool execution. */
export interface ToolResult {
  /**
   * Whether the tool executed successfully.
   * If false, `output` contains a human-readable error description.
   */
  success: boolean;
  /**
   * Human-readable output from the tool.
   * This is what gets fed back into the AI model's context.
   * Write it as if describing the result to the AI.
   */
  output: string;
  /**
   * Signal telling the AgentLoop what to do next.
   * See CompletionSignal for semantics.
   */
  signal: CompletionSignal;
  /**
   * Structured data payload (optional).
   * Not sent to the AI model; used by the Orchestrator for side effects
   * (e.g. sending a payment receipt, updating context).
   */
  data?: Record<string, unknown>;
}

/** Execution context passed to every tool. */
export interface ToolExecutionContext {
  /** Full user context at the time of execution */
  userContext: UserContext;
  /**
   * Callback to update the user context mid-execution.
   * Changes are persisted after the AgentLoop iteration completes.
   */
  updateContext: (patch: Partial<UserContext>) => void;
  /**
   * Correlation ID for tracing this request through logs.
   */
  requestId: string;
}

/**
 * Tool — implement this for every agent capability.
 *
 * Tool instances are registered with the ToolRegistry at startup.
 * The AI model receives the name, description, and parameters for every
 * enabled tool. When the model calls a tool, ToolRegistry.execute() is
 * invoked with the parsed arguments.
 */
export interface Tool {
  /** Unique, lowercase, underscore-separated name. E.g. 'check_balance'. */
  readonly name: string;

  /** One-sentence description for the AI model. Be precise and specific. */
  readonly description: string;

  /**
   * JSON Schema (draft-07) describing the tool's input parameters.
   * This is passed directly to the AI model's tool definitions.
   *
   * Example:
   * ```json
   * {
   *   "type": "object",
   *   "properties": {
   *     "amount": { "type": "number", "description": "Amount in USD" }
   *   },
   *   "required": ["amount"]
   * }
   * ```
   */
  readonly parameters: Record<string, unknown>;

  /** Which category this tool belongs to. Used for filtering and display. */
  readonly category: ToolCategory;

  /**
   * If true, the user must have a linked Flash account to use this tool.
   * The AgentLoop will block unauthenticated users and redirect to onboarding.
   */
  readonly requiresAuth: boolean;

  /**
   * If true, the user must explicitly confirm before the tool executes.
   * Used for irreversible actions like sending payments.
   */
  readonly requiresConfirmation: boolean;

  /**
   * Execute the tool with the given arguments.
   * @param params Tool parameters (validated against this.parameters schema)
   * @param context Execution context including user state and update callback
   */
  execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;
}

/**
 * Abstract base class providing default implementations for common tool boilerplate.
 * Tools can extend this instead of implementing Tool directly.
 */
export abstract class BaseTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;
  abstract readonly category: ToolCategory;

  readonly requiresAuth: boolean = true;
  readonly requiresConfirmation: boolean = false;

  abstract execute(
    params: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;

  /** Helper to create a successful result with continue signal. */
  protected success(output: string, data?: Record<string, unknown>): ToolResult {
    return { success: true, output, signal: 'continue', data };
  }

  /** Helper to create a successful result with complete signal. */
  protected complete(output: string, data?: Record<string, unknown>): ToolResult {
    return { success: true, output, signal: 'complete', data };
  }

  /** Helper to create a clarification request. */
  protected clarify(output: string): ToolResult {
    return { success: true, output, signal: 'clarify' };
  }

  /** Helper to create an escalation result. */
  protected escalate(output: string): ToolResult {
    return { success: false, output, signal: 'escalate' };
  }

  /** Helper to create a failure result. */
  protected fail(output: string): ToolResult {
    return { success: false, output, signal: 'continue' };
  }
}
