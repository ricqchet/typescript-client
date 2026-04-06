import { RicqchetError } from "./error";
import { HttpClient } from "./http";
import { buildQueryString, mapPaginationMeta } from "./pagination";
import type {
  AuthUser,
  RegisterResult,
  LoginResult,
  RefreshResult,
  VerifyEmailResult,
  Tenant,
  TenantUser,
  Invitation,
  Application,
  ApplicationDetail,
  ApplicationCreateResult,
  ApplicationDeleteResult,
  ApiKeySummary,
  ApiKeyCreateResult,
  ApiKeyRevokeResult,
  ApiKeyRotateResult,
  ChannelNamespace,
  ChannelNamespaceParams,
  ListParams,
  PaginatedResponse,
  StatsPeriod,
  MessageStats,
  MessageSizeStats,
  DeliveryStats,
  ErrorStats,
  DestinationStats,
  ActivityStats,
  ActivityEntry,
} from "./types";

/**
 * Configuration options for the Ricqchet management client.
 */
export interface RicqchetManagementClientOptions {
  /** The base URL of your Ricqchet server */
  baseUrl: string;
  /** HTTP timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Ricqchet management client for authentication, tenant management,
 * applications, API keys, channel namespaces, and statistics.
 *
 * Uses JWT-based authentication with automatic token refresh.
 *
 * @example
 * ```typescript
 * const mgmt = new RicqchetManagementClient({
 *   baseUrl: 'https://your-ricqchet.fly.dev'
 * });
 *
 * await mgmt.login('admin@example.com', 'password');
 * const apps = await mgmt.listApplications();
 * ```
 */
export class RicqchetManagementClient {
  private http: HttpClient;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: number = 0;

  constructor(options: RicqchetManagementClientOptions) {
    this.http = new HttpClient(options.baseUrl, options.timeout ?? 30000);
  }

  /** Returns true if the client has stored auth tokens from a login or acceptInvite call. */
  get isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  /**
   * Registers a new user and tenant.
   */
  async register(params: {
    email: string;
    password: string;
    tenantName: string;
  }): Promise<RegisterResult> {
    const response = await this.unauthenticatedRequest(
      "POST",
      "/v1/auth/register",
      {
        email: params.email,
        password: params.password,
        tenant_name: params.tenantName,
      }
    );
    const data = await response.json();
    return {
      user: mapAuthUser(data.user),
      message: data.message,
    };
  }

