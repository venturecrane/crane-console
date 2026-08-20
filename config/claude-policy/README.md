# Claude Code policy distribution

Fleet-wide distribution of Claude Code's auto-mode and permission guardrails.
Before this existed, the hardened ruleset lived only in `~/.claude/settings.json`
on one workstation; every other fleet machine ran `defaultMode: "auto"` with zero
`ask` rules and no `autoMode` section at all.

## Two layers, and why neither is redundant

| Layer            | File                    | Scope        | Delivery                             |
| ---------------- | ----------------------- | ------------ | ------------------------------------ |
| Enterprise floor | `managed-settings.json` | machine-wide | `install-managed-settings.sh` (sudo) |
| Venture overlay  | `ventures/<code>.json`  | one venture  | `crane <code>` passes `--settings`   |

Managed settings is **machine-scoped**. It structurally cannot carry
venture-specific prose — a machine runs sessions for several ventures. The
launcher is the only venture-aware lever. Both layers are required.

The two layers merge rather than override. This is verified, not assumed
(`vfy_01M0DKR9VHP69GR2N05WB0401Y`): an overlay took `autoMode.environment` from
24 to 25 entries and `soft_deny` from 67 to 68 with every pre-existing entry
intact and `$defaults` expanded exactly once.

### Merging across scopes is not the same as merging with the defaults

These are two different mechanisms, and confusing them costs you rules:

- **Scope to scope** — floor + overlay **concatenate**. This is what makes the
  two-layer design work.
- **Payload vs built-in defaults** — depends on the field.
  - `allow`, `soft_deny`, `hard_deny` merge with the built-ins **only** if you
    include the literal `"$defaults"`. Omit it and the entire built-in list for
    that section is discarded.
  - `environment` has **no `$defaults` token at all**. Setting it **replaces**
    the 20 built-in slots outright (`vfy_01M0DN6WDTB3RE75T9N2EDFXR7`). A slot
    the floor does not carry does not fall back to its default — it vanishes,
    and the safe fallback goes with it.

The first draft of this floor dropped `**Repository visibility**`,
`**CI/CD deploy targets**`, and `**Trusted internal domains**` exactly this way.
`claude-policy.test.ts` now asserts the floor fills all 20 default slots, so the
omission cannot recur silently.

## The split rule

`permissions.ask` and `autoMode.environment` need opposite policies, because
their failure modes are opposite.

- **`permissions.ask` is a tool-pattern matcher.** Under-including a rule costs
  an ungated production command. → **ship every rule to every machine.** All the
  `fly` + `wrangler` patterns live in the enterprise floor even though only some
  ventures run Fly.

  But **scope each rule to the verb, not the namespace.** The first draft of
  this floor priced over-inclusion as "one prompt on a machine that has no such
  CLI installed" — true everywhere except the machine that actually runs the
  CLI, which is the only machine the rule was written for. Whole-namespace
  patterns like `Bash(fly machine:*)` and `Bash(fly ssh:*)` produced **157
  forced prompts in one day** of ss-console sessions (2026-08-20), 117 of them
  `fly ssh`, the only way to read an Operator seat. Verb-scoping the same
  rules brought that day to 12, all real mutations.

  The reason over-gating is not free: an `ask` rule resolves **before** the
  auto-mode classifier — _"If an explicit ask rule matches the command, Claude
  Code asks you even in `auto` mode"_
  ([permission-modes](https://code.claude.com/docs/en/permission-modes)). It
  does not add a layer on top of the classifier; it **replaces** the
  classifier's judgment with a blind prompt, discarding the built-in Production
  Reads clause — _"Once the bar is met for a target, further read-only commands
  against it are session-cleared."_ A namespace `ask` rule turns one approval
  per seat per session into one approval per command, forever. That is not
  extra safety; click-fatigue at 57 approvals in a session is less safety than
  a gate that asks once and means it.

  Before narrowing an `ask` rule, grep the machine's `permissions.allow` lists —
  including `.claude/settings.local.json`, where "Yes, and don't ask again"
  saves grants. A grant hiding under an `ask` rule is inert while the rule
  stands and becomes a silent auto-approval the moment it is removed.

- **`autoMode.environment` is prose an LLM classifier reads as fact.**
  Over-including asserts something false about a venture, which is worse than
  asserting nothing. → **surgical, per venture.** An entry goes in the floor
  only if it is true on every machine for every venture.

When a venture fact cannot be verified, leave the slot out. An absent entry
means "not established"; a wrong entry means the classifier reasons from a
falsehood. The floor states this explicitly so an absent overlay is not read as
a clearance.

## Adding a venture overlay

1. Create `ventures/<code>.json`. Only `autoMode` keys are read from a
   `--settings` file for classifier purposes; `permissions` belong in the floor.
2. Every array that you set **must** include the literal `"$defaults"`, or the
   entire built-in list for that section is discarded. `soft_deny` ships 66
   built-in rules; dropping them silently removes production-deploy,
   production-read, secret-store-write, and irreversible-deletion coverage.
3. Verify each fact before writing it. Cite the check in the entry itself where
   it is cheap to do so (e.g. the `gh repo view` output behind a visibility
   claim), so a later reader can tell a verified fact from an inherited guess.
4. Custom rules exist to **name your infrastructure** so the built-in rules bind
   to it — not to restate the same classes of danger the built-ins already
   cover.

Ventures without a file (`sc`, `dfg`, `ke`, `dc`, `smd`) are deliberately empty,
not overlooked. They get the enterprise floor and nothing more until someone
verifies their specifics.

## Installing the enterprise floor

```sh
./config/claude-policy/install-managed-settings.sh
```

Requires `sudo` (writes under `/Library/Application Support/ClaudeCode/` on
macOS, `/etc/claude-code/` on Linux). One-time per machine; re-run to update.

Settings load at session start, so a running session will not see a newly
installed file. Prove it in a **fresh** session, with a command that is safe
against a non-existent app:

```sh
claude -p 'run: fly machine destroy --app no-such-app-probe 0000000000000'
```

The session must prompt, and the prompt must name the rule. Do not verify with
`--help` — it is harmless by construction, so the classifier waves it through
whether or not your rule loaded, and the check cannot fail.

Then prove the other half, that reads are **not** gated:

```sh
claude -p 'run: fly machines list -a <some-app>'
```

This must reach the classifier rather than an ask prompt. Three outcomes, all
diagnostic: _blocked by classifier_ is correct; _prompts you_ means a
namespace rule survived; _runs silently_ means a `permissions.allow` grant is
shadowing the classifier and needs to be found.
