# Parceria do Bem - TODO

## Arquitetura de Dados
- [x] Criar schema de campanhas (nome, descrição, meta, status, datas)
- [x] Criar schema de contribuições (tipo: financeira/material/voluntário, valor/descrição)
- [x] Criar schema de parceiros (empresas/pessoas físicas, logo, descrição)
- [x] Criar schema de embaixadores (link personalizado, ranking)
- [x] Criar schema de atualizações de campanha (fotos, vídeos, descrição)
- [x] Criar schema de documentos de transparência (notas fiscais, recibos)
- [x] Criar schema de necessidades por campanha (tipo de material, quantidade)

## Homepage Pública
- [x] Criar layout da homepage com hero section
- [x] Exibir missão da plataforma "Parceiros do Bem"
- [x] Criar seção de campanhas em destaque com cards
- [x] Implementar botões "Quero Ajudar" e "Quero ser Parceiro"
- [ ] Adicionar seção de parceiros reconhecidos com dados aprovados do backend
- [x] Criar footer com informações e links
- [ ] Adicionar seção de Histórias de Sucesso com dados aprovados do backend e galeria antes/depois

## Listagem de Campanhas
- [x] Criar página de listagem com filtros (ativas, concluídas, etc.)
- [x] Exibir cards de campanha com foto, descrição, meta e barra de progresso
- [x] Implementar busca por nome de campanha
- [ ] Adicionar paginação ou scroll infinito

## Página Individual de Campanha
- [x] Criar galeria de fotos e vídeos
- [x] Implementar linha do tempo Antes/Durante/Depois
- [x] Exibir lista de necessidades (cimento, tijolos, mão de obra, etc.)
- [x] Mostrar barra de progresso de arrecadação
- [x] Criar feed de atualizações da obra
- [ ] Exibir parceiros que já contribuíram

## Sistema de Contribuições
- [x] Configurar e validar credenciais de produção do Mercado Pago
- [x] Criar procedimentos tRPC para gerenciar contribuições
- [x] Criar formulário de doação financeira via Checkout Pro do Mercado Pago
- [x] Implementar webhook assinado para confirmar pagamentos
- [x] Criar formulário de doação de material
- [x] Criar formulário de oferta de mão de obra voluntária
- [x] Implementar páginas de retorno sem confirmação insegura pelo navegador
- [ ] Armazenar histórico de contribuições do usuário
- [x] Criar páginas de retorno aprovado, pendente e falha

## Painel de Prestação de Contas
- [ ] Criar gráfico de arrecadação vs. gastos por campanha
- [ ] Implementar feed de atualizações com fotos
- [ ] Criar repositório de notas fiscais e recibos
- [ ] Exibir total arrecadado e gasto por campanha
- [ ] Implementar filtros por período

## Painel Administrativo
- [ ] Criar interface para criar novas campanhas
- [ ] Implementar edição de campanhas existentes
- [ ] Criar formulário para publicar atualizações de obra
- [ ] Implementar upload de fotos e vídeos
- [ ] Criar interface para upload de documentos de transparência
- [ ] Adicionar gerenciamento de parceiros
- [ ] Implementar aprovação/rejeição de contribuições

## Sistema de Embaixadores
- [x] Criar página de embaixadores
- [ ] Gerar link personalizado persistido para cada embaixador
- [ ] Implementar ranking de arrecadação baseado em pagamentos aprovados
- [ ] Criar dashboard de embaixador com estatísticas reais
- [ ] Adicionar incentivos/gamificação após definir regras verificáveis
- [ ] Adicionar botões de compartilhamento rápido após gerar link persistido

## Notificações
- [ ] Implementar confirmação de contribuição por e-mail
- [ ] Criar notificação de atualizações de progresso
- [ ] Enviar relatório de prestação de contas
- [ ] Implementar notificações de nova campanha
- [ ] Criar sistema de preferências de notificação

## Prioridade P1.1 — confirmação automática por e-mail
- [x] Criar registro auditável e idempotente de entregas de notificação
- [x] Criar e migrar a tabela `notificationDeliveries`
- [x] Implementar serviço que grave tentativas, erros e identificador do provedor
- [x] Cobrir deduplicação, concorrência e novas tentativas nos testes
- [ ] Configurar provedor de e-mail com chave e remetente em variáveis seguras
- [ ] Ativar `RESEND_API_KEY`, `EMAIL_FROM` e `EMAIL_REPLY_TO` quando o responsável definir os endereços
- [x] Manter o envio real desativado e sem impacto financeiro enquanto as credenciais estiverem ausentes
- [x] Criar mensagem de confirmação com campanha, valor e referência da contribuição
- [x] Enviar confirmação somente após pagamento aprovado pela API oficial
- [x] Evitar duplicidade de e-mail em Webhooks repetidos ou concorrentes
- [x] Preservar a confirmação financeira quando o provedor de e-mail estiver indisponível
- [x] Cobrir modelo, mensagem, idempotência, sucesso e falha com testes Vitest

