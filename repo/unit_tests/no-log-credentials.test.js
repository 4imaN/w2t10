const fs = require('fs');
const path = require('path');

describe('Bootstrap Credential Security — No Log Exposure', () => {
  const seedFile = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'db', 'seed.js'), 'utf-8'
  );

  test('seed does NOT print credential values to console.log', () => {
    const lines = seedFile.split('\n');
    const dangerousLines = lines.filter(l =>
      l.includes('console.log') && (l.includes('c.password') || l.includes('${c.password'))
    );
    expect(dangerousLines).toHaveLength(0);
  });

  test('seed does NOT print credentials in console output', () => {
    expect(seedFile).not.toContain('console.log(`║');
    expect(seedFile).not.toContain('console.log(c.password');
  });

  test('seed writes credentials to a file instead', () => {
    expect(seedFile).toContain('writeFileSync');
    expect(seedFile).toContain('.bootstrap-credentials');
  });

  test('credential file has restrictive permissions', () => {
    expect(seedFile).toContain('0o600');
  });

  test('seed tells user to delete the credential file', () => {
    expect(seedFile).toContain('DELETE THIS FILE');
  });

  test('gitignore blocks credential file', () => {
    const gitignore = fs.readFileSync(
      path.join(__dirname, '..', '.gitignore'), 'utf-8'
    );
    expect(gitignore).toContain('.bootstrap-credentials');
  });
});
