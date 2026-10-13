const VIEW_TYPE_CANVAS = "canvas";
let CoreConstructor = null;
let coreInitialization = null;

export {
  ActionRecorder,
  DeterministicClock,
  UxThresholdError,
  formatUxReportJson,
  formatUxReportMarkdown,
  runUxScenario,
  runUxScenarios,
} from "./ux-measurement.js";

export async function initializeVirtualObsidian(wasmUrl) {
  if (CoreConstructor) return;
  coreInitialization ??= import("../wasm-pkg/core.js").then(async (module) => {
    await module.default(wasmUrl);
    CoreConstructor = module.VirtualObsidianCore;
  });
  await coreInitialization;
}

class EventBus {
  #listeners = new Map();
  #sequence = 0;

  on(event, callback) {
    const id = `${event}:${++this.#sequence}`;
    this.#listeners.set(id, { event, callback });
    return { id };
  }

  offref(ref) {
    this.#listeners.delete(ref.id);
  }

  emit(event, ...args) {
    for (const listener of this.#listeners.values()) {
      if (listener.event === event) listener.callback(...args);
    }
  }
}

export class VirtualFolder {
  constructor(path = "") {
    this.path = normalizePath(path);
    this.name = this.path.split("/").pop() ?? "";
    this.children = [];
  }
}

export class VirtualFile {
  constructor(path, timestamps = {}, size = 0) {
    this.path = normalizePath(path);
    this.name = this.path.split("/").pop() ?? this.path;
    this.basename = this.name.replace(/\.[^.]+$/, "");
    this.extension = this.name.includes(".") ? (this.name.split(".").pop() ?? "") : "";
    const parentPath = this.path.includes("/")
      ? this.path.slice(0, this.path.lastIndexOf("/"))
      : "";
    this.parent = parentPath ? new VirtualFolder(parentPath) : null;
    const now = Date.now();
    this.stat = {
      ctime: timestamps.ctime ?? now,
      mtime: timestamps.mtime ?? timestamps.ctime ?? now,
      size,
    };
  }
}

export class VirtualVault {
  constructor(state, events, metadataEvents) {
    this.state = state;
    this.events = events;
    this.metadataEvents = metadataEvents;
    this.adapter = { exists: async (path) => this.#exists(path) };
  }

  getMarkdownFiles() {
    return this.getFiles().filter((file) => file.extension === "md");
  }

  getFiles() {
    return [...this.state.files.values()].map((entry) => entry.file);
  }

  async read(file) {
    return this.state.files.get(file.path)?.content ?? "";
  }

  async cachedRead(file) {
    return this.read(file);
  }

  async create(path, content) {
    const normalized = normalizePath(path);
    if (this.state.files.has(normalized)) throw new Error(`File already exists: ${normalized}`);
    const now = Date.now();
    this.state.core?.create_file(normalized, content, now);
    const file = new VirtualFile(normalized, { ctime: now, mtime: now }, content.length);
    this.state.files.set(normalized, { file, content, metadata: {} });
    this.events.emit("create", file);
    this.metadataEvents.emit("changed", file, content, {});
    return file;
  }

  async modify(file, content) {
    const entry = this.state.files.get(file.path);
    if (!entry) throw new Error(`File not found: ${file.path}`);
    const now = Date.now();
    this.state.core?.modify_file(file.path, content, now);
    entry.content = content;
    file.stat.mtime = now;
    file.stat.size = content.length;
    this.events.emit("modify", file);
    this.metadataEvents.emit("changed", file, content, entry.metadata);
  }

  async delete(file) {
    if (!this.state.files.has(file.path)) return;
    this.state.core?.delete_file(file.path);
    this.state.files.delete(file.path);
    this.state.canvases.delete(file.path);
    if (this.state.activeFile === file.path) this.state.activeFile = null;
    if (this.state.activeCanvas === file.path) this.state.activeCanvas = null;
    this.events.emit("delete", file);
    this.metadataEvents.emit("deleted", file, null);
  }

  async createFolder(path) {
    this.state.folders.add(normalizePath(path));
  }

  getAbstractFileByPath(path) {
    const normalized = normalizePath(path);
    return (
      this.state.files.get(normalized)?.file ??
      (this.state.folders.has(normalized) ? new VirtualFolder(normalized) : null)
    );
  }

  on(event, callback) {
    return this.events.on(event, callback);
  }

  offref(ref) {
    this.events.offref(ref);
  }

  #exists(path) {
    const normalized = normalizePath(path);
    return this.state.files.has(normalized) || this.state.folders.has(normalized);
  }
}

