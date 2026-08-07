-- Adiciona campos de perfil do doador: data de nascimento e sexo
ALTER TABLE `contributions`
  ADD COLUMN `donorBirthDate` DATE NULL,
  ADD COLUMN `donorGender` ENUM('male', 'female', 'other', 'prefer_not_to_say') NULL;
