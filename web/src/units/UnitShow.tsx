import {
  BooleanField,
  EditButton,
  Labeled,
  ReferenceField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  useGetOne,
  useRecordContext,
} from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { AppPageTitle } from '../components/AppPageTitle'

// Título con el identificador real de la unidad (no "Unidad" genérico),
// igual que NeighborhoodShow usa el nombre real de la colonia.
function UnitShowTitle() {
  const record = useRecordContext()
  return <AppPageTitle>{record?.identifier ?? ''}</AppPageTitle>
}

// Botón "Editar" arriba del contenido: la puerta a UnitEdit. No pasa por
// el título (portal #react-admin-title que este proyecto no tiene, ver
// AppTopBar.tsx) — el prop `actions` de <Show> se renderiza aparte, así
// que funciona igual sin ese portal.
const UnitShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
)

// feeAmount es un monto suelto (no trae su propia moneda): la unidad
// solo sabe a qué colonia pertenece, y la moneda vive en
// Neighborhoods.Currency (migración 0007). Por eso, a diferencia de un
// NumberField con options={{ currency: '...' }} fijo, este componente
// busca la colonia de la unidad (useGetOne) y formatea con esa moneda
// real — si no, toda unidad se vería en la misma moneda aunque su
// colonia use otra.
function UnitFeeAmountField() {
  const record = useRecordContext<{ feeAmount: number | null; neighborhoodId: number }>()
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: record?.neighborhoodId },
    { enabled: !!record?.neighborhoodId },
  )

  if (record?.feeAmount == null) {
    return <span>— (usa la de la colonia)</span>
  }
  if (!neighborhood) {
    return null
  }
  return <span>{new Intl.NumberFormat('es-GT', { style: 'currency', currency: neighborhood.currency }).format(record.feeAmount)}</span>
}

// Misma pantalla de referencia que NeighborhoodShow (título + AppFormRow/
// AppFormCol de 12 columnas, solo lectura). <Labeled source="..."> en
// cada campo porque, al no ser hijos directos de SimpleShowLayout, no
// reciben el título automático que ese componente le pone a sus hijos
// (ver la misma nota en NeighborhoodShow.tsx).
export function UnitShow() {
  return (
    <Show actions={<UnitShowActions />}>
      <SimpleShowLayout>
        <UnitShowTitle />

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="active">
              <BooleanField source="active" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={5}>
            <Labeled source="neighborhoodId">
              <ReferenceField source="neighborhoodId" reference="neighborhoods">
                <TextField source="name" />
              </ReferenceField>
            </Labeled>
          </AppFormCol>
        </AppFormRow>

        <AppFormRow>
          <AppFormCol span={3}>
            <Labeled source="identifier">
              <TextField source="identifier" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="address">
              <TextField source="address" />
            </Labeled>
          </AppFormCol>
          <AppFormCol span={3}>
            <Labeled source="feeAmount">
              <UnitFeeAmountField />
            </Labeled>
          </AppFormCol>
        </AppFormRow>
      </SimpleShowLayout>
    </Show>
  )
}
