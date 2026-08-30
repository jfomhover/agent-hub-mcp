import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { Hub } from "../src/hub.js";
import { createMcpServer } from "../src/server.js";

async function connectedClient(hub: Hub) {
  const server = createMcpServer(hub);
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text?: string }>;
  const item = content[0];
  if (!item || item.type !== "text" || !item.text) throw new Error("expected text MCP result");
  return JSON.parse(item.text) as Record<string, unknown>;
}

describe("MCP adapter", () => {
  it("exposes the complete tool surface and preserves token lifecycle", async () => {
    const { client } = await connectedClient(new Hub());
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "comms_create_channel",
      "comms_register_agent",
      "comms_send",
      "comms_poll",
      "comms_wait",
      "comms_history",
      "comms_set_status",
      "comms_close_channel",
    ]);
    const created = text(await client.callTool({ name: "comms_create_channel", arguments: { name: "mcp test", mission: "verify tool calls" } }));
    const channel = created.channel as { channelId: string };
    const coordinatorToken = created.coordinatorToken as string;
    const registered = text(await client.callTool({ name: "comms_register_agent", arguments: { channel_id: channel.channelId, coordinator_token: coordinatorToken, agent_id: "reviewer", display_name: "Reviewer", role: "reviewer" } }));
    expect(registered.participantToken).toEqual(expect.any(String));
    expect(JSON.stringify(registered.participant)).not.toContain(registered.participantToken as string);
    const invalid = await client.callTool({ name: "comms_poll", arguments: { channel_id: channel.channelId, participant_token: "not-valid" } });
    expect(invalid.isError).toBe(true);
    expect(invalid.content).toEqual([{ type: "text", text: JSON.stringify({ code: "UNAUTHORIZED", message: "invalid participant token" }) }]);
  });
});
