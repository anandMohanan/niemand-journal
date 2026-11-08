---
layout: ../layouts/Layout.astro
title: "Editing a document model, and finding out what broke"
date: "2026-11-08"
excerpt: "A tiny attention-head edit, some promising scans, and an eight-form comparison that made the result much less convincing."
tag: "human"
author: "Anand Mohanan"
---

I wanted to spend the weekend trying something a little different with AI: use it to inspect another model and change the weights directly.

Document parsing seemed like a useful place to start. It's something I'm planning to work on anyway, and scanned business forms give you plenty of ways to fail. Dates, addresses, faint text, awkward layouts. You can look at the page and check whether the output makes sense.

The final result was mixed. On eight additional forms, the edit recovered more complete answer texts, but the average text score only moved from 11.9% to 17.0%. Some pages improved considerably. Others got worse, including one where the text score dropped from about 45% to zero.

So this is a write-up of the experiment, including the parts that didn't work.

## What I was trying to do

The starting point was [weight-space programming](https://rikiyat.github.io/blog/weight-space-programming/): using an AI model to reason about and modify the parameters of another network. The published experiments include a repair to a small Qwen model that gets stuck in repetitive reasoning.

I wanted to see whether something similar could help a document parser.

I used Codex to inspect the model, write the experiment scripts, propose edits, and examine the outputs. The actual edits were applied to local tensors. There was no gradient descent, optimizer, or fine-tuning run. There was still a lot of evaluation: generating outputs, measuring them, rejecting edits, and trying another hypothesis.

That distinction matters. This wasn't an AI looking at a few numbers and immediately understanding the entire model. It was an experimental loop, with plenty of failed guesses.

## The model and the forms

I used IBM's [Granite-Docling-258M](https://huggingface.co/ibm-granite/granite-docling-258M), a small vision-language model for document conversion. It reads a page image and produces DocTags, a format containing text, document elements, and location information.

The machine was an M4 MacBook Air with 16 GB of memory. These runs used CPU inference in float32 because MPS wasn't available in the execution environment. A Mac was enough to run the experiment, although long, repetitive outputs made it slow. Running multiple model processes together also put pressure on memory, so I switched to one heavy run at a time.

For the difficult pages, I used [FUNSD](https://guillaumejaume.github.io/FUNSD/), a dataset of scanned forms with annotated text and fields.

On the first four development forms, the untouched model recovered 12 of 55 annotated answer texts. Its average text F1 was just 7.6% with the full output allowance.

The failure was easy to spot. It would read a heading correctly, get partway down the page, then start producing things like:

```text
Address:
Address:
Address:
...
```

Sometimes the same text kept appearing with new coordinates. Eventually the coordinates would reach the bottom of the page and keep repeating too.

## A shorter output wasn't necessarily a better output

I tried changing the image-to-language connector, suppressing selected neurons, and removing directions associated with repetitive activity.

Most of these changes were ineffective or made the output worse.

One gentler neuron edit looked encouraging in a short run. But when I let it generate for longer, it continued repeating, and the score fell substantially. On one form, the short-run text F1 was around 35%. At full length it was only 13.9%.

That was still above the original full-length score of 8.5%, but it wasn't the improvement the shorter run had suggested.

The extra output was mostly noise. Any comparison had to use the same output allowance, and even then I needed to inspect whether the model had actually finished reading the document.

## The most promising weight edit

The strongest lead came from attention-head ablations. I tested all 270 attention heads individually, measuring whether disabling each one made the correct document text more likely. Then I tested promising candidates through normal generation.

This approach was informed by research on [repetition neurons](https://aclanthology.org/2025.naacl-short.41/) and [attention heads involved in visual hallucination](https://aclanthology.org/2026.acl-long.1941/). Our experiments were adaptations of those ideas, rather than replications of their results.

The best candidate was head 6 in layer 14, using zero-based numbering. Disabling it meant zeroing 64 columns in its attention output projection:

```python
model.model.text_model.layers[14].self_attn.o_proj.weight[:, 384:448] = 0
```

That changed 36,864 weight values, roughly 0.014% of the model's parameters. The original checkpoint was preserved, and each candidate started from the original weights.

On two development forms, with an identical 2,048-token output limit, the result looked promising:

| Measurement | Original | Edited |
| --- | ---: | ---: |
| Form A: text F1 | 19.2% | 53.6% |
| Form B: text F1 | 2.9% | 34.7% |
| Complete answer texts recovered | 1 / 32 | 5 / 32 |

But both edited outputs still hit the short limit and contained errors or repetition. And these were forms used during development. They were useful for finding an edit, but couldn't tell me whether it would work elsewhere.

Also, disabling a head and observing an improvement doesn't establish that the head is a dedicated “repetition circuit.” I had evidence that this intervention changed behavior, not a complete explanation of what the component does.

## There was an input-processing issue too

While checking the setup, I noticed that the default image processor stretched these tall pages into a 4×4 tile grid. I tested a 3×4 grid that better preserved their shape.

Changing the tiling helped some outputs even with the original weights. Combining it with the head edit made one development form finish naturally after 1,126 tokens, with a text F1 of 61.6% and four recovered answer texts.

The second form was less convincing. The combined setup recovered two answers, while the tiling change alone recovered four.

This was another reason to keep the comparisons separate. An improvement caused by changing the input processing shouldn't be presented as a weight-editing result.

## What happened on additional forms

I selected eight more forms from FUNSD's training split for independent validation. Both versions used the same 3×4 tiling, the same prompt, greedy generation, and an 8,192-token output allowance. The difference was the disabled attention head.

```chart
{
  "title": "Text recovery on eight additional forms",
  "rows": [
    {"label": "Original weights", "value": 11.9474418929, "display": "11.9%", "detail": "Mean text F1 · 8 forms"},
    {"label": "Edited weights", "value": 17.0268202465, "display": "17.0%", "detail": "Mean text F1 · 8 forms"}
  ],
  "note": "Same 3×4 tiling and 8,192-token allowance. Custom transcription measurement; four pages improved and four regressed."
}
```

Complete answer-text recovery rose from **16 to 30 out of 114**, or **14.0% to 26.3%**. That checks whether the answer appears anywhere in the transcript; it doesn't establish correct field association.

The edit improved text F1 on four pages and reduced it on four others. One page fell from 44.95% to zero. Another improved from about 1.4% to 43.4%.

The additional answer recovery was concentrated too: 11 of the net 14 extra recovered answers came from a single form.

A paired bootstrap interval for the average F1 change ran from roughly **−14 to +22 percentage points**. With only eight pages and this much variation, that doesn't establish a reliable positive effect.

The official 50-form test split remains untouched.

## What the benchmark actually measures

There are two important limits to these numbers.

Text F1 compares the recovered tokens with the annotated text, penalizing extra and repeated tokens. It doesn't check layout or reading order.

Answer-text recovery checks whether a complete annotated answer appears anywhere in the output. If the model reads a person's name but puts it under the wrong heading, it can still count as recovered.

These are custom transcription measurements using FUNSD annotations. They aren't the official FUNSD entity-and-relationship scores, and they don't establish that the parser can reliably extract structured fields.

## Where I landed

A very small weight edit changed the model's behavior substantially. On some pages it recovered text that the original model missed. On another, it destroyed a relatively decent output.

I wouldn't use this edited model in a document-processing pipeline based on these results. The regressions are too large, and the validation set is too small.

The next thing I'd investigate is why the same edit helps one page and breaks another. Does it depend on layout, text density, scan quality, or something about how the model uses earlier output? I don't have that answer yet.

For now, I have a reproducible intervention and a set of failures to investigate. The early examples were more exciting than the final benchmark. I'm glad I ran the latter.

*[Saved validation results](/images/document-weight-edit/results-snapshot.json). Figures use the saved experiment outputs; no inference was rerun for this post.*
