import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const destination = mkdtempSync(path.join(tmpdir(), "virtual-obsidian-pack-"));

try {
	const output = execFileSync("npm", ["pack", "--json", "--pack-destination", destination], {
		encoding: "utf8",
	});
	const [packed] = JSON.parse(output);
	const files = new Map(packed.files.map((file) => [file.path, file.size]));
	for (const required of [
		"LICENSE",
		"README.md",
		"package.json",
		"src/index.d.ts",
		"src/index.mjs",
		"wasm-pkg/core.js",
		"wasm-pkg/core_bg.wasm",
	]) {
		assert.ok(files.has(required), `Package is missing ${required}`);
		assert.ok(files.get(required) > 0, `Package contains an empty ${required}`);
	}
	assert.equal(
		[...files.keys()].some((file) => file.startsWith("tests/") || file.startsWith("target/")),
		false,
		"Package contains test or Rust build output",
	);
} finally {
	rmSync(destination, { recursive: true, force: true });
}
