import { useState, type MouseEvent } from 'react'
import {
  AppBar as MuiAppBar,
  Avatar,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  useMediaQuery,
  type Theme,
} from '@mui/material'
import {
  LocalesMenuButton,
  ToggleThemeButton,
  useGetIdentity,
  useLogout,
  useTranslate,
} from 'react-admin'

// Encabezado del panel: wordmark a la izquierda, identidad del usuario a
// la derecha (sin buscador, sin correo, sin subtítulo — por pedido
// explícito). Armamos nuestro propio <AppBar>/<Toolbar> de MUI en vez
// de envolver el <AppBar> de react-admin: ese componente agrega SIEMPRE
// un botón para expandir/colapsar el menú lateral al principio de su
// Toolbar — está hardcodeado ahí, sin ninguna prop para sacarlo — y acá
// no queremos ese botón (el menú lateral quedó fijo, ver
// AppSidebar.tsx). LocalesMenuButton y ToggleThemeButton son parte del
// mismo toolbar por defecto que traía el <AppBar> de react-admin; los
// reconstruimos a mano para no perderlos al dejar de usarlo. El
// LoadingIndicator (que además de spinner es un botón de "actualizar"
// cuando no hay carga en curso) se sacó por pedido explícito.

// El menú de usuario NO usa el <UserMenu> de react-admin: ese componente
// envuelve el botón del avatar en un <Tooltip> cuyo título sale de
// identity.fullName, y por eso el texto "Usuario" (nuestro fallback en
// authProvider.ts) se seguía viendo al pasar el mouse aunque no hubiera
// ningún texto visible en el dropdown. Armamos el mismo patrón a mano
// con <IconButton>/<Menu> de MUI para que el ícono no lleve tooltip ni
// label — nada, tal como se pidió.

// El dropdown solo tiene "Cerrar sesión": el rol de ejemplo
// ("Administradora", fijo para todos) se sacó a pedido del usuario. Las
// iniciales del avatar sí son reales: vienen de
// identity.initials (calculadas en authProvider.ts a partir del nombre
// o el correo de Auth0), y si hay foto de perfil se usa esa en su lugar.
function AppUserMenu() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const logout = useLogout()
  const translate = useTranslate()
  const { identity } = useGetIdentity()
  const open = Boolean(anchorEl)

  const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)
  const handleClose = () => setAnchorEl(null)
  const handleLogout = () => {
    handleClose()
    logout()
  }

  const avatarUrl = identity?.avatar
  const initials = (identity as { initials?: string } | undefined)?.initials ?? 'U'

  return (
    <>
      <IconButton onClick={handleOpen} size="small" sx={{ ml: 1 }}>
        <Avatar src={avatarUrl} sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
          {initials}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose} onClick={handleClose}>
        <MenuItem onClick={handleLogout} sx={{ minWidth: 180 }}>
          {translate('ra.auth.logout')}
        </MenuItem>
      </Menu>
    </>
  )
}

export function AppTopBar() {
  const isXSmall = useMediaQuery<Theme>((theme) => theme.breakpoints.down('sm'))

  return (
    <MuiAppBar
      color="transparent"
      sx={{
        backgroundColor: 'background.paper',
        color: 'text.primary',
        boxShadow: 'none',
        borderBottom: '2px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar disableGutters variant={isXSmall ? 'regular' : 'dense'} sx={{ px: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: '0.02em' }}>
          COLONIAS
        </Typography>

        <Box sx={{ flex: 1 }} />

        <LocalesMenuButton />
        <ToggleThemeButton />

        <AppUserMenu />
      </Toolbar>
    </MuiAppBar>
  )
}
