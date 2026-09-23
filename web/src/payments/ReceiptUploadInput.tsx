import { useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAuth0 } from '@auth0/auth0-react'
import { useInput, usePermissions, useTranslate } from 'react-admin'
import { useWatch } from 'react-hook-form'
import type { Permissions } from '../authProvider'
import { isPureResident } from '../components/RequireRole'

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']
const ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'

function extensionOf(fileName: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : null
}

// Sube el comprobante directo a Blob Storage con una URL firmada (SAS)
// de escritura -- api/Payments.cs (GetPaymentReceiptUploadUrl) genera
// esa URL y api/Storage/BlobStorageService.cs la firma; el archivo en sí
// nunca pasa por el Function, solo el pedido de la URL. El pago todavía
// no existe en este punto (se sube ANTES de crear el registro, ver el
// comentario grande en PaymentCreate.tsx), así que lo único que este
// input deja en el formulario es la ruta del blob ya subido
// (`receiptBlobPath`, vía useInput) -- el archivo en sí nunca "vive" en
// el estado de react-hook-form.
//
// Un residente puro no tiene un campo de Unidad para elegir (ver
// PaymentCreate.tsx): el backend ya le fuerza la suya, así que acá basta
// con mandar cualquier valor de unitId (se ignora). Un administrador sí
// necesita haber elegido una unidad antes de poder subir, porque el
// nombre del blob se arma como "{unitId}/{guid}.{ext}".
export function ReceiptUploadInput({ source }: { source: string }) {
  const { field } = useInput({ source })
  const { permissions } = usePermissions<Permissions>()
  const isResident = isPureResident(permissions ?? null)
  const auth0 = useAuth0()
  const translate = useTranslate()
  const watchedUnitId: number | undefined = useWatch({ name: 'unitId' })

  const [fileName, setFileName] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUpload = isResident || !!watchedUnitId

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = extensionOf(file.name)
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      setError(translate('app.upload.invalidFormat'))
      return
    }

    setError(null)
    setIsUploading(true)
    try {
      const token = await auth0.getAccessTokenSilently()
      const apiUrl = import.meta.env.VITE_API_URL

      const urlResponse = await fetch(`${apiUrl}/payments/receipt-upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unitId: watchedUnitId ?? 0, extension }),
      })
      if (!urlResponse.ok) {
        throw new Error(translate('app.upload.prepareFailed'))
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
        throw new Error(translate('app.upload.uploadFailed'))
      }

      field.onChange(blobPath)
      setFileName(file.name)
    } catch {
      setError(translate('app.upload.receiptUploadFailed'))
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
        {isUploading ? translate('app.upload.uploading') : field.value ? translate('app.upload.replaceReceipt') : translate('app.upload.uploadReceipt')}
        <input type="file" hidden accept={ACCEPT} onChange={handleFileChange} />
      </Button>
      {!canUpload && (
        <Typography variant="caption" color="text.secondary">
          {translate('app.upload.chooseUnitFirst')}
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
    </Stack>
  )
}
