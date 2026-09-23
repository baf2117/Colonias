import { Box, List, ListSubheader, Typography } from '@mui/material'
import { Menu, usePermissions } from 'react-admin'
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
// se sacó del menú a pedido del usuario. Un ítem sin `to` se muestra como
// placeholder visible pero sin navegación.
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
type Item = { text: string; to?: string; adminOnly?: boolean; residentsOnly?: boolean }

const groups: { label: string; items: Item[] }[] = [
  {
    label: 'SuperUsuario',
    items: [{ text: 'Colonia', to: '/neighborhoods' }],
  },
  {
    label: 'General',
    items: [{ text: 'Inicio', to: '/' }, { text: 'Directorio de residentes', to: '/residents', adminOnly: true }],
  },
  {
    label: 'Administración',
    items: [
      { text: 'Unidades', to: '/units', adminOnly: true },
      { text: 'Gastos', to: '/expenses', adminOnly: true },
      { text: 'Guardias', to: '/security-staff', adminOnly: true },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { text: 'Cuotas y pagos', to: '/payments' },
      { text: 'Balance Banco', to: '/bank-statements', adminOnly: true },
      { text: 'Estado de cuentas', to: '/account-statement', residentsOnly: true },
    ],
  },
  // El grupo "Operación" (Visitas y acceso, Mantenimiento, Incidencias,
  // Documentos) se sacó del menú a pedido del usuario: son
  // funcionalidades que todavía no se van a implementar, así que ni
  // siquiera tiene sentido mostrarlas como placeholder "próximamente".
]

function PlaceholderItem({ text }: { text: string }) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        cursor: 'default',
        color: 'text.secondary',
        opacity: 0.6,
      }}
    >
      <Typography variant="body2">{text}</Typography>
    </Box>
  )
}

export function AppMenu() {
  const { permissions } = usePermissions<Permissions>()
  const resolvedPermissions = permissions ?? null
  // Mismo criterio que el grupo SuperUsuario, pero a nivel de ítem: acá
  // "Directorio de residentes" convive con "Inicio" (visible para
  // cualquiera) dentro del mismo grupo General, así que el filtro tiene
  // que aplicarse ítem por ítem, no ocultando el grupo entero.
  const visibleGroups = groups
    .filter((group) => group.label !== 'SuperUsuario' || isSuperAdministrador(resolvedPermissions))
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
      {visibleGroups.map((group) => (
        <List
          key={group.label}
          dense
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
              }}
            >
              {group.label.toUpperCase()}
            </ListSubheader>
          }
        >
          {group.items.map((item) =>
            item.to ? (
              // El ítem activo (react-admin agrega la clase
              // RaMenuItemLink-active vía NavLink) toma el acento único de
              // la plataforma (primary.main), con una regla de 2px a la
              // izquierda — el mismo motivo de "una sola línea de 2px" que
              // ya usan los botones outlined y los dividers del tema.
              <Menu.Item
                key={item.text}
                to={item.to}
                primaryText={item.text}
                sx={{
                  '&.RaMenuItemLink-active': {
                    color: 'primary.main',
                    fontWeight: 700,
                    borderLeft: '2px solid',
                    borderColor: 'primary.main',
                  },
                }}
              />
            ) : (
              <PlaceholderItem key={item.text} text={item.text} />
            ),
          )}
        </List>
      ))}
    </Menu>
  )
}
