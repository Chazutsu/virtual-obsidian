# Contributing

Install Node.js 24, pnpm 10.7.0, Rust, and `wasm-pack`, then run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm format:check
pnpm typecheck
```

Keep the Rust/Wasm engine and JavaScript fallback behavior aligned. Add a regression test for every
observable runtime change. By contributing, you agree that your contribution is licensed under the
MIT License.
