# /video-build - Scaffold, Align & Render an Explainer

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "video-build")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Takes an approved script + an approved voice take and produces a rendered
explainer: scaffolds `videos/<slug>/`, locks beat timing with Whisper forced
alignment, guides scene authoring against the house style, and renders. The
highest-leverage video skill.

## Usage

```
/video-build <slug>
```

## Arguments

`$ARGUMENTS` = the video **slug** (required; matches `videos/<slug>/script.md`).
If empty, stop: "Usage: `/video-build <slug>` — run `/video-script` first."

## Pre-flight

1. `cd ~/dev/vc-video`. If not a git repo / wrong dir, stop.
2. Load the house style: `crane_doc('vc', 'video-production.md')` — Composition
   spec, Motion & legibility rules, and Narration & sync govern this skill.
3. Verify inputs:
   - `videos/<slug>/script.md` exists (from `/video-script`).
   - The **approved voice take** is at `public/<slug>/vo/narration_*.mp3` and is
     read-only (`chmod 444`). If absent, stop — VO is the fixed input (see VO gap).
4. If `videos/<slug>/` already has scenes, treat as a re-run: align + author, do
   not re-scaffold over authored work.

## Step 1 — Scaffold from the template

Use `videos/agent-context/` as the structural template. Create for `<slug>`:

- `timing.ts` — `FPS=30`, `HEAD_FRAMES=12`, `TAIL_FRAMES=26`, `AUDIO_SEC` (from
  the mp3), `TOTAL_FRAMES = ceil(AUDIO_SEC*30)+HEAD+TAIL`, and a `BEATS` array
  with one entry per script beat (`start` filled in Step 2).
- `Explainer.tsx` — one `<Audio src={staticFile("<slug>/vo/...")}/>` inside
  `<Sequence from={HEAD_FRAMES}>`, then a `<Sequence>` per beat mapping to scenes.
- `layout.ts` + `Diagram.tsx` — diagram coordinates for this video (adapt or
  replace the agent-context diagram to fit the new content).
- `scenes/<Beat>.tsx` — one stub per beat.

Register the composition in `src/Root.tsx` with **id === `<slug>`** (and add it to
the per-video section). Use **relative imports** (`../../src/...`, `../../../src/...`).

## Step 2 — Lock beat timing (forced alignment)

Set the beat anchors (from `script.md`) in `scripts/whisper-align.mjs`'s `ANCHORS`,
then run:

```bash
infisical run --env prod --path /vc -- node scripts/whisper-align.mjs <slug>
```

(`OPENAI_API_KEY` lives at `/vc` prod; the audio is never modified.) Paste the
printed 30fps boundaries into `timing.ts` `BEATS`. **Never eyeball boundaries** —
proportional guesses drift up to ~1s/beat.

## Step 3 — Author the scenes

Author each scene against its real boundary and the script's `visual` note:

- **Legibility floor:** no functional text below ~24px at 1080p; stagger labels
  in time rather than shrink. Verify by scaling a still to 360px wide.
- Use the shared `ENTRANCE` easing; springs settle (no bouncing UI).
- **Cool → warm:** structure is `accent` while explaining, shifts to `gold` for
  the payoff; the gold `DataPulse` is the one hero motion.
- Beats sharing a diagram render the settled `StaticDiagram` for seamless cuts.
- One narration track only — no overlapping audio.

## Step 4 — Draft render & check sync

```bash
npm run render -- src/index.ts <slug> videos/<slug>/out/draft.mp4 --gl=angle --scale=0.5
```

Scrub in `npm run studio` (or sample frames) and confirm each beat's content lands
on its narration line. Fix timing/scene issues; re-draft until clean.

## Step 5 — Final render

```bash
remotion render src/index.ts <slug> videos/<slug>/out/explainer.mp4 --gl=angle --crf 16
```

## Verification

- `npx remotion compositions src/index.ts` lists `<slug>` and bundles with no
  import errors.
- Rendered duration ≈ `AUDIO_SEC + (HEAD+TAIL)/30`.
- Legibility: a 360px-wide still — every functional label readable.
- Every color/font traces to `src/theme.ts`; the approved mp3 is untouched.

## Notes

- Hand off to `/video-package` once the final render passes taste review.
- VO generation is blocked on `ELEVENLABS_API_KEY` (not in vault) — this skill
  assumes the take already exists and is approved.
