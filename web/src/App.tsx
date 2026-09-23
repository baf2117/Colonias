import { useAuth0 } from '@auth0/auth0-react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { createTheme } from '@mui/material/styles'
import { Admin, Resource } from 'react-admin'
import { AccountStatementPage } from './account-statement/AccountStatementPage'
import { buildAuthProvider } from './authProvider'
import { BankStatementCreate } from './bank-statements/BankStatementCreate'
import { BankStatementEdit } from './bank-statements/BankStatementEdit'
import { BankStatementList } from './bank-statements/BankStatementList'
import { BankStatementShow } from './bank-statements/BankStatementShow'
import { requireAdminOrSuperAdmin, requireRole, requireSuperAdmin } from './components/RequireRole'
import { buildDataProvider } from './dataProvider'
import Dashboard from './dashboard/Dashboard'
import { ExpenseCreate } from './expenses/ExpenseCreate'
import { ExpenseEdit } from './expenses/ExpenseEdit'
import { ExpenseList } from './expenses/ExpenseList'
import { ExpenseShow } from './expenses/ExpenseShow'
import { i18nProvider } from './i18nProvider'
import { AppLayout } from './layout/AppLayout'
import { NeighborhoodCreate } from './neighborhoods/NeighborhoodCreate'
import { NeighborhoodEdit } from './neighborhoods/NeighborhoodEdit'
import { NeighborhoodList } from './neighborhoods/NeighborhoodList'
import { NeighborhoodShow } from './neighborhoods/NeighborhoodShow'
import { PayrollCreate } from './payroll/PayrollCreate'
import { PayrollEdit } from './payroll/PayrollEdit'
import { PayrollShow } from './payroll/PayrollShow'
import { PaymentCreate } from './payments/PaymentCreate'
import { PaymentEdit } from './payments/PaymentEdit'
import { PaymentList } from './payments/PaymentList'
import { PaymentShow } from './payments/PaymentShow'
import { CompleteRegistration } from './registration/CompleteRegistration'
import { useRegistrationStatus } from './registration/useRegistrationStatus'
import { ResidentCreate } from './residents/ResidentCreate'
import { ResidentEdit } from './residents/ResidentEdit'
import { ResidentList } from './residents/ResidentList'
import { ResidentShow } from './residents/ResidentShow'
import { SecurityStaffCreate } from './security-staff/SecurityStaffCreate'
import { SecurityStaffEdit } from './security-staff/SecurityStaffEdit'
import { SecurityStaffList } from './security-staff/SecurityStaffList'
import { SecurityStaffShow } from './security-staff/SecurityStaffShow'
import { darkTheme, lightTheme } from './theme'
import { UnitCreate } from './units/UnitCreate'
import { UnitEdit } from './units/UnitEdit'
import { UnitList } from './units/UnitList'
import { UnitShow } from './units/UnitShow'

