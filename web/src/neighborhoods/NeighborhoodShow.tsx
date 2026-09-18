import { BooleanField, Labeled, Show, SimpleShowLayout, TextField, useRecordContext } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

// Título con el nombre real de la colonia (no "Colonia" genérico): así
// se sabe cuál de todas se está viendo. useRecordContext funciona acá
// porque este componente se renderiza adentro de <SimpleShowLayout>, ya
// con el registro cargado.
function NeighborhoodShowTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.name ?? ''}</AppPageTitle>
}

// Misma pantalla de referencia que NeighborhoodCreate (título +
// AppFormRow/AppFormCol de 12 columnas), pero de solo lectura: se llega
// acá haciendo clic en una fila de la lista (rowClick="show" en
// NeighborhoodList). El título no se pasa como prop `title` de <Show> —
// ese título va a un portal (#react-admin-title) que el AppBar del
// proyecto no tiene (ver AppTopBar.tsx), así que directamente se
// renderiza a mano adentro del layout, como en NeighborhoodCreate.
//
// <Labeled source="..."> en cada campo: SimpleShowLayout normalmente le
// pone el título de arriba a cada campo envolviendo automáticamente a
// sus hijos directos, pero acá los campos están dentro de AppFormRow/
// AppFormCol (no son hijos directos), así que ese envoltorio automático
// no llega a pasar. <Labeled source="active"> reproduce ese mismo
// título a mano, tomando la traducción de resources.neighborhoods.fields.*
// (mismo texto que ya se usa en el formulario de creación).
export function NeighborhoodShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <NeighborhoodShowTitle />

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="active">
              <BooleanField source="active" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="temporaryCodesEnabled">
              <BooleanField source="temporaryCodesEnabled" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="permanentCodesEnabled">
              <BooleanField source="permanentCodesEnabled" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="denyAccessEnabled">
              <BooleanField source="denyAccessEnabled" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={6}>
            <Labeled source="name">
              <TextField source="name" />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
