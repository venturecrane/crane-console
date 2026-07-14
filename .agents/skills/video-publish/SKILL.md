---
name: video-publish
description: Uploads a packaged explainer to the @venturecrane YouTube channel via Playwright and wires bidirectional cross-promotion with venturecrane.com.
version: 1.0.1
scope: enterprise
owner: agent-team
status: stable
---

# /video-publish - Upload to YouTube & Cross-Promote

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "video-publish")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Publishes a packaged explainer to the Venture Crane channel via Playwright and
wires the bidirectional cross-promotion with venturecrane.com. The human performs
the Google login/2FA; the agent drives Studio and opens the vc-web PR.

## Usage

```
/video-publish <slug>
```

## Arguments

`$ARGUMENTS` = the video **slug** (required). If empty, stop.

## Pre-flight

1. Load the house style: `crane_doc('vc', 'video-production.md')` (§"Publishing").
2. Verify the bundle exists: `videos/<slug>/out/explainer.mp4`,
   `explainer.srt`, `videos/<slug>/youtube.md`, and at least one
   `videos/<slug>/out/thumb-*.png`. If missing, stop — run `/video-package`.
3. **Confirm before publishing.** Uploading is an outward, public action. Unless
   the Captain has clearly authorized it this turn, ask which **visibility**
   (public / unlisted / private) and confirm go/no-go before any upload.

## Channel facts (don't rediscover)

- Channel **Venture Crane**, handle **@venturecrane**, id `UCGL5cJSNWxPKQ-XHaUE_vPg`.
- On the `smdurgan@smdurgan.com` Workspace account (not a Brand Account).
  `@venturecrane.com` is a domain alias — the human signs in with `@smdurgan.com`.

## Step 1 — Upload (Playwright MCP)

- **The human enters all credentials, 2FA, and phone codes — never the agent.**
- Stage any file to upload under `crane-console/.playwright-mcp/upload/` (Playwright
  sandboxes uploads to the repo tree); remove the copy afterward.
- In YouTube Studio: upload `explainer.mp4`; set title + description from
  `youtube.md` (chapters live in the description); set the thumbnail (primary =
  warm); upload `explainer.srt` as captions; set visibility.
- Re-snapshot before each click — refs go stale after DOM re-renders.

## Step 2 — Capture the result

Record the video id and `https://youtu.be/<id>` URL.

## Step 3 — Cross-promote (both directions)

- **Video → article:** already present as the bare article URL in the description.
- **Article → video:** branch `vc-web`, add a callout near the top of
  `src/content/articles/<slug>.md` linking the video (and bump `updatedDate`),
  then `gh pr create` + merge. Never push to `main`.

## Step 4 — Note the feature gotchas

- **Custom thumbnail** needs phone verification (Intermediate features) — already
  satisfied for this channel.
- **Clickable description links** need one-time channel verification **plus a 4–6h
  propagation delay**; links must be `https://`. A freshly verified channel shows
  the link as plain text until the window elapses — this is expected, not a bug.

## Step 5 — Record

Update the project memory (`project_vc_video_explainer`) with the new video's
slug, id, and URL so future sessions have the channel inventory.

## Notes

- Use the `gh` CLI for the vc-web PR (not MCP github\_\*).
- If the upload is interrupted, the draft persists in Studio — resume rather than
  re-upload.
