// Datos de ejemplo para el cascarón visual del panel — el mismo shape que
// van a tener los endpoints reales (resumen del panel, cargos del mes,
// actividad reciente) cuando se conecten. Nada de esto viene de la API
// todavía: es solo para que la pantalla se vea y se sienta terminada.

export type EstadoCargo = 'pagado' | 'vencido' | 'pendiente'

export interface KpiSample {
  label: string
  value: string
  detail: string
  tone?: 'default' | 'critical'
}

export const kpis: KpiSample[] = [
  { label: 'Recaudado del mes', value: '$4.812.500', detail: '78% de lo facturado' },
  { label: 'Morosidad acumulada', value: '$1.364.000', detail: '23 unidades', tone: 'critical' },
  { label: 'Reportes abiertos', value: '7', detail: '2 fuera de plazo' },
  { label: 'Visitas de hoy', value: '34', detail: '5 por autorizar' },
]

export interface CargoSample {
  unidad: string
  residente: string
  concepto: string
  monto: string
  estado: EstadoCargo
}

export const cobrosDelMes: CargoSample[] = [
  { unidad: 'Casa 14-B', residente: 'Marcela Fonseca', concepto: 'Cuota ordinaria', monto: '$185.000', estado: 'pagado' },
  { unidad: 'Apto 302', residente: 'Julián Estrada', concepto: 'Cuota ordinaria', monto: '$142.000', estado: 'vencido' },
  { unidad: 'Casa 07-A', residente: 'Rocío Palma', concepto: 'Cuota + multa por ruido', monto: '$210.500', estado: 'pagado' },
  { unidad: 'Apto 118', residente: 'Néstor Villalba', concepto: 'Cuota ordinaria', monto: '$142.000', estado: 'vencido' },
  { unidad: 'Casa 22-C', residente: 'Andrea Solís', concepto: 'Cuota ordinaria', monto: '$185.000', estado: 'pendiente' },
]

export interface ActividadSample {
  titulo: string
  detalle?: string
  cuando: string
}

export const actividadReciente: ActividadSample[] = [
  { titulo: 'Pago aplicado a Casa 07-A', detalle: 'Karla Méndez', cuando: 'Hoy 09:42' },
  { titulo: 'Reporte #248 asignado a mantenimiento', detalle: 'Fuga en zona verde', cuando: 'Hoy 09:15' },
  { titulo: 'Pase de visita generado para Apto 302', detalle: 'Vigente hasta las 20:00', cuando: 'Hoy 08:58' },
  { titulo: 'Acta de asamblea de agosto publicada', cuando: 'Ayer 17:20' },
  { titulo: '3 unidades pasaron a morosidad', detalle: 'Proceso automático', cuando: 'Ayer 00:05' },
]

export const presupuestoAnual = {
  ejecutadoPct: 68,
  ejecutado: '$32.480.000',
  total: '$47.760.000',
}

export const panelHeader = {
  periodo: 'Septiembre 2026',
  unidades: 148,
}
