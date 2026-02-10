/**
 * Mock responses for GitHub CLI (gh) commands
 */

import type { GitHubIssue } from '../lib/github.js'

export const mockP0Issues: GitHubIssue[] = [
  {
    number: 1,
    title: 'Critical: Production outage',
    url: 'https://github.com/venturecrane/crane-console/issues/1',
  },
  {
    number: 5,
    title: 'P0: Database corruption',
    url: 'https://github.com/venturecrane/crane-console/issues/5',
  },
]

export const mockReadyIssues: GitHubIssue[] = [
  {
    number: 10,
    title: 'Add user authentication',
    url: 'https://github.com/venturecrane/crane-console/issues/10',
  },
  {
    number: 12,
    title: 'Implement caching layer',
    url: 'https://github.com/venturecrane/crane-console/issues/12',
  },
]

export const mockInProgressIssues: GitHubIssue[] = [
  {
    number: 8,
    title: 'Refactor API endpoints',
    url: 'https://github.com/venturecrane/crane-console/issues/8',
  },
]

export const mockBlockedIssues: GitHubIssue[] = [
  {
    number: 15,
    title: 'Waiting for design review',
    url: 'https://github.com/venturecrane/crane-console/issues/15',
  },
]

export const mockTriageIssues: GitHubIssue[] = [
  {
    number: 20,
    title: 'New feature request',
    url: 'https://github.com/venturecrane/crane-console/issues/20',
  },
  {
    number: 21,
    title: 'Bug report from user',
    url: 'https://github.com/venturecrane/crane-console/issues/21',
  },
]

export const mockIssueBreakdown = {
  p0: mockP0Issues,
  ready: mockReadyIssues,
  in_progress: mockInProgressIssues,
  blocked: mockBlockedIssues,
  triage: mockTriageIssues,
}

export const mockEmptyIssueBreakdown = {
  p0: [],
  ready: [],
  in_progress: [],
  blocked: [],
  triage: [],
}

// gh CLI output mocks
export const mockGhAuthSuccessOutput =
  'github.com\n  ✓ Logged in to github.com account testuser (keyring)'
export const mockGhAuthFailureOutput =
  'You are not logged into any GitHub hosts. Run gh auth login to authenticate.'

// JSON output from gh api search
export const mockGhApiSearchOutput = (issues: GitHubIssue[]): string =>
  JSON.stringify(issues.map((i) => ({ number: i.number, title: i.title, url: i.url })))
