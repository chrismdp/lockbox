export type Category = "safe" | "unsafe" | "acting" | "unsafe_acting";

export interface LockboxConfig {
  tools: Record<string, string[]>;
  mcp_tools: Record<string, Category>;
  mcp_default: Category;
  bash_patterns: Record<string, string[]>;
}

export interface LockboxState {
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  blocked_tools: string[];
}

export interface HookInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  reason?: string;
}

export interface HookOutput {
  decision: "block";
  reason: string;
}
