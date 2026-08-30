import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

describe("stdio executable", () => {
  it("starts as an MCP server and advertises its tools", async () => {
    const client = new Client({ name: "stdio-test-client", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/index.js")],
      stderr: "pipe",
    });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(8);
    await transport.close();
  }, 15_000);
});
