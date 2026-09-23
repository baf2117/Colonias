import { useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAuth0 } from '@auth0/auth0-react'
import { useInput, usePermissions, type Validator } from 'react-admin'
import { useWatch } from 'react-hook-form'
import type { Permissions } from '../authProvider'
import { isSuperAdministrador } from '../components/RequireRole'

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']
const ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf'

function extensionOf(fileName: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? match[1].toLowerCase() : null
}

// Mismo flujo que expenses/ExpenseReceiptUploadInput.tsx: pide una URL
// firmada a api/BankStatements.cs, sube el archivo directo a Blob Storage
// y deja en el formulario solo la ruta del blob. El archivo se guarda en
// la carpeta de la colonia: un SuperAdministrador tiene que elegirla
// antes de subir; a un Administrador el API le fuerza la suya.
export function BankStatementFileUploadInput({ source, validate }: { source: string; validate?: Validator | Validator[] }) {
  const { field, fieldState } = useInput({ source, validate })
  const auth0 = useAuth0()
  const { permissions } = usePermissions<Permissions>()
  const needsNeighborhood = isSuperAdministrador(permissions ?? null)
  const watchedNeighborhoodId: number | undefined = useWatch({ name: 'neighborhoodId' })

  const [fileName, setFileName] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUpload = !needsNeighborhood || !!watchedNeighborhoodId

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const extension = extensionOf(file.name)
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      setError('Formato no permitido. Usá PDF, JPG o PNG.')
      return
    }

    setError(null)
    setIsUploading(true)
    try {
      const token = await auth0.getAccessTokenSilently()
      const apiUrl = import.meta.env.VITE_API_URL

      const urlResponse = await fetch(`${apiUrl}/bank-statements/upload-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ neighborhoodId: watchedNeighborhoodId ?? 0, extension }),
      })
      if (!urlResponse.ok) {
        const body = await urlResponse.json().catch(() => null)
        throw new Error(body?.message ?? 'No se pudo generar la URL de subida.')
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
        throw new Error('No se pudo subir el archivo. Probá de nuevo.')
      }

      field.onChange(blobPath)
      setFileName(file.name)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el archivo. Probá de nuevo.')
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
        {isUploading ? 'Subiendo…' : field.value ? 'Reemplazar archivo' : 'Subir estado de cuenta'}
        <input id={`${source}-file`} type="file" hidden accept={ACCEPT} onChange={handleFileChange} />
      </Button>
      {!canUpload && (
        <Typography variant="caption" color="text.secondary">
          Elegí primero la colonia.
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
