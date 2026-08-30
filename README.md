# agent-comms-mcp

> **Experimental security disclaimer:** Agent Comms is an early experimental project and a deliberately naive first approach to local agent-to-agent communication. Its security model has not been thoroughly designed, reviewed, or audited. Do not use it with untrusted agents, sensitive data, or security-critical workflows.

Local MCP collaboration channels for coding agents and subagents.

Agent Comms lets a coordinator create a channel, register role-bearing subagents, and give each subagent an MCP-generated participant token. Agents can broadcast discoveries, send direct messages, attach project-relative file references, wait for messages without busy polling, and leave a complete history for the coordinator.

## Run Locally

Install dependencies and build the MCP server:

```sh
npm install
npm run build
node dist/index.js
```

The server uses MCP stdio transport. It is normally launched by an MCP-compatible host rather than run interactively.

For a published npm installation, the equivalent OpenCode command is `["npx", "-y", "agent-comms-mcp"]`.

## OpenCode Configuration

Add the local server to the project or user OpenCode configuration:

```jsonc
{
  "mcp": {
    "agent-comms": {
      "type": "local",
      "command": ["node", "dist/index.js"],
      "cwd": ".",
      "enabled": true
    }
  }
}
```

Restart the OpenCode session after adding a new server so it can start the process and discover its tools. Restrictive agent configurations must also allow the `agent-comms_*` tools for subagents.

OpenCode prefixes MCP tool names with the configured server name. With this configuration, the model-facing names are `agent-comms_comms_create_channel`, `agent-comms_comms_register_agent`, and so on. The explicit permission rule above allows the complete prefixed tool set.

## Package API

The `Hub` service and `createMcpServer` adapter are exported for embedding and testing. The package is designed to publish to npm as an ESM package with generated TypeScript declarations:

```sh
npm run build
npm pack --dry-run
```

The MCP generates coordinator and participant credentials. Subagents receive their participant token from the coordinator in their task context; they never generate their own token.

As a defense-in-depth measure, Agent Comms scrubs coordinator and participant credentials from message bodies, attachment paths and notes, and client message IDs before storing or returning them.
