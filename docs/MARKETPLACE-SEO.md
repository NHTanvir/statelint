# GitHub Marketplace listing: SEO and GEO research

Research for publishing Statelint's GitHub Action, done on **2026-11-18**. Every listing field below is chosen from these findings. The wider keyword research (autocomplete demand, ranking articles, GitHub repositories) is in [RESEARCH.md](RESEARCH.md#keyword-and-landscape-research-seo-and-aeo).

## How the Marketplace finds and shows an Action

| Finding | Evidence |
| --- | --- |
| **Marketplace search matches only the `name` and `description` in `action.yml`**, not the README, the About text or the topics. | Measured on 2026-11-18 on the live Pollen listing during the Hookbench research ([hookbench docs/MARKETPLACE-SEO.md](https://github.com/NHTanvir/hookbench/blob/master/docs/MARKETPLACE-SEO.md)): words only in the README or topics found nothing. |
| GitHub does not document ranking. | [Publishing actions in GitHub Marketplace](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace) is silent on it. |
| The listing page title is `<name> · Actions · GitHub Marketplace · GitHub`; the URL slug is the slugified name; the listing body is the repository README. | Live listings fetched on 2026-11-18. |
| The `name` must be unique, "cannot match an existing action name", "cannot match a user or organization on GitHub, unless the user or organization owner is publishing the action", "cannot match an existing GitHub Marketplace category", and GitHub reserves feature names. | [GitHub docs](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace) |
| Publishing needs a public repository with one `action.yml` at the root, two-factor authentication, and the Marketplace Developer Agreement (accepted once per account). One **Primary Category** and an optional **Another Category** are chosen on the release form. | same |
| Search cards wrap descriptions at about 120 characters. | Observed in Marketplace search results. |

**Consequence:** every word that should find the Action in Marketplace search must be in `name` or `description`. The README carries the long tail for Google and answer engines.

## How top Actions in Testing, Code quality and Security are named

From the category pages (`/marketplace?type=actions&category=…`), 2026-11-18:

| Category | Top listings |
| --- | --- |
| Testing | Cypress.io · Test Reporter · Android Emulator Runner · Step CI Action · Lost Pixel |
| Code quality | Super-Linter · The PR Agent · Avoid AI Writing Gate · typos-action · jscpd-copy-paste-detector |
| Security | TruffleHog OSS · Prowler Security Scan · Aqua Security Trivy · OWASP Noir Action |
| Continuous integration | TruffleHog OSS · Prowler Security Scan · GH Release · Build and push Docker images |

Patterns: a brand plus the plain noun for what it is (Super-Linter, Test Reporter), or a keyword-led function name (Android Emulator Runner, Prowler Security Scan). Strong taglines start with a verb and name the object and the outcome ("Find and verify leaked credentials in your source code"); the gate form, "Fail CI when …", is common in Testing and Code quality.

## Competition on the terms people search

Marketplace search, 2026-11-18. The results show who competes; the term list comes from autocomplete demand in RESEARCH.md.

| Search | Actions in the results |
| --- | --- |
| `stateless mcp` | 1: MCP Stateless Check |
| `mcp 2026-07-28`, `2026-07-28` | 6: mcp-migrate, MCP migration check, mcpvitals MCP health check, MCP Deprecate, mcp-ready, MCP Stateless Check |
| `mcp migration` / `mcp migrate` | 1 each: MCP migration check / mcp-migrate |
| `mcp conformance` | 11, including MCP Conformance Gate, MCProbe, mcp-doctor, mcpdump conformance, MCP Test Harness, checkmcp, and Hookbench's MCP Events Conformance Test (SEP-3415) |
| `mcp linter` / `mcp lint` | 5 / 8, including mcp-linter, mcp-sentry, mcp-risk-linter, MCProbe |
| `mcp ci`, `mcp test`, `mcp security`, `mcp server`, `mcp` | crowded (security scanners, test harnesses, mock servers) |
| `header mismatch`, `mcp-method`, `mcp session`, `createmcphandler`, `statelint` | **0** |
| `mcp header` | 1 (unrelated: a PDF renderer) |

### The 2026-07-28 Actions, field by field

| Action | Tagline |
| --- | --- |
| [MCP Stateless Check](https://github.com/marketplace/actions/mcp-stateless-check) | Check whether an MCP server is ready for the 2026-07-28 stateless specification |
| [mcp-migrate](https://github.com/marketplace/actions/mcp-migrate) | Find what the MCP 2026-07-28 spec revision breaks in your MCP server, and fail CI on it |
| [MCP migration check](https://github.com/marketplace/actions/mcp-migration-check) | Check whether an MCP server survives the 2026-07-28 specification break — grade, findings, fixes |
| [mcpvitals MCP health check](https://github.com/marketplace/actions/mcpvitals-mcp-health-check) | Health-check an MCP server in CI: score, token cost, tool confusion, 2026-07-28 spec readiness |
| [MCP Deprecate](https://github.com/marketplace/actions/mcp-deprecate) | Fail CI when an MCP server uses protocol features removed or deprecated by the 2026-07-28 spec release candidate |
| [mcp-ready](https://github.com/marketplace/actions/mcp-ready) | Check whether your MCP server is ready for the 2026-07-28 MCP spec revision |

The closest is **MCP Stateless Check** ([Khanthtutzin/mcp-stateless](https://github.com/Khanthtutzin/mcp-stateless), npm `mcp-stateless`, created 2026-08-17): a wire probe over stdio and HTTP with 21 rules (15 breaking, 6 advisories). Its rule MCP014 checks that a server *accepts* the required `Mcp-Method`/`Mcp-Name` headers ("fails with the headers, succeeds without"). None of its rules, and none of the other five Actions, checks that a server **rejects** a missing or contradicting header with `400` and `-32020`.

What the field leaves open:

1. **Every 2026-07-28 Action frames itself as readiness** ("is it ready", "what breaks", "survives", "deprecated"). None names the header/body agreement rule, `-32020`, `Mcp-Method` or `Mcp-Name`, and Marketplace search for `header mismatch`, `mcp-method` or `mcp session` returns nothing.
2. **The security half of SEP-2243 is unclaimed.** The spec says header validation "prevents potential security vulnerabilities", and Akamai calls the attack class "protocol confusion (desync)". No Action in the Security category tests it.
3. **No Action rewrites the transport** (`createMcpHandler`); Statelint's Action runs `check`, and the CLI's `migrate` is the differentiator in the README.

## Chosen keywords, field by field

| Field | Keywords | Why |
| --- | --- | --- |
| `name` | Stateless MCP, Conformance, Linter, 2026-07-28 | The head terms with demand: `stateless mcp` (1 competitor), `mcp 2026-07-28` (6), `mcp conformance` (11), `mcp linter` (5). |
| `description` | Mcp-Method, Mcp-Name, header mismatches, -32020, initialize, Mcp-Session-Id, CI | Searchable terms the name lacks. `header mismatch`, `mcp-method` and `mcp session` have **zero** competing Actions, and `mcp-session-id` has the strongest error-driven autocomplete demand ("mcp-session-id header is required"). |
| README (listing body) | All of the above, plus migrate MCP server to 2026-07-28, createMcpHandler, MCP TypeScript SDK v2, HeaderMismatchError, server/discover, ttlMs/cacheScope | The page Google and answer engines index. |
| Release title and notes | stateless MCP, 2026-07-28, conformance linter, -32020, Mcp-Method/Mcp-Name, migration codemods | The release page is indexed and linked from the listing. |
| About text and topics | adds "GitHub Action"; topics already include `github-actions` | The Action is now part of what the repository is. |

## Name

**`Stateless MCP Conformance Linter (2026-07-28)`**: 45 characters, slug `stateless-mcp-conformance-linter-2026-07-28`.

- **Keyword-led**, the same pattern as the Hookbench listing ("MCP Events Conformance Test (SEP-3415)"): the topic, what it is, and the exact revision id in parentheses.
- **Unique.** On 2026-11-18 the slug returned 404, and no listing uses the phrase. It differs from "MCP Stateless Check" in words and slug.
- **Not an account name.** A GitHub organization called `stateless-mcp` exists, so a bare "Stateless MCP" would be refused; the full name does not match it. No `statelint` account exists.
- **"Linter", not "Check" or "Test"**: it is what the tool is (the name Statelint is state + lint), it matches `mcp linter` searches, and it stands apart from the six "check/ready" names.
- **Fits a Google title**: "Stateless MCP Conformance Linter (2026-07-28) · Actions" is 55 characters, so the keywords survive truncation. The brand, Statelint, is the README's H1 and the repository name, so answer engines still attribute the page.

## Description (tagline): three options

| # | Option | Length |
| --- | --- | --- |
| 1 | Fail CI when your MCP server ignores Mcp-Method/Mcp-Name header mismatches (-32020), needs initialize or keeps sessions | 119 |
| 2 | Statelint grades your MCP server on 33 stateless-spec rules: -32020 header/body agreement, no initialize, no sessions | 117 |
| 3 | Fail CI when your MCP server ignores Mcp-Method/Mcp-Name header mismatches (-32020) or needs initialize/Mcp-Session-Id | 118 |

- **Option 1** has the gate pattern and the three uncontested terms (`Mcp-Method`, `Mcp-Name`, `header mismatch`), but "keeps sessions" is vague where an exact, heavily searched header name (`Mcp-Session-Id`) fits.
- **Option 2** carries the brand and a concrete number, but spends characters on "Statelint" and "stateless-spec" (already in the name or the repository) and drops the searchable header names. "Grades" is weaker than a stated outcome.
- **Option 3** keeps option 1's benefit-led gate and every uncontested term, and replaces "keeps sessions" with `Mcp-Session-Id`, the term with the strongest error-driven demand. It is accurate (the Action fails CI on exactly these) and fits the card (118 characters).

**Pick: option 3.** The score, the fix per failure and the migration assistant go in the README's first lines, which the listing shows directly under the tagline.

## Categories

- **Primary: Testing.** The intent behind `mcp conformance test`, `mcp server testing tool` and `test mcp server` is testing, and it is where the MCP conformance Actions are browsed.
- **Another: Security.** Ten of the 33 rules check the header/body agreement that the spec adds to prevent "potential security vulnerabilities", plus Origin validation and secrets in mirrored headers. No Action in Security tests SEP-2243 rejection, so the listing is both accurate there and alone in it.
- **Considered and not chosen:** Continuous integration (the most common pairing among MCP Actions, so it adds the least visibility; the README covers CI use), Code quality (Statelint tests a running server, not source), AI Assisted (no LLM involved).

## Branding

- **Icon: `shield`.** The Action guards the agreement between the headers a gateway trusts and the body the server runs. It is in GitHub's Feather icon list.
- **Color: `blue`.** It matches the README's `MCP 2026-07-28` badge and is distinct from Hookbench's purple, so the user's two MCP listings are told apart at a glance.

## Release title and notes

- **Title:** `v0.1.0: stateless MCP 2026-07-28 conformance linter, -32020 header checks and migration codemods`
- **Notes:** the README's one-sentence answer first; the copy-paste workflow; what is checked, with the counts (33 rules: 23 MUST, 10 SHOULD; 35 broken fixtures; 140 tests on Node 18 to 24; zero runtime dependencies); the migration assistant; links to the spec, the SEPs and the docs.

## GEO notes applied to the listing body

The README follows the methods with measured evidence: a direct answer in the first lines and question-style headings (context position and topical relevance are the most reproducible levers, per a [2026 survey of 45 GEO studies](https://arxiv.org/abs/2607.14035)); verbatim quotations of the spec, concrete statistics and inline sources (the strongest single methods in [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735), KDD 2024: +42.6%, +32.8% and +27.7% visibility on GEO-bench); a comparison table with original, verifiable findings, Google's "unique, non-commodity content" ([2025-05-21](https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search)); and dated freshness. No keyword stuffing, which measured −8.7% in the same study.

## Sources

- [Publishing actions in GitHub Marketplace](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace)
- [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)
- Marketplace categories: [Testing](https://github.com/marketplace?type=actions&category=testing), [Code quality](https://github.com/marketplace?type=actions&category=code-quality), [Security](https://github.com/marketplace?type=actions&category=security), [Continuous integration](https://github.com/marketplace?type=actions&category=continuous-integration)
- Marketplace searches: [`stateless mcp`](https://github.com/marketplace?type=actions&query=stateless+mcp), [`mcp 2026-07-28`](https://github.com/marketplace?type=actions&query=mcp+2026-07-28), [`mcp conformance`](https://github.com/marketplace?type=actions&query=mcp+conformance), [`mcp linter`](https://github.com/marketplace?type=actions&query=mcp+linter), [`header mismatch`](https://github.com/marketplace?type=actions&query=header+mismatch)
- [Khanthtutzin/mcp-stateless rules](https://github.com/Khanthtutzin/mcp-stateless/blob/HEAD/docs/rules/README.md)
- Autocomplete demand and the wider landscape: [RESEARCH.md](RESEARCH.md)
