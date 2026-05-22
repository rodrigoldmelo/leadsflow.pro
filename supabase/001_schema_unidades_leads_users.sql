-- =============================================================================
-- Unidades por Ad Account (Meta)
-- Rode no SQL Editor do Supabase (PostgreSQL).
-- Permite leads antigos/usuários legados sem unidade: coluna pode ser NULL +
-- constraint aceita apenas NULL ou um dos nove valores válidos.
-- =============================================================================

ALTER TABLE public.leads_meta
  ADD COLUMN IF NOT EXISTS unidade text,
  ADD COLUMN IF NOT EXISTS ad_account_id text;

ALTER TABLE public.users_faculdades
  ADD COLUMN IF NOT EXISTS unidade text;

ALTER TABLE public.leads_meta DROP CONSTRAINT IF EXISTS leads_meta_unidade_chk;
ALTER TABLE public.leads_meta ADD CONSTRAINT leads_meta_unidade_chk
  CHECK (
    unidade IS NULL
    OR unidade IN (
      'unifael_curitiba',
      'unifael_lapa',
      'unifael_florianopolis',
      'unifael_porto_alegre',
      'uninassau_vilhena',
      'uninassau_cacoal',
      'uninassau_barreiras',
      'uninassau_patos',
      'uninassau_campina_grande'
    )
  );

ALTER TABLE public.users_faculdades DROP CONSTRAINT IF EXISTS users_faculdades_unidade_chk;
ALTER TABLE public.users_faculdades ADD CONSTRAINT users_faculdades_unidade_chk
  CHECK (
    unidade IS NULL
    OR unidade IN (
      'unifael_curitiba',
      'unifael_lapa',
      'unifael_florianopolis',
      'unifael_porto_alegre',
      'uninassau_vilhena',
      'uninassau_cacoal',
      'uninassau_barreiras',
      'uninassau_patos',
      'uninassau_campina_grande'
    )
  );

CREATE INDEX IF NOT EXISTS idx_leads_meta_unidade ON public.leads_meta (unidade);
CREATE INDEX IF NOT EXISTS idx_leads_meta_ad_account_id ON public.leads_meta (ad_account_id);

COMMENT ON COLUMN public.leads_meta.unidade IS 'Unidade física mapeada a partir do ad_account_id do Meta';
COMMENT ON COLUMN public.leads_meta.ad_account_id IS 'ID da conta de anúncios (somente dígitos, sem prefixo act_)';
COMMENT ON COLUMN public.users_faculdades.unidade IS 'Restringe dashboards/leads aos registros dessa unidade';
