# 🤖 Chatbot WhatsApp - Guia de Configuração

## 🚀 Visão Geral

Este sistema permite gerenciar campanhas **diretamente via WhatsApp** usando Twilio.

## 📋 Comandos Disponíveis

```
/start      - Menu inicial
/campanhas  - Ver todas as campanhas
/criar      - Criar nova campanha
/atualizar  - Publicar atualização
/necessidade - Registrar necessidade
/menu       - Voltar ao menu
/ajuda      - Ver todos os comandos
```

## ⚙️ Configuração (Passo a Passo)

### 1. Criar conta na Twilio

- Acesse https://www.twilio.com/
- Crie uma conta (FREE trial com crédito)
- Acesse o console: https://console.twilio.com/

### 2. Configurar WhatsApp Sandbox

1. Vá para **Messaging** → **Try it out** → **Send a WhatsApp message**
2. Siga as instruções para conectar seu número WhatsApp ao sandbox
3. Você receberá um código de confirmação via WhatsApp
4. Responda com o código para ativar

### 3. Obter Credenciais

1. No Twilio Console, vá para **Account**
2. Copie seu **Account SID** e **Auth Token**
3. Vá para **Messaging** → **Senders** e encontre seu número WhatsApp (ex: +14155238886)

### 4. Adicionar Variáveis de Ambiente

Adicione ao arquivo `.env`:

```env
TWILIO_ACCOUNT_SID=seu_account_sid
TWILIO_AUTH_TOKEN=seu_auth_token
TWILIO_WHATSAPP_FROM=+14155238886
WHATSAPP_WEBHOOK_URL=https://seu-dominio.com/api/whatsapp/webhook
```

### 5. Configurar Webhook no Twilio

1. Vá para **Messaging** → **Settings** → **WhatsApp Sandbox Settings**
2. Em **When a message comes in**, coloque:
   ```
   https://seu-dominio.com/api/whatsapp/webhook
   ```
3. Selecione **POST** como método
4. Salve

### 6. Instalar Twilio SDK

```bash
npm install twilio
```

### 7. Testar

Envie uma mensagem via WhatsApp para o número do Twilio:

```
Olá
```

Você deverá receber o menu de boas-vindas!

## 📱 Exemplo de Conversa

```
👤 Você: /criar
🤖 Bot:  ✏️ Nova Campanha
         Passo 1 de 5
         Qual o título?

👤 Você: Construção da Escola
🤖 Bot:  ✅ Título: Construção da Escola
         Passo 2 de 5
         Qual a descrição?

👤 Você: Ajude a construir a nova escola
🤖 Bot:  ✅ Descrição: Ajude a construir a nova escola
         Passo 3 de 5
         Qual a meta em reais?

👤 Você: 50000
🤖 Bot:  ✅ Meta: R$ 50000
         Passo 4 de 5
         Qual a categoria?
         1️⃣ Moradia...

👤 Você: 2
🤖 Bot:  ✅ Campanha Criada!
         📌 Construção da Escola
         💰 Meta: R$ 50000
         🏷️ Categoria: Educação
```

## 🔧 Estrutura de Código

```
server/
├── whatsapp.service.ts   ← Lógica de conversas e estado
├── whatsapp.router.ts    ← Processamento de mensagens (tRPC)
└── whatsapp.webhook.ts   ← Webhook Twilio
```

## 🐛 Troubleshooting

### Mensagens não chegam
- Verifique se o webhook está publicado (não localhost)
- Teste com curl: `curl -X GET https://seu-dominio.com/api/whatsapp/webhook`
- Cheque os logs do Twilio: **Messaging** → **Logs**

### Erro de autenticação
- Verifique `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN`
- Confirme que as variáveis estão no `.env`

### Webhook retorna 404
- Confirme URL no `.env` está correta
- Reinicie o servidor após atualizar variáveis

## 📊 Próximas Melhorias

- [ ] Publicar atualizações via WhatsApp
- [ ] Registrar necessidades via WhatsApp
- [ ] Enviar notificações de novas doações
- [ ] Listar doadores públicos
- [ ] Suporte para imagens

## 💡 Dicas

- Use `*/menu*` para voltar ao menu em qualquer momento
- Mensagens com mais de 1600 caracteres serão truncadas
- Conversas expiram após 30 minutos de inatividade
- Máximo 5 campanhas listadas por vez

---

**Pronto para usar!** 🎉 Envie `/start` para uma mensagem de teste.
