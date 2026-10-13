/* tslint:disable */
/* eslint-disable */

export class VirtualObsidianCore {
    free(): void;
    [Symbol.dispose](): void;
    create_file(path: string, content: string, timestamp: number): void;
    delete_file(path: string): void;
    modify_file(path: string, content: string, timestamp: number): void;
    constructor(config_json: string);
    rename_file(old_path: string, new_path: string): void;
    set_active_canvas(path?: string | null): void;
    set_active_file(path?: string | null): void;
    set_canvas_data(path: string, data_json: string): void;
    set_frontmatter_json(path: string, frontmatter_json: string): void;
    set_mobile(mobile: boolean): void;
    snapshot_json(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_virtualobsidiancore_free: (a: number, b: number) => void;
    readonly virtualobsidiancore_create_file: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly virtualobsidiancore_delete_file: (a: number, b: number, c: number, d: number) => void;
    readonly virtualobsidiancore_modify_file: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly virtualobsidiancore_new: (a: number, b: number, c: number) => void;
    readonly virtualobsidiancore_rename_file: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly virtualobsidiancore_set_active_canvas: (a: number, b: number, c: number, d: number) => void;
    readonly virtualobsidiancore_set_active_file: (a: number, b: number, c: number, d: number) => void;
    readonly virtualobsidiancore_set_canvas_data: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly virtualobsidiancore_set_frontmatter_json: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly virtualobsidiancore_set_mobile: (a: number, b: number) => void;
    readonly virtualobsidiancore_snapshot_json: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
