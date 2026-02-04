/**
 * Mock data for repo-scanner tests
 */

import type { LocalRepo } from '../lib/repo-scanner.js';

export const mockRepoInfo = {
  org: 'venturecrane',
  repo: 'crane-console',
  branch: 'main',
};

export const mockRepoInfoFeatureBranch = {
  org: 'venturecrane',
  repo: 'crane-console',
  branch: 'feature/test-implementation',
};

export const mockLocalRepos: LocalRepo[] = [
  {
    path: '/Users/testuser/dev/crane-console',
    name: 'crane-console',
    remote: 'git@github.com:venturecrane/crane-console.git',
    org: 'venturecrane',
    repoName: 'crane-console',
  },
  {
    path: '/Users/testuser/dev/ke-console',
    name: 'ke-console',
    remote: 'https://github.com/kidexpenses/ke-console.git',
    org: 'kidexpenses',
    repoName: 'ke-console',
  },
  {
    path: '/Users/testuser/dev/sc-app',
    name: 'sc-app',
    remote: 'git@github.com:siliconcrane/sc-app.git',
    org: 'siliconcrane',
    repoName: 'sc-app',
  },
];

export const mockRemoteUrls = {
  https: 'https://github.com/venturecrane/crane-console.git',
  ssh: 'git@github.com:venturecrane/crane-console.git',
  httpsKe: 'https://github.com/kidexpenses/ke-console.git',
  sshSc: 'git@github.com:siliconcrane/sc-app.git',
};

// Directory structure mocks for fs operations
export const mockDevDirEntries = ['crane-console', 'ke-console', 'sc-app', 'other-project'];

export const mockWeeklyPlanContent = `# Weekly Plan

## Priority Venture
Venture Crane (vc)

## Secondary Focus
Kid Expenses (ke)

## Target Issues
- #42 Implement test suite
- #38 Add CI/CD pipeline

## Capacity Notes
Full availability this week

## Created
2026-02-03
`;

export const mockStaleWeeklyPlanContent = `# Weekly Plan

## Priority Venture
Silicon Crane (sc)

## Target Issues
- #10 Old issue

## Created
2026-01-20
`;
