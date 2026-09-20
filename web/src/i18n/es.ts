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
        guardia: 'Guardia',
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
  },
}
