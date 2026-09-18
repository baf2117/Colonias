import { Box, type BoxProps } from '@mui/material'

type AppFormColProps = BoxProps & {
  // Cuántas de las 12 columnas de la <AppFormRow> ocupa este campo.
  // 12 = toda la fila, 6 = mitad, 4 = un tercio, 3 = un cuarto, etc.
  span?: number
}

export function AppFormCol({ span = 12, sx, ...props }: AppFormColProps) {
  return (
    <Box
      sx={{
        gridColumn: `span ${span} / span ${span}`,
        // minWidth: 0 evita que un input/valor largo empuje la columna
        // (y con ella toda la fila) más allá de lo que le corresponde.
        minWidth: 0,
        ...sx,
      }}
      {...props}
    />
  )
}
