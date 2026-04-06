// ─── Channel Types ───────────────────────────────────────────────────────────

export interface TriggerEventParams {
  /** Single channel name */
  channel?: string;
  /** Multiple channel names (max 100, mutually exclusive with channel) */
  channels?: string[];
  /** Event name (1-255 chars) */
  event: string;
  /** Arbitrary JSON payload */
  data?: unknown;
  /** Socket ID to exclude sender from receiving the event */
  socketId?: string;
}

export interface TriggerEventResult {
  eventIds: string[];
  channel?: string;
  channels?: string[];
}

export interface BatchTriggerParams {
  batch: Array<{
    channel: string;
    event: string;
    data?: unknown;
    socketId?: string;
  }>;
}

export interface BatchTriggerResult {
  results: Array<{
    channel: string;
    event: string;
    eventId: string | null;
    status: "ok" | "error";
    error: string | null;
  }>;
}

export interface Channel {
  name: string;
  subscriberCount: number;
  type: "public" | "private" | "presence";
}

export interface ChannelInfo extends Channel {
  occupied: boolean;
  members: PresenceMember[] | null;
}

export interface ChannelEvent {
  id: string;
  channel: string;
  event: string;
  data: unknown;
  sequence: number;
  insertedAt: string;
}

export interface PresenceMember {
  userId: string;
  userInfo: Record<string, unknown> | null;
  joinedAt: string;
}

export interface DisconnectResult {
  status: string;
  userId: string;
}

// ─── Pagination Types ────────────────────────────────────────────────────────

export interface PaginationParams {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
  offset?: number;
  limit?: number;
}

export interface FilterParam {
  field: string;
  op: string;
  value: string;
}

export interface SortParams {
  orderBy?: string[];
  orderDirections?: ("asc" | "desc")[];
}

export type ListParams = PaginationParams &
  SortParams & { filters?: FilterParam[] };

export interface PaginationMeta {
  total: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
  currentOffset?: number | null;
  currentPage?: number | null;
  totalPages?: number | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  status: string;
  tenantId: string;
  tenantName?: string;
}

export interface RegisterResult {
  user: AuthUser;
  message: string;
}

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
}

export interface VerifyEmailResult {
  user: {
    id: string;
    email: string;
    status: string;
    confirmedAt: string;
  };
  message: string;
}

// ─── Tenant Types ────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  status: string;
  defaultMaxRetries: number;
  signingSecret?: string;
  insertedAt: string;
  updatedAt: string;
}

export interface TenantUser {
  id: string;
  email: string;
  role: string;
  status: string;
  confirmedAt: string | null;
  lastLoginAt: string | null;
  insertedAt: string;
  updatedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expiresAt: string;
  insertedAt: string;
}

// ─── Application Types ──────────────────────────────────────────────────────

export interface Application {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dlqDestinationUrl: string | null;
  apiKeyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dlqDestinationUrl: string | null;
  apiKeys: ApiKeySummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationCreateResult {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dlqDestinationUrl: string | null;
  apiKey: string;
  createdAt: string;
}

export interface ApplicationDeleteResult {
  deleted: boolean;
  id: string;
  apiKeysRevoked: number;
}

// ─── API Key Types ──────────────────────────────────────────────────────────

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  status: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreateResult {
  id: string;
  name: string;
  apiKey: string;
  prefix: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyRevokeResult {
  id: string;
  name: string;
  prefix: string;
  status: string;
  revoked: boolean;
  revokedAt: string;
}

export interface ApiKeyRotateResult {
  oldApiKey: {
    id: string;
    name: string;
    prefix: string;
    status: string;
  };
  newApiKey: ApiKeyCreateResult;
}

// ─── Channel Namespace Types ────────────────────────────────────────────────

export interface ChannelNamespace {
  id: string;
  pattern: string;
  priority: number;
  historyEnabled: boolean;
  historyTtlSeconds: number | null;
  historyMaxEvents: number | null;
  cacheEnabled: boolean;
  maxMembers: number | null;
  maxEventSizeBytes: number | null;
  maxClientEventsPerSecond: number | null;
  authEndpoint: string | null;
  webhookUrl: string | null;
  insertedAt: string;
  updatedAt: string;
}

export interface ChannelNamespaceParams {
  pattern?: string;
  priority?: number;
  historyEnabled?: boolean;
  historyTtlSeconds?: number | null;
  historyMaxEvents?: number | null;
  cacheEnabled?: boolean;
  maxMembers?: number | null;
  maxEventSizeBytes?: number | null;
  maxClientEventsPerSecond?: number | null;
  authEndpoint?: string | null;
  webhookUrl?: string | null;
}

// ─── Stats Types ────────────────────────────────────────────────────────────

export type StatsPeriod = "5m" | "1h" | "4h" | "1d" | "1w";

export interface MessageStats {
  period: string;
  counts: {
    pending: number;
    dispatched: number;
    delivered: number;
    failed: number;
  };
  total: number;
}

export interface MessageSizeStats {
  period: string;
  messageCount: number;
  totalBytes: number;
  averageBytes: number;
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
}

export interface DeliveryStats {
  period: string;
  totalCompleted: number;
  successRate: number;
  retryRate: number;
  deliveryTimes: {
    averageMs: number;
    p95Ms: number;
    p99Ms: number;
  };
}

export interface ErrorStats {
  period: string;
  totalErrors: number;
  byType: Record<string, number>;
  byStatusCode: Record<string, number>;
  topFailingDestinations: Array<{
    url: string;
    count: number;
  }>;
}

export interface DestinationStats {
  period: string;
  destinations: Array<{
    url: string;
    volume: number;
    successRate: number;
    avgResponseTimeMs: number;
  }>;
}

export interface ActivityEntry {
  id: string;
  destinationUrl: string;
  status: string;
  attempts: number;
  lastError: string | null;
  lastResponseStatus: number | null;
  payloadSizeBytes: number | null;
  applicationId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ActivityStats {
  period: string;
  data: ActivityEntry[];
  meta: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}
