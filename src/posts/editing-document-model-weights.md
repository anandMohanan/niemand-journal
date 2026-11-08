---
layout: ../layouts/Layout.astro
title: "Editing a document model, and finding out what broke"
date: "2026-11-08"
excerpt: "I switched off one attention head in a document model. The first results looked good. Eight more forms made things a lot less clear."
tag: "human"
author: "Anand Mohanan"
---

I spent part of the weekend trying something a little different: getting AI to look inside another model and change its weights.

I picked document parsing because I'm planning to work on it anyway. Scanned forms also make it pretty easy to see when something has gone wrong. You have the page in front of you. Did it read the address, or did it just write “Address” twenty times?

The first few results looked good. Then I tried more forms.

On eight additional pages, the average text F1 went from 11.9% to 17.0%. Four pages got better and four got worse. One went from about 45% to zero. So, a bit more complicated than the early examples made it look.

## How I tried it

I'd been reading about [weight-space programming](https://rikiyat.github.io/blog/weight-space-programming/), where an AI model reasons about another network and edits its parameters. One of the published experiments fixes a small Qwen model that gets stuck repeating itself.

I wanted to try something similar with a document parser.

I used Codex to inspect the model, write scripts, suggest edits, and go through the outputs with me. The scripts changed the weight tensors directly. No fine-tuning, optimizer, or gradient descent.

There was still plenty of trial and error. Make an edit, run the model, look at what it produced, throw the edit away, try something else. Codex didn't just look at the weights and know what to fix.

## The model kept repeating itself

I used IBM's [Granite-Docling-258M](https://huggingface.co/ibm-granite/granite-docling-258M). It's a small vision-language model that turns page images into DocTags: text, document elements, and their positions on the page.

