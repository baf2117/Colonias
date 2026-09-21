// Traducciones específicas del dominio (nombres de recursos y campos).
// Se combinan con el paquete base @blackbox-vision/ra-language-spanish
// en src/i18nProvider.ts. El separador "||||" indica singular |||| plural,
// que Polyglot usa para elegir la forma correcta según el conteo.
export const customSpanishMessages = {
  resources: {
    units: {
      name: 'Unidad |||| Unidades',
      fields: {
        id: 'ID',
        identifier: 'Identificador',
        active: 'Activa',
        neighborhoodId: 'Colonia',
        address: 'Dirección',
        feeAmount: 'Cuota propia',
      },
    },
    neighborhoods: {
      name: 'Colonia |||| Colonias',
      fields: {
        id: 'ID',
        name: 'Nombre',
        active: 'Activa',
        temporaryCodesEnabled: 'Códigos temporales habilitados',
        permanentCodesEnabled: 'Códigos permanentes habilitados',
        denyAccessEnabled: 'Denegar acceso habilitado',
        defaultFeeAmount: 'Cuota',
        currency: 'Moneda',
      },
    },
    residents: {
      name: 'Residente |||| Residentes',
      fields: {
        id: 'ID',
        name: 'Nombre',
        phone: 'Teléfono',
        email: 'Correo',
        unitId: 'Unidad',
        administrador: 'Administrador',
        superAdministrador: 'Superadministrador',
        residente: 'Residente',
        active: 'Activo',
      },
    },
    expenses: {
      name: 'Gasto |||| Gastos',
      fields: {
        id: 'ID',
        vendorId: 'Proveedor',
        category: 'Categoría',
        amount: 'Monto',
        description: 'Descripción',
        date: 'Fecha',
      },
    },
    vendors: {
      name: 'Proveedor |||| Proveedores',
      fields: {
        id: 'ID',
        name: 'Nombre',
        phone: 'Teléfono',
        active: 'Activo',
        neighborhoodId: 'Colonia',
      },
    },
    'security-staff': {
      name: 'Guardia |||| Guardias',
      fields: {
        id: 'ID',
        name: 'Nombre',
        phone: 'Teléfono',
        active: 'Activo',
        neighborhoodId: 'Colonia',
        salary: 'Sueldo',
        bonuses: 'Bono',
      },
    },
    payments: {
      name: 'Pago |||| Pagos',
      fields: {
        id: 'ID',
        unitId: 'Unidad',
        residentId: 'Residente',
        period: 'Mes',
        amount: 'Monto',
        status: 'Estado',
        receiptBlobPath: 'Comprobante',
        rejectionReason: 'Motivo de rechazo',
        reviewedByUserId: 'Revisado por',
        reviewedAt: 'Revisado el',
        createdAt: 'Registrado el',
      },
    },
    payroll: {
      name: 'Pago de nómina |||| Pagos de nómina',
      fields: {
        id: 'ID',
        staffId: 'Guardia',
        period: 'Mes',
        amount: 'Monto',
        paid: 'Pagado',
        createdAt: 'Registrado el',
      },
    },
  },
}
