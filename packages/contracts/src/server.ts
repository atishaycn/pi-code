import { Schema } from "effect";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas";
import { DoctorReport } from "./doctor";
import { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings";
import { EditorId } from "./editor";
import { ModelCapabilities } from "./model";
import { ProviderKind } from "./orchestration";
import { ServerSettings } from "./settings";

const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

export const ServerConfigIssue = Schema.Union([
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
]);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

const ServerConfigIssues = Schema.Array(ServerConfigIssue);

export const ServerProviderState = Schema.Literals(["ready", "warning", "error", "disabled"]);
export type ServerProviderState = typeof ServerProviderState.Type;

export const ServerProviderAuthStatus = Schema.Literals([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

export const ServerProviderAuth = Schema.Struct({
  status: ServerProviderAuthStatus,
  type: Schema.optional(TrimmedNonEmptyString),
  label: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderAuth = typeof ServerProviderAuth.Type;

export const ServerProviderModel = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  isCustom: Schema.Boolean,
  capabilities: Schema.NullOr(ModelCapabilities),
});
export type ServerProviderModel = typeof ServerProviderModel.Type;

export const ServerProviderSkill = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  path: TrimmedNonEmptyString,
  scope: Schema.optional(TrimmedNonEmptyString),
  enabled: Schema.Boolean,
  displayName: Schema.optional(TrimmedNonEmptyString),
  shortDescription: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderSkill = typeof ServerProviderSkill.Type;

export const ServerProvider = Schema.Struct({
  provider: ProviderKind,
  enabled: Schema.Boolean,
  installed: Schema.Boolean,
  version: Schema.NullOr(TrimmedNonEmptyString),
  status: ServerProviderState,
  auth: ServerProviderAuth,
  checkedAt: IsoDateTime,
  message: Schema.optional(TrimmedNonEmptyString),
  models: Schema.Array(ServerProviderModel),
});
export type ServerProvider = typeof ServerProvider.Type;

export const ServerProviders = Schema.Array(ServerProvider);
export type ServerProviders = typeof ServerProviders.Type;

export const ServerObservability = Schema.Struct({
  logsDirectoryPath: TrimmedNonEmptyString,
  localTracingEnabled: Schema.Boolean,
  otlpTracesUrl: Schema.optional(TrimmedNonEmptyString),
  otlpTracesEnabled: Schema.Boolean,
  otlpMetricsUrl: Schema.optional(TrimmedNonEmptyString),
  otlpMetricsEnabled: Schema.Boolean,
});
export type ServerObservability = typeof ServerObservability.Type;

export const ServerConfig = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  keybindingsConfigPath: TrimmedNonEmptyString,
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
  providers: ServerProviders,
  availableEditors: Schema.Array(EditorId),
  observability: ServerObservability,
  settings: ServerSettings,
});
export type ServerConfig = typeof ServerConfig.Type;

export const ServerUpsertKeybindingInput = KeybindingRule;
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

export const ServerComposerSlashCommandSource = Schema.Literals(["extension", "prompt", "skill"]);
export type ServerComposerSlashCommandSource = typeof ServerComposerSlashCommandSource.Type;

export const ServerComposerSlashCommand = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  source: ServerComposerSlashCommandSource,
});
export type ServerComposerSlashCommand = typeof ServerComposerSlashCommand.Type;

export const ServerGetComposerSlashCommandsInput = Schema.Struct({
  provider: ProviderKind,
  cwd: TrimmedNonEmptyString,
});
export type ServerGetComposerSlashCommandsInput = typeof ServerGetComposerSlashCommandsInput.Type;

export const ServerGetComposerSlashCommandsResult = Schema.Struct({
  commands: Schema.Array(ServerComposerSlashCommand),
});
export type ServerGetComposerSlashCommandsResult = typeof ServerGetComposerSlashCommandsResult.Type;

