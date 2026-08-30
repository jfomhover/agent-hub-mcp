# agent-comms-mcp

> **Experimental security disclaimer:** Agent Comms is an early experimental project and a deliberately naive first approach to local agent-to-agent communication. Its security model has not been thoroughly designed, reviewed, or audited. Do not use it with untrusted agents, sensitive data, or security-critical workflows.

Local MCP collaboration channels for coding agents and subagents.

Agent Comms lets a coordinator create a channel, register role-bearing subagents, and give each subagent an MCP-generated participant token. Agents can broadcast discoveries, send direct messages, attach project-relative file references, wait for messages without busy polling, and leave a complete history for the coordinator.

## Why Agent Comms?

A main coding agent can delegate work, but delegation alone does not give subagents a shared coordination surface. Without one, agents duplicate investigations, lose handoffs in task output, or edit shared artifacts without an explicit turn protocol. Agent Comms provides a lightweight collaboration layer for local agent pools: the coordinator defines the mission, assigns roles, and validates the resulting conversation while participants exchange findings through typed audiences and durable sequence history.

This is useful when work has independent strands that need to converge, such as architecture research, UX exploration, security review, and implementation planning. It also supports sequential shared-file workflows where each agent reads the latest artifact, makes one focused change, and hands the file to the next participant. Agent Comms handles coordination; normal review, testing, and version control still validate the work.

## Example: API Migration Team

Suppose a coordinator asks four agents to plan a REST API migration. It creates a channel named `api-migration-design`, registers `api-design`, `compatibility`, `observability`, and `docs`, and delegates one scoped question to each agent. The team can work in parallel, then use broadcasts for synthesis and direct messages for targeted follow-ups:

```text
coordinator -> channel (broadcast)
Mission: plan a backward-compatible migration from API v1 to API v2.

api-design -> channel (broadcast)
Use explicit versioning, stable resource identifiers, idempotent writes, and a
documented compatibility boundary between v1 and v2.

security -> channel (broadcast)
Require scoped credentials, strict input validation, rate limits, and redacted
request tracing during the migration.

docs -> compatibility (direct)
Which deprecated fields and response changes need a migration guide and sunset
timeline?

compatibility -> docs (direct)
Document dual-read behavior, fallback rules, client version detection, and the
date when v1 traffic will stop being accepted.

coordinator -> channel (broadcast)
Synthesis: ship v2 behind a compatibility adapter, observe both versions, and
deprecate v1 only after migration metrics and rollback criteria pass.
```

The coordinator can then read the complete history, verify that direct messages were private to their intended participants, inspect any attachment metadata, and close the channel after every participant reports completion. A representative history response looks like this:

```json
{
  "messages": [
    {
      "sequence": 1,
      "senderId": "api-design",
      "audience": "broadcast",
      "body": "Use explicit versioning, stable identifiers, and a documented compatibility boundary."
    },
    {
      "sequence": 2,
      "senderId": "docs",
      "audience": { "agentId": "compatibility" },
      "body": "Which deprecated fields need a migration guide and sunset timeline?"
    },
    {
      "sequence": 3,
      "senderId": "coordinator",
      "audience": "broadcast",
      "body": "Synthesis: use a compatibility adapter, dual-version observability, and explicit rollback criteria."
    }
  ],
  "nextSequence": 3,
  "hasMore": false,
  "channelStatus": "closed"
}
```

Participant and coordinator credentials are intentionally omitted from examples. Agent Comms scrubs credentials from stored and returned message data.

## Install From npm

Install the package in a project:

```sh
npm install agent-comms-mcp
```

Or let OpenCode launch the published MCP package on demand with `npx`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "agent-comms": {
      "type": "local",
      "command": ["npx", "-y", "agent-comms-mcp"],
      "enabled": true
    }
  },
  "permission": {
    "agent-comms_*": "allow"
  }
}
```

The server uses MCP stdio transport and is normally launched by an MCP-compatible host rather than run interactively. Restart OpenCode after changing its MCP configuration so it can discover the tools.

## Install the Subagent Comms Skill

This repository includes the reusable `subagent-comms` skill under `skills/subagent-comms/`. It teaches a main OpenCode agent how to coordinate pools of real subagents through shared messaging, direct handoffs, waiting, history, attachments, and sequential shared-file turns.

Install the skill with the Skills CLI:

```sh
npx skills add jfomhover/agent-comms-mcp
```

Use `npx skills add jfomhover/agent-comms-mcp -g` for a global installation. Restart OpenCode after installing or changing the skill. Before coordinating work, the skill requires the main agent to verify that the configured MCP server exposes the required tools; see `skills/subagent-comms/references/install.md` for MCP installation notes.

## Develop From Source

For development from this repository, install dependencies and build the MCP server:

```sh
npm install
npm run build
node dist/index.js
```

The equivalent source-checkout OpenCode configuration is:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "agent-comms": {
      "type": "local",
      "command": ["node", "dist/index.js"],
      "cwd": ".",
      "enabled": true
    }
  },
  "permission": {
    "agent-comms_*": "allow"
  }
}
```

OpenCode prefixes MCP tool names with the configured server name. With this configuration, the model-facing names are `agent-comms_comms_create_channel`, `agent-comms_comms_register_agent`, and so on. The explicit permission rule allows the complete prefixed tool set.

## Package API

The `Hub` service and `createMcpServer` adapter are exported for embedding and testing. The npm package is ESM with generated TypeScript declarations:

```ts
import { Hub, createMcpServer } from "agent-comms-mcp";
```

For package validation from a source checkout:

```sh
npm run build
npm pack --dry-run
```

The MCP generates coordinator and participant credentials. Subagents receive their participant token from the coordinator in their task context; they never generate their own token.

As a defense-in-depth measure, Agent Comms scrubs coordinator and participant credentials from message bodies, attachment paths and notes, and client message IDs before storing or returning them.
