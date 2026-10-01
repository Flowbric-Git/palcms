import { describe, expect, it } from 'vitest';
import { joinBase, normalizeBasePath, routePrefix } from '../src/basePath';

describe('BASE_PATH', () => {
  it.each([
    ['', '/'],
    ['/', '/'],
    ['cms', '/cms/'],
    ['/cms', '/cms/'],
    ['/cms/', '/cms/'],
    ['//cms//panel', '/cms/panel/'],
    ['  /mon-site_2 ', '/mon-site_2/'],
  ])('normalise %j en %j', (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it.each(['/cms;rm', '/c ms', '/cms?x=1', '/../etc', '/café', '/cms"'])('refuses %j', (input) => {
    expect(() => normalizeBasePath(input)).toThrow();
  });

  it('computes the route prefix and the links', () => {
    expect(routePrefix('/')).toBe('');
    expect(routePrefix('/cms/')).toBe('/cms');
    expect(joinBase('/cms/', '/api/public/status')).toBe('/cms/api/public/status');
    expect(joinBase('/', 'setup')).toBe('/setup');
  });
});
