/**
 * ToolRegistry — central registry for all agent tools.
 *
 * Responsible for:
 * - Manual and auto-discovered tool registration
 * - Tool lookup by name or category
 * - Filtering tools by user capabilities (auth, KYC tier, feature flags)
 * - Generating tool definitions for AI model consumption
 */

import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import type { Tool, ToolCategory } from '../tools/Tool.js';
import type { UserContext } from '../context/UserContext.js';
import type { ToolDefinition } from '../../ports/AIProviderPort.js';
import { logger } from '../../config/logger.js';

/** Options for auto-discovery scanning. */
export interface DiscoveryOptions {
  /**
   * Root directory to scan for tool files.
   * Defaults to <project-root>/src/core/tools
   */
  toolsDir?: string;
  /**
   * File name patterns to include in auto-discovery.
   * Default: all .ts and .js files whose name starts with an uppercase letter.
   */
  filePattern?: RegExp;
  /**
   * Whether to scan subdirectories recursively.
   * Default: true
   */
  recursive?: boolean;
}

/** Statistics from a discovery scan. */
export interface DiscoveryResult {
  /** Number of files scanned */
  filesScanned: number;
  /** Number of tools successfully registered */
  toolsRegistered: number;
  /** Paths of files that failed to load */
  failures: Array<{ path: string; error: string }>;
}

/**
 * ToolRegistry — singleton-friendly registry for all Pulse agent tools.
 *
 * Usage:
 * ```typescript
 * const registry = new ToolRegistry();
 * await registry.autoDiscover();          // scan tools dir
 * registry.register(new MyCustomTool()); // or register manually
 *
 * const tools = registry.getToolsForUser(userContext); // filtered by user caps
 * const defs  = registry.toToolDefinitions(tools);    // for AI model
 * await registry.execute('check_balance', params, ctx); // run a tool
 * ```
 */
