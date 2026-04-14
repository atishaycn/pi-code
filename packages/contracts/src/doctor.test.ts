import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { DoctorReport, PiDiagnostic } from "./doctor";

const decodePiDiagnostic = Schema.decodeUnknownSync(PiDiagnostic);
const decodeDoctorReport = Schema.decodeUnknownSync(DoctorReport);

describe("PiDiagnostic", () => {
  it("decodes coding-runtime diagnostics with fix hints", () => {
    const parsed = decodePiDiagnostic({
      id: "settings.invalid-json",
      category: "settings",
      severity: "error",
      summary: "settings.json is invalid",
      detail: "Trailing comma near line 14.",
      fixable: true,
      fixHint: "Rewrite settings.json without trailing commas.",
      filePaths: ["/tmp/pi/settings.json"],
    });

    expect(parsed.category).toBe("settings");
    expect(parsed.severity).toBe("error");
    expect(parsed.fixable).toBe(true);
    expect(parsed.filePaths).toEqual(["/tmp/pi/settings.json"]);
  });

  it("rejects unsupported non-coding categories", () => {
    expect(() =>
      decodePiDiagnostic({
        id: "mobile.push",
        category: "mobile",
        severity: "warning",
        summary: "not allowed",
      }),
    ).toThrow();
  });

  it("rejects blank summaries", () => {
    expect(() =>
      decodePiDiagnostic({
        id: "tools.git",
        category: "tools",
        severity: "warning",
        summary: "   ",
      }),
    ).toThrow();
  });

  it("rejects empty file path arrays", () => {
    expect(() =>
      decodePiDiagnostic({
        id: "sessions.corrupt-json",
        category: "sessions",
        severity: "error",
        summary: "Session file is invalid",
        filePaths: [],
      }),
    ).toThrow();
  });

  it("rejects blank detail strings", () => {
    expect(() =>
      decodePiDiagnostic({
        id: "settings.invalid-json",
        category: "settings",
        severity: "error",
        summary: "settings.json is invalid",
        detail: "   ",
      }),
    ).toThrow();
  });
});

describe("DoctorReport", () => {
  it("decodes stable report envelopes for embedders", () => {
    const parsed = decodeDoctorReport({
      version: 1,
      ok: false,
      generatedAt: "2026-04-13T00:00:00.000Z",
      summary: {
        total: 2,
        info: 0,
        warning: 1,
        error: 1,
      },
      diagnostics: [
        {
          id: "tools.rg.missing",
          category: "tools",
          severity: "error",
          summary: "rg missing from PATH",
          fixable: false,
        },
        {
          id: "auth.openai.unconfigured",
          category: "auth",
          severity: "warning",
          summary: "OpenAI credentials not configured",
          fixHint: "Run provider login or set API key before unattended runs.",
        },
      ],
    });

    expect(parsed.version).toBe(1);
    expect(parsed.ok).toBe(false);
    expect(parsed.summary.total).toBe(2);
    expect(parsed.summary.error).toBe(1);
    expect(parsed.diagnostics[1]?.category).toBe("auth");
  });

  it("rejects negative summary counts", () => {
    expect(() =>
      decodeDoctorReport({
        version: 1,
        ok: false,
        generatedAt: "2026-04-13T00:00:00.000Z",
        summary: {
          total: -1,
          info: 0,
          warning: 0,
          error: 0,
        },
        diagnostics: [],
      }),
    ).toThrow();
  });
});
