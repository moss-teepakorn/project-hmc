/**
 * useRolePermissions hook
 * Provides easy access to role-based permissions for the current user
 */

import { useAuth } from '../contexts/AuthContext';
import { getPermissionsByRole, isTabVisible as isRoleTabVisible, getMaskedAmount, type RolePermissions, USER_SCREEN_IDS, type ScreenAccessLevel } from '../constants/rolePermissions';

export function useRolePermissions(): RolePermissions & {
  isTabVisible: (tabId: string) => boolean;
  getScreenAccess: (screenId: string) => ScreenAccessLevel;
  getMaskedAmount: (amount: number) => number;
} {
  const { profile } = useAuth();
  const role = profile?.role;
  const permissions = getPermissionsByRole(role);
  const customScreens = profile?.screenPermissions;
  const isAdmin = role === 'admin';
  const getScreenAccess = (screenId: string): ScreenAccessLevel => {
    if (isAdmin) return 'full';
    if (Array.isArray(customScreens)) return new Set(customScreens).has(screenId) ? 'full' : 'hidden';
    if (customScreens) return customScreens[screenId] || 'hidden';
    if (screenId === 'portfolio-overview') return permissions.canViewPortfolioOverview ? 'full' : 'hidden';
    return isRoleTabVisible(screenId, role) ? 'full' : 'hidden';
  };
  const visibleProjectTabs = USER_SCREEN_IDS
    .filter((screenId) => screenId !== 'portfolio-overview' && getScreenAccess(screenId) !== 'hidden');

  return {
    ...permissions,
    visibleProjectTabs,
    canViewPortfolioOverview: getScreenAccess('portfolio-overview') !== 'hidden',
    isTabVisible: (tabId: string) => getScreenAccess(tabId) !== 'hidden',
    getScreenAccess,
    getMaskedAmount: (amount: number) => getMaskedAmount(amount, role),
  };
}
