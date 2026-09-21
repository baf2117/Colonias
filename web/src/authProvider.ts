import type { AuthProvider } from 'react-admin'
import type { Auth0ContextInterface, User } from '@auth0/auth0-react'

// Roles resueltos por nuestro propio API (GET /api/Me), nunca por Auth0
// (Auth0 solo autentica: el "sub" del JWT). Un guardia (kind: 'staff') no
// tiene ninguna de las tres columnas booleanas de Residents — no puede
// ser superadministrador ni administrador, así que no hace falta
// declararle esos campos en false.
export type Permissions =
  | { kind: 'resident'; administrador: boolean; superAdministrador: boolean; residente: boolean }
  | { kind: 'staff' }
  | null

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

    // Ojo con esto: 401 sí significa "tu sesión ya no sirve" (JWT vencido
    // o inválido) y ahí react-admin debe cerrar sesión y mandar de vuelta
    // al login. Pero 403 significa otra cosa muy distinta: "tu sesión es
    // válida, simplemente no tenés el rol para esto" (los RequireXxx de
    // cada api/*.cs — RequireSuperAdministrador, RequireAdminOrSuperAdmin —
    // devuelven 403, no 401). Antes esto trataba 403 igual que 401 y
    // cerraba la sesión de cualquier residente/guardia sin rol de
    // administrador apenas el dashboard pegaba contra un recurso
    // restringido (Unidades, Gastos, etc.) — el bug de "me regresa al
    // login" reportado por el usuario. Un 403 tiene que dejar pasar el
    // error tal cual para que la pantalla lo muestre u oculte el dato
    // (como ya hace Dashboard.tsx con unitsError/expensesError), no
    // deslogear a nadie.
    async checkError(error: { status?: number }) {
      if (error?.status === 401) {
        throw new Error('Session expired')
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

    // Permissions/role come from our API's /api/Me, not from Auth0 (ver el
    // comentario de Permissions arriba). react-admin cachea el resultado
    // (usePermissions), así que esto pega contra el API una sola vez por
    // sesión, no en cada chequeo de permisos. AppMenu.tsx y requireSuperAdmin
    // (ver components/RequireRole.tsx) son los primeros en consumirlo.
    async getPermissions(): Promise<Permissions> {
      try {
        const token = await auth0.getAccessTokenSilently()
        const apiUrl = import.meta.env.VITE_API_URL
        const response = await fetch(`${apiUrl}/Me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) return null

        const data = await response.json()
        if (data.kind === 'resident') {
          return {
            kind: 'resident',
            administrador: data.resident.administrador,
            superAdministrador: data.resident.superAdministrador,
            residente: data.resident.residente,
          }
        }
        if (data.kind === 'staff') {
          return { kind: 'staff' }
        }
        return null
      } catch {
        return null
      }
    },
  }
}
