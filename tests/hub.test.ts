import { describe, expect, it } from "vitest";
import { Hub, HubError } from "../src/hub.js";

function setup() {
  const hub = new Hub({ maxWaitMs: 200 });
  const created = hub.createChannel({ name: "test", mission: "exercise collaboration", workspaceRoot: process.cwd() });
  const alice = hub.registerAgent({ channelId: created.channel.channelId, coordinatorToken: created.coordinatorToken, agentId: "alice", displayName: "Alice", role: "implementer" });
  const bob = hub.registerAgent({ channelId: created.channel.channelId, coordinatorToken: created.coordinatorToken, agentId: "bob", displayName: "Bob", role: "reviewer" });
  const carol = hub.registerAgent({ channelId: created.channel.channelId, coordinatorToken: created.coordinatorToken, agentId: "carol", displayName: "Carol", role: "tester" });
  return { hub, created, alice, bob, carol };
}

describe("Hub", () => {
  it("generates hub-owned credentials and never exposes them in participant views", () => {
    const { hub, created, alice } = setup();
    expect(created.coordinatorToken).toHaveLength(43);
    expect(alice.participantToken).toHaveLength(43);
    expect(alice.participantToken).not.toBe(created.coordinatorToken);
    expect(JSON.stringify(alice.participant)).not.toContain(alice.participantToken);
    expect(JSON.stringify(hub.getChannel(created.channel.channelId, created.coordinatorToken))).not.toContain(alice.participantToken);
  });

  it("routes broadcasts and direct messages according to audience", () => {
    const { hub, created, alice, bob, carol } = setup();
    hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "hello team", audience: "broadcast" });
    hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "review this", audience: { agentId: "bob" } });

    expect(hub.poll({ channelId: created.channel.channelId, participantToken: bob.participantToken }).messages.map((message) => message.body)).toEqual(["hello team", "review this"]);
    expect(hub.poll({ channelId: created.channel.channelId, participantToken: carol.participantToken }).messages.map((message) => message.body)).toEqual(["hello team"]);
    expect(hub.history({ channelId: created.channel.channelId, credential: created.coordinatorToken }).messages).toHaveLength(2);
  });

  it("supports cursor gaps and retry-safe sends", () => {
    const { hub, created, alice, bob } = setup();
    hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "private", audience: { agentId: "bob" } });
    hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "public", audience: "broadcast", clientMessageId: "stable-1" });
    const retry = hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "different body", audience: "broadcast", clientMessageId: "stable-1" });
    expect(retry.body).toBe("public");
    const carolRead = hub.poll({ channelId: created.channel.channelId, participantToken: bob.participantToken, afterSequence: 1 });
    expect(carolRead.messages.map((message) => message.body)).toEqual(["public"]);
  });

  it("wakes a waiting participant when a visible message arrives", async () => {
    const { hub, created, alice, bob } = setup();
    const waiting = hub.wait({ channelId: created.channel.channelId, participantToken: bob.participantToken, timeoutMs: 150 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "unblock", audience: { agentId: "bob" } });
    await expect(waiting).resolves.toMatchObject({ outcome: "messages_available", messages: [{ body: "unblock" }] });
  });

  it("returns timeout and wakes on channel close", async () => {
    const { hub, created, bob } = setup();
    await expect(hub.wait({ channelId: created.channel.channelId, participantToken: bob.participantToken, timeoutMs: 5 })).resolves.toMatchObject({ outcome: "timeout" });
    const waiting = hub.wait({ channelId: created.channel.channelId, participantToken: bob.participantToken, timeoutMs: 150 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    hub.closeChannel({ channelId: created.channel.channelId, coordinatorToken: created.coordinatorToken });
    await expect(waiting).resolves.toMatchObject({ outcome: "channel_closed" });
  });

  it("validates attachment containment and normalizes safe paths", () => {
    const { hub, created, alice } = setup();
    const message = hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "handoff", audience: "broadcast", attachments: [{ path: "src\\index.ts", kind: "handoff" }] });
    expect(message.attachments[0].path).toBe("src/index.ts");
    expect(() => hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "bad", audience: "broadcast", attachments: [{ path: "../secret.txt" }] })).toThrow(HubError);
    expect(() => hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "bad", audience: "broadcast", attachments: [{ path: "C:\\secret.txt" }] })).toThrow(HubError);
  });

  it("scrubs coordinator and participant tokens from message content", () => {
    const { hub, created, alice } = setup();
    const message = hub.send({
      channelId: created.channel.channelId,
      participantToken: alice.participantToken,
      body: `participant=${alice.participantToken} coordinator=${created.coordinatorToken}`,
      audience: "broadcast",
      attachments: [{ path: `notes/${alice.participantToken}.md`, note: `credential ${created.coordinatorToken}` }],
      clientMessageId: `retry-${alice.participantToken}`,
    });
    expect(JSON.stringify(message)).not.toContain(alice.participantToken);
    expect(JSON.stringify(message)).not.toContain(created.coordinatorToken);
    expect(message.body).toContain("[REDACTED_AGENT_TOKEN]");
    expect(hub.history({ channelId: created.channel.channelId, credential: created.coordinatorToken }).messages[0]).toEqual(message);
  });

  it("rejects invalid or cross-channel credentials and sends after close", () => {
    const first = setup();
    const second = setup();
    expect(() => first.hub.poll({ channelId: first.created.channel.channelId, participantToken: second.alice.participantToken })).toThrow(/invalid participant token/);
    first.hub.closeChannel({ channelId: first.created.channel.channelId, coordinatorToken: first.created.coordinatorToken });
    expect(() => first.hub.send({ channelId: first.created.channel.channelId, participantToken: first.alice.participantToken, body: "late", audience: "broadcast" })).toThrow(/channel is closed/);
    expect(() => first.hub.registerAgent({ channelId: first.created.channel.channelId, coordinatorToken: first.created.coordinatorToken, displayName: "Late", role: "late" })).toThrow(/channel is closed/);
  });

  it("revokes a participant token when it leaves", () => {
    const { hub, created, alice } = setup();
    hub.setStatus({ channelId: created.channel.channelId, participantToken: alice.participantToken, status: "left" });
    expect(() => hub.poll({ channelId: created.channel.channelId, participantToken: alice.participantToken })).toThrow(/invalid participant token/);
  });

  it("paginates filtered history without false hasMore results", () => {
    const { hub, created, alice, bob } = setup();
    hub.send({ channelId: created.channel.channelId, participantToken: alice.participantToken, body: "one", audience: "broadcast" });
    hub.send({ channelId: created.channel.channelId, participantToken: bob.participantToken, body: "two", audience: "broadcast" });
    hub.send({ channelId: created.channel.channelId, participantToken: bob.participantToken, body: "three", audience: "broadcast" });
    const page = hub.history({ channelId: created.channel.channelId, credential: created.coordinatorToken, filter: { senderId: "alice", limit: 1 } });
    expect(page.messages.map((message) => message.body)).toEqual(["one"]);
    expect(page.hasMore).toBe(false);
  });

  it("validates custom resource limits and registration idempotency conflicts", () => {
    expect(() => new Hub({ maxBodyLength: 0 })).toThrow(/maxBodyLength/);
    const { hub, created } = setup();
    hub.registerAgent({ channelId: created.channel.channelId, coordinatorToken: created.coordinatorToken, displayName: "Keyed", role: "worker", registrationKey: "key-1" });
    expect(() => hub.registerAgent({ channelId: created.channel.channelId, coordinatorToken: created.coordinatorToken, displayName: "Changed", role: "worker", registrationKey: "key-1" })).toThrow(/registration key/);
  });
});
