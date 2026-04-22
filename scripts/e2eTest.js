#!/usr/bin/env node
/**
 * Runs backend E2E script with correct cwd (loads backend/.env).
 */
const path = require('path');
const { spawnSync } = require('child_process');

const backendScript = path.join(__dirname, '../backend/scripts/e2eTest.js');
const backendDir = path.join(__dirname, '../backend');
const r = spawnSync(process.execPath, [backendScript], {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
