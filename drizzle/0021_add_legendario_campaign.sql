INSERT INTO campaigns (title, description, longDescription, category, goal, vipApartmentAmountCents, helpTierOptions, raised, status, imageUrl, createdBy, createdAt, updatedAt, startDate, endDate)
SELECT
  'LEGENDARIO SOLIDARIO',
  'Legendário Solidário é uma campanha que transforma união, fé e generosidade em cuidado para quem mais precisa. Juntos, podemos servir, abençoar famílias e deixar um legado de esperança.',
  'O Legendário Solidário nasceu com o propósito de transformar vidas por meio da fé, da união e do serviço ao próximo. Mais do que viver experiências marcantes, ser Legendário também é compreender que fomos chamados para servir e fazer a diferença na vida das pessoas. Por meio desta campanha, vamos mobilizar homens, famílias, empresas e parceiros para apoiar pessoas que enfrentam dificuldades e precisam de uma oportunidade para recomeçar. Cada contribuição, independentemente do valor, representa alimento, cuidado, dignidade e esperança.',
  'outro',
  1500000,
  150000,
  'material,financial,vip',
  0,
  'active',
  '/uploads/campaigns/1786040704722-campaign-100002-cover-ccabb70c21c7.jpg',
  1,
  '2026-08-01 01:51:19',
  NOW(),
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns WHERE title = 'LEGENDARIO SOLIDARIO'
);
--> statement-breakpoint
INSERT INTO campaignNeeds (campaignId, type, name, description, quantity, targetQuantityExact, unitValueCents, priority, fulfilled, createdAt)
SELECT c.id, 'material', 'Barraca', NULL, 'unidade', 10, 20900, 'medium', 0, '2026-08-01 01:51:19'
FROM campaigns c
WHERE c.title = 'LEGENDARIO SOLIDARIO'
  AND NOT EXISTS (SELECT 1 FROM campaignNeeds n WHERE n.campaignId = c.id AND n.name = 'Barraca');
--> statement-breakpoint
INSERT INTO campaignNeeds (campaignId, type, name, description, quantity, targetQuantityExact, unitValueCents, priority, fulfilled, createdAt)
SELECT c.id, 'material', 'Mochila 50 litros', NULL, 'unidade', 10, 18000, 'medium', 0, '2026-08-01 01:51:19'
FROM campaigns c
WHERE c.title = 'LEGENDARIO SOLIDARIO'
  AND NOT EXISTS (SELECT 1 FROM campaignNeeds n WHERE n.campaignId = c.id AND n.name = 'Mochila 50 litros');
--> statement-breakpoint
INSERT INTO campaignNeeds (campaignId, type, name, description, quantity, targetQuantityExact, unitValueCents, priority, fulfilled, createdAt)
SELECT c.id, 'material', 'Manta Térmica', NULL, 'unidade', 10, 2500, 'medium', 0, '2026-08-01 01:51:19'
FROM campaigns c
WHERE c.title = 'LEGENDARIO SOLIDARIO'
  AND NOT EXISTS (SELECT 1 FROM campaignNeeds n WHERE n.campaignId = c.id AND n.name = 'Manta Térmica');
--> statement-breakpoint
INSERT INTO campaignNeeds (campaignId, type, name, description, quantity, targetQuantityExact, unitValueCents, priority, fulfilled, createdAt)
SELECT c.id, 'material', 'Isolante Térmico', NULL, 'unidade', 10, 3600, 'medium', 0, '2026-08-01 01:51:19'
FROM campaigns c
WHERE c.title = 'LEGENDARIO SOLIDARIO'
  AND NOT EXISTS (SELECT 1 FROM campaignNeeds n WHERE n.campaignId = c.id AND n.name = 'Isolante Térmico');
--> statement-breakpoint
INSERT INTO campaignNeeds (campaignId, type, name, description, quantity, targetQuantityExact, unitValueCents, priority, fulfilled, createdAt)
SELECT c.id, 'material', 'Bastão Caminhada', NULL, 'cada', 10, 12000, 'medium', 0, '2026-08-01 01:51:19'
FROM campaigns c
WHERE c.title = 'LEGENDARIO SOLIDARIO'
  AND NOT EXISTS (SELECT 1 FROM campaignNeeds n WHERE n.campaignId = c.id AND n.name = 'Bastão Caminhada');
--> statement-breakpoint
INSERT INTO campaignNeeds (campaignId, type, name, description, quantity, targetQuantityExact, unitValueCents, priority, fulfilled, createdAt)
SELECT c.id, 'material', 'Saco de Dormir', NULL, 'unidade', 10, 13800, 'medium', 0, '2026-08-01 01:51:19'
FROM campaigns c
WHERE c.title = 'LEGENDARIO SOLIDARIO'
  AND NOT EXISTS (SELECT 1 FROM campaignNeeds n WHERE n.campaignId = c.id AND n.name = 'Saco de Dormir');
--> statement-breakpoint
INSERT INTO campaignNeeds (campaignId, type, name, description, quantity, targetQuantityExact, unitValueCents, priority, fulfilled, createdAt)
SELECT c.id, 'material', 'Lona', NULL, 'unidade', 10, 8000, 'medium', 0, '2026-08-01 01:51:19'
FROM campaigns c
WHERE c.title = 'LEGENDARIO SOLIDARIO'
  AND NOT EXISTS (SELECT 1 FROM campaignNeeds n WHERE n.campaignId = c.id AND n.name = 'Lona');
