# Durgan Field Guide — Executive Summary

## What It Is

Durgan Field Guide is an auction intelligence platform that helps buyers research, track, and make informed decisions at auctions.

## Stage

**Prototype → Market Test** — launched product, actively in market validation.

## Problem

Auction buyers lack consolidated, structured intelligence about items, pricing history, and market trends. Research is fragmented across multiple sources and requires significant manual effort.

## Solution

An intelligence platform that aggregates auction data, provides item analysis, and delivers actionable insights to auction buyers. The system uses automated scouts for data collection and analysts for pattern recognition.

## Tech Stack

- **Frontend:** Next.js + Tailwind on Vercel
- **Backend:** Cloudflare Workers
- **Database:** D1 (SQLite)
- **Auth:** NextAuth.js
- **Secrets:** Infisical at path `/dfg`

## Infrastructure

| Resource       | Name                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| Workers        | `dfg-api` (main), `dfg-scout` (data collection), `dfg-analyst` (analysis) |
| Database       | `dfg-scout-db` (D1)                                                       |
| Object Storage | `dfg-evidence` (R2)                                                       |
| Cache          | `SCOUT_KV` (KV namespace)                                                 |

## Repository

`venturecrane/dfg-console`

## Key Dependencies

- `NEXTAUTH_SECRET` / `AUTH_SECRET` — Authentication
- `OPS_TOKEN` — Operations API access

## Architecture Notes

Three-worker architecture separates concerns:

- **dfg-api** — serves the frontend and handles user requests
- **dfg-scout** — automated data collection from auction sources
- **dfg-analyst** — processes collected data into actionable intelligence
