# Agent Comms Intent

## Vision

Agent Comms is a local communication layer for teams of AI coding agents.

Today, a primary agent can delegate work to subagents, but delegation is usually a one-way transaction: assign a task, wait for a result, and reconcile the outputs afterward. That model leaves a great deal of useful collaboration on the table. A specialist may discover an architectural constraint that changes another specialist's work. Two agents may unknowingly edit adjacent parts of the same file. A reviewer may be able to unblock an implementer in seconds, but has no natural way to do so while both are working.

Agent Comms turns a set of delegated agents into a temporary, purposeful team. The primary agent opens a channel, gives each participant a role, and lets them coordinate directly while the work is underway. Agents can share observations with everyone, ask a particular teammate for help, report progress, point to relevant project files, and deliver decisions or artifacts to the people who need them.

The result should feel less like a collection of isolated tools and more like a small engineering room: focused, observable, and easy to wind down when the work is complete.

## Product Promise

Agent Comms should make parallel agent work:

- **Conversational:** agents can ask, answer, clarify, challenge, and build on one another's messages.
- **Role-aware:** every participant knows who is in the room and what responsibility they are carrying.
- **Low-friction:** an agent should be able to send or receive a useful message without managing infrastructure, sockets, or shared state.
- **Project-grounded:** communication can refer to concrete files in the workspace, making intent and ownership visible where it matters.
- **Observable:** the primary agent can reconstruct the complete conversation and understand not only final outputs, but how the team arrived there.
- **Local and private:** the default channel is local to the coding session and does not require an external collaboration service.

## Core Experience

The primary agent acts as coordinator. It creates a channel for a unit of work, names the mission, and registers a bounded group of subagents with useful identities and roles. Those identities are stable for the life of the channel, so a message can be addressed to "test investigator" or "API implementer" rather than to an opaque process.

Each subagent joins with a clear purpose and can independently participate. It may broadcast a discovery, send a question to one teammate, attach paths to files it is inspecting or changing, or announce that a handoff is ready. Receiving an incoming message is an explicit part of the agent's work loop, not an accidental side effect of another tool call.

The team should support both modes of attention that real collaboration needs:

- **Check in when ready:** an agent polls for new work while it is making progress.
- **Wait for the next event:** an agent can suspend its turn until a message arrives, avoiding wasteful repeated checks.

The channel remains the shared memory of the effort. When the subagents finish or the primary agent decides to close the work, the complete, ordered history is available for synthesis, debugging, review, or future improvement.

## Principles

### Collaboration over orchestration

The primary agent should define the mission and boundaries, not micromanage every exchange. Subagents are valuable precisely because they can notice, reason, and coordinate without routing every thought through the primary agent.

### Explicit audience, intentional noise

Broadcasts are for discoveries and decisions that change the team's context. Direct messages are for focused questions, handoffs, and sensitive or narrowly relevant details. The product should make both natural without encouraging every message to reach everyone.

### Files are first-class context

A path attached to a message is more than metadata. It can communicate "I am working here," "please review this," "this is the relevant evidence," or "this is the artifact to continue from." File references should be visible, trustworthy, and useful in conversation history without turning Agent Comms into a file transport or source-control system.

### Waiting is productive

An agent that is waiting for a teammate should not need to burn turns asking whether anything changed. Waiting and polling are complementary interaction styles, and the channel should support both while preserving a simple mental model.

### History is a deliverable

The conversation is not disposable coordination chatter. It is a record of decisions, assumptions, ownership, and discoveries that the primary agent can use to produce a better final result and that a developer can inspect when something goes wrong.

### Bounded, local, safe by default

Channels are temporary collaboration spaces tied to a local coding context. Participation is explicit, access is scoped to the channel, and file references do not silently grant agents access to unrelated data.

## What Success Looks Like

An OpenCode-style primary agent can launch a group of specialists and give them a shared channel in one concise setup. The specialists can work in parallel without stepping on one another unknowingly, and can resolve discoveries directly instead of waiting for the primary agent to relay every message. The primary agent can later inspect a coherent timeline, understand the state of each role, and confidently synthesize the team's work.

The defining moment is simple: one agent notices something important, tells exactly the right teammates, and the rest of the team adapts before the mistake becomes expensive.

## Non-Goals

Agent Comms is not intended to be:

- A general-purpose internet chat service or hosted team workspace.
- A replacement for the coding agent's task delegation, filesystem, terminal, or version-control tools.
- A binary or large-file transfer mechanism; attached paths identify project artifacts rather than copying their contents.
- An autonomous project manager that invents roles, assigns work, or decides when an agent is finished.
- A guarantee that multiple agents can safely edit the same file concurrently.

## North-Star Question

When several capable agents are working on one codebase, does Agent Comms help them behave like a thoughtful engineering team rather than isolated workers?
