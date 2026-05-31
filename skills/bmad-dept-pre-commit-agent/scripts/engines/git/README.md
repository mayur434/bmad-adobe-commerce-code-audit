# Git Engine

Platform: **Git staged diff**
Status: ✅ Implemented

## What It Does

Reads `git diff --cached` (or a provided `.diff` file), splits the output by file, detects the language of each file, and submits each chunk to the Claude API for a security review.

## Entry Point

`audit.ts` — exports `run(args: string[])`

Called by `scripts/run.ts` after engine resolution.

## Language Detection

Language is detected in `audit.ts` from `FILENAME_MAP` (exact basename) and `EXTENSION_MAP` (file extension). These maps mirror `resources/language-map.md` — if you add a new language there, update both.

## Adding a New Engine

See `scripts/engines/registry.ts` — add your engine ID and import there. Then create `scripts/engines/<platform>/audit.ts` exporting `run(args)`.
