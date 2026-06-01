# Venture Crane Video Production — House Style

> Canonical conventions for producing motion-graphics explainers for the Venture
> Crane YouTube channel. The skills (`/video-script`, `/video-build`,
> `/video-package`, `/video-publish`) and any agent doing video work read from
> this doc. The repo `~/dev/vc-video` (private `venturecrane/vc-video`) is the
> implementation; this is the source of truth for _how_ and _why_.
> Last updated: 2026-06-01

## What this is

Short (~60–120s) narrated **engineering explainers** — the same voice as
venturecrane.com articles, rendered as motion graphics. Confident, technical,
transparent; agent-authored work shown as agent work. The visual language is the
"blueprint" system: chrome background, line-drawn boxes, a gold data pulse
tracing a spine. Not stock footage, not talking heads, not corporate.

First video (reference exemplar): the **Context Management System** explainer,
`videos/agent-context/`, live at https://youtu.be/2D3PhQdEINs.

## The pipeline (5 stages → 4 skills)

| Stage   | Owner                | In → Out                                                                             |
| ------- | -------------------- | ------------------------------------------------------------------------------------ |
| Script  | `/video-script`      | topic or vc-web article → 6-beat house-format script + per-beat visual notes         |
| Voice   | (manual; see VO gap) | script → narration mp3 (approved take, read-only)                                    |
| Build   | `/video-build`       | script + VO → scaffolded `videos/<slug>/`, Whisper-aligned `timing.ts`, draft render |
| Package | `/video-package`     | final mp4 → SRT + chapters + `youtube.md` + thumbnail candidates                     |
| Publish | `/video-publish`     | bundle → YouTube upload + bidirectional cross-promo PR in vc-web                     |

## Repo layout & conventions

```
src/                       # shared across all videos
  Root.tsx                 # registry: shared comps + one entry per video
  theme.ts                 # brand tokens — single source of color/type
  components/blueprint.tsx # BlueprintBox · Connector · DataPulse · ENTRANCE
  components/geometry.ts   # Pt · polyPath · pointAt
  Avatar.tsx Banner.tsx    # channel art (per channel, not per video)
videos/<slug>/             # one per video
  Explainer.tsx timing.ts layout.ts Diagram.tsx scenes/*.tsx youtube.md
public/<slug>/vo/          # narration mp3 + roger.align.json
scripts/*.mjs              # shared, slug-parameterized pipeline tooling
```

- **Composition id === directory slug** (`agent-context`, plus `<slug>-hero` for
  any reference cut). Channel art (`Avatar`/`Banner`) and `SmokeTest` are the
  only non-slug ids.
