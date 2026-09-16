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

// Iniciales para el avatar del topbar (ej. "Beto Fuentes" -> "BF"), a
// partir del nombre real o, si no hay nombre, de la parte local del
// correo. Es un dato de bajo riesgo (una o dos letras, no el correo
// completo) así que no pasa por el mismo filtro que fullName.
function getInitials(name?: string | null, email?: string | null): string {
  const raw = (name && name.trim()) || (email ? email.split('@')[0] : '')
  if (!raw) return 'U'
  const words = raw.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return words[0].slice(0, 2).toUpperCase()
}

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
      // fullName nunca cae al correo: el menú de usuario ya no usa el
      // <UserMenu> de react-admin (armamos uno propio en AppTopBar sin
      // tooltip), pero dejamos esta regla igual por si algo más llega a
      // mostrar fullName en el futuro. Si Auth0 no tiene un "name" real
      // cargado para el usuario, mostramos un genérico en vez del correo.
      return {
        id: user?.sub ?? 'unknown',
        fullName: user?.name && user.name !== user?.email ? user.name : 'Usuario',
        avatar: user?.picture,
        initials: getInitials(user?.name, user?.email),
      }
    },

    // Permissions/role come from our API's /api/Me (Users.Role), not from
    // Auth0 — nothing to return here for now.
    async getPermissions() {
      return null
    },
  }
}
