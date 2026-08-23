import { eq } from "drizzle-orm";
import { z } from "zod";
import { siteSettings } from "../drizzle/schema";
import { publicProcedure, router, sectionProcedure } from "./_core/trpc";
import { getDb } from "./db";

const DEFAULTS = {
  id: 1,
  heroTitle: "Juntos Transformamos Vidas",
  heroSubtitle: "Cada contribuição se transforma em cuidado, dignidade e esperança para quem mais precisa.",
  heroImageUrl: "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1600&q=80",
  presentationTitle: "Veja o propósito e o objetivo deste projeto",
  presentationDescription: "Conheça algumas de nossas ações e seja um doador, seja um parceiro do bem.",
  presentationVideoUrl: "/uploads/campaigns/1786167100165-parceriadobem01.mov",
  step1Title: "Escolha uma campanha",
  step1Description: "Conheça a etapa atual, as necessidades e as atualizações antes de contribuir para a obra.",
  step2Title: "Contribua do seu jeito",
  step2Description: "Doe financeiramente, ofereça materiais ou disponibilize sua mão de obra para a evolução da obra.",
  step3Title: "Acompanhe o progresso",
  step3Description: "Consulte fotos, registros e documentos publicados em cada etapa da campanha.",
  helpButtonLabel: "Eu quero ajudar",
  partnerButtonLabel: "Quero ser parceiro",
  monthlyGivingPopupEnabled: false,
  monthlyGivingPopupTitle: "Seja um Parceiro Mensal",
  monthlyGivingPopupDescription: "Escolha um valor e contribua todo mês com quem mais precisa. Você decide o valor e o número de parcelas.",
  monthlyGivingPopupButtonLabel: "Quero contribuir todo mês",
  monthlyGivingPopupCampaignId: null as number | null,
} as const;

const updateSchema = z.object({
  heroTitle: z.string().trim().min(1).max(255).optional(),
  heroSubtitle: z.string().trim().max(2000).optional(),
  heroImageUrl: z.string().trim().max(512).optional(),
  presentationTitle: z.string().trim().max(255).optional(),
  presentationDescription: z.string().trim().max(2000).optional(),
  presentationVideoUrl: z.string().trim().max(512).optional(),
  step1Title: z.string().trim().min(1).max(255).optional(),
  step1Description: z.string().trim().max(2000).optional(),
  step2Title: z.string().trim().min(1).max(255).optional(),
  step2Description: z.string().trim().max(2000).optional(),
  step3Title: z.string().trim().min(1).max(255).optional(),
  step3Description: z.string().trim().max(2000).optional(),
  helpButtonLabel: z.string().trim().min(1).max(100).optional(),
  partnerButtonLabel: z.string().trim().min(1).max(100).optional(),
  monthlyGivingPopupEnabled: z.boolean().optional(),
  monthlyGivingPopupTitle: z.string().trim().max(150).optional(),
  monthlyGivingPopupDescription: z.string().trim().max(500).optional(),
  monthlyGivingPopupButtonLabel: z.string().trim().max(100).optional(),
  monthlyGivingPopupCampaignId: z.number().int().positive().nullable().optional(),
});

export const siteSettingsRouter = router({
  get: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return DEFAULTS;

    try {
      const [row] = await db.select().from(siteSettings).limit(1);
      return row ? { ...DEFAULTS, ...row } : DEFAULTS;
    } catch (error) {
      console.warn("[siteSettings.get] Falha ao ler configurações, usando padrão:", error);
      return DEFAULTS;
    }
  }),

  update: sectionProcedure("content").input(updateSchema).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) return { success: true as const };

    const [existing] = await db.select({ id: siteSettings.id }).from(siteSettings).limit(1);
    if (existing) {
      await db.update(siteSettings).set(input).where(eq(siteSettings.id, existing.id));
    } else {
      const { id: _defaultId, ...defaultsWithoutId } = DEFAULTS;
      await db.insert(siteSettings).values({ ...defaultsWithoutId, ...input });
    }
    return { success: true as const };
  }),
});
