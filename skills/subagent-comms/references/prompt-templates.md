# Agent Comms Prompt Templates

Replace angle-bracket placeholders before delegation. Never place a second participant's token in a prompt.

## Broadcast Worker

```text
You are the <role> participant. Use only Agent Comms MCP tools for coordination.
Scoped identity: channel ID `<channel-id>`; participant token `<your-token>`;
agent ID `<agent-id>`; role `<role>`.

Produce <deliverable>. Broadcast a concise result to the whole channel. Include
<required metadata or exact wording>. Report actual tool results and errors.
Set status `completed` after the work is finished.
```

## Wait-Based Recipient

```text
You are the <role> participant. Use Agent Comms MCP tools.
Scoped identity: channel ID `<channel-id>`; participant token `<your-token>`;
agent ID `<agent-id>`; role `<role>`.

Use `comms_wait` rather than repeatedly polling. Wait for <event from agent>.
Confirm receipt, perform <follow-up>, broadcast the result, and set status
`completed`. Report timeout or any MCP error exactly.
```

## Sequential File Editor

```text
You are turn <n> of a sequential shared-file workflow.
Scoped identity: channel ID `<channel-id>`; participant token `<your-token>`;
agent ID `<agent-id>`; role `<role>`.

Read `<workspace-relative-file>` before editing. Preserve all existing content.
Using apply_patch, make only the assigned change: <bounded change>. Reread the
file or verify the diff, broadcast a concise handoff, and set status `completed`.
Do not edit any other file. Report actual tool results and errors.
```
