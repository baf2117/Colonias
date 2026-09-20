import { useAuth0 } from '@auth0/auth0-react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { Admin, CustomRoutes, Resource } from 'react-admin'
import { Route } from 'react-router-dom'
import { buildAuthProvider } from './authProvider'
import { buildDataProvider } from './dataProvider'
import Dashboard from './dashboard/Dashboard'
import { ExpenseCreate } from './expenses/ExpenseCreate'
import { ExpenseEdit } from './expenses/ExpenseEdit'
import { ExpenseList } from './expenses/ExpenseList'
import { ExpenseShow } from './expenses/ExpenseShow'
import FeesShell from './fees/FeesShell'
import { i18nProvider } from './i18nProvider'
import { AppLayout } from './layout/AppLayout'
import { NeighborhoodCreate } from './neighborhoods/NeighborhoodCreate'
import { NeighborhoodEdit } from './neighborhoods/NeighborhoodEdit'
import { NeighborhoodList } from './neighborhoods/NeighborhoodList'
import { NeighborhoodShow } from './neighborhoods/NeighborhoodShow'
import { RegisterResident } from './registration/RegisterResident'
import { useRegistrationStatus } from './registration/useRegistrationStatus'
import { ResidentCreate } from './residents/ResidentCreate'
import { ResidentEdit } from './residents/ResidentEdit'
import { ResidentList } from './residents/ResidentList'
import { ResidentShow } from './residents/ResidentShow'
import { darkTheme, lightTheme } from './theme'
import { UnitCreate } from './units/UnitCreate'
import { UnitEdit } from './units/UnitEdit'
import { UnitList } from './units/UnitList'
import { UnitShow } from './units/UnitShow'

// Units sigue siendo el primer recurso real conectado a la API (prueba de
// que el dataProvider funciona de punta a punta), ahora con pantallas
// propias (lista/crear/ver/editar) en vez de los guessers genéricos. El
// resto de las pantallas — Panel general, Cuotas y pagos — son el
// cascarón visual calcado del Design, con datos de ejemplo: la sidebar y
// el layout ya están armados como en el diseño final, así que conectarlas
// a la API más adelante es reemplazar los datos, no rehacer las pantallas.
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
    return (
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <RegisterResident auth0={auth0} onRegistered={registration.recheck} />
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
      <CustomRoutes>
        <Route path="/cuotas" element={<FeesShell />} />
      </CustomRoutes>
      <Resource name="units" list={UnitList} create={UnitCreate} show={UnitShow} edit={UnitEdit} />
      <Resource
        name="neighborhoods"
        list={NeighborhoodList}
        create={NeighborhoodCreate}
        show={NeighborhoodShow}
        edit={NeighborhoodEdit}
      />
      {/* dbo.Residents es la fusión de lo que antes eran dbo.Users y
          dbo.Residents (ver schema.sql y el diagrama ER) — este es el
          "Directorio de residentes" del menú (ver AppMenu.tsx). */}
      <Resource
        name="residents"
        list={ResidentList}
        create={ResidentCreate}
        show={ResidentShow}
        edit={ResidentEdit}
      />
      <Resource name="expenses" list={ExpenseList} create={ExpenseCreate} show={ExpenseShow} edit={ExpenseEdit} />
      {/* Sin pantallas propias a propósito: los proveedores se crean al vuelo
          desde ExpenseCreate/ExpenseEdit (ver vendors/CreateVendorDialog.tsx),
          no en una sección de "Proveedores" aparte. Este registro es lo que
          deja a ReferenceInput/ReferenceField y al create-inline hablar con
          /api/vendors. */}
      <Resource name="vendors" />
    </Admin>
  )
}
