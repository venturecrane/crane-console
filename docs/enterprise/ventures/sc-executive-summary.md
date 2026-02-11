# Silicon Crane — Executive Summary

## What It Is

Silicon Crane is a validation-as-a-service platform for client engagements. It applies the Venture Crane methodology to external projects, offering structured business validation as a service.

## Stage

**Design → Prototype** — migrating to shared infrastructure.

## Problem

Early-stage founders and teams waste time and money building products before validating the underlying business hypothesis. Professional validation services are expensive and slow.

## Solution

A structured validation framework delivered as a service — combining Venture Crane's Business Validation Machine methodology with hands-on engagement to help clients validate or kill ideas quickly.

## Tech Stack

- **Frontend:** Next.js + Tailwind on Vercel
- **Backend:** Cloudflare Workers
- **Database:** D1 (SQLite)
- **Email:** Resend API
- **Secrets:** Infisical at path `/sc`

## Infrastructure

| Resource       | Name             |
| -------------- | ---------------- |
| Worker         | `sc-api`         |
| Database       | `sc-db` (D1)     |
| Object Storage | `sc-assets` (R2) |

## Repository

`venturecrane/sc-console`

## Key Dependencies

- `RESEND_API_KEY` — Email sending
