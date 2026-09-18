import { Box, List, ListSubheader, Typography } from '@mui/material'
import { Menu } from 'react-admin'

// Sidebar calcada del Design: tres grupos (General / Finanzas / Operación),
// más "SuperUsuario" arriba de todo. Solo "Inicio", "Cuotas y pagos" y
// "Colonia" tienen pantalla real hoy — el resto son placeholders visibles
// pero sin navegación, a propósito: mejor eso que un link que lleva a una
// pantalla en blanco.
//
// SuperUsuario es un nivel aparte (todavía sin ningún control de permisos:
// eso llega después) para las pantallas de administración de la
// plataforma en sí — por ahora, la gestión de Colonias.
type Item = { text: string; to?: string }

const groups: { label: string; items: Item[] }[] = [
  {
    label: 'SuperUsuario',
    items: [{ text: 'Colonia', to: '/neighborhoods' }],
  },
  {
    label: 'General',
    items: [{ text: 'Inicio', to: '/' }, { text: 'Directorio de residentes' }],
  },
  {
    label: 'Finanzas',
    items: [
      { text: 'Cuotas y pagos', to: '/cuotas' },
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
