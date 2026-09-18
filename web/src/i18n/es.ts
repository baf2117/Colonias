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
      },
    },
  },
}
