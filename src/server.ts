import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hub, HubError } from "./hub.js";

const audienceSchema = z.union([z.literal("broadcast"), z.object({ agentId: z.string().min(1) })]);
const attachmentSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["context", "working", "handoff", "review"]).optional(),
  note: z.string().optional(),
});

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function failure(error: unknown) {
  if (error instanceof HubError) {
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ code: error.code, message: error.message }) }] };
  }
  throw error;
}

export function createMcpServer(hub = new Hub()): McpServer {
  const server = new McpServer({ name: "agent-comms-mcp", version: "0.1.0" });

  server.registerTool("comms_create_channel", {
    description: "Create a local collaboration channel and receive its coordinator credential.",
    inputSchema: {
      name: z.string().min(1),
      mission: z.string().min(1),
      workspace_root: z.string().optional(),
      coordinator_display_name: z.string().optional(),
    },
  }, async ({ name, mission, workspace_root, coordinator_display_name }) => {
    try {
      return result(hub.createChannel({ name, mission, workspaceRoot: workspace_root, coordinatorDisplayName: coordinator_display_name }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("comms_register_agent", {
    description: "Register a subagent. The MCP generates and returns its participant token; the subagent does not generate one.",
    inputSchema: {
      channel_id: z.string().min(1),
      coordinator_token: z.string().min(1),
      agent_id: z.string().min(1).optional(),
      display_name: z.string().min(1),
      role: z.string().min(1),
      registration_key: z.string().min(1).optional(),
    },
  }, async ({ channel_id, coordinator_token, agent_id, display_name, role, registration_key }) => {
    try {
      return result(hub.registerAgent({ channelId: channel_id, coordinatorToken: coordinator_token, agentId: agent_id, displayName: display_name, role, registrationKey: registration_key }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("comms_send", {
    description: "Publish a broadcast or direct message with optional workspace-relative file references.",
    inputSchema: {
      channel_id: z.string().min(1),
      participant_token: z.string().min(1),
      body: z.string().min(1),
      audience: audienceSchema,
      attachments: z.array(attachmentSchema).optional(),
      client_message_id: z.string().min(1).optional(),
    },
  }, async ({ channel_id, participant_token, body, audience, attachments, client_message_id }) => {
    try {
      return result(hub.send({ channelId: channel_id, participantToken: participant_token, body, audience, attachments, clientMessageId: client_message_id }));
    } catch (error) {
      return failure(error);
    }
  });

  const readInput = {
    channel_id: z.string().min(1),
    participant_token: z.string().min(1),
    after_sequence: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
    include_own_messages: z.boolean().optional(),
  };

  server.registerTool("comms_poll", {
    description: "Read visible channel messages after a sequence cursor without waiting.",
    inputSchema: readInput,
  }, async ({ channel_id, participant_token, after_sequence, limit, include_own_messages }) => {
    try {
      return result(hub.poll({ channelId: channel_id, participantToken: participant_token, afterSequence: after_sequence, limit, includeOwnMessages: include_own_messages }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("comms_wait", {
    description: "Wait for visible channel messages, timeout, or channel closure.",
    inputSchema: { ...readInput, timeout_ms: z.number().int().nonnegative().optional() },
  }, async ({ channel_id, participant_token, after_sequence, limit, include_own_messages, timeout_ms }) => {
    try {
      return result(await hub.wait({ channelId: channel_id, participantToken: participant_token, afterSequence: after_sequence, limit, includeOwnMessages: include_own_messages, timeoutMs: timeout_ms }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("comms_history", {
    description: "Read the complete coordinator-visible channel history with pagination and optional filters.",
    inputSchema: {
      channel_id: z.string().min(1),
      coordinator_token: z.string().min(1),
      after_sequence: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().optional(),
      sender_id: z.string().optional(),
      attachment_path: z.string().optional(),
      audience: audienceSchema.optional(),
    },
  }, async ({ channel_id, coordinator_token, after_sequence, limit, sender_id, attachment_path, audience }) => {
    try {
      return result(hub.history({ channelId: channel_id, credential: coordinator_token, filter: { afterSequence: after_sequence, limit, senderId: sender_id, attachmentPath: attachment_path, audience } }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("comms_set_status", {
    description: "Set the calling participant's collaboration status.",
    inputSchema: {
      channel_id: z.string().min(1),
      participant_token: z.string().min(1),
      status: z.enum(["active", "idle", "completed", "left"]),
    },
  }, async ({ channel_id, participant_token, status }) => {
    try {
      return result(hub.setStatus({ channelId: channel_id, participantToken: participant_token, status }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("comms_close_channel", {
    description: "Close a channel, wake waiters, reject new sends, and preserve history.",
    inputSchema: {
      channel_id: z.string().min(1),
      coordinator_token: z.string().min(1),
    },
  }, async ({ channel_id, coordinator_token }) => {
    try {
      return result(hub.closeChannel({ channelId: channel_id, coordinatorToken: coordinator_token }));
    } catch (error) {
      return failure(error);
    }
  });

  return server;
}
