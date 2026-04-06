import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { RicqchetManagementClient } from "../src/management";
import { RicqchetError } from "../src/error";

const baseUrl = "http://localhost:3000";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockLogin() {
  server.use(
    http.post(`${baseUrl}/v1/auth/login`, () =>
      HttpResponse.json({
        user: {
          id: "u1",
          email: "admin@test.com",
          role: "admin",
          status: "active",
          tenant_id: "t1",
          tenant_name: "Test",
        },
        access_token: "jwt-token",
        refresh_token: "refresh-token",
        expires_in: 900,
      })
    )
  );
}

async function authenticatedClient(): Promise<RicqchetManagementClient> {
  mockLogin();
  const client = new RicqchetManagementClient({ baseUrl });
  await client.login("admin@test.com", "password");
  server.resetHandlers();
  return client;
}

describe("RicqchetManagementClient", () => {
  // ─── Auth ──────────────────────────────────────────────────────────────

  describe("register", () => {
    it("registers a new user and tenant", async () => {
      server.use(
        http.post(`${baseUrl}/v1/auth/register`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.email).toBe("user@test.com");
          expect(body.tenant_name).toBe("My Org");

          return HttpResponse.json(
            {
              user: {
                id: "u1",
                email: "user@test.com",
                role: "admin",
                status: "pending",
                tenant_id: "t1",
              },
              message: "Registration successful.",
            },
            { status: 201 }
          );
        })
      );

      const client = new RicqchetManagementClient({ baseUrl });
      const result = await client.register({
        email: "user@test.com",
        password: "secure-password",
        tenantName: "My Org",
      });

      expect(result.user.email).toBe("user@test.com");
      expect(result.user.tenantId).toBe("t1");
    });
  });

  describe("login", () => {
    it("logs in and stores tokens", async () => {
      mockLogin();
      const client = new RicqchetManagementClient({ baseUrl });
      expect(client.isAuthenticated).toBe(false);

      const result = await client.login("admin@test.com", "password");

      expect(result.accessToken).toBe("jwt-token");
      expect(result.refreshToken).toBe("refresh-token");
      expect(result.expiresIn).toBe(900);
      expect(result.user.role).toBe("admin");
      expect(client.isAuthenticated).toBe(true);
    });
  });

  describe("automatic token refresh", () => {
    it("refreshes expired token before making requests", async () => {
      // Login with very short expiry (already expired)
      server.use(
        http.post(`${baseUrl}/v1/auth/login`, () =>
          HttpResponse.json({
            user: {
              id: "u1",
              email: "a@b.com",
              role: "admin",
              status: "active",
              tenant_id: "t1",
            },
            access_token: "old-token",
            refresh_token: "refresh-token",
            expires_in: 0, // Already expired
          })
        )
      );

      const client = new RicqchetManagementClient({ baseUrl });
      await client.login("a@b.com", "pass");
      server.resetHandlers();

      // Mock refresh and tenant request
      let refreshCalled = false;
      server.use(
        http.post(`${baseUrl}/v1/auth/refresh`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.refresh_token).toBe("refresh-token");
          refreshCalled = true;

          return HttpResponse.json({
            access_token: "new-token",
            expires_in: 900,
          });
        }),
        http.get(`${baseUrl}/v1/tenant`, ({ request }) => {
          expect(request.headers.get("authorization")).toBe("Bearer new-token");

          return HttpResponse.json({
            id: "t1",
            name: "Test",
            status: "active",
            default_max_retries: 3,
            inserted_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          });
        })
      );

      await client.getTenant();
      expect(refreshCalled).toBe(true);
    });
  });

  describe("verifyEmail", () => {
    it("verifies email with token", async () => {
      server.use(
        http.post(`${baseUrl}/v1/auth/verify-email`, () =>
          HttpResponse.json({
            user: {
              id: "u1",
              email: "a@b.com",
              status: "active",
              confirmed_at: "2024-01-01T00:00:00Z",
            },
            message: "Email verified successfully",
          })
        )
      );

      const client = new RicqchetManagementClient({ baseUrl });
      const result = await client.verifyEmail("token-123");
      expect(result.user.confirmedAt).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("logout", () => {
    it("clears stored tokens", async () => {
      const client = await authenticatedClient();

      server.use(
        http.post(`${baseUrl}/v1/auth/logout`, () =>
          HttpResponse.json({ message: "Logged out successfully" })
        )
      );

      await client.logout();
      expect(client.isAuthenticated).toBe(false);
    });
  });

  describe("changePassword", () => {
    it("changes password and returns new tokens", async () => {
      const client = await authenticatedClient();

      server.use(
        http.post(`${baseUrl}/v1/auth/change-password`, () =>
          HttpResponse.json({
            user: {
              id: "u1",
              email: "a@b.com",
              role: "admin",
              status: "active",
              tenant_id: "t1",
            },
            access_token: "new-jwt",
            refresh_token: "new-refresh",
            expires_in: 900,
          })
        )
      );

      const result = await client.changePassword("old", "new");
      expect(result.accessToken).toBe("new-jwt");
    });
  });

  describe("unauthenticated errors", () => {
    it("throws when calling authenticated endpoint without login", async () => {
      const client = new RicqchetManagementClient({ baseUrl });
      await expect(client.getTenant()).rejects.toThrow(RicqchetError);
    });
  });

  // ─── Tenant ────────────────────────────────────────────────────────────

  describe("getTenant", () => {
    it("returns tenant info", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/tenant`, () =>
          HttpResponse.json({
            id: "t1",
            name: "Acme",
            status: "active",
            default_max_retries: 3,
            signing_secret: "c2VjcmV0",
            inserted_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
          })
        )
      );

      const tenant = await client.getTenant();
      expect(tenant.name).toBe("Acme");
      expect(tenant.defaultMaxRetries).toBe(3);
      expect(tenant.signingSecret).toBe("c2VjcmV0");
    });
  });

  describe("listTenantUsers", () => {
    it("returns paginated users", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/tenant/users`, () =>
          HttpResponse.json({
            data: [
              {
                id: "u1",
                email: "a@b.com",
                role: "admin",
                status: "active",
                confirmed_at: "2024-01-01T00:00:00Z",
                last_login_at: "2024-06-01T00:00:00Z",
                inserted_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-06-01T00:00:00Z",
              },
            ],
            meta: {
              total: 1,
              has_next_page: false,
              has_previous_page: false,
              start_cursor: "c1",
              end_cursor: "c1",
            },
          })
        )
      );

      const result = await client.listTenantUsers({ limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].lastLoginAt).toBe("2024-06-01T00:00:00Z");
      expect(result.meta.total).toBe(1);
    });
  });

  describe("inviteUser", () => {
    it("invites a user to the tenant", async () => {
      const client = await authenticatedClient();

      server.use(
        http.post(`${baseUrl}/v1/tenant/users/invite`, () =>
          HttpResponse.json(
            {
              id: "inv-1",
              email: "new@user.com",
              role: "member",
              status: "pending",
              token: "invite-token",
              expires_at: "2024-02-01T00:00:00Z",
              inserted_at: "2024-01-01T00:00:00Z",
            },
            { status: 201 }
          )
        )
      );

      const invite = await client.inviteUser({
        email: "new@user.com",
        role: "member",
      });
      expect(invite.token).toBe("invite-token");
    });
  });

  // ─── Applications ──────────────────────────────────────────────────────

  describe("listApplications", () => {
    it("returns paginated applications", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/applications`, () =>
          HttpResponse.json({
            data: [
              {
                id: "app-1",
                name: "My App",
                description: "Test app",
                status: "active",
                dlq_destination_url: null,
                api_key_count: 2,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-02T00:00:00Z",
              },
            ],
            meta: {
              total: 1,
              has_next_page: false,
              has_previous_page: false,
              start_cursor: "c1",
              end_cursor: "c1",
            },
          })
        )
      );

      const result = await client.listApplications();
      expect(result.data[0].name).toBe("My App");
      expect(result.data[0].apiKeyCount).toBe(2);
    });
  });

  describe("createApplication", () => {
    it("creates an application and returns the API key", async () => {
      const client = await authenticatedClient();

      server.use(
        http.post(`${baseUrl}/v1/applications`, () =>
          HttpResponse.json(
            {
              id: "app-1",
              name: "New App",
              description: null,
              status: "active",
              dlq_destination_url: null,
              api_key: "rq_live_abc123xyz",
              created_at: "2024-01-01T00:00:00Z",
            },
            { status: 201 }
          )
        )
      );

      const result = await client.createApplication({ name: "New App" });
      expect(result.apiKey).toBe("rq_live_abc123xyz");
    });
  });

  describe("getApplication", () => {
    it("returns application detail with API keys", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/applications/app-1`, () =>
          HttpResponse.json({
            id: "app-1",
            name: "My App",
            description: null,
            status: "active",
            dlq_destination_url: null,
            api_keys: [
              {
                id: "key-1",
                name: "Production",
                prefix: "rq_live_",
                status: "active",
                last_used_at: "2024-06-01T00:00:00Z",
                expires_at: null,
                created_at: "2024-01-01T00:00:00Z",
              },
            ],
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-02T00:00:00Z",
          })
        )
      );

      const app = await client.getApplication("app-1");
      expect(app.apiKeys).toHaveLength(1);
      expect(app.apiKeys[0].prefix).toBe("rq_live_");
    });
  });

  describe("deleteApplication", () => {
    it("deletes an application", async () => {
      const client = await authenticatedClient();

      server.use(
        http.delete(`${baseUrl}/v1/applications/app-1`, () =>
          HttpResponse.json({
            deleted: true,
            id: "app-1",
            api_keys_revoked: 2,
          })
        )
      );

      const result = await client.deleteApplication("app-1");
      expect(result.deleted).toBe(true);
      expect(result.apiKeysRevoked).toBe(2);
    });
  });

  // ─── API Keys ──────────────────────────────────────────────────────────

  describe("createApiKey", () => {
    it("creates an API key and returns the full key", async () => {
      const client = await authenticatedClient();

      server.use(
        http.post(`${baseUrl}/v1/applications/app-1/api-keys`, () =>
          HttpResponse.json(
            {
              id: "key-1",
              name: "Staging",
              api_key: "rq_test_xyz789",
              prefix: "rq_test_",
              status: "active",
              expires_at: null,
              created_at: "2024-01-01T00:00:00Z",
            },
            { status: 201 }
          )
        )
      );

      const result = await client.createApiKey("app-1", { name: "Staging" });
      expect(result.apiKey).toBe("rq_test_xyz789");
    });
  });

  describe("revokeApiKey", () => {
    it("revokes an API key", async () => {
      const client = await authenticatedClient();

      server.use(
        http.delete(`${baseUrl}/v1/api-keys/key-1`, () =>
          HttpResponse.json({
            id: "key-1",
            name: "Old Key",
            prefix: "rq_live_",
            status: "revoked",
            revoked: true,
            revoked_at: "2024-06-01T00:00:00Z",
          })
        )
      );

      const result = await client.revokeApiKey("key-1");
      expect(result.revoked).toBe(true);
    });
  });

  describe("rotateApiKey", () => {
    it("rotates an API key", async () => {
      const client = await authenticatedClient();

      server.use(
        http.post(`${baseUrl}/v1/api-keys/key-1/rotate`, () =>
          HttpResponse.json({
            old_api_key: {
              id: "key-1",
              name: "Prod",
              prefix: "rq_live_",
              status: "revoked",
            },
            new_api_key: {
              id: "key-2",
              name: "Prod",
              api_key: "rq_live_newkey",
              prefix: "rq_live_",
              status: "active",
              expires_at: null,
              created_at: "2024-06-01T00:00:00Z",
            },
          })
        )
      );

      const result = await client.rotateApiKey("key-1");
      expect(result.oldApiKey.status).toBe("revoked");
      expect(result.newApiKey.apiKey).toBe("rq_live_newkey");
    });
  });

  // ─── Channel Namespaces ────────────────────────────────────────────────

  describe("listChannelNamespaces", () => {
    it("lists namespaces for an application", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/applications/app-1/channel-namespaces`, () =>
          HttpResponse.json({
            data: [
              {
                id: "ns-1",
                pattern: "orders-*",
                priority: 0,
                history_enabled: true,
                history_ttl_seconds: 3600,
                history_max_events: 100,
                cache_enabled: false,
                max_members: null,
                max_event_size_bytes: null,
                max_client_events_per_second: null,
                auth_endpoint: null,
                webhook_url: null,
                inserted_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
            ],
          })
        )
      );

      const namespaces = await client.listChannelNamespaces("app-1");
      expect(namespaces).toHaveLength(1);
      expect(namespaces[0].pattern).toBe("orders-*");
      expect(namespaces[0].historyEnabled).toBe(true);
      expect(namespaces[0].historyTtlSeconds).toBe(3600);
    });
  });

  describe("createChannelNamespace", () => {
    it("creates a namespace", async () => {
      const client = await authenticatedClient();

      server.use(
        http.post(
          `${baseUrl}/v1/applications/app-1/channel-namespaces`,
          async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            expect(body.pattern).toBe("private-*");
            expect(body.cache_enabled).toBe(true);

            return HttpResponse.json(
              {
                id: "ns-2",
                pattern: "private-*",
                priority: 0,
                history_enabled: false,
                history_ttl_seconds: null,
                history_max_events: null,
                cache_enabled: true,
                max_members: null,
                max_event_size_bytes: null,
                max_client_events_per_second: null,
                auth_endpoint: null,
                webhook_url: null,
                inserted_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
              },
              { status: 201 }
            );
          }
        )
      );

      const ns = await client.createChannelNamespace("app-1", {
        pattern: "private-*",
        cacheEnabled: true,
      });
      expect(ns.cacheEnabled).toBe(true);
    });
  });

  // ─── Stats ─────────────────────────────────────────────────────────────

  describe("getMessageStats", () => {
    it("returns message counts by status", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/stats/messages`, () =>
          HttpResponse.json({
            period: "1h",
            counts: { pending: 5, dispatched: 10, delivered: 100, failed: 2 },
            total: 117,
          })
        )
      );

      const stats = await client.getMessageStats();
      expect(stats.total).toBe(117);
      expect(stats.counts.delivered).toBe(100);
    });
  });

  describe("getMessageSizeStats", () => {
    it("returns size percentiles", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/stats/message-sizes`, () =>
          HttpResponse.json({
            period: "1d",
            message_count: 50,
            total_bytes: 50000,
            average_bytes: 1000,
            percentiles: { p50: 800, p95: 2000, p99: 5000 },
          })
        )
      );

      const stats = await client.getMessageSizeStats({ period: "1d" });
      expect(stats.messageCount).toBe(50);
      expect(stats.percentiles.p95).toBe(2000);
    });
  });

  describe("getDeliveryStats", () => {
    it("returns delivery performance", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/stats/delivery`, () =>
          HttpResponse.json({
            period: "1h",
            total_completed: 200,
            success_rate: 98.5,
            retry_rate: 5.0,
            delivery_times: {
              average_ms: 150,
              p95_ms: 500,
              p99_ms: 1200,
            },
          })
        )
      );

      const stats = await client.getDeliveryStats();
      expect(stats.successRate).toBe(98.5);
      expect(stats.deliveryTimes.p99Ms).toBe(1200);
    });
  });

  describe("getErrorStats", () => {
    it("returns error breakdown", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/stats/errors`, ({ request }) => {
          const url = new URL(request.url);
          expect(url.searchParams.get("limit")).toBe("5");

          return HttpResponse.json({
            period: "1h",
            total_errors: 10,
            by_type: { timeout: 5, http_5xx: 3, dns_error: 2 },
            by_status_code: { "500": 2, "502": 1 },
            top_failing_destinations: [{ url: "https://bad.com", count: 7 }],
          });
        })
      );

      const stats = await client.getErrorStats({ limit: 5 });
      expect(stats.totalErrors).toBe(10);
      expect(stats.topFailingDestinations[0].url).toBe("https://bad.com");
    });
  });

  describe("getDestinationStats", () => {
    it("returns per-destination metrics", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/stats/destinations`, () =>
          HttpResponse.json({
            period: "1h",
            destinations: [
              {
                url: "https://api.example.com",
                volume: 500,
                success_rate: 99.2,
                avg_response_time_ms: 120,
              },
            ],
          })
        )
      );

      const stats = await client.getDestinationStats();
      expect(stats.destinations[0].avgResponseTimeMs).toBe(120);
    });
  });

  describe("getActivityStats", () => {
    it("returns activity timeline with pagination", async () => {
      const client = await authenticatedClient();

      server.use(
        http.get(`${baseUrl}/v1/stats/activity`, () =>
          HttpResponse.json({
            period: "1h",
            data: [
              {
                id: "msg-1",
                destination_url: "https://example.com",
                status: "delivered",
                attempts: 1,
                last_error: null,
                last_response_status: 200,
                payload_size_bytes: 256,
                application_id: "app-1",
                created_at: "2024-01-01T00:00:00Z",
                completed_at: "2024-01-01T00:00:01Z",
              },
            ],
            meta: { has_more: true, next_cursor: "cursor-2" },
          })
        )
      );

      const stats = await client.getActivityStats();
      expect(stats.data[0].destinationUrl).toBe("https://example.com");
      expect(stats.meta.hasMore).toBe(true);
      expect(stats.meta.nextCursor).toBe("cursor-2");
    });
  });
});
