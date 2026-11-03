# Academic Literature: LLM Agent Experience Reuse, Skill Libraries, Cross-Agent Sharing, and Memory Security (2023 – 2026-11-03)

Verification method: I checked every arXiv ID below against the arXiv export API (export.arxiv.org/api/query) in this session. Titles and first-submission months come from that API. Quantitative claims come from the paper abstracts the API returned. ReasoningBank's table numbers come from its arXiv HTML page. I did not open the PDF of any paper submitted in 2026, so those numbers are what the authors claim in their abstracts. None of them has been checked independently. Many 2026 papers are preprints with no peer review. Model names such as "GPT-5.5", "Claude Sonnet 5" and "Opus 4.8" are copied as the papers state them.

## 1. Annotated bibliography: skill and experience-reuse methods (method, benchmark, gains, limitations)

### Takeaway
The field moved through three stages. In 2023–24, agents stored raw trajectories or exemplars (Synapse, Reflexion, ExpeL). Next came induced workflows or reusable programs (Voyager, AWM, ASI, SkillWeaver, TroVE). In 2025–26 the focus became curated, evolving "playbooks" and SKILL.md packages (ACE, ReasoningBank, Trace2Skill, EvoSkill, XRepoSkill, HSE). For coding agents, distilled experience typically yields gains of about +3 to +10 points on SWE-bench-style benchmarks. Examples: Agent KB +4.0pp, MemGovern +4.65%, ReasoningBank +3.4–4.6, REM +2.7, XRepoSkill +10.3 on DeepSWE. Rigorous paired evaluations of off-the-shelf or human-written skills often find near-zero average effect: SWE-Skills-Bench reports 92 of 98 skills with no significant effect.

### Cited Findings

