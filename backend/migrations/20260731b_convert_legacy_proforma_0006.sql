-- Approved production correction:
--   Keep STSINV/2627/0006 as the original Proforma reference.
--   Create one separately numbered Tax Invoice with client PO 4700474323.
--
-- This migration is deliberately restricted to one invoice number and is
-- idempotent through both the conversion link and its unique index.
DO $$
DECLARE
  source_invoice invoices%ROWTYPE;
  existing_tax_invoice invoices%ROWTYPE;
  tax_invoice_id UUID;
  tax_prefix TEXT;
  fy_start INTEGER;
  fy_compact TEXT;
  number_prefix TEXT;
  next_sequence INTEGER;
  tax_invoice_number TEXT;
  payment_terms_days INTEGER;
BEGIN
  SELECT *
    INTO source_invoice
    FROM invoices
   WHERE invoice_number = 'STSINV/2627/0006'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Approved legacy Proforma STSINV/2627/0006 was not found';
  END IF;

  SELECT *
    INTO existing_tax_invoice
    FROM invoices
   WHERE converted_from_proforma_id = source_invoice.id;

  IF FOUND THEN
    IF existing_tax_invoice.purchase_order_number IS DISTINCT FROM '4700474323'
       OR existing_tax_invoice.proforma_reference_number
          IS DISTINCT FROM 'STSINV/2627/0006'
       OR existing_tax_invoice.invoice_type <> 'TAX_INVOICE'::invoice_type THEN
      RAISE EXCEPTION
        'Existing conversion for STSINV/2627/0006 does not match the approved PO/reference';
    END IF;

    RAISE NOTICE
      'SKIP: STSINV/2627/0006 already converted to %',
      existing_tax_invoice.invoice_number;
    RETURN;
  END IF;

  IF source_invoice.invoice_type NOT IN (
    'PROFORMA'::invoice_type,
    'TAX_INVOICE'::invoice_type
  ) THEN
    RAISE EXCEPTION
      'STSINV/2627/0006 has unsupported invoice type %',
      source_invoice.invoice_type;
  END IF;

  IF source_invoice.invoice_status = 'CANCELLED'::invoice_status THEN
    RAISE EXCEPTION
      'Cancelled invoice STSINV/2627/0006 cannot be converted';
  END IF;

  IF source_invoice.payment_status <> 'UNPAID'::payment_status
     OR EXISTS (
       SELECT 1
         FROM invoice_payments
        WHERE invoice_id = source_invoice.id
     ) THEN
    RAISE EXCEPTION
      'STSINV/2627/0006 has recorded payment activity and cannot be converted';
  END IF;

  -- The user explicitly requested that this legacy number remain unchanged.
  UPDATE invoices
     SET invoice_type = 'PROFORMA'::invoice_type,
         updated_at = NOW()
   WHERE id = source_invoice.id;

  SELECT UPPER(
           REGEXP_REPLACE(
             COALESCE(invoice_prefix, 'STS/INV'),
             '[^a-zA-Z0-9]',
             '',
             'g'
           )
         )
    INTO tax_prefix
    FROM billing_settings
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  tax_prefix := COALESCE(NULLIF(tax_prefix, ''), 'STSINV');
  IF LENGTH(tax_prefix) > 6 THEN
    RAISE EXCEPTION
      'Tax invoice prefix % exceeds the supported six characters',
      tax_prefix;
  END IF;

  fy_start :=
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
        THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1
    END;
  fy_compact :=
    RIGHT(fy_start::TEXT, 2) || RIGHT((fy_start + 1)::TEXT, 2);
  number_prefix := tax_prefix || '/' || fy_compact || '/';

  -- Serialize number allocation for this prefix and financial year.
  PERFORM pg_advisory_xact_lock(
    hashtext('billing-invoice-number:' || number_prefix)
  );

  SELECT COALESCE(
           MAX(SPLIT_PART(invoice_number, '/', 3)::INTEGER),
           0
         ) + 1
    INTO next_sequence
    FROM invoices
   WHERE invoice_number LIKE number_prefix || '%'
     AND SPLIT_PART(invoice_number, '/', 3) ~ '^[0-9]{4}$';

  IF next_sequence > 9999 THEN
    RAISE EXCEPTION
      'Tax invoice sequence exhausted for %',
      number_prefix;
  END IF;

  tax_invoice_number :=
    number_prefix || LPAD(next_sequence::TEXT, 4, '0');
  IF LENGTH(tax_invoice_number) > 16 THEN
    RAISE EXCEPTION
      'Generated Tax Invoice number % exceeds 16 characters',
      tax_invoice_number;
  END IF;

  SELECT COALESCE(bc.payment_terms_days, 30)
    INTO payment_terms_days
    FROM billing_clients bc
   WHERE bc.id = source_invoice.billing_client_id;

  INSERT INTO invoices (
    tenant_id,
    billing_client_id,
    invoice_type,
    invoice_number,
    invoice_date,
    due_date,
    financial_year,
    place_of_supply,
    state_code,
    gstin,
    sub_total,
    discount_total,
    taxable_value,
    cgst_rate,
    cgst_amount,
    sgst_rate,
    sgst_amount,
    igst_rate,
    igst_amount,
    total_gst,
    round_off,
    grand_total,
    amount_received,
    balance_outstanding,
    invoice_status,
    payment_status,
    mail_status,
    remarks,
    proforma_reference_number,
    purchase_order_number,
    converted_from_proforma_id,
    created_by
  )
  VALUES (
    source_invoice.tenant_id,
    source_invoice.billing_client_id,
    'TAX_INVOICE'::invoice_type,
    tax_invoice_number,
    CURRENT_DATE,
    CURRENT_DATE + COALESCE(payment_terms_days, 30),
    fy_start::TEXT || '-' || RIGHT((fy_start + 1)::TEXT, 2),
    source_invoice.place_of_supply,
    source_invoice.state_code,
    source_invoice.gstin,
    source_invoice.sub_total,
    source_invoice.discount_total,
    source_invoice.taxable_value,
    source_invoice.cgst_rate,
    source_invoice.cgst_amount,
    source_invoice.sgst_rate,
    source_invoice.sgst_amount,
    source_invoice.igst_rate,
    source_invoice.igst_amount,
    source_invoice.total_gst,
    source_invoice.round_off,
    source_invoice.grand_total,
    0,
    source_invoice.grand_total,
    'DRAFT'::invoice_status,
    'UNPAID'::payment_status,
    'NOT_SENT'::mail_status,
    source_invoice.remarks,
    'STSINV/2627/0006',
    '4700474323',
    source_invoice.id,
    source_invoice.created_by
  )
  RETURNING id INTO tax_invoice_id;

  INSERT INTO invoice_items (
    invoice_id,
    service_code,
    service_description,
    sac_code,
    period_from,
    period_to,
    quantity,
    rate,
    amount,
    discount_amount,
    taxable_amount,
    gst_rate,
    gst_amount,
    line_total,
    is_reimbursement,
    sequence
  )
  SELECT
    tax_invoice_id,
    service_code,
    service_description,
    sac_code,
    period_from,
    period_to,
    quantity,
    rate,
    amount,
    discount_amount,
    taxable_amount,
    gst_rate,
    gst_amount,
    line_total,
    is_reimbursement,
    sequence
  FROM invoice_items
  WHERE invoice_id = source_invoice.id;

  INSERT INTO invoice_audit_logs (
    invoice_id,
    action,
    old_status,
    new_status,
    changed_by,
    payload
  )
  VALUES
    (
      source_invoice.id,
      'CONVERT_TO_TAX_INVOICE',
      source_invoice.invoice_status::TEXT,
      source_invoice.invoice_status::TEXT,
      source_invoice.created_by,
      jsonb_build_object(
        'taxInvoiceId', tax_invoice_id,
        'taxInvoiceNumber', tax_invoice_number,
        'purchaseOrderNumber', '4700474323',
        'execution', 'approved-one-off-migration'
      )
    ),
    (
      tax_invoice_id,
      'CREATED_FROM_PROFORMA',
      NULL,
      'DRAFT',
      source_invoice.created_by,
      jsonb_build_object(
        'proformaId', source_invoice.id,
        'proformaNumber', 'STSINV/2627/0006',
        'purchaseOrderNumber', '4700474323',
        'execution', 'approved-one-off-migration'
      )
    );

  RAISE NOTICE
    'Converted Proforma STSINV/2627/0006 to Tax Invoice %',
    tax_invoice_number;
END $$;
