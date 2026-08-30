import { randomBytes, randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve, win32 } from "node:path";

export type ChannelStatus = "open" | "closed";
export type ParticipantStatus = "active" | "idle" | "completed" | "left";
export type Audience = "broadcast" | { agentId: string };
export type AttachmentKind = "context" | "working" | "handoff" | "review";

export interface AttachmentInput {
  path: string;
  kind?: AttachmentKind;
  note?: string;
}

export interface Attachment extends AttachmentInput {
  path: string;
  kind: AttachmentKind;
}

export interface ParticipantView {
  agentId: string;
  displayName: string;
  role: string;
  status: ParticipantStatus;
  registeredAt: string;
  lastSeenAt: string;
}

export interface MessageView {
  sequence: number;
  messageId: string;
  channelId: string;
  senderId: string;
  audience: Audience;
  body: string;
  attachments: Attachment[];
  createdAt: string;
}

export interface ChannelView {
  channelId: string;
  name: string;
  mission: string;
  status: ChannelStatus;
  workspaceRoot?: string;
  createdAt: string;
  closedAt?: string;
  participants: ParticipantView[];
}

export interface HubLimits {
  maxParticipants: number;
  maxBodyLength: number;
  maxAttachments: number;
  maxHistoryPageSize: number;
  maxWaitMs: number;
}

const DEFAULT_LIMITS: HubLimits = {
  maxParticipants: 32,
  maxBodyLength: 32_000,
  maxAttachments: 16,
  maxHistoryPageSize: 200,
  maxWaitMs: 120_000,
};

const REDACTED_TOKEN = "[REDACTED_AGENT_TOKEN]";

interface ParticipantRecord extends ParticipantView {
  token: string;
  registrationKey?: string;
}

interface ChannelRecord {
  view: Omit<ChannelView, "participants">;
  coordinatorToken: string;
  participants: Map<string, ParticipantRecord>;
  messages: MessageView[];
  nextSequence: number;
  registrationKeys: Map<string, string>;
  waiters: Set<() => void>;
}

export interface CreateChannelInput {
  name: string;
  mission: string;
  workspaceRoot?: string;
  coordinatorDisplayName?: string;
}

export interface RegisterAgentInput {
  channelId: string;
  coordinatorToken: string;
  agentId?: string;
  displayName: string;
  role: string;
  registrationKey?: string;
}

export interface RegisterAgentResult {
  participant: ParticipantView;
  participantToken: string;
}

export interface ReadResult {
  messages: MessageView[];
  nextSequence: number;
  hasMore: boolean;
  channelStatus: ChannelStatus;
}

export interface HistoryFilter {
  afterSequence?: number;
  limit?: number;
  senderId?: string;
  attachmentPath?: string;
  audience?: Audience;
}

export class HubError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HubError";
  }
}