For the tricky pages, I used [FUNSD](https://guillaumejaume.github.io/FUNSD/), a dataset of scanned forms with annotated text and fields.

On the first four forms I used to try edits, the original model recovered 12 of 55 annotated answer texts. With the full output allowance, its average text F1 was 7.6%.

You could see the problem in the output. It would read a heading, get partway down the page, then do this:

```text
Address:
Address:
Address:
...
```

Sometimes it kept writing the same text with different coordinates. Then the coordinates would reach the bottom of the page and start repeating too.

## The first few edits

I tried changing the image-to-language connector, suppressing selected neurons, and removing directions associated with repetitive activity. Most of it did nothing useful or made things worse.

One small neuron edit looked promising when I stopped the output early. On one form, text F1 was around 35%. But when I let it keep going, it started repeating again and ended up at 13.9%.

That was still better than the original full-length score of 8.5%. Just nowhere near what the short run had suggested.

I had to compare runs with the same output allowance. Otherwise, stopping before the repetition kicked in could make an edit look much better than it was. Even with the same limit, I still needed to check whether it had actually finished reading the page.

## One attention head looked promising

Next I tried disabling attention heads, one at a time. There were 270 of them. I checked whether each edit made the correct document text more likely, then ran normal generation for the promising ones.

The papers on [repetition neurons](https://aclanthology.org/2025.naacl-short.41/) and [attention heads involved in visual hallucination](https://aclanthology.org/2026.acl-long.1941/) gave me things to try. I was adapting their ideas, not reproducing those experiments.

The best candidate was head 6 in layer 14, counting from zero. Disabling it meant zeroing 64 columns in the attention output projection:

```python
model.model.text_model.layers[14].self_attn.o_proj.weight[:, 384:448] = 0
```

That's 36,864 weight values, roughly 0.014% of the model. I kept the original checkpoint and started each candidate from those original weights.

On two of the forms I'd been working with, using the same 2,048-token limit:

| Measurement | Original | Edited |
| --- | ---: | ---: |
| Form A: text F1 | 19.2% | 53.6% |
| Form B: text F1 | 2.9% | 34.7% |
| Complete answer texts recovered | 1 / 32 | 5 / 32 |

This was the point where it started looking interesting. But both edited outputs still hit the limit and still had errors or repetition. I'd also used these forms to find the edit, so they couldn't tell me how it would do on other pages.

And I couldn't call this a “repetition head” just because turning it off helped. I knew the edit changed the output. I didn't know exactly what that head was doing.

## The input mattered too

While checking the setup, I noticed the default image processor was stretching the tall pages into a 4×4 tile grid. I tried a 3×4 grid to keep their shape closer to the original.

That helped some outputs without changing any weights. With the new tiling and the head edit together, one form finished on its own after 1,126 tokens. It reached 61.6% text F1 and recovered four answer texts.

On the second form, though, the combined setup recovered two answers. Changing the tiling alone recovered four.

So I needed to keep those changes separate. If better input processing was doing the work, I couldn't give the weight edit credit for it.

## Then I tried eight more forms

I picked eight more forms from FUNSD's training split to check the edit. Both versions got the same 3×4 tiling, prompt, greedy generation, and 8,192-token allowance. The only difference was the disabled head.

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

Complete answer-text recovery went from **16 to 30 out of 114**, or **14.0% to 26.3%**. That means the answer appeared somewhere in the transcript. It doesn't mean the model put it under the right field.

```chart
{
  "type": "line",
  "title": "The average hides very different pages",
  "max": 50,
  "labels": [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8"
  ],
  "series": [
    {
      "label": "Original weights",
      "values": [
        5.185185185185185,
        6.424581005586592,
        5.919661733615221,
        1.444043321299639,
        44.95114006514658,
        5.430932703659976,
        15.734480639213277,
        10.489510489510492
      ]
    },
    {
      "label": "Edited weights",
      "values": [
        0.6030150753768844,
        33.53658536585366,
        7.75716694772344,
        43.36283185840708,
        0,
        34.83870967741935,
        11.195928753180661,
        4.920324294101202
      ]
    }
  ],
  "note": "Text F1 (%) for each of the eight validation forms. Form numbers follow the fixed evaluation order, not time. Solid: original. Dashed: edited."
}
```

Four pages improved and four got worse. One dropped from 44.95% to zero. Another went from about 1.4% to 43.4%.

```chart
{
  "type": "diverging",
  "title": "Four improvements. Four regressions.",
  "max": 50,
  "rows": [
    {
      "label": "1",
      "value": -4.582170109808301
    },
    {
      "label": "2",
      "value": 27.11200436026707
    },
    {
      "label": "3",
      "value": 1.837505214108219
    },
    {
      "label": "4",
      "value": 41.918788537107446
    },
    {
      "label": "5",
      "value": -44.95114006514658
    },
    {
      "label": "6",
      "value": 29.407776973759383
    },
    {
      "label": "7",
      "value": -4.538551886032616
    },
    {
      "label": "8",
      "value": -5.569186195409289
    }
  ],
  "note": "Change in text F1, in percentage points. Left of zero is worse; right is better. The largest regression was \u221245.0 pp on form 5."
}
```

The extra answers were uneven too. Of the net 14 extra answers recovered, 11 came from one form.

The paired bootstrap interval for the average F1 change was roughly **−14 to +22 percentage points**. That's a wide range. Eight pages with results this mixed weren't enough for me to say the edit reliably helped.

I haven't touched the official 50-form test split.

## A note on the scores

Text F1 compares the recovered tokens with the annotated text. Extra words and repeated text hurt the score. It doesn't check layout or reading order.

Answer-text recovery is simpler: does the complete annotated answer appear anywhere in the output? A name under the wrong heading can still count.

These are my transcription checks using FUNSD's annotations, not the official FUNSD entity-and-relationship scores. Better numbers here wouldn't, on their own, mean I'd built a reliable field extractor.

## Where I left it

Turning off a tiny part of the model made a big difference. Sometimes it read text it had missed before. Sometimes it broke a page it had been doing reasonably well on.

I wouldn't put this edited model into a document pipeline yet. The bad cases are too bad, and I've only checked eight additional forms.

What I want to figure out next is why the same edit helps one page and ruins another. Layout? Text density? Scan quality? Something about the model getting stuck on its earlier output? I don't know yet.

The first examples were more exciting than the results on the extra forms. I'm glad I checked those before calling it a fix.
