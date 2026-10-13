export * from "./ux-measurement.js";

export interface VirtualPosition {
  line: number;
  col: number;
  offset: number;
}

export interface VirtualHeading {
  heading: string;
  level: number;
  position: { start: VirtualPosition; end: VirtualPosition };
}

export interface VirtualFileInput {
  path: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  headings?: VirtualHeading[];
  ctime?: number;
  mtime?: number;
}

export interface VirtualCanvasNode {
  id: string;
  type: "file" | "text" | "link" | "group";
  file?: string;
  text?: string;
  url?: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VirtualCanvasInput {
  path: string;
  nodes?: VirtualCanvasNode[];
  edges?: Record<string, unknown>[];
  selectedNodeIds?: string[];
}

export interface VirtualObsidianOptions {
  files?: VirtualFileInput[];
  canvases?: VirtualCanvasInput[];
  activeFile?: string | null;
  activeCanvas?: string | null;
  mobile?: boolean;
}

export class VirtualFolder {
  constructor(path?: string);
  path: string;
  name: string;
  children: Array<VirtualFile | VirtualFolder>;
}

export class VirtualFile {
  constructor(path: string, timestamps?: { ctime?: number; mtime?: number }, size?: number);
  path: string;
  name: string;
  basename: string;
  extension: string;
  parent: VirtualFolder | null;
  stat: { ctime: number; mtime: number; size: number };
}

export interface VirtualObsidianRuntime {
  engine: "rust" | "js";
  app: {
    vault: VirtualVault;
    workspace: VirtualWorkspace;
    metadataCache: VirtualMetadataCache;
    fileManager: VirtualFileManager;
  };
  setActiveFile(path: string | null): void;
  setActiveCanvas(path: string | null): void;
  setMobile(mobile: boolean): void;
  isMobile(): boolean;
  snapshot(): {
    files: Array<{ path: string; content: string }>;
    activeFile: string | null;
    activeCanvas: string | null;
    mobile: boolean;
  };
}

export class VirtualVault {
  getMarkdownFiles(): VirtualFile[];
  getFiles(): VirtualFile[];
  read(file: VirtualFile): Promise<string>;
  cachedRead(file: VirtualFile): Promise<string>;
  create(path: string, content: string): Promise<VirtualFile>;
  modify(file: VirtualFile, content: string): Promise<void>;
  delete(file: VirtualFile): Promise<void>;
  createFolder(path: string): Promise<void>;
  getAbstractFileByPath(path: string): VirtualFile | VirtualFolder | null;
  on(event: string, callback: (...args: unknown[]) => void): { id: string };
  offref(ref: { id: string }): void;
  adapter: { exists(path: string): Promise<boolean> };
}

export class VirtualWorkspace {
  getActiveViewOfType(type: unknown): { file: VirtualFile | null } | null;
  getLeavesOfType(type: string): unknown[];
  getMostRecentLeaf(): unknown | null;
  getLeaf(createNew: boolean): { openFile(file?: VirtualFile): Promise<void> };
  on(event: string, callback: (...args: unknown[]) => void): { id: string };
  offref(ref: { id: string }): void;
  trigger(event: string, ...args: unknown[]): void;
}

export class VirtualMetadataCache {
  resolvedLinks: Record<string, Record<string, number>>;
  getFileCache(file: VirtualFile): Record<string, unknown> | null;
  on(event: string, callback: (...args: unknown[]) => void): { id: string };
  offref(ref: { id: string }): void;
}

export class VirtualFileManager {
  renameFile(file: VirtualFile, path: string): Promise<void>;
  processFrontMatter(
    file: VirtualFile,
    callback: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void>;
}

export function createVirtualObsidian(options?: VirtualObsidianOptions): VirtualObsidianRuntime;
export function initializeVirtualObsidian(wasmUrl?: string | URL): Promise<void>;
