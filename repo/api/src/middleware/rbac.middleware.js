const { ForbiddenError } = require('../utils/errors');

/**
 * Creates middleware that restricts access to specified roles.
 * @param  {...string} allowedRoles - Roles that may access the route
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Role '${req.user.role}' does not have permission for this action`));
    }
    next();
  };
}

// Convenience shortcuts
const adminOnly = requireRole('administrator');
const staffOnly = requireRole('administrator', 'editor');
const reviewerOnly = requireRole('administrator', 'reviewer');
const dispatcherOnly = requireRole('administrator', 'dispatcher');
const dispatcherOrAdmin = requireRole('administrator', 'dispatcher');
const allRoles = requireRole('administrator', 'editor', 'reviewer', 'dispatcher', 'regular_user');

module.exports = {
  requireRole,
  adminOnly,
  staffOnly,
  reviewerOnly,
  dispatcherOnly,
  dispatcherOrAdmin,
  allRoles
};
