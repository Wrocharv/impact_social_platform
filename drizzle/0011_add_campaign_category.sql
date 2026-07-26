ALTER TABLE campaigns ADD COLUMN category ENUM('moradia', 'educacao', 'saude', 'alimentacao', 'infraestrutura', 'outro') DEFAULT 'outro';
