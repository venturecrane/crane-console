# /video-package - Caption, Chapter & Package an Explainer

Turns a final render into the publish bundle: SRT captions, YouTube chapters, a
filled-in `youtube.md` (title / description / tags), and thumbnail candidates.
Deterministic — the exact bundle `/video-publish` consumes.

## Usage

```
/video-package <slug>
```

## Arguments

`$ARGUMENTS` = the video **slug** (required). If empty, stop:
"Usage: `/video-package <slug>`."

## Pre-flight

1. `cd ~/dev/vc-video`. Load the house style: `crane_doc('vc', 'video-production.md')`
   (§"Captions & chapters" and §"Packaging").
2. Verify `videos/<slug>/out/explainer.mp4` and `public/<slug>/vo/roger.align.json`
   exist. If the final render is missing, stop — run `/video-build` first.

## Step 1 — Captions

```bash
node scripts/captions.mjs <slug>
```

Writes `videos/<slug>/out/explainer.srt` (Whisper segments, offset by HEAD_FRAMES,
≤9 words/cue). Spot-check the first and last cue line up with the audio.

## Step 2 — Chapters

From `videos/<slug>/timing.ts` `BEATS`, convert each `start` frame to `mm:ss`
(`floor(start/30)`), label each beat, and ensure the first chapter is `0:00`
(YouTube requires it). Produce lines like `0:00 The cold-start problem`.

## Step 3 — `youtube.md`

Write `videos/<slug>/youtube.md` with:

- **Title** — a hook, not a label (the curiosity gap or the payoff).
- **Description** — 2–3 lines of context, then the chapter list, then the article
  link as a **bare `https://venturecrane.com/articles/<slug>/` URL on its own
  line**, then the channel tagline.
- **Tags** — topical keywords.

## Step 4 — Thumbnail candidates

Render 2–3 stills at strong frames (the **warm payoff frame** is the proven
primary; a clean architecture frame is a good alternate):

```bash
remotion still src/index.ts <slug> videos/<slug>/out/thumb-<label>.png --frame=<F>
```

## Output

List the bundle for `/video-publish`:

```
videos/<slug>/out/explainer.mp4   — video
videos/<slug>/out/explainer.srt   — captions
videos/<slug>/youtube.md          — title / description / chapters / tags
videos/<slug>/out/thumb-*.png     — thumbnail candidates (primary: warm)
```

## Notes

- The description article link must be bare `https://` on its own line — YouTube
  only linkifies https, and only once the channel is verified (see publish
  gotchas in the house-style doc).
- Captions and chapters are reproducible; never hand-edit the SRT — fix the
  alignment and re-run.
