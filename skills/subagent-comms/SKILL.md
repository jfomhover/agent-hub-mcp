---
name: subagent-comms
description: Use when a task benefits from coordinating multiple real OpenCode subagents through shared messaging, including role-based parallel work, private handoffs, event-driven waiting, shared history, attachments, or sequential edits to a common artifact.
---

# Subagent Comms

Use Agent Comms when a main agent needs multiple real OpenCode subagents to coordinate through a shared MCP channel. The main agent is the coordinator: it creates the channel, registers participants, delegates scoped tasks, validates results, and closes the channel.

Agent Comms is experimental. Do not use it with untrusted agents, sensitive data, production credentials, or security-critical workflows without an independent security review.

## Required Preflight

Before delegating work, check that the current session exposes the channel, registration, messaging, polling/waiting, history, status, and close tools described in [references/tool-reference.md](references/tool-reference.md). Do not claim that coordination is available from documentation alone; verify the tools are present and callable.

If the tools are unavailable, use [references/install.md](references/install.md) to configure the MCP server, then restart OpenCode and re-check the tool surface before proceeding.

## Coordinator Workflow

1. Define the mission, workspace root, participant count, roles, turn order, artifact ownership, and completion criteria.
2. Create one channel with `comms_create_channel`.
3. Register each participant with `comms_register_agent`. Prefer sequential registration. A concurrent registration batch can produce transient invalid coordinator-credential errors in some hosts; retry failed registrations sequentially.
4. Record each returned participant token for the assigned participant. Confirm tokens are distinct and that returned participant metadata does not contain tokens.
5. Delegate each real subagent with the Task tool. Each prompt must contain only that participant's channel ID, participant token, agent ID, and role from the credential set. Do not put another participant's token in the prompt.
6. For independent work, delegate in parallel. For shared artifacts or explicit turns, delegate one agent at a time and wait for the previous Task result before starting the next.
7. Use broadcasts for team-visible findings, direct messages for targeted handoffs, `comms_wait` for event-driven recipients, and `comms_poll` for bounded inspection.
8. Read coordinator history with `comms_history`. Validate actual messages, audiences, attachments, and sequence ordering; do not infer success only from Task results or tool schemas.
9. Close the channel with `comms_close_channel`. Confirm the close result, participant completion statuses, rejection of a post-close send, and readability of history after closure when lifecycle testing matters.

The server scrubs coordinator and participant credentials from stored and returned message data. It is still useful to report agent IDs, roles, message sequences, and error codes without reproducing credential values.

## Delegation Rules

Every subagent prompt should include:

- The exact channel ID.
- Only that subagent's participant token.
- That subagent's agent ID and role.
- The Agent Comms tools it may use and the required action.
- The expected completion/status behavior.

Keep prompts explicit about audience and exact text when a protocol test depends on it. For example, say `broadcast` or `direct message to receiver`, and quote exact message bodies. Give direct-message recipients an agent ID, never a participant token.

Recommended prompt skeleton:

```text
You are the <role> participant. Use Agent Comms MCP tools.
Your scoped identity is: channel ID <channel>; participant token <your token>;
agent ID <your id>; role <your role>.
Your task: <bounded deliverable and audience>.
Read/poll/wait as specified. Preserve other agents' work when editing files.
Report actual tool results, including errors. Set status completed when finished.
```

Do not ask a subagent to register itself or invent a participant token; the coordinator receives MCP-generated credentials and passes the assigned token in that agent's Task prompt.

## Communication Patterns

### Broadcast

Use `comms_send` with `audience: "broadcast"` for discoveries, section drafts, turn handoffs, and team-visible status. Keep messages concise enough for history review.

### Direct message

Use `comms_send` with `audience: { "agentId": "target-id" }` for private handoffs. A direct message should not be visible to unrelated participants. Verify recipient visibility with that participant's poll or wait result and verify non-recipient filtering with another participant when testing privacy.

### Wait

Use `comms_wait` for a participant that is waiting for a specific handoff. Prefer it over repeated polling. Use a clear timeout and have the participant report timeout or receipt.

### Poll

Use `comms_poll` for bounded inspection, reviewer roles, or post-hoc visibility checks. Check sequence, sender, audience, body, attachment metadata, `hasMore`, and channel status.

### Attachments

Attachment paths are workspace-relative. Use the attachment object only for a real file reference:

```json
{
  "path": "README.md",
  "kind": "context",
  "note": "Optional non-sensitive context"
}
```

Do not put credentials in attachment paths or notes. Validate the returned attachment metadata and confirm the referenced file is appropriate for the audience.

## Shared-File Collaboration

For agents editing one file, use a single-writer turn protocol:

1. Choose one shared, non-sensitive path and define ownership of each section.
2. Delegate the first agent and wait for its Task result.
3. Require the first agent to read/create the file, make a focused patch, reread it, broadcast a handoff, and mark completed.
4. Delegate the next agent only after the prior turn completes. Require it to read the current file before editing and preserve all existing content.
5. Require every later agent to make an append or narrowly scoped patch, verify the diff or reread the file, and report the final line/content check.
6. The coordinator reads the final file and the complete Comms history, then compares the file to the expected turn order.

Do not run concurrent writers against the same file. Agent Comms coordinates messages but does not provide a file lock or merge conflict resolver. For a real codebase, use normal repository review and tests after the collaboration.

See [references/shared-file-protocol.md](references/shared-file-protocol.md) for a reusable turn checklist.

## Verification Checklist

- Channel name, mission, workspace root, and open status match the request.
- Every required participant is registered with the expected agent ID and role.
- MCP-generated participant tokens are distinct and are absent from participant metadata.
- Each Task prompt contains only the participant's own credential scope.
- Required broadcasts and direct messages appear with the expected audience.
- Wait-based participants actually received the intended event.
- Reviewers see broadcasts they should see and do not see private direct messages.
- Attachments have the expected workspace-relative path and kind.
- History contains the required messages in sequence, with the server's credential scrubbing applied to bodies, paths, notes, and returned history.
- Participant status is completed where required. Note that registration and status activity may be represented in channel/close results rather than message history.
- After closure, sends are rejected with the closed-channel error and history remains readable.

## Error Handling

Record actual MCP error codes and continue only when the invariant still holds. Common cases:

- `UNAUTHORIZED`: verify the exact scoped token and channel ID; retry registration sequentially when the coordinator credential was used concurrently. Do not substitute another participant's token.
- `CHANNEL_CLOSED`: expected for sends after closure; unexpected during active work.
- Empty Task result: inspect coordinator history and the shared artifact rather than assuming the agent did nothing.
- Missing history message: check audience filtering, cursor/sequence, timing, and whether the participant actually sent a message.

If a participant edits a file successfully but cannot broadcast or update status, report those as separate failures. Do not claim the full workflow passed merely because the artifact exists.
