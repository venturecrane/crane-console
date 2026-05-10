# Dossier: Memory Ledger

Window: 2026-01-13 to 2026-05-09 (~16 weeks)

## Total Entries

- Auto-memory total: 56
- Enterprise memory total: 20
- Combined: 76

## By Type (auto-memory)

- feedback: 32
- project: 12
- reference: 11
- user: 1
- other/uncategorized: 0

## Capture-Date Histogram

| Month | New entries |
| --- | --- |
| 2026-01 | 0 |
| 2026-02 | 0 |
| 2026-03 | 1 |
| 2026-04 | 33 |
| 2026-05 (partial) | 22 |
| Pre-window | 0 |

Note: All 56 auto-memory files have mtimes within the window. No files predate 2026-03. The enterprise memory system (20 entries) was created entirely in early May 2026 based on creation timestamps.

## Top 10 Categories

| Category | Count | Sample names |
| --- | --- | --- |
| feedback: agent-behavior | 7 | agent_isolation_worktree_unreliable, agent_teams_ghostty_chaos, agents_produce_content, commit_early_when_parallel_agents, those_all_sound_like_agent_tasks, mcp_deferred_tools, dead_code_reviews |
| feedback: justification-discipline | 5 | no_human_ergonomics_arguments, no_manufactured_loose_ends, no_quick_win_framing, no_soft_sunset, kill_dont_file |
| feedback: debugging | 5 | verify_root_cause_before_fixing, verify_fix_end_to_end, audit_verify_against_live_state, read_vendor_docs_first, rebaseline_against_origin_main |
| reference: tooling-config | 5 | user_settings_json, enterprise_plugins, plugin_disable_vs_uninstall, auto_mode_classifier, claude_code_hook_contract |
| project: partnerships | 3 | claude_partner_network, partner_network_transparent_framing, broadcast_vs_personal_comms |
| reference: secrets-infra | 3 | infisical_cli_gotchas, gh_pr_edit_token_scope, verify_ledger_post_endpoint |
| feedback: secrets-ops | 3 | pbpaste_secret_relay, infisical_never_list_with_values, skills_dirty_state_gitignore |
| project: tooling-features | 3 | heartbeat_fix_known_limitation, crane_context_messaging_deferred, session_reflexes_v2_review |
| feedback: content-editorial | 4 | article_not_buildlog, captain_perspective_in_content, edit_article_skill, agents_produce_content |
| project: venture-ops | 4 | ss_org_transfer, venture_priority, semgrep_fleet_rollout, ga4_unified_property_doc_drift |

## Most-Cited Memories

| Memory ID | Name | Cite count (last 120d) | Surfaced count | Type |
| --- | --- | --- | --- | --- |
| note_01KQ0KYM4QSRPE7W646BMQW9CK | (not in current list - may be retired) | 0 | 7 | unknown |
| note_01KQX3MD5YJT5F8P12W08DC6PX | collaborative-strategy-posture | 0 | 7 | lesson |
| note_01KQX3MFRABNA3G12G4VZJM6V0 | agent-owns-commit-push-merge-deploy | 0 | 5 | lesson |
| note_01KQX3MDQ2H293MP7DKVAZ09T7 | no-artificial-qualification-gates-in-marketing-copy | 0 | 4 | lesson |
| note_01KQX3MCMXQ8KMBAWZTW2BH9BA | no-fixed-timeframes-on-site | 0 | 3 | lesson |

Note: All enterprise memories were created 2026-05-05 to 2026-05-06. Cited count is 0 across all entries (surfaced events only). No enterprise memory has been explicitly cited in a session yet.

## Data Sources Used

- `ls -la /Users/scottdurgan/.claude/projects/-Users-scottdurgan-dev-crane-console/memory/` for file list with sizes
- `stat -f "%Sm %N" -t "%Y-%m"` for mtime-based date histogram
- `grep "^type:"` on each `.md` file for type field parsing
- `crane_memory(action: "list")` for enterprise memory inventory (20 entries returned)
- `crane_memory_usage(since: "120d")` for citation/surfaced counts (12 entries with usage data)
- Note: `note_01KQ0KYM4QSRPE7W646BMQW9CK` appears in usage data but not in the current `list` output; may be deprecated or from a different venture scope.
