export class DeterministicClock {
  #time;

  constructor(startMs = 0) {
    assertFiniteDuration(startMs, "startMs");
    this.#time = startMs;
  }

  now() {
    return this.#time;
  }

  advance(durationMs) {
    assertFiniteDuration(durationMs, "durationMs");
    this.#time += durationMs;
    return this.#time;
  }

  async wait(durationMs) {
    this.advance(durationMs);
  }
}

export class ActionRecorder {
  #actions = [];
  #clock;
  #identityInvariants = [];
  #recoveryAnchor = null;

  constructor(clock) {
    this.#clock = clock;
  }

  async action(name, options = {}, operation) {
    const startedAtMs = this.#clock.now();
    const durationMs = options.durationMs ?? 0;
    assertFiniteDuration(durationMs, "durationMs");
    let status = "passed";
    let error = null;
    let value;

    try {
      value = await operation?.();
    } catch (cause) {
      status = "failed";
      error = normalizeError(cause);
    } finally {
      this.#clock.advance(durationMs);
    }

    const entry = {
      name,
      target: options.target ?? null,
      startedAtMs,
      endedAtMs: this.#clock.now(),
      durationMs,
      status,
      error,
    };
    this.#actions.push(entry);
    if (options.recoveryAnchor) this.markRecoveryAnchor(options.recoveryAnchor);
    if (status === "failed" && !options.continueOnError) throw causeAsError(error);
    return value;
  }

  attempt(name, options = {}, operation) {
    return this.action(name, { ...options, continueOnError: true }, operation);
  }

  markRecoveryAnchor(anchor) {
    if (typeof anchor !== "string" || anchor.trim() === "") {
      throw new TypeError("recoveryAnchor must be a non-empty string");
    }
    this.#recoveryAnchor = anchor;
  }

