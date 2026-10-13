import { createVirtualObsidian } from "./index.mjs";

const strictThresholds = (maxActions, maxElapsedMs) => ({
  maxActions,
  maxElapsedMs,
  maxFailures: 0,
  requireRecoveryAnchor: true,
  requireIdentityInvariant: true,
});

export const sampleUxScenarios = [
  {
    id: "taktune-next-task-decision",
    product: "Taktune",
    description: "Today初期表示だけで次に行うタスクを判断する",
    fixture: {
      files: [{ path: "Tasks/Today.md", content: "# Today\n- [ ] 設計レビュー" }],
      activeFile: "Tasks/Today.md",
      primaryTaskId: "Tasks/Today.md#設計レビュー",
    },
    thresholds: strictThresholds(0, 0),
    setup: (fixture) => createVirtualObsidian(fixture),
    run({ assertIdentity, markRecoveryAnchor }, fixture) {
      assertIdentity("primary task", fixture.primaryTaskId, "Tasks/Today.md#設計レビュー");
      markRecoveryAnchor(`task:${fixture.primaryTaskId}`);
    },
  },
  {
    id: "taktune-task-add",
    product: "Taktune",
    description: "Quick Addの入力から保存までを2操作以内で完了する",
    fixture: {
      files: [{ path: "Tasks/Inbox.md", content: "# Inbox\n" }],
      activeFile: "Tasks/Inbox.md",
      taskId: "Tasks/Inbox.md#UX計測を導入する",
      task: "UX計測を導入する",
    },
    thresholds: strictThresholds(2, 400),
    setup: (fixture) => createVirtualObsidian(fixture),
    async run({ action, assertIdentity, markRecoveryAnchor, runtime }, fixture) {
      const inbox = runtime.app.vault.getAbstractFileByPath("Tasks/Inbox.md");
      await action("enter task", { durationMs: 110, target: "quick-add-input" });
      await action("save task", { durationMs: 170, target: "quick-add-submit" }, async () => {
        await runtime.app.vault.modify(inbox, `# Inbox\n- [ ] ${fixture.task}\n`);
      });
      assertIdentity("created task", fixture.taskId, `Tasks/Inbox.md#${fixture.task}`);
      markRecoveryAnchor(`task:${fixture.taskId}`);
    },
  },
  {
    id: "taktune-detail-return",
    product: "Taktune",
    description: "詳細編集後に元のToday行へ3操作以内で復帰する",
    fixture: {
      files: [{ path: "Tasks/Today.md", content: "# Today\n- [ ] 設計レビュー" }],
      activeFile: "Tasks/Today.md",
      taskId: "Tasks/Today.md#設計レビュー",
      scrollAnchor: "today-row-4",
    },
    thresholds: strictThresholds(3, 500),
    setup: (fixture) => createVirtualObsidian(fixture),
    async run({ action, assertIdentity, markRecoveryAnchor }, fixture) {
      await action("open detail", { durationMs: 100, target: fixture.taskId });
      await action("edit detail", { durationMs: 160, target: "task-detail" });
      await action("return to Today", { durationMs: 90, target: "detail-close" });
      assertIdentity("returned task", fixture.taskId, "Tasks/Today.md#設計レビュー");
      markRecoveryAnchor(fixture.scrollAnchor);
    },
  },
  {
    id: "sonora-continue-playback",
    product: "Sonora",
    description: "Libraryから1操作で同じEpisodeの続きへ戻る",
    fixture: {
      files: [{ path: "Podcasts/Design Details.md", content: "# Design Details" }],
      activeFile: "Podcasts/Design Details.md",
      episodeId: "design-details-2026-10",
      resumeMs: 842_000,
    },
    thresholds: strictThresholds(1, 200),
    setup: (fixture) => createVirtualObsidian(fixture),
    async run({ action, assertIdentity, markRecoveryAnchor }, fixture) {
      await action("continue playback", { durationMs: 130, target: "continue-card" });
      assertIdentity("resumed episode", fixture.episodeId, "design-details-2026-10");
      markRecoveryAnchor(`episode:${fixture.episodeId}@${fixture.resumeMs}`);
    },
  },
  {
    id: "sonora-playback-context",
    product: "Sonora",
    description: "追加操作なしでNote、現Chapter、次Chapterを識別する",
    fixture: {
      files: [{ path: "Podcasts/Design Details.md", content: "# Design Details" }],
      activeFile: "Podcasts/Design Details.md",
      episodeId: "design-details-2026-10",
      currentChapterId: "chapter-4",
      nextChapterId: "chapter-5",
    },
    thresholds: strictThresholds(0, 0),
    setup: (fixture) => createVirtualObsidian(fixture),
    run({ assertIdentity, markRecoveryAnchor }, fixture) {
      assertIdentity("visible episode", fixture.episodeId, "design-details-2026-10");
      assertIdentity("current chapter", fixture.currentChapterId, "chapter-4");
      assertIdentity("next chapter", fixture.nextChapterId, "chapter-5");
      markRecoveryAnchor(`chapter:${fixture.currentChapterId}`);
    },
  },
  {
    id: "sonora-queue-reorder",
    product: "Sonora",
    description: "Queueを2操作以内で並べ替え、Episode identityを維持する",
    fixture: {
      files: [{ path: "Podcasts/Queue.md", content: "# Queue" }],
      queue: ["episode-a", "episode-b", "episode-c"],
      movedEpisodeId: "episode-c",
    },
    thresholds: strictThresholds(2, 350),
    setup: (fixture) => ({ runtime: createVirtualObsidian(fixture), queue: [...fixture.queue] }),
    async run({ action, assertIdentity, markRecoveryAnchor, runtime }, fixture) {
      await action("pick queue item", { durationMs: 90, target: fixture.movedEpisodeId });
      await action("place queue item", { durationMs: 130, target: "queue-position-1" }, () => {
        runtime.queue = [
          fixture.movedEpisodeId,
          ...runtime.queue.filter((id) => id !== fixture.movedEpisodeId),
        ];
      });
      assertIdentity("moved episode", fixture.movedEpisodeId, runtime.queue[0]);
      markRecoveryAnchor(`queue:${fixture.movedEpisodeId}`);
    },
  },
  {
    id: "graphune-selection-context",
    product: "Graphune",
    description: "Card選択直後に所在と主要操作を確認する",
    fixture: {
      files: [{ path: "Notes/Spatial thinking.md", content: "# Spatial thinking" }],
      canvases: [
        {
          path: "Research.canvas",
          nodes: [cardNode("card-spatial", "Notes/Spatial thinking.md")],
          selectedNodeIds: ["card-spatial"],
        },
      ],
      activeCanvas: "Research.canvas",
      cardPath: "Notes/Spatial thinking.md",
    },
    thresholds: strictThresholds(0, 0),
    setup: (fixture) => createVirtualObsidian(fixture),
    run({ assertIdentity, markRecoveryAnchor, runtime }, fixture) {
      const [selected] = runtime.app.workspace.getLeavesOfType("canvas")[0].view.canvas.selection;
      assertIdentity("selected card", fixture.cardPath, selected.file.path);
      markRecoveryAnchor(`canvas:Research.canvas#${selected.id}`);
    },
  },
  {
    id: "graphune-sectionize-card",
    product: "Graphune",
    description: "選択済みCardを1操作でSection化する",
    fixture: {
      files: [{ path: "Notes/Spatial thinking.md", content: "# Spatial thinking" }],
      canvases: [
        {
          path: "Research.canvas",
          nodes: [cardNode("card-spatial", "Notes/Spatial thinking.md")],
          selectedNodeIds: ["card-spatial"],
        },
      ],
      activeCanvas: "Research.canvas",
      cardPath: "Notes/Spatial thinking.md",
    },
    thresholds: strictThresholds(1, 250),
    setup: (fixture) => createVirtualObsidian(fixture),
    async run({ action, assertIdentity, markRecoveryAnchor, runtime }, fixture) {
      const canvas = runtime.app.workspace.getLeavesOfType("canvas")[0].view.canvas;
      await action("create section", { durationMs: 180, target: "selection-toolbar" }, () => {
        const data = canvas.getData();
        canvas.setData({
          nodes: [
            ...data.nodes,
            {
              id: "section-spatial",
              type: "group",
              label: "Spatial thinking",
              x: -24,
              y: -48,
              width: 368,
              height: 252,
            },
          ],
          edges: data.edges,
        });
      });
      const card = canvas.getData().nodes.find((node) => node.id === "card-spatial");
      assertIdentity("sectioned card", fixture.cardPath, card.file);
      markRecoveryAnchor("canvas:Research.canvas#card-spatial");
    },
  },
  {
    id: "graphune-other-canvas-card",
    product: "Graphune",
    description: "2操作以内で他Canvasの同一Cardへ移動する",
    fixture: {
      files: [{ path: "Notes/Spatial thinking.md", content: "# Spatial thinking" }],
      canvases: [
        {
          path: "Research.canvas",
          nodes: [cardNode("research-spatial", "Notes/Spatial thinking.md")],
          selectedNodeIds: ["research-spatial"],
        },
        {
          path: "Writing.canvas",
          nodes: [cardNode("writing-spatial", "Notes/Spatial thinking.md")],
          selectedNodeIds: ["writing-spatial"],
        },
      ],
      activeCanvas: "Research.canvas",
      cardPath: "Notes/Spatial thinking.md",
    },
    thresholds: strictThresholds(2, 350),
    setup: (fixture) => createVirtualObsidian(fixture),
    async run({ action, assertIdentity, markRecoveryAnchor, runtime }, fixture) {
      await action("choose other canvas", { durationMs: 100, target: "Writing.canvas" });
      await action("open same card", { durationMs: 140, target: "writing-spatial" }, () => {
        runtime.setActiveCanvas("Writing.canvas");
      });
      const [selected] = runtime.app.workspace.getLeavesOfType("canvas")[0].view.canvas.selection;
      assertIdentity("same note path", fixture.cardPath, selected.file.path);
      markRecoveryAnchor("canvas:Writing.canvas#writing-spatial");
    },
  },
];

function cardNode(id, file) {
  return { id, type: "file", file, x: 0, y: 0, width: 320, height: 180 };
}
