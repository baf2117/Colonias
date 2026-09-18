import { Box, type BoxProps } from '@mui/material'

// Grilla de 12 columnas para los formularios del proyecto, calcada del
// criterio de "12 columnas por fila" que ya se usa en otros proyectos: en
// vez de un `maxWidth` en píxeles por campo, cada elemento dice cuántas
// de las 12 columnas ocupa (ver <AppFormCol>). <AppFormRow> es la fila;
// puede haber más de una por formulario (una fila por grupo de campos
// relacionados).
export function AppFormRow({ sx, ...props }: BoxProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: 2,
        width: '100%',
        ...sx,
      }}
      {...props}
    />
  )
}
