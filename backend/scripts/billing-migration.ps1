# billing-migration.ps1 - Run billing tables migration via Azure Container Apps exec
# Each SQL statement is executed as a separate az containerapp exec call

$DB_HOST = "statcompy-db.postgres.database.azure.com"
$DB_USER = "Statcocompy"
$DB_PASS = "Statco@123"
$DB_NAME = "statcompy"
$APP_NAME = "statcompy-backend"
$RG = "statcompy-rg"

function Run-Sql {
    param([string]$sql, [string]$label = "")
    $sqlB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($sql))
    $nodeScript = "const {Client}=require('pg');const c=new Client({host:'$DB_HOST',user:'$DB_USER',password:'$DB_PASS',database:'$DB_NAME',ssl:{rejectUnauthorized:false}});const sql=Buffer.from('$sqlB64','base64').toString('utf8');c.connect().then(()=>c.query(sql)).then(()=>{console.log('OK: $label');c.end();}).catch(e=>{console.log('ERR($label):'+e.message);c.end();});"
    Write-Host "Running: $label"
    az containerapp exec --name $APP_NAME --resource-group $RG --command "node -e `"$nodeScript`""
    Start-Sleep -Milliseconds 500
}

# ─── Enums ───
Run-Sql "DO `$`$ BEGIN CREATE TYPE billing_frequency AS ENUM ('ONE_TIME','MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY'); EXCEPTION WHEN duplicate_object THEN NULL; END `$`$" "enum billing_frequency"
Run-Sql "DO `$`$ BEGIN CREATE TYPE invoice_type AS ENUM ('PROFORMA','TAX_INVOICE','CREDIT_NOTE','DEBIT_NOTE','REIMBURSEMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END `$`$" "enum invoice_type"
Run-Sql "DO `$`$ BEGIN CREATE TYPE invoice_status AS ENUM ('DRAFT','APPROVED','GENERATED','EMAILED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END `$`$" "enum invoice_status"
Run-Sql "DO `$`$ BEGIN CREATE TYPE payment_status AS ENUM ('UNPAID','PARTIALLY_PAID','PAID','WRITTEN_OFF'); EXCEPTION WHEN duplicate_object THEN NULL; END `$`$" "enum payment_status"
Run-Sql "DO `$`$ BEGIN CREATE TYPE mail_status AS ENUM ('NOT_SENT','SENT','DELIVERED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END `$`$" "enum mail_status"
Run-Sql "DO `$`$ BEGIN CREATE TYPE payment_mode AS ENUM ('CASH','BANK_TRANSFER','UPI','CHEQUE','DD','NEFT','RTGS','IMPS'); EXCEPTION WHEN duplicate_object THEN NULL; END `$`$" "enum payment_mode"

# ─── billing_settings ───
Run-Sql "CREATE TABLE IF NOT EXISTS billing_settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,legal_name VARCHAR(250) NOT NULL,trade_name VARCHAR(250),gstin VARCHAR(20) NOT NULL,pan VARCHAR(20) NOT NULL,address TEXT NOT NULL,state_code VARCHAR(10) NOT NULL,state_name VARCHAR(100) NOT NULL,email VARCHAR(200),phone VARCHAR(30),bank_account_name VARCHAR(200),bank_name VARCHAR(150),account_number VARCHAR(50),ifsc_code VARCHAR(20),branch_name VARCHAR(150),invoice_prefix VARCHAR(20) DEFAULT 'STS/INV',proforma_prefix VARCHAR(20) DEFAULT 'STS/PI',credit_note_prefix VARCHAR(20) DEFAULT 'STS/CN',financial_year_format VARCHAR(30) DEFAULT 'YYYY-YY',default_gst_rate NUMERIC(5,2) DEFAULT 18,default_payment_terms_days INT DEFAULT 30,default_sac_code VARCHAR(20),authorized_signatory_name VARCHAR(150),authorized_signatory_designation VARCHAR(100),terms_and_conditions TEXT,notes_footer TEXT,updated_at TIMESTAMP DEFAULT NOW())" "billing_settings table"

# ─── billing_clients ───
Run-Sql "CREATE TABLE IF NOT EXISTS billing_clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,client_id UUID,billing_code VARCHAR(50) NOT NULL UNIQUE,legal_name VARCHAR(200) NOT NULL,trade_name VARCHAR(200),contact_person VARCHAR(150),billing_email VARCHAR(200) NOT NULL,cc_email TEXT,mobile VARCHAR(20),gst_applicable BOOLEAN DEFAULT TRUE,gstin VARCHAR(20),pan VARCHAR(20),place_of_supply VARCHAR(100),state_name VARCHAR(100) NOT NULL,state_code VARCHAR(10) NOT NULL,default_gst_rate NUMERIC(5,2) DEFAULT 18,default_sac_code VARCHAR(20),payment_terms_days INT DEFAULT 30,billing_frequency billing_frequency DEFAULT 'MONTHLY',billing_address TEXT NOT NULL,status VARCHAR(30) DEFAULT 'ACTIVE',created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW())" "billing_clients table"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_billing_clients_tenant ON billing_clients(tenant_id)" "idx_billing_clients_tenant"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_billing_clients_status ON billing_clients(status)" "idx_billing_clients_status"

# ─── invoices ───
Run-Sql "CREATE TABLE IF NOT EXISTS invoices (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,billing_client_id UUID NOT NULL REFERENCES billing_clients(id),invoice_type invoice_type NOT NULL,invoice_number VARCHAR(50) NOT NULL UNIQUE,invoice_date DATE NOT NULL,due_date DATE NOT NULL,financial_year VARCHAR(20) NOT NULL,place_of_supply VARCHAR(100),state_code VARCHAR(10),gstin VARCHAR(20),sub_total NUMERIC(14,2) DEFAULT 0,discount_total NUMERIC(14,2) DEFAULT 0,taxable_value NUMERIC(14,2) DEFAULT 0,cgst_rate NUMERIC(5,2) DEFAULT 0,cgst_amount NUMERIC(14,2) DEFAULT 0,sgst_rate NUMERIC(5,2) DEFAULT 0,sgst_amount NUMERIC(14,2) DEFAULT 0,igst_rate NUMERIC(5,2) DEFAULT 0,igst_amount NUMERIC(14,2) DEFAULT 0,total_gst NUMERIC(14,2) DEFAULT 0,round_off NUMERIC(14,2) DEFAULT 0,grand_total NUMERIC(14,2) DEFAULT 0,amount_received NUMERIC(14,2) DEFAULT 0,balance_outstanding NUMERIC(14,2) DEFAULT 0,invoice_status invoice_status DEFAULT 'DRAFT',payment_status payment_status DEFAULT 'UNPAID',mail_status mail_status DEFAULT 'NOT_SENT',remarks TEXT,pdf_path TEXT,created_by UUID NOT NULL,approved_by UUID,approved_at TIMESTAMP,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW())" "invoices table"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id)" "idx_invoices_tenant"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(billing_client_id)" "idx_invoices_client"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(invoice_status)" "idx_invoices_status"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoices_payment ON invoices(payment_status)" "idx_invoices_payment"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date)" "idx_invoices_date"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoices_fy ON invoices(financial_year)" "idx_invoices_fy"

# ─── invoice_items ───
Run-Sql "CREATE TABLE IF NOT EXISTS invoice_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,service_code VARCHAR(50),service_description TEXT NOT NULL,sac_code VARCHAR(20),period_from DATE,period_to DATE,quantity NUMERIC(10,2) DEFAULT 1,rate NUMERIC(14,2) DEFAULT 0,amount NUMERIC(14,2) DEFAULT 0,discount_amount NUMERIC(14,2) DEFAULT 0,taxable_amount NUMERIC(14,2) DEFAULT 0,gst_rate NUMERIC(5,2) DEFAULT 0,gst_amount NUMERIC(14,2) DEFAULT 0,line_total NUMERIC(14,2) DEFAULT 0,is_reimbursement BOOLEAN DEFAULT FALSE,sequence INT DEFAULT 1)" "invoice_items table"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)" "idx_invoice_items_invoice"

# ─── invoice_payments ───
Run-Sql "CREATE TABLE IF NOT EXISTS invoice_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,receipt_number VARCHAR(50) NOT NULL,payment_date DATE NOT NULL,amount_received NUMERIC(14,2) DEFAULT 0,tds_amount NUMERIC(14,2) DEFAULT 0,other_deduction NUMERIC(14,2) DEFAULT 0,net_received NUMERIC(14,2) DEFAULT 0,payment_mode payment_mode NOT NULL,reference_number VARCHAR(100),bank_name VARCHAR(100),remarks TEXT,created_by UUID NOT NULL,created_at TIMESTAMP DEFAULT NOW())" "invoice_payments table"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id)" "idx_invoice_payments_invoice"

# ─── invoice_email_logs ───
Run-Sql "CREATE TABLE IF NOT EXISTS invoice_email_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,to_email TEXT NOT NULL,cc_email TEXT,subject VARCHAR(250) NOT NULL,body TEXT,sent_status VARCHAR(30) NOT NULL DEFAULT 'NOT_SENT',sent_at TIMESTAMP,sent_by UUID,failure_reason TEXT,created_at TIMESTAMP NOT NULL DEFAULT NOW())" "invoice_email_logs table"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_email_logs_invoice ON invoice_email_logs(invoice_id)" "idx_email_logs_invoice"

# ─── recurring_invoice_configs ───
Run-Sql "CREATE TABLE IF NOT EXISTS recurring_invoice_configs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),billing_client_id UUID NOT NULL REFERENCES billing_clients(id),invoice_name VARCHAR(150) NOT NULL,frequency billing_frequency NOT NULL DEFAULT 'MONTHLY',service_description TEXT NOT NULL,default_amount NUMERIC(14,2) NOT NULL,default_gst_rate NUMERIC(5,2) DEFAULT 18,start_date DATE NOT NULL,end_date DATE,next_run_date DATE NOT NULL,is_active BOOLEAN DEFAULT TRUE,created_by UUID NOT NULL,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW())" "recurring_invoice_configs table"

# ─── invoice_audit_logs ───
Run-Sql "CREATE TABLE IF NOT EXISTS invoice_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,action VARCHAR(50) NOT NULL,old_status VARCHAR(30),new_status VARCHAR(30),changed_by UUID,payload JSONB,changed_at TIMESTAMP NOT NULL DEFAULT NOW())" "invoice_audit_logs table"
Run-Sql "CREATE INDEX IF NOT EXISTS idx_audit_logs_invoice ON invoice_audit_logs(invoice_id)" "idx_audit_logs_invoice"

# ─── Seed default billing settings ───
Run-Sql "INSERT INTO billing_settings (tenant_id,legal_name,trade_name,gstin,pan,address,state_code,state_name,email,phone,bank_account_name,bank_name,account_number,ifsc_code,branch_name,invoice_prefix,proforma_prefix,credit_note_prefix,default_gst_rate,default_payment_terms_days,authorized_signatory_name,authorized_signatory_designation,terms_and_conditions) SELECT '00000000-0000-0000-0000-000000000000','StatCo Solutions','StatCo Solutions','36LNIPK6065M1Z6','LNIPK6065M','D.No 8-3-228/595/3, Rehamat Nagar, Yusufguda, Hyderabad, Telangana - 500045','36','Telangana','Compliance@statcosol.com','+91 9000607839','Kallepalli Lakshmana Kumar','State Bank of India','44043172246','SBIN0014267','Yusufguda','STS/INV','STS/PI','STS/CN',18,30,'Kallepalli Lakshmana Kumar','Proprietor','We declare that this invoice shows the actual price of the services provided and that all particulars are true and correct.' WHERE NOT EXISTS (SELECT 1 FROM billing_settings LIMIT 1)" "seed billing_settings"

# ─── Verify ───
$verifySql = "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('billing_settings','billing_clients','invoices','invoice_items','invoice_payments','invoice_email_logs','recurring_invoice_configs','invoice_audit_logs')"
Run-Sql $verifySql "VERIFY: count billing tables"

Write-Host "Migration script complete!"
