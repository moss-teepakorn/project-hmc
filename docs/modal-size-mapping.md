# Modal Size Mapping Standard

This document defines the single modal sizing system for all pages and maps each page modal to an explicit size class.

## Size Tokens

Use these classes together with `house-md` only:

- `house-md house-md--xs`: Compact confirm/password dialogs
- `house-md house-md--sm`: Short forms with a few fields
- `house-md house-md--md`: Medium CRUD forms
- `house-md house-md--lg`: Large multi-section forms/detail views
- `house-md house-md--xl`: Very dense modals (table + form side by side)

Rule:

- Do not use `house-md` alone.
- Do not use legacy aliases (`house-md-home`, `house-md-vehicle`).

## Page-to-Size Mapping

### Admin

- `AdminLayout` -> Change password modal: `house-md--xs`
- `AdminAnnouncements` -> Create/Edit announcement: `house-md--lg`
- `AdminFees` -> Edit invoice: `house-md--md`
- `AdminFees` -> Process invoices all houses: `house-md--xs`
- `AdminHouses` -> Create/Edit house: `house-md--md`
- `AdminIssues` -> Create/Edit issue: `house-md--md`
- `AdminMarketplace` -> Create/Edit listing: `house-md--md`
- `AdminMarketplace` -> Listing detail view: `house-md--lg`
- `AdminPayments` -> Receive payment modal: `house-md--md`
- `AdminTechnicians` -> Create/Edit technician: `house-md--md`
- `AdminUsers` -> Create/Edit user: `house-md--md`
- `AdminVehicles` -> Create/Edit vehicle: `house-md--xl`
- `AdminViolations` -> Create/Edit violation: `house-md--xl`
- `AdminWorkReportsList` -> Add work report: `house-md--lg`
- `AdminWorkReportsList` -> Edit work report: `house-md--lg`

### Resident

- `ResidentLayout` -> Submit payment proof: `house-md--sm`
- `ResidentLayout` -> Update resident note/attachments: `house-md--md`

## PR Update Policy

When adding or editing a modal:

1. Always pick one explicit size class.
2. If a modal does not match existing token behavior, discuss before introducing a new token.
3. Keep this mapping document updated in the same PR.

## Verification

Run:

```bash
npm run lint:modal-size
```

Expected:

- `PASS: all modal containers with house-md use explicit size class (house-md--xs/sm/md/lg/xl).`
