const INSECURE_DEFAULTS = [
  'cineride-local-secret-change-in-production',
  'changeme',
  'secret',
  'jwt-secret',
  'CHANGE_ME_GENERATE_WITH_CRYPTO',
];

function validateEnv() {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('FATAL: JWT_SECRET environment variable is not set.');
    console.error('Run ./setup.sh to generate a secure .env file, or set JWT_SECRET manually.');
    console.error('Manual: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  }

  if (process.env.NODE_ENV !== 'test' && INSECURE_DEFAULTS.includes(jwtSecret)) {
    console.error('FATAL: JWT_SECRET is set to an insecure default/placeholder value.');
    console.error('Run ./setup.sh to generate a secure .env file, or replace the value manually.');
    process.exit(1);
  }

  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey || encKey.length !== 64) {
    console.error('FATAL: ENCRYPTION_KEY must be set as a 64-character hex string (32 bytes).');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
}

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

module.exports = { validateEnv, getJwtSecret };
