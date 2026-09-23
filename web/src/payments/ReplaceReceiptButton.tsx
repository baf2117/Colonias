import { useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAuth0 } from '@auth0/auth0-react'
import { useNotify, useRecordContext, useRefresh, useTranslate } from 'react-admin'

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']
const ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'

function extensionOf(fileName: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : null
}

// Para un residente puro en PaymentShow: cambia el comprobante de su pago
// mientras esté pendiente o rechazado (aprobado ya no se toca). Mismo
// flujo de subida que ReceiptUploadInput (URL firmada, el archivo va
// directo a Blob Storage) y después PUT /payments/{id}/receipt
// (ReplacePaymentReceipt en api/Payments.cs). Si estaba rechazado, el API
// lo vuelve a "pendiente" para que se revise de nuevo.
export function ReplaceReceiptButton() {
  const record = useRecordContext<{ id: number; unitId: number; status: string }>()
  const auth0 = useAuth0()
  const translate = useTranslate()
  const notify = useNotify()
  const refresh = useRefresh()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!record || record.status === 'approved') return null

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !record) return

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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: record.unitId, extension }),
      })
      if (!urlResponse.ok) throw new Error(translate('app.upload.prepareFailed'))
      const { uploadUrl, blobPath } = await urlResponse.json()

      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!putResponse.ok) throw new Error(translate('app.upload.uploadFailed'))

      const replaceResponse = await fetch(`${apiUrl}/payments/${record.id}/receipt`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptBlobPath: blobPath }),
      })
      const body = await replaceResponse.json().catch(() => null)
      if (!replaceResponse.ok) throw new Error(body?.message ?? translate('app.payments.changeReceiptFailed'))

      notify(
        record.status === 'rejected'
          ? 'app.payments.receiptResubmitted'
          : 'app.payments.receiptUpdated',
        { type: 'success' },
      )
      refresh()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : translate('app.payments.changeReceiptFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
      <Button
        component="label"
        variant={record.status === 'rejected' ? 'contained' : 'outlined'}
        startIcon={isUploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
        disabled={isUploading}
      >
        {isUploading ? translate('app.upload.uploading') : translate('app.payments.changeReceipt')}
        <input id="replace-receipt-file" type="file" hidden accept={ACCEPT} onChange={handleFileChange} />
      </Button>
      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : null}
    </Stack>
  )
}
