# Contributing to Statelint

Thanks for helping make stateless MCP servers easier to get right. Bug reports, false positives, new rules and new codemods are all welcome.

## Run it locally

```bash
git clone https://github.com/NHTanvir/statelint.git
cd statelint
npm ci
npm test          # builds dist/ and the tests, then runs every test (Node 18 or later)
node dist/cli.js demo
```

There are no runtime dependencies, and the dev dependencies are only TypeScript and Node's types. Please keep it that way.

## Reporting a false positive or a wrong verdict

Open an issue with:

1. the command you ran (`statelint check <url>` or `statelint migrate <path>`),
2. the rule id that is wrong (`name-header-match`, `transport-entry`, …),
3. for `check`: the JSON report (`--json`), which lists every request Statelint sent and what came back. Remove any tokens first.
4. for `migrate`: the smallest piece of code that reproduces it,
5. the line of the [2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28) that you think the verdict contradicts.

Statelint follows the specification text, not any one SDK. If the spec and an SDK disagree, the spec wins and the rule cites the section.

## Adding a conformance rule

A new rule needs four things, in the same pull request:

1. **The requirement.** Quote the MUST or SHOULD sentence and link its section. MUST rules fail; SHOULD rules warn.
2. **A probe** in `src/check/probes.ts`, if the existing probes cannot show it. Probes must stay safe: discovery and list methods, or invalid requests that name `statelint_probe_*` tools and `statelint://probe/*` resources. Never call a real tool or read a real resource.
3. **The rule** in `src/check/rules.ts`: an id, a title, the `how` sentence, the spec link, the SEP and the official conformance check id if there is one, and a `fix` that tells the reader exactly what to change.
4. **A fault** in `src/fixtures/faults.ts` and `src/fixtures/reference-server.ts` that breaks this rule and nothing else. `test/check.test.ts` checks that every fault breaks exactly its own rule, and that every rule has a fault.

Then regenerate the rules reference: `npm run build && node scripts/rules-doc.mjs`.

## Adding a migration rule or a codemod

Migration findings live in `src/migrate/rules.ts`; codemods in `src/migrate/codemods.ts`. A codemod must prove its preconditions on the token stream and refuse, with a reason a user can act on, whenever it cannot. Add tests for the rewrite and for each refusal in `test/migrate.test.ts`.

## Before you open a pull request

- `npm test` passes, and `node dist/cli.js demo` ends with "Demo OK".
- `dist/` is rebuilt and committed (`npm run build`): the GitHub Action and `npx github:NHTanvir/statelint` run the committed build. CI fails when it is stale.
- Docs mention any new flag or rule.

By contributing you agree that your contribution is licensed under the MIT license.
