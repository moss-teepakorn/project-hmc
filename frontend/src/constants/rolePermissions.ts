/**
 * Role-based permissions configuration
 * Centralized configuration for controlling visibility and access by user role
 */

export type UserRole = 'admin' | 'member' | 'client';

export interface RolePermissions {
  /** Tab IDs that this role can see in ProjectDetail */
  visibleProjectTabs: string[];
  
  /** Whether to mask financial amounts (show as 0) */
  maskFinancialAmounts: boolean;
  
  /** Whether to show Portfolio Overview tab on Dashboard */
  canViewPortfolioOverview: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    visibleProjectTabs: ['tasks', 'summary', 'members', 'ms', 'effort', 'cr', 'issues', 'risks', 'env', 'report'],
    maskFinancialAmounts: false,
    canViewPortfolioOverview: true,
  },
  member: {
    visibleProjectTabs: ['tasks', 'summary', 'members', 'effort', 'cr', 'issues', 'risks', 'env', 'report'],
    // Note: 'ms' (Milestone) is excluded
    maskFinancialAmounts: true,
    canViewPortfolioOverview: true,
  },
  client: {
    visibleProjectTabs: ['tasks', 'summary', 'members', 'cr', 'issues', 'risks', 'env'],
    // Note: 'ms' (Milestone), 'effort', 'report' are excluded
    maskFinancialAmounts: true,
    canViewPortfolioOverview: false,
  },
};

/**
 * Get permissions for a specific role
 * @param role - The user's role
 * @returns Role permissions, defaults to most restrictive (client) if role is unknown
 */
export function getPermissionsByRole(role?: string): RolePermissions {
  if (role && role in ROLE_PERMISSIONS) {
    return ROLE_PERMISSIONS[role as UserRole];
  }
  // Default to most restrictive permissions
  return ROLE_PERMISSIONS.client;
}

/**
 * Check if a tab is visible for a specific role
 * @param tabId - The tab ID to check
 * @param role - The user's role
 * @returns true if the tab should be visible
 */
export function isTabVisible(tabId: string, role?: string): boolean {
  const permissions = getPermissionsByRole(role);
  return permissions.visibleProjectTabs.includes(tabId);
}

/**
 * Format amount based on role permissions
 * @param amount - The amount to format
 * @param role - The user's role
 * @returns 0 if maskFinancialAmounts is true, otherwise returns original amount
 */
export function getMaskedAmount(amount: number, role?: string): number {
  const permissions = getPermissionsByRole(role);
  return permissions.maskFinancialAmounts ? 0 : amount;
}
