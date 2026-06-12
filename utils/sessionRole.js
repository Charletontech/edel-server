const VALID_SESSION_ROLES = new Set(['customer', 'provider']);

const getSessionRole = (user, requestedRole) => {
  if (!user) return null;

  if (user.role === 'admin') {
    return 'admin';
  }

  if (user.role === 'both') {
    const normalizedRole = String(requestedRole || '').trim().toLowerCase();
    return VALID_SESSION_ROLES.has(normalizedRole) ? normalizedRole : null;
  }

  return user.role;
};

const canUseCustomerFeatures = (user, sessionRole) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'customer' || sessionRole === 'customer';
};

const canUseProviderFeatures = (user, sessionRole) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'provider' || sessionRole === 'provider';
};

module.exports = {
  getSessionRole,
  canUseCustomerFeatures,
  canUseProviderFeatures
};
