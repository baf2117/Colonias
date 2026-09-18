// Domain-specific translations (resource and field names). Merged with the
// base ra-language-english package in src/i18nProvider.ts. The "||||"
// separator marks singular |||| plural, used by Polyglot to pick the right
// form based on count.
export const customEnglishMessages = {
  resources: {
    units: {
      name: 'Unit |||| Units',
      fields: {
        id: 'ID',
        identifier: 'Identifier',
        active: 'Active',
      },
    },
    neighborhoods: {
      name: 'Neighborhood |||| Neighborhoods',
      fields: {
        id: 'ID',
        name: 'Name',
        active: 'Active',
        temporaryCodesEnabled: 'Temporary codes enabled',
        permanentCodesEnabled: 'Permanent codes enabled',
        denyAccessEnabled: 'Deny access enabled',
      },
    },
  },
}
