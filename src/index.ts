export { RicqchetClient } from "./client";
export type {
  RicqchetClientOptions,
  PublishOptions,
  PublishResult,
  FanOutResult,
  Message,
} from "./client";

export { RicqchetManagementClient } from "./management";
export type { RicqchetManagementClientOptions } from "./management";

export { verifySignature, verifyRequest } from "./verification";
export type { VerificationResult, VerificationMetadata } from "./verification";

export { RicqchetError } from "./error";
export type { RicqchetErrorType } from "./error";

export type {
  // Channels
  TriggerEventParams,
  TriggerEventResult,
  BatchTriggerParams,
  BatchTriggerResult,
  Channel,
  ChannelInfo,
  ChannelEvent,
  PresenceMember,
  DisconnectResult,
  // Pagination
  PaginationParams,
  FilterParam,
  SortParams,
  ListParams,
  PaginationMeta,
  PaginatedResponse,
  // Auth
  AuthUser,
  RegisterResult,
  LoginResult,
  RefreshResult,
  VerifyEmailResult,
  // Tenant
  Tenant,
  TenantUser,
  Invitation,
  // Applications
  Application,
  ApplicationDetail,
  ApplicationCreateResult,
  ApplicationDeleteResult,
  // API Keys
  ApiKeySummary,
  ApiKeyCreateResult,
  ApiKeyRevokeResult,
  ApiKeyRotateResult,
  // Channel Namespaces
  ChannelNamespace,
  ChannelNamespaceParams,
  // Stats
  StatsPeriod,
  MessageStats,
  MessageSizeStats,
  DeliveryStats,
  ErrorStats,
  DestinationStats,
  ActivityEntry,
  ActivityStats,
} from "./types";
