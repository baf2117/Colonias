import { List, ListSubheader } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Menu, usePermissions, useTranslate } from 'react-admin'
import type { Permissions } from '../authProvider'
import { isAdminOrSuperAdmin, isSuperAdministrador } from '../components/RequireRole'

// Sidebar calcada del Design: originalmente tres grupos (General /
// Finanzas / Operación) más "SuperUsuario" arriba de todo y
// "Administración" entre General y Finanzas para las pantallas de
// gestión de la colonia en sí (Unidades, Gastos y Guardias). "Operación"
// se sacó del todo (ver más abajo, junto al array de grupos): eran puros
// placeholders de funcionalidad que no se va a construir por ahora.
// "Inicio", "Cuotas y pagos" (ahora un recurso real contra /api/payments,
// ya no el cascarón de FeesShell), "Colonia", "Unidades", "Gastos",
// "Guardias", "Directorio de residentes", "Balance Banco" y "Estado de
// cuentas" (solo administradores) tienen pantalla real hoy. "Presupuesto"
// se sacó del menú a pedido del usuario; ya no quedan ítems placeholder.
//
// "Gastos" no tiene un ítem hermano de "Proveedores": los proveedores
// (dbo.Vendors) se dan de alta al vuelo desde el propio formulario de
// Crear/Editar Gasto (ver expenses/ExpenseCreate.tsx y
// vendors/CreateVendorDialog.tsx) en vez de tener una pantalla de
// gestión aparte.
//
// Ya no hay un CRUD de "Cuotas" aparte (existió brevemente sobre
// dbo.Fees): la cuota ahora vive en Colonia (cuota general,
// defaultFeeAmount) y, opcionalmente, en cada Unidad (cuota propia,
// feeAmount) — ver NeighborhoodEdit/Show y UnitCreate/Edit/Show.
// "Cuotas y pagos" sí sigue existiendo como recurso: es dbo.Payments,
// contra qué mes y unidad se registra un comprobante — ver payments/.
//
// Permisos por rol (ver también components/RequireRole.tsx y la sección
// "Permisos por rol" del documento de arquitectura): "SuperUsuario" se
// oculta entero si el usuario no es superadministrador
// (isSuperAdministrador), y "Administración" (Unidades, Gastos,
// Guardias) más "Directorio de residentes" dentro de General se ocultan
// si no es administrador ni superadministrador (isAdminOrSuperAdmin,
// marcado por ítem con Item.adminOnly — Administración termina sin
// ítems visibles para otros roles, así que el grupo entero desaparece,
// ver el filtro de grupos vacíos más abajo). La protección real vive en
// el backend (RequireSuperAdministrador/RequireAdminOrSuperAdmin en cada
// api/*.cs) y en los HOC requireSuperAdmin/requireAdminOrSuperAdmin que
// envuelven las pantallas en App.tsx — esto es solo para no mostrar un
// link que de todos modos va a terminar en "acceso denegado".
// residentsOnly: cualquier usuario con fila en Residents (residente o
// administrador), pero no un guardia (kind 'staff').
// Los textos salen de app.menu.* (i18n/app-es.ts / app-en.ts): `id` del
// grupo y `key` del ítem son las claves, no el texto visible.
type Item = { key: string; to: string; adminOnly?: boolean; residentsOnly?: boolean }

const groups: { id: 'superuser' | 'general' | 'administration' | 'finance'; items: Item[] }[] = [
  {
    id: 'superuser',
    items: [{ key: 'neighborhoods', to: '/neighborhoods' }],
  },
  {
    id: 'general',
    items: [{ key: 'home', to: '/' }, { key: 'residents', to: '/residents', adminOnly: true }],
  },
  {
    id: 'administration',
    items: [
      { key: 'units', to: '/units', adminOnly: true },
      { key: 'expenses', to: '/expenses', adminOnly: true },
      { key: 'guards', to: '/security-staff', adminOnly: true },
    ],
  },
  {
    id: 'finance',
    items: [
      { key: 'payments', to: '/payments' },
      { key: 'bankStatements', to: '/bank-statements', adminOnly: true },
      { key: 'accountStatement', to: '/account-statement', residentsOnly: true },
    ],
  },
  // El grupo "Operación" (Visitas y acceso, Mantenimiento, Incidencias,
  // Documentos) se sacó del menú a pedido del usuario: son
  // funcionalidades que todavía no se van a implementar, así que ni
  // siquiera tiene sentido mostrarlas como placeholder "próximamente".
]

export function AppMenu() {
  const translate = useTranslate()
  const { permissions } = usePermissions<Permissions>()
  const resolvedPermissions = permissions ?? null
  // Mismo criterio que el grupo SuperUsuario, pero a nivel de ítem: acá
  // "Directorio de residentes" convive con "Inicio" (visible para
  // cualquiera) dentro del mismo grupo General, así que el filtro tiene
  // que aplicarse ítem por ítem, no ocultando el grupo entero.
  const visibleGroups = groups
    .filter((group) => group.id !== 'superuser' || isSuperAdministrador(resolvedPermissions))
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.adminOnly || isAdminOrSuperAdmin(resolvedPermissions)) &&
          (!item.residentsOnly || resolvedPermissions?.kind === 'resident'),
      ),
    }))
    // Administración hoy tiene todos sus ítems marcados adminOnly, así que
    // para cualquier otro rol queda sin ítems — hay que sacar el grupo
    // entero en ese caso, si no el subheader "ADMINISTRACIÓN" queda
    // flotando sin nada debajo.
    .filter((group) => group.items.length > 0)

  return (
    // pt: un poco de aire entre el borde del menú superior y el primer
    // grupo, para que no arranque pegado.
    <Menu sx={{ pt: 2 }}>
      {visibleGroups.map((group, index) => (
        <List
          key={group.id}
          dense
          // Línea gris tenue arriba de cada grupo (menos el primero) para
          // separar las secciones. Sale de text.primary con poca opacidad,
          // así que se ve tenue tanto en modo claro como en oscuro.
          sx={
            index > 0
              ? {
                  mt: 1,
                  pt: 1,
                  borderTop: '1px solid',
                  borderColor: (theme) => alpha(theme.palette.text.primary, 0.12),
                }
              : undefined
          }
          subheader={
            <ListSubheader
              disableSticky
              sx={{
                bgcolor: 'transparent',
                lineHeight: 2.2,
                fontSize: '0.805rem', // ~13px (0.68rem + 2px)
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'text.secondary',
                textDecoration: 'underline',
                textDecorationThickness: '2px',
                textUnderlineOffset: '4px',
              }}
            >
              {translate(`app.menu.groups.${group.id}`).toUpperCase()}
            </ListSubheader>
          }
        >
          {group.items.map((item) => (
              // El ítem activo (react-admin agrega la clase
              // RaMenuItemLink-active vía NavLink) toma el acento único de
              // la plataforma (primary.main), con una regla de 2px a la
              // izquierda — el mismo motivo de "una sola línea de 2px" que
              // ya usan los botones outlined y los dividers del tema.
              <Menu.Item
                key={item.key}
                to={item.to}
                primaryText={translate(`app.menu.${item.key}`)}
                sx={{
                  '&.RaMenuItemLink-active': {
                    color: 'primary.main',
                    fontWeight: 700,
                    borderLeft: '2px solid',
                    borderColor: 'primary.main',
                  },
                }}
              />
          ))}
        </List>
      ))}
    </Menu>
  )
}
