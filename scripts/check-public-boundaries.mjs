import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const sources = (await filesIn('src')).filter((file) => /\.(ts|tsx)$/.test(file));
const sourceMap = new Map(await Promise.all(sources.map(async (file) => [path.resolve(file), await readFile(file, 'utf8')])));
const clients = [...sourceMap].filter(([, source]) => /^\s*['"]use client['"]/.test(source));
function walkClient(file, seen = new Set()) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = sourceMap.get(file);
  if (!source || /^\s*['"]use server['"]/.test(source)) return; // Server Action references are permitted.
  assert.ok(!/import\s+['"]server-only['"]/.test(source), `Client graph reaches server-only file: ${file}`);
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const item of ast.statements) {
    if (!ts.isImportDeclaration(item) || item.importClause?.isTypeOnly || !ts.isStringLiteral(item.moduleSpecifier)) continue;
    const name = item.moduleSpecifier.text;
    assert.ok(!name.includes('seed-data') && !name.includes('mocks/server'), `Client imports private fixtures: ${file}`);
    if (!name.startsWith('@/') && !name.startsWith('.')) continue;
    const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name);
    const target = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => sourceMap.has(candidate));
    if (target) walkClient(target, seen);
  }
}
for (const [file] of clients) walkClient(file);
for (const [file, source] of sourceMap) {
  assert.ok(!/from\s+['"][^'"]*seed-data/.test(source), `Runtime source imports seed-only data: ${file}`);
}
const seed = JSON.parse(await readFile('supabase/seed-data.json', 'utf8'));
const privateMarkers = seed.evaluationPackages.flatMap((entry) => [entry.referenceAnswer.slice(0, 100), ...entry.misconceptions.map((item) => item.description), ...entry.hintLadder.map((hint) => hint.text)]).filter((value) => value?.length > 30);
const chunks = (await filesIn('.next/static/chunks')).filter((file) => file.endsWith('.js'));
const html = (await filesIn('.next/server/app')).filter((file) => file.endsWith('.html') && !file.includes('/admin'));
for (const file of [...chunks, ...html]) {
  const content = await readFile(file, 'utf8');
  for (const marker of privateMarkers) assert.ok(!content.includes(marker), `${file} embeds private seed material`);
}
console.log(`Boundary checks passed: ${clients.length} client import graphs, ${chunks.length} browser chunks, ${html.length} static public HTML files.`);
console.log('DB-backed interview payloads are dynamic: inspect live responses after configuring Supabase. This check does not verify live RLS.');
