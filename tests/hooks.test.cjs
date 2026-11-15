const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { after, describe, test } = require('node:test');

const pluginRoot = path.resolve(__dirname, '../plugins/no-stupid-answer');
const config = JSON.parse(readFileSync(path.join(pluginRoot, 'hooks/hooks.json'), 'utf8'));
const hook = config.hooks.UserPromptSubmit[0].hooks[0];
const prompt = readFileSync(path.join(pluginRoot, 'prompts/before-answer.txt'), 'utf8');
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'no-stupid-answer-'));
const installedRoot = path.join(fixtureRoot, "plugin ไทย & % ' dollar$");
const unrelatedCwd = path.join(fixtureRoot, 'unrelated working directory');
mkdirSync(path.join(installedRoot, 'prompts'), { recursive: true });
mkdirSync(path.join(unrelatedCwd, 'prompts'), { recursive: true });
copyFileSync(path.join(pluginRoot, 'prompts/before-answer.txt'), path.join(installedRoot, 'prompts/before-answer.txt'));
writeFileSync(path.join(unrelatedCwd, 'prompts/before-answer.txt'), 'WRONG: do not read the session working directory');
after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

const shells = process.platform === 'win32'
  ? [
      { name: 'Windows PowerShell', executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'] },
      { name: 'Windows cmd', executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c'], verbatim: true },
    ]
  : [{ name: 'POSIX sh', executable: '/bin/sh', args: ['-c'] }];
if (process.env.NSA_TEST_POSIX_SHELL) {
  shells.push({ name: 'additional POSIX shell', executable: process.env.NSA_TEST_POSIX_SHELL, args: ['-c'] });
}

function runHook(shell, root) {
  const env = { ...process.env };
  if (root === undefined) delete env.PLUGIN_ROOT;
  else env.PLUGIN_ROOT = root;
  return spawnSync(shell.executable, [...shell.args, hook.command], {
    cwd: unrelatedCwd,
    env,
    input: JSON.stringify({ prompt: 'Do not echo this user input', transcript_path: 'not-read.json' }),
    encoding: 'utf8',
    timeout: hook.timeout * 1000,
    windowsHide: true,
    windowsVerbatimArguments: shell.verbatim || false,
  });
}

for (const shell of shells) {
  describe(shell.name, () => {
    test('emits the installed prompt from an unrelated working directory', () => {
      const result = runHook(shell, installedRoot);
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, prompt);
      assert.equal(result.stderr, '');
    });

    test('preserves UTF-8 prompt text without appending output', () => {
      const unicodeRoot = path.join(fixtureRoot, shell.name, 'unicode');
      mkdirSync(path.join(unicodeRoot, 'prompts'), { recursive: true });
      const content = 'ตรวจหลักฐานก่อนตอบ — café 日本語\nSecond line without a final newline';
      writeFileSync(path.join(unicodeRoot, 'prompts/before-answer.txt'), content, 'utf8');
      const result = runHook(shell, unicodeRoot);
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, content);
      assert.equal(result.stderr, '');
    });

    test('fails without injecting context when PLUGIN_ROOT is absent', () => {
      const result = runHook(shell, undefined);
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
    });

    test('fails without injecting context when the prompt file is missing', () => {
      const result = runHook(shell, unrelatedCwd + '-missing');
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
    });
  });
}
