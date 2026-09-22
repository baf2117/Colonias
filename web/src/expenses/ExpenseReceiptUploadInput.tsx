import { useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAuth0 } from '@auth0/auth0-react'
import { useInput, type Validator } from 'react-admin'
import { useWatch } from 'react-hook-form'

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']
const ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'

function extensionOf(fileName: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : null
}

// Mismo patrón que payments/ReceiptUploadInput.tsx: sube el comprobante
// directo a Blob Storage con una URL firmada (SAS) de escritura --
// api/Expenses.cs (GetExpenseReceiptUploadUrl) genera esa URL y
// api/Storage/BlobStorageService.cs la firma; el archivo en sí nunca pasa
// por el Function. El gasto todavía no existe en este punto (se sube
// ANTES de crear el registro), así que lo único que este input deja en
// el formulario es la ruta del blob ya subido (`receiptBlobPath`, vía
// useInput).
//
// A diferencia de Payments, acá el comprobante es OBLIGATORIO (ver
// CreateExpense en Expenses.cs): por eso `validate={required()}` en
// ExpenseCreate/ExpenseEdit sobre este mismo `source`, y por eso hace
// falta haber elegido un Proveedor antes de poder subir -- el nombre del
// blob se arma como "expenses/{vendorId}/{guid}.{ext}".
export function ExpenseReceiptUploadInput({ source, validate }: { source: string; validate?: Validator | Validator[] }) {
  const { field, fieldState } = useInput({ source, validate })
  const auth0 = useAuth0()
  const watchedVendorId: number | undefined = useWatch({ name: 'vendorId' })

  const [fileName, setFileName] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUpload = !!watchedVendorId

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = extensionOf(file.name)
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      setError('Formato no permitido. Usá JPG, PNG o PDF.')
      return
    }

    setError(null)
    setIsUploading(true)
    try {
      const token = await auth0.getAccessTokenSilently()
      const apiUrl = import.meta.env.VITE_API_URL

      const urlResponse = await fetch(`${apiUrl}/expenses/receipt-upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vendorId: watchedVendorId ?? 0, extension }),
      })
      if (!urlResponse.ok) {
        throw new Error('No se pudo generar la URL de subida.')
      }
      const { uploadUrl, blobPath } = await urlResponse.json()

      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      })
      if (!putResponse.ok) {
        throw new Error('No se pudo subir el archivo.')
      }

      field.onChange(blobPath)
      setFileName(file.name)
    } catch {
      setError('No se pudo subir el comprobante. Probá de nuevo.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Stack spacing={0.5}>
      <Button
        component="label"
        variant="outlined"
        size="small"
        startIcon={isUploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
        disabled={!canUpload || isUploading}
      >
        {isUploading ? 'Subiendo…' : field.value ? 'Reemplazar comprobante' : 'Subir comprobante'}
        <input type="file" hidden accept={ACCEPT} onChange={handleFileChange} />
      </Button>
      {!canUpload && (
        <Typography variant="caption" color="text.secondary">
          Elegí primero un proveedor.
        </Typography>
      )}
      {fileName && !error && (
        <Typography variant="caption" color="text.secondary">
          {fileName}
        </Typography>
      )}
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
      {!error && fieldState.invalid && fieldState.error?.message && (
        <Typography variant="caption" color="error">
          {fieldState.error.message}
        </Typography>
      )}
    </Stack>
  )
}
