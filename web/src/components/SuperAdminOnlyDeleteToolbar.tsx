import { DeleteButton, SaveButton, Toolbar, usePermissions } from 'react-admin'
import { isSuperAdministrador } from './RequireRole'
import type { Permissions } from '../authProvider'

// Toolbar para <Edit> de Payments/Expenses/Payroll: el botón "Eliminar"
// que trae el Toolbar por defecto de SimpleForm solo se muestra si quien
// edita es SuperAdministrador -- el backend (RequireSuperAdministrador en
// Payments.cs/Expenses.cs/Payroll.cs) es la protección real, esto solo
// evita mostrar un botón que el API de todos modos va a rechazar.
export function SuperAdminOnlyDeleteToolbar() {
  const { permissions } = usePermissions<Permissions>()
  return (
    <Toolbar>
      <SaveButton />
      {isSuperAdministrador(permissions ?? null) ? <DeleteButton sx={{ ml: 'auto' }} /> : null}
    </Toolbar>
  )
}
