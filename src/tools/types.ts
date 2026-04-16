import type { ZodTypeAny } from "zod";

/**
 * Tool definition shared across all tool modules. The `inputSchema` is a Zod
 * raw shape (a flat object whose values are Zod schemas) — this is what the
 * modern @modelcontextprotocol/sdk McpServer.registerTool() accepts directly
 * and converts into JSON Schema for the tools/list wire format.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
