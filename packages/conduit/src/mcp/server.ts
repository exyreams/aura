/**
 * MCP stdio server.
 *
 * Binds every tool in the registry as an MCP `registerTool` call. The handler
 * funnels through `dispatchTool` so MCP, the (future) HTTP gateway, and any
 * later transport share one schema-parsing / scope-checking / idempotency /
 * audit path. There is no MCP-specific business logic here.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { z } from "zod";

import { type DispatchDeps, dispatchTool } from "../core/dispatch.js";
import type { SessionResolver } from "../core/session.js";
import type { Tool } from "../core/types.js";
import { CONDUIT_VERSION } from "../version.js";

export interface ConduitMcpOptions {
  readonly deps: DispatchDeps;
  readonly sessionResolver: SessionResolver;
  /**
   * Token shown to the resolver. For stdio this is whatever the controlling
   * process loaded — env var, OS keychain entry, etc.
   */
  readonly token: string | undefined;
  /** Optional MCP server name shown to the client. */
  readonly serverName?: string;
}

export function createConduitMcpServer(options: ConduitMcpOptions): McpServer {
  const server = new McpServer(
    {
      name: options.serverName ?? "aura-conduit",
      version: CONDUIT_VERSION,
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    },
  );

  for (const tool of options.deps.registry.list()) {
    registerTool(server, tool, options);
  }

  return server;
}

export async function startStdio(options: ConduitMcpOptions): Promise<{
  server: McpServer;
  transport: StdioServerTransport;
}> {
  const server = createConduitMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}

function registerTool(
  server: McpServer,
  tool: Tool,
  options: ConduitMcpOptions,
): void {
  // Every tool in the catalogue uses `strictObject(...)`, which is a
  // `z.ZodObject<...>` with a `.shape` we can hand to the MCP SDK directly.
  // The SDK's `ZodRawShapeCompat` and Zod's `ZodRawShape` are structurally
  // equivalent for our shapes; the cast bridges the nominal type-only gap.
  const shape = (tool.input as unknown as z.ZodObject<z.ZodRawShape>).shape;

  server.registerTool(
    tool.name,
    {
      title: tool.name,
      description: tool.description,
      inputSchema: shape as unknown as ZodRawShapeCompat,
    },
    async (rawInput: Record<string, unknown>) => {
      const session = await options.sessionResolver.resolve(options.token);
      const result = await dispatchTool(options.deps, {
        toolName: tool.name,
        rawInput,
        session,
        ...(options.token !== undefined ? { credential: options.token } : {}),
      });

      if (result.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.value, null, 2),
            },
          ],
          structuredContent: result.value as Record<string, unknown>,
        };
      }
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: result.error,
                requestId: result.requestId,
                tool: result.tool,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
