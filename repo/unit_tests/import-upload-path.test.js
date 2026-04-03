const fs = require('fs');
const path = require('path');

describe('Movie Import Upload Path', () => {
  const uploadDir = path.join(__dirname, '..', 'uploads');

  test('imports directory can be created at runtime', () => {
    const importsDir = path.join(uploadDir, 'imports');
    fs.mkdirSync(importsDir, { recursive: true });
    expect(fs.existsSync(importsDir)).toBe(true);
    // Cleanup
    fs.rmdirSync(importsDir, { recursive: true });
  });

  test('Dockerfile provisions imports directory', () => {
    const dockerfile = fs.readFileSync(
      path.join(__dirname, '..', 'Dockerfile.api'), 'utf-8'
    );
    expect(dockerfile).toContain('/app/uploads/imports');
  });

  test('movie-import route sets uploadSubdir to imports', () => {
    const routeFile = fs.readFileSync(
      path.join(__dirname, '..', 'api', 'src', 'routes', 'movie-import.routes.js'), 'utf-8'
    );
    expect(routeFile).toContain("req.uploadSubdir = 'imports'");
    expect(routeFile).toContain("mkdirSync");
  });

  test('file-upload.js uses req.uploadSubdir for destination', () => {
    const uploadFile = fs.readFileSync(
      path.join(__dirname, '..', 'api', 'src', 'utils', 'file-upload.js'), 'utf-8'
    );
    expect(uploadFile).toContain('req.uploadSubdir');
  });
});
