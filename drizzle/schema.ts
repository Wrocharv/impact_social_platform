import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Campanhas de construção e ajuda comunitária
 */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  longDescription: text("longDescription"),
  category: mysqlEnum("category", ["moradia", "educacao", "saude", "alimentacao", "infraestrutura", "outro"]).default("outro"),
  goal: int("goal").notNull(), // Meta em centavos (ex: 100000 = R$ 1000)
  raised: int("raised").default(0).notNull(),
  status: mysqlEnum("status", ["active", "completed", "paused", "archived"]).default("active").notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

/**
 * Contribuições (financeiras, materiais, voluntárias)
 */
export const contributions = mysqlTable("contributions", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  userId: int("userId"),
  ambassadorId: int("ambassadorId"),
  type: mysqlEnum("type", ["financial", "material", "volunteer"]).notNull(),
  amount: int("amount"), // Para financeiro: valor em centavos
  description: text("description"), // Para material/voluntário: descrição
  donorName: varchar("donorName", { length: 255 }), // Para doadores anônimos
  donorEmail: varchar("donorEmail", { length: 320 }),
  donorWhatsapp: varchar("donorWhatsapp", { length: 20 }),
  donorCity: varchar("donorCity", { length: 255 }),
  donorChurch: varchar("donorChurch", { length: 255 }),
  allowPublicDisplay: boolean("allowPublicDisplay").notNull().default(false), // Permite divulgar nome do doador
  deliveryMethod: varchar("deliveryMethod", { length: 50 }), // Para material: pickup, deliver, mail, other
  numberOfInstallments: int("numberOfInstallments"), // Para financeiro/material em parcelas
  installmentFrequency: varchar("installmentFrequency", { length: 50 }), // Para financeiro: weekly, biweekly, monthly
  materialDeliveryFrequency: varchar("materialDeliveryFrequency", { length: 50 }), // Para material: unique, weekly, biweekly, monthly
  status: mysqlEnum("status", ["pending", "approved", "completed", "rejected", "cancelled", "refunded"])
    .default("pending")
    .notNull(),
  externalReference: varchar("externalReference", { length: 80 }).unique(),
  preferenceId: varchar("preferenceId", { length: 255 }),
  paymentId: varchar("paymentId", { length: 80 }).unique(),
  paymentStatusDetail: varchar("paymentStatusDetail", { length: 255 }),
  paymentMethod: varchar("paymentMethod", { length: 100 }),
  campaignNeedId: int("campaignNeedId"),
  quantityExact: int("quantityExact"),
  estimatedAmount: int("estimatedAmount"), // Para material: valor estimado em centavos (quantidade x valor unitario)
  validatedBy: int("validatedBy"),
  validatedAt: timestamp("validatedAt"),
  validationNote: text("validationNote"),
  currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contribution = typeof contributions.$inferSelect;
export type InsertContribution = typeof contributions.$inferInsert;

/**
 * Eventos recebidos dos gateways de pagamento.
 * `eventKey` impede que a mesma notificação seja aplicada mais de uma vez.
 */
export const paymentWebhookEvents = mysqlTable("paymentWebhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  provider: varchar("provider", { length: 40 }).default("mercado_pago").notNull(),
  eventKey: varchar("eventKey", { length: 255 }).notNull().unique(),
  requestId: varchar("requestId", { length: 255 }),
  paymentId: varchar("paymentId", { length: 80 }).notNull(),
  action: varchar("action", { length: 100 }),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["processing", "completed", "failed"]).default("processing").notNull(),
  errorMessage: text("errorMessage"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type InsertPaymentWebhookEvent = typeof paymentWebhookEvents.$inferInsert;

/**
 * Entregas de notificações transacionais.
 * `idempotencyKey` garante um único envio lógico por destinatário e recurso.
 */
export const notificationDeliveries = mysqlTable("notificationDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  notificationType: varchar("notificationType", { length: 80 }).notNull(),
  resourceType: varchar("resourceType", { length: 40 }).notNull(),
  resourceId: int("resourceId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  provider: varchar("provider", { length: 40 }).default("resend").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull().unique(),
  status: mysqlEnum("status", ["processing", "sent", "failed", "skipped"])
    .default("processing")
    .notNull(),
  attemptCount: int("attemptCount").default(0).notNull(),
  processingToken: varchar("processingToken", { length: 64 }),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  lastError: text("lastError"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type InsertNotificationDelivery = typeof notificationDeliveries.$inferInsert;

/**
 * Parceiros (empresas e pessoas físicas)
 */
export const partners = mysqlTable("partners", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["company", "individual"]).notNull(),
  ownerName: varchar("ownerName", { length: 255 }),
  description: text("description"),
  logoUrl: varchar("logoUrl", { length: 512 }),
  storePhotoUrl: varchar("storePhotoUrl", { length: 512 }),
  ownerPhotoUrl: varchar("ownerPhotoUrl", { length: 512 }),
  address: text("address"),
  contactInfo: varchar("contactInfo", { length: 255 }),
  testimonialVideoUrl: varchar("testimonialVideoUrl", { length: 512 }),
  testimonialText: text("testimonialText"),
  website: varchar("website", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Partner = typeof partners.$inferSelect;
export type InsertPartner = typeof partners.$inferInsert;

/**
 * Embaixadores (pessoas que divulgam campanhas)
 */
export const ambassadors = mysqlTable("ambassadors", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  personalLink: varchar("personalLink", { length: 255 }).notNull().unique(),
  totalRaised: int("totalRaised").default(0).notNull(),
  ranking: int("ranking"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Ambassador = typeof ambassadors.$inferSelect;
export type InsertAmbassador = typeof ambassadors.$inferInsert;

/**
 * Atualizações de campanha (fotos, vídeos, descrição)
 */
export const campaignUpdates = mysqlTable("campaignUpdates", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  imageUrls: text("imageUrls"), // JSON array de URLs
  videoUrls: text("videoUrls"), // JSON array de URLs
  phase: mysqlEnum("phase", ["before", "during", "after"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignUpdate = typeof campaignUpdates.$inferSelect;
export type InsertCampaignUpdate = typeof campaignUpdates.$inferInsert;

/**
 * Comentários públicos de campanha com moderação simples.
 */
export const campaignComments = mysqlTable("campaignComments", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  userId: int("userId"),
  authorName: varchar("authorName", { length: 255 }),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignComment = typeof campaignComments.$inferSelect;
export type InsertCampaignComment = typeof campaignComments.$inferInsert;

/**
 * Necessidades por campanha (cimento, tijolos, mão de obra, etc.)
 */
export const campaignNeeds = mysqlTable("campaignNeeds", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  type: mysqlEnum("type", ["material", "labor", "equipment", "other"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  quantity: varchar("quantity", { length: 100 }), // Ex: "100 kg", "50 unidades"
  targetQuantityExact: int("targetQuantityExact"), // Ex: 3700 unidades exatas
  unitValueCents: int("unitValueCents"), // Ex: 180 = R$ 1,80 por unidade
  priority: mysqlEnum("priority", ["high", "medium", "low"]).default("medium").notNull(),
  fulfilled: int("fulfilled").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignNeed = typeof campaignNeeds.$inferSelect;
export type InsertCampaignNeed = typeof campaignNeeds.$inferInsert;

/**
 * Documentos de transparência (notas fiscais, recibos)
 */
export const transparencyDocuments = mysqlTable("transparencyDocuments", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  type: mysqlEnum("type", ["invoice", "receipt", "report", "other"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  documentUrl: varchar("documentUrl", { length: 512 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  amount: int("amount"), // Valor em centavos (opcional)
  createdBy: int("createdBy"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});

export type TransparencyDocument = typeof transparencyDocuments.$inferSelect;
export type InsertTransparencyDocument = typeof transparencyDocuments.$inferInsert;

/**
 * Despesas efetivamente registradas por campanha.
 * Valores são armazenados em centavos e podem apontar para um comprovante publicado.
 */
export const campaignExpenses = mysqlTable("campaignExpenses", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  category: mysqlEnum("category", [
    "materials",
    "labor",
    "equipment",
    "services",
    "transport",
    "fees",
    "other",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: int("amount").notNull(),
  expenseDate: timestamp("expenseDate").notNull(),
  documentId: int("documentId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignExpense = typeof campaignExpenses.$inferSelect;
export type InsertCampaignExpense = typeof campaignExpenses.$inferInsert;
