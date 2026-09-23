import { useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material'
import type { Auth0ContextInterface } from '@auth0/auth0-react'
import { translatePreAdmin as t } from '../i18nProvider'

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
        throw new Error(data?.error ?? t('app.registration.failed', { status: response.status }))
      }
      onRegistered()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('app.common.unknownError'))
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 8, px: 2 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, textAlign: 'center', mb: 1 }}>
        {t('app.registration.guardTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
        {t('app.registration.guardHint')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label={t('app.registration.neighborhoodCode')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          fullWidth
        />
        <TextField label={t('app.registration.name')} value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
        <TextField label={t('app.registration.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth />
        <Button type="submit" variant="contained" disabled={submitting} sx={{ mt: 1 }}>
          {submitting ? <CircularProgress size={22} /> : t('app.registration.submit')}
        </Button>
        <Button type="button" onClick={onBack} disabled={submitting}>
          {t('app.common.back')}
        </Button>
      </Box>
    </Box>
  )
}