- **Relative imports only** — Remotion
  [recommends against](https://www.remotion.dev/docs/typescript-aliases) tsconfig
  path aliases (they can shadow the `remotion` import). Video files reach shared
  code via `../../src/...` (video root) or `../../../src/...` (scenes/).
- **Assets** via `staticFile("<slug>/vo/…")`.
- **Scripts take the slug as argv:** `node scripts/whisper-align.mjs <slug>`
  (default `agent-context`). Renders → `videos/<slug>/out/` (gitignored).

## Brand tokens (mirror of the web design system)

All color/type traces to `src/theme.ts`, which mirrors the site
(`crane_doc('vc', 'design-spec.md')`). Never introduce a color outside this set.

| Token      | Hex       | Role on screen                                  |
| ---------- | --------- | ----------------------------------------------- |
| chrome     | `#1a1a2e` | background (every scene)                        |
| code-bg    | `#14142a` | inset panels (Workers/D1 container)             |
| surface    | `#242438` | raised cards                                    |
| border     | `#2e2e4a` | inactive box strokes                            |
| text       | `#e8e8f0` | primary labels, captions                        |
| text-muted | `#a0a0b8` | sublabels, eyebrows, secondary                  |
| accent     | `#818cf8` | active connectors/structure (cool state)        |
| gold       | `#dbb05c` | the data pulse, "warm"/payoff state, brand mark |
| gold-muted | `#a08040` | warm structure strokes                          |

**Type:** `fontBody` (system sans) for captions/taglines; `fontMono`
(ui-monospace stack) for labels, eyebrows, terminal, code. No external fonts.

## Composition spec

- **1920×1080, 30fps.** (SVG tweens look identical to 60fps on YouTube; 30fps
  halves render + tuning cost. Do not author at 60.)
- **HEAD_FRAMES = 12** — a pre-VO breath; the `<Audio>` is delayed by this via a
  `<Sequence from={HEAD_FRAMES}>`, and captions add the same offset.
- **TAIL_FRAMES = 26** — end-card hold after the last word.
- **TOTAL** = `ceil(audioSeconds × 30) + HEAD + TAIL`. (agent-context: 2415.)
- One `<Audio>` (the approved take) spans the whole piece; each beat is a
  `<Sequence>` that fades its content in from the shared chrome background.

## Narrative shape: 6 beats

Explainers follow a problem→system→payoff arc. The reference script's beats —
reuse the _shape_, not the words:

1. **Cold open / problem** — the pain, stated plainly.
2. **Reveal** — "so we built X"; the architecture assembles.
3. **Mechanism A** — the entry point / one command.
4. **Mechanism B** — the lifecycle / what happens under the hood.
5. **Mechanism C** — the non-obvious benefit (e.g. coordination).
6. **Payoff** — the one-line result + brand end card.

Keep beats to one idea each. Spoken numerals/acronyms get spelled for TTS
("M C P", "D one", "A.P.I."). Beats are located in the audio by their first
1–2 words (anchors) during alignment.

## Motion & legibility rules

- **Legibility floor: no functional text below ~24px at 1080p.** Terminal,
  checklist, and chip labels especially. If labels won't fit at 24px, stagger
  them in time — don't shrink. Verify by scaling a still to 360px wide; every
  label must still read.
- **Easing:** use the shared `ENTRANCE` curve for appears; springs settle, no
  bouncing UI.
- **Continuity:** beats that show the same diagram render the shared
  `StaticDiagram` (settled, `PAST` frames) so hard cuts between them don't jump.
- **No overlapping audio.** One narration track, full stop. Music/SFX only after
  VO sync is approved, and ducked under VO.
- **Cool → warm.** Structure is `accent` while explaining, shifts to `gold` for
  the payoff. The gold pulse is the one "hero" motion.

## Narration & sync

- **Voice take is the fixed asset.** Once approved, the mp3 is read-only; the
  pipeline never regenerates or trims it. Keep audition takes under
  `public/<slug>/vo/audition/`.
- **Forced alignment, not estimates.** Beat boundaries come from real word
  timings — proportional guesses drift up to ~1s/beat. Primary path is OpenAI
  Whisper:
  ```bash
  infisical run --env prod --path /vc -- node scripts/whisper-align.mjs <slug>
  ```
  (`whisper-1`, `response_format=verbose_json`, word+segment granularities;
  `OPENAI_API_KEY` lives at `/vc` prod). Writes `public/<slug>/vo/roger.align.json`
  and prints 30fps beat boundaries to paste into `timing.ts`.
- **⚠️ VO generation gap.** `ELEVENLABS_API_KEY` is **not in the vault**
  (`/vc`, `/`, `/ss`, `/shared` all checked). `scripts/tts.mjs` /
  `scripts/audition.mjs` / `scripts/align.mjs` need it. Until a key is dropped in
  via `crane_secret_set` (or we standardize on another TTS provider), VO
  generation is a manual/blocked step — don't assume `/video-script` can hand
  straight to an unattended voice render. Alignment (Whisper) is unaffected.

## Captions & chapters

- **SRT:** `node scripts/captions.mjs <slug>` → `videos/<slug>/out/explainer.srt`.
  Built from the Whisper segments, offset by HEAD_FRAMES. Prefer punctuated
  segments; ≤9 words/cue; break on >0.7s pause.
- **Chapters:** derived from beat start times (mm:ss), first chapter at 0:00,
  written into `youtube.md`.

## Packaging — `videos/<slug>/youtube.md`

Holds: **title** (hook, not a label), **description** (2–3 lines + chapters +
article link + channel tagline), **chapters** (one `0:00 Label` per line),
**tags**. The description's article link must be a bare `https://…` URL on its
own line (YouTube only linkifies https and only once the channel is verified —
see publish gotchas).

## Publishing

**Channel facts**

- Name **Venture Crane**, handle **@venturecrane**, channel id
  `UCGL5cJSNWxPKQ-XHaUE_vPg`.
- Lives on the **`smdurgan@smdurgan.com`** Google Workspace account — _not_ a
  Brand Account.
- **Workspace alias gotcha:** `@venturecrane.com` is a domain alias, not a login
  identity. Sign in with the primary `@smdurgan.com`. Channel name/handle are
  independent of the login email.

**Upload (Playwright MCP, human does Google login/2FA)**

- The human enters all credentials/2FA/phone codes — never the agent.
- Playwright file uploads are **sandboxed to the crane-console tree**: stage a
  copy under `crane-console/.playwright-mcp/upload/` and clean it up after.
- Set: title, description, thumbnail, chapters (in description), captions (.srt),
  visibility. Refs go stale after DOM re-renders — re-snapshot before clicking.

**Feature gates**

- **Custom thumbnails** require **phone verification** (Intermediate features) —
  already done for this channel.
- **Clickable description links** require one-time channel verification **plus a
  4–6 hour propagation delay**, and the link must start with `https://`. A
  freshly verified channel shows links as plain text until the window elapses.

**Cross-promotion (both directions)**

- Article → video: a callout near the top of the vc-web article linking the
  video (a PR to `vc-web`).
- Video → article: the bare `https://venturecrane.com/articles/<slug>/` URL in
  the description.

## Asset protection

- Approved VO mp3 and any kill-gate reference render are kept read-only
  (`chmod 444`); render to a distinct name so they can't be clobbered.
- Renders are reproducible and **gitignored** — never commit `out/` artifacts.
- The narration audio is never modified by any pipeline step.
