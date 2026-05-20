-- Enable Row Level Security on all public tables exposed to PostgREST.
-- The service_role (used by Prisma) bypasses RLS automatically.
-- Explicit deny-all restrictive policies are added to satisfy the linter
-- and make it clear that no direct PostgREST access is intended.

ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_snapshots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_budgets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_line_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tat_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_deliverables    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handler_targets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_metric_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acknowledged_delays     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_flags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_actions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_staff           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_audit_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uw_snapshots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_summaries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_counts           ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all policies (service_role bypasses RLS, so these only affect
-- anon/authenticated roles hitting PostgREST directly)

CREATE POLICY "deny_all" ON public.profiles                AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.claim_snapshots         AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.monthly_budgets         AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.product_line_aliases    AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.tat_config              AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.project_deliverables    AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.project_updates         AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.project_documents       AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.project_milestones      AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.projects                AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.handler_targets         AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.import_runs             AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.target_metric_config    AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.acknowledged_delays     AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.generated_reports       AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.claim_flags             AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.targets                 AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.claim_actions           AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.mailbox_staff           AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.routing_rules           AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.mailbox_configs         AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.mailbox_audit_logs      AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.routing_categories      AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.email_records           AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.uw_snapshots            AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.payments                AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.premium_records         AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.financial_summaries     AS RESTRICTIVE FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.policy_counts           AS RESTRICTIVE FOR ALL USING (false);
