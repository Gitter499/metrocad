# Competitive landscape: company-wide error index (error signature -> verified fix) and automatic skill emergence across coding-agent sessions

Research date: 2026-11-03. About 20 search/fetch calls. Primary sources (vendor docs, blogs, changelogs) are marked as such. Many results were SEO or aggregator pages; these are flagged.

## 1. Platform-native memory and skills: what each vendor learns automatically, and what teammates share

### Takeaway
By late 2026 every major coding agent has a static, human-written instruction layer (CLAUDE.md, AGENTS.md, rules, copilot-instructions) and most have an automatic memory layer. The automatic layers are walled in. Claude Code, Codex and Windsurf keep memory per user or per machine. GitHub Copilot Memory is closest to the idea: it is automatic, shared across agents inside one vendor, verified against cited code, and permission-gated, but it is scoped to one repository and works only inside Copilot. No vendor builds an index that crosses vendors, or one that maps an error signature to a verified fix.

### Cited Findings
**GitHub Copilot Memory (agentic memory)**
- Public preview for all paid Copilot plans on 2026-01-15. It was opt-in at launch. — [GitHub changelog](https://github.blog/changelog/2026-01-15-agentic-memory-for-github-copilot-is-in-public-preview/)
- On by default for Pro and Pro+ from 2026-03-04. — [GitHub changelog](https://github.blog/changelog/2026-03-04-copilot-memory-now-on-by-default-for-pro-and-pro-users-in-public-preview/)
- Each memory holds a subject, a fact, citations to specific code locations, and a reason. Memories are verified when they are used: the agent checks the cited code, re-stores a corrected memory if the code contradicts it, or refreshes the timestamp if it still holds. — [GitHub blog, "Building an agentic memory system for GitHub Copilot," 2026-01-09](https://github.blog/2026-01-09-building-an-agentic-memory-system-for-github-copilot)
- Memories are shared across Copilot coding agent, CLI and code review: what one agent learns can be used by another. — [GitHub blog](https://github.blog/2026-01-09-building-an-agentic-memory-system-for-github-copilot)
- Scope is one repository. Only contributors with write access can create memories, and only users with read access can use them. Owners review and delete memories under Repository Settings > Copilot > Memory. — [GitHub blog](https://github.blog/2026-01-09-building-an-agentic-memory-system-for-github-copilot); [search summary of changelog](https://github.blog/changelog/2026-03-04-copilot-memory-now-on-by-default-for-pro-and-pro-users-in-public-preview/)
- Vendor-reported results: coding-agent PR merge rate rose from 83% to 90% with memory, code-review precision rose 3% and recall rose 4%. These are GitHub's own figures. — [GitHub blog](https://github.blog/2026-01-09-building-an-agentic-memory-system-for-github-copilot)
- A third-party write-up notes that memory needs frequent repo activity to become useful. — [aidevme](https://aidevme.com/?p=16388)

**Claude Code (Anthropic)**
- Two layers. CLAUDE.md is written by humans at project, user, or org scope. Auto memory is written by Claude, scoped per repository, and shared across worktrees. — [Claude Code docs: memory](https://code.claude.com/docs/en/memory)
- Auto memory saves four note types (user, feedback, project, reference). It explicitly skips anything derivable from the codebase, "such as architecture, file paths, or debugging fixes." — [Claude Code docs](https://code.claude.com/docs/en/memory)
- "Auto memory is machine-local… Files are not shared across machines or cloud environments." It is stored at `~/.claude/projects/<project>/memory/MEMORY.md`, and the first 200 lines or 25KB load each session. `autoMemoryDirectory` can point it elsewhere, including from policy settings. — [Claude Code docs](https://code.claude.com/docs/en/memory)
- Org-level push: a managed-policy CLAUDE.md (or a `claudeMd` key in managed-settings.json) is distributed with MDM, Ansible and similar tools and applies to all users. Teams share project CLAUDE.md and `.claude/rules/` through version control. — [Claude Code docs](https://code.claude.com/docs/en/memory)
- Claude Code can read AGENTS.md natively from v2.1.277. — [Claude Code docs](https://code.claude.com/docs/en/memory)
- Skills are shared in practice by committing them to the repo or distributing them as plugins through `/plugin marketplace add`. A community ecosystem of marketplaces exists, for example claudemarketplaces.com and Hindsight Cloud's team-memory skill. — [claudemarketplaces Hindsight](https://claudemarketplaces.com/skills/vectorize-io/hindsight/hindsight-cloud); [example marketplace repo](https://github.com/laomou/skills)
- Claims of an admin-console tool that pushes skills org-wide come only from low-authority blogs and are unverified. — [example blog](https://claude-skills-guide-3lc.pages.dev/how-do-i-make-a-claude-skill-available-organization-wide/)

**Cursor**
- Memories launched in beta with Cursor 1.0 in June 2025. They save project facts from conversations. — [AlternativeTo news, 2025-06](https://alternativeto.net/news/2025/6/cursor-1-0-adds-bugbot-code-reviews-project-memories--and-background-agent)
- Memories are personal and rules are shared, so team knowledge has to be written into rules or skills. This is a third-party guide. — [localskills guide](https://localskills.sh/blog/cursor-memories-guide)
- Bugbot Learned Rules entered beta in April 2026. Bugbot learns from reactions to and replies on its PR comments, and from human reviewer comments. It drafts candidate rules, promotes the ones that gain signal, and disables the stale ones. `@cursor remember [fact]` on a PR adds a rule. — [Cursor changelog 04-08-26](https://cursor.com/changelog/04-08-26); [Cursor blog: bugbot-learning](https://cursor.com/es/blog/bugbot-learning)
- Cursor's blog reportedly says 110,000 or more repos enabled the feature and 44,000 or more rules were generated. Only secondary summaries carry these numbers. The rule hierarchy runs Team Rules > repo rules (learned and manual) > BUGBOT.md > User Rules. — [startuphub summary](https://www.startuphub.ai/news/bugbot-learns-from-live-code-reviews)
- Cursor staff on the forum say Learned Rules no longer has its own entry because Bugbot became part of Automations, and that the rules live in the dashboard rather than the repo. — [Cursor forum](https://forum.cursor.com/t/bugbots-learned-rules-disapeared/167484)
- Cursor closed a $2.3B Series D on 2025-11-13. — [Wikipedia](https://en.wikipedia.org/wiki/Cursor_(company))

**OpenAI Codex**
- AGENTS.md uses layered discovery: global `~/.codex/AGENTS.md`, then project folders, with an override file. Codex "Memories" summarize past sessions in the background into `~/.codex/memories/`. Memories are off by default behind a `features.memories` flag, belong to one user so a team cannot pool them, and reportedly were not available in the EEA, UK or Switzerland at launch. Skills can carry memory notes. All of this comes from secondary sources, one of them a competitor (Mem0). It was not verified on developers.openai.com. — [Mem0 blog](https://mem0.ai/blog/how-memory-works-in-codex-cli); [memoryplugin blog](https://blog.memoryplugin.com/does-codex-remember-past-conversations/)

**Devin (Cognition)**
- Devin automatically suggests Knowledge entries based on chat feedback. Users can edit, dismiss or regenerate a suggestion, and Devin suggests updates to existing items. Knowledge is org-level context. Playbooks are written by hand for recurring tasks. — [Devin docs: Knowledge](https://docs.devin.ai/onboard-devin/knowledge); [Devin docs: playbooks](https://docs.devin.ai/de/product-guides/creating-playbooks)
- I found no evidence that Devin generates playbooks automatically.

**Windsurf (Cascade Memories)**
- Cascade generates memories on its own. They are stored locally in `~/.codeium/windsurf/memories/`, scoped to a workspace, and not version-controlled. Team sharing is a requested feature that does not exist yet. — [third-party guide](https://www.markaicode.com/windsurf-memories-teach-ai-codebase/); [Product Hunt request thread](https://www.producthunt.com/p/windsurf/memories-are-cool-memories-with-friends-would-be-even-cooler)

**Augment Code / Factory**
- Augment has persistent Memories and later added a memory-review workflow, because automatically generated memories had been invisible to users and low-quality ones piled up. The source is a research report its author says was generated by Claude Code. — [lin-guanguo report](https://lin-guanguo.github.io/llm-memory-research/augmentcode.research/)
- Factory: I found no official native auto-memory. The only memory option found is an external MCP store wired in through `.factory/mcp.json` (memories.sh). — [memories.sh docs](https://memories.sh/docs/integrations/factory)

### Inferences
- The idea's wedge is the gap no platform fills: memory that is org-wide, crosses repos, and crosses vendors. Copilot shows the pattern of citation-verified memory with read/write permissions, so this is now table stakes, but Copilot applies it to one repo and one vendor.
- Claude Code's docs say auto memory deliberately skips "debugging fixes." An error-to-fix index is therefore complementary to native memory, not a duplicate of it.
- Bugbot Learned Rules is the strongest example of automatic rule emergence with promote and demote signals, but it applies only to code review.

### Gaps
- Not verified from primary sources: Sourcegraph Amp, Google Jules or Gemini CLI memory, Copilot Spaces and org-level custom instructions, official Codex memory docs, Augment and Factory official docs.
- Pricing for the memory features was not found. They appear to be bundled into the seat plans.

## 2. Agent memory-layer vendors

### Takeaway
General-purpose memory infrastructure is well funded. Mem0 raised $24M in October 2025. These vendors increasingly ship coding-agent plugins (Mem0 content on Codex and Claude Code, a Supermemory per-repo container, a Hindsight team skill), but they sell generic memory, not verified error-to-fix knowledge.

### Cited Findings
- Mem0: $24M combined Seed (Kindred) and Series A (Basis Set), announced 2025-10-28, with Peak XV, GitHub Fund and YC participating. The company reports 14M downloads and 41k GitHub stars. CB Insights dates a $20M Series A to 2025-07-24, which conflicts with the announcement date. — [BuiltIn](https://builtin.com/articles/mem0-raises-24m-AI-memory-infrastructure-20251103); [TechCrunch via mirror](https://hn.jakechampion.name/reader/https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps); [CB Insights](https://www.cbinsights.com/company/mem0/financials)
- Mem0 publishes coding-agent content ("AI coding agents that remember your codebase"). — [Mem0 library](https://mem0.ai/library/coding-agents/ai-coding-agents-that-actually-remember-your-codebase)
- TechCrunch names Supermemory, Letta (backed by Felicis) and Memories.ai as competitors. — [TechCrunch via mirror](https://hn.jakechampion.name/reader/https://techcrunch.com/2025/10/28/mem0-raises-24m-from-yc-peak-xv-and-basis-set-to-build-the-memory-layer-for-ai-apps)
- Supermemory offers a plugin that gives Claude Code, Cursor, Codex and OpenCode a shared container per repo. — [Supermemory blog](https://supermemory.ai/blog/claude-code-memory-rehab/)
- Vectorize Hindsight offers a Hindsight Cloud team-memory skill that keeps team knowledge separate from personal preferences, and publishes guides on agents learning across sessions. — [claudemarketplaces](https://claudemarketplaces.com/skills/vectorize-io/hindsight/hindsight-cloud); [Hindsight guide 2026-04-23](https://hindsight.vectorize.io/guides/2026/04/23/guide-how-ai-agents-learn-across-sessions)
- Snowflake engineering describes "Experience Cards," team-owned agent memory, and reports that about a quarter of agent turns were pure rediscovery. — [Snowflake blog](https://www.snowflake.com/en/blog/engineering/ai-agent-memory-experience-cards/)
- IBM (arXiv, 2026-03) finds that naive accumulation of experience propagates errors and proposes curating memory by quality from trajectories. This supports the need for a verification gate. — [arXiv 2603.10600](https://arxiv.org/html/2603.10600v1)

### Inferences
- Memory vendors could move into team-level coding memory quickly. Mem0's investor GitHub Fund also ties it to GitHub. Without verification and error normalization, their offerings stay generic.

### Gaps
- No funding was found in this pass for Letta, Zep/Graphiti, Cognee, Supermemory or LangMem. LangMem is a LangChain OSS library. My recollection of a Letta $10M seed (2024) and a Supermemory seed (2025) was not re-verified, so I left both out.

## 3. Error-tracking and observability players with AI fixes

### Takeaway
Sentry and Datadog own error fingerprinting from production telemetry and generate fixes per issue. Sentry also hands fixes to coding agents over MCP. Their fix knowledge stays attached to individual issues, though. It is not turned into a reusable index of signatures and verified fixes, and it does not cover errors agents hit at dev time (build, test, lint).

### Cited Findings
- Sentry Seer gathers errors, traces, logs, profiles and linked repo code to produce a root cause and fix plan or a draft PR. If a coding agent is connected, Seer packages the root cause and plan as a structured prompt and triggers that agent. The Sentry MCP server triggers Seer analysis per issue and works on any plan, free included. Seer RCA itself depends on the plan. — [Sentry blog](https://blog.sentry.io/seer-mcp-cli-or-coding-agent/); [Sentry cookbook: Claude Code](https://sentry.io/cookbook/debug-with-sentry-mcp-claude-code); [Sentry cookbook: Cursor](https://sentry.io/cookbook/fix-issues-sentry-mcp-cursor)
- Sentry's AI issue grouping embeds stack traces. v1 used Jina code embeddings and v2 is a model trained on Sentry's own data. Sentry reports 20% more duplicates prevented and half the rate of wrong merges, with embeddings stored up to 90 days. It is on by default for all customers. — [Sentry blog: decreased issue noise](https://blog.sentry.io/how-sentry-decreased-issue-noise-with-ai); [Sentry blog: enhancing issue grouping](https://blog.sentry.io/enhancing-issue-grouping)
- The Datadog Bits AI Dev Agent analyzes new errors in Error Tracking, generates a fix with unit tests, and auto-opens PRs for high-impact crashes and 500s. The docs say Preview while the blog says GA, so the status conflicts. — [Datadog blog](https://datadoghq.com/blog/bits-ai-dev-agent); [Datadog docs](https://docs.datadoghq.com/bits_ai/bits_ai_dev_agent.md)
- A June 2026 observability digest frames the trend as "AI agents and smarter grouping." — [releases.sh digest](https://releases.sh/collections/observability/digest/2026-06-08)

### Inferences
- Sentry is the most dangerous adjacent player. It has normalized error signatures (embeddings plus fingerprints), a fix generator, and an MCP channel into Claude Code and Cursor. Extending to "this fingerprint was fixed before by X, verified by a passing deploy" is a natural step, though no announcement was found.

### Gaps
- Rollbar, Honeycomb and PagerDuty AI-fix features were not researched in this pass.
- No evidence was found that Sentry or Datadog reuse fixes across issues or orgs as a knowledge base.

## 4. Enterprise search and knowledge platforms targeting agents via MCP

### Takeaway
Stack Internal (Stack Overflow), Unblocked and Glean all expose company knowledge to coding agents over MCP. Stack Internal comes closest to "verified answers": it has curated, voted Q&A and agents can write back. Everything these platforms hold is authored by humans. None mines agent sessions on its own.

### Cited Findings
- The Stack Internal MCP server has read and write access to team content and is enabled by default for sites. It supports Claude Code, Cursor, Copilot (through VS Code), Windsurf, Devin, Gemini, JetBrains and others. It uses streamable HTTP with OAuth 2.0 and PKCE, enforces permissions at user and tenant level, and logs every request for attribution. — [Stack support quickstart](https://support.stackenterprise.co/support/solutions/articles/22000294548-mcp-server-quickstart-guide); [Stack guide](https://stackoverflow.co/internal/resources/search-and-curate-trusted-knowledge-with-the-stack-internal-mcp-server/)
- Commercial status conflicts. The official docs describe the MCP server as a "free trial for a limited time." A third party says Stack Internal is GA with a free Starter tier and "agent trust signals." — [Stack support](https://support.stackenterprise.co/support/solutions/articles/22000294548); [aicybr](https://aicybr.com/blog/stack-internal-ga-mcp-verified-ai-knowledge)
- Unblocked offers an MCP "context engine" with `research_task` and `unblocked_context_engine` tools. It draws on PR history and past decisions, and its installer auto-configures Claude Code, Cursor and Windsurf. A self-reported benchmark claims 48% fewer tokens and 83% faster task completion. — [Unblocked docs](https://docs.getunblocked.com/unblocked-mcp/mcp-overview); [Unblocked blog](https://getunblocked.com/blog/building-a-context-engine-on-mcp/)
- Unblocked describes Glean's MCP server as a "permission-aware search box over the whole company." This is a competitor's characterization. — [Unblocked blog: Glean vs context engine](https://getunblocked.com/blog/glean-mcp-vs-context-engine/)

### Inferences
- Stack Internal already owns the trusted-answer, MCP read/write and attribution pieces. If it added ingestion of agent sessions, it would be a direct competitor.

### Gaps
- Swimm and Sourcegraph MCP positioning, Glean's own docs, and pricing for all of these were not researched.

## 5. Startups doing shared learning across agent sessions, agent experience memory, and skill marketplaces (2025-2026)

### Takeaway
A crowded early field of YC 2026 startups and OSS projects works on shared session memory across agents (Skillsync, Wato, Lucidic, and others named in YC listings), plus many OSS cross-agent memory servers. I found none that clearly combines normalized error signatures, a verification gate (tests or CI passing) and org permission controls. Most sell "portable context" or "shared memory."

### Cited Findings
- Skillsync (YC W26, skillsync.wiki): "GitHub for agent sessions." It ports sessions between Claude Code, Codex, Cursor, Antigravity and others, and offers a macOS app, the `skl` CLI and an MCP server. Reports say it raised about $500K from YC and Character Capital, and that it pivoted from finding elite engineers to "remembering how they work." These claims are from aggregators. — [YesPress](https://yespress.io/skillsync-yc-w26); [review](https://baeseokjae.github.io/posts/skillsync-portable-agent-chat-2026/); [YC jobs page](https://www.ycombinator.com/companies/skillsync/jobs)
- Wato (YC Spring 2026): shared memory, reusable workflows and connected tools for agents across a company, turning useful runs into knowledge for the next agent. Reported to have about $500K seed and 1-10 people. — [neuronfeed](https://neuronfeed.com/startups/wato); [yctierlist](https://yctierlist.com/s26/wato/)
- A search summary of YC directory listings named Lucidic (a per-agent learning system covering what to remember and which skills to build), Mosaic (shared memory for teams using coding agents), Glen (shares agent session context with new agents) and Screenpipe (YC S26). A follow-up search could not confirm Mosaic or Glen, so treat both as unverified. — [YC AIOps listing](https://www.ycombinator.com/companies/industry/aiops); [YC Infrastructure listing](https://www.ycombinator.com/companies/industry/infrastructure)
- Palace is a commercial cross-agent memory product whose paid tier is the team layer. — [palacememory.com](https://palacememory.com/)
- OSS projects: agentmemory (rohitg00), a local shared memory server over MCP and REST for Claude Code, Copilot CLI, Cursor, Gemini CLI and Codex. — [GitHub](https://github.com/rohitg00/agentmemory)
- ai-memory (akitaonrails) offers handoff across more than 20 harnesses. — [GitHub](https://github.com/akitaonrails/ai-memory)
- agent-memory (Ameer-Jamal) is shared Markdown memory, with Obsidian optional. — [GitHub](https://github.com/Ameer-Jamal/agent-memory)
- A field report on agentmemory covers more than 1,000 sessions. — [Jay Zeng](https://jayzeng.com/writing/agentmemory-field-report/)
- A critique argues that agentmemory "is useful only if you audit what it remembers," which supports the case for verification. — [developersdigest](https://www.developersdigest.tech/blog/github-trending-agentmemory-2026-05-16)
- Skill directories and marketplaces include skills.sh, which runs an "agent trust hub" security review per skill, claudemarketplaces.com, and Skillselion (an MCP server that loads ranked skills mid-task). — [skills.sh example](https://skills.sh/openclaw/skills/session-history/security/agent-trust-hub); [Skillselion](https://skillselion.com/plugin/memcoai/marketplace)
- Mainstream press (XDA) covers individual users sharing one memory across Claude Code, Codex and Cursor. — [XDA](https://www.xda-developers.com/gave-claude-code-codex-cursor-same-memory/)

### Inferences
- The "shared memory across agents" category is commoditizing quickly through OSS. Differentiation would have to come from three things: normalized error signatures, fixes verified by test, CI or deploy outcomes, and enterprise controls (RBAC, redaction, provenance, retention).
- Skill marketplaces exist, but the skills in them are written by hand. I found no product that distills skills automatically from many teammates' sessions with an approval workflow.

### Gaps
- Product Hunt and HN Show HN were not searched systematically.
- Funding for Lucidic, Palace and Mosaic is unknown, and Lucidic's current positioning was not verified on its own site.

## 6. Public signals that vendors will build this natively

### Takeaway
The clearest signal is GitHub: Copilot Memory already works across Copilot's agents, and GitHub says other agents are expected to follow. Cursor's learned rules and Devin's suggested Knowledge show that every vendor is moving toward automatic team-level learning, but each inside its own walls. No vendor has announced memory that interoperates across vendors.

### Cited Findings
- GitHub says Copilot memory launched for coding agent, CLI and code review, with other agents expected to follow. — [GitHub blog](https://github.blog/2026-01-09-building-an-agentic-memory-system-for-github-copilot)
- Cursor promotes and demotes learned rules automatically from PR feedback, and Team Rules sit at the top of the rule precedence. — [Cursor changelog](https://cursor.com/changelog/04-08-26)
- Devin auto-suggests Knowledge and updates to existing Knowledge from feedback. — [Devin docs](https://docs.devin.ai/onboard-devin/knowledge)
- Claude Code adopted AGENTS.md (v2.1.277), which signals convergence on shared instruction formats across vendors. — [Claude Code docs](https://code.claude.com/docs/en/memory)
- Sentry already routes Seer fixes into third-party coding agents. — [Sentry blog](https://blog.sentry.io/seer-mcp-cli-or-coding-agent/)

### Inferences
- Within 12 months, expect each vendor to offer org-scope memory inside its own walls. Copilot is the likely first to move from repo scope to org scope. A cross-vendor index is defensible mainly because companies run several agents at once and because vendors have no incentive to share learnings with each other. MCP plus AGENTS.md plus the SKILL.md format would make distribution easy.

### Gaps
- No roadmap statements were found from Anthropic, OpenAI or Cursor about memory at team or org scope.
