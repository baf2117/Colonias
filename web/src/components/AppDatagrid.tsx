import { Datagrid, type DatagridProps } from 'react-admin'

// Estándar de listas del proyecto: contenido y encabezados centrados en
// cada columna. Empezamos por la lista de Colonias, pero cualquier otra
// lista que use este wrapper en vez de <Datagrid> directo hereda lo mismo.
export function AppDatagrid({ sx, ...props }: DatagridProps) {
  return (
    <Datagrid
      sx={{
        '& .RaDatagrid-headerCell': { textAlign: 'center' },
        '& .RaDatagrid-rowCell': { textAlign: 'center' },
        ...sx,
      }}
      {...props}
    />
  )
}
