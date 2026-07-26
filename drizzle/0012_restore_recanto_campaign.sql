-- Restaura a campanha Recanto de Paz se não existir
INSERT INTO campaigns (title, description, longDescription, category, goal, raised, status, imageUrl, createdBy, createdAt, updatedAt, startDate, endDate)
SELECT 
  'Construção Hotel Recanto de Paz',
  'Apoie a construção do Hotel Recanto de Paz com materiais e contribuições para a obra.',
  'Esta campanha reúne apoio para a construção do Hotel Recanto de Paz, incluindo materiais básicos, logística e serviços essenciais. A ideia é transformar a obra em um projeto comunitário com acompanhamento e transparência.',
  'infraestrutura',
  1000000,
  0,
  'active',
  '/obra-paredes.jpg',
  1,
  NOW(),
  NOW(),
  NOW(),
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns WHERE title = 'Construção Hotel Recanto de Paz'
);