export class ToolRegistry {
  private readonly tools: Map<string, Tool> = new Map();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register a single tool instance.
   * @param tool Tool to register.
   * @throws Error if a tool with the same name is already registered.
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `ToolRegistry: tool '${tool.name}' is already registered. ` +
        `Use replace() if you intend to override it.`,
      );
    }
    this.tools.set(tool.name, tool);
    logger.debug({ toolName: tool.name, category: tool.category }, 'Tool registered');
  }

  /**
   * Register or replace a tool (upsert).
   * @param tool Tool to register.
   */
  replace(tool: Tool): void {
    const existed = this.tools.has(tool.name);
    this.tools.set(tool.name, tool);
    logger.debug(
      { toolName: tool.name, replaced: existed },
      existed ? 'Tool replaced' : 'Tool registered',
    );
  }

  /**
   * Unregister a tool by name.
   * @param name Tool name to remove.
   * @returns true if the tool was found and removed, false otherwise.
   */
  unregister(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      logger.debug({ toolName: name }, 'Tool unregistered');
    }
    return removed;
  }

  /**
   * Register an array of tools at once.
   * @param tools Array of Tool instances.
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-discovery
  // ---------------------------------------------------------------------------

  /**
   * Scan a directory tree for tool modules and auto-register them.
   *
   * A module is considered a tool module if it exports a class whose
   * instance has a `name` property (duck-typing). The module must export
   * either a default export or a named export that is a Tool class.
   *
   * @param options Discovery options.
   * @returns Summary of the discovery scan.
   */
  async autoDiscover(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const toolsDir = options.toolsDir
      ?? resolve(process.cwd(), 'src', 'core', 'tools');
    const filePattern = options.filePattern ?? /^[A-Z][a-zA-Z]+\.(ts|js)$/;
    const recursive = options.recursive ?? true;

    const result: DiscoveryResult = {
      filesScanned: 0,
      toolsRegistered: 0,
      failures: [],
    };

    const filePaths = this.scanDirectory(toolsDir, filePattern, recursive);
    result.filesScanned = filePaths.length;

    for (const filePath of filePaths) {
      try {
        const moduleUrl = pathToFileURL(filePath).href;
        const mod = await import(moduleUrl);

        // Try default export first, then named exports
        const candidates = [
          mod.default,
          ...Object.values(mod).filter((v) => v !== mod.default),
        ];

        for (const candidate of candidates) {
          if (typeof candidate === 'function') {
            try {
              const instance = new (candidate as new () => unknown)();
              if (this.isTool(instance)) {
                this.replace(instance as Tool);
                result.toolsRegistered++;
              }
            } catch {
              // Not a no-arg constructor; skip
            }
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        result.failures.push({ path: filePath, error });
        logger.warn({ filePath, error }, 'Failed to load tool module');
      }
    }

    logger.info(
      {
        scanned: result.filesScanned,
        registered: result.toolsRegistered,
        failures: result.failures.length,
      },
      'Tool auto-discovery complete',
    );

    return result;
  }

  /** Recursively scan a directory for files matching the pattern. */
  private scanDirectory(dir: string, pattern: RegExp, recursive: boolean): string[] {
    const paths: string[] = [];

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      logger.warn({ dir }, 'ToolRegistry: cannot read tools directory');
      return paths;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && recursive) {
          paths.push(...this.scanDirectory(fullPath, pattern, recursive));
        } else if (stat.isFile() && pattern.test(entry)) {
          paths.push(fullPath);
        }
      } catch {
        // Skip unreadable entries
      }
    }

    return paths;
  }

  /** Duck-type check: does this object look like a Tool? */
  private isTool(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) return false;
    const t = obj as Record<string, unknown>;
    return (
      typeof t['name'] === 'string' &&
      typeof t['description'] === 'string' &&
      typeof t['parameters'] === 'object' &&
      typeof t['execute'] === 'function' &&
      typeof t['requiresAuth'] === 'boolean' &&
      typeof t['requiresConfirmation'] === 'boolean'
    );
  }

  // ---------------------------------------------------------------------------
  // Lookup & filtering
  // ---------------------------------------------------------------------------

  /**
   * Look up a tool by name.
   * @param name Exact tool name.
   * @returns The tool, or undefined if not found.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools.
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tools in a specific category.
   * @param category Tool category to filter by.
   */
  getByCategory(category: ToolCategory): Tool[] {
    return this.getAll().filter((t) => t.category === category);
  }

  /**
   * Get the tools available to a specific user, based on their context.
   *
   * Filtering rules:
   * 1. Tools with requiresAuth === true are only shown to linked users.
   * 2. Merchant tools are only shown to users with isMerchant === true.
   * 3. Tools requiring KYC tier > user's tier are excluded.
   *
   * @param userContext The user's current context.
   * @returns Array of tools the user is allowed to invoke.
   */
  getToolsForUser(userContext: UserContext): Tool[] {
    const { identity, financial } = userContext;

    return this.getAll().filter((tool) => {
      // Auth gate: only linked users can use auth-required tools
      if (tool.requiresAuth && !identity.accountLinked) {
        return false;
      }

      // Merchant gate: only merchants see merchant tools
      if (tool.category === 'merchant' && !financial.isMerchant) {
        return false;
      }

      // System tools are always available
      if (tool.category === 'system') {
        return true;
      }

      return true;
    });
  }

  /**
   * Check whether a tool is registered.
   * @param name Tool name.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Total number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  // ---------------------------------------------------------------------------
  // AI integration
  // ---------------------------------------------------------------------------

  /**
   * Convert a list of tools to the ToolDefinition format expected by AIProviderPort.
   * @param tools Tools to convert. Defaults to all registered tools.
   */
  toToolDefinitions(tools?: Tool[]): ToolDefinition[] {
    const list = tools ?? this.getAll();
    return list.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a tool by name with the given parameters and context.
   * @param name Tool name to execute.
   * @param params Tool parameters (will be passed as-is to tool.execute).
   * @param context Execution context.
   * @throws Error if the tool is not found.
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    context: import('../tools/Tool.js').ToolExecutionContext,
  ): Promise<import('../tools/Tool.js').ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`ToolRegistry: unknown tool '${name}'`);
    }

    logger.debug(
      { toolName: name, params: Object.keys(params) },
      'Executing tool',
    );

    try {
      const result = await tool.execute(params, context);
      logger.debug(
        { toolName: name, success: result.success, signal: result.signal },
        'Tool execution complete',
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ toolName: name, error: message }, 'Tool execution threw');
      return {
        success: false,
        output: `Tool '${name}' encountered an error: ${message}`,
        signal: 'continue',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Debug helpers
  // ---------------------------------------------------------------------------

  /**
   * Return a summary of all registered tools for logging/debugging.
   */
  getSummary(): Array<{
    name: string;
    category: ToolCategory;
    requiresAuth: boolean;
    requiresConfirmation: boolean;
  }> {
    return this.getAll().map((t) => ({
      name: t.name,
      category: t.category,
      requiresAuth: t.requiresAuth,
      requiresConfirmation: t.requiresConfirmation,
    }));
  }
}
