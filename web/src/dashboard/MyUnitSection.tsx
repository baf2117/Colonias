import { useEffect, useState } from 'react'
import { Card, Typography } from '@mui/material'
import { useAuth0 } from '@auth0/auth0-react'
import { useGetOne, useTranslate } from 'react-admin'
import { AppFormCol } from '../components/AppFormCol'
import { AppFormRow } from '../components/AppFormRow'
import { useFormatLocale } from '../i18n/useFormatLocale'
import { MonthlyPaymentCard } from './MonthlyPaymentCard'

// Exportado: PaymentCreate.tsx también lo usa (vía useMyUnit más abajo)
// para calcular la cuota efectiva de un residente puro sin que este tenga
// que elegir su unidad en el formulario -- ver PaymentEffectiveAmountPreview.tsx.
export interface MyUnit {
  id: number
  identifier: string
  neighborhoodId: number
  address: string | null
  feeAmount: number | null
}

// GET /api/units/mine (api/Units.cs, GetMyUnit): a diferencia del resto de
// Units.cs (GetList/GetOne restringidos a Administrador/SuperAdministrador,
// ver RequireAdminOrSuperAdmin), este endpoint es de autoservicio —
// cualquier residente puede ver los datos básicos de SU PROPIA unidad, sin
// reabrir el directorio completo. Se llama con fetch directo (mismo patrón
// que authProvider.getPermissions()/useRegistrationStatus.ts), no por el
// dataProvider: ra-data-simple-rest no tiene forma de pegarle a una ruta
// que no sea GET/POST/PUT/DELETE sobre /units o /units/:id.
export function useMyUnit() {
  const auth0 = useAuth0()
  const [unit, setUnit] = useState<MyUnit | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const token = await auth0.getAccessTokenSilently()
        const apiUrl = import.meta.env.VITE_API_URL
        const response = await fetch(`${apiUrl}/units/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        // 404 es la respuesta normal para un guardia o para un residente
        // sin unidad asignada — no es un error, solo "no hay nada que
        // mostrar acá".
        if (!cancelled) {
          setUnit(response.ok ? await response.json() : null)
        }
      } catch {
        if (!cancelled) setUnit(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [auth0])

  return { unit, isLoading }
}

// Sección "Mi unidad" del Panel general: solo aparece si el usuario
// actual tiene una unidad asignada (cualquier residente con UnitId, sea
// o no administrador) — un guardia o un residente sin unidad no ven nada
// acá, en vez de una tarjeta vacía. La moneda de la cuota sale de
// /api/neighborhoods (abierto a cualquier autenticado, ver "Permisos por
// rol" en el documento de arquitectura), mismo criterio de resolución de
// moneda que ya usa UnitFeeAmountField en UnitShow.tsx.
export function MyUnitSection() {
  const { unit, isLoading } = useMyUnit()
  const translate = useTranslate()
  const formatLocale = useFormatLocale()
  const { data: neighborhood } = useGetOne(
    'neighborhoods',
    { id: unit?.neighborhoodId },
    { enabled: !!unit?.neighborhoodId },
  )

  if (isLoading || !unit) return null

  const effectiveFee = unit.feeAmount ?? neighborhood?.defaultFeeAmount

  return (
    <>
    {/* Cuota del mes en curso + acceso a cargar el comprobante. Va acá
        (y no suelta en Dashboard) para reusar la unidad ya cargada. */}
    <MonthlyPaymentCard unit={unit} fee={effectiveFee ?? null} currency={neighborhood?.currency ?? null} />
    <Card variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {translate('app.dashboard.myUnit')}
      </Typography>
      <AppFormRow>
        <AppFormCol span={3}>
          <Typography variant="body2" color="text.secondary">
            {translate('app.common.unit')}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {unit.identifier}
          </Typography>
        </AppFormCol>
        <AppFormCol span={3}>
          <Typography variant="body2" color="text.secondary">
            {translate('app.common.neighborhood')}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {neighborhood?.name ?? '—'}
          </Typography>
        </AppFormCol>
        <AppFormCol span={3}>
          <Typography variant="body2" color="text.secondary">
            {translate('app.dashboard.address')}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {unit.address ?? '—'}
          </Typography>
        </AppFormCol>
        <AppFormCol span={3}>
          <Typography variant="body2" color="text.secondary">
            {translate('app.dashboard.fee')}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {neighborhood && effectiveFee != null
              ? new Intl.NumberFormat(formatLocale, { style: 'currency', currency: neighborhood.currency }).format(effectiveFee)
              : '—'}
          </Typography>
        </AppFormCol>
      </AppFormRow>
    </Card>
    </>
  )
}
