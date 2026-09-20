import { useState, type FormEvent } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField as MuiTextField } from '@mui/material'
import { useCreate, useCreateSuggestionContext, useGetList, useNotify, useTranslate } from 'react-admin'

// Lo que <AutocompleteInput create={...}> renderiza cuando el usuario
// elige "Agregar <lo que escribió>" en el selector de Proveedor (ver
// expenses/ExpenseCreate.tsx y ExpenseEdit.tsx): da de alta el
// proveedor (dbo.Vendors) sin salir del formulario de Gasto, en vez de
// mandar a una pantalla de "Proveedores" aparte — así lo pidió el
// usuario. useCreateSuggestionContext() es lo que conecta este diálogo
// con el AutocompleteInput que lo abrió: filter trae el texto que ya
// se había escrito (precarga el nombre), onCreate selecciona el
// proveedor recién creado en el selector, y onCancel cierra sin crear
// nada.
//
// No usa <ReferenceInput>/<AutocompleteInput> de react-admin para elegir
// la Colonia porque este diálogo no vive dentro de un <Form> (no hay
// react-hook-form activo acá) — se arma a mano con useGetList y un
// <TextField select> de MUI. dbo.Vendors.NeighborhoodId es NOT NULL
// (igual que en Units), así que es obligatorio.
export function CreateVendorDialog() {
  const { filter, onCancel, onCreate } = useCreateSuggestionContext()
  const translate = useTranslate()
  const notify = useNotify()
  const [create, { isLoading }] = useCreate()
  const [name, setName] = useState(filter ?? '')
  const [phone, setPhone] = useState('')
  const [neighborhoodId, setNeighborhoodId] = useState<number | ''>('')

  const { data: neighborhoods } = useGetList('neighborhoods', {
    pagination: { page: 1, perPage: 100 },
    sort: { field: 'name', order: 'ASC' },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !neighborhoodId) return

    create(
      'vendors',
      { data: { name, phone: phone.trim() || undefined, neighborhoodId } },
      {
        onSuccess: (created) => {
          setName('')
          setPhone('')
          setNeighborhoodId('')
          onCreate(created)
        },
        onError: () => {
          notify('No se pudo crear el proveedor', { type: 'error' })
        },
      },
    )
  }

  return (
    <Dialog open onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {translate('ra.action.create')} {translate('resources.vendors.name', { smart_count: 1 }).toLowerCase()}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 320 }}>
            <MuiTextField
              label={translate('resources.vendors.fields.name')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
              fullWidth
            />
            <MuiTextField
              label={translate('resources.vendors.fields.phone')}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              fullWidth
            />
            <MuiTextField
              select
              label={translate('resources.vendors.fields.neighborhoodId')}
              value={neighborhoodId}
              onChange={(event) => setNeighborhoodId(Number(event.target.value))}
              required
              fullWidth
            >
              {(neighborhoods ?? []).map((neighborhood) => (
                <MenuItem key={neighborhood.id} value={neighborhood.id}>
                  {neighborhood.name}
                </MenuItem>
              ))}
            </MuiTextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>{translate('ra.action.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {translate('ra.action.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
