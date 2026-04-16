# Classification rubric

Every Stitch generation must carry three tags: `surface=`, `archetype=`, `viewport=`. The pipeline fails fast if any is missing. This rubric is the manual lookup for users constructing prompts; it is not a runtime classifier.

## Tag format

Case-sensitive. Lowercase values. Hyphens, not underscores.

```
surface=<public|token-auth|session-auth-client|session-auth-admin>
archetype=<dashboard|list|detail|form|wizard|empty|error|modal|drawer>
viewport=<mobile|desktop>
```

Example prompt prefix:

```
/stitch-design target=portal-invoice-detail surface=session-auth-client archetype=detail viewport=mobile
```

## Decision tree — surface class

Answer the question at each node:

1. **Is the URL publicly linkable without auth?**
   - Yes → node 2.
   - No → node 3.

2. **Does the URL contain a signed token or opaque identifier as a path segment (e.g., `/portal/proposals/[token]`, `/invoice/[id]`)?**
   - Yes → `token-auth`.
   - No → `public`.

3. **Does the route require admin role?**
   - Yes → `session-auth-admin`.
   - No → `session-auth-client`.

## Decision tree — archetype

1. **Is this the landing for an authenticated surface class (a "home")?**
   - Yes → `dashboard`.
   - No → node 2.

2. **Does the page show a list of items?**
   - Yes → `list`.
   - No → node 3.

3. **Does the page show a single item's details?**
   - Yes → `detail`.
   - No → node 4.

4. **Is the page an input form for creating/editing one entity?**
   - Yes, single-page → `form`.
   - Yes, multi-step → `wizard`.
   - No → node 5.

5. **Is this an overlay or panel?**
   - Overlay centered on the page → `modal`.
   - Slide-in from an edge → `drawer`.
   - No → node 6.

6. **Is this an error or empty state?**
   - Error (404/500/401/etc.) → `error`.
   - Empty-list or empty-detail → `empty`.
   - Otherwise → STOP and consider if a new archetype is needed. Run `/nav-spec --revise --add-archetype`.

## Decision tree — viewport

Two values only: `mobile` (390×844 reference) and `desktop` (1280 reference).

- If the user prompt specifies a viewport → use it.
- If not → ask the user. Do not default to one. Explicit classification forces mobile-first thinking.

For pages that need both viewports, run two generations with different viewport tags — that's the intended workflow, not a single "responsive" generation.

## Disambiguation — common edge cases

### A "detail" page that also includes an inline form

**Example:** `/portal/invoices/[id]` shows the invoice detail AND has a Pay button that opens payment fields inline (no navigation).

**Classification:** `detail`. The form is content, not the archetype. The back affordance and chrome follow detail rules.

### A "list" page with a prominent filter drawer

**Example:** `/admin/audit-log` with a filter panel that slides in from the right.

**Classification:** `list` for the main page. `drawer` if generating the filter panel separately.

### A page that's a dashboard + list

**Example:** `/admin/home` shows metric cards and a recent-activity list.

**Classification:** `dashboard`. A dashboard may contain lists as content; the archetype is determined by the page's role, not the widgets on it.

### A public marketing page that has a form (contact form, signup)

**Example:** `/contact` with a contact form.

**Classification:** either `public` + `detail` (if the form is a content section on a larger page) OR `public` + `form` (if the form IS the page, like a dedicated contact page with nothing else). Use `form` when the form is the primary purpose.

### A token-auth landing that redirects to a session-auth page after an action

**Example:** `/portal/proposals/[token]` where accepting the proposal signs the client in.

**Classification:** two different pages. `/portal/proposals/[token]` is `token-auth` + `detail`. The post-acceptance redirect target is `session-auth-client` + `dashboard` (or wherever it lands).

### The same URL has different chrome for different user roles

**Example:** `/invoice/[id]` — if the user is logged in, show session-auth chrome; if not, show token-auth chrome.

**Classification:** run two generations, one for each surface class. The actual page implementation branches at render; the design specs for each path are independent.

## Fallback when classification is ambiguous

If the user's prompt is ambiguous, the pipeline response is:

```
Cannot classify target. Add these tags to your prompt:
  surface=<public|token-auth|session-auth-client|session-auth-admin>
  archetype=<dashboard|list|detail|form|wizard|empty|error|modal|drawer>
  viewport=<mobile|desktop>

Run /nav-spec --classify-help to see the decision rubric.
```

Never guess. Never infer from natural language. Probabilistic classification is exactly the drift the whole system is designed to prevent.

## Test cases (for validator developers)

| Prompt                                                | Correct classification                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "Portal home dashboard, mobile"                       | `surface=session-auth-client archetype=dashboard viewport=mobile`                                     |
| "Invoice detail page, mobile" (authenticated context) | `surface=session-auth-client archetype=detail viewport=mobile`                                        |
| "Public-facing invoice link via email" (deep-link)    | `surface=token-auth archetype=detail viewport=<ask>`                                                  |
| "Admin clients list"                                  | `surface=session-auth-admin archetype=list viewport=<ask>`                                            |
| "New engagement intake wizard"                        | `surface=session-auth-admin archetype=wizard viewport=<ask>`                                          |
| "Marketing home page"                                 | `surface=public archetype=dashboard viewport=<ask>` (`dashboard` because it's the landing for public) |
| "404 page"                                            | `surface=<depends on which subdomain> archetype=error viewport=<ask>`                                 |
