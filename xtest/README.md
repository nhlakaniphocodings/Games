# xtest — headless game harness

No test framework is installed, so these are plain Node scripts that load the
real game modules and drive them without a browser.

- `loader.mjs` — ESM resolve hook that maps the `@/` alias and extensionless TS
  imports so Node can run the TypeScript modules directly.
- `smoke.mjs` — instantiates every registered game, loads all 10 levels, runs
  200 frames of `update()` + `render()` with simulated input, and fails if
  anything throws. Also asserts each module exposes `create`, `view` and >= 10 levels.
- `controller.mjs` — drives the real `GameController` through the same lifecycle
  the browser uses: frames rendered during `intro` (before any level is loaded),
  then `begin()`, play, pause/resume/restart, level select across every level,
  and pointer input. It stubs DOM/WebAudio/localStorage. This is what catches
  "game rendered before `load()`" bugs that `smoke.mjs` cannot see.
- `solve.mjs` — drives each level with a set of simple deterministic policies to
  confirm the win/`complete()` path is reachable. It is a plumbing check, not a
  proof of solvability: hard levels are expected to need human play.
- `difficulty.mjs` — the difficulty audit. Runs "dumb player" policies (hold
  right, rhythmic jump spam, mashing) against every level, reports which levels
  are trivially clearable, and fails if a game's **level 1 is beaten by
  hold-right**. Also checks that a fresh `load()` reproduces an identical event
  trace (deaths must be learnable, not random).
- `search.mjs` — randomised macro-action search used to *find* a winning route
  for each X Devil level (evidence the level is solvable, not just hard). Prints
  which levels a route was found for. `ONLY_LEVEL=<n> LEFT_BIAS=<0..1>
  SHOW_TRACE=1` tune it.

Run from the repo root:

```bash
npm run test:smoke
npm run test:controller
npm run test:solve
npm run test:difficulty
npm run test:search
```

They rely on Node's built-in TypeScript type stripping (Node >= 23.6).
