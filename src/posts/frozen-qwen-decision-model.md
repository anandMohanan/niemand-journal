---
layout: ../layouts/Layout.astro
title: "Teaching Qwen to choose, and when not to"
date: "2026-10-10"
excerpt: "A frozen Qwen backbone, a small decision head, and a stubborn gap between finding a tool and knowing that none applies."
tag: "human"
author: "Anand Mohanan"
---

I wanted to see whether a small language model could become a useful tool router without generating a response token by token. Give it a request and some tool descriptions. Get back a decision.

The result was encouraging, with one fairly big catch. My frozen-Qwen model chose the right function in **89 out of 100** adapted BFCL cases. When none of the functions could handle the request, it recognized that only **42 times out of 100**.

That gap ended up being the most useful finding in the project.

## From JSON to a decision head

I started with Qwen3-1.7B in 4-bit, generating tool calls as JSON. QLoRA improved routing on my original 64-case challenge from **79.7% to 87.5%**, but some date arguments got worse. Choosing the right tool and producing a correct call were already proving to be different problems.

For the next experiment, I removed generation from the output path. Qwen stays completely frozen. A **1.32-million-parameter head** reads its hidden states and scores the supplied choices.

```text
Request + all tool schemas
            ↓
Frozen Qwen3-1.7B · 4-bit
            ↓
Contextual hidden states · 2048D
            ↓
Evidence routing
            ↓
Joint-schema Transformer
            ↓
One score per candidate → softmax
            ↓
Selected tool / no_tool
```

Evidence routing lets candidate representations attend to request/context tokens. The bidirectional Transformer then lets candidates interact before a shared scorer assigns each one a logit.

There’s no fixed eight-class output layer: supply a different number of textual candidates and you get a corresponding number of scores. That makes the interface dynamic. It doesn’t, by itself, prove the model understands unfamiliar tools.

I tried simpler pointer heads, fixed classifiers and independent encoders along the way. Some were useful controls; none solved both routing and order robustness. I built the scripts with Codex and ran the experiments myself.

## Trying unfamiliar tools

To get beyond my own templates, I tested the saved V2 model on adapted subsets of [ToolRet](https://github.com/mangopy/tool-retrieval-benchmark) and [BFCL](https://github.com/ShishirPatil/gorilla/tree/6ea57973c7a6097fd7c5915698c54c17c5b1b6c8/berkeley-function-call-leaderboard). No additional training or checkpoint selection on either dataset.

```chart
{
  "title": "Tool selection on adapted public benchmarks",
  "rows": [
    {"label": "ToolRet · unfamiliar tools", "value": 78.125, "display": "78.1%", "detail": "75 / 96 queries"},
    {"label": "BFCL · function selection", "value": 89, "display": "89.0%", "detail": "89 / 100 requests"}
  ],
  "note": "Canonical candidate order. Adapted routing evaluations, not official leaderboard scores."
}
```

ToolRet used four real candidates plus `no_tool`, rather than searching the full tool corpus. BFCL measured function-name selection, without argument scoring or execution. ToolRet’s unjudged distractors may also be relevant, so its labels need some caution.

Still, these results were enough to suggest the head had learned something useful beyond the eight capabilities in its training data.

## Finding a match is easier than rejecting every match

Then came the BFCL irrelevance cases.

```chart
{
  "title": "The abstention gap",
  "rows": [
    {"label": "Correct function selected", "value": 89, "display": "89%", "detail": "89 / 100 supported requests"},
    {"label": "Correctly chose no_tool", "value": 42, "display": "42%", "detail": "42 / 100 irrelevant requests", "tone": "warning"}
  ],
  "note": "Separate BFCL panels. The other 58 irrelevant requests were incorrectly routed to a function; no tools actually executed."
}
```

One saved request asked what “Hello” means in French. The available function was `calculate_svm`. The model selected it anyway.

Another asked about football assists, while the function returned a top goal scorer. That one at least had a topical connection, but it still couldn’t do the job.

A tool sounding related and a tool being sufficient are different things. The model hasn’t learned that distinction reliably yet.

## Moving the options changes the answer

Reversing or shuffling candidates also changed predictions more often than I’d like.

```chart
{
  "title": "Requests with a changed prediction across orders",
  "rows": [
    {"label": "ToolRet", "value": 38.5416666667, "display": "38.5%", "detail": "37 / 96 requests", "tone": "warning"},
    {"label": "BFCL selection", "value": 23, "display": "23.0%", "detail": "23 / 100 requests", "tone": "warning"},
    {"label": "BFCL abstention", "value": 29, "display": "29.0%", "detail": "29 / 100 requests", "tone": "warning"}
  ],
  "note": "Up to four tested orders; two-choice abstention cases have two. ToolRet accuracy ranged from 65.6% to 78.1% across orders."
}
```

The head has no candidate-position embeddings, but Qwen is causal. Moving a schema changes what precedes it, which changes its hidden states. A position-free head can still receive order-sensitive inputs.

I’d underestimated how much that distinction would matter.

## More targeted data didn’t automatically help

V3 kept the architecture fixed and emphasized read versus update, draft versus send, missing capabilities, and public versus private sources. I trained three predeclared seeds, selected checkpoints on validation loss, then compared them with V2 on the same newly frozen confirmation set.

```chart
{
  "title": "V2 versus capability-boundary supervision",
  "rows": [
    {"label": "V2", "value": 75, "display": "75.0%", "detail": "312 / 416 correct"},
    {"label": "V3 · seed 42", "value": 73.3173076923, "display": "73.3%", "detail": "305 / 416 correct"},
    {"label": "V3 · seed 7", "value": 68.75, "display": "68.8%", "detail": "286 / 416 correct"},
    {"label": "V3 · seed 123", "value": 72.8365384615, "display": "72.8%", "detail": "303 / 416 correct"}
  ],
  "note": "Same 416 confirmation cases for every model. Architecture unchanged. V2 has one seed; training data is templated and cases are correlated."
}
```

None beat V2. Some runs nearly eliminated training loss while doing worse on unseen examples. The seeds also behaved differently around abstention, so I couldn’t treat one good-looking metric as a stable improvement.

## Where I’m leaving it

The pipeline works: frozen Qwen, one joint forward, a small trainable head, and a decision without generating JSON. Useful transfer is there. Reliable abstention and candidate-order robustness aren’t.

I’m keeping the architecture fixed while I investigate those failures. Better labels, less repetitive data and stronger held-out tests seem more useful right now than adding another layer.

This is still a small experiment, not a production router. The public tests are adaptations, pretraining overlap is unknown, and these scores say nothing about argument accuracy. But I’ve learned considerably more from the awkward results than I would have from stopping at 89%.

*[Saved results and provenance](/images/frozen-qwen/results-snapshot.json). All figures above use existing outputs; no inference was rerun for this post.*
