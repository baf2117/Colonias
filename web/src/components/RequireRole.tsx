import type { ComponentType } from 'react'
import { Typography } from '@mui/material'
import { usePermissions } from 'react-admin'
import type { Permissions } from '../authProvider'

// Punto de entrada único para todo lo que dependa de rol en el frontend:
// AppMenu.tsx usa isSuperAdministrador para ocultar "SuperUsuario >
// Colonia" del sidebar, y requireSuperAdmin envuelve las pantallas de
// Colonia (List/Create/Show/Edit en App.tsx) para bloquearlas si alguien
// entra directo a /neighborhoods sin pasar por el menú. El backend
// (RequireSuperAdministrador en api/Neighborhoods.cs) es la protección
// real — esto es la del lado del frontend, para no mostrar una pantalla
// que de todos modos el API va a rechazar.
export const isSuperAdministrador = (permissions: Permissions): boolean =>
  permissions?.kind === 'resident' && permissions.superAdministrador

// Directorio de residentes (api/Residents.cs, RequireAdminOrSuperAdmin):
// a diferencia de Colonia (solo superadmin), acá cualquiera de los dos
// roles alcanza — es "administradores y superadministradores" según el
// pedido original, no exclusivo de superadmin.
export const isAdminOrSuperAdmin = (permissions: Permissions): boolean =>
  permissions?.kind === 'resident' && (permissions.administrador || permissions.superAdministrador)

function AccessDenied() {
  return (
    <Typography sx={{ p: 4 }} color="text.secondary">
      No tenés permiso para ver esta sección.
    </Typography>
  )
}

// HOC genérico: envuelve una pantalla de react-admin para que solo se
// monte si `check` da true sobre los permisos actuales. Mientras se
// resuelven los permisos (isPending), no muestra nada — mejor eso que un
// parpadeo mostrando la pantalla real antes de negarla.
export function requireRole<P extends object>(Component: ComponentType<P>, check: (permissions: Permissions) => boolean) {
  return function RoleGuarded(props: P) {
    const { permissions, isPending } = usePermissions<Permissions>()
    if (isPending) return null
    if (!check(permissions ?? null)) {
      return <AccessDenied />
    }
    return <Component {...props} />
  }
}

export function requireSuperAdmin<P extends object>(Component: ComponentType<P>) {
  return requireRole(Component, isSuperAdministrador)
}

export function requireAdminOrSuperAdmin<P extends object>(Component: ComponentType<P>) {
  return requireRole(Component, isAdminOrSuperAdmin)
}
