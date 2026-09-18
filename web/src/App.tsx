import { useAuth0 } from '@auth0/auth0-react'
import { Admin, CustomRoutes, EditGuesser, ListGuesser, Resource, ShowGuesser } from 'react-admin'
import { Route } from 'react-router-dom'
import { buildAuthProvider } from './authProvider'
import { buildDataProvider } from './dataProvider'
import Dashboard from './dashboard/Dashboard'
import FeesShell from './fees/FeesShell'
import { i18nProvider } from './i18nProvider'
import { AppLayout } from './layout/AppLayout'
import { NeighborhoodCreate } from './neighborhoods/NeighborhoodCreate'
import { NeighborhoodList } from './neighborhoods/NeighborhoodList'
import { NeighborhoodShow } from './neighborhoods/NeighborhoodShow'
import { darkTheme, lightTheme } from './theme'

// Units sigue siendo el primer recurso real conectado a la API (prueba de
// que el dataProvider funciona de punta a punta). El resto de las
// pantallas — Panel general, Cuotas y pagos — son el cascarón visual
// calcado del Design, con datos de ejemplo: la sidebar y el layout ya
// están armados como en el diseño final, así que conectarlas a la API más
// adelante es reemplazar los datos, no rehacer las pantallas.
export default function App() {
  const auth0 = useAuth0()

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
      <Resource name="units" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
      <Resource name="neighborhoods" list={NeighborhoodList} create={NeighborhoodCreate} show={NeighborhoodShow} />
    </Admin>
  )
}