  /**
   * Verifies a user's email address.
   */
  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    const response = await this.unauthenticatedRequest(
      "POST",
      "/v1/auth/verify-email",
      { token }
    );
    const data = await response.json();
    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        status: data.user.status,
        confirmedAt: data.user.confirmed_at,
      },
      message: data.message,
    };
  }

  /**
   * Logs in and stores JWT tokens for subsequent authenticated requests.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const response = await this.unauthenticatedRequest(
      "POST",
      "/v1/auth/login",
      { email, password }
    );
    const data = await response.json();
    this.storeTokens(data);
    return {
      user: mapAuthUser(data.user),
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refreshes the JWT access token using the stored refresh token.
   */
  async refresh(): Promise<RefreshResult> {
    if (!this.refreshToken) {
      throw new RicqchetError(
        "unauthorized",
        "No refresh token available",
        null
      );
    }

    const response = await this.unauthenticatedRequest(
      "POST",
      "/v1/auth/refresh",
      { refresh_token: this.refreshToken }
    );
    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  /**
   * Accepts a tenant invitation and stores tokens.
   */
  async acceptInvite(token: string, password: string): Promise<LoginResult> {
    const response = await this.unauthenticatedRequest(
      "POST",
      "/v1/auth/accept-invite",
      { token, password }
    );
    const data = await response.json();
    this.storeTokens(data);
    return {
      user: mapAuthUser(data.user),
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Requests a password reset email.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await this.unauthenticatedRequest(
      "POST",
      "/v1/auth/forgot-password",
      { email }
    );
    const data = await response.json();
    return { message: data.message };
  }

  /**
   * Resets a password using a reset token.
   */
  async resetPassword(
    token: string,
    password: string
  ): Promise<{ message: string }> {
    const response = await this.unauthenticatedRequest(
      "POST",
      "/v1/auth/reset-password",
      { token, password }
    );
    const data = await response.json();
    return { message: data.message };
  }

  /**
   * Resends the email verification email. Requires authentication.
   */
  async resendVerification(): Promise<{ message: string }> {
    const response = await this.authenticatedRequest(
      "POST",
      "/v1/auth/resend-verification"
    );
    const data = await response.json();
    return { message: data.message };
  }

  /**
   * Logs out, optionally from all sessions. Clears stored tokens.
   */
  async logout(options?: {
    everywhere?: boolean;
  }): Promise<{ message: string }> {
    const body: Record<string, unknown> = {
      refresh_token: this.refreshToken,
    };
    if (options?.everywhere) body.everywhere = true;

    const response = await this.authenticatedRequest(
      "POST",
      "/v1/auth/logout",
      body
    );
    const data = await response.json();
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
    return { message: data.message };
  }

  /**
   * Changes the current user's password. Returns new tokens.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<LoginResult> {
    const response = await this.authenticatedRequest(
      "POST",
      "/v1/auth/change-password",
      { current_password: currentPassword, new_password: newPassword }
    );
    const data = await response.json();
    this.storeTokens(data);
    return {
      user: mapAuthUser(data.user),
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  /**
   * Gets the current authenticated user's profile.
   */
  async getCurrentUser(): Promise<AuthUser> {
    const response = await this.authenticatedRequest("GET", "/v1/users/me");
    const data = await response.json();
    return mapAuthUser(data);
  }

  // ─── Tenant ──────────────────────────────────────────────────────────────

  /**
   * Gets the current tenant's information.
   */
  async getTenant(): Promise<Tenant> {
    const response = await this.authenticatedRequest("GET", "/v1/tenant");
    const data = await response.json();
    return mapTenant(data);
  }

  /**
   * Updates the current tenant. Requires admin role.
   */
  async updateTenant(params: {
    name?: string;
    defaultMaxRetries?: number;
  }): Promise<Tenant> {
    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.defaultMaxRetries !== undefined)
      body.default_max_retries = params.defaultMaxRetries;

    const response = await this.authenticatedRequest(
      "PATCH",
      "/v1/tenant",
      body
    );
    const data = await response.json();
    return mapTenant(data);
  }

  /**
   * Lists users in the current tenant with pagination, filtering, and sorting.
   */
  async listTenantUsers(
    params?: ListParams
  ): Promise<PaginatedResponse<TenantUser>> {
    const qs = buildQueryString(params);
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/tenant/users${qs}`
    );
    const data = await response.json();
    return {
      data: data.data.map(mapTenantUser),
      meta: mapPaginationMeta(data.meta),
    };
  }

  /**
   * Invites a user to the tenant. Requires admin role.
   */
  async inviteUser(params: {
    email: string;
    role: "admin" | "member" | "viewer";
  }): Promise<Invitation> {
    const response = await this.authenticatedRequest(
      "POST",
      "/v1/tenant/users/invite",
      params
    );
    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
      role: data.role,
      status: data.status,
      token: data.token,
      expiresAt: data.expires_at,
      insertedAt: data.inserted_at,
    };
  }

  /**
   * Updates a user's role. Requires admin role.
   */
  async updateUserRole(
    userId: string,
    role: "admin" | "member" | "viewer"
  ): Promise<TenantUser> {
    const response = await this.authenticatedRequest(
      "PATCH",
      `/v1/tenant/users/${userId}`,
      { role }
    );
    const data = await response.json();
    return mapTenantUser(data);
  }

  /**
   * Removes a user from the tenant. Requires admin role.
   */
  async removeUser(userId: string): Promise<{ id: string; message: string }> {
    const response = await this.authenticatedRequest(
      "DELETE",
      `/v1/tenant/users/${userId}`
    );
    const data = await response.json();
    return { id: data.id, message: data.message };
  }

  // ─── Applications ────────────────────────────────────────────────────────

  /**
   * Lists applications with pagination, filtering, and sorting.
   */
  async listApplications(
    params?: ListParams
  ): Promise<PaginatedResponse<Application>> {
    const qs = buildQueryString(params);
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/applications${qs}`
    );
    const data = await response.json();
    return {
      data: data.data.map(mapApplication),
      meta: mapPaginationMeta(data.meta),
    };
  }

  /**
   * Creates a new application. Requires admin role.
   */
  async createApplication(params: {
    name: string;
    description?: string | null;
    dlqDestinationUrl?: string | null;
  }): Promise<ApplicationCreateResult> {
    const body: Record<string, unknown> = { name: params.name };
    if (params.description !== undefined) body.description = params.description;
    if (params.dlqDestinationUrl !== undefined)
      body.dlq_destination_url = params.dlqDestinationUrl;

    const response = await this.authenticatedRequest(
      "POST",
      "/v1/applications",
      body
    );
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      dlqDestinationUrl: data.dlq_destination_url ?? null,
      apiKey: data.api_key,
      createdAt: data.created_at,
    };
  }

  /**
   * Gets detailed information about an application, including its API keys.
   */
  async getApplication(id: string): Promise<ApplicationDetail> {
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/applications/${id}`
    );
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      dlqDestinationUrl: data.dlq_destination_url ?? null,
      apiKeys: (data.api_keys ?? []).map(mapApiKeySummary),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Updates an application. Requires admin role.
   */
  async updateApplication(
    id: string,
    params: {
      name?: string;
      description?: string | null;
      status?: string;
      dlqDestinationUrl?: string | null;
    }
  ): Promise<ApplicationDetail> {
    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.description !== undefined) body.description = params.description;
    if (params.status !== undefined) body.status = params.status;
    if (params.dlqDestinationUrl !== undefined)
      body.dlq_destination_url = params.dlqDestinationUrl;

    const response = await this.authenticatedRequest(
      "PATCH",
      `/v1/applications/${id}`,
      body
    );
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      dlqDestinationUrl: data.dlq_destination_url ?? null,
      apiKeys: (data.api_keys ?? []).map(mapApiKeySummary),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Deletes an application and revokes its API keys. Requires admin role.
   */
  async deleteApplication(id: string): Promise<ApplicationDeleteResult> {
    const response = await this.authenticatedRequest(
      "DELETE",
      `/v1/applications/${id}`
    );
    const data = await response.json();
    return {
      deleted: data.deleted,
      id: data.id,
      apiKeysRevoked: data.api_keys_revoked,
    };
  }

  // ─── API Keys ────────────────────────────────────────────────────────────

  /**
   * Lists API keys for an application.
   */
  async listApiKeys(
    applicationId: string
  ): Promise<{ data: ApiKeySummary[]; meta: { total: number } }> {
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/applications/${applicationId}/api-keys`
    );
    const data = await response.json();
    return {
      data: data.data.map(mapApiKeySummary),
      meta: { total: data.meta.total },
    };
  }

  /**
   * Creates a new API key for an application. Requires admin role.
   * The full API key is only returned in this response.
   */
  async createApiKey(
    applicationId: string,
    params: { name: string; expiresAt?: string | null }
  ): Promise<ApiKeyCreateResult> {
    const body: Record<string, unknown> = { name: params.name };
    if (params.expiresAt !== undefined) body.expires_at = params.expiresAt;

    const response = await this.authenticatedRequest(
      "POST",
      `/v1/applications/${applicationId}/api-keys`,
      body
    );
    const data = await response.json();
    return mapApiKeyCreateResult(data);
  }

  /**
   * Revokes an API key. Requires admin role.
   */
  async revokeApiKey(id: string): Promise<ApiKeyRevokeResult> {
    const response = await this.authenticatedRequest(
      "DELETE",
      `/v1/api-keys/${id}`
    );
    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      prefix: data.prefix,
      status: data.status,
      revoked: data.revoked,
      revokedAt: data.revoked_at,
    };
  }

  /**
   * Rotates an API key, revoking the old one and creating a new one.
   * The full new API key is only returned in this response.
   */
  async rotateApiKey(id: string): Promise<ApiKeyRotateResult> {
    const response = await this.authenticatedRequest(
      "POST",
      `/v1/api-keys/${id}/rotate`
    );
    const data = await response.json();
    return {
      oldApiKey: {
        id: data.old_api_key.id,
        name: data.old_api_key.name,
        prefix: data.old_api_key.prefix,
        status: data.old_api_key.status,
      },
      newApiKey: mapApiKeyCreateResult(data.new_api_key),
    };
  }

  // ─── Channel Namespaces ──────────────────────────────────────────────────

  /**
   * Lists channel namespaces for an application.
   */
  async listChannelNamespaces(
    applicationId: string
  ): Promise<ChannelNamespace[]> {
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/applications/${applicationId}/channel-namespaces`
    );
    const data = await response.json();
    return data.data.map(mapChannelNamespace);
  }

  /**
   * Creates a channel namespace for an application. Requires admin role.
   */
  async createChannelNamespace(
    applicationId: string,
    params: ChannelNamespaceParams & { pattern: string }
  ): Promise<ChannelNamespace> {
    const response = await this.authenticatedRequest(
      "POST",
      `/v1/applications/${applicationId}/channel-namespaces`,
      toSnakeCaseNamespaceBody(params)
    );
    const data = await response.json();
    return mapChannelNamespace(data);
  }

  /**
   * Updates a channel namespace. Requires admin role.
   */
  async updateChannelNamespace(
    applicationId: string,
    id: string,
    params: ChannelNamespaceParams
  ): Promise<ChannelNamespace> {
    const response = await this.authenticatedRequest(
      "PATCH",
      `/v1/applications/${applicationId}/channel-namespaces/${id}`,
      toSnakeCaseNamespaceBody(params)
    );
    const data = await response.json();
    return mapChannelNamespace(data);
  }

  /**
   * Deletes a channel namespace. Requires admin role.
   */
  async deleteChannelNamespace(
    applicationId: string,
    id: string
  ): Promise<void> {
    const response = await this.authenticatedRequest(
      "DELETE",
      `/v1/applications/${applicationId}/channel-namespaces/${id}`
    );
    if (!response.ok) {
      throw await this.http.parseError(response);
    }
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  /**
   * Gets message count statistics grouped by status.
   */
  async getMessageStats(opts?: {
    period?: StatsPeriod;
  }): Promise<MessageStats> {
    const qs = opts?.period ? `?period=${opts.period}` : "";
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/stats/messages${qs}`
    );
    const data = await response.json();
    return {
      period: data.period,
      counts: data.counts,
      total: data.total,
    };
  }

  /**
   * Gets message size statistics including percentiles.
   */
  async getMessageSizeStats(opts?: {
    period?: StatsPeriod;
  }): Promise<MessageSizeStats> {
    const qs = opts?.period ? `?period=${opts.period}` : "";
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/stats/message-sizes${qs}`
    );
    const data = await response.json();
    return {
      period: data.period,
      messageCount: data.message_count,
      totalBytes: data.total_bytes,
      averageBytes: data.average_bytes,
      percentiles: data.percentiles,
    };
  }

  /**
   * Gets delivery performance metrics.
   */
  async getDeliveryStats(opts?: {
    period?: StatsPeriod;
  }): Promise<DeliveryStats> {
    const qs = opts?.period ? `?period=${opts.period}` : "";
    const response = await this.authenticatedRequest(
      "GET",
      `/v1/stats/delivery${qs}`
    );
    const data = await response.json();
    return {
      period: data.period,
      totalCompleted: data.total_completed,
      successRate: data.success_rate,
      retryRate: data.retry_rate,
      deliveryTimes: {
        averageMs: data.delivery_times.average_ms,
        p95Ms: data.delivery_times.p95_ms,
        p99Ms: data.delivery_times.p99_ms,
      },
    };
  }

  /**
   * Gets error breakdown statistics.
   */
  async getErrorStats(opts?: {
    period?: StatsPeriod;
    limit?: number;
  }): Promise<ErrorStats> {
    const params: string[] = [];
    if (opts?.period) params.push(`period=${opts.period}`);
    if (opts?.limit != null) params.push(`limit=${opts.limit}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";

    const response = await this.authenticatedRequest(
      "GET",
      `/v1/stats/errors${qs}`
    );
    const data = await response.json();
    return {
      period: data.period,
      totalErrors: data.total_errors,
      byType: data.by_type,
      byStatusCode: data.by_status_code,
      topFailingDestinations: data.top_failing_destinations.map(
        (d: Record<string, unknown>) => ({ url: d.url, count: d.count })
      ),
    };
  }

  /**
   * Gets per-destination metrics.
   */
  async getDestinationStats(opts?: {
    period?: StatsPeriod;
    limit?: number;
  }): Promise<DestinationStats> {
    const params: string[] = [];
    if (opts?.period) params.push(`period=${opts.period}`);
    if (opts?.limit != null) params.push(`limit=${opts.limit}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";

    const response = await this.authenticatedRequest(
      "GET",
      `/v1/stats/destinations${qs}`
    );
    const data = await response.json();
    return {
      period: data.period,
      destinations: data.destinations.map((d: Record<string, unknown>) => ({
        url: d.url,
        volume: d.volume,
        successRate: d.success_rate,
        avgResponseTimeMs: d.avg_response_time_ms,
      })),
    };
  }

  /**
   * Gets activity timeline with optional filtering and cursor pagination.
   */
  async getActivityStats(opts?: {
    period?: StatsPeriod;
    limit?: number;
    status?: string;
    afterCursor?: string;
  }): Promise<ActivityStats> {
    const params: string[] = [];
    if (opts?.period) params.push(`period=${opts.period}`);
    if (opts?.limit != null) params.push(`limit=${opts.limit}`);
    if (opts?.status) params.push(`status=${opts.status}`);
    if (opts?.afterCursor)
      params.push(`after_cursor=${encodeURIComponent(opts.afterCursor)}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";

    const response = await this.authenticatedRequest(
      "GET",
      `/v1/stats/activity${qs}`
    );
    const data = await response.json();
    return {
      period: data.period,
      data: data.data.map(mapActivityEntry),
      meta: {
        hasMore: data.meta.has_more,
        nextCursor: data.meta.next_cursor ?? null,
      },
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private async unauthenticatedRequest(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Response> {
    const response = await this.http.request(method, path, {
      body: body ? JSON.stringify(body) : null,
      auth: { type: "none" },
    });

    if (!response.ok) {
      throw await this.http.parseError(response);
    }

    return response;
  }

  private async authenticatedRequest(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Response> {
    await this.ensureValidToken();

    const response = await this.http.request(method, path, {
      body: body ? JSON.stringify(body) : null,
      auth: { type: "bearer", token: this.accessToken! },
    });

    if (!response.ok) {
      throw await this.http.parseError(response);
    }

    return response;
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken) {
      throw new RicqchetError(
        "unauthorized",
        "Not authenticated. Call login() or acceptInvite() first.",
        null
      );
    }

    // Refresh if token expires within 30 seconds
    if (Date.now() >= this.expiresAt - 30_000) {
      await this.refresh();
    }
  }

  private storeTokens(data: Record<string, unknown>): void {
    this.accessToken = data.access_token as string;
    this.refreshToken = data.refresh_token as string;
    this.expiresAt = Date.now() + (data.expires_in as number) * 1000;
  }
}

// ─── Mapping Helpers ─────────────────────────────────────────────────────────

function mapAuthUser(data: Record<string, unknown>): AuthUser {
  return {
    id: data.id as string,
    email: data.email as string,
    role: data.role as string,
    status: data.status as string,
    tenantId: data.tenant_id as string,
    tenantName: data.tenant_name as string | undefined,
  };
}

function mapTenant(data: Record<string, unknown>): Tenant {
  return {
    id: data.id as string,
    name: data.name as string,
    status: data.status as string,
    defaultMaxRetries: data.default_max_retries as number,
    signingSecret: data.signing_secret as string | undefined,
    insertedAt: data.inserted_at as string,
    updatedAt: data.updated_at as string,
  };
}

function mapTenantUser(data: Record<string, unknown>): TenantUser {
  return {
    id: data.id as string,
    email: data.email as string,
    role: data.role as string,
    status: data.status as string,
    confirmedAt: (data.confirmed_at as string) ?? null,
    lastLoginAt: (data.last_login_at as string) ?? null,
    insertedAt: data.inserted_at as string,
    updatedAt: data.updated_at as string,
  };
}

function mapApplication(data: Record<string, unknown>): Application {
  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string) ?? null,
    status: data.status as string,
    dlqDestinationUrl: (data.dlq_destination_url as string) ?? null,
    apiKeyCount: data.api_key_count as number,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

function mapApiKeySummary(data: Record<string, unknown>): ApiKeySummary {
  return {
    id: data.id as string,
    name: data.name as string,
    prefix: data.prefix as string,
    status: data.status as string,
    lastUsedAt: (data.last_used_at as string) ?? null,
    expiresAt: (data.expires_at as string) ?? null,
    createdAt: data.created_at as string,
  };
}

function mapApiKeyCreateResult(
  data: Record<string, unknown>
): ApiKeyCreateResult {
  return {
    id: data.id as string,
    name: data.name as string,
    apiKey: data.api_key as string,
    prefix: data.prefix as string,
    status: data.status as string,
    expiresAt: (data.expires_at as string) ?? null,
    createdAt: data.created_at as string,
  };
}

function mapChannelNamespace(data: Record<string, unknown>): ChannelNamespace {
  return {
    id: data.id as string,
    pattern: data.pattern as string,
    priority: data.priority as number,
    historyEnabled: data.history_enabled as boolean,
    historyTtlSeconds: (data.history_ttl_seconds as number) ?? null,
    historyMaxEvents: (data.history_max_events as number) ?? null,
    cacheEnabled: data.cache_enabled as boolean,
    maxMembers: (data.max_members as number) ?? null,
    maxEventSizeBytes: (data.max_event_size_bytes as number) ?? null,
    maxClientEventsPerSecond:
      (data.max_client_events_per_second as number) ?? null,
    authEndpoint: (data.auth_endpoint as string) ?? null,
    webhookUrl: (data.webhook_url as string) ?? null,
    insertedAt: data.inserted_at as string,
    updatedAt: data.updated_at as string,
  };
}

function toSnakeCaseNamespaceBody(
  params: ChannelNamespaceParams
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (params.pattern !== undefined) body.pattern = params.pattern;
  if (params.priority !== undefined) body.priority = params.priority;
  if (params.historyEnabled !== undefined)
    body.history_enabled = params.historyEnabled;
  if (params.historyTtlSeconds !== undefined)
    body.history_ttl_seconds = params.historyTtlSeconds;
  if (params.historyMaxEvents !== undefined)
    body.history_max_events = params.historyMaxEvents;
  if (params.cacheEnabled !== undefined)
    body.cache_enabled = params.cacheEnabled;
  if (params.maxMembers !== undefined) body.max_members = params.maxMembers;
  if (params.maxEventSizeBytes !== undefined)
    body.max_event_size_bytes = params.maxEventSizeBytes;
  if (params.maxClientEventsPerSecond !== undefined)
    body.max_client_events_per_second = params.maxClientEventsPerSecond;
  if (params.authEndpoint !== undefined)
    body.auth_endpoint = params.authEndpoint;
  if (params.webhookUrl !== undefined) body.webhook_url = params.webhookUrl;
  return body;
}

function mapActivityEntry(data: Record<string, unknown>): ActivityEntry {
  return {
    id: data.id as string,
    destinationUrl: data.destination_url as string,
    status: data.status as string,
    attempts: data.attempts as number,
    lastError: (data.last_error as string) ?? null,
    lastResponseStatus: (data.last_response_status as number) ?? null,
    payloadSizeBytes: (data.payload_size_bytes as number) ?? null,
    applicationId: (data.application_id as string) ?? null,
    createdAt: data.created_at as string,
    completedAt: (data.completed_at as string) ?? null,
  };
}
