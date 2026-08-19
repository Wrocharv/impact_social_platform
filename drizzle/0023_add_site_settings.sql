CREATE TABLE IF NOT EXISTS `siteSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`heroTitle` varchar(255) NOT NULL DEFAULT 'Juntos Transformamos Vidas',
	`heroSubtitle` text,
	`heroImageUrl` varchar(512),
	`presentationTitle` varchar(255),
	`presentationDescription` text,
	`presentationVideoUrl` varchar(512),
	`step1Title` varchar(255) NOT NULL DEFAULT 'Escolha uma campanha',
	`step1Description` text,
	`step2Title` varchar(255) NOT NULL DEFAULT 'Contribua do seu jeito',
	`step2Description` text,
	`step3Title` varchar(255) NOT NULL DEFAULT 'Acompanhe o progresso',
	`step3Description` text,
	`helpButtonLabel` varchar(100) NOT NULL DEFAULT 'Eu quero ajudar',
	`partnerButtonLabel` varchar(100) NOT NULL DEFAULT 'Quero ser parceiro',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `siteSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `siteSettings` (
	`id`, `heroTitle`, `heroSubtitle`, `heroImageUrl`, `presentationTitle`, `presentationDescription`, `presentationVideoUrl`,
	`step1Title`, `step1Description`, `step2Title`, `step2Description`, `step3Title`, `step3Description`,
	`helpButtonLabel`, `partnerButtonLabel`
)
SELECT
	1, 'Juntos Transformamos Vidas',
	'Cada contribuição se transforma em cuidado, dignidade e esperança para quem mais precisa.',
	'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1600&q=80',
	'Veja o propósito e o objetivo deste projeto',
	'Conheça algumas de nossas ações e seja um doador, seja um parceiro do bem.',
	'/uploads/campaigns/1786167100165-parceriadobem01.mov',
	'Escolha uma campanha', 'Conheça a etapa atual, as necessidades e as atualizações antes de contribuir para a obra.',
	'Contribua do seu jeito', 'Doe financeiramente, ofereça materiais ou disponibilize sua mão de obra para a evolução da obra.',
	'Acompanhe o progresso', 'Consulte fotos, registros e documentos publicados em cada etapa da campanha.',
	'Eu quero ajudar', 'Quero ser parceiro'
WHERE NOT EXISTS (SELECT 1 FROM `siteSettings` WHERE `id` = 1);