// Units sigue siendo el primer recurso real conectado a la API (prueba de
// que el dataProvider funciona de punta a punta), ahora con pantallas
// propias (lista/crear/ver/editar) en vez de los guessers genéricos.
// Payments es el último en sumarse (ver payments/), reemplazando al
// cascarón visual que tenía Finanzas > Cuotas y pagos. Solo el Panel
// general sigue siendo el cascarón calcado del Design, con datos de
// ejemplo.
export default function App() {
  const auth0 = useAuth0()
  const registration = useRegistrationStatus(auth0)

  if (auth0.isLoading) {
    return <p>Cargando…</p>
  }

  if (auth0.error) {
    return <p>Error de autenticación: {auth0.error.message}</p>
  }

  if (!auth0.isAuthenticated) {
    auth0.loginWithRedirect()
    return <p>Redirigiendo al login…</p>
  }

  // Un login de Auth0 válido no alcanza: hasta que /api/Me confirme una
  // fila en dbo.Residents, no hay unidad ni rol que mostrar en el
  // dashboard. RegisterResident es la pantalla de "completa tu registro"
  // (código de unidad + datos del residente) — ver useRegistrationStatus.ts.
  if (registration.status.status === 'loading') {
    return <p>Cargando…</p>
  }

  if (registration.status.status === 'error') {
    return <p>No se pudo verificar tu registro: {registration.status.message}</p>
  }

  if (registration.status.status === 'unregistered') {
    // <Admin> es quien normalmente envuelve todo en el ThemeProvider/
    // CssBaseline del proyecto (lightTheme/darkTheme, ver theme.ts) —
    // como esta pantalla se muestra ANTES de montar <Admin>, sin este
    // wrapper los componentes de MUI (TextField, Button) quedan sin
    // tema: el `color-scheme: light dark` de index.css hace que el
    // navegador les ponga fondo oscuro nativo mientras el texto sale
    // con el color por defecto (oscuro) de MUI — texto invisible.
    // lightTheme es un objeto de opciones (deepmerge sobre defaultTheme de
    // react-admin), no un tema ya resuelto: <Admin> lo resuelve internamente
    // con createTheme() antes de usarlo. Acá hay que hacerlo a mano — sin
    // esto, palette.common y otros valores derivados quedan undefined y
    // cualquier componente de MUI que los use (Button, etc.) explota en
    // tiempo de ejecución ("Cannot read properties of undefined").
    return (
      <ThemeProvider theme={createTheme(lightTheme)}>
        <CssBaseline />
        <CompleteRegistration auth0={auth0} onRegistered={registration.recheck} />
      </ThemeProvider>
    )
  }

  const authProvider = buildAuthProvider(auth0)
  const dataProvider = buildDataProvider(auth0)

  return (
    <Admin
      authProvider={authProvider}
      dataProvider={dataProvider}
      i18nProvider={i18nProvider}
      theme={lightTheme}
      darkTheme={darkTheme}
      defaultTheme="light"
      layout={AppLayout}
      dashboard={Dashboard}
    >
      {/* Unidades, primer recurso del grupo Administración: solo
          Administrador/SuperAdministrador puede verlo o administrarlo
          (requireAdminOrSuperAdmin acá, RequireAdminOrSuperAdmin en
          api/Units.cs es la protección real). */}
      <Resource
        name="units"
        list={requireAdminOrSuperAdmin(UnitList)}
        create={requireAdminOrSuperAdmin(UnitCreate)}
        show={requireAdminOrSuperAdmin(UnitShow)}
        edit={requireAdminOrSuperAdmin(UnitEdit)}
      />
      {/* Solo un superadministrador puede administrar colonias: el sidebar
          ya oculta este ítem para cualquier otro rol (AppMenu.tsx), pero
          alguien podría igual navegar directo a /neighborhoods escribiendo
          la URL — requireSuperAdmin bloquea la pantalla en ese caso, y el
          API (RequireSuperAdministrador en Neighborhoods.cs) es la
          protección real detrás de las dos. */}
      <Resource
        name="neighborhoods"
        list={requireSuperAdmin(NeighborhoodList)}
        create={requireSuperAdmin(NeighborhoodCreate)}
        show={requireSuperAdmin(NeighborhoodShow)}
        edit={requireSuperAdmin(NeighborhoodEdit)}
      />
      {/* dbo.Residents es la fusión de lo que antes eran dbo.Users y
          dbo.Residents (ver schema.sql y el diagrama ER) — este es el
          "Directorio de residentes" del menú (ver AppMenu.tsx). Solo
          Administrador/SuperAdministrador puede verlo (requireAdminOrSuperAdmin
          en el frontend, RequireAdminOrSuperAdmin en api/Residents.cs es la
          protección real). */}
      <Resource
        name="residents"
        list={requireAdminOrSuperAdmin(ResidentList)}
        create={requireAdminOrSuperAdmin(ResidentCreate)}
        show={requireAdminOrSuperAdmin(ResidentShow)}
        edit={requireAdminOrSuperAdmin(ResidentEdit)}
      />
      {/* Gastos, igual que Unidades y Guardias en Administración: mismo
          bloqueo a Administrador/SuperAdministrador. */}
      <Resource
        name="expenses"
        list={requireAdminOrSuperAdmin(ExpenseList)}
        create={requireAdminOrSuperAdmin(ExpenseCreate)}
        show={requireAdminOrSuperAdmin(ExpenseShow)}
        edit={requireAdminOrSuperAdmin(ExpenseEdit)}
      />
      {/* Sin pantallas propias a propósito: los proveedores se crean al vuelo
          desde ExpenseCreate/ExpenseEdit (ver vendors/CreateVendorDialog.tsx),
          no en una sección de "Proveedores" aparte. Este registro es lo que
          deja a ReferenceInput/ReferenceField y al create-inline hablar con
          /api/vendors. */}
      <Resource name="vendors" />
      {/* Reemplaza al cascarón de Finanzas > Cuotas y pagos (FeesShell,
          retirado junto con /cuotas): ahora es un recurso real contra
          /api/payments, con la regla de "un pago activo por unidad y mes"
          aplicada del lado del servidor (ver Payments.cs). */}
      <Resource name="payments" list={PaymentList} create={PaymentCreate} show={PaymentShow} edit={PaymentEdit} />
      {/* Guardias (dbo.SecurityStaff): no son Residents, viven ligados
          directo a una colonia (NeighborhoodId), no a una unidad. Ver
          api/SecurityStaff.cs y el auto-registro paralelo al de
          residentes en registration/RegisterSecurityStaff.tsx. Tercer
          recurso de Administración, mismo bloqueo a
          Administrador/SuperAdministrador que Unidades y Gastos. */}
      <Resource
        name="security-staff"
        list={requireAdminOrSuperAdmin(SecurityStaffList)}
        create={requireAdminOrSuperAdmin(SecurityStaffCreate)}
        show={requireAdminOrSuperAdmin(SecurityStaffShow)}
        edit={requireAdminOrSuperAdmin(SecurityStaffEdit)}
      />
      {/* Nómina de guardias (dbo.Payroll): sin list ni menú propio a
          propósito — se registra desde la misma vista de un guardia
          (SecurityStaffShow), igual que Vendors se usa solo como recurso
          de apoyo para ReferenceInput/ReferenceField, pero acá con
          pantallas completas (Create/Show/Edit) porque además hace falta
          navegar a un pago puntual. Ver api/Payroll.cs. */}
      <Resource name="payroll" create={PayrollCreate} show={PayrollShow} edit={PayrollEdit} />
      {/* Estados de cuenta bancarios (dbo.BankStatements): solo
          Administrador/SuperAdministrador; un Administrador solo ve y sube
          los de su colonia (ver api/BankStatements.cs). */}
      <Resource
        name="bank-statements"
        list={requireAdminOrSuperAdmin(BankStatementList)}
        create={requireAdminOrSuperAdmin(BankStatementCreate)}
        show={requireAdminOrSuperAdmin(BankStatementShow)}
        edit={requireAdminOrSuperAdmin(BankStatementEdit)}
      />
      {/* Estado de cuentas: no es un CRUD, es un dashboard de solo lectura
          (api/AccountStatement.cs). Se registra como Resource con solo
          `list` para tener la ruta /account-statement sin armar rutas a
          mano. Lo ve cualquier residente (de su colonia) o administrador;
          enviarlo por correo es solo de administradores. */}
      <Resource
        name="account-statement"
        list={requireRole(AccountStatementPage, (permissions) => permissions?.kind === 'resident')}
      />
    </Admin>
  )
}
