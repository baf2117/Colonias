// Datos de ejemplo que Dashboard.tsx usaba para el cascarón visual del
// panel. A esta altura ya no se usan ahí (se sacaron "Cobros del mes",
// "Actividad reciente" y "Presupuesto del año" del todo, y "Recaudado
// del mes"/"Gastos del mes" pasaron a datos reales) — quedan en este
// archivo sin consumidor real más que EstadoCuota.tsx (que importa el
// tipo EstadoCargo), sin borrarse porque eso implicaría pedir permiso de
// borrado sobre la carpeta del usuario. Si en algún momento se quiere
// limpiar del todo, este archivo y components/EstadoCuota.tsx pueden
// borrarse juntos.

export type EstadoCargo = 'pagado' | 'vencido' | 'pendiente'

// Los dos KPIs de dinero ("Recaudado del mes" y "Gastos del mes") ya no
// son de ejemplo: Dashboard.tsx los calcula sumando /api/payments
// (aprobados), /api/expenses y /api/payroll del mes en curso — ver
// useGetList en Dashboard.tsx. "Reportes abiertos" y "Visitas de hoy" se
// sacaron del todo (son parte del grupo "Operación", ya oculto del menú).

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

// panelHeader (periodo/unidades) se eliminó: Dashboard.tsx ahora calcula
// el mes en curso con Intl y lee la cantidad de unidades real de
// /api/units (useGetList), en vez de quemarlos acá.
