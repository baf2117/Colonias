import { useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material'
import type { Auth0ContextInterface } from '@auth0/auth0-react'

type Props = {
  auth0: Auth0ContextInterface
  onRegistered: () => void
  onBack: () => void
}

// Mismo mecanismo que RegisterResident, pero con el código de la
// colonia (Neighborhoods.StaffRegistrationCode, visible en
// NeighborhoodShow) en vez del de una unidad: un guardia no pertenece
// a una unidad. Sin campo de correo — dbo.SecurityStaff no tiene
// columna Email (ver schema.sql).
export function RegisterSecurityStaff({ auth0, onRegistered, onBack }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState(auth0.user?.name && auth0.user.name !== auth0.user?.email ? auth0.user.name : '')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const token = await auth0.getAccessTokenSilently()
      const apiUrl = import.meta.env.VITE_API_URL
      const response = await fetch(`${apiUrl}/security-staff/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          phone: phone.trim() || null,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? `No se pudo completar el registro (HTTP ${response.status}).`)
      }
      onRegistered()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 8, px: 2 }}>
      <Typography variant="h5" component="h1" fontWeight={700} textAlign="center" sx={{ mb: 1 }}>
        Registro de guardia
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
        Ingresa el código que te dio el administrador de la colonia.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Código de la colonia"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          fullWidth
        />
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
        <TextField label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth />
        <Button type="submit" variant="contained" disabled={submitting} sx={{ mt: 1 }}>
          {submitting ? <CircularProgress size={22} /> : 'Registrarme'}
        </Button>
        <Button type="button" onClick={onBack} disabled={submitting}>
          Volver
        </Button>
      </Box>
    </Box>
  )
}