## Prioridade P1.2 — vitrine e gestão de parceiros
- [x] Criar listagem pública de parceiros persistidos com ordenação estável
- [x] Criar procedimentos administrativos para cadastrar, editar e excluir parceiros
- [x] Validar nome, tipo, descrição, logo e site no backend
- [x] Substituir a seção provisória da homepage por vitrine com carregamento, erro e estado vazio
- [ ] Criar gerenciamento de parceiros no painel administrativo
- [x] Exibir somente dados reais, sem logos ou reconhecimentos simulados
- [x] Cobrir listagem pública e mutações administrativas com Vitest
- [ ] Validar a vitrine e o painel em desktop e mobile
- [x] Validar visualmente a vitrine pública em desktop e mobile
- [ ] Validar visualmente o painel autenticado em desktop e mobile com confirmação manual
- [ ] Validar manualmente o CRUD autenticado de parceiros e o reflexo na homepage
- [ ] Retomar a validação administrativa quando o acesso autenticado estiver disponível

## Prioridade P1.3 — gestão de campanhas e atualizações
- [x] Criar edição administrativa de título, descrições, meta, imagem e status da campanha
- [x] Criar publicação administrativa de atualizações com fase e URLs de mídia validadas
- [x] Criar cadastro administrativo de necessidades com tipo, quantidade e prioridade
- [x] Atualizar imediatamente as consultas públicas após cada mutação
- [x] Validar existência da campanha antes de editar ou publicar dados relacionados
- [x] Cobrir edição, atualização e necessidade com testes Vitest
- [ ] Validar painel e reflexo público em desktop e mobile sem inserir dados simulados
- [x] Validar tipos, 36 testes, build e estados vazios responsivos sem inserir dados simulados
- [ ] Validar manualmente edição, atualização e necessidade com uma campanha real autorizada

## Prioridade P1.4 — despesas e documentos de transparência
- [x] Criar tabela de despesas por campanha com categoria, data, valor e responsável
- [x] Adicionar metadados S3 aos documentos sem armazenar arquivos no banco
- [x] Criar upload administrativo de PDF, JPEG ou PNG com limite de tamanho e validação de conteúdo
- [x] Criar cadastro administrativo de despesa com documento comprobatório opcional
- [x] Expor totais e categorias de despesas somente para campanhas publicadas
- [x] Exibir arrecadado, gasto, saldo e distribuição por categoria na prestação de contas
- [x] Exibir documentos reais armazenados no S3 com metadados públicos
- [x] Cobrir permissões, upload, validações e agregações financeiras com Vitest
- [x] Testar visibilidade pública e autorização administrativa dos relatórios
- [x] Testar limite de tamanho, base64 inválido e assinatura incompatível
- [x] Testar data futura e comprovante vinculado a outra campanha
- [ ] Validar estados vazios e responsividade sem inserir despesas ou documentos simulados
- [x] Validar estados vazios públicos e administrativos em desktop e mobile sem inserir dados simulados
- [ ] Validar manualmente o diálogo, o upload S3 e o reflexo público com uma campanha real autorizada

## Prioridade P1.5 — embaixadores e atribuição
- [ ] Criar atribuição opcional de embaixador nas contribuições sem alterar o valor ou o status financeiro
- [ ] Criar cadastro protegido com código de referência estável e único
- [ ] Resolver códigos de referência exclusivamente no servidor antes de persistir contribuições
- [ ] Contabilizar somente contribuições financeiras aprovadas no total e no ranking
- [ ] Criar ranking público real com estado vazio honesto
- [ ] Criar painel pessoal com link, total confirmado e quantidade de contribuições atribuídas
- [ ] Preservar a referência ao navegar entre campanhas, contribuição e checkout
- [ ] Criar compartilhamento por copiar link, WhatsApp e e-mail
- [ ] Cobrir cadastro, duplicidade, atribuição, ranking e estatísticas com Vitest
- [ ] Validar responsividade e estados sem inserir embaixadores ou contribuições simuladas

## Design e UX
- [ ] Definir paleta de cores (confiança, seriedade, acolhimento)
- [ ] Escolher tipografia elegante e refinada
- [ ] Criar sistema de espaçamento e hierarquia visual
- [ ] Implementar componentes com acabamento impecável
- [ ] Garantir responsividade em todos os dispositivos
- [ ] Testar acessibilidade

