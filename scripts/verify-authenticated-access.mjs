import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

class VerificationError extends Error {}

// A failed request is not evidence that RLS filtered a successfully authenticated query.
export function requireRows(result, label) {
  if (result.error || !Array.isArray(result.data) || result.status !== 200) {
    throw new VerificationError(`${label}: request failed; this is NOT a passing access check.`);
  }
  return result.data;
}

export async function verifyAccess(accounts, report = console.log) {
  if (accounts.length !== 2 || !accounts[0].userId || !accounts[1].userId || accounts[0].userId === accounts[1].userId) {
    throw new VerificationError('Use two different accounts: A is admin, B is a regular user.');
  }
  const attempts = [];
  for (const [index, account] of accounts.entries()) {
    const label = index === 0 ? 'Account A' : 'Account B';
    const profiles = requireRows(await account.client.from('profiles').select('user_id, role'), `${label} profile`);
    if (profiles.length !== 1 || profiles[0].user_id !== account.userId || profiles[0].role !== (index === 0 ? 'admin' : 'user')) {
      throw new VerificationError(`${label}: unexpected profile visibility or role. A must be admin; B must be user.`);
    }
    const own = requireRows(await account.client.from('attempts').select('id, user_id').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1), `${label} own interview`);
    if (own.length !== 1 || own[0].user_id !== account.userId) {
      throw new VerificationError(`${label}: finish an interview with one message and one hint before testing.`);
    }
    for (const table of ['attempt_messages', 'hint_events']) {
      const rows = requireRows(await account.client.from(table).select('id, attempt_id').eq('attempt_id', own[0].id).limit(1), `${label} own ${table}`);
      if (!rows.length || rows.some((row) => row.attempt_id !== own[0].id)) {
        throw new VerificationError(`${label}: the latest completed interview must contain a message and a hint.`);
      }
    }
    attempts.push(own[0].id);
    report(`PASS: ${label} has the expected role and can read its own interview, messages, and hints.`);
  }

  for (const [index, account] of accounts.entries()) {
    const label = index === 0 ? 'Account A' : 'Account B';
    const otherAttempt = attempts[1 - index];
    for (const [table, column] of [['attempts', 'id'], ['attempt_messages', 'attempt_id'], ['hint_events', 'attempt_id']]) {
      // Intentionally no user_id filter: the database must enforce ownership itself.
      const rows = requireRows(await account.client.from(table).select('id').eq(column, otherAttempt).limit(1), `${label} other-account ${table}`);
      if (rows.length) throw new VerificationError(`${label}: another account's ${table} is visible.`);
    }
    report(`PASS: ${label} cannot read the other account's interview, messages, or hints.`);
  }

  const [admin, user] = accounts;
  const packages = requireRows(await admin.client.from('problem_evaluation_packages').select('problem_version_id').limit(1), 'Admin private package');
  if (!packages.length) throw new VerificationError('No admin-visible evaluation package exists; the private access check is inconclusive.');
  const hidden = requireRows(await user.client.from('problem_evaluation_packages').select('problem_version_id').eq('problem_version_id', packages[0].problem_version_id), 'Regular user private package');
  if (hidden.length) throw new VerificationError('The regular user can read an existing private evaluation package.');
  report('PASS: an existing admin-visible evaluation package is hidden from the regular user.');
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Run pnpm verify:access directly in an interactive terminal. Do not pipe account credentials.');
    process.exitCode = 1;
    return;
  }
  const require = createRequire(import.meta.url);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [path.dirname(require.resolve('next/package.json'))] }));
  loadEnvConfig(root, true, { info() {}, error() {} });
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  let base;
  try { base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL); } catch { /* Report without exposing configuration. */ }
  if (!base || base.protocol !== 'https:' || !base.hostname.endsWith('.supabase.co') || base.username || base.password || !key?.startsWith('sb_publishable_')) {
    console.error('Set the hosted Supabase URL and sb_publishable_ key in .env.local. No elevated key is supported.');
    process.exitCode = 1;
    return;
  }

  let hidden = false;
  let cleaningUp = false;
  const cancelled = new AbortController();
  const output = new Writable({ write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk, encoding);
    done();
  } });
  const terminal = createInterface({ input: process.stdin, output, terminal: true });
  terminal.on('SIGINT', () => terminal.close());
  terminal.on('close', () => cancelled.abort());
  async function ask(label, secret = false) {
    hidden = secret;
    if (secret) process.stdout.write(label);
    try { return await terminal.question(secret ? '' : label, { signal: cancelled.signal }); }
    finally { hidden = false; if (secret) process.stdout.write('\n'); }
  }
  const accounts = [];
  const clients = [];
  let passed = false;
  try {
    console.log('M2 Data API checks. A: admin account. B: a different regular account.');
    console.log('Each account needs a completed interview containing a message and a hint.');
    console.log('Passwords are hidden. Credentials stay in memory; application data is only read.');
    for (const label of ['A', 'B']) {
      const email = (await ask(`Account ${label} email: `)).trim();
      let password = await ask(`Account ${label} password (hidden): `, true);
      const client = createClient(base.origin, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (url, options = {}) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.any([
          AbortSignal.timeout(15000), ...(!cleaningUp ? [cancelled.signal] : []), ...(options.signal ? [options.signal] : []),
        ]) }) },
      });
      clients.push(client);
      let result;
      try { result = await client.auth.signInWithPassword({ email, password }); }
      finally { password = ''; }
      if (result.error || !result.data.session || !result.data.user) {
        throw new VerificationError(`Account ${label}: sign-in failed. Check the password, email confirmation, and project.`);
      }
      const verified = await client.auth.getUser();
      if (verified.error || verified.data.user?.id !== result.data.user.id) throw new VerificationError(`Account ${label}: unable to validate the Auth session.`);
      accounts.push({ client, userId: verified.data.user.id });
      console.log(`Account ${label}: Auth session verified.`);
    }
    await verifyAccess(accounts);
    passed = true;
  } catch (error) {
    console.error(error instanceof VerificationError ? `NOT PASSED: ${error.message}` : 'NOT PASSED: cancelled or unable to complete a request. No raw error or credentials were printed.');
    process.exitCode = 1;
  } finally {
    cleaningUp = true;
    terminal.close();
    for (const client of clients) {
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch {
        console.error('The verifier could not close one of its own Auth sessions. No global sign-out was requested.');
        process.exitCode = 1;
      }
    }
  }
  if (passed) console.log('Data API checks passed. Complete the browser route and response checks in docs/M2_VERIFICATION.md.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
