# Validação da gestão administrativa de campanhas

Em 25 de julho de 2026, a verificação de tipos, a suíte com **36 testes** e o build de produção foram concluídos com sucesso. Os testes cobrem edição de campanha, serialização de mídias, cadastro de necessidades e rejeição de registros vinculados a campanha inexistente.

A homepage e a aba administrativa de campanhas foram revisadas em desktop (1440 × 1000) e mobile (390 × 844). Não foram observados cortes horizontais, sobreposições ou conteúdo ilegível. O estado vazio exibido corresponde ao banco atual: nenhuma campanha ou estatística fictícia foi inserida para facilitar a captura.

Os formulários de edição, atualização de obra e necessidade estão ligados a mutações administrativas e invalidam as consultas públicas afetadas após sucesso. A execução manual dessas três mutações permanece pendente até existir uma campanha real autorizada e acesso administrativo disponível; nenhum dado simulado foi criado no banco.
