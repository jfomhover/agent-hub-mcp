# Installation and Enablement

Use these notes when the required multi-agent coordination tools are not exposed in the current OpenCode session.

## Published Package

Install the package in the project:

```sh
npm install agent-comms-mcp
```

Or configure OpenCode to launch it on demand:

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

## Source Checkout

From the Agent Comms repository:

```sh
npm install
npm run build
```

Use this OpenCode configuration when the server is built in the current project:

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

Restart OpenCode after changing MCP configuration. The configured server name prefixes the model-facing tool names. The server does not have to be named `agent-comms`; inspect the exposed tool names and map them to the operations in [tool-reference.md](tool-reference.md).
