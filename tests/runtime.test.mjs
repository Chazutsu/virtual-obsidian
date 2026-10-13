import assert from "node:assert/strict";
import test from "node:test";
import { createVirtualObsidian } from "../src/index.mjs";

function createRuntime() {
  return createVirtualObsidian({
    files: [
      {
        path: "Clippings/Spatial notes.md",
        content: "# Spatial notes\n\nEvidence",
        frontmatter: { source: "https://example.com" },
        tags: ["clipping"],
      },
    ],
    canvases: [
      {
        path: "Research.canvas",
        nodes: [
          {
            id: "source",
            type: "file",
            file: "Clippings/Spatial notes.md",
            x: 0,
            y: 0,
            width: 320,
            height: 180,
          },
        ],
        selectedNodeIds: ["source"],
      },
    ],
    activeFile: "Clippings/Spatial notes.md",
    activeCanvas: "Research.canvas",
  });
}

test("exposes a stateful vault and metadata cache", async () => {
  const runtime = createRuntime();
  const [file] = runtime.app.vault.getMarkdownFiles();
  assert.equal(await runtime.app.vault.read(file), "# Spatial notes\n\nEvidence");
  assert.deepEqual(runtime.app.metadataCache.getFileCache(file).tags, [{ tag: "#clipping" }]);

  await runtime.app.vault.modify(file, "Changed");
  assert.equal(runtime.snapshot().files[0].content, "Changed");
});

test("emits vault changes and supports unsubscribing", async () => {
  const runtime = createRuntime();
  const modified = [];
  const metadataChanges = [];
  const ref = runtime.app.vault.on("modify", (file) => modified.push(file.path));
  runtime.app.metadataCache.on("changed", (file) => metadataChanges.push(file.path));
  const [file] = runtime.app.vault.getMarkdownFiles();
  await runtime.app.vault.modify(file, "First");
  runtime.app.vault.offref(ref);
  await runtime.app.vault.modify(file, "Second");
  assert.deepEqual(modified, ["Clippings/Spatial notes.md"]);
  assert.deepEqual(metadataChanges, ["Clippings/Spatial notes.md", "Clippings/Spatial notes.md"]);
});

test("preserves TFile identity across a rename", async () => {
  const runtime = createRuntime();
  const [file] = runtime.app.vault.getMarkdownFiles();
  await runtime.app.fileManager.renameFile(file, "Sources/Spatial notes.md");
  assert.equal(file.path, "Sources/Spatial notes.md");
  assert.equal(runtime.app.vault.getAbstractFileByPath("Sources/Spatial notes.md"), file);
  assert.equal(runtime.app.vault.getAbstractFileByPath("Clippings/Spatial notes.md"), null);
});

test("models the active Canvas and its selection", () => {
  const runtime = createRuntime();
  const [leaf] = runtime.app.workspace.getLeavesOfType("canvas");
  assert.equal(leaf.view.file.path, "Research.canvas");
  assert.equal(
    runtime.app.vault.getFiles().some((file) => file.path === "Research.canvas"),
    true,
  );
  assert.equal(leaf.view.canvas.selection.size, 1);
  assert.equal([...leaf.view.canvas.selection][0].file.path, "Clippings/Spatial notes.md");
  leaf.view.canvas.setData({ nodes: [], edges: [] });
  assert.equal(
    JSON.parse(runtime.snapshot().files.find((file) => file.path === "Research.canvas").content)
      .nodes.length,
    0,
  );
});

test("keeps the active Canvas reachable after renaming its file", async () => {
  const runtime = createRuntime();
  const [leaf] = runtime.app.workspace.getLeavesOfType("canvas");
  await runtime.app.fileManager.renameFile(leaf.view.file, "Maps/Research.canvas");
  assert.equal(runtime.snapshot().activeCanvas, "Maps/Research.canvas");
  assert.equal(runtime.app.workspace.getLeavesOfType("canvas")[0], leaf);
  await runtime.app.vault.delete(leaf.view.file);
  assert.equal(runtime.snapshot().activeCanvas, null);
  assert.deepEqual(runtime.app.workspace.getLeavesOfType("canvas"), []);
});

test("switches desktop, mobile, file, and Canvas scenarios without rebuilding the app", () => {
  const runtime = createRuntime();
  runtime.setMobile(true);
  runtime.setActiveFile(null);
  runtime.setActiveCanvas(null);
  assert.deepEqual(runtime.snapshot(), {
    files: [
      { path: "Clippings/Spatial notes.md", content: "# Spatial notes\n\nEvidence" },
      {
        path: "Research.canvas",
        content:
          '{"nodes":[{"id":"source","type":"file","file":"Clippings/Spatial notes.md","x":0,"y":0,"width":320,"height":180}],"edges":[]}',
      },
    ],
    activeFile: null,
    activeCanvas: null,
    mobile: true,
  });
});

test("matches the Rust path boundary when the JavaScript fallback is active", async () => {
  assert.throws(
    () => createVirtualObsidian({ files: [{ path: "../outside.md", content: "" }] }),
    /Invalid vault path/u,
  );
  const runtime = createVirtualObsidian();
  await assert.rejects(
    runtime.app.vault.create("folder/../../outside.md", ""),
    /Invalid vault path/u,
  );
});
