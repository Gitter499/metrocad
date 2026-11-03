# Error Index Techniques: Mapping Normalized Error Signatures to Verified Fixes (for Coding Agents)

Research current as of 2026-11-03. Every cited URL was surfaced by search or fetched during this session. Items marked "(snippet-level)" were confirmed from search-result abstracts or snippets only, not from the full text.

## Crash/stack-trace deduplication and bucketing: methods, accuracy, tradeoffs

### Takeaway
Production systems use a layered approach. A cheap, deterministic signature or fingerprint (WER heuristics, Socorro siggen, Sentry fingerprinting) comes first. A learned similarity fallback (Sentry's fine-tuned ModernBERT embeddings with HNSW, or JetBrains embedding + reranker) catches near-duplicates the rules miss. The best-documented production numbers are Sentry's. Its v2 model cut overgrouping from 8% to 4% and raised the share of new issues prevented from 50% to 70%. Deterministic bucketing alone is known to split one bug across many buckets: WER saw up to 40% of reports affected.

### Cited Findings
**Microsoft Windows Error Reporting (WER)**
- WER's "ideal" bucketing would map all reports caused by one bug to one bucket. No such algorithm is known, so WER runs bucketing heuristics in two phases: client-side labeling, then server-side classification. Bucketing is "progressive": a report moves to a new bucket as more data, such as symbols, arrives. — [Glerum et al., SOSP 2009, "Debugging in the (Very) Large: Ten Years of Implementation and Experience"](https://ece.uwaterloo.ca/~wshang/soen691/2016winter/papers/sosp153-glerum-web.pdf); [MSR page](https://www.microsoft.com/en-us/research/?p=157688)
- Microsoft talk material describes about 500 bucketing heuristics, growing by about one per week. One bug can be split across several buckets for up to 40% of error reports, and several bugs can share one bucket for up to 4% (snippet-level, slide deck). — [Slides](https://api.sambuz.com/doc/ten-years-of-ppt-presentation-721048); [Bishop CSMR 2010 PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/jbishop-bishop_csmr_madrid_2010.pdf)

**ReBucket (Microsoft Research, ICSE 2012)**
- ReBucket clusters WER crash reports by call-stack similarity using a "Position Dependent Model" (PDM). Matching frames count for more when they are closer to the top frame and when their alignment offset is small. Clusters are then built hierarchically. Average F-measure was about 0.88 across 5 Microsoft products, and a product team judged 70% of 20 reviewed clusters "very meaningful". — [Dang et al., ICSE 2012 PDF](https://s-cube-xmu.github.io/uploads/ReBucket.pdf); [MSR page](https://www.microsoft.com/en-us/research/?p=260382)

**Mozilla Socorro signature generation (siggen)**
- Socorro builds a crash signature from the crashing thread's frames, then applies rule lists. Frames matching the "irrelevant" list (panic and crash handlers that run after the real cause) are skipped. Frames matching the "prefix" list are combined with the following frame, and generation stops at the first frame that matches neither list. Signatures are capped at 255 characters. Siggen is a standalone library that can be run from the CLI on crash IDs. — [Socorro signature generation docs](https://socorro.readthedocs.io/en/latest/signaturegeneration.html); [pipeline.rst](https://github.com/mozilla-services/socorro/blob/9519c744250467effc55a9f0897c241aa50d9c00/socorro/signature/pipeline.rst); [Bug 893585](https://bugzilla.mozilla.org/show_bug.cgi?id=893585)

**Sentry fingerprinting + AI grouping**
- Pipeline: lexical or structural fingerprinting runs first. If no existing issue matches, an ML model (Seer) compares the stack trace embedding against existing issues and merges the event when the two are semantically similar. — [Sentry blog, "Better, Faster, Less Wrong: Enhancing Issue Grouping" (Jun 12 2026)](https://blog.sentry.io/enhancing-issue-grouping)
- v1 (2024): embedding similarity lookup cut new issues by 40% with end-to-end latency under 100 ms (snippet-level). — [Sentry blog, "How Sentry decreased issue noise with AI"](https://blog.sentry.io/how-sentry-decreased-issue-noise-with-ai)
- v2 (live April 22, 2026), from the same blog post:
  - Model and training: base model `lightonai/modernbert-embed-large`, fine-tuned on hundreds of thousands of labeled stack-trace pairs (10 to 8,192 tokens) from consenting projects. Pairs near the v1 decision boundary were upweighted. Labels came from Claude Sonnet 4.5 (1,024-token thinking budget), checked against expert-labeled pairs and biased against overgrouping.
  - Embedding size: Matryoshka Representation Learning truncates embeddings from 768 to 64 dimensions, at a cost of about 2% accuracy and with 12x smaller pgvector storage.
  - Index: HNSW with m=16. Indexing is threshold-gated, so an embedding is stored only when no close match already exists. v2 is searched first, with fallback to v1, and the v2 index was backfilled via `training_mode=true`. The numeric similarity threshold is not disclosed.
  - Overgrouping: down from 8% to 4%. Some projects went from 30–60% to 2–15%.
  - New issues prevented: up from 50% to 70%.
  - Latency: HNSW lookup p50 went from 52 ms to 12 ms, insert p50 from 270 ms to 13 ms, and inference p50 from 45 ms to 16 ms. Overall v2 is 6x faster.
  - Model input: currently only the stack trace. Rollout took about 6 weeks with zero customer-reported regressions.
  — [Sentry blog](https://blog.sentry.io/enhancing-issue-grouping)
- Sentry states that grouping stack traces is "not the kind of task embeddings APIs are trained to handle", which is why it built its own model (snippet-level). — [Sentry blog](https://blog.sentry.io/enhancing-issue-grouping)
- AI grouping is enabled on all Sentry projects at no extra cost and layers semantic fingerprinting on top of rule-based grouping. — [Sentry changelog](https://sentry.io/changelog/ai-powered-issue-grouping-now-generally-available)

**Academic stack-trace similarity line (JetBrains et al.)**
- Lerch & Mezini (CSMR 2013) used only stack traces and their structure, with ML/IR, to detect duplicate bug reports in Eclipse. It performed as well as text-based state of the art without needing the report text. — [AMiner record](https://aminer.org/pub/5390bb1d20f70186a0f3e921/finding-duplicates-of-your-yet-unwritten-bug-report)
- Campbell et al. (2016) found that off-the-shelf IR (tf-idf) beat purpose-built crash-bucketing techniques on Ubuntu Apport data. — [PeerJ preprint, "The unreasonable effectiveness of traditional IR in crash report deduplication"](https://peerj.com/preprints/1705)
- TraceSim (Vasiliev et al., JetBrains, 2020) combines TF-IDF-style frame weights with Levenshtein (edit-distance alignment) between stacks, and learns its weights by ML. It is deployed in JetBrains' industrial triage system and beat baselines on a manually labeled JetBrains dataset. The extended version is in Empirical Software Engineering 27(2), 2022. — [arXiv 2009.12590](https://arxiv.org/pdf/2009.12590); [EMSE 2022 version PDF](https://publications.polymtl.ca/50496/1/2022_MullerRodrigues_TraceSim_alignment_method_computing_stack.pdf)
- S3M (Khvorov et al., MSR 2021) was the first deep-learning stack-trace similarity model: a siamese biLSTM encoder with 2 FC+ReLU layers as the classifier. It beat prior SOTA on NetBeans (open) and JetBrains (private) data, and the paper studies frame trimming. — [arXiv 2103.10526](https://arxiv.org/pdf/2103.10526); [MSR 2021 page](https://2021.msrconf.org/details/msr-2021-technical-papers/26/S3M-Siamese-Stack-Trace-Similarity-Measure)
- DeepLSH (Remil et al., ICSE 2024) uses a siamese network that learns locality-sensitive hashes for fast near-duplicate crash detection on Java stack traces. — [arXiv 2310.06703](https://arxiv.org/html/2310.06703v1); [ICSE 2024 page](https://conf.researchr.org/details/icse-2024/icse-2024-research-track/146/DeepLSH-Deep-Locality-Sensitive-Hash-Learning-for-Fast-and-Efficient-Near-Duplicate-)
- Shibaev et al. (JetBrains, SANER 2025) use a two-stage model. The first stage is an embedding model with BPE tokens and approximate nearest-neighbour retrieval. The second is a reranker that accounts for repeated frames. The paper evaluates the ability to create new categories (open-world) and releases the **SlowOps** dataset (IntelliJ-based products). The abstract says it outperforms other models on open-source datasets and SlowOps, but the abstract page gives no numbers. — [arXiv 2412.14802](https://arxiv.org/abs/2412.14802)
- dedupT (Al Mamun et al., 2025) adapts a pretrained LLM to stack traces and trains an FC head on its embeddings. An off-the-shelf pipeline (OpenAI text-embedding-3-small with a vector DB, then GPT-4o reranking) performed poorly (snippet-level). — [arXiv 2508.19449](https://arxiv.org/pdf/2508.19449)
- GPTrace (Herter et al., ICSE '26) embeds both stack traces and AddressSanitizer reports with an LLM and clusters the combined vectors. It was evaluated on more than 300,000 fuzzer crashing inputs across 14 targets and beat hand-crafted stack-trace methods and Igor (snippet-level). — [arXiv 2512.01609](https://arxiv.org/abs/2512.01609v1)

### Inferences
- These sources agree on the design for an agent error index. Use an exact normalized signature as the primary key, with O(1) lookup and explainable matches. Add a vector-similarity fallback behind a conservative threshold. Bias against overgrouping, because a wrong merge attaches the wrong fix, which is worse than a missed dedup. Sentry tuned its labels the same way for this reason.
- The Sentry and dedupT results both suggest generic text embeddings are weak for stack traces. Even a small fine-tune on in-domain pairs, or a frame-aware similarity like TraceSim/PDM, beats them. LLM-labeled pairs, validated against expert labels, are a practical way to create that training data.
- Frame position matters: top frames weigh more (ReBucket PDM, TraceSim). Rule lists for skipping irrelevant frames (Socorro's "irrelevant" and "prefix" lists) carry over directly to skipping test-harness, framework and assertion-library frames in test failures.
- Threshold-gated indexing (store an embedding only when it is novel) keeps the index compact. It also gives a natural "canonical exemplar" per cluster to attach fixes to.

### Gaps
- "DeepCrash" could not be located by the searches run here. Its existence, authors and venue are unverified, so it is not cited.
- Head-to-head accuracy numbers (e.g., RR@k, AUC) for TraceSim, S3M and Shibaev et al. were not extracted. Only the abstracts were read.
- Sentry's exact cosine threshold and its fingerprinting rule details were not verified in its docs during this session.

## Error message normalization and templating

### Takeaway
Normalization is a log-parsing problem. Mask the variable tokens (paths, line and column numbers, hex addresses, UUIDs and ids, timestamps, numbers) to get a stable template. Drain is the fast classical baseline. LLM parsers with a template cache (LILAC) are now the most accurate while staying near Drain's speed.

### Cited Findings
- The original Loghub benchmark (ICSE 2019, "Tools and Benchmarks for Automated Log Parsing") released logs from 16 systems and benchmarked parsers with Parsing Accuracy (PA). — [arXiv 1811.03509](https://arxiv.org/pdf/1811.03509)
- Loghub-2.0 (ISSTA 2024, "A Large-Scale Evaluation for Log Parsing Techniques: How Far Are We?") has 14 datasets averaging 3.6M lines each. It re-evaluated 15 parsers and added a metric that is less sensitive to imbalanced template distributions. — [arXiv 2308.10828](https://arxiv.org/pdf/2308.10828); [ISSTA page](https://2024.issta.org/details/issta-2024-papers/19/A-Large-Scale-Evaluation-for-Log-Parsing-Techniques-How-Far-Are-We-)
- Secondary summary (not verified against the paper): on Loghub-2.0, Drain has about 0.85 grouping accuracy (the best traditional parser) but only about 0.47 parsing accuracy. Only 7 of 15 parsers finished all datasets without crashing or timing out. — [wiki note](https://wiki.strrl.dev/GTD/references/lapp/03-loghub-2.0-issta24)
- Drain (He et al., ICWS 2017) has a reference implementation in LogPAI's `logparser`. — [GitHub logpai/logparser Drain](https://github.com/logpai/logparser/blob/master/logparser/Drain)
- LILAC (FSE 2024) combines an in-context-learning LLM parser with an adaptive parsing cache. The cache stores and refines templates so the LLM is queried only for unseen patterns. It beat SOTA by 66.8% on grouping F1 and 69.5% on template accuracy (relative improvements), with speed comparable to Drain. — [arXiv 2310.01796](https://arxiv.org/pdf/2310.01796)
- Newer LLM parsers (MicLog, and "Small is Beautiful"/EFParser, 2026) benchmark against LILAC on Loghub-2.0 (snippet-level). — [MicLog arXiv 2601.07005](https://arxiv.org/html/2601.07005v1); [arXiv 2601.22590](https://arxiv.org/html/2601.22590v1)

### Inferences
- LILAC's "cache of templates, with an LLM only on a cache miss" is structurally the same as an error index. It can be reused directly: regex masking first, then a template-tree lookup (Drain-style prefix tree keyed on token count and leading tokens), then an LLM to induce a template for novel errors, and finally storing that template.
- For compiler and test errors, a practical signature might be:
  - the tool, and the error code (e.g., `TS2345`, `E0382`, `javac cant.resolve`)
  - the masked message template
  - the top-N in-project frames, with frame position kept
  - the exception type
  This is an inference, not a published benchmark.
- Keep the masked variables, such as the symbol name and the file, as retrieval features and fix parameters. Do not discard them. DeepDelta's repairs, for example, depend on the specific missing symbol.

### Gaps
- No published benchmark was found that specifically evaluates normalization of compiler, test or CI messages (as opposed to system logs).

## Retrieval of fixes for errors (program repair, compiler/build repair, CI repair)

### Takeaway
Industry has shown that "error to historical human fix" retrieval and learning works at scale.
- Google DeepDelta repaired about 50% of unseen Java build errors.
- Google's DIDACT build-fix model gave a statistically significant ~2% productivity gain with no safety regressions.
- Meta's Getafix mines fix templates from past human fixes.

CI-level repair by LLM agents is still hard: the best CI-Repair-Bench result is 18.9%, and environment and dependency failures are the weakest category.

### Cited Findings
**Google**
- Google's compilation-error study: 51% of all compiler diagnostics are unresolved-symbol errors, the most costly category. Elsewhere, unresolved symbols are reported as 47% of total time spent fixing broken builds (snippet-level). — [Analyzing and Repairing Compilation Errors (ICSE 2019 poster)](https://research.google/pubs/pub47999/); [ICSE page](https://2019.icse-conferences.org/details/icse-2019-Posters/41/Analyzing-and-Repairing-Compilation-Errors)
- DeepDelta (Mesbah, Rice, Johnston, Glorioso, Aftandilian; FSE 2019):
  - Method: developer build-fix pairs are turned into AST diffs, encoded in a "Delta" DSL, and an NMT model maps compiler diagnostics plus context to Delta edits.
  - Scope: missing-symbol and method-signature-mismatch errors in Java.
  - Results: 19,314 of 38,788 unseen errors (~50%) correctly repaired, with the correct fix in the top 3 85–87% of the time.
  — [Google Research](https://research.google/pubs/deepdelta-learning-to-repair-compilation-errors/); [PDF](https://www.cl.cam.ac.uk/~acr31/pubs/mesbah-deepdelta.pdf)
- Graph2Diff (Google) applies a GNN to more than 500k real build errors and their resolutions (snippet-level). — [Fields Institute talk](https://www1.fields.utoronto.ca/talks/Learning-to-Fix-Programming-Errors-Graph2Diff-Neural-Networks)
- "Safely repairing broken builds with ML" (Google Research blog, Apr 23 2024, Johnston & Tang) — [blog](https://www.research.google/blog/safely-repairing-broken-builds-with-ml):
  - Training data: "resolution sessions", meaning chronological workspace snapshots and build logs from the first breakage to its resolution. DIDACT is fine-tuned on the error, the broken code state, and the broken-to-fixed diff. Scope started with Java and expanded to C++.
  - Safety: fixes are auto-formatted, then pass heuristic quality/safety filters (including vulnerability checks). The developer previews and accepts each fix, and it still goes through the normal build, tests, static and dynamic analysis, and code review.
  - Experiment: an 11-week 50/50 RCT. It showed ~2% lower active coding time per CL, ~2% lower shepherding time per CL and ~2% higher CL throughput, all statistically significant.
  - Uptake: about 34% of developers who hit a breakage in a month applied an ML fix.
  - Safety outcomes: no detectable difference in rollback rate or in new sanitizer failures.

**Meta**
- Getafix (Bader, Scott, Pradel, Chandra; OOPSLA 2019) uses hierarchical anti-unification to mine fix patterns from past human-written fixes. It is the first industrially deployed tool to learn fix patterns from human fixes. It was evaluated on 1,268 fixes across 6 static-analyzer bug categories, and it skips fault localization because the analyzer already pinpoints the location. — [arXiv 1902.06111](https://arxiv.org/abs/1902.06111); [Meta Engineering blog](https://engineering.fb.com/developer-tools/getafix-how-facebook-tools-learn-to-fix-bugs-automatically)
- SapFix generates end-to-end repairs (including Getafix templates) for crashes found by Sapienz and was deployed on 6 production systems. Its quantitative acceptance numbers were not extracted in this session. — [SapFix paper PDF](https://discovery-pp.ucl.ac.uk/10084761/1/SapFix-Automated-End-to-End-Repair-at-Scale-v2.pdf); [Meta AI blog](https://ai.meta.com/blog/finding-and-fixing-software-bugs-automatically-with-sapfix-and-sapienz/)

**Uber**
- Piranha uses AST-based refactoring to delete stale feature-flag code. It runs as an ongoing pipeline on Android and iOS, and has removed about 2,000 stale flags. Diffs are assigned to the flag's author for review and landing. — [Uber blog](https://www.uber.com/blog/piranha/)

**Retrieval-augmented and other repair**
- RAP-Gen (Wang et al., 2023) retrieves relevant fix patterns from a codebase of past bug-fix pairs using a hybrid lexical (BM25) plus semantic (DPR) retriever, with CodeT5 for both retrieval and generation. It repaired 15 more of 818 Defects4J bugs than prior SOTA, and was also evaluated on TFix (JS) and Code Refinement (snippet-level). — [arXiv 2309.06057 (paperswithcode)](https://astro.paperswithcode.com/paper/2309-06057)
- MACER (IIT Kanpur/NUS, 2020) splits compile-error repair into classifying the repair type and then applying it, using multi-label classifiers and rankers. It trained 2x faster than TRACER, was 2–4x faster at test time, and fixed 20 more popular errors exactly on about 4K student programs. — [arXiv 2005.14015](https://arxiv.org/pdf/2005.14015)

**CI / build-repair benchmarks for LLM agents**
- CI-Repair-Bench (arXiv 2604.27148, 2026) has 567 real GitHub Actions failure→success episodes in 12 error categories, and validates patches by re-running full CI. The best repair rate is 18.9%. Formatting and lint failures are easiest, and environment and dependency failures are hardest. — [arXiv 2604.27148](https://arxiv.org/pdf/2604.27148)
- Long Code Arena's CI-builds-repair task uses failed-then-successful GitHub Actions runs from the top 100 Python repos, and checks fixes by running CI. — [arXiv 2406.11612](https://arxiv.org/pdf/2406.11612)
- AndroidBuildBench (2025) has 1,019 reproducible Gradle build failures from 43 projects and proposes the GradleFixer agent. — [arXiv 2510.08640](https://arxiv.org/pdf/2510.08640v3)
- CI-Bench (ICSE 2026 demo) evaluates Agentless, SWE-Agent and AutoCodeRover on 100 BugSwarm CI failures. — [ICSE 2026 page](https://conf.researchr.org/details/icse-2026/icse-2026-demonstrations/9/CI-Bench-A-Framework-for-Evaluating-Large-Language-Model-Tools-on-CI-Failures)
- PhantomRun (2026) repairs compilation failures in embedded projects across GitHub Actions and GitLab CI, with up to 45% success. ComBench is a C/C++ compile-repair benchmark mined from CI histories. — [PhantomRun](https://www.alphaxiv.org/abs/2602.20284.md); [ComBench arXiv 2603.27333](https://arxiv.org/html/2603.27333)

### Inferences
- The Google "resolution session" (first broken snapshot → fixed snapshot in the same workspace) is the best template for harvesting error→fix pairs from coding-agent transcripts. An agent session that goes from a failing build or test to a passing one is exactly that record.
- Getafix-style anti-unification over several human or agent fixes for the same signature gives an abstract, parameterized fix template. A template is more robust to code drift than a cached literal diff.
- Error distributions are heavily skewed: about half of Java diagnostics at Google are unresolved symbols. A small set of signatures will therefore cover most lookups, so the index pays off quickly. CI-Repair-Bench, however, suggests the hard tail (env/dependency) is where the index adds the most value and is also least reliable.

### Gaps
- No public numbers were found for Meta's newer LLM-based build or CI auto-fix systems in this session.
- No public write-up was found from Google on "resolving code review comments" (it was not searched, for lack of budget).
- SapFix acceptance rates were not extracted.

## Staleness: commit-aware invalidation of cached fix knowledge

### Takeaway
No source was found that studies invalidating a cached error→fix mapping directly. The nearest analogues are build-dependency-based and ML-based test selection. Meta's predictive test selection catches more than 99.9% of faulty changes while running under a third of the tests that build dependencies would select. That suggests ranking relevance by learned signals rather than invalidating on every dependency edge.

### Cited Findings
- Meta Predictive Test Selection uses a gradient-boosted model over change and test features to pick tests. It catches more than 95% of individual test failures and more than 99.9% of faulty changes. It selects fewer than a third of the tests that build-dependency analysis would select and roughly halves test infrastructure cost. The blog's wording, "99.9% of all regressions… a third of all tests", is looser than the paper. — [arXiv 1810.05286](https://arxiv.org/pdf/1810.05286.pdf); [Meta Engineering blog](https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/)
- WER re-buckets progressively as more data (symbols) arrives. That is a precedent for an index entry's key being revised over time rather than fixed at insert. — [Glerum et al., SOSP 2009](https://ece.uwaterloo.ca/~wshang/soen691/2016winter/papers/sosp153-glerum-web.pdf)

### Inferences (not directly sourced)
- Store, with each fix:
  - the commit SHA
  - the touched files, with content hashes of the relevant spans or symbols
  - lockfile and toolchain versions (compiler, SDK, package versions)
  - the error's in-project frames
- Use these as validity predicates, similar to a Bazel-style content-addressed action key (inputs hash → output). Exact match on all inputs means "fresh". A change to only unrelated files means "probably still valid". A change to a touched file, symbol or dependency version means "demote, and re-verify on use".
- Rather than hard-invalidating, borrow Meta's approach and use a learned or heuristic relevance score. Features would include file overlap between the fix and current HEAD, dependency-version delta, the age of the fix in commits, and whether blamed lines were rewritten.
- Fix templates (Getafix-style) are less sensitive to staleness than literal diffs.

### Gaps
- No primary source was retrieved on Bazel or Buck action caching, or on test impact analysis tools beyond Meta's PTS, in this session.
- No paper was found that evaluates cache invalidation for program-repair or fix knowledge bases.

## Verification signals and outcome-based ranking

### Takeaway
The strongest production evidence uses multi-stage verification. Google's process is filters, then a human accept, then build and tests, then code review, then post-merge rollback and sanitizer monitoring. CI benchmarks validate a fix by actually re-running CI. Flaky tests are a major confound for "tests pass" signals: at Google, almost 16% of tests showed some flakiness.

### Cited Findings
- Google measured fix safety via CL rollback rate and new sanitizer failures (no detectable difference), and measured adoption via the share of developers applying fixes (~34%). — [Google Research blog](https://www.research.google/blog/safely-repairing-broken-builds-with-ml)
- CI-Repair-Bench and Long Code Arena treat "full CI pipeline passes after the patch" as the success criterion. — [arXiv 2604.27148](https://arxiv.org/pdf/2604.27148); [arXiv 2406.11612](https://arxiv.org/pdf/2406.11612)
- Google: "Almost 16% of our tests have some level of flakiness associated with them" (2016). — [Google Testing Blog, May 2016](https://testing.googleblog.com/2016/05/)
- Meta reportedly uses a Bayesian "Probabilistic Flakiness Score" per test. This comes from a secondary vendor source only and is unverified. — [trunk.io](https://trunk.io/learn/how-meta-tests-their-flaky-tests)
- Uber Piranha and Google build fixes both route the generated change to a human owner (the flag author or the developer) for acceptance, so merge or accept acts as a verification signal. — [Uber blog](https://www.uber.com/blog/piranha/); [Google blog](https://www.research.google/blog/safely-repairing-broken-builds-with-ml)

### Inferences
- Proposed outcome ladder for each (signature, fix) pair, roughly from weakest to strongest:
  1. Error no longer reproduces locally
  2. Targeted tests pass
  3. Full CI green
  4. PR merged
  5. Not reverted within N days
  6. No recurrence of the same signature
- Weight each level, and discount "tests pass" when the test has a high flakiness score.
- Ranking candidate fixes for a signature is a natural contextual-bandit or Thompson-sampling setting. Each fix's success probability is a Beta posterior updated by outcomes, which explores new fixes while exploiting proven ones. This is an inference: no source in this session reported a bandit-ranked fix index.
- Google's no-detectable-difference rollback metric is a useful guardrail KPI for an agent error index.

### Gaps
- No published bandit or online-learning ranking of fixes for build or CI errors was found in this session.

## Industry write-ups with impact numbers (summary)

### Takeaway
Quantified industry results exist for Google (DeepDelta ~50% repair and top-3 85–87%; DIDACT build fixes ~2% productivity with 34% uptake), Meta (Getafix deployment; PTS >99.9% faulty-change recall at under a third of the tests), Uber (Piranha, ~2,000 flags removed), Microsoft (WER ~500 heuristics; ReBucket F≈0.88) and Sentry (overgrouping 8%→4%, prevented issues 50%→70%).

### Cited Findings
- Google DeepDelta — [research.google](https://research.google/pubs/deepdelta-learning-to-repair-compilation-errors/)
- Google DIDACT build repair — [research.google blog](https://www.research.google/blog/safely-repairing-broken-builds-with-ml)
- Meta Getafix / SapFix — [arXiv 1902.06111](https://arxiv.org/abs/1902.06111); [SapFix PDF](https://discovery-pp.ucl.ac.uk/10084761/1/SapFix-Automated-End-to-End-Repair-at-Scale-v2.pdf)
- Meta Predictive Test Selection — [arXiv 1810.05286](https://arxiv.org/pdf/1810.05286.pdf)
- Uber Piranha — [Uber blog](https://www.uber.com/blog/piranha/)
- Microsoft WER / ReBucket — [SOSP 2009](https://ece.uwaterloo.ca/~wshang/soen691/2016winter/papers/sosp153-glerum-web.pdf); [ReBucket](https://s-cube-xmu.github.io/uploads/ReBucket.pdf)
- Sentry AI grouping v2 — [Sentry blog](https://blog.sentry.io/enhancing-issue-grouping)
- JetBrains: TraceSim (deployed in a triage system), S3M, and Shibaev et al. (SlowOps dataset) — [arXiv 2009.12590](https://arxiv.org/pdf/2009.12590); [arXiv 2412.14802](https://arxiv.org/abs/2412.14802)

### Inferences
- Open-source components for an implementation:
  - Socorro siggen (rule-list signature generation)
  - LogPAI logparser / Drain (templating)
  - LILAC (LLM templating with a cache)
  - Piranha (AST-based rewrite tooling)
  - SlowOps / NetBeans datasets (for evaluating stack-trace similarity)
  - modernbert-embed-large (Sentry's base embedding model)

### Gaps
- Microsoft and JetBrains have no public write-up found on ML-based fixing of build or CI errors.
- Recent (2025–2026) Meta and Google LLM CI-fix impact numbers were not found in the searches run here.
