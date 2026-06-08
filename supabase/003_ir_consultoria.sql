-- =============================================================================
-- IR Consultoria
-- Rode no SQL Editor do Supabase antes de sincronizar leads da IR.
-- =============================================================================

ALTER TABLE public.leads_meta
  ADD COLUMN IF NOT EXISTS medico text,
  ADD COLUMN IF NOT EXISTS responsavel_atendimento text;

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
      'uninassau_campina_grande',
      'ir_consultoria'
    )
  );

ALTER TABLE public.leads_meta DROP CONSTRAINT IF EXISTS leads_meta_faculdade_check;
ALTER TABLE public.leads_meta ADD CONSTRAINT leads_meta_faculdade_check
  CHECK (faculdade IN ('unifael', 'uninassau', 'ir_consultoria'));

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
      'uninassau_campina_grande',
      'ir_consultoria'
    )
  );

ALTER TABLE public.users_faculdades DROP CONSTRAINT IF EXISTS users_faculdades_faculdade_check;
ALTER TABLE public.users_faculdades ADD CONSTRAINT users_faculdades_faculdade_check
  CHECK (faculdade IN ('unifael', 'uninassau', 'ir_consultoria'));

COMMENT ON COLUMN public.leads_meta.medico IS 'Resposta do formulário IR Consultoria: Você é Médico?';
COMMENT ON COLUMN public.leads_meta.responsavel_atendimento IS 'Pessoa responsável pelo atendimento do lead no CRM.';

CREATE TABLE IF NOT EXISTS public.lead_atendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade, nome)
);

CREATE INDEX IF NOT EXISTS idx_lead_atendentes_unidade
  ON public.lead_atendentes (unidade);

-- Crie o login separado da IR ajustando email e senha:
-- INSERT INTO public.users_faculdades (email, ativo, faculdade, unidade, nome_completo, password_hash)
-- VALUES ('irconsultoria@seudominio.com.br', true, 'ir_consultoria', 'ir_consultoria', 'IR Consultoria', 'troque-esta-senha')
-- ON CONFLICT (email) DO UPDATE SET
--   ativo = EXCLUDED.ativo,
--   faculdade = EXCLUDED.faculdade,
--   unidade = EXCLUDED.unidade,
--   nome_completo = EXCLUDED.nome_completo,
--   password_hash = EXCLUDED.password_hash;
