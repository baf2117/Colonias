import { useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import type { Auth0ContextInterface } from '@auth0/auth0-react'
import { RegisterResident } from './RegisterResident'
import { RegisterSecurityStaff } from './RegisterSecurityStaff'

type Props = {
  auth0: Auth0ContextInterface
  onRegistered: () => void
}

// Pantalla que ve cualquier persona que inicia sesión con Auth0 por
// primera vez y todavía no tiene fila ni en dbo.Residents ni en
// dbo.SecurityStaff (ver useRegistrationStatus.ts). Antes solo existía
// el flujo de residente; ahora hay dos identidades posibles (ver
// CurrentStaff en api/Auth/), así que esta pantalla elige primero cuál
// de los dos formularios mostrar.
export function CompleteRegistration({ auth0, onRegistered }: Props) {
  const [kind, setKind] = useState<'resident' | 'staff' | null>(null)

  if (kind === 'resident') {
    return <RegisterResident auth0={auth0} onRegistered={onRegistered} onBack={() => setKind(null)} />
  }
  if (kind === 'staff') {
    return <RegisterSecurityStaff auth0={auth0} onRegistered={onRegistered} onBack={() => setKind(null)} />
  }

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 8, px: 2 }}>
      <Typography variant="h5" component="h1" fontWeight={700} textAlign="center" sx={{ mb: 1 }}>
        Completa tu registro
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
        ¿Cómo te vas a registrar?
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Button variant="contained" onClick={() => setKind('resident')}>
          Soy residente
        </Button>
        <Button variant="outlined" onClick={() => setKind('staff')}>
          Soy guardia de seguridad
        </Button>
      </Box>
    </Box>
  )
}
