# Validação da prestação de contas

Em 25 de julho de 2026, a implementação foi validada com **47 testes Vitest aprovados**, verificação TypeScript e build de produção concluídos. Os testes focados cobrem autorização administrativa, visibilidade pública, assinaturas de arquivo, MIME, tamanho máximo, base64 inválido, datas futuras, vínculo de comprovantes e agregação de despesas por categoria.

As páginas `/accountability` e `/accountability/1`, além do painel administrativo de campanhas, foram revisadas em desktop e mobile. O banco não contém campanhas ou lançamentos reais; por isso, foram preservados estados vazios e de indisponibilidade honestos, sem inserir campanhas, despesas, documentos ou reconhecimentos simulados.

O índice público e o painel não apresentaram corte horizontal, sobreposição ou texto ilegível nas larguras revisadas. A validação manual do diálogo de prestação de contas e do upload real ao S3 permanece pendente até existir uma campanha autorizada para teste. O endereço público correto por campanha é `/accountability/:id`.
