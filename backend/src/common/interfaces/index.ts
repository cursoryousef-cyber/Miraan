// ============================================================================
// Common Interfaces — Shared types across all modules
// ============================================================================

/**
 * Authenticated user context attached to every request after JWT validation.
 * Contains the current user's identity and organizational context.
 */
export interface IAuthenticatedUser {
  /** UserAccount ID */
  accountId: string;
  /** Person ID */
  personId: string;
  /** Current active organization ID (switchable) */
  organizationId: string;
  /** Email */
  email: string;
  /** Display name (Arabic) */
  nameAr: string;
  /** Display name (English) */
  nameEn?: string;
  /** Role codes for the current organization */
  roles: string[];
  /** Permission codes for the current organization (resolved from roles + direct) */
  permissions: string[];
}

/**
 * Pagination parameters
 */
export interface IPaginationParams {
  page: number;
  limit: number;
}

/**
 * Paginated response wrapper
 */
export interface IPaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Standard API response wrapper
 */
export interface IApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

/**
 * Organization context — resolved from JWT + request
 */
export interface IOrgContext {
  organizationId: string;
  organizationCode: string;
  organizationTypeCode: string;
}

/**
 * Audit log entry
 */
export interface IAuditEntry {
  organizationId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
