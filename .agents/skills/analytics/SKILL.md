---
name: analytics
description: Pull site traffic numbers from Cloudflare Web Analytics
---

# Site Traffic Report

Pull traffic numbers from Cloudflare Web Analytics (RUM) across all Venture Crane sites.

## Arguments

Parse the argument:

- If empty, default to today + 7-day trend
- If a number (e.g., 30), show the last N days
- If a date (e.g., 2026-02-01), show that specific date

## Constants

- Account ID: `ab6cc9362f7e51ba9a610aec1fc3a833`
- API Token env var: `CLOUDFLARE_API_TOKEN`
- GraphQL endpoint: `https://api.cloudflare.com/client/v4/graphql`
- Analytics type: Account-level RUM (Web Analytics), NOT zone-level httpRequests

Zone-level analytics (`httpRequests1dGroups`) will fail with a permissions error. Always use account-level `rumPageloadEventsAdaptiveGroups`.

## Pre-flight

Check that `CLOUDFLARE_API_TOKEN` is set. If not, stop: "CLOUDFLARE_API_TOKEN is not in the environment. Launch with `crane vc` to inject secrets."

## Execution

### 1. Daily Trend (by site)

Query `rumPageloadEventsAdaptiveGroups` at the account level for the date range, grouped by `requestHost` and `date`:

```bash
curl -s 'https://api.cloudflare.com/client/v4/graphql' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "query": "{ viewer { accounts(filter: { accountTag: \"ab6cc9362f7e51ba9a610aec1fc3a833\" }) { rumPageloadEventsAdaptiveGroups(limit: 500, filter: { date_geq: \"START_DATE\", date_leq: \"END_DATE\" }, orderBy: [date_ASC]) { count dimensions { date requestHost } } } } }"
  }'
```

Replace START_DATE and END_DATE based on the parsed argument.

### 2. Top Pages, Referrers, Countries

Query for the most recent date in the range with limit 15 for pages, 10 for referrers and countries. Group by `requestHost`.

### 3. Format Output

Right-align numbers for scannability. Flag days with zero traffic as 0.

**Single site** - omit site header when only one host.

**Multiple sites** - group by host with clear separation. Include a Totals section at the bottom.

## Notes

- Read-only query. Does not modify anything.
- Cloudflare Web Analytics (RUM) data comes from a JavaScript beacon. Only sites with the beacon appear.
- Days missing from the API response had zero pageloads. Fill them in as 0.
- Data may lag by a few hours for the current day.
- The query is account-level. Any site under the Venture Crane Cloudflare account with the Web Analytics beacon will appear automatically.
