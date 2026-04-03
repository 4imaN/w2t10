const { maskPhone } = require('../api/src/utils/phone-mask');

describe('Phone Masking', () => {
  test('masks 10-digit US phone number', () => {
    expect(maskPhone('4155551021')).toBe('(415) ***-**21');
  });

  test('masks phone with country code', () => {
    expect(maskPhone('14155551021')).toBe('(415) ***-**21');
  });

  test('masks phone with formatting', () => {
    expect(maskPhone('(415) 555-1021')).toBe('(415) ***-**21');
  });

  test('masks short phone number', () => {
    const result = maskPhone('5551021');
    expect(result).toContain('**21');
  });

  test('returns null for null input', () => {
    expect(maskPhone(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(maskPhone('')).toBeNull();
  });
});
