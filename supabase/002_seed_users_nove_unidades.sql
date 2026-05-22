-- =============================================================================
-- 9 usuários de teste (senha tratada pela app: demo "senha123" em /api/auth/login)
-- password_hash NULL faz o servidor aceitar a senha de demo igual ao login atual.
--
-- IMPORTANTE:
-- - Ajuste nome da tabela / colunas se seu schema diferir de:
--     users_faculdades ( id, email, ativo, faculdade, unidade, nome_completo, password_hash ... )
-- - Se já existirem registros pelos mesmos e-mails e houver erro de duplicidade,
--   você pode primeiro UPDATE manual ou remover os conflitos.
-- =============================================================================

INSERT INTO public.users_faculdades (
  email,
  ativo,
  faculdade,
  unidade,
  nome_completo,
  password_hash
) VALUES
  ('curitiba@unifael.com', true, 'unifael', 'unifael_curitiba',
   'UniFAEL Curitiba', NULL),
  ('lapa@unifael.com', true, 'unifael', 'unifael_lapa',
   'UniFAEL Lapa', NULL),
  ('florianopolis@unifael.com', true, 'unifael', 'unifael_florianopolis',
   'UniFAEL Florianópolis', NULL),
  ('portoalegre@unifael.com', true, 'unifael', 'unifael_porto_alegre',
   'UniFAEL Porto Alegre', NULL),
  ('vilhena@uninassau.com', true, 'uninassau', 'uninassau_vilhena',
   'Uninassau Vilhena', NULL),
  ('cacoal@uninassau.com', true, 'uninassau', 'uninassau_cacoal',
   'Uninassau Cacoal', NULL),
  ('barreiras@uninassau.com', true, 'uninassau', 'uninassau_barreiras',
   'Uninassau Barreiras', NULL),
  ('patos@uninassau.com', true, 'uninassau', 'uninassau_patos',
   'Uninassau Patos', NULL),
  ('campinagrande@uninassau.com', true, 'uninassau', 'uninassau_campina_grande',
   'Uninassau Campina Grande', NULL)
ON CONFLICT (email)
DO UPDATE SET
  ativo = EXCLUDED.ativo,
  faculdade = EXCLUDED.faculdade,
  unidade = EXCLUDED.unidade,
  nome_completo = EXCLUDED.nome_completo,
  password_hash = COALESCE(users_faculdades.password_hash, EXCLUDED.password_hash);

-- Se sua tabela NÃO tem UNIQUE(email), remova a cláusula ON CONFLICT e use apenas INSERT.
