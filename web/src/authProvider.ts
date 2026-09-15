import type { AuthProvider } from 'react-admin'
import type { Auth0ContextInterface, User } from '@auth0/auth0-react'

/**
 * Bridges @auth0/auth0-react's client to the shape react-admin expects.
 * Built from the live useAuth0() context, so it always reflects the
 * current session — login/logout just delegate to Auth0's own redirect
 * flow instead of managing credentials ourselves.
 *
 * Roles are NOT read from Auth0 here: they live in our own Users table
 * and come back from the API (see /api/Me), not from this provider.
 */
export function buildAuthProvider(auth0: Auth0ContextInterface): AuthProvider {
  return {
    async login() {
      await auth0.loginWithRedirect()
    },

    async logout() {
      await auth0.logout({ logoutParams: { returnTo: window.location.origin } })
    },

    async checkAuth() {
      if (!auth0.isAuthenticated) {
        throw new Error('Not authenticated')
      }
    },

    async checkError(error: { status?: number }) {
      if (error?.status === 401 || error?.status === 403) {
        throw new Error('Session expired or not authorized')
      }
    },

    async getIdentity() {
      const user: User | undefined = auth0.user
      return {
        id: user?.sub ?? 'unknown',
        fullName: user?.name ?? user?.email ?? 'Usuario',
        avatar: user?.picture,
      }
    },

    // Permissions/role come from our API's /api/Me (Users.Role), not from
    // Auth0 — nothing to return here for now.
    async getPermissions() {
      return null
    },
  }
}
