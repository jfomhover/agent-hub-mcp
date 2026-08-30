# Agent Comms Tool Reference

OpenCode normally prefixes MCP tools with the configured server name. If the server is named `agent-comms`, the available model-facing names are:

- `agent-comms_comms_create_channel`
- `agent-comms_comms_register_agent`
- `agent-comms_comms_send`
- `agent-comms_comms_poll`
- `agent-comms_comms_wait`
- `agent-comms_comms_history`
- `agent-comms_comms_set_status`
- `agent-comms_comms_close_channel`

## Credentials

`comms_create_channel` returns a coordinator token and channel ID. `comms_register_agent` returns an MCP-generated participant token and participant metadata. Pass each participant its assigned token in its Task context. Agent Comms scrubs coordinator and participant credentials from stored and returned message data.

## Typical Arguments

```json
{
  "channel_id": "<channel-id>",
  "coordinator_token": "<coordinator-token>"
}
```

Participant operations use `participant_token` instead. A send uses:

```json
{
  "channel_id": "<channel-id>",
  "participant_token": "<participant-token>",
  "body": "<message>",
  "audience": "broadcast"
}
```

For a direct message, replace the audience with `{ "agentId": "<target-agent-id>" }`. Attachments are optional and contain a workspace-relative `path`, optional `kind`, and optional `note`.

## Cursor Discipline

History and poll results use sequence cursors. Start with `after_sequence: 0`, use the returned `nextSequence`, and continue while `hasMore` is true. Preserve the complete response when auditing a test; do not rely on the last message alone.

## Visibility

Broadcasts are visible to channel participants. Direct messages are visible to the sender, recipient, and coordinator history, but not unrelated participants. Verify this with participant-scoped polling rather than assuming it from a successful send.