export class ServerGetComposerSlashCommandsError extends Schema.TaggedErrorClass<ServerGetComposerSlashCommandsError>()(
  "ServerGetComposerSlashCommandsError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const PiQueueMode = Schema.Literals(["all", "one-at-a-time"]);
export type PiQueueMode = typeof PiQueueMode.Type;

export const ServerPiRuntimeModel = Schema.Struct({
  provider: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
  contextWindow: Schema.optional(NonNegativeInt),
  reasoning: Schema.optional(Schema.Boolean),
});
export type ServerPiRuntimeModel = typeof ServerPiRuntimeModel.Type;

export const ServerPiThreadRuntimeState = Schema.Struct({
  model: Schema.NullOr(ServerPiRuntimeModel),
  thinkingLevel: TrimmedNonEmptyString,
  isStreaming: Schema.Boolean,
  isCompacting: Schema.Boolean,
  steeringMode: PiQueueMode,
  followUpMode: PiQueueMode,
  sessionFile: Schema.optional(TrimmedNonEmptyString),
  sessionId: TrimmedNonEmptyString,
  sessionName: Schema.optional(TrimmedNonEmptyString),
  autoCompactionEnabled: Schema.Boolean,
  messageCount: NonNegativeInt,
  pendingMessageCount: NonNegativeInt,
});
export type ServerPiThreadRuntimeState = typeof ServerPiThreadRuntimeState.Type;

export const ServerPiSessionStats = Schema.Struct({
  sessionFile: Schema.optional(TrimmedNonEmptyString),
  sessionId: TrimmedNonEmptyString,
  userMessages: NonNegativeInt,
  assistantMessages: NonNegativeInt,
  toolCalls: NonNegativeInt,
  toolResults: NonNegativeInt,
  totalMessages: NonNegativeInt,
  tokens: Schema.Struct({
    input: NonNegativeInt,
    output: NonNegativeInt,
    cacheRead: NonNegativeInt,
    cacheWrite: NonNegativeInt,
    total: NonNegativeInt,
  }),
  cost: Schema.Number,
  contextUsage: Schema.optional(
    Schema.Struct({
      tokens: Schema.NullOr(NonNegativeInt),
      contextWindow: NonNegativeInt,
      percent: Schema.NullOr(Schema.Number),
    }),
  ),
});
export type ServerPiSessionStats = typeof ServerPiSessionStats.Type;

export const ServerGetPiThreadRuntimeInput = Schema.Struct({
  threadId: ThreadId,
});
export type ServerGetPiThreadRuntimeInput = typeof ServerGetPiThreadRuntimeInput.Type;

export const ServerGetPiThreadRuntimeResult = Schema.Struct({
  state: ServerPiThreadRuntimeState,
  stats: Schema.optional(ServerPiSessionStats),
});
export type ServerGetPiThreadRuntimeResult = typeof ServerGetPiThreadRuntimeResult.Type;

export const ServerUpdatePiThreadRuntimeInput = Schema.Struct({
  threadId: ThreadId,
  steeringMode: Schema.optional(PiQueueMode),
  followUpMode: Schema.optional(PiQueueMode),
  autoCompactionEnabled: Schema.optional(Schema.Boolean),
  sessionName: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type ServerUpdatePiThreadRuntimeInput = typeof ServerUpdatePiThreadRuntimeInput.Type;

export const ServerUpdatePiThreadRuntimeResult = Schema.Struct({
  state: ServerPiThreadRuntimeState,
});
export type ServerUpdatePiThreadRuntimeResult = typeof ServerUpdatePiThreadRuntimeResult.Type;

export const ServerCompactPiThreadInput = Schema.Struct({
  threadId: ThreadId,
  customInstructions: Schema.optional(TrimmedNonEmptyString),
});
export type ServerCompactPiThreadInput = typeof ServerCompactPiThreadInput.Type;

export const ServerCompactPiThreadResult = Schema.Struct({
  summary: Schema.optional(TrimmedNonEmptyString),
});
export type ServerCompactPiThreadResult = typeof ServerCompactPiThreadResult.Type;

export const ServerPiResourceKind = Schema.Literals([
  "settings",
  "keybindings",
  "instruction",
  "system-prompt",
  "append-system-prompt",
  "prompt-template",
  "skill",
  "extension",
  "theme",
]);
export type ServerPiResourceKind = typeof ServerPiResourceKind.Type;

export const ServerPiResourceScope = Schema.Literals(["global", "project"]);
export type ServerPiResourceScope = typeof ServerPiResourceScope.Type;

export const ServerPiResourceEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  scope: ServerPiResourceScope,
  kind: ServerPiResourceKind,
  label: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
});
export type ServerPiResourceEntry = typeof ServerPiResourceEntry.Type;

export const ServerGetPiWorkspaceResult = Schema.Struct({
  globalRoot: TrimmedNonEmptyString,
  projectRoot: TrimmedNonEmptyString,
  resources: Schema.Array(ServerPiResourceEntry),
});
export type ServerGetPiWorkspaceResult = typeof ServerGetPiWorkspaceResult.Type;

export const ServerGetPiDoctorReportResult = DoctorReport;
export type ServerGetPiDoctorReportResult = typeof ServerGetPiDoctorReportResult.Type;

export const ServerReadPiResourceInput = Schema.Struct({
  path: TrimmedNonEmptyString,
});
export type ServerReadPiResourceInput = typeof ServerReadPiResourceInput.Type;

export const ServerReadPiResourceResult = Schema.Struct({
  path: TrimmedNonEmptyString,
  contents: Schema.String,
});
export type ServerReadPiResourceResult = typeof ServerReadPiResourceResult.Type;

export const ServerWritePiResourceInput = Schema.Struct({
  path: TrimmedNonEmptyString,
  contents: Schema.String,
});
export type ServerWritePiResourceInput = typeof ServerWritePiResourceInput.Type;

export const ServerWritePiResourceResult = Schema.Struct({
  path: TrimmedNonEmptyString,
});
export type ServerWritePiResourceResult = typeof ServerWritePiResourceResult.Type;

export class ServerPiRpcError extends Schema.TaggedErrorClass<ServerPiRpcError>()(
  "ServerPiRpcError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class ServerPiDoctorError extends Schema.TaggedErrorClass<ServerPiDoctorError>()(
  "ServerPiDoctorError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ServerRoadmapTrackingMode = Schema.Literals(["automatic", "manual-only"]);
export type ServerRoadmapTrackingMode = typeof ServerRoadmapTrackingMode.Type;

export const ServerRoadmapInfrastructureCheck = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  completed: Schema.Boolean,
  evidence: Schema.Array(TrimmedNonEmptyString),
});
export type ServerRoadmapInfrastructureCheck = typeof ServerRoadmapInfrastructureCheck.Type;

