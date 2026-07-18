// STELLA 0.1.0 provisional Chart of Accounts (expense categories).
//
// ⚠️ PROVISIONAL — NOT the canonical full-ledger COA. These are free-text values
// written into oliver.expense.category (NVARCHAR(60), no CHECK constraint). The
// full STELLA ledger will replace this with a real, structured chart of accounts.
// Schedule-C-aligned so a monthly P&L reads like real books.
export const STELLA_COA: readonly string[] = [
  "Advertising & Marketing",
  "Car, Truck & Mileage",
  "Contract Labor / Subcontractors",
  "Insurance",
  "Legal & Professional Services",
  "Office & Software",
  "Rent & Lease",
  "Repairs & Maintenance",
  "Supplies & Materials",
  "Taxes & Licenses",
  "Travel & Meals",
  "Utilities",
  "Other Expenses",
];
