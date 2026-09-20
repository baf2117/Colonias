import { useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material'
import type { Auth0ContextInterface } from '@auth0/auth0-react'

type Props = {
  auth0: Auth0ContextInterface
  onRegistered: () => void
}

// Pantalla que ve cualquier persona que inicia sesión con Auth0 por
// primera vez y todavía no tiene fila en dbo.Residents (ver
// useRegistrationStatus.ts y RegisterResident en api/Residents.cs). En
// vez de elegir su unidad de una lista, entra el código que le dio el
// administrador de su colonia (Units.RegistrationCode, visible en
// UnitShow) — así no hace falta exponerle el listado completo de
// unidades a alguien que todavía no es residente de ninguna.
//
// No usa <SimpleForm>/react-admin a propósito: esta pantalla se muestra
// antes de montar <Admin> (no hay dataProvider ni recursos todavía),
// así que llama al API directo con fetch, igual que dataProvider.ts.
export function RegisterResident({ auth0, onRegistered }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState(auth0.user?.name && auth0.user.name !== auth0.user?.email ? auth0.user.name : '')
  const [email, setEmail] = useState(auth0.user?.email ?? '')
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
      const response = await fetch(`${apiUrl}/residents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          email: email.trim() || null,
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
        Completa tu registro
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
        Ingresa el código que te dio el administrador de tu colonia para asociarte a tu unidad.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Código de la unidad"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          fullWidth
        />
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
        <TextField label="Correo" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
        <TextField label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth />
        <Button type="submit" variant="contained" disabled={submitting} sx={{ mt: 1 }}>
          {submitting ? <CircularProgress size={22} /> : 'Registrarme'}
        </Button>
      </Box>
    </Box>
  )
}
