/**
 * Prompt Templates for Command Center
 *
 * Templates for QA, PM, Agent Brief, and Merge prompts.
 * These are copied to clipboard for manual execution.
 */

import type { PromptContext, GitHubLabel } from '@/types/github';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract Agent Brief section from issue body.
 *
 * Looks for "## Agent Brief" heading and extracts content until next heading.
 */
export function extractAgentBrief(body: string): string | null {
  const briefMatch = body.match(/##\s*Agent Brief\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!briefMatch) return null;

  const brief = briefMatch[1].trim();
  if (brief.length < 10) return null;

  return brief;
}

/**
 * Extract Acceptance Criteria from issue body.
 *
 * Looks for "## Acceptance Criteria" heading and extracts checklist items.
 */
export function extractAcceptanceCriteria(body: string): string[] {
  const acSection = body.match(
    /##\s*Acceptance Criteria\s*\n([\s\S]*?)(?=\n##|$)/i
  );
  if (!acSection) return [];

  const criteria = acSection[1]
    .split('\n')
    .filter((line) => line.trim().match(/^-\s*\[.\]/))
    .map((line) =>
      line
        .replace(/^-\s*\[.\]\s*/, '')
        .replace(/^\*\*AC\d+:\*\*\s*/i, '')
        .trim()
    );

  return criteria;
}

/**
 * Format labels as comma-separated string.
 */
export function formatLabels(labels: GitHubLabel[]): string {
  return labels.map((l) => l.name).join(', ');
}

/**
 * Get priority label from labels array.
 */
export function getPriorityLabel(labels: GitHubLabel[]): string | undefined {
  const priorityLabel = labels.find((l) => l.name.startsWith('prio:'));
  return priorityLabel?.name;
}

/**
 * Get status label from labels array.
 */
export function getStatusLabel(labels: GitHubLabel[]): string | undefined {
  const statusLabel = labels.find((l) => l.name.startsWith('status:'));
  return statusLabel?.name;
}

// ============================================================================
// QA PROMPT
// ============================================================================

export function QA_PROMPT(ctx: PromptContext): string {
  const criteria = extractAcceptanceCriteria(ctx.body);
  const itemType = ctx.type === 'pr' ? 'PR' : 'Issue';

  return `# QA Review: ${itemType} #${ctx.number}

## ${itemType} Details
- **Title:** ${ctx.title}
- **URL:** ${ctx.url}
- **Preview:** ${ctx.previewUrl || '⚠️ NO PREVIEW URL AVAILABLE'}

## Review Checklist

${
  criteria.length > 0
    ? criteria.map((ac, i) => `${i + 1}. [ ] ${ac}`).join('\n')
    : '1. [ ] Feature works as described\n2. [ ] No console errors\n3. [ ] Mobile responsive (iOS Safari)\n4. [ ] Edge cases handled'
}

## Testing Instructions

1. Open preview URL in browser (test both desktop and mobile)
2. Test each acceptance criterion listed above
3. Check for console errors (browser dev tools)
4. Test on iOS Safari if mobile changes are involved
5. Test edge cases (empty states, error states, loading states)

## Verdict Options

- **PASS** - All criteria met, ready to merge
- **FAIL** - Critical issues found, needs fixes
- **PASS_UNVERIFIED** - Passes logic review but preview URL unavailable

## Grade

\`\`\`
qa-grade: [pass|fail|pass-unverified]
\`\`\`

## Notes

[Add your detailed testing notes here, including:
- What was tested
- Any issues found
- Screenshots/recordings if applicable
- Recommendations]
`;
}

// ============================================================================
// PM PROMPT
// ============================================================================

export function PM_PROMPT(ctx: PromptContext): string {
  const currentPriority = getPriorityLabel(ctx.labels) || 'Not set';
  const currentStatus = getStatusLabel(ctx.labels) || 'Not set';
  const itemType = ctx.type === 'pr' ? 'PR' : 'Issue';

  return `# PM Triage: ${itemType} #${ctx.number}

## ${itemType} Details
- **Title:** ${ctx.title}
- **URL:** ${ctx.url}
- **Current Priority:** ${currentPriority}
- **Current Status:** ${currentStatus}
- **Labels:** ${formatLabels(ctx.labels)}

## Context

${ctx.body}

## Triage Questions

1. **Is this issue clear and actionable?**
   - Are requirements well-defined?
   - Are acceptance criteria present?
   - Is scope appropriate?

2. **What priority should this be?**
   - P0 (Blocker - drop everything)
   - P1 (High priority)
   - P2 (Medium priority)
   - P3 (Low priority / nice-to-have)

3. **What labels need to be added/removed?**
   - Component labels (dfg-app, dfg-api, dfg-scout, dfg-analyst, dfg-relay)
   - Type labels (type:story, type:bug, type:task)
   - Status labels (status:ready, status:blocked, etc.)

4. **Should this be assigned? To whom?**
   - Dev Team member
   - QA Team member
   - PM for clarification

5. **Are there dependencies or blockers?**
   - Related issues/PRs
   - External dependencies
   - Technical blockers

6. **Sprint/milestone assignment?**
   - Should this be in current sprint?
   - Future sprint?
   - Backlog?

## Next Actions

- [ ] Set/update priority label
- [ ] Add/update component labels
- [ ] Add/update type label
- [ ] Assign owner if applicable
- [ ] Add to sprint/milestone if applicable
- [ ] Update status label
- [ ] Link related issues
- [ ] Add comments with clarifications

## Notes

[Add triage notes, decisions, and rationale here]
`;
}

// ============================================================================
// AGENT BRIEF PROMPT
// ============================================================================

export function AGENT_BRIEF_PROMPT(ctx: PromptContext): string | null {
  const brief = extractAgentBrief(ctx.body);
  if (!brief) return null;

  const itemType = ctx.type === 'pr' ? 'PR' : 'Issue';

  return `# Agent Brief: ${itemType} #${ctx.number}

## Task

${brief}

## Links

- **${itemType} URL:** ${ctx.url}
- **Preview URL:** ${ctx.previewUrl || 'Not available'}

## Instructions

1. Read the full issue/PR at the URL above
2. Review the Agent Brief section for implementation guidance
3. If preview URL is available, test the implementation
4. Follow the suggested commands and verification steps
5. Report any issues or blockers

## Notes

[Add your notes, observations, or questions here]
`;
}

// ============================================================================
// MERGE PROMPT
// ============================================================================

export function MERGE_PROMPT(ctx: PromptContext): string {
  const qaGrade = ctx.labels.find((l) => l.name.startsWith('qa-grade:'))?.name;
  const status = getStatusLabel(ctx.labels);

  return `# Merge Checklist: PR #${ctx.number}

## PR Details
- **Title:** ${ctx.title}
- **URL:** ${ctx.url}
- **Status:** ${status || 'Unknown'}
- **QA Grade:** ${qaGrade || 'Not graded'}
- **Preview:** ${ctx.previewUrl || 'Not available'}

## Pre-Merge Verification

- [ ] All CI checks passing (GitHub Actions)
- [ ] QA approval received (label:qa-grade:pass or pass-unverified)
- [ ] No merge conflicts with base branch
- [ ] Preview URL tested and working (if applicable)
- [ ] Documentation updated (if needed)
- [ ] No unresolved review comments
- [ ] Code follows project patterns and style guide

## Merge Strategy

Select one:
- [ ] **Squash and merge** (preferred for feature branches)
- [ ] **Create merge commit** (for release branches)
- [ ] **Rebase and merge** (for clean linear history)

## Merge Command

\`\`\`bash
gh pr merge ${ctx.number} --squash --delete-branch
\`\`\`

## Post-Merge Actions

- [ ] Verify branch was deleted
- [ ] Close related issues (if applicable)
- [ ] Update project board/sprint tracker
- [ ] Monitor production for errors (if auto-deployed)
- [ ] Notify team in Slack/Discord (if significant change)

## Notes

[Add merge notes, deployment instructions, or follow-up tasks here]
`;
}
