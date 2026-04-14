import { Schema } from "effect";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas";

const PI_DIAGNOSTIC_CATEGORIES = [
  "settings",
  "models",
  "auth",
  "extensions",
  "skills",
  "sessions",
  "tools",
  "terminal",
] as const;

export const PiDiagnosticCategory = Schema.Literals(PI_DIAGNOSTIC_CATEGORIES);
export type PiDiagnosticCategory = typeof PiDiagnosticCategory.Type;

const PI_DIAGNOSTIC_SEVERITIES = ["info", "warning", "error"] as const;

export const PiDiagnosticSeverity = Schema.Literals(PI_DIAGNOSTIC_SEVERITIES);
export type PiDiagnosticSeverity = typeof PiDiagnosticSeverity.Type;

const PiDiagnosticFilePaths = Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1));

export const PiDiagnostic = Schema.Struct({
  id: TrimmedNonEmptyString,
  category: PiDiagnosticCategory,
  severity: PiDiagnosticSeverity,
  summary: TrimmedNonEmptyString,
  detail: Schema.optional(TrimmedNonEmptyString),
  fixable: Schema.optional(Schema.Boolean),
  fixHint: Schema.optional(TrimmedNonEmptyString),
  filePaths: Schema.optional(PiDiagnosticFilePaths),
}).annotate({
  identifier: "PiDiagnostic",
  description:
    "Machine-readable Pi doctor diagnostic scoped to coding workflows and autonomous coding-agent runtime health.",
});
export type PiDiagnostic = typeof PiDiagnostic.Type;

export const DoctorReportVersion = Schema.Literal(1);
export type DoctorReportVersion = typeof DoctorReportVersion.Type;

export const DoctorReportSummary = Schema.Struct({
  total: NonNegativeInt,
  info: NonNegativeInt,
  warning: NonNegativeInt,
  error: NonNegativeInt,
}).annotate({
  identifier: "DoctorReportSummary",
});
export type DoctorReportSummary = typeof DoctorReportSummary.Type;

export const DoctorReport = Schema.Struct({
  version: DoctorReportVersion,
  ok: Schema.Boolean,
  generatedAt: IsoDateTime,
  summary: DoctorReportSummary,
  diagnostics: Schema.Array(PiDiagnostic),
}).annotate({
  identifier: "DoctorReport",
  description:
    "Stable Pi doctor v1 report envelope for coding-harness diagnostics and embedder-facing JSON output.",
});
export type DoctorReport = typeof DoctorReport.Type;
