import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import en from './en.json';
import tr from './tr.json';
import { getLanguage, getLocale, resolveLocale, setLanguage, subscribeLocale, t, translate } from './core.ts';
import { translateActivityLabel } from './activity.ts';
import { Menu } from '../ui/Menu.tsx';
import { formatChatDate } from '../lib/session-time.ts';
import { formatTokenCount } from '../lib/format-tokens.ts';
import { toolUsageSummary } from '../chat/tool-usage.ts';

test('language resolution supports Turkish, English and system fallback', () => {
  assert.equal(resolveLocale('system', 'tr-TR'), 'tr');
  assert.equal(resolveLocale('system', 'en-GB'), 'en');
  assert.equal(resolveLocale('system', 'de-DE'), 'en');
  assert.equal(resolveLocale('tr', 'en-US'), 'tr');
  assert.equal(resolveLocale('en', 'tr-TR'), 'en');
});

test('catalogs cover the same keys, preserve placeholders and include all literal translation calls', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(tr).sort());
  const parameters = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.ok(en[key].trim(), `Empty English translation: ${key}`);
    assert.ok(tr[key].trim(), `Empty Turkish translation: ${key}`);
    assert.deepEqual(parameters(en[key]), parameters(tr[key]), `Mismatched placeholders: ${key}`);
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.tsx?$/.test(file) || file.endsWith('.test.ts')) continue;
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          assert.ok(Object.hasOwn(en, node.arguments[0].text), `${file}: missing translation ${node.arguments[0].text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk(root);
});

test('interpolation and notices translate safely while unknown content stays intact', () => {
  assert.equal(translate('tr', 'Remove {0}', { 0: 'Atlas' }), 'Atlas öğesini kaldır');
  assert.equal(translate('en', 'XeckBot oluştur'), 'Create XeckBot');
  assert.equal(translate('en', translate('tr', 'Could not save rules')), 'Could not save rules');
  for (const key of ['My custom bot – Öğretmen', 'toString', '__proto__', '{toString}']) assert.equal(translate('tr', key), key);
});

test('language changes cache the preference and update the HTML language tag', () => {
  const original = getLanguage();
  const properties = ['window', 'document', 'localStorage'] as const;
  const descriptors = properties.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const values = new Map<string, string>();
  const root = { lang: '' };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: root } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    setLanguage('tr');
    assert.equal(root.lang, 'tr');
    assert.equal(values.get('xeck.language'), 'tr');
    setLanguage('en');
    assert.equal(root.lang, 'en');
    assert.equal(values.get('xeck.language'), 'en');
  } finally {
    properties.forEach((name, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
    setLanguage(original);
  }
});

test('switching language updates menu labels, formatted values and activity without changing protocol IDs', () => {
  const original = getLanguage();
  let notifications = 0;
  const unsubscribe = subscribeLocale(() => { notifications++; });
  const options = [{ value: 'system', label: 'System language' }];
  const menu = () => renderToStaticMarkup(createElement(Menu, { label: 'Language', value: 'system', options, onChange: () => undefined }));
  try {
    setLanguage('en');
    assert.equal(getLocale(), 'en');
    assert.match(menu(), /System language/);
    assert.equal(toolUsageSummary([]), '0 tools');
    const date = new Date(2026, 9, 10).toISOString();
    const englishDate = formatChatDate(date, new Date(2026, 9, 18));
    setLanguage('tr');
    assert.equal(getLocale(), 'tr');
    assert.equal(t('New chat'), 'Yeni sohbet');
    assert.match(menu(), /Sistem dili/);
    assert.match(menu(), /aria-label="Dil"/);
    assert.equal(options[0].value, 'system');
    assert.notEqual(formatChatDate(date, new Date(2026, 9, 18)), englishDate);
    assert.equal(formatTokenCount(1500), '1,5k');
    assert.equal(toolUsageSummary([]), '0 araç');
    assert.equal(translateActivityLabel('File · Read file · C:/Projects/Read file.ts'), 'Dosya · Dosyayı oku · C:/Projects/Read file.ts');
    assert.ok(notifications >= 1);
  } finally { unsubscribe(); setLanguage(original); }
});
