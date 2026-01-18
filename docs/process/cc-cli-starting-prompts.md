# CC CLI Prompt Examples

**Version:** 2.0
**Last Updated:** 2026-01-18
**Purpose:** Simple, practical prompt examples for common CC CLI workflows

## Quick Start

CC CLI agents work best with clear, direct prompts. No roles or complex modes needed - just tell the agent what you want done.

## Common Workflows

### Review and Organize Backlog

```
Review the GitHub issue backlog for this project.

Organize issues into development tracks based on:
- Priority (P0 > P1 > P2)
- Dependencies (what blocks what)
- Type (features, bugs, performance, etc.)

Suggest 2-3 parallel development tracks and label the issues accordingly
using GitHub labels (track-1, track-2, etc.).
```

### Work on Specific Issues

```
Work on issues #45, #47, and #52. For each:
1. Read the issue description carefully
2. Implement the solution
3. Write or update tests
4. Create a pull request

If you hit any blockers or need clarification, ask.
```

### Work on a Category

```
Find all high-priority performance issues (label:performance, label:P1).
Work on them in priority order. Implement, test, and create PRs.
```

### Focus on a Development Track

```
You're managing track 2. Work on all issues labeled 'track-2' in priority order.
Follow the standard workflow: implement, test, create PR for each issue.
```

### Technical Decision Analysis

```
We need to decide between Redis and in-memory caching for this feature.

Analyze both options considering:
- Current scale and growth trajectory
- Infrastructure complexity and maintenance
- Team expertise and operational burden
- Time to value

Recommend an approach with clear reasoning.
```

### Make Architecture Changes

```
Refactor the authentication system to use JWT tokens instead of sessions.

Plan the work in phases to minimize risk:
1. Identify all files that need changes
2. Create feature flag for new auth
3. Implement JWT alongside sessions
4. Test thoroughly
5. Migrate users
6. Remove old session code

Implement phase by phase, creating PRs as you go.
```

### Bug Investigation

```
Issue #X reports that users can't log in on mobile devices.

Investigate:
1. Review the authentication flow code
2. Check for mobile-specific issues (viewport, touch events, etc.)
3. Review recent PRs that might have introduced this
4. Identify the root cause
5. Propose and implement a fix

Document your findings in the issue before fixing.
```

### Create Documentation

```
Write comprehensive documentation for the new notification system.

Include:
- How it works architecturally
- API endpoints and examples
- Configuration options
- Testing guide
- Common troubleshooting

Save to docs/notifications.md
```

### Code Review and Improvement

```
Review all files in src/auth/ for:
- Security vulnerabilities
- Performance issues
- Code quality and maintainability
- Missing tests

Create issues for problems you find, prioritize them, and fix the critical ones.
```

## Working with Multiple Agents

### Parallel Development

When running multiple CC CLI agents in parallel:

**Agent 1 (Planning):**
```
Review the backlog and organize work into 2 parallel development tracks.
Label issues 'track-1' and 'track-2' based on dependencies and priorities.
```

**Agent 2 (Track 1):**
```
You're managing track 1. Work on issues labeled 'track-1' in priority order.
```

**Agent 3 (Track 2):**
```
You're managing track 2. Work on issues labeled 'track-2' in priority order.
```

### Sequential Work

For dependent work that must happen in order:

```
Work on these issues sequentially (each depends on the previous):
1. Issue #45: Add database migration
2. Issue #46: Add API endpoint
3. Issue #47: Add frontend UI
4. Issue #48: Add tests

Only move to the next issue after the previous PR is merged.
```

## Tips for Effective Prompts

### Be Specific About Scope
❌ "Improve the codebase"
✅ "Refactor the authentication module to reduce duplication"

### Define Success Criteria
❌ "Make it faster"
✅ "Reduce API response time to <100ms for the /users endpoint"

### Clarify Constraints
❌ "Add caching"
✅ "Add in-memory caching with 5-minute TTL, no external dependencies"

### Request Analysis When Needed
❌ Just pick one
✅ "Analyze these options and recommend the best approach with reasoning"

### Break Down Large Work
❌ "Rewrite the entire auth system"
✅ "Phase 1: Add JWT support alongside existing sessions. Create feature flag."

## When to Ask Questions

CC CLI agents can make technical decisions, but should ask when:
- **Requirements are ambiguous** - "Should this feature be admin-only or public?"
- **Multiple valid approaches** - "Redis or in-memory cache?"
- **Risk/tradeoff decisions** - "This improves speed but increases complexity. Proceed?"
- **Scope boundary** - "This fix needs changes to 3 other modules. Should I continue?"

Prompt the agent to analyze and recommend, but you make final calls on:
- Product direction
- High-risk changes
- Significant architecture shifts
- Breaking changes

## Environment Setup

Before starting any work, ensure:
```bash
# Set relay key for API access
export CRANE_RELAY_KEY="your-relay-key-here"

# Navigate to correct repo
cd ~/path/to/console-repo

# Start session with context
./scripts/crane-sod.sh

# Or: Let it auto-detect
./scripts/crane-sod.sh
```

## Getting Help

If the agent gets stuck:
- Check that it has necessary permissions (GitHub, file access, etc.)
- Verify CRANE_RELAY_KEY is set correctly
- Ensure it's in the right repository directory
- Try breaking the work into smaller steps
- Ask it to explain what's blocking it

## Remember

**CC CLI agents are smart and capable.** They can:
- ✅ Plan work and make technical decisions
- ✅ Write production-quality code
- ✅ Create comprehensive tests
- ✅ Review and refactor code
- ✅ Debug complex issues
- ✅ Write documentation

**Just prompt them clearly for what you need.** No roles, no complex modes, no ceremony.
