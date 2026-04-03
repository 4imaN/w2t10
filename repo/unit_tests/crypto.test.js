process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { encrypt, decrypt, hashPassword, comparePassword, computeFileFingerprint } = require('../api/src/utils/crypto');

describe('Crypto Utils', () => {
  describe('AES-256 Encryption', () => {
    test('encrypts and decrypts text correctly', () => {
      const plaintext = 'Sensitive dispute notes here';
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('returns null for null input', () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
    });

    test('different encryptions of same text produce different ciphertexts (random IV)', () => {
      const text = 'test data';
      const a = encrypt(text);
      const b = encrypt(text);
      expect(a).not.toBe(b);
      expect(decrypt(a)).toBe(text);
      expect(decrypt(b)).toBe(text);
    });
  });

  describe('Password Hashing', () => {
    test('hashes and verifies password', async () => {
      const password = 'MySecurePassword123!';
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);
      const isMatch = await comparePassword(password, hash);
      expect(isMatch).toBe(true);
    });

    test('rejects incorrect password', async () => {
      const hash = await hashPassword('correct');
      const isMatch = await comparePassword('wrong', hash);
      expect(isMatch).toBe(false);
    });
  });

  describe('File Fingerprint', () => {
    test('computes SHA-256 hash of buffer', () => {
      const buffer = Buffer.from('Hello, World!');
      const fingerprint = computeFileFingerprint(buffer);
      expect(fingerprint).toHaveLength(64);
      // Same content → same hash
      const fingerprint2 = computeFileFingerprint(Buffer.from('Hello, World!'));
      expect(fingerprint).toBe(fingerprint2);
    });

    test('different content produces different fingerprints', () => {
      const a = computeFileFingerprint(Buffer.from('file A'));
      const b = computeFileFingerprint(Buffer.from('file B'));
      expect(a).not.toBe(b);
    });
  });
});
