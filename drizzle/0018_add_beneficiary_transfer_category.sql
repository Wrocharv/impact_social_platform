-- Adiciona categoria "beneficiary_transfer" (repasse a beneficiário) na tabela de despesas
ALTER TABLE `campaignExpenses` MODIFY COLUMN `category` ENUM(
  'materials',
  'labor',
  'equipment',
  'services',
  'transport',
  'fees',
  'other',
  'beneficiary_transfer'
) NOT NULL;