export const ServerRoadmapSubtaskStatus = Schema.Struct({
  subtaskId: TrimmedNonEmptyString,
  trackingMode: ServerRoadmapTrackingMode,
  completed: Schema.Boolean,
  evidence: Schema.Array(TrimmedNonEmptyString),
});
export type ServerRoadmapSubtaskStatus = typeof ServerRoadmapSubtaskStatus.Type;

export const ServerRoadmapValidationCheckId = Schema.Literals(["fmt", "lint", "typecheck", "test"]);
export type ServerRoadmapValidationCheckId = typeof ServerRoadmapValidationCheckId.Type;

export const ServerRoadmapValidationCheckStatus = Schema.Literals(["unknown", "pass", "fail"]);
export type ServerRoadmapValidationCheckStatus = typeof ServerRoadmapValidationCheckStatus.Type;

export const ServerRoadmapValidationCheck = Schema.Struct({
  id: ServerRoadmapValidationCheckId,
  label: TrimmedNonEmptyString,
  status: ServerRoadmapValidationCheckStatus,
  detail: Schema.optional(TrimmedNonEmptyString),
  updatedAt: Schema.optional(IsoDateTime),
});
export type ServerRoadmapValidationCheck = typeof ServerRoadmapValidationCheck.Type;

export const ServerGetRoadmapStatusResult = Schema.Struct({
  generatedAt: IsoDateTime,
  infrastructure: Schema.Array(ServerRoadmapInfrastructureCheck),
  subtasks: Schema.Array(ServerRoadmapSubtaskStatus),
  validations: Schema.Array(ServerRoadmapValidationCheck),
});
export type ServerGetRoadmapStatusResult = typeof ServerGetRoadmapStatusResult.Type;

