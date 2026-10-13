# virtual-obsidian

ObsidianプラグインのUI・結合テスト用に、Vault、Workspace、MetadataCache、Canvasをメモリ上で再現する軽量ランタイムである。状態遷移の正本はRust/WASM、Obsidian互換APIとDOM連携はTypeScriptで実装する。Obsidian本体の完全互換やElectronの再実装は目的にしない。

```js
import { createVirtualObsidian, initializeVirtualObsidian } from "virtual-obsidian";

await initializeVirtualObsidian();

const runtime = createVirtualObsidian({
  files: [{ path: "Daily/2026-10-13.md", content: "# Daily" }],
  canvases: [{ path: "Thinking.canvas", nodes: [], edges: [] }],
  activeCanvas: "Thinking.canvas"
});

const { app } = runtime;
```

`initializeVirtualObsidian()`はテストホスト起動時に一度だけ呼ぶ。bundlerがWasmの相対URLを維持できない場合は、`initializeVirtualObsidian("/assets/core_bg.wasm")`のように配信URLを明示する。以後の`createVirtualObsidian()`とObsidian互換APIは同期的に組み立てられる。未初期化時はNode単体テスト用のJSエンジンへフォールバックする。

## 対象

- Vaultの読み書き、作成、削除、イベント
- MetadataCacheのfrontmatter、tag、heading
- Workspaceのactive fileとCanvas leaf
- Canvasのnodes、edges、selection
- PC／mobileシナリオ切替

Markdown描画、Menu、Noticeなどの表示部品は利用側のUIアダプターに残す。これによりDOM実装と状態モデルを分離し、React以外のプラグインからも使える。

## 境界

- Rust/WASM: path検証、VaultとCanvasの状態、active context、revision、決定的snapshot
- JavaScript: `TFile`の参照同一性、イベント配送、Obsidian API形状、DOMアダプター
- 実機: Obsidian内部API、Electron、iCloud、iPhone固有挙動

## UXシナリオ計測

Visual harnessから操作を`action`で包み、所要時間を実時間ではなく決定的な論理時間として与える。操作数、失敗数、操作後に戻るべきanchor、操作前後で維持すべきidentityを同じレポートへ記録する。

```js
import { runUxScenario } from "virtual-obsidian/ux";

const result = await runUxScenario({
  id: "task-add-return",
  product: "Taktune",
  fixture: { task: "計測する" },
  thresholds: { maxElapsedMs: 500, maxActions: 4, maxFailures: 0 },
  async run({ action, assertIdentity, markRecoveryAnchor }, fixture) {
    await action("add task", { durationMs: 180, target: "quick-add" }, () =>
      visualDriver.addTask(fixture.task),
    );
    await action("return", { durationMs: 80 }, () => visualDriver.goBack());
    assertIdentity("returned task", fixture.task, visualDriver.currentTaskId());
    markRecoveryAnchor(`task:${fixture.task}`);
  },
});
```

`setup(fixture)`には`createVirtualObsidian`やPlaywright driverを渡せる。操作callbackの実行時間は`elapsedMs`へ混ぜず、`durationMs`だけを加算するため、CI負荷で結果が揺れない。`attempt`は失敗を記録して復帰操作を続行する用途である。`assertIdentity`はTask ID、Episode ID、Note pathなど、画面遷移や並べ替えで変化してはいけない同一性を検査する。

計測結果は`formatUxReportJson`または`formatUxReportMarkdown`でCI成果物へ変換できる。threshold超過時は`UxThresholdError`になるため、利用側のtest runnerで失敗として扱える。
