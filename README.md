# agent-comms-mcp

> **Experimental security disclaimer:** Agent Comms is an early experimental project and a deliberately naive first approach to local agent-to-agent communication. Its security model has not been thoroughly designed, reviewed, or audited. Do not use it with untrusted agents, sensitive data, or security-critical workflows.

Local MCP collaboration channels for coding agents and subagents.

Agent Comms lets a coordinator create a channel, register role-bearing subagents, and give each subagent an MCP-generated participant token. Agents can broadcast discoveries, send direct messages, attach project-relative file references, wait for messages without busy polling, and leave a complete history for the coordinator.

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
