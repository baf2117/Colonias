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
        administrador: 'Administrator',
        superAdministrador: 'Super administrator',
        residente: 'Resident',
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
    'security-staff': {
      name: 'Guard |||| Guards',
      fields: {
        id: 'ID',
        name: 'Name',
        phone: 'Phone',
        active: 'Active',
        neighborhoodId: 'Neighborhood',
        salary: 'Salary',
        bonuses: 'Bonus',
        hireDate: 'Hire date',
      },
    },
    payments: {
      name: 'Payment |||| Payments',
      fields: {
        id: 'ID',
        unitId: 'Unit',
        residentId: 'Resident',
        period: 'Month',
        paymentDate: 'Payment date',
        amount: 'Amount',
        status: 'Status',
        receiptBlobPath: 'Receipt',
        rejectionReason: 'Rejection reason',
        reviewedByUserId: 'Reviewed by',
        reviewedAt: 'Reviewed at',
        createdAt: 'Created at',
      },
    },
    payroll: {
      name: 'Payroll payment |||| Payroll payments',
      fields: {
        id: 'ID',
        staffId: 'Guard',
        period: 'Month',
        amount: 'Amount',
        paid: 'Paid',
        createdAt: 'Created at',
      },
    },
    'account-statement': {
      name: 'Account statement |||| Account statement',
    },
    'bank-statements': {
      name: 'Bank statement |||| Bank statements',
      fields: {
        id: 'ID',
        neighborhoodId: 'Neighborhood',
        period: 'Month',
        bankBalance: 'Bank balance',
        statementBlobPath: 'File',
        notes: 'Notes',
        uploadedByUserId: 'Uploaded by',
        createdAt: 'Uploaded at',
      },
    },
  },
}
