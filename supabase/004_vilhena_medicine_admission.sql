-- LeadsFlow: permitir formas de ingresso somente no FORMS - MEDICINA de Vilhena.
-- Preserva integralmente a regra anterior e não altera dados de leads.
BEGIN;

DO $migration$
DECLARE
  regra_anterior text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid)
    INTO regra_anterior
    FROM pg_constraint
   WHERE conrelid = 'public.leads_meta'::regclass
     AND conname = 'leads_meta_modalidade_check';

  IF regra_anterior IS NULL THEN
    RAISE EXCEPTION 'Restrição esperada não encontrada; nenhuma alteração aplicada.';
  END IF;

  IF position('1854154859270138' IN regra_anterior) > 0 THEN
    RAISE NOTICE 'A regra de Medicina de Vilhena já está aplicada.';
    RETURN;
  END IF;

  ALTER TABLE public.leads_meta
    DROP CONSTRAINT leads_meta_modalidade_check;

  EXECUTE format(
    'ALTER TABLE public.leads_meta ADD CONSTRAINT leads_meta_modalidade_check
     CHECK ((%s) OR COALESCE((
       unidade = ''uninassau_vilhena''
       AND meta_form_id = ''1854154859270138''
       AND modalidade IN (''Portador de Diploma'', ''Nota do Enem'', ''Vestibular Agendado'')
     ), false))',
    regra_anterior
  );
END;
$migration$;

COMMIT;

SELECT conname, pg_get_constraintdef(oid) AS regra
FROM pg_constraint
WHERE conrelid = 'public.leads_meta'::regclass
  AND conname = 'leads_meta_modalidade_check';
