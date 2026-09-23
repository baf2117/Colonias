import type { ComponentType } from 'react'
import { Typography } from '@mui/material'
import { usePermissions, useTranslate } from 'react-admin'
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

// Residente "puro": tiene el rol Residente pero ni Administrador ni
// SuperAdministrador. Usado en PaymentList.tsx para ocultar el filtro
// por unidad y la columna Unidad -- el backend (api/Payments.cs) ya
// fuerza el alcance a la unidad de este usuario, asi que mostrarle un
// filtro por unidad o una columna Unidad no tendria sentido (siempre va
// a ser la misma).
export const isPureResident = (permissions: Permissions): boolean =>
  permissions?.kind === 'resident' &&
  permissions.residente &&
  !permissions.administrador &&
  !permissions.superAdministrador

// Espejo en el frontend de RequireCanEditResidentAsync en
// api/Residents.cs (la protección real); esto solo evita mostrar un
// botón/formulario que el API de todos modos va a rechazar. Reglas, en
// orden:
//  1. Cualquiera puede editar su propia ficha.
//  2. Nadie más puede editar la ficha de un SuperAdministrador -- ni
//     siquiera otro SuperAdministrador.
//  3. Un Administrador (sin SuperAdministrador) tampoco puede editar a
//     OTRO Administrador. Un SuperAdministrador sí puede.
export function canEditResident(
  permissions: Permissions,
  target: { id: number; administrador: boolean; superAdministrador: boolean },
): boolean {
  if (permissions?.kind !== 'resident') return false
  if (permissions.residentId === target.id) return true
  if (target.superAdministrador) return false
  return !target.administrador || permissions.superAdministrador
}

// Solo un SuperAdministrador puede dejar a alguien (incluido él mismo)
// como SuperAdministrador -- espejo de RequireCanGrantSuperAdministrador
// en api/Residents.cs. Se usa para ocultar el checkbox
// "SuperAdministrador" en ResidentCreate/ResidentEdit cuando quien edita
// no puede otorgarlo.
export const canGrantSuperAdministrador = (permissions: Permissions): boolean =>
  permissions?.kind === 'resident' && permissions.superAdministrador

export function AccessDenied() {
  const translate = useTranslate()
  return (
    <Typography sx={{ p: 4 }} color="text.secondary">
      {translate('app.common.accessDenied')}
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
