# Kid Expenses — Executive Summary

## What It Is

Kid Expenses is a co-parent expense tracking application that helps separated or divorced parents manage shared child-related costs with transparency and accountability.

## Stage

**Beta** — approaching beta readiness. Current weekly priority venture.

## Problem

Co-parents need a clear, shared record of child expenses to ensure fair cost-splitting. Existing solutions (spreadsheets, Venmo notes, texts) are ad-hoc, contentious, and lack structure.

## Solution

A purpose-built app for logging, categorizing, and settling shared child expenses between co-parents. Designed to reduce friction and provide a neutral, auditable record.

## Tech Stack

- **Frontend:** Next.js + Tailwind on Vercel
- **Backend:** Cloudflare Workers
- **Database:** D1 (SQLite)
- **Auth:** Clerk (Google OAuth enabled)
- **Secrets:** Infisical at path `/ke`

## Infrastructure

| Resource | Name                    |
| -------- | ----------------------- |
| Workers  | `ke-*` (prefix)         |
| Database | D1 instance             |
| Auth     | Clerk with Google OAuth |

## Repository

`venturecrane/ke-console`

## Key Dependencies

- `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Authentication
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
