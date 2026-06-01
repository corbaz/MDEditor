import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    // No `projects` array: Electron-only, no browser contexts/binaries.
    fullyParallel: false,
    workers: 1, // Single Electron instance at a time — avoid process contention / port races.
    timeout: 30_000, // Per-test; covers MDXEditor double-RAF + first IPC load.
    expect: { timeout: 7_000 }, // Web-first assertion polling window.
    retries: process.env.CI ? 1 : 0, // Local Windows = no auto-retry; opt-in for future CI.
    reporter: [['list']],
    globalSetup: './e2e/global-setup.ts',
    use: {
        trace: 'retain-on-failure', // Cheap post-mortem without pixel snapshots.
    },
});