export class VirtualMetadataCache {
  constructor(state, events) {
    this.state = state;
    this.events = events;
    this.resolvedLinks = {};
  }

  getFileCache(file) {
    const metadata = this.state.files.get(file.path)?.metadata;
    if (!metadata) return null;
    return {
      frontmatter: { ...metadata.frontmatter },
      tags: (metadata.tags ?? []).map((tag) => ({ tag: tag.startsWith("#") ? tag : `#${tag}` })),
      headings: [...(metadata.headings ?? [])],
    };
  }

  on(event, callback) {
    return this.events.on(event, callback);
  }

  offref(ref) {
    this.events.offref(ref);
  }
}

export class VirtualWorkspace {
  constructor(state, events) {
    this.state = state;
    this.events = events;
  }

  getActiveViewOfType() {
    return {
      file: this.state.activeFile
        ? (this.state.files.get(this.state.activeFile)?.file ?? null)
        : null,
    };
  }

  getLeavesOfType(type) {
    if (type !== VIEW_TYPE_CANVAS || !this.state.activeCanvas) return [];
    const canvas = this.state.canvases.get(this.state.activeCanvas);
    return canvas ? [canvas.leaf] : [];
  }

  getMostRecentLeaf() {
    return this.getLeavesOfType(VIEW_TYPE_CANVAS)[0] ?? null;
  }

  getLeaf() {
    return {
      openFile: async (file) => {
        this.state.core?.set_active_file(file?.path ?? undefined);
        this.state.activeFile = file?.path ?? null;
        this.events.emit("file-open", file ?? null);
      },
    };
  }

  on(event, callback) {
    return this.events.on(event, callback);
  }

  offref(ref) {
    this.events.offref(ref);
  }

  trigger(event, ...args) {
    this.events.emit(event, ...args);
  }
}

export class VirtualFileManager {
  constructor(state, events) {
    this.state = state;
    this.events = events;
  }

  async renameFile(file, path) {
    const entry = this.state.files.get(file.path);
    if (!entry) throw new Error(`File not found: ${file.path}`);
    const oldPath = file.path;
    this.state.core?.rename_file(oldPath, normalizePath(path));
    this.state.files.delete(oldPath);
    const renamed = new VirtualFile(path, file.stat, file.stat.size);
    Object.assign(file, renamed);
    entry.file = file;
    this.state.files.set(file.path, entry);
    const canvas = this.state.canvases.get(oldPath);
    if (canvas) {
      this.state.canvases.delete(oldPath);
      this.state.canvases.set(file.path, canvas);
    }
    if (this.state.activeFile === oldPath) this.state.activeFile = file.path;
    if (this.state.activeCanvas === oldPath) this.state.activeCanvas = file.path;
    this.events.emit("rename", file, oldPath);
  }

  async processFrontMatter(file, callback) {
    const entry = this.state.files.get(file.path);
    if (!entry) throw new Error(`File not found: ${file.path}`);
    const frontmatter = { ...entry.metadata.frontmatter };
    callback(frontmatter);
    this.state.core?.set_frontmatter_json(file.path, JSON.stringify(frontmatter));
    entry.metadata.frontmatter = frontmatter;
    this.events.emit("changed", file, "frontmatter");
  }
}

export function createVirtualObsidian(options = {}) {
  const state = createState(options);
  const vaultEvents = new EventBus();
  const workspaceEvents = new EventBus();
  const metadataEvents = new EventBus();
  const app = {
    vault: new VirtualVault(state, vaultEvents, metadataEvents),
    workspace: new VirtualWorkspace(state, workspaceEvents),
    metadataCache: new VirtualMetadataCache(state, metadataEvents),
    fileManager: new VirtualFileManager(state, metadataEvents),
  };

  return {
    app,
    engine: state.core ? "rust" : "js",
    setActiveFile(path) {
      state.core?.set_active_file(path ?? undefined);
      state.activeFile = path;
      workspaceEvents.emit("file-open", path ? (state.files.get(path)?.file ?? null) : null);
    },
    setActiveCanvas(path) {
      state.core?.set_active_canvas(path ?? undefined);
      state.activeCanvas = path;
      workspaceEvents.emit("active-leaf-change", app.workspace.getMostRecentLeaf());
    },
    setMobile(mobile) {
      state.core?.set_mobile(mobile);
      state.mobile = mobile;
      workspaceEvents.emit("layout-change");
    },
    isMobile: () => state.mobile,
    snapshot: () => snapshotState(state),
  };
}

