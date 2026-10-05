import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Temporary database, before any import that opens it.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'palcms-menu-'));

const { applyFixedMenu } = await import('../src/core/site');

const fixed = [
  { url: '/', label: 'Home' },
  { url: '/news', label: 'News' },
];

describe('theme menu (applyFixedMenu)', () => {
  it('leaves the menu alone when the theme locks nothing', () => {
    const menu = [{ label: 'Rules', url: '/p/rules' }];
    expect(applyFixedMenu(menu, [])).toEqual(menu);
  });

  it('puts the locked links first, in the theme order, and keeps the others', () => {
    const menu = [
      { label: 'Rules', url: '/p/rules' },
      { label: 'Actus', url: '/news' },
      { label: 'Guides', url: '/p/guides' },
    ];
    expect(applyFixedMenu(menu, fixed)).toEqual([
      { label: 'Home', url: '/' },
      { label: 'Actus', url: '/news' },
      { label: 'Rules', url: '/p/rules' },
      { label: 'Guides', url: '/p/guides' },
    ]);
  });

  it('puts a deleted locked link back', () => {
    expect(applyFixedMenu([], fixed).map((m) => m.url)).toEqual(['/', '/news']);
  });

  it('never goes over 20 links', () => {
    const menu = Array.from({ length: 25 }, (_, i) => ({ label: `L${i}`, url: `/p/${i}` }));
    expect(applyFixedMenu(menu, fixed)).toHaveLength(20);
  });
});
