import { Membership } from '../types/identity';
import { PermissionAction, ROLE_PERMISSIONS } from './rolePermissions';

export class AuthorizationService {
  public static can(
    membership: Membership | null,
    action: PermissionAction,
    scopeTargetId?: string
  ): boolean {
    if (!membership) return false;
    
    const allowed = ROLE_PERMISSIONS[membership.role];
    if (allowed === '*') return true;
    
    if (!allowed.includes(action)) return false;

    // Check scope permissions if target specified
    if (scopeTargetId && membership.scopes.length > 0) {
      const match = membership.scopes.some(
        (scope) => scope.id === scopeTargetId || scope.id === '*'
      );
      if (!match) return false;
    }

    return true;
  }
}
