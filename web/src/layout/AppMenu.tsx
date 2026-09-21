import { Box, List, ListSubheader, Typography } from '@mui/material'
import { Menu } from 'react-admin'

// Sidebar calcada del Design: tres grupos (General / Finanzas / Operación),
// más "SuperUsuario" arriba de todo y, ahora, "Administración" entre
// General y Finanzas para las pantallas de gestión de la colonia en sí
// (Unidades y Gastos). "Inicio", "Cuotas y pagos" (ahora un recurso real
// contra /api/payments, ya no el cascarón de FeesShell), "Colonia",
// "Unidades", "Gastos" y "Directorio de residentes" tienen pantalla real
// hoy — el resto son placeholders visibles pero sin navegación, a
// propósito: mejor eso que un link que lleva a una pantalla en blanco.
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
// SuperUsuario es un nivel aparte (todavía sin ningún control de permisos:
// eso llega después) para las pantallas de administración de la
// plataforma en sí — por ahora, la gestión de Colonias. Administración,
// en cambio, es del lado del administrador de una colonia (todavía sin
// distinción de permisos tampoco).
type Item = { text: string; to?: string }

const groups: { label: string; items: Item[] }[] = [
  {
    label: 'SuperUsuario',
    items: [{ text: 'Colonia', to: '/neighborhoods' }],
  },
  {
    label: 'General',
    items: [{ text: 'Inicio', to: '/' }, { text: 'Directorio de residentes', to: '/residents' }],
  },
  {
    label: 'Administración',
    items: [
      { text: 'Unidades', to: '/units' },
      { text: 'Gastos', to: '/expenses' },
      { text: 'Guardias', to: '/security-staff' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { text: 'Cuotas y pagos', to: '/payments' },
      { text: 'Estado de cuenta' },
      { text: 'Presupuesto' },
    ],
  },
  {
    label: 'Operación',
    items: [
      { text: 'Visitas y acceso' },
      { text: 'Mantenimiento' },
      { text: 'Incidencias' },
      { text: 'Documentos' },
    ],
  },
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
  return (
    // pt: un poco de aire entre el borde del menú superior y el primer
    // grupo, para que no arranque pegado.
    <Menu sx={{ pt: 2 }}>
      {groups.map((group) => (
        <List
          key={group.label}
          dense
          subheader={
            <ListSubheader
              disableSticky
              sx={{
                bgcolor: 'transparent',
                lineHeight: 2.2,
                fontSize: '0.68rem',
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