**Foundational (2023–2024)**
- **Voyager (2023, arXiv 2305.16291).** A Minecraft agent with an automatic curriculum, an ever-growing skill library of executable code, and iterative prompting with self-verification. It obtained 3.3x more unique items and reached tech-tree milestones up to 15.3x faster than the prior state of the art. It reused its skill library in a new world. Limitation: one domain, a game with a programmatic API. — [arXiv 2305.16291](https://arxiv.org/abs/2305.16291)
- **Reflexion (2023, 2303.11366).** Agents write verbal reflections on task feedback into an episodic buffer and use them in the next trial. It reached 91% pass@1 on HumanEval, against 80% for GPT-4. The memory is within-task, across trials. It is not a cross-task library. — [arXiv 2303.11366](https://arxiv.org/abs/2303.11366)
- **Synapse (2023, 2306.07863).** Combines state abstraction, trajectory-as-exemplar prompting, and an exemplar memory retrieved by embedding similarity. It reached 99.2% average success on 64 MiniWoB++ tasks using demonstrations from only 48 of them, a 10% relative gain. It improved average step success on Mind2Web by 56% relative. — [arXiv 2306.07863](https://arxiv.org/abs/2306.07863)
- **ExpeL (2023, 2308.10144).** Gathers experiences on training tasks, extracts natural-language insights, and at inference recalls both the insights and past trajectories. The authors report consistent improvement as experience accumulates and explore transfer learning. The abstract gives no headline numbers. — [arXiv 2308.10144](https://arxiv.org/abs/2308.10144)
- **CRAFT (2023, 2309.17428).** Validates GPT-4 solutions, abstracts them into reusable code snippets, deduplicates them, and retrieves them at inference. Gains grow with the number of tools and with backbone strength. — [arXiv 2309.17428](https://arxiv.org/abs/2309.17428)
- **MemGPT (2023, 2310.08560).** OS-style virtual context management with memory tiers, applied to document analysis and multi-session chat. It is infrastructure, not skill induction. — [arXiv 2310.08560](https://arxiv.org/abs/2310.08560)
- **TroVE (2024, 2401.12869).** Induces a toolbox of verifiable functions by generating, using, growing, and periodically trimming it. It improved accuracy on 11 datasets with toolboxes 79–98% smaller. Human verification was 31% faster and 13% more accurate. This is an explicit pruning mechanism. — [arXiv 2401.12869](https://arxiv.org/abs/2401.12869)
- **AutoManual (2024, 2405.16247).** A Planner and a Builder maintain a structured rule system. "Case-conditioned prompting" reduces hallucinated rules, and a Formulator compiles the rules into a manual. It reached 97.4% on ALFWorld with GPT-4-turbo and 86.2% with GPT-3.5-turbo from one demonstration. The manual also guides smaller LLMs. — [arXiv 2405.16247](https://arxiv.org/abs/2405.16247)
- **Buffer of Thoughts (2024, 2406.04271).** A meta-buffer of high-level thought templates, with a buffer-manager that updates them. It gained 11% on Game of 24, 20% on Geometric Shapes and 51% on Checkmate-in-One, at about 12% of the cost of multi-query methods. — [arXiv 2406.04271](https://arxiv.org/abs/2406.04271)
- **Agent Workflow Memory, AWM (2024, 2409.07429).** Induces reusable workflows offline or online. It improved success by 24.6% relative on Mind2Web and 51.1% on WebArena, with fewer steps. In cross-task, cross-website and cross-domain tests, online AWM beat baselines by 8.9 to 14.0 points, and the margin grew as the train-test gap widened. — [arXiv 2409.07429](https://arxiv.org/abs/2409.07429)

**2025**
- **Dynamic Cheatsheet (2025, 2504.07952).** A self-curated memory of strategies and code snippets kept at test time, without labels. Claude 3.5 Sonnet's AIME accuracy more than doubled. GPT-4o went from 10% to 99% on Game of 24. Claude gained 9% on GPQA-Diamond and 8% on MMLU-Pro. The authors stress storing "concise, transferable snippets rather than entire transcript". — [arXiv 2504.07952](https://arxiv.org/abs/2504.07952)
- **Agent Skill Induction, ASI (2025, 2504.06821).** Represents skills as programs that are verified at induction time. On WebArena it beat a static agent by 23.5% and a text-skill variant by 11.3% in success rate, and used 10.7–15.3% fewer steps. Across websites it reuses common skills and updates incompatible ones. The authors attribute the gain over text skills mainly to programmatic verification. — [arXiv 2504.06821](https://arxiv.org/abs/2504.06821)
- **SkillWeaver (2025, 2504.07079).** The agent explores a website, practices, and distills skills into APIs. Success rose 31.8% relative on WebArena and 39.8% on real websites. APIs built by strong agents improved weaker agents by up to 54.3% on WebArena. — [arXiv 2504.07079](https://arxiv.org/abs/2504.07079)
- **A Self-Improving Coding Agent, SICA (2025, 2504.15228).** The agent edits its own scaffold. Performance on a SWE-bench Verified subset rose from 17% to 53%. — [arXiv 2504.15228](https://arxiv.org/abs/2504.15228)
- **Mem0 (2025, 2504.19413).** Extracts, consolidates, and retrieves memory, with an optional graph store. On LoCoMo it scored 26% relative above OpenAI memory on LLM-as-judge, with 91% lower p95 latency and more than 90% token savings compared with full context. — [arXiv 2504.19413](https://arxiv.org/abs/2504.19413)
- **A-MEM (2025, 2502.12110).** Zettelkasten-style linked notes. New memories can trigger updates to the attributes of existing ones ("memory evolution"). Tested on six foundation models. — [arXiv 2502.12110](https://arxiv.org/abs/2502.12110)
- **Alita (2025, 2505.20286).** Minimal predefinition; the agent builds and reuses its own MCPs. 75.15% pass@1 and 87.27% pass@3 on GAIA validation. — [arXiv 2505.20286](https://arxiv.org/abs/2505.20286)
- **Darwin Gödel Machine (2025, 2505.22954).** Maintains an archive of self-modified coding agents. SWE-bench rose from 20.0% to 50.0% and Polyglot from 14.2% to 30.7%. — [arXiv 2505.22954](https://arxiv.org/abs/2505.22954)
- **Contextual Experience Replay, CER (2025, 2506.06698).** A training-free buffer of environment dynamics and decision patterns. 36.7% on WebArena (+51.0% relative over GPT-4o) and 31.9% on VisualWebArena. — [arXiv 2506.06698](https://arxiv.org/abs/2506.06698)
- **SWE-Exp (2025, 2507.23361).** A multi-faceted experience bank built from successful and failed repair trajectories. Knowledge is extracted at several levels, from problem comprehension down to specific code changes. 73.0% Pass@1 on SWE-bench Verified with Claude 4 Sonnet. The abstract gives no no-memory ablation number. — [arXiv 2507.23361](https://arxiv.org/abs/2507.23361)
- **SWE-Debate (2025, 2507.23348).** Multi-agent debate over fault-propagation traces drawn from a code dependency graph, followed by MCTS patching. The authors claim state of the art among open-source frameworks. This is collaboration within one task, not experience reuse. — [arXiv 2507.23348](https://arxiv.org/abs/2507.23348)
- **Agent KB (2025, 2507.06229).** A cross-framework knowledge base of trajectories (smolagents, OpenHands, OWL). Hybrid retrieval seeds planning with workflows and applies diagnostic fixes from feedback, and a "disagreement gate" blocks interfering knowledge. smolagents went from 55.2% to 73.9% at pass@3 on GAIA. OpenHands on SWE-bench went from 24.3% to 28.3% pass@1 (+4.0pp). Automatically generated experiences matched manual curation. — [arXiv 2507.06229](https://arxiv.org/abs/2507.06229)
- **Memp (2025, 2508.06433).** Procedural memory at two levels: step-by-step instructions and script-like abstractions. It is updated, corrected, and deprecated over time. Tested on TravelPlanner and ALFWorld. Memory built by a stronger model, migrated to a weaker one, gives substantial gains. — [arXiv 2508.06433](https://arxiv.org/abs/2508.06433)
- **Memento (2025, 2508.16153).** Case-based reasoning framed as a memory-augmented MDP. A neural case-selection policy chooses cases and memory is rewritten online, with no LLM fine-tuning. GAIA validation 87.88% pass@3, test 79.40%. Case memory adds 4.7–9.6 absolute points on out-of-distribution tasks. — [arXiv 2508.16153](https://arxiv.org/abs/2508.16153)
- **Memory-R1 (2025, 2508.19828).** An RL-trained (PPO/GRPO) memory manager with ADD, UPDATE, DELETE and NOOP operations, plus an answer agent. Trained on only 152 QA pairs, it generalizes across LoCoMo, MSC, and LongMemEval at 3B–14B scale. — [arXiv 2508.19828](https://arxiv.org/abs/2508.19828)
- **ReasoningBank (2025, 2509.25140).** Distills strategies from the agent's own self-judged successes and failures. MaTTS (memory-aware test-time scaling) adds contrastive signal. — [arXiv 2509.25140](https://arxiv.org/abs/2509.25140). Results from Tables 1–2 of [the HTML version](https://arxiv.org/html/2509.25140v2):
  - WebArena: Gemini-2.5-flash 40.5 → 48.8, Gemini-2.5-pro 46.7 → 53.9, Claude-3.7 41.7 → 46.3. MaTTS (k=5) raises these to 51.8, 56.3 and 48.8.
  - SWE-bench Verified: flash 34.2 → 38.8, pro 54.0 → 57.4, with fewer steps.
  - The LLM judge was only 72.7% accurate, yet simulated judge accuracy between 70% and 90% did not significantly change results.
- **Mem-α (2025, 2509.25911).** Uses RL to train an agent to manage core, episodic and semantic memory. Trained on inputs of at most 30k tokens, it generalizes to more than 400k. — [arXiv 2509.25911](https://arxiv.org/abs/2509.25911)
- **ACE, Agentic Context Engineering (2025, 2510.04618).** Contexts are evolving "playbooks". A generator, reflector and curator apply incremental delta updates, which avoids "brevity bias" and "context collapse", where iterative rewriting erodes detail. +10.6% on agent benchmarks and +8.6% on finance. On AppWorld it matches the top production agent using a smaller open model. It can learn from execution feedback without labels. — [arXiv 2510.04618](https://arxiv.org/abs/2510.04618)
- **Live-SWE-agent (2025, 2511.13646).** Starts from a bash-only mini-SWE-agent and evolves its own scaffold during runtime. 77.4% on SWE-bench Verified without test-time scaling; 45.8% on SWE-Bench Pro. — [arXiv 2511.13646](https://arxiv.org/abs/2511.13646)

**2026: coding-agent experience and skill libraries**
- **MemGovern (2026-01, 2601.06789).** Converts raw GitHub issues and PRs (human experience) into 135K governed "experience cards" and uses agentic experience search. +4.65% resolution on SWE-bench Verified. — [arXiv 2601.06789](https://arxiv.org/abs/2601.06789)
- **EET (2026-01, 2601.05777).** Uses structured experience from past issue-resolution runs to stop patch generation early. Cost falls 19–55% (32% on average) across three SE agents, with at most 0.2% loss in resolution rate. — [arXiv 2601.05777](https://arxiv.org/abs/2601.05777)
- **SkillsBench (2026-02, 2602.12670).** 87 tasks in 8 domains, each with curated Skills and deterministic verifiers, run across 18 model-harness configurations. Curated Skills raise the average pass rate from 33.9% to 50.5% (+16.6pp), with per-configuration gains of +4.1 to +25.7. Focused Skills of at most three modules beat larger bundles. Smaller models with Skills can match larger models without them. — [arXiv 2602.12670](https://arxiv.org/abs/2602.12670)
- **EvoSkill (2026-03, 2603.02766).** Analyzes failures, proposes or edits skill folders, and keeps a change only if it improves held-out validation (Pareto frontier). OfficeQA 60.6 → 67.9 and SealQA 26.6 → 38.7. Skills evolved on SealQA transfer zero-shot to BrowseComp (+5.3). — [arXiv 2603.02766](https://arxiv.org/abs/2603.02766)
- **SWE-Skills-Bench (2026-03, 2603.15401).** 98 public SWE skills, 3,920 paired runs. 92 of 98 have no significant effect, and the average pass ratio moves only from 76.6% to 76.9%. Helpful skills supply procedures the agent would otherwise omit (up to +17.7). Harmful skills anchor the agent on their own templates and override task instructions (down to −17.0). — [arXiv 2603.15401](https://arxiv.org/abs/2603.15401)
- **Trace2Skill (2026-03, 2603.25158).** Consolidates many trajectories in parallel into one skill directory by inductive reasoning. It can deepen human-written skills or start from weak drafts. Skills from Qwen3.5-35B trajectories improve a Qwen3.5-122B agent by up to 57.65pp on WikiTableQuestions. It beats sequential skill editing and ReasoningBank-style retrieval. — [arXiv 2603.25158](https://arxiv.org/abs/2603.25158)
- **Skill Issue (2026-09, 2609.12742).** Mines harder tasks from a repository's own merged PRs, reverted at a frozen base commit. On three Kotlin repositories, GEPA-optimized SKILL documents gain +4.9pp. SkillOpt gains +0.1pp. At single-repository dataset sizes, the gain cannot be separated from run-to-run variance. A maintainer judged the documents to contain real project knowledge. — [arXiv 2609.12742](https://arxiv.org/abs/2609.12742)
- **XRepoSkill (2026-09, 2609.36807).** Contrasts successful and failed trajectories on the same issue and derives rules where they diverge. Each rule gets an executable predicate. A rule is kept only if it is associated with success and recurs across several repositories; repository-specific variants are merged. Learned from public SWE-bench Verified leaderboard trajectories and tested on SWE-bench Pro and DeepSWE with three vendors' LLMs, with no overlapping repositories. It was best in all six combinations: +10.3pp over no skills on DeepSWE and +5.0 over the strongest skill-learning baseline. — [arXiv 2609.36807](https://arxiv.org/abs/2609.36807)
- **Cortex (2026-10, 2610.14216).** Turns developer corrections into replayable tasks and writes one skill or rule at a time. A change is kept only if repeated runs with and without it show a net gain and no task gets noticeably worse. Text is also tested before it is deleted. Rules, which auto-load, did most of the work; skills helped only when offered with the files a task touches. The planted harmful skills were never opened, so the test does not show that Cortex detects damage. Under the stronger Sonnet 5 the gains were small, and on a real OSS project it found nothing to learn. — [arXiv 2610.14216](https://arxiv.org/abs/2610.14216)
- **Agent Skill Evolution (2026-10, 2610.04832).** Studies 2,608 first-vs-last revision pairs of SKILL.md files. 55% of revisions change a rule or procedure. An added rule raises the rate at which the agent takes the required action by +0.23 and final correctness by +0.10 on average. Under real lazy loading, agents keep about 51% of the action gain. Loading a skill body raises episode tokens by about 50%. — [arXiv 2610.04832](https://arxiv.org/abs/2610.04832)
- **REM (2026-10, 2610.27377).** Decides what to store (a phase-structured document about 100x smaller than the trajectory), when to recall (the full implementation record is gated until the agent is struggling), and what to forget (evicted after one exposure). On SWE-ContextBench Lite: match@1 68.7% vs 55.6%, resolution 27.6% vs 24.9%, at 17% lower cost. The same experience injected as a summary or raw trajectory does not help, even when retrieval is oracle. — [arXiv 2610.27377](https://arxiv.org/abs/2610.27377)
- **Hierarchical Skill Evolution, HSE (2026-10, 2610.35616).** Aggregates evidence from task to repository to cross-repository skills. 10 skills evolved only from SWE-Gym improve SWE-bench Verified and DeepSWE across models (GLM-5.2, GPT-5.5, Opus 4.8) and harnesses (Pi, Claude Code). — [arXiv 2610.35616](https://arxiv.org/abs/2610.35616)
- **Adaptive Skill Granularity (2026-10, 2610.31461).** Fixed macro-skill execution is efficient but brittle when it does not match the task. Runtime routing with macro-to-micro fallback recovers those failures. — [arXiv 2610.31461](https://arxiv.org/abs/2610.31461)
- **Zep Agent Skills / "Learning by Doing" (2026-11, 2611.01386).** A production service. It uses only verified traces as evidence, cites supporting events for each field, separates Reflector and Curator roles, and adds admission gates, versioning, and use-outcome-weighted ranking. Skills compiled from a teacher model's traces raise three weaker executors by 4.5–18.8 points on τ³-bench banking, AppWorld, and EnterpriseOps-Gym. Most of the gain is on tasks the teacher solved. The paper states the Agent Skills format is an open standard that Anthropic originated and donated to the Agentic AI Foundation. — [arXiv 2611.01386](https://arxiv.org/abs/2611.01386)
- **Surveys.** "Dynamic Agent Skills: A Lifecycle Survey" (2607.10113) audits 124 papers from 2023–2026. It finds admission and repair repeatedly important, verifier quality materially important, and flat retrieval degrading as libraries grow. It notes benchmarks under-report library trajectories and safety. — [arXiv 2607.10113](https://arxiv.org/abs/2607.10113). Further surveys: [arXiv 2605.07358](https://arxiv.org/abs/2605.07358) and [arXiv 2608.29596](https://arxiv.org/abs/2608.29596) (architecture, lifecycle, security).

### Inferences
- The most reliable gains for coding agents come from three things together: (1) verified evidence (tests pass, contrast with failed runs), (2) cross-repository recurrence filters, and (3) small, focused artifacts. XRepoSkill, HSE, SkillsBench's at-most-3-module finding, and REM's compact documents all point this way.
- Unfiltered or human-marketplace skills average roughly zero. Off-the-shelf skills should not be assumed to help.
- Self-improvement of the scaffold (DGM, SICA, Live-SWE-agent) is a separate lever from memory or skill reuse. Most of those reported gains depend heavily on the backbone and benchmark.
- The format has converged: production (Zep) and research (EvoSkill, Trace2Skill, HSE) now emit SKILL.md-style folders. Skill libraries are therefore portable across harnesses such as Claude Code, Codex, and OpenClaw.

### Gaps
- I did not fetch the Anthropic Agent Skills primary documentation or engineering blog this session. The only sourced statement about its origin is the claim in 2611.01386.
- ExpeL's, SWE-Exp's and SWE-Debate's headline ablation numbers are not in their abstracts, and I did not extract them.
- I found no paper with an arXiv ID titled "SWE-ContextBench". It is named only inside REM. A search for "MemoryCode" (cited in ShareMem) also returned nothing under that title.

## 2. Merging, deduplication, abstraction level, pruning, staleness, and negative transfer (bad memories hurting)

### Takeaway
Negative transfer is real and well measured. Agents "follow" retrieved experience, so errors propagate. Skills hurt on a substantial share of tasks: 36.78% in one study had a Skill help some configurations and hurt others. The best-evidenced mitigations are:
- execution-grounded admission gates with paired with/without tests;
- scoping retrieval to the task family that certified the memory;
- incremental delta updates instead of full rewrites;
- explicit invalidation and version stamps.

How much to abstract is still an open question. Controlled studies show small, model-dependent effects of granularity.

### Cited Findings
**Negative transfer / harm**
- **Experience-following.** When a task is similar to a retrieved memory, the agent's output tends to copy it. This causes error propagation and "misaligned experience replay", where seemingly correct runs mislead. The authors find that later task evaluations can serve as free quality labels, and that regulating memory quality matters. — [Xiong et al., 2505.16067](https://arxiv.org/abs/2505.16067)
- **AWM can underperform no-memory.** On Claude-3.7 WebArena it scored 40.8 against 41.7 with no memory. Adding failed trajectories lowered AWM from 44.4 to 42.2. ReasoningBank instead improved from 46.5 to 49.7 with failures added, because it distills failures into lessons. — [ReasoningBank HTML](https://arxiv.org/html/2509.25140v2)
- **Skill-induced failures.** On SkillsBench and SWE-Skills-Bench, the authors identified 307 skill-induced failures: 125 functional failures and 182 efficiency regressions. Most were caused by seemingly relevant skills, not obviously irrelevant ones. The largest category, "Excessive Procedure", comes from verification checklists (67 cases) and heavy implementation pipelines (30) becoming mandatory work. — [arXiv 2608.11888](https://arxiv.org/abs/2608.11888)
- **Same skill, different configurations.** On 36.78% of SkillsBench tasks, the same Skills help some model-harness configurations and hurt others. Relevance ranking overlooks more useful candidates. Reranking by support for the required operations raises first-choice pass rates by 4.35–5.80pp. — [arXiv 2610.08875](https://arxiv.org/abs/2610.08875)
- **Harmful skills.** They anchor agents on their own templates and override task instructions, costing up to −17.0 points. — [SWE-Skills-Bench 2603.15401](https://arxiv.org/abs/2603.15401)

**Merging / deduplication / conflicts**
- **Co-installed similar skills.** Mining 20,947 repositories found 822,109 candidate similar-skill pairs. Nearly one in four installed skills is co-installed with one doing the same job, and 37% of judged skills sit inside copied collections. A similar skill takes over one in five runs, and those runs lose more than a third of the exclusive core functions. Task completion is unchanged, so standard benchmarks miss it. Install location decides which skill runs. A pre-tool hook at the first skill read restores fidelity. — [arXiv 2610.11647](https://arxiv.org/abs/2610.11647)
- **Deduplication in shared memory.** Policies that deduplicate sources reject many true claims along with false ones. Policies that preserve coverage admit nearly as many false claims as unrestricted sharing. Gating on declared source type cut false adoption to 0.06–0.09, against 0.22–0.47 for the other answering policies. Once a false belief is in memory, consumers assert it in 97–99% of probes. — [Correlated Promotion Benchmark, 2609.30813](https://arxiv.org/abs/2609.30813)
- **Earlier dedup and merge designs.** CRAFT deduplicates abstracted snippets ([2309.17428](https://arxiv.org/abs/2309.17428)). XRepoSkill merges repository-specific variants into transferable rules ([2609.36807](https://arxiv.org/abs/2609.36807)). XferAgent "reconciles compatible contributions... while avoiding unreliable merges" in shared experience graphs ([2610.19581](https://arxiv.org/abs/2610.19581)).

**Abstraction level**
- In a controlled SkillsBench study, having a skill at all added +18 to +36pp. Low versus high abstraction differed by +0.7pp for GPT-5.5 and −6.7pp for DeepSeek V4-Flash, with both confidence intervals crossing zero. Adding one worked example changed results by about +1pp. — [arXiv 2605.31408](https://arxiv.org/abs/2605.31408)
- Memp stores both step-level instructions and script-level abstractions ([2508.06433](https://arxiv.org/abs/2508.06433)). SWE-Exp extracts multi-level knowledge from comprehension down to code changes ([2507.23361](https://arxiv.org/abs/2507.23361)). HSE moves up a task → repository → cross-repository hierarchy ([2610.35616](https://arxiv.org/abs/2610.35616)).
- ACE: iterative rewriting causes "context collapse", and summarization causes "brevity bias". Structured incremental updates prevent both. — [arXiv 2510.04618](https://arxiv.org/abs/2510.04618)
- REM: injecting experience as a summary or raw trajectory does not help even with oracle retrieval. A phase-structured document with gated release does. — [arXiv 2610.27377](https://arxiv.org/abs/2610.27377)

**Pruning / retirement / staleness**
- **TroVE** periodically trims its toolbox, which ends up 79–98% smaller. — [2401.12869](https://arxiv.org/abs/2401.12869)
- **Cortex** tests text before deleting it and keeps none of the unused text. — [2610.14216](https://arxiv.org/abs/2610.14216)
- **Skill retirement.** Retiring a skill because its gain is near zero confuses "internalized" with "uncovered" (neither the model nor the skill delivers the capability). On SkillsBench, 28 of 31 retirements rest on probes no run passed. Unaided scoring reproduces better (kappa 0.42 against 0.23) but must be read per model. — [arXiv 2610.32322](https://arxiv.org/abs/2610.32322)
- **Invalidation contracts.** Version stamps and cacheability hints on cached error-recovery fixes. Row-level invalidation recovers 29–33% of token cost on four of seven models; table-level invalidation drops post-drift first-try rates to 0% on five of seven. Model compliance varies widely: 100% on Haiku 4.5, 11% or less on Sonnet 5. — [arXiv 2609.00243](https://arxiv.org/abs/2609.00243)
- **Stale inherited constraints.** Sixteen LLMs rarely re-verified a constraint that read as settled. They made stale-consistent decisions in about 75% of episodes. A one-sentence allocation rule recovered +89.3 points. — [arXiv 2608.25553](https://arxiv.org/abs/2608.25553)
- **"Fresh memory, stale plans."** A freshness-only executor acted on a stale plan in 30 of 30 handoffs. Derivation-currency links (Planfence) fixed all 30. — [arXiv 2609.03340](https://arxiv.org/abs/2609.03340)
- **Scope matching.** On a 12-round code-repair stream, global memory of accepted skill edits scored 0.713, below the static agent's 0.775. Harmful deployments occurred in 6 of 8 cases. Scoping each skill to its originating family raised utility to 0.816 with zero harmful deployments. In paired streams, scoped gating accepted 63 updates against 12 for the global control, with 0 of 63 harmful. — [arXiv 2609.29144](https://arxiv.org/abs/2609.29144)

### Inferences
- A sound pipeline for an "error index" or skill library would combine these pieces:
  - admit an entry only with verified evidence (tests or passing outcomes) and a paired ablation;
  - attach provenance, version and scope metadata;
  - retrieve within scope (repository or task family) and widen only after evidence of cross-scope recurrence;
  - update by delta, not rewrite;
  - deduplicate by name and description at install time, and detect conflicts at first read;
  - retire per model and per scope using unaided probes, not gain alone.
- Task-completion metrics miss many harms (skill conflicts, efficiency regressions, silently dropped constraints). Evaluations should also track cost and "exclusive core function" fidelity.

### Gaps
- I found no paper that cleanly isolates merge strategies (LLM merge vs. union vs. keep-both) in a coding skill library.
- Long-horizon library growth curves, meaning how utility changes as a coding skill library reaches thousands of entries, are reported only qualitatively in the survey (2607.10113).

## 3. Does memory from other agents, tasks, or users help or hurt? (cross-task, cross-agent and cross-session transfer)

### Takeaway
Transfer from a stronger agent to a weaker one is the most consistently positive result. Examples: SkillWeaver up to +54.3%, Memp, Trace2Skill up to +57.65pp, Zep +4.5 to +18.8, AutoManual guiding smaller LLMs. Cross-framework and cross-repository transfer works with gating (Agent KB, XRepoSkill, HSE). Pooled sharing across users or task families hurts without scoping or preference isolation. Sharing helps most where local experience is scarce.

### Cited Findings
- SkillWeaver: APIs synthesized by strong agents improve weaker agents by up to 54.3% on WebArena. — [2504.07079](https://arxiv.org/abs/2504.07079)
- Memp: procedural memory built by a stronger model, migrated to a weaker model, gives substantial gains. — [2508.06433](https://arxiv.org/abs/2508.06433)
- Agent KB: cross-framework sharing improves GAIA by up to +18.7pp and SWE-bench by +4.0pp. A disagreement gate addresses "knowledge interference in cross-framework transfer". — [2507.06229](https://arxiv.org/abs/2507.06229)
- AWM's online advantage grows from 8.9 to 14.0 points as the train-test distribution gap widens (cross-task, cross-website, cross-domain). — [2409.07429](https://arxiv.org/abs/2409.07429). ReasoningBank's Mind2Web cross-domain gains are small in absolute terms (e.g., 1.0 → 1.6 SR). — [ReasoningBank HTML](https://arxiv.org/html/2509.25140v2)
- XRepoSkill learns skills from other agents' public SWE-bench Verified leaderboard trajectories and transfers them to unseen repositories and other vendors' LLMs. — [2609.36807](https://arxiv.org/abs/2609.36807)
- HSE skills transfer across benchmarks, coding models and harnesses. — [2610.35616](https://arxiv.org/abs/2610.35616)
- Zep: skills from a teacher model's traces lift weaker executors by 4.5–18.8 points, mostly on tasks the teacher solved. Transfer is bounded by the teacher's coverage. — [2611.01386](https://arxiv.org/abs/2611.01386)
- ShareMem (cross-user): beats user-local memory on Mind2Web, VitaBench 2.0 and multi-session coding (MemoryCode) across four backbones. Sharing helps most when relevant local experience is scarce. Source quality and cross-user preference interference limit transfer. The design shares "how to act", while each user's own memory supplies concrete values. — [2609.32511](https://arxiv.org/abs/2609.32511)
- "After the Fix": repairing a failed episode improves its value as memory on ThinkingBox (+44, +29 and +32pp for the Full, Skill and Hybrid variants). But 12 of the 15-point Full-over-Skill gap comes from worse uncorrected performance, and APEX shows no comparable aggregate benefit. Memory updates need both a previous-version and a fresh-start reference. — [2609.34603](https://arxiv.org/abs/2609.34603)
- Global, cross-family persistent skill edits pushed utility below the no-memory static agent (0.713 vs 0.775). Scoping fixed this. — [2609.29144](https://arxiv.org/abs/2609.29144)
- Multi-agent memory designs:
  - G-Memory uses insight, query and interaction graphs and gains up to 20.89% in embodied tasks and 10.12% in QA. — [2506.07398](https://arxiv.org/abs/2506.07398)
  - CoMem keeps private memories and shares only "widely proven" ideas, which avoids memory pollution (ALFWorld, PDDL). — [2609.15009](https://arxiv.org/abs/2609.15009)
  - INMS is a shared memory pool. — [2404.09982](https://arxiv.org/abs/2404.09982)
  - Collaborative Memory has private and shared tiers, immutable provenance, and access control based on a bipartite graph. — [2505.18279](https://arxiv.org/abs/2505.18279)
  - HiPS splits memory into a globally shared strategy and per-persona deltas. Personal rules are promoted only once broadly validated, and contradicted global rules are demoted. — [2608.25329](https://arxiv.org/abs/2608.25329)
  - XferAgent uses local plus shared experience graphs and avoids unreliable merges. — [2610.19581](https://arxiv.org/abs/2610.19581)

### Inferences
- For sharing across sessions and teammates in coding, the evidence supports two tiers. Repository- or team-scoped memory is the default. An entry is promoted to a shared tier only when it recurs across scopes or users ("widely proven", "broadly validated", recurring across repositories). Personal and preference content stays local.
- Strong-to-weak distillation of skills, for example from the strongest model's traces to cheaper agents, is the best-supported sharing pattern.

### Gaps
- I found no controlled study of experience sharing among concurrent human-agent teammates on one codebase over weeks. ShareMem's MemoryCode is the closest.
- Few papers report how often cross-agent experience is retrieved but ignored, or how it interacts with differences in context-window budgets.

## 4. Security of shared agent memory and skills: attacks and defenses

### Takeaway
Poisoning persistent memory and skills is practical and stealthy:
- PoisonedRAG reaches 90% ASR with 5 texts.
- AgentPoison exceeds 80% ASR at a poison rate below 0.1%.
- PMPA reaches 81.7% cross-session ASR on Claude Code.
- Malicious memory persists in 84.2% of MemSecBench cases.
- About 26% of marketplace skills contain vulnerabilities.

Defenses that screen content alone are weak against plain false assertions. Skill scanners disagree with each other and can be evaded. The most effective measures are structural: hard ownership gating, provenance with execution evidence, scope isolation, versioned references, and consensus checks.

### Cited Findings
**Memory and RAG poisoning attacks**
- **PoisonedRAG (2024, 2402.07867).** 90% ASR when injecting 5 texts per target question into a database of millions of texts. The evaluated defenses were insufficient. — [arXiv](https://arxiv.org/abs/2402.07867)
- **AgentPoison (2024, 2407.12784).** Optimized backdoor triggers retrieve poisoned demonstrations. Average ASR above 80%, with less than 1% benign impact, at a poison rate below 0.1%, on driving, QA, and EHR agents. — [arXiv](https://arxiv.org/abs/2407.12784)
- **MINJA (2025, 2503.03704).** Injects memory through queries alone, using bridging steps and progressive shortening. Any user can poison shared memory. — [arXiv](https://arxiv.org/abs/2503.03704)
- **Agent Security Bench (2024, 2410.02644).** Includes memory poisoning. Highest average ASR 84.30%, with limited effectiveness of defenses. — [arXiv](https://arxiv.org/abs/2410.02644)
- **PMPA (2026-09, 2609.13889).** Malicious instructions in benign external sources get written into persistent memory. Injection success / cross-session ASR: 73.7% / 55.5% on OpenClaw and 66.9% / 81.7% on Claude Code. Prompt-level defense helps little once memory is poisoned. — [arXiv](https://arxiv.org/abs/2609.13889)
- **"Bad Memory" (2026-07, 2607.14611).** On Claude Code and Codex, it is hard to make an agent overwrite its own memory files from untrusted content. Payloads already planted in memory files do attack current and future sessions. — [arXiv](https://arxiv.org/abs/2607.14611)
- **MemSecBench (2026-07, 2607.27080).** Across 24 configurations, malicious memory persists in 84.2% of cases and the full Write→Execute chain succeeds in 50.3%. Selective repair succeeds in 56.1% of poisoned cases. — [arXiv](https://arxiv.org/abs/2607.27080)
- **MemHarmBench (2026-11, 2611.01700).** Cross-session attacks are behaviorally stealthy: tasks complete normally with no anomalies while critical decisions follow the attacker. — [arXiv](https://arxiv.org/abs/2611.01700)
- **MemForm (2026-10, 2610.14431).** Five formation interfaces (content, evidence, scope, selection, path). Even consolidation order can change behavior with identical retained experiences. Defenses are incomplete. — [arXiv](https://arxiv.org/abs/2610.14431)
- **EvoBreak (2026-08, 2608.01759).** Experiences that are benign individually combine across sessions to break safety boundaries in self-evolving agents. — [arXiv](https://arxiv.org/abs/2608.01759)
- **EvoSkill Injection / SARGE (2026-08, 2608.30429).** Malicious skills induced into autonomous skill-evolution pipelines are stored persistently and activated repeatedly. — [arXiv](https://arxiv.org/abs/2608.30429)
- **Share-Borne AI Virus (2026-09, 2609.35576).** Adversarial content propagates through shared artifacts and memory between independent assistants, reaching 60–80% of agents over chains of up to 8 hops. — [arXiv](https://arxiv.org/abs/2609.35576)
- **MemLeak (2026-10, 2610.04195).** In a pooled same-team vector store, incidental cross-user leakage reaches 70–100% and crafted memories reach 90–100% top-k placement. Of the mitigations tested, only hard post-retrieval ownership gating restored the baseline, at about 1.4 ms per query. — [arXiv](https://arxiv.org/abs/2610.04195)

**Skill supply-chain attacks (Agent Skills / MCP)**
- **MCP Safety Audit (2025, 2504.03767).** LLMs can be coerced via MCP tools into malicious code execution, remote access, and credential theft. The authors release MCPSafetyScanner. — [arXiv](https://arxiv.org/abs/2504.03767)
- **Agent Skills in the Wild (2026-01, 2601.10338).** Of 31,132 skills analyzed, 26.1% have at least one vulnerability: data exfiltration 13.3%, privilege escalation 11.8%, and 5.2% likely malicious. Skills that bundle scripts are 2.12x more likely to be vulnerable. The SkillScan detector reaches 86.7% precision and 82.5% recall. — [arXiv](https://arxiv.org/abs/2601.10338)
- **"Do Not Mention This to the User" (2026-02, 2602.06547).** Of 98,380 skills, 157 are confirmed malicious, with 632 vulnerabilities. Over half come from one actor using templated brand impersonation. All were removed after disclosure. — [arXiv](https://arxiv.org/abs/2602.06547)
- **Credential leakage (2026-04, 2604.03070).** In 17,022 sampled skills, 520 affected skills contain 1,708 issues. Debug logging into stdout, which feeds the LLM context, accounts for 73.5%. 89.6% of the leaked credentials are exploitable. Secrets persist across 50+ forks after the upstream fix. — [arXiv](https://arxiv.org/abs/2604.03070)
- **OpenClaw registry (2026-09, 2609.17274).** 77.86% of skills have zero stars and zero comments, and 85.06% carry privilege evidence. Three scanners disagree on 23,702 of 61,990 skills. Weighted scanner sensitivity ranges from 21.67% to 61.06%. — [arXiv](https://arxiv.org/abs/2609.17274)
- **Skill Constellations (2026-10, 2610.11169).** 2,193,119 skill adoptions traced on GitHub. Copies almost never pick up fixes from their source. Auditing the 100 top-ranked source repositories prevents 14.9% of later high-risk adoptions, against 0.5% for the 100 most-starred. The authors recommend versioned references over copies. — [arXiv](https://arxiv.org/abs/2610.11169)
- **Runaway Reaction / CRIME (2026-10, 2610.05943).** Benign skills that each pass vetting can compose into malicious behavior. Benchmark of 4,000 skills. — [arXiv](https://arxiv.org/abs/2610.05943)
- **MetaCascade (2026-10, 2610.14836).** Poisoning only the metadata hijacks retrieval and selection. ASR is 35.53pp above the strongest baselines, and 34.65pp above them under defenses. — [arXiv](https://arxiv.org/abs/2610.14836)
- **Pretext (2026-09, 2609.39607).** Evades skill scanners such as NVIDIA SkillSpector by moving the payload into natural language and splitting it across files. Up to 97% success against a frozen detector and 77% against a co-adaptive one. — [arXiv](https://arxiv.org/abs/2609.39607)
- **SkillLifeBench (2026-10, 2610.35215).** 388 lifecycle scenarios. Sonnet 4.6 scores 82.0% on runtime tasks but 56.7% on lifecycle tasks. Execution provenance raises joint success from 49.35% to 65.58%. — [arXiv](https://arxiv.org/abs/2610.35215)

**Defenses and their costs**
- **A-MemGuard (2025, 2510.02373).** Consensus validation across related memories plus a separate "lessons" memory. Cuts ASR by more than 95% at minimal utility cost. — [arXiv](https://arxiv.org/abs/2510.02373)
- **Limits of content screening.** Poisoning 1.2% of LongMemEval with plain false assertions drops accuracy from 0.850 to 0.300. A write-time screen with 0.832 recall on prompt injection rejects 0 of 360 of these poisoned memories. Additive provenance weighting either does nothing (p=0.80) or suppresses legitimate untrusted evidence. The authors argue for bounded occupancy at retrieval. — [arXiv 2608.21230](https://arxiv.org/abs/2608.21230)
- **Benign-case costs.** Write-time defenses never fired on benign LoCoMo traffic. A read-time reranker withheld memory from 45% of questions and cost −4.4 points of accuracy. — [arXiv 2609.22818](https://arxiv.org/abs/2609.22818)
- **SkillShield (2026-08, 2608.25817).** Security skills synthesized from known attacks are placed in the coding agent's system prompt. RedCode malware severity falls from 3.37 to 0.58, execution ASR is 43.6%, comparable to Llama Guard 3, and the refusal rate on benign tasks is 0.14%. — [arXiv](https://arxiv.org/abs/2608.25817)
- **Other defense directions:** the source-type admission gate (2609.30813), hard ownership gating (2610.04195), and a pre-tool hook at the first skill read (2610.11647), all cited above.

### Inferences
- A shared team "error index" is an attack surface equivalent to a writable RAG store. It needs:
  - write provenance (which session, agent and user, plus execution evidence);
  - admission that requires verified outcomes, not just content plausibility;
  - per-tenant and per-repository ownership gating at retrieval;
  - caps on how much one source can occupy the retrieved context;
  - versioned references rather than copies.
- Content-only LLM screening can be evaded (Pretext) and misses plain false facts (2608.21230). Relying on it alone is not supported.

### Gaps
- No paper I found evaluates poisoning against an automatically distilled coding-skill library of the XRepoSkill, ReasoningBank or SWE-Exp type specifically. EvoSkill Injection is the closest.
- I did not verify Anthropic's or other vendors' official skill-security guidance.

## 5. Benchmarks for continual and experience learning (coding and general)

### Takeaway
Coding-specific continual-learning benchmarks are immature. SWE-Bench-CL proposes chronological issue streams and CL metrics, but its abstract reports no results, only a protocol. Most coding-agent experience papers evaluate on standard SWE-bench Verified, Pro or DeepSWE with train/test repository splits. Skill-specific paired benchmarks (SkillsBench, SWE-Skills-Bench) are now the main way to measure skill efficacy. General memory benchmarks (LoCoMo, LongMemEval, MemoryBench, Evo-Memory) target conversational or streaming tasks.

### Cited Findings
- **SWE-Bench-CL (2025, 2507.00014).** Built on SWE-bench Verified as chronologically ordered issue sequences, with a FAISS memory module. Metrics: forgetting, forward/backward transfer, a composite CL score, and CL-F-beta. The abstract outlines a protocol rather than reporting results. — [arXiv](https://arxiv.org/abs/2507.00014)
- **Evo-Memory (2025, 2511.20857).** A streaming benchmark that implements more than 10 memory modules over 10 datasets, with ExpRAG and ReMem baselines. — [arXiv](https://arxiv.org/abs/2511.20857)
- **MemoryBench (2025, 2510.17281).** Simulated user feedback across domains and languages. State-of-the-art baselines are "far from satisfying". — [arXiv](https://arxiv.org/abs/2510.17281)
- **LoCoMo (2024, 2402.17753).** Conversations of about 300 turns and 9K tokens on average, over up to 35 sessions. — [arXiv](https://arxiv.org/abs/2402.17753)
- **LongMemEval (2024, 2410.10813).** 500 questions covering five abilities, including knowledge updates and abstention. Commercial assistants show a 30% accuracy drop. — [arXiv](https://arxiv.org/abs/2410.10813)
- **SkillsBench (2602.12670)** and **SWE-Skills-Bench (2603.15401):** paired with/without-skill evaluation, as above.
- **Skill Issue (2609.12742)** proposes mining a repository's own merged PRs, reverted at a frozen commit, as per-repository tasks. It warns that the variance is too high at single-repository scale.
- **ProcStream-RSI**, a 12-round code-repair stream, appears in [2609.29144](https://arxiv.org/abs/2609.29144). SWE-ContextBench Lite is used in [REM 2610.27377](https://arxiv.org/abs/2610.27377).

### Inferences
- A credible evaluation of a cross-session coding error index would use chronological per-repository streams (SWE-Bench-CL style or mined PRs), paired with/without runs, and repeated seeds. It would report forward transfer, cost, harmful-update counts, and harm on held-out task families, not just resolution rate.

### Gaps
- I found no published leaderboard of results on SWE-Bench-CL.
- SWE-ContextBench and MemoryCode could not be verified as standalone arXiv papers by title search.
