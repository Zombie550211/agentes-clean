// Roles y permisos del sistema
const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  AGENT: 'agent'
};

// Permisos para cada rol
const PERMISSIONS = {
  [ROLES.ADMIN]: {
    canViewAllLeads: true,
    canEditAllLeads: true,
    canDeleteLeads: true,
    canManageUsers: true,
    canViewReports: true,
    canManageSettings: true,
    canExportData: true
  },
  [ROLES.SUPERVISOR]: {
    canViewAllLeads: true,
    canEditAllLeads: true,
    canDeleteLeads: false,
    canManageUsers: false,
    canViewReports: true,
    canManageSettings: false,
    canExportData: true
  },
  [ROLES.AGENT]: {
    canViewAllLeads: false,
    canEditAllLeads: false,
    canDeleteLeads: false,
    canManageUsers: false,
    canViewReports: false,
    canManageSettings: false,
    canExportData: false
  }
};

// Verificar si un rol tiene un permiso específico
const hasPermission = (role, permission) => {
  return PERMISSIONS[role] && PERMISSIONS[role][permission];
};

// Obtener todos los permisos de un rol
const getRolePermissions = (role) => {
  return PERMISSIONS[role] || {};
};

module.exports = {
  ROLES,
  PERMISSIONS,
  hasPermission,
  getRolePermissions
};
