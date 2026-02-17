# /analytics - Site Traffic Report

Pull traffic numbers from Cloudflare Web Analytics (RUM) for venturecrane.com. No arguments needed for a daily summary. Optional arguments for custom ranges.

## Usage

```
/analytics              # Today + 7-day trend
/analytics 30           # Last 30 days
/analytics 2026-02-01   # Specific date
```

## Arguments

Parse the argument:

- If empty, default to **today + 7-day trend**
- If a number (e.g., `30`), show the **last N days**
- If a date (e.g., `2026-02-01`), show that **specific date**

## Constants

These do not change:

- **Account ID:** `ab6cc9362f7e51ba9a610aec1fc3a833`
- **API Token env var:** `CLOUDFLARE_API_TOKEN`
- **GraphQL endpoint:** `https://api.cloudflare.com/client/v4/graphql`
- **Analytics type:** Account-level RUM (Web Analytics), NOT zone-level httpRequests

Zone-level analytics (`httpRequests1dGroups`) will fail with a permissions error. Always use account-level `rumPageloadEventsAdaptiveGroups`.

## Pre-flight

Check that `CLOUDFLARE_API_TOKEN` is set:

```bash
[ -z "$CLOUDFLARE_API_TOKEN" ] && echo "CLOUDFLARE_API_TOKEN not set" && exit 1
```

If not set, stop: "CLOUDFLARE_API_TOKEN is not in the environment. Launch with `crane vc` to inject secrets."

## Execution

### 1. Daily Trend

Query `rumPageloadEventsAdaptiveGroups` at the account level for the date range:

```bash
curl -s 'https://api.cloudflare.com/client/v4/graphql' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "query": "{ viewer { accounts(filter: { accountTag: \"ab6cc9362f7e51ba9a610aec1fc3a833\" }) { rumPageloadEventsAdaptiveGroups(limit: 50, filter: { date_geq: \"START_DATE\", date_leq: \"END_DATE\" }, orderBy: [date_ASC]) { count dimensions { date } } } } }"
  }'
```

Replace `START_DATE` and `END_DATE` based on the parsed argument.

### 2. Top Pages (for the most recent date in the range)

```bash
curl -s 'https://api.cloudflare.com/client/v4/graphql' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "query": "{ viewer { accounts(filter: { accountTag: \"ab6cc9362f7e51ba9a610aec1fc3a833\" }) { topPages: rumPageloadEventsAdaptiveGroups(limit: 15, filter: { date_geq: \"TARGET_DATE\", date_leq: \"TARGET_DATE\" }, orderBy: [count_DESC]) { count dimensions { requestPath } } topReferrers: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { date_geq: \"TARGET_DATE\", date_leq: \"TARGET_DATE\" }, orderBy: [count_DESC]) { count dimensions { refererHost } } topCountries: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { date_geq: \"TARGET_DATE\", date_leq: \"TARGET_DATE\" }, orderBy: [count_DESC]) { count dimensions { countryName } } } } }"
  }'
```

Run both queries in parallel (two Bash tool calls in one message).

### 3. Format Output

Present results as:

```
== venturecrane.com Traffic ==

Pageloads (7-day trend):
  Feb 10:    2
  Feb 11:    9
  Feb 12:    0
  Feb 13:    4
  Feb 14:   74
  Feb 15:  230
  Feb 16:  150  <-- today

Top Pages (today):
  39  /
  23  /articles/multi-model-code-review/
  16  /articles/agent-context-management-system/
   9  /portfolio/
   ...

Referrers (today):
  99  venturecrane.com (internal)
  50  (direct)
   1  bing.com

Countries (today):
 145  US
   2  SG
   1  PL
   ...
```

Right-align the numbers for scannability. Flag days with zero traffic (missing from API response) as `0`.

## Notes

- This is a read-only query. It does not modify anything.
- Cloudflare Web Analytics (RUM) data comes from a JavaScript beacon on the site. It does not include bot traffic, but it does include the operator's own browsing.
- Days missing from the API response had zero pageloads. Fill them in as `0` in the trend output.
- If the API returns an error, show the raw error message. Common issue: wrong analytics endpoint (zone-level vs account-level).
- Data may lag by a few hours for the current day.
