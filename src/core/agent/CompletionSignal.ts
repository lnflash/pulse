/**
 * CompletionSignal — the output signal from a tool execution.
 *
 * Every tool returns a CompletionSignal alongside its result to tell
 * the AgentLoop what to do next in the conversation.
 */

/**
 * Signals returned by tools to guide the AgentLoop's next action.
 *
 * - `continue`  — Normal. Tool ran successfully; the loop should continue.
 * - `complete`  — The conversation turn is fully resolved. Send the final response.
 * - `clarify`   — The agent needs more information from the user. Pause and ask.
 * - `escalate`  — The situation requires a human agent. Hand off and stop.
 */
export type CompletionSignal = 'continue' | 'complete' | 'clarify' | 'escalate';

/**
 * Determine whether a signal should terminate the current agent loop iteration.
 */
export function isTerminalSignal(signal: CompletionSignal): boolean {
  return signal === 'complete' || signal === 'escalate';
}

/**
 * Determine whether a signal requires user input before continuing.
 */
export function requiresUserInput(signal: CompletionSignal): boolean {
  return signal === 'clarify' || signal === 'escalate';
}
