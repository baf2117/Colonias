import { useState } from 'react'
import { Button, CircularProgress, Typography } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useAuth0 } from '@auth0/auth0-react'
import { useRecordContext, useTranslate } from 'react-admin'

// Mismo patrón que expenses/ExpenseReceiptField.tsx: el contenedor no
// tiene lectura pública, así que se pide una URL firmada de corta
// duración (api/BankStatements.cs, GetBankStatementFileViewUrl) cada vez
// que alguien quiere ver el archivo.
export function BankStatementFileField() {
  const record = useRecordContext<{ id: number; statementBlobPath?: string | null }>()
  const auth0 = useAuth0()
  const translate = useTranslate()
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
        throw new Error(translate('app.upload.linkFailed'))
      }
      const { url } = await response.json()
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError(translate('app.bankStatements.openFailed'))
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
        {translate('app.bankStatements.view')}
      </Button>
      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </>
  )
}