  assertIdentity(name, expected, actual) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new TypeError("identity invariant name must be a non-empty string");
    }
    const invariant = {
      name,
      expected: String(expected),
      actual: String(actual),
      passed: Object.is(expected, actual),
    };
    this.#identityInvariants.push(invariant);
    return invariant.passed;
  }

  snapshot() {
    return {
      actions: structuredClone(this.#actions),
      identityInvariants: structuredClone(this.#identityInvariants),
      recoveryAnchor: this.#recoveryAnchor,
    };
  }
}

export async function runUxScenario(definition, options = {}) {
  validateScenario(definition);
  const clock = options.clock ?? new DeterministicClock(options.startMs ?? 0);
  const recorder = new ActionRecorder(clock);
  const startedAtMs = clock.now();
  const fixture = structuredClone(definition.fixture ?? {});
  let runtime;
  let scenarioError = null;

  try {
    runtime = definition.setup ? await definition.setup(fixture) : undefined;
    await definition.run(
      {
        clock,
        runtime,
        action: recorder.action.bind(recorder),
        attempt: recorder.attempt.bind(recorder),
        assertIdentity: recorder.assertIdentity.bind(recorder),
        markRecoveryAnchor: recorder.markRecoveryAnchor.bind(recorder),
      },
      fixture,
    );
  } catch (cause) {
    scenarioError = normalizeError(cause);
  }

  const snapshot = recorder.snapshot();
  const actionFailures = snapshot.actions.filter((action) => action.status === "failed");
  const metrics = {
    elapsedMs: clock.now() - startedAtMs,
    actionCount: snapshot.actions.length,
    failureCount: actionFailures.length,
    identityInvariantCount: snapshot.identityInvariants.length,
    identityFailureCount: snapshot.identityInvariants.filter((invariant) => !invariant.passed)
      .length,
    recoveryAnchor: snapshot.recoveryAnchor,
  };
  const thresholds = normalizeThresholds(definition.thresholds);
  const violations = evaluateThresholds(metrics, thresholds);
  if (scenarioError) {
    violations.unshift({
      metric: "scenario",
      actual: scenarioError.message,
      limit: "no unrecorded error",
    });
  }
  for (const invariant of snapshot.identityInvariants.filter((candidate) => !candidate.passed)) {
    violations.push({
      metric: `identity:${invariant.name}`,
      actual: invariant.actual,
      limit: invariant.expected,
    });
  }

  return {
    id: definition.id,
    product: definition.product,
    description: definition.description ?? "",
    passed: violations.length === 0,
    metrics,
    thresholds,
    violations,
    actions: snapshot.actions,
    identityInvariants: snapshot.identityInvariants,
    error: scenarioError,
  };
}

export async function runUxScenarios(definitions, options = {}) {
  const scenarios = [];
  for (const definition of definitions) {
    scenarios.push(await runUxScenario(definition, options));
  }
  const report = {
    schemaVersion: 1,
    passed: scenarios.every((scenario) => scenario.passed),
    summary: {
      scenarioCount: scenarios.length,
      passedCount: scenarios.filter((scenario) => scenario.passed).length,
      failedCount: scenarios.filter((scenario) => !scenario.passed).length,
    },
    scenarios,
  };
  if (options.failOnThreshold && !report.passed) throw new UxThresholdError(report);
  return report;
}

export class UxThresholdError extends Error {
  constructor(report) {
    const failedIds = report.scenarios
      .filter((scenario) => !scenario.passed)
      .map((scenario) => scenario.id)
      .join(", ");
    super(`UX measurement thresholds exceeded: ${failedIds}`);
    this.name = "UxThresholdError";
    this.report = report;
  }
}

export function formatUxReportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatUxReportMarkdown(report) {
  const lines = [
    "# UX measurement report",
    "",
    `Result: ${report.passed ? "PASS" : "FAIL"}`,
    "",
    "| Scenario | Product | Result | Elapsed | Actions | Failures | Identity | Recovery anchor |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const scenario of report.scenarios) {
    const anchor = scenario.metrics.recoveryAnchor ?? "—";
    lines.push(
      `| ${escapeMarkdown(scenario.id)} | ${escapeMarkdown(scenario.product)} | ${scenario.passed ? "PASS" : "FAIL"} | ${scenario.metrics.elapsedMs} ms | ${scenario.metrics.actionCount} | ${scenario.metrics.failureCount} | ${scenario.metrics.identityInvariantCount - scenario.metrics.identityFailureCount}/${scenario.metrics.identityInvariantCount} | ${escapeMarkdown(anchor)} |`,
    );
    for (const violation of scenario.violations) {
      lines.push(
        `| ↳ ${escapeMarkdown(violation.metric)} |  | ${escapeMarkdown(String(violation.actual))} (limit: ${escapeMarkdown(String(violation.limit))}) |  |  |  |  |  |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function normalizeThresholds(thresholds = {}) {
  return {
    maxElapsedMs: thresholds.maxElapsedMs ?? null,
    maxActions: thresholds.maxActions ?? null,
    maxFailures: thresholds.maxFailures ?? 0,
    requireRecoveryAnchor: thresholds.requireRecoveryAnchor ?? false,
    requireIdentityInvariant: thresholds.requireIdentityInvariant ?? false,
  };
}

function evaluateThresholds(metrics, thresholds) {
  const comparisons = [
    ["elapsedMs", metrics.elapsedMs, thresholds.maxElapsedMs],
    ["actionCount", metrics.actionCount, thresholds.maxActions],
    ["failureCount", metrics.failureCount, thresholds.maxFailures],
  ];
  const violations = comparisons
    .filter(([, actual, limit]) => limit !== null && actual > limit)
    .map(([metric, actual, limit]) => ({ metric, actual, limit }));
  if (thresholds.requireRecoveryAnchor && metrics.recoveryAnchor === null) {
    violations.push({ metric: "recoveryAnchor", actual: "missing", limit: "required" });
  }
  if (thresholds.requireIdentityInvariant && metrics.identityInvariantCount === 0) {
    violations.push({ metric: "identityInvariant", actual: 0, limit: "at least 1" });
  }
  return violations;
}

function validateScenario(definition) {
  if (!definition || typeof definition !== "object") throw new TypeError("scenario is required");
  if (typeof definition.id !== "string" || definition.id === "") {
    throw new TypeError("scenario.id is required");
  }
  if (typeof definition.product !== "string" || definition.product === "") {
    throw new TypeError("scenario.product is required");
  }
  if (typeof definition.run !== "function") throw new TypeError("scenario.run is required");
}

function assertFiniteDuration(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
}

function normalizeError(cause) {
  if (cause instanceof Error) return { name: cause.name, message: cause.message };
  return { name: "Error", message: String(cause) };
}

function causeAsError(error) {
  const cause = new Error(error.message);
  cause.name = error.name;
  return cause;
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}
