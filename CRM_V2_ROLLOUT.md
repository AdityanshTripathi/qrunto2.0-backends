# CRM v2 cutover

The new CRM starts with empty guest, consent, loyalty, segment, and campaign history. Paid orders, payments, and invoices are retained. The legacy reset detaches old customer links from orders before deleting generation 1 CRM records.

1. Take and verify a restorable database backup. Record its absolute path.
2. Set `CRM_OTP_SECRET` (at least 32 characters), `CRM_CREDENTIAL_ENCRYPTION_KEY` (64 hex characters), `WHATSAPP_APP_SECRET`, `WHATSAPP_AUTH_TEMPLATE_NAME`, and `WHATSAPP_GRAPH_API_VERSION` in the backend environment. Configure the Meta webhook and an approved authentication template.
3. Run `npx prisma migrate deploy`, `npx prisma generate`, and `npm run build` in this backend directory.
4. Open the new CRM in the owner dashboard and save the brand WhatsApp phone number ID and access token. Verify the status and an OTP on a test phone.
5. Run the legacy reset once per brand. First run it without `--execute` to review counts. Set `CRM_V2_RESET_BRAND_ID` to the brand UUID, then run `npm run crm:reset-legacy -- --execute --backup=<absolute-path-to-verified-backup>`.
6. Check a new guest checkout, paid order, point accrual, opt-in/opt-out, and a test campaign before opening the CRM to staff.

Do not run the reset before a verified backup. The reset deletes legacy CRM records and cannot reconstruct their customer links from the retained financial rows.
