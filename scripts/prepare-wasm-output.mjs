import { rmSync } from "node:fs";

rmSync(new URL("../wasm-pkg/.gitignore", import.meta.url), { force: true });
