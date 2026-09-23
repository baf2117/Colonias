import { useCallback, useEffect, useState } from 'react'
import type { Auth0ContextInterface } from '@auth0/auth0-react'
import { translatePreAdmin as t } from '../i18nProvider'

export type RegistrationStatus =
  | { status: 'loading' }
  | { status: 'registered' }
  | { status: 'unregistered' }
  | { status: 'error'; message: string }

// Antes de montar <Admin>, App.tsx pregunta al API si el sub de Auth0 ya
// tiene una fila activa en dbo.Residents (GET /api/Me — ver Residents.cs
// y JwtAuthenticationMiddleware.cs: Me es una de las dos funciones que
// aceptan un JWT válido sin exigir esa fila). Si no la tiene, se muestra
// RegisterResident en vez del dashboard.
export function useRegistrationStatus(auth0: Auth0ContextInterface) {
  const [status, setStatus] = useState<RegistrationStatus>({ status: 'loading' })

  const check = useCallback(async () => {
    setStatus({ status: 'loading' })
    try {
      const token = await auth0.getAccessTokenSilently()
      const apiUrl = import.meta.env.VITE_API_URL
      const response = await fetch(`${apiUrl}/Me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error(t('app.registration.verifyFailed', { status: response.status }))
      }
      const data = await response.json()
      setStatus({ status: data.registered ? 'registered' : 'unregistered' })
    } catch (error) {
      setStatus({ status: 'error', message: error instanceof Error ? error.message : t('app.common.unknownError') })
    }
  }, [auth0])

  useEffect(() => {
    if (auth0.isAuthenticated) {
      check()
    }
  }, [auth0.isAuthenticated, check])

  return { status, recheck: check }
}
