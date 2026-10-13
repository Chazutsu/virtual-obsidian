export interface UxThresholds {
  maxElapsedMs?: number;
  maxActions?: number;
  maxFailures?: number;
  requireRecoveryAnchor?: boolean;
  requireIdentityInvariant?: boolean;
}

export interface UxActionOptions {
  durationMs?: number;
  target?: string;
  recoveryAnchor?: string;
  continueOnError?: boolean;
}

export interface UxActionRecord {
  name: string;
  target: string | null;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  status: "passed" | "failed";
  error: { name: string; message: string } | null;
}

export interface UxIdentityInvariant {
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export class DeterministicClock {
  constructor(startMs?: number);
  now(): number;
  advance(durationMs: number): number;
  wait(durationMs: number): Promise<void>;
}

export class ActionRecorder {
  constructor(clock: DeterministicClock);
  action<T>(
    name: string,
    options?: UxActionOptions,
    operation?: () => T | Promise<T>,
  ): Promise<T | undefined>;
  attempt<T>(
    name: string,
    options?: UxActionOptions,
    operation?: () => T | Promise<T>,
  ): Promise<T | undefined>;
  markRecoveryAnchor(anchor: string): void;
  assertIdentity(name: string, expected: unknown, actual: unknown): boolean;
  snapshot(): {
    actions: UxActionRecord[];
    identityInvariants: UxIdentityInvariant[];
    recoveryAnchor: string | null;
  };
}

export interface UxScenarioContext<Runtime = unknown> {
  clock: DeterministicClock;
  runtime: Runtime;
  action: ActionRecorder["action"];
  attempt: ActionRecorder["attempt"];
  assertIdentity(name: string, expected: unknown, actual: unknown): boolean;
  markRecoveryAnchor(anchor: string): void;
}

export interface UxScenarioDefinition<Fixture = unknown, Runtime = unknown> {
  id: string;
  product: string;
  description?: string;
  fixture?: Fixture;
  thresholds?: UxThresholds;
  setup?(fixture: Fixture): Runtime | Promise<Runtime>;
  run(context: UxScenarioContext<Runtime>, fixture: Fixture): void | Promise<void>;
}

export interface UxThresholdViolation {
  metric: string;
  actual: string | number;
  limit: string | number;
}

export interface UxScenarioResult {
  id: string;
  product: string;
  description: string;
  passed: boolean;
  metrics: {
    elapsedMs: number;
    actionCount: number;
    failureCount: number;
    identityInvariantCount: number;
    identityFailureCount: number;
    recoveryAnchor: string | null;
  };
  thresholds: {
    maxElapsedMs: number | null;
    maxActions: number | null;
    maxFailures: number;
    requireRecoveryAnchor: boolean;
    requireIdentityInvariant: boolean;
  };
  violations: UxThresholdViolation[];
  actions: UxActionRecord[];
  identityInvariants: UxIdentityInvariant[];
  error: { name: string; message: string } | null;
}

export interface UxReport {
  schemaVersion: 1;
  passed: boolean;
  summary: { scenarioCount: number; passedCount: number; failedCount: number };
  scenarios: UxScenarioResult[];
}

export function runUxScenario<Fixture, Runtime>(
  definition: UxScenarioDefinition<Fixture, Runtime>,
  options?: { clock?: DeterministicClock; startMs?: number },
): Promise<UxScenarioResult>;
export function runUxScenarios(
  definitions: UxScenarioDefinition[],
  options?: { clock?: DeterministicClock; startMs?: number; failOnThreshold?: boolean },
): Promise<UxReport>;
export class UxThresholdError extends Error {
  constructor(report: UxReport);
  report: UxReport;
}
export function formatUxReportJson(report: UxReport): string;
export function formatUxReportMarkdown(report: UxReport): string;
