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
        neighborhoodId: 'Neighborhood',
        address: 'Address',
        feeAmount: 'Own fee',
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
        defaultFeeAmount: 'Fee',
        currency: 'Currency',
      },
    },
    residents: {
      name: 'Resident |||| Residents',
      fields: {
        id: 'ID',
        name: 'Name',
        phone: 'Phone',
        email: 'Email',
        unitId: 'Unit',
        relationType: 'Relation to the unit',
        administrador: 'Administrator',
        superAdministrador: 'Super administrator',
        residente: 'Resident',
        guardia: 'Guard',
        active: 'Active',
      },
    },
    expenses: {
      name: 'Expense |||| Expenses',
      fields: {
        id: 'ID',
        vendorId: 'Vendor',
        category: 'Category',
        amount: 'Amount',
        description: 'Description',
        date: 'Date',
      },
    },
    vendors: {
      name: 'Vendor |||| Vendors',
      fields: {
        id: 'ID',
        name: 'Name',
        phone: 'Phone',
        active: 'Active',
        neighborhoodId: 'Neighborhood',
      },
    },
  },
}
