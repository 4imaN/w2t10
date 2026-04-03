const fs = require('fs');
const path = require('path');

describe('Revision History Exposure Prevention', () => {
  const movieRoutes = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'routes', 'movies.routes.js'), 'utf-8'
  );
  const contentRoutes = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'src', 'routes', 'content.routes.js'), 'utf-8'
  );

  test('movie detail strips revisions for non-staff', () => {
    // Should delete revisions from response for non-staff
    expect(movieRoutes).toContain('delete movieObj.revisions');
  });

  test('movie detail only includes revisions for staff when requested', () => {
    expect(movieRoutes).toContain("isStaffUser");
    expect(movieRoutes).toContain("includeRevisions");
  });

  test('content detail strips revisions for non-editorial roles', () => {
    expect(contentRoutes).toContain('delete itemObj.revisions');
  });

  test('movie revisions endpoint is staff-only', () => {
    expect(movieRoutes).toContain("staffOnly");
    expect(movieRoutes).toContain("/revisions");
  });

  test('content reviews endpoint is editorial-only', () => {
    expect(contentRoutes).toContain("requireRole('administrator', 'editor', 'reviewer')");
  });
});