function snapshotState(state) {
  if (state.core) {
    const snapshot = JSON.parse(state.core.snapshot_json());
    return {
      files: Object.values(snapshot.files).map(({ path, content }) => ({ path, content })),
      activeFile: snapshot.activeFile,
      activeCanvas: snapshot.activeCanvas,
      mobile: snapshot.mobile,
    };
  }
  return {
    files: [...state.files.values()].map(({ file, content }) => ({ path: file.path, content })),
    activeFile: state.activeFile,
    activeCanvas: state.activeCanvas,
    mobile: state.mobile,
  };
}

function createState(options) {
  const core = CoreConstructor ? new CoreConstructor(JSON.stringify(toCoreConfig(options))) : null;
  const files = new Map();
  const folders = new Set();
  for (const input of options.files ?? []) addInputFile(files, folders, input);
  const canvases = new Map();
  for (const input of options.canvases ?? []) {
    const data = { nodes: [...(input.nodes ?? [])], edges: [...(input.edges ?? [])] };
    const canvasPath = normalizePath(input.path);
    addInputFile(files, folders, { path: canvasPath, content: JSON.stringify(data) });
    const fileEntry = files.get(canvasPath);
    const file = fileEntry.file;
    const selection = new Set(
      data.nodes
        .filter((node) => input.selectedNodeIds?.includes(node.id))
        .map((node) => ({ ...node, file: node.file ? files.get(node.file)?.file : undefined })),
    );
    const canvas = {
      getData: () => structuredClone(data),
      setData: (next) => {
        data.nodes = structuredClone(next.nodes ?? []);
        data.edges = structuredClone(next.edges ?? []);
        fileEntry.content = JSON.stringify(data);
        core?.set_canvas_data(canvasPath, fileEntry.content);
        file.stat.mtime = Date.now();
        file.stat.size = fileEntry.content.length;
      },
      requestSave() {},
      selection,
      tx: 0,
      ty: 0,
      tZoom: 1,
    };
    const leaf = { view: { file, canvas } };
    canvases.set(canvasPath, { file, canvas, leaf });
  }
  return {
    files,
    folders,
    canvases,
    activeFile: options.activeFile ?? null,
    activeCanvas: options.activeCanvas ?? null,
    mobile: options.mobile ?? false,
    core,
  };
}

function toCoreConfig(options) {
  const files = {};
  for (const input of options.files ?? []) {
    const path = normalizePath(input.path);
    files[path] = {
      path,
      content: input.content ?? "",
      frontmatter: input.frontmatter ?? {},
      tags: input.tags ?? [],
      headings: input.headings ?? [],
      ctime: input.ctime ?? 0,
      mtime: input.mtime ?? input.ctime ?? 0,
    };
  }
  const canvases = {};
  for (const input of options.canvases ?? []) {
    const path = normalizePath(input.path);
    const data = { nodes: input.nodes ?? [], edges: input.edges ?? [] };
    canvases[path] = {
      path,
      ...data,
      selectedNodeIds: input.selectedNodeIds ?? [],
    };
    files[path] = { path, content: JSON.stringify(data) };
  }
  return {
    files,
    canvases,
    activeFile: options.activeFile ?? null,
    activeCanvas: options.activeCanvas ?? null,
    mobile: options.mobile ?? false,
  };
}

function addInputFile(files, folders, input) {
  const content = input.content ?? "";
  const file = new VirtualFile(
    input.path,
    { ctime: input.ctime, mtime: input.mtime },
    content.length,
  );
  files.set(file.path, {
    file,
    content,
    metadata: {
      frontmatter: { ...input.frontmatter },
      tags: [...(input.tags ?? [])],
      headings: [...(input.headings ?? [])],
    },
  });
  if (file.parent) folders.add(file.parent.path);
}

function normalizePath(path) {
  const normalized = path
    .replaceAll(/\\/g, "/")
    .replaceAll(/\/{2,}/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .join("/");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error(`Invalid vault path: ${path}`);
  }
  return normalized;
}
