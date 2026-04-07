import { describe, test, expect } from 'vitest';
import { PORTALS } from '../features/auth/LoginPage';

const BANNED_PATTERNS = [
  /Admin123/i,
  /Editor123/i,
  /Reviewer123/i,
  /Dispatch123/i,
  /User1234/i,
  /\w+\s*\/\s*\w+!/,
];

describe('Login Portal — No Hardcoded Credentials', () => {
  for (const [portalKey, config] of Object.entries(PORTALS)) {
    test(`${portalKey} portal hint does not contain static credentials`, () => {
      for (const pattern of BANNED_PATTERNS) {
        expect(config.hint).not.toMatch(pattern);
      }
    });
  }

  test('no portal hint exposes a username/password pair', () => {
    for (const config of Object.values(PORTALS)) {
      expect(config.hint).not.toMatch(/\w+\s*\/\s*\S+!/);
    }
  });

  test('all portals reference the bootstrap credentials file', () => {
    for (const config of Object.values(PORTALS)) {
      expect(config.hint.toLowerCase()).toContain('bootstrap');
    }
  });
});
