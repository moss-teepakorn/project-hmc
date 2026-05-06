/**
 * useRolePermissions hook
 * Provides easy access to role-based permissions for the current user
 */

import { useAuth } from '../contexts/AuthContext';
import { getPermissionsByRole, isTabVisible, getMaskedAmount, RolePermissions } from '../constants/rolePermissions';

export function useRolePermissions(): RolePermissions & {
  isTabVisible: (tabId: string) => boolean;
  getMaskedAmount: (amount: number) => number;
} {
  const { profile } = useAuth();
  const role = profile?.role;
  const permissions = getPermissionsByRole(role);

  return {
    ...permissions,
    isTabVisible: (tabId: string) => isTabVisible(tabId, role),
    getMaskedAmount: (amount: number) => getMaskedAmount(amount, role),
  };
}
