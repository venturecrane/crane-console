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

## The split rule

`permissions.ask` and `autoMode.environment` need opposite policies, because
their failure modes are opposite.

- **`permissions.ask` is a tool-pattern matcher.** Over-including a rule costs
  one prompt on a machine that has no such CLI installed. Under-including it
  costs an ungated production command. → **ship every rule to every machine.**
  All 44 `fly` + `wrangler` patterns live in the enterprise floor even though
  only some ventures run Fly.

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
installed file. Prove it in a **fresh** session:

```sh
claude -p 'run: fly ssh --help'
```

The session must prompt, and the prompt must name the rule.
