import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
    // Produce the production dist/ that main.cjs loadFile() serves.
    // stdio: 'inherit' surfaces build errors directly in the test output.
    execSync('bun run build', { stdio: 'inherit' });
}