export class ServerRoadmapStatusError extends Schema.TaggedErrorClass<ServerRoadmapStatusError>()(
  "ServerRoadmapStatusError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  providers: ServerProviders,
  settings: Schema.optional(ServerSettings),
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;

export const ServerConfigKeybindingsUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
});
export type ServerConfigKeybindingsUpdatedPayload =
  typeof ServerConfigKeybindingsUpdatedPayload.Type;

export const ServerConfigProviderStatusesPayload = Schema.Struct({
  providers: ServerProviders,
});
export type ServerConfigProviderStatusesPayload = typeof ServerConfigProviderStatusesPayload.Type;

export const ServerConfigSettingsUpdatedPayload = Schema.Struct({
  settings: ServerSettings,
});
export type ServerConfigSettingsUpdatedPayload = typeof ServerConfigSettingsUpdatedPayload.Type;

export const ServerConfigStreamSnapshotEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("snapshot"),
  config: ServerConfig,
});
export type ServerConfigStreamSnapshotEvent = typeof ServerConfigStreamSnapshotEvent.Type;

export const ServerConfigStreamKeybindingsUpdatedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("keybindingsUpdated"),
  payload: ServerConfigKeybindingsUpdatedPayload,
});
export type ServerConfigStreamKeybindingsUpdatedEvent =
  typeof ServerConfigStreamKeybindingsUpdatedEvent.Type;

export const ServerConfigStreamProviderStatusesEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("providerStatuses"),
  payload: ServerConfigProviderStatusesPayload,
});
export type ServerConfigStreamProviderStatusesEvent =
  typeof ServerConfigStreamProviderStatusesEvent.Type;

export const ServerConfigStreamSettingsUpdatedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("settingsUpdated"),
  payload: ServerConfigSettingsUpdatedPayload,
});
export type ServerConfigStreamSettingsUpdatedEvent =
  typeof ServerConfigStreamSettingsUpdatedEvent.Type;

export const ServerConfigStreamEvent = Schema.Union([
  ServerConfigStreamSnapshotEvent,
  ServerConfigStreamKeybindingsUpdatedEvent,
  ServerConfigStreamProviderStatusesEvent,
  ServerConfigStreamSettingsUpdatedEvent,
]);
export type ServerConfigStreamEvent = typeof ServerConfigStreamEvent.Type;

export const ServerLifecycleReadyPayload = Schema.Struct({
  at: IsoDateTime,
});
export type ServerLifecycleReadyPayload = typeof ServerLifecycleReadyPayload.Type;

export const ServerLifecycleWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type ServerLifecycleWelcomePayload = typeof ServerLifecycleWelcomePayload.Type;

export const ServerLifecycleStreamWelcomeEvent = Schema.Struct({
  version: Schema.Literal(1),
  sequence: NonNegativeInt,
  type: Schema.Literal("welcome"),
  payload: ServerLifecycleWelcomePayload,
});
export type ServerLifecycleStreamWelcomeEvent = typeof ServerLifecycleStreamWelcomeEvent.Type;

export const ServerLifecycleStreamReadyEvent = Schema.Struct({
  version: Schema.Literal(1),
  sequence: NonNegativeInt,
  type: Schema.Literal("ready"),
  payload: ServerLifecycleReadyPayload,
});
export type ServerLifecycleStreamReadyEvent = typeof ServerLifecycleStreamReadyEvent.Type;

export const ServerLifecycleStreamEvent = Schema.Union([
  ServerLifecycleStreamWelcomeEvent,
  ServerLifecycleStreamReadyEvent,
]);
export type ServerLifecycleStreamEvent = typeof ServerLifecycleStreamEvent.Type;

export const ServerProviderUpdatedPayload = Schema.Struct({
  providers: ServerProviders,
});
export type ServerProviderUpdatedPayload = typeof ServerProviderUpdatedPayload.Type;
