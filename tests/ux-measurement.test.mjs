import assert from "node:assert/strict";
import test from "node:test";
import { sampleUxScenarios } from "../src/sample-scenarios.mjs";
import {
  DeterministicClock,
  UxThresholdError,
  formatUxReportJson,
  formatUxReportMarkdown,
  runUxScenario,
  runUxScenarios,
} from "../src/ux-measurement.mjs";

for (const scenario of sampleUxScenarios) {
  test(`${scenario.product}: ${scenario.id} records deterministic UX metrics`, async () => {
    const first = await runUxScenario(scenario);
    const second = await runUxScenario(scenario);

    assert.equal(first.passed, true);
    assert.deepEqual(first, second);
    assert.ok(first.metrics.elapsedMs <= scenario.thresholds.maxElapsedMs);
    assert.ok(first.metrics.actionCount <= scenario.thresholds.maxActions);
    assert.equal(first.metrics.failureCount, 0);
    assert.ok(first.metrics.recoveryAnchor);
    assert.ok(first.metrics.identityInvariantCount > 0);
    assert.equal(first.metrics.identityFailureCount, 0);
  });
}

test("covers all nine product validation flows", () => {
  assert.equal(sampleUxScenarios.length, 9);
  const productCounts = sampleUxScenarios.reduce((counts, scenario) => {
    counts[scenario.product] = (counts[scenario.product] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(productCounts, { Taktune: 3, Sonora: 3, Graphune: 3 });
});

test("records a recoverable failure without reading wall-clock time", async () => {
  const result = await runUxScenario({
    id: "recoverable",
    product: "Fixture",
    thresholds: { maxElapsedMs: 50, maxActions: 2, maxFailures: 1 },
    async run({ attempt, action, markRecoveryAnchor }) {
      await attempt("primary action", { durationMs: 20 }, () => {
        throw new Error("offline");
      });
      await action("recover", { durationMs: 30 });
      markRecoveryAnchor("list:item-1");
    },
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.metrics, {
    elapsedMs: 50,
    actionCount: 2,
    failureCount: 1,
    identityInvariantCount: 0,
    identityFailureCount: 0,
    recoveryAnchor: "list:item-1",
  });
  assert.equal(result.actions[0].error.message, "offline");
});

test("reports threshold violations and can fail a command", async () => {
  const scenario = {
    id: "too-long",
    product: "Fixture",
    thresholds: { maxElapsedMs: 9 },
    async run({ action }) {
      await action("slow path", { durationMs: 10 });
    },
  };
  const report = await runUxScenarios([scenario]);
  assert.equal(report.passed, false);
  assert.deepEqual(report.scenarios[0].violations, [{ metric: "elapsedMs", actual: 10, limit: 9 }]);
  await assert.rejects(
    () => runUxScenarios([scenario], { failOnThreshold: true }),
    UxThresholdError,
  );
});

test("fails an aborted scenario even when one recoverable failure is allowed", async () => {
  const result = await runUxScenario({
    id: "aborted",
    product: "Fixture",
    thresholds: { maxFailures: 1 },
    async run({ action }) {
      await action("unhandled", {}, () => {
        throw new Error("not recovered");
      });
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.metrics.failureCount, 1);
  assert.equal(result.violations[0].metric, "scenario");
});

test("fails missing and mismatched recovery identity contracts", async () => {
  const result = await runUxScenario({
    id: "lost-context",
    product: "Fixture",
    thresholds: { requireRecoveryAnchor: true, requireIdentityInvariant: true },
    run({ assertIdentity }) {
      assertIdentity("note path", "Notes/Expected.md", "Notes/Duplicate.md");
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.metrics.identityFailureCount, 1);
  assert.deepEqual(
    result.violations.map((violation) => violation.metric),
    ["recoveryAnchor", "identity:note path"],
  );
});

test("serializes reports as stable JSON and Markdown", async () => {
  const report = await runUxScenarios(sampleUxScenarios);
  const json = formatUxReportJson(report);
  const markdown = formatUxReportMarkdown(report);

  assert.deepEqual(JSON.parse(json), report);
  assert.match(markdown, /Taktune/u);
  assert.match(markdown, /Sonora/u);
  assert.match(markdown, /Graphune/u);
  assert.match(markdown, /Recovery anchor/u);
});

test("supports an injected clock for a visual harness", async () => {
  const clock = new DeterministicClock(1_000);
  const result = await runUxScenario(
    {
      id: "injected-driver",
      product: "Fixture",
      async run({ action }) {
        await action("click", { durationMs: 25 }, async () => Promise.resolve());
      },
    },
    { clock },
  );
  assert.equal(result.metrics.elapsedMs, 25);
  assert.equal(clock.now(), 1_025);
});
