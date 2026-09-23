import { useState } from 'react'
import { Button, CircularProgress, Typography } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useAuth0 } from '@auth0/auth0-react'
import { useRecordContext } from 'react-admin'

// Mismo patrón que expenses/ExpenseReceiptField.tsx: el contenedor no
// tiene lectura pública, así que se pide una URL firmada de corta
// duración (api/BankStatements.cs, GetBankStatementFileViewUrl) cada vez
// que alguien quiere ver el archivo.
export function BankStatementFileField() {
  const record = useRecordContext<{ id: number; statementBlobPath?: string | null }>()
  const auth0 = useAuth0()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!record?.statementBlobPath) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    )
  }

  async function handleView() {
    setError(null)
    setIsLoading(true)
    try {
      const token = await auth0.getAccessTokenSilently()
      const apiUrl = import.meta.env.VITE_API_URL
      const response = await fetch(`${apiUrl}/bank-statements/${record!.id}/file-view-url`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error('No se pudo generar el enlace.')
      }
      const { url } = await response.json()
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('No se pudo abrir el estado de cuenta. Probá de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={isLoading ? <CircularProgress size={16} /> : <OpenInNewIcon />}
        disabled={isLoading}
        onClick={handleView}
      >
        Ver estado de cuenta
      </Button>
      {error && (
        <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </>
  )
}
