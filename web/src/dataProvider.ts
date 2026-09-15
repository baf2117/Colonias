import { fetchUtils } from 'react-admin'
import simpleRestProvider from 'ra-data-simple-rest'
import type { Auth0ContextInterface } from '@auth0/auth0-react'

/**
 * Wraps ra-data-simple-rest's default httpClient to attach a fresh Auth0
 * access token (audience = our API) to every request. getAccessTokenSilently
 * caches and refreshes the token on its own, so this doesn't hit Auth0 on
 * every call.
 */
export function buildDataProvider(auth0: Auth0ContextInterface) {
  const apiUrl = import.meta.env.VITE_API_URL

  if (!apiUrl) {
    throw new Error('Missing VITE_API_URL. Set it in web/.env (see web/.env.example).')
  }

  const httpClient = async (url: string, options: fetchUtils.Options = {}) => {
    const token = await auth0.getAccessTokenSilently()
    const headers = new Headers(options.headers ?? { Accept: 'application/json' })
    headers.set('Authorization', `Bearer ${token}`)
    return fetchUtils.fetchJson(url, { ...options, headers })
  }

  return simpleRestProvider(apiUrl, httpClient)
}
