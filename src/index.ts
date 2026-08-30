#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

export { Hub, HubError } from "./hub.js";
export { createMcpServer } from "./server.js";

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
