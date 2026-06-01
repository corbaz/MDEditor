import { test as base, chromium, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';

// Playwright + Electron 42 compatibility.
//
// Playwright's _electron.launch (loader.js via -r preload) is broken on Electron 42:
//  - Electron 42 (Node.js 24) rejects --remote-debugging-port=0 as an unknown Node.js flag
//    when passed as a top-level arg (Node.js validates it before Chromium can strip it)
//  - The -r preload context runs before Electron's module override activates, so
//    require('electron').app is undefined in that context
//
// Root cause found during implementation: ELECTRON_RUN_AS_NODE=1 is set in the parent
// process env (bun's test runner uses Electron as plain Node.js). When inherited, this
// env var makes Electron ignore all Electron-specific initialization and run as raw
// Node.js — causing require('electron') to return the npm package binary path string.
//
// Fix:
//   1. Bypass _electron.launch entirely — spawn Electron via child_process.spawn.
//   2. Explicitly unset ELECTRON_RUN_AS_NODE so Electron runs in full Electron context.
//   3. Pass --remote-debugging-port=0 as the first arg (Chromium processes it before
//      Node.js startup — this works once ELECTRON_RUN_AS_NODE is unset).
//   4. Read the "DevTools listening on ws://..." URL from stderr and connect via
//      chromium.connectOverCDP.
const _require = createRequire(import.meta.url);
const electronBin = _require('electron') as string;

type ElectronHandle = {
    cdpUrl: string;
    process: ChildProcess;
    userDataDir: string;
    context: BrowserContext;
};

type Fixtures = {
    electronHandle: ElectronHandle;
    page: Page;
};

export const test = base.extend<Fixtures>({
    // eslint-disable-next-line no-empty-pattern
    electronHandle: async ({}, provide) => {
        const userDataDir = mkdtempSync(join(tmpdir(), 'mdeditor-e2e-'));

        // Unset ELECTRON_RUN_AS_NODE — inherited from bun's test runner environment.
        // If set to "1", Electron runs as plain Node.js without any Electron context,
        // breaking require('electron').app and all other Electron APIs.
        const env: Record<string, string | undefined> = { ...process.env, MDEDITOR_USER_DATA: userDataDir };
        delete env.ELECTRON_RUN_AS_NODE;

        const electronProcess = spawn(
            electronBin,
            ['--remote-debugging-port=0', '.'],
            {
                cwd: process.cwd(),
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            }
        );

        // Wait for Chromium to announce the CDP WebSocket URL on stderr.
        const cdpUrl = await new Promise<string>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Timed out (20s) waiting for DevTools URL from Electron'));
            }, 20_000);

            let buf = '';
            electronProcess.stderr!.on('data', (chunk: Buffer) => {
                buf += chunk.toString();
                const match = buf.match(/DevTools listening on (ws:\/\/[^\s\n]+)/);
                if (match) {
                    clearTimeout(timeoutId);
                    resolve(match[1]);
                }
            });

            electronProcess.on('exit', (code) => {
                clearTimeout(timeoutId);
                reject(new Error(`Electron exited (code ${String(code)}) before DevTools URL appeared`));
            });
        });

        // Connect Playwright's Chromium driver to the Electron DevTools via CDP.
        const browser = await chromium.connectOverCDP(cdpUrl);
        const context = browser.contexts()[0] ?? await browser.newContext();

        await provide({ cdpUrl, process: electronProcess, userDataDir, context });

        // Teardown
        await browser.close().catch(() => undefined);
        if (!electronProcess.killed) electronProcess.kill();
        await new Promise<void>((res) => {
            electronProcess.on('exit', res);
            setTimeout(res, 3000);
        });
        rmSync(userDataDir, { recursive: true, force: true });
    },

    page: async ({ electronHandle }, provide) => {
        const { context } = electronHandle;

        // Wait for the first page (the main BrowserWindow).
        let window = context.pages()[0];
        if (!window) {
            window = await context.waitForEvent('page');
        }

        // Gate on the loading overlay: MDXEditor injects via double-RAF and
        // isLoadingLatest stays true until loadLatestDocument resolves.
        await window.waitForSelector('.loadingOverlay', { state: 'hidden' });
        await provide(window);
    },
});

export { expect };
