import SearchIcon from '@mui/icons-material/Search'
import { Avatar, Box, Divider, InputAdornment, TextField, Typography } from '@mui/material'
import { AppBar, Logout, UserMenu, useGetIdentity } from 'react-admin'

// Encabezado calcado del Design: wordmark a la izquierda, buscador al
// centro, identidad del usuario a la derecha. `color="secondary"` es el
// default de <AppBar> en react-admin (un gris oscuro en esta paleta) —
// lo pisamos acá para que quede la barra clara del mockup.
function initialsFrom(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

// El rol ("Administradora") es de ejemplo, igual que el resto del
// cascarón: el login de Auth0 ya da el nombre real, pero el rol todavía
// no llega al frontend (hoy solo vive en /api/Me).
function IdentityMenuHeader() {
  const { identity, isPending } = useGetIdentity()
  return (
    <Box sx={{ px: 2, py: 1.5, minWidth: 200 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {isPending ? 'Cargando…' : (identity?.fullName ?? 'Usuario')}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Administradora
      </Typography>
    </Box>
  )
}

function AppUserMenu() {
  const { identity } = useGetIdentity()
  return (
    <UserMenu icon={<Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>{initialsFrom(identity?.fullName)}</Avatar>}>
      <IdentityMenuHeader />
      <Divider />
      <Logout />
    </UserMenu>
  )
}

export function AppTopBar() {
  return (
    <AppBar
      userMenu={<AppUserMenu />}
      sx={{
        backgroundColor: 'background.paper',
        color: 'text.primary',
        boxShadow: 'none',
        borderBottom: '2px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mr: 3, whiteSpace: 'nowrap' }}>
        <Typography variant="subtitle1" fontWeight={700} letterSpacing="0.02em">
          COLONIAS
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Administración
        </Typography>
      </Box>

      <TextField
        size="small"
        placeholder="Buscar unidad, residente o documento"
        variant="outlined"
        sx={{ flex: 1, maxWidth: 420, bgcolor: 'background.default' }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      <Box sx={{ flex: 1 }} />
    </AppBar>
  )
}