## Testes e Deploy
- [ ] Escrever testes unitários para procedimentos tRPC
- [ ] Testar fluxo completo de contribuição
- [ ] Testar responsividade em dispositivos móveis
- [ ] Realizar testes de segurança
- [ ] Fazer deploy em produção
- [ ] Monitorar performance e erros


## Novas Funcionalidades Solicitadas - Lote 2

- [ ] Criar página dedicada de Prestação de Contas com gráficos derivados de despesas persistidas
- [ ] Implementar visualização de recibos reais armazenados no S3
- [x] Adicionar barra de progresso animada nas campanhas ativas
- [ ] Implementar sistema de comentários/mural persistido nas campanhas
- [ ] Criar tRPC procedures para gerenciar comentários (backend)
- [ ] Adicionar validação e moderação de comentários

## Auditoria de prontidão solicitada

- [x] Executar auditoria automatizada para localizar mocks, simulações e pendências
- [x] Executar verificação de tipos, testes Vitest e build de produção
- [x] Revisar logs do servidor, console e rede nos fluxos principais
- [ ] Testar homepage, campanha, contribuição, checkout, prestação de contas, embaixadores e painel administrativo
- [x] Verificar responsividade das jornadas públicas em viewport móvel
- [x] Inspecionar visualmente em desktop as rotas públicas e administrativas principais
- [ ] Executar testes funcionais manuais das jornadas principais e registrar sucesso ou erro por fluxo
- [ ] Testar envio de contribuição, criação de preferência de pagamento, carregamento de dados reais, acesso ao admin e ações de CRUD
- [x] Classificar lacunas em bloqueadores de produção, prioridades e melhorias opcionais
- [x] Corrigir o bloqueador P0.1 de dados simulados nas jornadas públicas auditadas
- [x] Reexecutar tipos, testes, build e validação visual após as correções P0.1
- [x] Documentar o diagnóstico e o roteiro recomendado de implementação

## Correção P0.1 — dados reais nas jornadas públicas

- [x] Expor listagem e detalhe de campanhas publicadas por procedimentos públicos
- [x] Calcular arrecadação aprovada, meta, saldo e progresso no backend
- [x] Conectar a homepage às campanhas e estatísticas persistidas
- [x] Criar listagem pública de campanhas com busca, filtros e estados de carregamento, vazio e erro
- [x] Conectar a página individual à campanha, necessidades, atualizações e documentos persistidos
- [x] Remover números, documentos, histórias, comentários e rankings simulados das jornadas corrigidas
- [x] Corrigir navegação entre homepage, listagem, campanha, contribuição e transparência
- [x] Adicionar testes Vitest para consultas públicas e agregados financeiros
- [x] Executar tipos, testes, build e verificação visual desktop/mobile após a correção
- [x] Criar rota pública /accountability com listagem honesta de campanhas e acesso aos relatórios individuais

## Correção P0.2 — contribuições e Mercado Pago

- [x] Validar o Access Token no endpoint oficial do Mercado Pago
- [x] Persistir referência externa, preferência, pagamento, método, detalhe de status e data de aprovação
- [x] Criar tabela idempotente para eventos de Webhook
- [x] Salvar `externalReference` e `preferenceId` na criação da preferência
- [x] Atualizar `paymentId`, método, detalhe de status e `paidAt` após confirmação verificável
- [x] Gerar uma contribuição pendente por preferência e associá-la por referência externa estável
- [x] Criar endpoint HTTP público para Webhooks do Mercado Pago
- [x] Validar assinatura `x-signature` e consultar o pagamento na API antes de alterar o status
- [x] Processar Webhooks duplicados sem duplicar valores ou notificações
- [x] Remover confirmação pública de pagamento por procedimento tRPC
- [x] Persistir ofertas de material e voluntariado como pendentes de triagem
- [x] Criar páginas de retorno aprovado, pendente e falha sem confiar no parâmetro do navegador
- [x] Adicionar testes para assinatura, mapeamento de status, idempotência e fluxos de contribuição
- [ ] Validar checkout e Webhook no ambiente de testes do Mercado Pago

## Assistência para credencial de teste do Mercado Pago

- [x] Confirmar que a credencial atual é válida e pertence ao ambiente de produção
- [x] Ajudar o responsável a localizar as credenciais de teste no painel oficial
- [x] Registrar a decisão do responsável de manter a credencial de produção
- [ ] Opcional — substituir temporariamente o Access Token por uma credencial `TEST-...` se o responsável decidir usar sandbox
- [ ] Opcional — criar e validar uma preferência de teste sem cobrança real no sandbox
- [ ] Executar uma contribuição controlada após a publicação e confirmar o Webhook de produção
- [x] Documentar o roteiro seguro para validação controlada após a publicação
