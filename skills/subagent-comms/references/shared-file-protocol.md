# Sequential Shared-File Protocol

Use this protocol when multiple subagents must edit one file without concurrent writers.

## Coordinator

1. Pick one workspace-relative file and state the exact allowed path.
2. Define one bounded contribution per turn.
3. Delegate only the first turn. Do not delegate the next turn until the prior Task result is returned.
4. Give each agent its own channel ID, participant token, agent ID, and role only.
5. Require a read-before-write, focused `apply_patch`, reread/diff check, broadcast handoff, and completed status.
6. Read the final file and Comms history. Confirm each section survived and the order matches the turn order.

## Participant Turn

- Read the current file before editing.
- Preserve prior content and unrelated changes.
- Edit only the shared file and only the assigned section.
- Verify the file after editing.
- Broadcast what changed and whether the turn is complete.
- Mark status `completed` only after the file and handoff are verified.

## Failure Semantics

An artifact edit and an Agent Comms handoff are separate operations. If editing succeeds but sending or status update fails, report a partial turn and leave the coordinator to decide whether to retry. Do not silently claim completion.

Agent Comms is not a file lock, transaction manager, or merge tool. Sequential delegation prevents races; it does not replace code review, tests, or version-control inspection.
