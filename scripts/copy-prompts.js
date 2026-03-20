#!/usr/bin/env node
/**
 * copy-prompts.js
 *
 * Copies Markdown prompt files from src/prompts/ → dist/prompts/.
 * Run as part of the build pipeline after `tsc`.
 *
 * Why this exists:
 *   TypeScript's compiler only emits .js/.d.ts files — it ignores .md assets.
 *   PromptLoader resolves prompts from dist/prompts/ at runtime, so we must
 *   mirror the src/prompts/ tree into dist/ after every build.
 *
 * Usage:
 *   node scripts/copy-prompts.js
 */

import { cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const root = join(__dirname, '..');
const src = join(root, 'src', 'prompts');
const dest = join(root, 'dist', 'prompts');

mkdirSync(dest, { recursive: true });

cpSync(src, dest, {
  recursive: true,
  filter: (source) => {
    // Only copy .md files and directories
    return source.endsWith('.md') || !source.includes('.');
  },
});

console.log(`✅ Prompts copied: ${src} → ${dest}`);
