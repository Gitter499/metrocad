# Market, Demand Signals and Go-to-Market for a Vendor-Neutral Shared Learning Layer for Coding Agents (error→verified-fix index plus distilled skills, delivered over MCP)

Research date: 2026-11-03. About 15 tool calls. Each item is labelled DATA (survey, measurement or doc), VENDOR (vendor or vendor-adjacent claim) or OPINION. GitHub API access was blocked in this session, so star counts could not be pulled (see Gaps).

## 1. Enterprise deployment and spend on coding agents in 2026, and multi-vendor use

### Takeaway
Coding agents are mainstream, and most practitioners run 2–4 tools in parallel (70% in the Pragmatic Engineer survey). Claude Code leads among smaller and mid-size companies, and Copilot leads at 10k+ employee enterprises. A multi-vendor setup is the norm, which supports a vendor-neutral layer. Credible per-engineer token-spend figures are scarce and mostly come from vendor blogs.

### Cited Findings
- DATA: The Pragmatic Engineer survey (906 respondents, run 27 Jan–17 Feb 2026, published 3 Mar 2026) found that 70% of respondents use 2–4 AI tools, 15% use one, and 15% use five or more. 55% regularly use AI agents. — [Pragmatic Engineer, AI Tooling for Software Engineers in 2026](https://newsletter.pragmaticengineer.com/p/ai-tooling-2026)
- DATA: The same survey reports usage among regular agent users of Claude Code 71%, GitHub Copilot 46% and Cursor 39%. Codex has about 60% of Cursor's usage. At the smallest companies the figures are Claude Code 75%, Cursor 42%, Copilot 35%, Codex 26%, Gemini CLI 14% and OpenCode 13%. At companies with 10,000+ employees, Copilot (56%) overtakes Claude Code. — [Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/ai-tooling-2026)
- DATA (secondary report): In the Stack Overflow 2026 Developer Survey (reported early Oct 2026), 65.9% of respondents use coding assistants or agents, 26.2% use automated agent workflows and 17.2% use no AI tools. Only 24% say their employer has published approved tools or formal AI guidance. 78.7% say attribution is important or very important when assessing AI code or answers. Nearly half trust AI output only when they can verify it, and 6.6% would trust it for important decisions. — [IT Brief UK](https://itbrief.co.uk/story/stack-overflow-survey-shows-developers-trust-ai-with-caveats); survey context: [Stack Overflow blog, 2026-06-23](https://stackoverflow.blog/2026/06/23/the-2026-developer-survey-is-now-open-for-human-developers-only/). The primary results page was not reached, and the two IT Brief editions differ slightly on rounding.
- DATA (secondary): Among Stack Overflow 2026 respondents who use a listed agent, 65.5% use Claude Code and 29.5% use OpenAI Codex. — reported via search summary of [tech-insider.org](https://tech-insider.org/codex-vs-cursor-vs-claude-code-2026/). Not verified against the primary source.
- DATA (secondary, unverified): A JetBrains survey reportedly shows Codex adoption rising from 3% to 16% of developers between Jan and Jul 2026, and Cursor falling from 18% to 12% between May and Jul. — via [digitalapplied / capitalandcompute aggregator results](https://capitalandcompute.net/blog/the-2026-ai-coding-agent-landscape/). Secondary only.
- DATA (secondary, unverified): IDC (Sep 2026) found coding agents take 53.6% of organizations' agentic-AI budget allocations among the agent categories measured. — reported by [Tech Insider](https://tech-insider.org/codex-cli-0-162-vs-claude-code-2-1-296-2026/). Not confirmed against IDC.
- VENDOR (unverified attribution): Claude Code costs about $13 per developer per active day, or about $150–250 per developer per month, attributed to Anthropic enterprise figures. For teams, token spend rather than the seat licence dominates cost. — [Morph, AI Coding Costs 2026](https://www.morphllm.com/ai-coding-costs)

### Inferences
- Multi-tool use (85% use two or more tools) is the strongest data point for a vendor-neutral position. A learning captured in Claude Code is lost when the same engineer, or a teammate, switches to Codex or Cursor.
- Token spend runs about $150–250 per engineer per month (unverified). Even a 10% cut in redundant work is worth roughly $15–25 per engineer per month, which caps a pure "token savings" price. Time saved and the share of runs that succeed on the first try are probably the stronger value story.
- Only 24% of employers have formal AI guidance, so governance is immature. Buyers will want admin controls but may lack a clear owner. Platform or DevEx teams are the likely buyers.

### Gaps
- No primary Gartner, a16z or Menlo Ventures 2026 numbers were retrieved, because I ran out of call budget. The writer should not cite specific figures from them.
- GitHub Octoverse 2025/2026 figures were not retrieved.
- No primary source was found for enterprise token spend per engineer.

## 2. Practitioner pain: rediscovery, wasted tokens, maintaining CLAUDE.md and AGENTS.md, context rot

### Takeaway
The pain is real but is mostly voiced as "context files get forgotten or ignored" and "keeping CLAUDE.md and AGENTS.md in sync". I found no thread naming "agents rediscovering the same fix" directly. Measured redundant re-exploration within a session is modest (about 11% in one pilot), but exploration and reads make up 30–76% of tokens.

### Cited Findings
- OPINION (HN): Users report CLAUDE.md being "forgotten almost entirely" when context fills, and instructions in files referenced from CLAUDE.md being more likely to be dropped or ignored. — [HN thread](https://news.ycombinator.com/item?id=49760187) and related threads ([1](https://news.ycombinator.com/item?id=49815527), [2](https://news.ycombinator.com/item?id=49763885))
- OPINION (HN): LLM-written AGENTS.md files "mostly describe obvious things and add context rot". The useful content is what cannot be inferred from the repo. — [HN cluster](https://news.ycombinator.com/item?id=49815527)
- DATA (product change): Claude Code v2.1.277 reads AGENTS.md when there is no CLAUDE.md. If both exist, CLAUDE.md wins. Teams symlink or import one file into the other, and one user found that a CLAUDE.md saying only "Read AGENTS.md" was not reliably followed. — [HN: Claude Code now reads AGENTS.md](https://news.ycombinator.com/item?id=49760187); [HN](https://news.ycombinator.com/item?id=49763885)
- DATA (OSS tool): context.md generates both files and adds a stop hook that reminds users to run an update command at the end of every session. This shows that maintaining the files is manual work people want automated. — [amajorai/context.md](https://github.com/amajorai/context.md)
- DATA (Show HN): "Stop Claude Code from forgetting everything" is an example of persistent-memory tooling for single users. — [HN 46426624](https://news.ycombinator.com/item?id=46426624)
- DATA (arXiv): In SWE-Pruner (Mini-SWE-Agent with Claude Sonnet 4.5 on SWE-Bench Verified), read operations took 76.1% of tokens, execution 12.1% and edits 11.8%. — [arXiv 2601.16746](https://arxiv.org/pdf/2601.16746)
- DATA (arXiv): "How Do AI Agents Spend Your Money?" (OpenHands on SWE-Bench Verified) found accuracy often peaks at intermediate cost, and high-cost runs show more repeated view and modify actions. It gives no single "waste %". — [arXiv 2604.22750](https://arxiv.org/html/2604.22750v2)
- DATA (arXiv, small sample): In "Delivery, Not Storage", pooled re-exploration across 9 pilot transcripts was 10.9% of exploration calls (range 0–29.1%), clustered around context-compaction boundaries. — [arXiv 2607.20972](https://arxiv.org/pdf/2607.20972)
- VENDOR/BLOG (unverified): One claim is that agents spend about 30–40% of tokens on exploration (500 SWE-bench instances). — [DEV Community](https://dev.to/kyoma_1234/why-ai-coding-agents-waste-30-of-their-tokens-and-how-to-fix-it-42c1). Another claim puts exploration at 47% of tokens. — [Codex blog, librarian pattern, 2026-07-12](https://codex.danielvaughan.com/2026/07/12/librarian-pattern-persistent-search-sub-agent-token-waste-codex-cli-multi-agent-pointer-answers/)

### Inferences
- The measured data covers redundancy within a session (about 11%). Redundancy across sessions and across teammates, which is this product's thesis, is unmeasured publicly. That is both a gap in the evidence and an opening: a startup that publishes a "duplicate-subproblem rate" benchmark from real team logs would own the metric.
- "Context rot" complaints argue against simply injecting more memory. The product should retrieve fixes only when a matching error appears (error-triggered recall) rather than load more static context at session start.

### Gaps
- No Reddit threads were retrieved.
- No published case study quantifies teams sharing skills or rules, or their impact.
- Star counts and traction for awesome-claude-skills, anthropics/skills and cursor.directory could not be checked because GitHub API access was blocked.
- Anthropic and OpenAI first-party guidance on Agent Skills was not fetched in this session.

## 3. Existing community and open-source projects for sharing agent learnings

### Takeaway
There is a long tail of small open-source "team memory MCP" servers, many described as proofs of concept. Copilot already ships repo-scoped shared memory with verification and expiry. Nobody visible owns a cross-vendor, verified error→fix index.

### Cited Findings
- DATA: gustavolira/team-memory-mcp is shared team memory with Bayesian confidence scoring and temporal decay. It works with Claude Code, Devin, Cursor and any MCP client, on SQLite or Postgres. — [GitHub](https://github.com/gustavolira/team-memory-mcp)
- DATA: tlemmons/mcp-shared-memory covers learnings, checklists and coordination for agent teams over weeks, using Docker Compose and streamable HTTP. — [GitHub](https://github.com/tlemmons/mcp-shared-memory)
- DATA: nitishagar/agent-memory captures shell and transcript history, provides MCP recall and offers self-hosted TLS team sync (Apache-2.0). This is the closest open-source analogue to transcript-mined learnings. — [GitHub](https://github.com/nitishagar/agent-memory)
- DATA: team-memory/team-memory is permission-aware, written in Go with Postgres and pgvector, and self-described as a "personal proof of concept". — [GitHub](https://github.com/team-memory/team-memory)
- DATA: Other examples are BBerthod/mcp-vector-memory (Qdrant, Ollama, tree-sitter), Chaerulcp/shared-agent-memory-mcp (Notion as source of truth), and threadctx-mcp (project learnings and gotchas across teammates, with team sharing in a paid cloud tier). There is also a GitHub topic `team-memory`. — [mcp-vector-memory](https://github.com/BBerthod/mcp-vector-memory), [shared-agent-memory-mcp](https://github.com/Chaerulcp/shared-agent-memory-mcp), [threadctx on Glama](https://glama.ai/mcp/servers/threadctx-dev/threadctx-mcp), [topic](https://github.com/topics/team-memory)
- DATA: GitHub Copilot agentic memory has been in public preview for all paid Copilot plans since 2026-01-15. Memories are repo-scoped, can be created only by contributors with write access and used by readers, are shared across the Copilot cloud agent, code review and CLI, and expire after 28 days. Agents verify the cited code locations before applying a memory. — [GitHub changelog 2026-01-15](https://github.blog/changelog/2026-01-15-agentic-memory-for-github-copilot-is-in-public-preview/); [GitHub engineering blog 2026-01-09](https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/); [VS Code docs](https://code.visualstudio.com/docs/copilot/agents/memory). Sources disagree on defaults: VS Code docs say it is off by default, while [CloudThat](https://www.cloudthat.com/resources/blog/github-copilot-memory-your-ai-pair-programmer-finally-remembers-you) says it is on for Pro and Pro+.

### Inferences
- Copilot's design (repo scope, write-access provenance, 28-day decay, citation verification) is a reference spec that enterprise buyers will compare against. A neutral product needs parity on provenance, verification and decay, and must add cross-tool reach and an explicit "verified fix" signal such as tests passing or CI going green.
- The many small open-source projects show developer demand but also low barriers to entry. Defensibility has to come from verification, distillation quality, governance and integrations, not from storage.

### Gaps
- No star or traction numbers (GitHub API blocked).
- No Claude Code session-log analyzer projects were surveyed.

## 4. MCP as a distribution channel, and security and governance

### Takeaway
MCP is the de facto distribution channel: the official registry holds tens of thousands of entries, and about 41% of software organizations run MCP in production per one traced survey. Shared skills and memory are a documented supply-chain and prompt-injection attack surface, so enterprises will route this through gateways and allowlists. Security is a prerequisite for selling, and also a possible differentiator.

### Cited Findings
- DATA (aggregator): The official MCP Registry had about 9,652 latest server records in May 2026, an independent August 2026 census counted 21,643, and a 2026-10-21 figure reports 47,267 active. The counting methods differ. — [Digital Applied MCP stats](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol); [H1 2026 retrospective](https://www.digitalapplied.com/blog/mcp-ecosystem-h1-2026-retrospective-adoption-data-points)
- DATA (secondary): Stacklok's 2026 report found 41% of surveyed software organizations have MCP servers in limited or broad production. The widely repeated "78% of enterprise AI teams" figure has no primary source found. — [Digital Applied](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol); [baeseokjae guide](https://baeseokjae.github.io/posts/mcp-enterprise-adoption-guide-2026/)
- VENDOR: Enterprise MCP gateways and registries (Portkey, Zuplo, Maxim, ServiceNow) centralize authentication and tool-level access policies, keep audit trails, and let admins control which teams reach which servers. — [Portkey](https://portkey.ai/docs/aigw/product/mcp-gateway/mcp-registry); [Zuplo changelog 2026-08-20](https://zuplo.com/changelog/2026/08/20/mcp-server-registry.md); [Maxim](https://www.getmaxim.ai/articles/top-5-enterprise-mcp-gateway-solutions-in-2026/); [ServiceNow](https://www.servicenow.com/docs/r/t2jQMKLZFp9AGt3V12O7mQ/HGYvUIRpTf9W5Ir9DiYpfg)
- DATA (security vendor): Snyk ToxicSkills (2026-02-05) scanned 3,984 skills from ClawHub and skills.sh. 13.4% (534) had a critical issue, 36.82% (1,467) had some flaw and 76 were confirmed malicious. 91% of the malicious ones used prompt injection, 10.9% of ClawHub skills had hardcoded secrets, and 17.7% fetch third-party content (an indirect-injection risk). Snyk recommends treating skills as dependencies, scanning with mcp-scan and reviewing memory files such as MEMORY.md for tampering. — [Snyk](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/)
- DATA (arXiv): The ClawHavoc campaign (Jan–Feb 2026) placed more than 1,200 malicious skills in the OpenClaw marketplace. One compromised skill in a dependency chain can affect a whole pipeline. — [arXiv 2603.00195](https://arxiv.org/html/2603.00195v1). Detection research includes [MalSkills](https://arxiv.org/pdf/2603.27204), [SkillSieve](https://arxiv.org/pdf/2604.06550) and a [threat-model survey](https://arxiv.org/pdf/2607.13987).
- DATA (aggregator): postmark-mcp (malicious version about 1.0.16, Sep 2025) silently BCC'd emails to an external domain and is cited as the first malicious MCP server. CVE-2025-6514 in mcp-remote was a remote-code-execution flaw affecting a reported 437k+ downloads. — [Practical DevSecOps](https://www.practical-devsecops.com/mcp-security-statistics-2026-report/)

### Inferences
- A shared fix index amounts to a write path into every teammate's agent context. Prompt injection through memory is the main objection buyers will raise. The MVP needs provenance (who or which session wrote an entry), human or CI verification before an entry is shared, content scanning, and tenant isolation. Positioning "verified" as a security property, not just a quality one, fits the evidence.
- Distribution should be the MCP registry plus enterprise gateway allowlists (Portkey and others), not a public skills marketplace, given the ToxicSkills findings.

### Gaps
- No primary data was found on how many enterprises block third-party MCP servers or require gateways.

## 5. Business risks: native platform memory, access to transcripts, pricing benchmarks and funding comparables

### Takeaway
Platform risk is high and already live. Copilot ships shared repo memory, Anthropic shipped shared memory across parallel Claude Code sessions (Projects, Sep 2026) and memory for managed agents, and OpenAI ships "Dreaming". Each is siloed to its own vendor, which leaves the cross-vendor seam. Transcript access is feasible: Claude Code writes local JSONL and has OpenTelemetry export with content opt-ins that admins push via managed settings. Funding comparables are seed to Series A ($6.5M–$24M), with one directly adjacent coding-context round (SageOx, $15M seed).

### Cited Findings
- DATA (press): Anthropic redesigned Claude Code Projects (around 2026-09-17) as a coordinator that splits goals across parallel Claude Code sessions, with every thread reading from and writing to a shared memory. It is in beta for select Pro and Max users, with Team and Enterprise to follow. — [VentureBeat](https://venturebeat.com/orchestration/anthropic-launches-claude-code-projects-an-always-on-conversation-that-remembers-and-delegates-your-long-running-dev-work); [Claude: Projects redesigned](https://claude.com/resources/articles/projects-redesigned); [The New Stack](https://thenewstack.io/claude-code-parallel-projects/). Dates in search results were inconsistent and should be verified.
- DATA (press): Claude chat and Cowork share one memory, on by default, with admin control for Team and Enterprise. This was reported 2026-08-25 and Claude Code is not included. — [The Register](https://www.theregister.com/ai-and-ml/2026/08/25/claude-and-cowork-now-share-what-they-know-about-you/5292412); [TNW](https://thenextweb.com/news/anthropic-claude-cowork-shared-memory-default)
- DATA (secondary): Anthropic shipped built-in memory for Claude managed agents, stored as files (Apr 2026). OpenAI rolled out "Dreaming" memory to ChatGPT free users (2026-06-04). — [The Deep Feed, 2026-06-12](https://www.thedeepfeed.ai/posts/2026-06-12-agent-memory-seed-wave/). A third-party write-up describes an Anthropic "dreaming" process that reviews agent sessions to surface patterns shared across a team, which I could not confirm in primary sources. — [MindStudio](https://www.mindstudio.ai/blog/code-with-claude-2026-new-agent-features)
- DATA (vendor docs): Claude Code's OpenTelemetry export emits the events user_prompt, assistant_response, tool_result, tool_decision, api_request, api_error and others. Prompts and responses are redacted by default (opt in with `OTEL_LOG_USER_PROMPTS` and `OTEL_LOG_ASSISTANT_RESPONSES`). Tool inputs require `OTEL_LOG_TOOL_DETAILS=1` and are truncated to 512 characters per value and about 4K per payload. Tool output content requires beta tracing plus `OTEL_LOG_TOOL_CONTENT=1`. `OTEL_LOG_RAW_API_BODIES` emits full conversation JSON, or writes it to a directory with `file:<dir>`. Metrics cover sessions, lines of code, PRs, commits, cost, tokens and active time. Admins enforce all of this through managed settings, and repo-level settings cannot enable telemetry. Transcripts are stored locally at `~/.claude/projects/*/*.jsonl`, and the docs call that format internal and subject to change. — [Claude Code docs: Monitoring usage](https://code.claude.com/docs/en/monitoring-usage)
- DATA (vendor docs): Cursor Teams costs about $40 per seat per month ($32 annual) for Standard. A Premium seat added in Jun 2026 costs $120 per month or $96 annual. Bugbot moved from $40 per user per month to usage-based billing (announced 2026-05-11, applying at renewal after 2026-06-08). Teams include shared rules, and Bugbot has its own BUGBOT.md rules. — [Cursor Team Pricing](https://cursor.com/docs/account/teams/pricing); [Cursor Bugbot legacy pricing](https://cursor.com/docs/bugbot/legacy-pricing); [DEV summary](https://dev.to/jovan_chan_9500711396d4e6/cursor-teams-june-2026-pricing-standard-32seat-vs-premium-96seat-what-5x-the-usage-limit-469j). Third-party figures conflict.
- DATA (funding): SageOx raised a $15M seed led by Canaan (2026-05-06) for "agentic context infra for human-AI engineering teams", the closest direct comparable. — [TAMradar](https://www.tamradar.com/funding-rounds/sageox-seed-15m)
- DATA (funding): Relai raised a $5.4M pre-seed led by .406 Ventures (2026-06-10) for verifiable continual learning, turning production failures into replayable environments and checking fixes for regressions. This is conceptually close to an "error→verified fix" product. — [The Deep Feed](https://www.thedeepfeed.ai/posts/2026-06-12-agent-memory-seed-wave/)
- DATA (funding): Mem0 raised a $24M Series A (Oct 2025; lead reported as Basis Set). Cognee raised a $7.5M seed led by Pebblebed (2026-02-19). HydraDB raised a $6.5M seed (Mar 2026). Jedify raised a $24M Series A led by Norwest (2026-06-10). Letta raised a $10M seed (Sep 2024, Felicis). — [Cognee](https://www.cognee.ai/blog/cognee-news/cognee-raises-seven-million-five-hundred-thousand-dollars-seed); [The Deep Feed](https://www.thedeepfeed.ai/posts/2026-06-12-agent-memory-seed-wave/); [ValueAdd VC](https://valueaddvc.com/blog/the-ai-memory-problem-how-startups-are-solving-for-persistent-context). The Mem0 lead investor and Letta details come from secondary sources.
- OPINION: The Deep Feed argues that personalization memory is being given away free by the labs. It sees verification against a customer's own workflows (Relai) and typed company knowledge as the defensible approaches, and says enterprise wariness of a model provider holding their knowledge creates room for neutral, portable layers. — [The Deep Feed](https://www.thedeepfeed.ai/posts/2026-06-12-agent-memory-seed-wave/)

### Inferences
- The defensible wedge is the combination of cross-vendor reach, verification (a fix counts only once a test or CI passes) and governance. Every platform's native memory is siloed and mostly unverified, apart from Copilot's citation check.
- Getting the data in should rely on two paths: (a) a local collector reading `~/.claude/projects/*.jsonl`, which is fragile because the format is internal, and (b) OpenTelemetry pushed by admins through managed settings, which is enterprise-friendly but redacts content by default, so the buyer must opt in to content capture. An MCP tool such as `report_fix` or `lookup_error`, called by the agent itself, avoids the transcript problem entirely.
- Pricing anchors: dev-tool seats sit at $20–40 per month (Cursor Teams Standard $32–40, Bugbot formerly $40). Usage-based billing is becoming the norm (Bugbot's switch). A plausible model is about $10–20 per active engineer per month or a platform fee. This is not benchmarked directly.

### Gaps
- No acquisitions or exits in agent memory were found for 2025–2026.
- Codex CLI and Cursor transcript storage, export APIs and OpenTelemetry support were not verified in this session.
- No data was retrieved on Anthropic or OpenAI team-skill sharing features (for example org-wide skill provisioning).

## 6. Measuring ROI

### Takeaway
No public benchmark measures redundancy across sessions or teammates. Within a session, re-exploration is about 11% (small pilot), and exploration and reads are 30–76% of tokens. Vendor OpenTelemetry already supplies cost, token and active-time metrics that can serve as the ROI baseline.

### Cited Findings
- DATA: Re-exploration is 10.9% of exploration calls (range 0–29.1%) across 9 pilot transcripts, concentrated at context-compaction boundaries. — [arXiv 2607.20972](https://arxiv.org/pdf/2607.20972)
- DATA: Read operations are 76.1% of tokens on SWE-Bench Verified with Sonnet 4.5. — [arXiv 2601.16746](https://arxiv.org/pdf/2601.16746)
- DATA: Accuracy peaks at intermediate cost, and high-cost runs show repeated view and modify loops. — [arXiv 2604.22750](https://arxiv.org/html/2604.22750v2)
- DATA: Claude Code metrics available for before-and-after measurement are `claude_code.cost.usage`, `token.usage`, `active_time.total`, `session.count` and `commit.count`, among others. — [Claude Code docs](https://code.claude.com/docs/en/monitoring-usage)
- DATA: Developers value verifiable attribution (78.7% rate it important), which supports showing the provenance of each recalled fix. — [IT Brief UK](https://itbrief.co.uk/story/stack-overflow-survey-shows-developers-trust-ai-with-caveats)

### Inferences
- Candidate metrics for the MVP:
  - Duplicate-subproblem rate: the share of sessions hitting an error signature already seen and fixed elsewhere in the org.
  - Time and tokens from first error to green, for matched errors with and without recall.
  - Hit rate and acceptance rate of recalled fixes.
  - Staleness and harm rate: recalled fixes that were wrong.
- Validation plan implied: mine 2–4 weeks of existing JSONL transcripts from a design partner offline, measure the duplicate-error rate before building anything, and use that as the go/no-go signal.

### Gaps
- No published figure was found for duplicate work across teammates or across sessions in coding agents.
