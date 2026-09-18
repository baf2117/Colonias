import type { ReactNode } from 'react'
import { Typography, type TypographyProps } from '@mui/material'

// Título estándar de pantalla del proyecto: centrado, en negrita, con
// aire debajo antes del contenido (h5 + mb: 4). Nace en la pantalla de
// Crear Colonia y es la referencia para el resto — cualquier pantalla
// nueva (Ver, Editar, etc., de cualquier recurso) usa este componente en
// vez de repetir el mismo Typography a mano.
type AppPageTitleProps = Omit<TypographyProps, 'children'> & { children: ReactNode }

export function AppPageTitle({ sx, children, ...props }: AppPageTitleProps) {
  return (
    <Typography
      variant="h5"
      component="h1"
      fontWeight={700}
      sx={{ width: '100%', textAlign: 'center', mb: 4, ...sx }}
      {...props}
    >
      {children}
    </Typography>
  )
}
