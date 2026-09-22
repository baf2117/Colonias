import { useState } from 'react'
import { Button, CircularProgress, Typography } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useAuth0 } from '@auth0/auth0-react'
import { useRecordContext } from 'react-admin'

// Mismo patrón que payments/PaymentReceiptField.tsx: el contenedor
// "comprobantes" de Blob Storage no tiene lectura pública, así que cada
// vez que alguien quiere ver el comprobante hay que pedirle al API una
// URL firmada (SAS) de lectura, de corta duración, y recién ahí abrirla.
// api/Expenses.cs (GetExpenseReceiptViewUrl) exige Administrador/
// SuperAdministrador, igual que el resto de Gastos.
export function ExpenseReceiptField() {
  const record = useRecordContext<{ id: number; receiptBlobPath?: string | null }>()
  const auth0 = useAuth0()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!record?.receiptBlobPath) {
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
      const response = await fetch(`${apiUrl}/expenses/${record!.id}/receipt-view-url`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error('No se pudo generar el enlace.')
      }
      const { url } = await response.json()
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('No se pudo abrir el comprobante. Probá de nuevo.')
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
        Ver comprobante
      </Button>
      {error && (
        <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      )}
    </>
  )
}