function requiredText(value: string, field: string, maxLength = 512): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HubError("INVALID_INPUT", `${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new HubError("INVALID_INPUT", `${field} exceeds the ${maxLength}-character limit`);
  }
  return value.trim();
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

function cloneParticipant(participant: ParticipantView): ParticipantView {
  return {
    agentId: participant.agentId,
    displayName: participant.displayName,
    role: participant.role,
    status: participant.status,
    registeredAt: participant.registeredAt,
    lastSeenAt: participant.lastSeenAt,
  };
}

function isPathOutsideRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === ".." || relativePath.startsWith(`..${relativePath.includes("\\") ? "\\" : "/"}`) || isAbsolute(relativePath) || win32.isAbsolute(relativePath);
}

export class Hub {
  private readonly channels = new Map<string, ChannelRecord>();
  private readonly tokenIndex = new Map<string, { channelId: string; agentId: string | "coordinator" }>();
  private readonly limits: HubLimits;

  constructor(limits: Partial<HubLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const [name, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new HubError("INVALID_INPUT", `${name} must be a positive safe integer`);
    }
  }

  createChannel(input: CreateChannelInput): { channel: ChannelView; coordinatorToken: string; initialCursor: number } {
    const name = requiredText(input.name, "name");
    const mission = requiredText(input.mission, "mission", 4_000);
    const channelId = randomUUID();
    const createdAt = new Date().toISOString();
    const coordinatorToken = token();
    const workspaceRoot = input.workspaceRoot ? resolve(requiredText(input.workspaceRoot, "workspaceRoot")) : undefined;
    const coordinatorName = input.coordinatorDisplayName?.trim() || "coordinator";
    const coordinator: ParticipantRecord = {
      agentId: "coordinator",
      displayName: coordinatorName,
      role: "coordinator",
      status: "active",
      registeredAt: createdAt,
      lastSeenAt: createdAt,
      token: coordinatorToken,
    };
    const record: ChannelRecord = {
      view: { channelId, name, mission, status: "open", workspaceRoot, createdAt },
      coordinatorToken,
      participants: new Map([[coordinator.agentId, coordinator]]),
      messages: [],
      nextSequence: 1,
      registrationKeys: new Map(),
      waiters: new Set(),
    };
    this.channels.set(channelId, record);
    this.tokenIndex.set(coordinatorToken, { channelId, agentId: "coordinator" });
    return { channel: this.channelView(record), coordinatorToken, initialCursor: 0 };
  }

  registerAgent(input: RegisterAgentInput): RegisterAgentResult {
    const record = this.authorizeCoordinator(input.channelId, input.coordinatorToken);
    this.ensureOpen(record);
    if (record.participants.size >= this.limits.maxParticipants + 1) {
      throw new HubError("LIMIT_EXCEEDED", "participant limit reached");
    }
    const displayName = requiredText(input.displayName, "displayName");
    const role = requiredText(input.role, "role");
    if (input.registrationKey) {
      const existingAgentId = record.registrationKeys.get(input.registrationKey);
      if (existingAgentId) {
        const existing = record.participants.get(existingAgentId);
        if (!existing) throw new HubError("INTERNAL_ERROR", "registration index is inconsistent");
        if ((input.agentId && input.agentId !== existing.agentId) || input.displayName.trim() !== existing.displayName || input.role.trim() !== existing.role) {
          throw new HubError("CONFLICT", "registration key was already used with different participant metadata");
        }
        return { participant: cloneParticipant(existing), participantToken: existing.token };
      }
    }
    const agentId = input.agentId?.trim() || `agent-${randomUUID().slice(0, 8)}`;
    if (agentId === "coordinator" || record.participants.has(agentId)) {
      throw new HubError("CONFLICT", `agent ID is already registered: ${agentId}`);
    }
    const now = new Date().toISOString();
    const participant: ParticipantRecord = {
      agentId,
      displayName,
      role,
      status: "active",
      registeredAt: now,
      lastSeenAt: now,
      token: token(),
      registrationKey: input.registrationKey,
    };
    record.participants.set(agentId, participant);
    this.tokenIndex.set(participant.token, { channelId: input.channelId, agentId });
    if (input.registrationKey) record.registrationKeys.set(input.registrationKey, agentId);
    return { participant: cloneParticipant(participant), participantToken: participant.token };
  }

  send(input: { channelId: string; participantToken: string; body: string; audience: Audience; attachments?: AttachmentInput[]; clientMessageId?: string }): MessageView {
    const { record, agentId } = this.authorizeParticipant(input.channelId, input.participantToken);
    this.ensureOpen(record);
    const body = requiredText(this.scrubSecrets(record, input.body), "body", this.limits.maxBodyLength);
    if (input.attachments && input.attachments.length > this.limits.maxAttachments) {
      throw new HubError("LIMIT_EXCEEDED", "attachment limit reached");
    }
    if (input.audience !== "broadcast") {
      requiredText(input.audience.agentId, "audience.agentId");
      if (!record.participants.has(input.audience.agentId)) throw new HubError("NOT_FOUND", "audience participant is not registered");
    }
    const attachments = (input.attachments ?? []).map((attachment) => this.normalizeAttachment(record, attachment));
    const clientMessageId = input.clientMessageId ? this.scrubSecrets(record, input.clientMessageId.trim()) : undefined;
    if (clientMessageId) {
      const prior = record.messages.find((message) => message.senderId === agentId && message.messageId === clientMessageId);
      if (prior) return prior;
    }
    const message: MessageView = {
      sequence: record.nextSequence++,
      messageId: clientMessageId ?? randomUUID(),
      channelId: input.channelId,
      senderId: agentId,
      audience: input.audience,
      body,
      attachments,
      createdAt: new Date().toISOString(),
    };
    record.messages.push(message);
    this.touch(record, agentId);
    this.notify(record);
    return message;
  }

  poll(input: { channelId: string; participantToken: string; afterSequence?: number; limit?: number; includeOwnMessages?: boolean }): ReadResult {
    const { record, agentId } = this.authorizeParticipant(input.channelId, input.participantToken);
    this.touch(record, agentId);
    const after = this.cursor(input.afterSequence);
    const limit = this.pageSize(input.limit);
    const visible = record.messages.filter((message) => message.sequence > after && this.visibleTo(message, agentId, input.includeOwnMessages !== false));
    const messages = visible.slice(0, limit);
    const nextSequence = messages.length === limit && visible.length > limit ? messages[messages.length - 1].sequence : this.head(record);
    return { messages, nextSequence, hasMore: visible.length > messages.length, channelStatus: record.view.status };
  }

  async wait(input: { channelId: string; participantToken: string; afterSequence?: number; limit?: number; includeOwnMessages?: boolean; timeoutMs?: number }): Promise<ReadResult & { outcome: "messages_available" | "timeout" | "channel_closed" | "participant_left" }> {
    const { record } = this.authorizeParticipant(input.channelId, input.participantToken);
    let participantLeft = false;
    const immediate = this.poll(input);
    if (immediate.messages.length > 0 || immediate.channelStatus === "closed") {
      return { ...immediate, outcome: immediate.messages.length > 0 ? "messages_available" : "channel_closed" };
    }
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? this.limits.maxWaitMs, 0), this.limits.maxWaitMs);
    await new Promise<void>((resolvePromise) => {
      let settled = false;
      let waiter: (() => void) | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (waiter) record.waiters.delete(waiter);
        resolvePromise();
      };
      const timer = setTimeout(finish, timeoutMs);
      const retry = () => {
        if (settled) return;
        try {
          const result = this.poll(input);
          if (result.messages.length > 0 || result.channelStatus === "closed") finish();
          else if (waiter) record.waiters.add(waiter);
        } catch (error) {
          if (error instanceof HubError && error.code === "UNAUTHORIZED") {
            participantLeft = true;
            finish();
            return;
          }
          throw error;
        }
      };
      waiter = retry;
      record.waiters.add(waiter);
      const current = this.poll(input);
      if (current.messages.length > 0 || current.channelStatus === "closed") finish();
    });
    if (participantLeft) return { messages: [], nextSequence: this.head(record), hasMore: false, channelStatus: record.view.status, outcome: "participant_left" };
    const result = this.poll(input);
    if (result.messages.length > 0) return { ...result, outcome: "messages_available" };
    if (result.channelStatus === "closed") return { ...result, outcome: "channel_closed" };
    return { ...result, outcome: "timeout" };
  }

  history(input: { channelId: string; credential: string; filter?: HistoryFilter }): ReadResult {
    const record = this.authorizeCoordinator(input.channelId, input.credential);
    const filter = input.filter ?? {};
    const after = this.cursor(filter.afterSequence);
    const limit = this.pageSize(filter.limit);
    const matching = record.messages.filter((message) => message.sequence > after && (!filter.senderId || message.senderId === filter.senderId) && (!filter.attachmentPath || message.attachments.some((attachment) => attachment.path === filter.attachmentPath)) && (!filter.audience || JSON.stringify(message.audience) === JSON.stringify(filter.audience)));
    const messages = matching.slice(0, limit);
    const nextSequence = messages.length === limit && messages.length > 0 ? messages[messages.length - 1].sequence : this.head(record);
    return { messages, nextSequence, hasMore: matching.length > messages.length, channelStatus: record.view.status };
  }

  setStatus(input: { channelId: string; participantToken: string; status: ParticipantStatus }): ParticipantView {
    const { record, agentId } = this.authorizeParticipant(input.channelId, input.participantToken);
    if (agentId === "coordinator" && input.status === "left") throw new HubError("INVALID_INPUT", "coordinator cannot leave the channel");
    const participant = record.participants.get(agentId)!;
    participant.status = input.status;
    this.touch(record, agentId);
    if (input.status === "left") this.tokenIndex.delete(participant.token);
    this.notify(record);
    return cloneParticipant(participant);
  }

  closeChannel(input: { channelId: string; coordinatorToken: string }): ChannelView {
    const record = this.authorizeCoordinator(input.channelId, input.coordinatorToken);
    if (record.view.status === "open") {
      record.view.status = "closed";
      record.view.closedAt = new Date().toISOString();
      this.notify(record);
    }
    return this.channelView(record);
  }

  getChannel(channelId: string, credential: string): ChannelView {
    const record = this.authorizeCoordinator(channelId, credential);
    return this.channelView(record);
  }

  private authorizeCoordinator(channelId: string, credential: string): ChannelRecord {
    const record = this.getRecord(channelId);
    const identity = this.tokenIndex.get(credential);
    if (!identity || identity.channelId !== channelId || identity.agentId !== "coordinator" || record.coordinatorToken !== credential) throw new HubError("UNAUTHORIZED", "invalid coordinator credential");
    return record;
  }

  private authorizeParticipant(channelId: string, credential: string): { record: ChannelRecord; agentId: string } {
    const record = this.getRecord(channelId);
    const identity = this.tokenIndex.get(credential);
    if (!identity || identity.channelId !== channelId) throw new HubError("UNAUTHORIZED", "invalid participant token");
    return { record, agentId: identity.agentId };
  }

  private getRecord(channelId: string): ChannelRecord {
    const record = this.channels.get(channelId);
    if (!record) throw new HubError("NOT_FOUND", "channel not found");
    return record;
  }

  private ensureOpen(record: ChannelRecord): void {
    if (record.view.status === "closed") throw new HubError("CHANNEL_CLOSED", "channel is closed");
  }

  private touch(record: ChannelRecord, agentId: string): void {
    const participant = record.participants.get(agentId);
    if (participant) participant.lastSeenAt = new Date().toISOString();
  }

  private visibleTo(message: MessageView, agentId: string, includeOwnMessages: boolean): boolean {
    if (agentId === "coordinator") return true;
    if (message.audience === "broadcast") return true;
    return message.audience.agentId === agentId || (includeOwnMessages && message.senderId === agentId);
  }

  private normalizeAttachment(record: ChannelRecord, input: AttachmentInput): Attachment {
    const rawPath = requiredText(this.scrubSecrets(record, input.path), "attachment.path", 2_000).replaceAll("\\", "/");
    if (!record.view.workspaceRoot) throw new HubError("INVALID_INPUT", "attachments require a workspace root");
    if (isAbsolute(rawPath) || win32.isAbsolute(rawPath)) throw new HubError("INVALID_INPUT", "attachment path must be workspace-relative");
    const root = record.view.workspaceRoot;
    const candidate = resolve(root, rawPath);
    const rel = relative(root, candidate);
    if (isPathOutsideRoot(root, candidate) || rel === "") throw new HubError("INVALID_INPUT", "attachment path escapes the workspace root");
    return { path: rel.replaceAll("\\", "/"), kind: input.kind ?? "context", ...(input.note ? { note: requiredText(this.scrubSecrets(record, input.note), "attachment.note", 2_000) } : {}) };
  }

  private scrubSecrets(record: ChannelRecord, value: string): string {
    let scrubbed = value;
    const secrets = [record.coordinatorToken, ...[...record.participants.values()].map((participant) => participant.token)];
    for (const secret of secrets) {
      if (secret) scrubbed = scrubbed.split(secret).join(REDACTED_TOKEN);
    }
    return scrubbed;
  }

  private cursor(value: number | undefined): number {
    if (value === undefined) return 0;
    if (!Number.isSafeInteger(value) || value < 0) throw new HubError("INVALID_INPUT", "sequence cursor must be a non-negative integer");
    return value;
  }

  private pageSize(value: number | undefined): number {
    if (value === undefined) return this.limits.maxHistoryPageSize;
    if (!Number.isSafeInteger(value) || value < 1) throw new HubError("INVALID_INPUT", "limit must be a positive integer");
    return Math.min(value, this.limits.maxHistoryPageSize);
  }

  private head(record: ChannelRecord): number {
    return record.nextSequence - 1;
  }

  private notify(record: ChannelRecord): void {
    for (const waiter of [...record.waiters]) waiter();
  }

  private channelView(record: ChannelRecord): ChannelView {
    return { ...record.view, participants: [...record.participants.values()].map(cloneParticipant) };
  }
}
