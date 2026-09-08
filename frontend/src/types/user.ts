import type { ID } from './common'

/**
 * A system user — separate from `AuthUser` (services/api/authService.ts),
 * which is the currently *logged-in* session's own identity; this is a row
 * in the Users management table, as seen by an admin managing other users.
 */
export interface AppUser {
  id: ID
  name: string
  email: string
  isActive: boolean
  /** Role names currently assigned — see Role below for what each grants. */
  roles: string[]
  createdAt: string
}

/**
 * A role — a named, freely editable set of permissions (adapted from the
 * V12 project's Spatie-based role/permission architecture). Seeded starting
 * roles (Admin/Manager/Staff) are just a starting point, not fixed —
 * anyone with ROLES_EDIT can create, rename, or change what any role grants.
 */
export interface Role {
  id: ID
  name: string
  permissions: string[]
  createdAt: string
}
