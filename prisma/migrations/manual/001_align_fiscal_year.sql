-- =============================================================================
-- Migration: 001_align_fiscal_year.sql
-- Purpose:   Align fiscal year boundary, document budget metric types, and
--            pre-stage the monthly_budgets table.
-- Safe to re-run: all statements are idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Document valid metric_type values on targets.metric_type
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN targets.metric_type IS
  'Valid values — Strategic: loss_ratio, net_wp, policy_count; Budget: gwp_budget, gross_claims_budget, gross_commission_budget, expenses_budget';

-- ---------------------------------------------------------------------------
-- 2. Create monthly_budgets table (pre-staging; Prisma db push also creates it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uw_year      INTEGER     NOT NULL,
  product_line TEXT,
  metric_type  TEXT        NOT NULL,
  month_index  INTEGER     NOT NULL,
  month_label  TEXT        NOT NULL,
  budget_value NUMERIC(18,2) NOT NULL,
  source_file  TEXT,
  import_run_id UUID,
  set_by       UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT monthly_budgets_uw_year_product_line_metric_type_month_index_key
    UNIQUE (uw_year, product_line, metric_type, month_index)
);

CREATE INDEX IF NOT EXISTS monthly_budgets_uw_year_idx
  ON monthly_budgets (uw_year);

CREATE INDEX IF NOT EXISTS monthly_budgets_metric_type_idx
  ON monthly_budgets (metric_type);

-- ---------------------------------------------------------------------------
-- 3. Fiscal year boundary alignment check
--
-- Under the OLD boundary (September), claims with an incident date between
-- Dec 22 and Dec 31 of year N may have been stored with uw_year = N when
-- under the CURRENT calendar boundary they should be uw_year = N+1.
--
-- This block detects such Target rows and inserts companion rows for the
-- corrected UW year if they do not already exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  companion_exists BOOLEAN;
BEGIN
  FOR rec IN
    SELECT id, metric_type, product_line, uw_year, annual_target, set_by
    FROM   targets
    WHERE  created_at::date BETWEEN
             make_date(EXTRACT(YEAR FROM created_at)::int, 12, 22)
             AND
             make_date(EXTRACT(YEAR FROM created_at)::int, 12, 31)
  LOOP
    -- Check if a companion row for uw_year + 1 already exists
    SELECT EXISTS (
      SELECT 1 FROM targets
      WHERE metric_type  = rec.metric_type
        AND (product_line = rec.product_line OR (product_line IS NULL AND rec.product_line IS NULL))
        AND uw_year      = rec.uw_year + 1
    ) INTO companion_exists;

    IF NOT companion_exists THEN
      RAISE NOTICE 'Inserting companion target row: metric_type=%, product_line=%, old_uw_year=%, new_uw_year=%',
        rec.metric_type, rec.product_line, rec.uw_year, rec.uw_year + 1;

      INSERT INTO targets (id, metric_type, product_line, uw_year, annual_target, set_by, updated_at, created_at)
      VALUES (
        gen_random_uuid(),
        rec.metric_type,
        rec.product_line,
        rec.uw_year + 1,
        rec.annual_target,
        rec.set_by,
        now(),
        now()
      )
      ON CONFLICT (metric_type, product_line, uw_year) DO NOTHING;
    ELSE
      RAISE NOTICE 'Companion already exists for metric_type=%, product_line=%, uw_year=%',
        rec.metric_type, rec.product_line, rec.uw_year + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Fiscal year alignment check complete.';
END;
$$ LANGUAGE plpgsql;
