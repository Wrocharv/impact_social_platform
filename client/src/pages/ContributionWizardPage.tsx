import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { addLocalNeedProgress, readLocalNeedProgressForCampaign, readLocalNeedsForCampaign } from "@/lib/localNeeds";
import { getMaterialContributionCopy, shouldShowMaterialContributionOption } from "@/lib/contributionFlow";
import { AlertCircle, CheckCircle2, ChevronLeft, Copy, Heart, Loader2, Package, Users, DollarSign, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";
import { useDonorStorage } from "@/hooks/useDonorStorage";

type ContributionType = "financial" | "material" | "volunteer";
type PaymentMethod = "pix" | "card" | "boleto" | "cash";
type RecurrenceType = "unique" | "installments";
type InstallmentFrequency = "weekly" | "biweekly" | "monthly";
type DeliveryMethod = "pickup" | "deliver" | "mail" | "other";
type DeliveryFrequency = "unique" | "weekly" | "biweekly" | "monthly";
type MaterialSettlementMode = "in_kind" | "cash_equivalent";
type MaterialDonationType = "detailed" | "avulsa" | "other";
type Step = "type" | "donor-info" | "vip-showcase" | "details" | "payment" | "confirmation" | "pix-qr";

type PixPaymentData = {
  qrCode: string;
  qrCodeBase64: string;
  paymentId: string;
  externalReference: string;
  amountCents: number;
};

type NeedItem = {
  id: number;
  name: string;
  quantity: string | null;
  priority: "high" | "medium" | "low";
  targetQuantityExact?: number | null;
  unitValueCents?: number | null;
  offeredQuantity?: number | null;
  remainingQuantity?: number | null;
  offeredValueCents?: number | null;
  remainingValueCents?: number | null;
};

const formatCurrency = (valueInCents: number) =>
  (valueInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseBrlAmount = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, "");
  if (!normalized) return NaN;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  const hasComma = lastComma !== -1;
  const hasDot = lastDot !== -1;

  if (hasComma && hasDot) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    const decimalNormalized = normalized
      .replace(new RegExp(`\\${thousandSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
    return Number(decimalNormalized);
  }

  if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const parts = normalized.split(separator);

    if (parts.length === 2) {
      const decimalPart = parts[1] ?? "";
      if (decimalPart.length <= 2) {
        return Number(`${parts[0]}.${decimalPart}`);
      }
    }

    return Number(normalized.replace(/[.,]/g, ""));
  }

  return Number(normalized);
};

const normalizeCpfDigits = (value: string) => value.replace(/\D/g, "").slice(0, 11);

const isValidCpf = (value: string) => {
  const d = normalizeCpfDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    const sum = d.slice(0, len).split("").reduce((acc, n, i) => acc + Number(n) * (len + 1 - i), 0);
    const r = 11 - (sum % 11);
    return r >= 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
};

const formatCpf = (value: string) => {
  const digits = normalizeCpfDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};

const toEmbedVideoUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = url.pathname.replace("/", "").trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("youtube.com")) {
      const id = url.searchParams.get("v")?.trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    return null;
  } catch {
    return null;
  }
};

const getVideoMimeType = (rawUrl: string | null) => {
  const normalized = (rawUrl ?? "").toLowerCase();
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".ogg") || normalized.endsWith(".ogv")) return "video/ogg";
  if (normalized.endsWith(".mov") || normalized.endsWith(".qt")) return "video/quicktime";
  return "video/mp4";
};

const PREFERRED_KEYWORDS = ["TIJOLO", "CIMENTO", "AREIA", "JANELA"];

const normalizeNeedLabel = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const priorityWeight = (priority: NeedItem["priority"]) => {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
};

const keywordWeight = (name: string) => {
  const normalized = normalizeNeedLabel(name);
  const idx = PREFERRED_KEYWORDS.findIndex((keyword) => normalized.includes(keyword));
  return idx === -1 ? 99 : idx;
};

const sortNeeds = (needs: NeedItem[]) =>
  [...needs].sort((a, b) => {
    const byPriority = priorityWeight(a.priority) - priorityWeight(b.priority);
    if (byPriority !== 0) return byPriority;

    const byKeyword = keywordWeight(a.name) - keywordWeight(b.name);
    if (byKeyword !== 0) return byKeyword;

    return normalizeNeedLabel(a.name).localeCompare(normalizeNeedLabel(b.name), "pt-BR");
  });

const HOTEL_CAMPAIGN_ID = 100001;
const HOTEL_LEGACY_CAMPAIGN_ID = 1;
const DEFAULT_VIP_APARTMENT_AMOUNT_CENTS = 120_000_00;
const DEFAULT_VIP_MEDIA_VIDEO_URL = "";
const DEFAULT_VIP_MEDIA_VIDEO_FALLBACK_URL = "";
const DEFAULT_VIP_MEDIA_IMAGES = ["/render-quarto.jpg", "/render-hotel.jpg", "/obra-lavanderia.jpg"];

interface WizardState {
  type: ContributionType | null;
  donorName: string;
  donorCpf: string;
  donorWhatsapp: string;
  donorEmail: string;
  donorCity: string;
  donorChurch: string;
  donorBirthDate: string;
  donorGender: "" | "male" | "female" | "other" | "prefer_not_to_say";
  allowPublicDisplay: boolean | null;
  // Financeiro
  amount?: number;
  recurrence: RecurrenceType;
  numberOfInstallments?: number;
  installmentFrequency?: InstallmentFrequency;
  startDate: string;
  // Material
  materialNeedId?: number;
  materialDescription: string;
  materialDonationType: MaterialDonationType;
  materialQuantity: string;
  materialDeliveryFrequency: DeliveryFrequency;
  deliveryMethod: DeliveryMethod | null;
  materialSettlementMode: MaterialSettlementMode | null;
  // Voluntário
  volunteerDescription: string;
  // Pagamento
  paymentMethod: PaymentMethod | null;
}

export default function ContributionWizardPage() {
  const [, params] = useRoute("/contribute/wizard/:id");
  const campaignId = Number(params?.id ?? 0);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Carregar dados de doadores salvos
  const { isLoaded, currentDonor, saveDonor, rememberDonorProfile, clearSavedDonors } = useDonorStorage();

  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialType = searchParams?.get("type") ?? null;
  const initialNeedId = searchParams?.get("needId") ?? null;
  const initialQuantity = searchParams?.get("quantity") ?? null;
  const initialGo = searchParams?.get("go") ?? null;
  const initialOffer = searchParams?.get("offer") ?? null;
  const initialAmount = searchParams?.get("amount") ?? null;
  const entryMode = searchParams?.get("entry") ?? null;
  const isSingleRegistrationFlow = entryMode === "needs";
  const isVipDirectPaymentFlow = initialType === "financial" && initialOffer === "apartment" && initialGo === "payment";

  const [step, setStep] = useState<Step>(() => {
    if (isSingleRegistrationFlow && !initialType) return "donor-info";
    if (initialType === "financial" && initialOffer === "apartment") return "donor-info";
    return "type";
  });
  const [lastLookupKey, setLastLookupKey] = useState("");
  const [financialAmountInput, setFinancialAmountInput] = useState("");
  const [hasAppliedInitialStep, setHasAppliedInitialStep] = useState(false);
  const [vipMediaReviewed, setVipMediaReviewed] = useState(false);
  const [vipVideoIndex, setVipVideoIndex] = useState(0);
  const [vipVideoFailed, setVipVideoFailed] = useState(false);
  const [state, setState] = useState<WizardState>({
    type: null,
    donorName: "",
    donorCpf: "",
    donorWhatsapp: "",
    donorEmail: "",
    donorCity: "",
    donorChurch: "",
    donorBirthDate: "",
    donorGender: "" as "" | "male" | "female" | "other" | "prefer_not_to_say",
    allowPublicDisplay: true,
    recurrence: "unique",
    startDate: new Date().toISOString().split("T")[0],
    materialNeedId: undefined,
    materialDescription: "",
    materialDonationType: "detailed",
    materialQuantity: "",
    materialDeliveryFrequency: "unique",
    deliveryMethod: null,
    materialSettlementMode: null,
    volunteerDescription: "",
    paymentMethod: null,
  });

  // Autopreencer dados salvos — preenche na chegada; a limpeza por CPF diferente é tratada no onChange
  useEffect(() => {
    if (isLoaded && currentDonor) {
      setState((prev) => ({
        ...prev,
        donorName: currentDonor.donorName || prev.donorName,
        donorCpf: currentDonor.donorCpf ? formatCpf(currentDonor.donorCpf) : prev.donorCpf,
        donorWhatsapp: currentDonor.donorWhatsapp || prev.donorWhatsapp,
        donorEmail: currentDonor.donorEmail || prev.donorEmail,
        donorCity: currentDonor.donorCity || prev.donorCity,
        donorChurch: currentDonor.donorChurch || prev.donorChurch,
        donorBirthDate: currentDonor.donorBirthDate || prev.donorBirthDate,
        donorGender: currentDonor.donorGender || prev.donorGender,
      }));
    }
  }, [isLoaded, currentDonor]);

  useEffect(() => {
    if (hasAppliedInitialStep) return;
    if (!initialType && !initialNeedId) return;

    const parsedQuantity = initialQuantity ? Number.parseInt(initialQuantity, 10) : undefined;
    const parsedAmount = initialAmount ? Number.parseFloat(initialAmount) : undefined;
    const hasInitialQuantity = Boolean(parsedQuantity && parsedQuantity > 0);
    const hasInitialAmount = Boolean(parsedAmount && parsedAmount >= 1);
    const shouldOpenSettlement = initialGo === "settlement";

    setState((prev) => ({
      ...prev,
      type: initialType === "financial" || initialType === "material" || initialType === "volunteer" ? initialType : prev.type,
      materialNeedId: initialNeedId ? Number(initialNeedId) : prev.materialNeedId,
      materialQuantity: hasInitialQuantity ? String(parsedQuantity) : prev.materialQuantity,
      amount: initialType === "financial" && hasInitialAmount ? parsedAmount : prev.amount,
      materialSettlementMode: initialType === "material" && shouldOpenSettlement
        ? (prev.materialSettlementMode ?? "in_kind")
        : prev.materialSettlementMode,
    }));

    if (initialType === "material" || initialType === "financial" || initialType === "volunteer") {
      if (initialType === "material" && shouldOpenSettlement && hasInitialQuantity && isLoaded && currentDonor) {
        setStep("confirmation");
        return;
      }

      if (isVipDirectPaymentFlow && isLoaded && currentDonor) {
        setStep("payment");
        return;
      }

      // No fluxo financeiro, manter a etapa de doador visível mesmo com dados salvos.
      if (initialType === "financial") {
        setStep("donor-info");
      } else if (isLoaded && currentDonor) {
        setStep("details");
      } else {
        setStep("donor-info");
      }
    }

    setHasAppliedInitialStep(true);
  }, [
    hasAppliedInitialStep,
    initialType,
    initialNeedId,
    initialQuantity,
    initialGo,
    initialAmount,
    initialOffer,
    isLoaded,
    currentDonor,
    isVipDirectPaymentFlow,
  ]);

  useEffect(() => {
    if (step !== "donor-info") return;

    const normalizedCpf = normalizeCpfDigits(state.donorCpf);
    const normalizedWhatsapp = state.donorWhatsapp.replace(/\D/g, "");
    const normalizedName = state.donorName.trim().toLowerCase();
    const normalizedEmail = state.donorEmail.trim().toLowerCase();
    const normalizedEmailLookup = /^\S+@\S+\.\S+$/.test(normalizedEmail) ? normalizedEmail : "";

    if (normalizedCpf.length !== 11 && normalizedWhatsapp.length < 8 && normalizedName.length < 3 && !normalizedEmailLookup) return;

    const lookupKey = `${normalizedCpf}|${normalizedWhatsapp}|${normalizedName}|${normalizedEmail}`;
    if (lookupKey === lastLookupKey) return;

    const timer = window.setTimeout(async () => {
      setLastLookupKey(lookupKey);
      let profile: Awaited<ReturnType<typeof utils.contributions.getDonorProfileLookup.fetch>> | null = null;

      try {
        profile = await utils.contributions.getDonorProfileLookup.fetch({
          donorCpf: normalizedCpf.length === 11 ? normalizedCpf : undefined,
          donorWhatsapp: normalizedWhatsapp.length >= 8 ? state.donorWhatsapp : undefined,
          donorName: normalizedName.length >= 3 ? state.donorName : undefined,
          donorEmail: normalizedEmailLookup || undefined,
        });
      } catch {
        profile = null;
      }

      const resolvedProfile = profile;
      if (!resolvedProfile) return;

      setState((prev) => {
        const next = {
          ...prev,
          donorName: resolvedProfile.donorName || prev.donorName,
          donorCpf: resolvedProfile.donorCpf ? formatCpf(resolvedProfile.donorCpf) : prev.donorCpf,
          donorWhatsapp: resolvedProfile.donorWhatsapp || prev.donorWhatsapp,
          donorEmail: resolvedProfile.donorEmail || prev.donorEmail,
          donorCity: resolvedProfile.donorCity || prev.donorCity,
          donorChurch: resolvedProfile.donorChurch || prev.donorChurch,
          allowPublicDisplay: resolvedProfile.allowPublicDisplay ?? prev.allowPublicDisplay,
        };

        const changed =
          next.donorName !== prev.donorName
          || next.donorCpf !== prev.donorCpf
          || next.donorWhatsapp !== prev.donorWhatsapp
          || next.donorEmail !== prev.donorEmail
          || next.donorCity !== prev.donorCity
          || next.donorChurch !== prev.donorChurch
          || next.allowPublicDisplay !== prev.allowPublicDisplay;

        if (changed) {
          toast.success("Dados do doador preenchidos automaticamente.");
        }

        return next;
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    step,
    state.donorCpf,
    state.donorWhatsapp,
    state.donorName,
    utils,
    currentDonor,
    lastLookupKey,
    state.donorCity,
    state.donorChurch,
    state.donorEmail,
  ]);

  const createMaterial = trpc.contributions.createMaterialContribution.useMutation();
  const createVolunteer = trpc.contributions.createVolunteerContribution.useMutation();
  const createPayment = trpc.payments.createPaymentPreference.useMutation();
  const createPixPayment = trpc.payments.createPixPayment.useMutation();
  const syncPaymentStatus = trpc.payments.syncPaymentStatus.useMutation();

  const [pixPaymentData, setPixPaymentData] = useState<PixPaymentData | null>(null);
  const [pixStatus, setPixStatus] = useState<"pending" | "approved" | "rejected" | "timeout">("pending");
  const [pixCopied, setPixCopied] = useState(false);

  useEffect(() => {
    if (step !== "pix-qr" || !pixPaymentData || pixStatus !== "pending") return;

    let cancelled = false;
    let attempt = 0;

    const poll = async () => {
      attempt += 1;
      try {
        const result = await syncPaymentStatus.mutateAsync({ paymentId: pixPaymentData.paymentId });
        if (cancelled) return;
        if (result.status === "approved") {
          setPixStatus("approved");
          return;
        }
        if (result.status === "rejected" || result.status === "cancelled") {
          setPixStatus("rejected");
          return;
        }
      } catch {
        // Segue tentando — instabilidade momentânea não deve interromper o polling.
      }
      if (attempt >= 150) {
        if (!cancelled) setPixStatus("timeout");
        return;
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, 4000);
      }
    };

    let timer = window.setTimeout(poll, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step, pixPaymentData, pixStatus, syncPaymentStatus]);

  const campaign = campaignQuery.data;
  const campaignTitle = typeof campaign?.title === "string" ? campaign.title.toLowerCase() : "";
  const campaignDataId = typeof campaign?.id === "number" ? campaign.id : campaignId;
  const isHotelCampaign =
    campaignId === HOTEL_CAMPAIGN_ID
    || campaignDataId === HOTEL_CAMPAIGN_ID
    || campaignTitle.includes("hotel recanto de paz")
    || (campaignId === HOTEL_LEGACY_CAMPAIGN_ID && campaignTitle.includes("hotel recanto de paz"));
  const vipApartmentAmountCents = (campaign && "vipApartmentAmountCents" in campaign && typeof campaign.vipApartmentAmountCents === "number")
    ? campaign.vipApartmentAmountCents
    : DEFAULT_VIP_APARTMENT_AMOUNT_CENTS;
  const campaignNeedsRaw = sortNeeds((campaign?.needs ?? []) as NeedItem[]);
  const localCampaignNeedsRaw = sortNeeds(readLocalNeedsForCampaign(campaignId) as NeedItem[]);
  const localNeedProgress = readLocalNeedProgressForCampaign(campaignId);
  const mergedCampaignNeedsMap = new Map<number, NeedItem>();
  [...campaignNeedsRaw, ...localCampaignNeedsRaw].forEach((need) => {
    const progress = localNeedProgress.get(need.id);
    const baseOfferedQuantity = Math.max(0, need.offeredQuantity ?? 0);
    const baseOfferedValueCents = Math.max(0, need.offeredValueCents ?? 0);
    const targetQuantity = Math.max(0, need.targetQuantityExact ?? 0);
    const unitValueCents = Math.max(0, need.unitValueCents ?? 0);
    const offeredQuantity = baseOfferedQuantity + Math.max(0, progress?.offeredQuantity ?? 0);
    const offeredValueCents = baseOfferedValueCents + Math.max(0, progress?.offeredValueCents ?? 0);
    const remainingQuantity = Math.max(0, targetQuantity - offeredQuantity);
    const remainingValueCents = Math.max(0, remainingQuantity * unitValueCents);

    mergedCampaignNeedsMap.set(need.id, {
      ...need,
      offeredQuantity,
      offeredValueCents,
      remainingQuantity,
      remainingValueCents,
    });
  });
  const campaignNeedsMerged = sortNeeds(Array.from(mergedCampaignNeedsMap.values()));
  const campaignNeeds = campaignNeedsMerged;
  const isLegendario = campaign?.title?.trim().toUpperCase() === "LEGENDARIO SOLIDARIO";
  const materialCopy = getMaterialContributionCopy(campaign?.title);
  const hasMaterialFlow = shouldShowMaterialContributionOption({
    campaignTitle: campaign?.title,
    campaignNeeds: campaignNeedsMerged,
    currentType: state.type,
    initialType,
  });
  const selectedNeed = campaignNeeds.find((need) => need.id === state.materialNeedId);
  const materialDonationTypeLabel =
    state.materialDonationType === "detailed"
      ? "DOACAO DETALHADA"
      : state.materialDonationType === "avulsa"
        ? "DOACAO AVULSA"
        : "OUTRA DOACAO";
  const effectiveMaterialDescription = selectedNeed
    ? normalizeNeedLabel(selectedNeed.name)
    : state.materialDescription.trim();
  const effectiveMaterialSubmissionDescription = `${materialDonationTypeLabel} | ${effectiveMaterialDescription}`;
  const selectedNeedRemaining = Math.max(0, selectedNeed?.remainingQuantity ?? 0);
  const selectedNeedUnitValueCents = selectedNeed?.unitValueCents ?? 0;
  const selectedNeedTargetQuantity = Math.max(0, selectedNeed?.targetQuantityExact ?? 0);
  const selectedNeedQuantityExact = Number.parseInt(state.materialQuantity || "", 10);
  const hasSelectedNeed = Boolean(state.materialNeedId);
  const hasValidSelectedNeedQuantity = !hasSelectedNeed
    || (Boolean(selectedNeed) && selectedNeedQuantityExact > 0 && selectedNeedQuantityExact <= selectedNeedRemaining);
  const selectedNeedEstimatedAmount = selectedNeedUnitValueCents > 0 && selectedNeedQuantityExact > 0
    ? selectedNeedUnitValueCents * selectedNeedQuantityExact
    : 0;
  const selectedNeedTargetAmount = selectedNeedUnitValueCents > 0 && selectedNeedTargetQuantity > 0
    ? selectedNeedUnitValueCents * selectedNeedTargetQuantity
    : 0;
  const needsPreview = state.type === "material" && selectedNeed
    ? [selectedNeed]
    : campaignNeeds;
  const selectedNeedRemainingAfterContribution = hasSelectedNeed && selectedNeedQuantityExact > 0
    ? Math.max(0, selectedNeedRemaining - selectedNeedQuantityExact)
    : selectedNeedRemaining;
  const selectedNeedExceedsGoal = hasSelectedNeed && selectedNeedQuantityExact > selectedNeedRemaining;
  const isVipApartmentOffer = isHotelCampaign && initialOffer === "apartment" && state.type === "financial";
  const configuredVipImages = Array.isArray((campaign as { vipMediaImages?: unknown })?.vipMediaImages)
    ? ((campaign as { vipMediaImages?: unknown }).vipMediaImages as unknown[])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 6)
    : [];
  const configuredVipVideos = Array.isArray((campaign as { vipMediaVideos?: unknown })?.vipMediaVideos)
    ? ((campaign as { vipMediaVideos?: unknown }).vipMediaVideos as unknown[])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 10)
    : [];
  const campaignGalleryImages = Array.isArray((campaign as { galleryImages?: unknown })?.galleryImages)
    ? ((campaign as { galleryImages?: unknown }).galleryImages as unknown[])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, 6)
    : [];
  const campaignUpdates = Array.isArray((campaign as { updates?: unknown })?.updates)
    ? ((campaign as { updates?: unknown }).updates as Array<{ videos?: unknown }>).slice()
    : [];
  const campaignVideoUrls = campaignUpdates.flatMap((update) => {
    if (!Array.isArray(update.videos)) return [];
    return update.videos.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  });
  const vipGalleryImages = (
    configuredVipImages.length > 0
      ? configuredVipImages
      : campaignGalleryImages.length > 0
        ? campaignGalleryImages
        : DEFAULT_VIP_MEDIA_IMAGES
  ).slice(0, 6);
  const configuredVideoCandidates = [...configuredVipVideos, ...campaignVideoUrls].filter((url) => typeof url === "string" && url.trim().length > 0);
  const vipVideoCandidates = [...configuredVideoCandidates, DEFAULT_VIP_MEDIA_VIDEO_URL, DEFAULT_VIP_MEDIA_VIDEO_FALLBACK_URL]
    .filter((url) => typeof url === "string" && url.trim().length > 0);
  const vipVideoUrl = vipVideoCandidates[0] ?? null;
  const vipVideoEmbedUrl = vipVideoUrl ? toEmbedVideoUrl(vipVideoUrl) : null;
  const vipHasMedia = vipGalleryImages.length > 0 || Boolean(vipVideoUrl);

  useEffect(() => {
    setVipVideoIndex(0);
  }, [campaignId]);

  useEffect(() => {
    setVipVideoFailed(false);
  }, [vipVideoUrl]);

  const isValid = {
    type: state.type !== null,
    donorInfo:
      isValidCpf(state.donorCpf) &&
      state.donorName.trim().length >= 2 &&
      state.donorWhatsapp.trim().length >= 8 &&
      state.donorCity.trim().length >= 2,
    details:
      state.type === "financial"
        ? (state.amount ?? 0) >= 1 &&
          (state.recurrence === "unique" || (state.numberOfInstallments ?? 0) >= 2)
        : state.type === "material"
          ? effectiveMaterialDescription.length >= 3 &&
            hasValidSelectedNeedQuantity &&
            (state.materialDeliveryFrequency === "unique" || state.numberOfInstallments === undefined)
          : state.volunteerDescription.trim().length >= 10,
    payment: state.paymentMethod !== null,
  };

  const donorInfoErrors = {
    name: state.donorName.trim().length < 2 ? "Nome deve ter pelo menos 2 caracteres" : "",
    cpf: !isValidCpf(state.donorCpf)
      ? normalizeCpfDigits(state.donorCpf).length !== 11
        ? "CPF deve ter 11 dígitos"
        : "CPF inválido — verifique os números"
      : "",
    whatsapp: state.donorWhatsapp.trim().length < 8 ? "WhatsApp deve ter pelo menos 8 caracteres" : "",
    city: state.donorCity.trim().length < 2 ? "Cidade deve ter pelo menos 2 caracteres" : "",
  };

  const handleTypeSelect = (type: ContributionType) => {
    setState({
      ...state,
      type,
      deliveryMethod: type === "material" ? (state.deliveryMethod ?? "pickup") : state.deliveryMethod,
      materialSettlementMode: type === "material" ? (state.materialSettlementMode ?? "in_kind") : null,
    });
    setStep("donor-info");
  };

  const handleNextStep = () => {
    if (step === "type" && isValid.type) {
      setStep("donor-info");
    } else if (step === "donor-info" && isValid.donorInfo && !donorInfoErrors.cpf) {
      if (isSingleRegistrationFlow && state.type === null) {
        rememberDonorProfile({
          donorName: state.donorName,
          donorCpf: state.donorCpf,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail,
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          donorBirthDate: state.donorBirthDate,
          donorGender: state.donorGender,
        });
        toast.success("Cadastro único concluído. Agora escolha como ajudar na lista.");
        setLocation(`/contribute/items/${campaignId}`);
        return;
      }
      if (isVipDirectPaymentFlow && state.type === "financial") {
        setStep("payment");
        return;
      }
      rememberDonorProfile({
        donorName: state.donorName,
        donorCpf: state.donorCpf,
        donorWhatsapp: state.donorWhatsapp,
        donorEmail: state.donorEmail,
        donorCity: state.donorCity,
        donorChurch: state.donorChurch,
        donorBirthDate: state.donorBirthDate,
        donorGender: state.donorGender,
      });
      setStep("details");
    } else if (step === "vip-showcase") {
      if (!vipMediaReviewed) {
        toast.error("Veja as fotos e o video do apartamento antes de continuar.");
        return;
      }
      if (isLoaded && currentDonor) {
        setStep("details");
      } else {
        setStep("donor-info");
      }
    } else if (step === "details" && isValid.details) {
      if (state.type === "financial") {
        setStep("payment");
      } else {
        setStep("confirmation");
      }
    } else if (step === "confirmation") {
      if (state.type === "financial") {
        setStep("payment");
      } else {
        handleSubmit();
      }
    } else if (step === "payment" && isValid.payment) {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    try {
      // Salvar dados do doador para próximas doações
      const donor = saveDonor({
        donorName: state.donorName,
        donorCpf: state.donorCpf,
        donorWhatsapp: state.donorWhatsapp,
        donorEmail: state.donorEmail,
        donorCity: state.donorCity,
        donorChurch: state.donorChurch,
        donorBirthDate: state.donorBirthDate,
        donorGender: state.donorGender,
      });

      if (state.type === "material") {
        const quantityExact = state.materialNeedId
          ? Number.parseInt(state.materialQuantity || "", 10)
          : undefined;

        await createMaterial.mutateAsync({
          campaignId,
          campaignNeedId: state.materialNeedId,
          description: effectiveMaterialSubmissionDescription,
          donorName: state.donorName,
          donorCpf: state.donorCpf,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail.trim() ? state.donorEmail.trim() : undefined,
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
          quantity: state.materialQuantity || undefined,
          quantityExact: quantityExact && quantityExact > 0 ? quantityExact : undefined,
          deliveryMethod: state.deliveryMethod || "pickup",
          numberOfInstallments: state.materialDeliveryFrequency === "unique" ? undefined : state.numberOfInstallments,
          materialDeliveryFrequency: state.materialDeliveryFrequency,
        });

        if (state.materialNeedId && quantityExact && quantityExact > 0) {
          addLocalNeedProgress({
            campaignId,
            needId: state.materialNeedId,
            quantity: quantityExact,
            valueCents: selectedNeedEstimatedAmount,
          });
        }

        toast.success("Oferta de material recebida! Entraremos em contato.");
        setLocation(`/contribute/help/${campaignId}`);
      } else if (state.type === "volunteer") {
        await createVolunteer.mutateAsync({
          campaignId,
          description: state.volunteerDescription,
          donorName: state.donorName,
          donorCpf: state.donorCpf,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail.trim() ? state.donorEmail.trim() : undefined,
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
        });
        toast.success("Oferta de voluntariado recebida! Entraremos em contato.");
        setLocation(`/contribute/help/${campaignId}`);
      } else if (
        state.type === "financial"
        && state.amount
        && state.paymentMethod === "pix"
        && state.recurrence !== "installments"
      ) {
        const amountCents = Math.round(state.amount * 100);
        const result = await createPixPayment.mutateAsync({
          campaignId,
          campaignTitle: campaign?.title,
          amount: amountCents,
          donorName: state.donorName,
          donorCpf: state.donorCpf,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail.trim(),
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
        });
        setPixPaymentData({
          qrCode: result.qrCode,
          qrCodeBase64: result.qrCodeBase64,
          paymentId: result.paymentId,
          externalReference: result.externalReference,
          amountCents,
        });
        setPixStatus("pending");
        setStep("pix-qr");
      } else if (state.type === "financial" && state.amount && state.paymentMethod) {
        const result = await createPayment.mutateAsync({
          campaignId,
          campaignTitle: campaign?.title,
          amount: Math.round(state.amount * 100),
          paymentMethod: state.paymentMethod,
          donorName: state.donorName,
          donorCpf: state.donorCpf,
          donorWhatsapp: state.donorWhatsapp,
          donorEmail: state.donorEmail.trim(),
          donorCity: state.donorCity,
          donorChurch: state.donorChurch,
          allowPublicDisplay: state.allowPublicDisplay ?? false,
          numberOfInstallments: state.recurrence === "installments" ? state.numberOfInstallments : undefined,
          installmentFrequency: state.recurrence === "installments" ? state.installmentFrequency : undefined,
        });
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
        }
      }
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "Erro ao processar contribuição. Tente novamente.";
      toast.error(message);
    }
  };

  const loading = createMaterial.isPending || createVolunteer.isPending || createPayment.isPending || createPixPayment.isPending;

  async function handleCopyPixCode() {
    if (!pixPaymentData) return;
    try {
      await navigator.clipboard.writeText(pixPaymentData.qrCode);
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 3000);
    } catch {
      toast.error("Não foi possível copiar o código. Copie manualmente.");
    }
  }

  return (
    <>
      <PublicHeader />
      <main className="min-h-screen bg-gradient-to-b from-[#f8faf6] to-white">
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <Link href={`/contribute/help/${campaignId}`} className="mb-6 flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Link>

          <Card>
            <CardHeader>
              <CardTitle>Como você gostaria de contribuir?</CardTitle>
              {campaign && <CardDescription>Campanha: {campaign.title}</CardDescription>}
              {isHotelCampaign ? (
                <div className="mt-4 rounded-lg border border-[#d7c18a] bg-gradient-to-r from-[#fff9e7] via-[#fff4d6] to-[#ffeab5] p-3 text-left">
                  <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8a5b00]">Acesso rápido VIP</p>
                  <p className="mt-1 text-sm text-[#5b3a00]">Quero doar um apartamento completo.</p>
                  <Link
                    href={`/contribute/vip/${campaignId}`}
                    className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md bg-[#8a6708] px-3 text-xs font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#6d5006]"
                  >
                    Ir para apartamento VIP
                  </Link>
                </div>
              ) : null}

              {/* Progress Indicator */}
              <div className="mt-6 flex items-center justify-between">
                {isSingleRegistrationFlow && state.type === null ? (
                  <>
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "donor-info" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>1</div>
                      <span className={`text-xs font-medium ${step === "donor-info" ? "text-blue-600" : "text-gray-600"}`}>Doador</span>
                    </div>
                  </>
                ) : state.type === "financial" ? (
                  <>
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "type" || step === "donor-info" || step === "vip-showcase" || step === "details" || step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>1</div>
                      <span className={`text-xs font-medium ${step === "type" ? "text-blue-600" : "text-gray-600"}`}>Tipo</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "donor-info" || step === "vip-showcase" || step === "details" || step === "payment" ? "bg-blue-600" : "bg-gray-200"}`} />

                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "donor-info" || step === "vip-showcase" || step === "details" || step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>2</div>
                      <span className={`text-xs font-medium ${step === "donor-info" ? "text-blue-600" : "text-gray-600"}`}>Doador</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "vip-showcase" || step === "details" || step === "payment" ? "bg-blue-600" : "bg-gray-200"}`} />

                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "vip-showcase" || step === "details" || step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>3</div>
                      <span className={`text-xs font-medium ${step === "vip-showcase" ? "text-blue-600" : "text-gray-600"}`}>Apartamento</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "details" || step === "payment" ? "bg-blue-600" : "bg-gray-200"}`} />

                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "details" || step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>4</div>
                      <span className={`text-xs font-medium ${step === "details" ? "text-blue-600" : "text-gray-600"}`}>Detalhes</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "payment" ? "bg-blue-600" : "bg-gray-200"}`} />

                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "payment" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>5</div>
                      <span className={`text-xs font-medium ${step === "payment" ? "text-blue-600" : "text-gray-600"}`}>Pagamento</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "type" || step === "donor-info" || step === "details" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>1</div>
                      <span className={`text-xs font-medium ${step === "type" ? "text-blue-600" : "text-gray-600"}`}>Tipo</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "donor-info" || step === "details" || step === "confirmation" ? "bg-blue-600" : "bg-gray-200"}`} />

                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "donor-info" || step === "details" || step === "confirmation" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>2</div>
                      <span className={`text-xs font-medium ${step === "donor-info" ? "text-blue-600" : "text-gray-600"}`}>Doador</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "details" || step === "confirmation" ? "bg-blue-600" : "bg-gray-200"}`} />

                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "details" || step === "confirmation" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>3</div>
                      <span className={`text-xs font-medium ${step === "details" ? "text-blue-600" : "text-gray-600"}`}>Detalhes</span>
                    </div>
                    <div className={`flex-1 h-1 mx-2 ${step === "confirmation" ? "bg-blue-600" : "bg-gray-200"}`} />

                    <div className="flex flex-1 items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm ${step === "confirmation" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>4</div>
                      <span className={`text-xs font-medium ${step === "confirmation" ? "text-blue-600" : "text-gray-600"}`}>Confirmar</span>
                    </div>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isVipApartmentOffer && (
                <div className="mb-6 rounded-lg border border-[#d7c18a] bg-gradient-to-r from-[#fff9e7] via-[#fff4d6] to-[#ffeab5] p-4 text-sm text-[#5b3a00]">
                  <p className="font-extrabold uppercase tracking-[0.08em] text-[#8a5b00]">DOADOR VIP · APARTAMENTO COMPLETO</p>
                  <p className="mt-1 font-semibold">Você está na jornada de doação do apartamento completo.</p>
                  <p className="mt-1">Valor de referência: R$ 120.000,00 (ajustável).</p>
                  <p className="mt-1">Configuração prevista: 5 camas box de solteiro, com adaptação para 1 cama de casal em encontros de casais.</p>
                  <p className="mt-1 font-medium">Material de linha para maior conforto. As fotos e o video ficam nesta jornada VIP, antes do pagamento.</p>
                </div>
              )}

              {hasMaterialFlow && campaignNeeds.length > 0 && !(isSingleRegistrationFlow && state.type === null) && step !== "vip-showcase" && state.type !== "financial" && (
                <div className="mb-6 rounded-lg border border-[#d5dfd3] bg-[#f5f8f4] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#35523a]">
                    {state.type === "material" && selectedNeed ? "Item selecionado na campanha" : "De acordo com a lista da campanha"}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {needsPreview.map((need) => (
                      <div key={need.id} className="rounded-md border border-[#e1e8df] bg-white px-3 py-2 text-sm">
                        <span className="font-semibold text-[#2d2d2d]">{normalizeNeedLabel(need.name)}</span>
                        <span className="text-[#5f6f61]">: {need.targetQuantityExact ?? 0} un.</span>
                        <span className="text-[#6f7e71]"> · {formatCurrency(need.unitValueCents ?? 0)}/un.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 1: Tipo de Contribuição */}
              {step === "type" && !isSingleRegistrationFlow && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-6">Escolha o tipo de ajuda que você deseja oferecer:</p>
                  <div className="grid gap-3">
                    <button
                      onClick={() => handleTypeSelect("financial")}
                      className="flex items-start gap-4 rounded-lg border-2 border-gray-200 p-4 text-left transition hover:border-blue-500 hover:bg-blue-50"
                    >
                      <DollarSign className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold text-gray-900">💰 Doação Financeira</h3>
                        <p className="text-sm text-gray-600">PIX, cartão, boleto ou dinheiro</p>
                      </div>
                    </button>

                    {hasMaterialFlow ? (
                      <button
                        onClick={() => handleTypeSelect("material")}
                        className="flex items-start gap-4 rounded-lg border-2 border-gray-200 p-4 text-left transition hover:border-green-500 hover:bg-green-50"
                      >
                        <Package className="h-6 w-6 text-green-600 flex-shrink-0 mt-1" />
                        <div>
                          <h3 className="font-semibold text-gray-900">📦 {materialCopy.label}</h3>
                          <p className="text-sm text-gray-600">{materialCopy.subtitle}</p>
                        </div>
                      </button>
                    ) : null}

                    <button
                      onClick={() => handleTypeSelect("volunteer")}
                      className="flex items-start gap-4 rounded-lg border-2 border-gray-200 p-4 text-left transition hover:border-purple-500 hover:bg-purple-50"
                    >
                      <Users className="h-6 w-6 text-purple-600 flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold text-gray-900">🤝 Mão de Obra / Voluntariado</h3>
                        <p className="text-sm text-gray-600">Serviços, profissões ou trabalho voluntário</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Dados do Doador */}
              {step === "donor-info" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-6">
                    {isSingleRegistrationFlow && state.type === null
                      ? "Faça o cadastro da pessoa doadora para liberar a lista de materiais e a opção de doação em dinheiro."
                      : "Preencha seus dados para que possamos entrar em contato:"}
                  </p>

                  {state.type === "financial" && !isSingleRegistrationFlow && (
                    <div className="rounded-lg border border-[#d7e6d3] bg-[#f6fbf4] p-4 text-sm text-[#35523a]">
                      <p className="font-semibold text-[#24412a]">Por que pedimos esses dados?</p>
                      <p className="mt-1">
                        Eles servem para identificar sua doacao, facilitar contato se houver necessidade e registrar corretamente o apoio na campanha.
                      </p>
                      <p className="mt-2 text-[#4f6550]">
                        Seu nome so aparece publicamente se voce autorizar. Caso contrario, a doacao permanece anonima na exibicao publica.
                      </p>
                    </div>
                  )}
                  
                  {currentDonor && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-blue-700">
                        <span className="font-semibold">✓ Bem-vindo novamente!</span> Seus dados foram carregados automaticamente.
                        <br />
                        <span className="text-xs text-blue-600 mt-1 block">ID do doador: {currentDonor.donorId} • Doações anteriores: {currentDonor.donationsCount}</span>
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 h-auto p-0 text-sm font-semibold text-blue-700 hover:text-blue-800"
                        onClick={() => {
                          clearSavedDonors();
                          setLastLookupKey("");
                          setState((prev) => ({
                            ...prev,
                            donorName: "",
                            donorCpf: "",
                            donorWhatsapp: "",
                            donorEmail: "",
                            donorCity: "",
                            donorChurch: "",
                          }));
                          toast.success("Dados salvos deste dispositivo foram apagados.");
                        }}
                      >
                        Esquecer meus dados neste dispositivo
                      </Button>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                      <Input
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={state.donorCpf}
                        onChange={(e) => {
                          const newCpf = formatCpf(e.target.value);
                          const newDigits = newCpf.replace(/\D/g, "");
                          const savedDigits = (currentDonor?.donorCpf ?? "").replace(/\D/g, "");
                          // Só limpa campos quando CPF completo (11 dígitos) e diferente do salvo
                          if (newDigits.length === 11 && savedDigits && newDigits !== savedDigits) {
                            setState((prev) => ({
                              ...prev,
                              donorCpf: newCpf,
                              donorName: "",
                              donorWhatsapp: "",
                              donorEmail: "",
                              donorCity: "",
                              donorChurch: "",
                            }));
                            setLastLookupKey("");
                          } else {
                            setState({ ...state, donorCpf: newCpf });
                          }
                        }}
                        maxLength={14}
                        disabled={loading}
                        className={donorInfoErrors.cpf ? "border-red-500" : ""}
                        autoFocus
                      />
                      {donorInfoErrors.cpf && <p className="text-xs text-red-500 mt-1">{donorInfoErrors.cpf}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                      <Input
                        autoComplete="off"
                        placeholder="Seu nome"
                        value={state.donorName}
                        onChange={(e) => setState({ ...state, donorName: e.target.value })}
                        disabled={loading}
                        className={donorInfoErrors.name ? "border-red-500" : ""}
                      />
                      {donorInfoErrors.name && <p className="text-xs text-red-500 mt-1">{donorInfoErrors.name}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                      <Input
                        autoComplete="off"
                        placeholder="(11) 99999-9999"
                        value={state.donorWhatsapp}
                        onChange={(e) => setState({ ...state, donorWhatsapp: e.target.value })}
                        disabled={loading}
                        className={donorInfoErrors.whatsapp ? "border-red-500" : ""}
                      />
                      {donorInfoErrors.whatsapp && <p className="text-xs text-red-500 mt-1">{donorInfoErrors.whatsapp}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email (opcional)</label>
                      <Input
                        autoComplete="off"
                        type="email"
                        placeholder="seu@email.com"
                        value={state.donorEmail}
                        onChange={(e) => setState({ ...state, donorEmail: e.target.value })}
                        disabled={loading}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                        <Input
                          autoComplete="off"
                          placeholder="Sua cidade"
                          value={state.donorCity}
                          onChange={(e) => setState({ ...state, donorCity: e.target.value })}
                          disabled={loading}
                          className={donorInfoErrors.city ? "border-red-500" : ""}
                        />
                        {donorInfoErrors.city && <p className="text-xs text-red-500 mt-1">{donorInfoErrors.city}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Igreja (opcional)</label>
                        <Input
                          autoComplete="off"
                          placeholder="Nome da sua igreja"
                          value={state.donorChurch}
                          onChange={(e) => setState({ ...state, donorChurch: e.target.value })}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de nascimento (opcional)</label>
                        <Input
                          type="date"
                          value={state.donorBirthDate}
                          onChange={(e) => setState({ ...state, donorBirthDate: e.target.value })}
                          disabled={loading}
                          max={new Date().toISOString().split("T")[0]}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sexo (opcional)</label>
                        <Select
                          value={state.donorGender || ""}
                          onValueChange={(v) => setState({ ...state, donorGender: v as "" | "male" | "female" | "other" | "prefer_not_to_say" })}
                          disabled={loading}
                        >
                          <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 shadow-lg">
                            <SelectItem value="male">Masculino</SelectItem>
                            <SelectItem value="female">Feminino</SelectItem>
                            <SelectItem value="other">Outro</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefiro não informar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Posso divulgar seu nome? *</label>
                      <Select
                        value={state.allowPublicDisplay ? "sim" : "nao"}
                        onValueChange={(value) => setState({ ...state, allowPublicDisplay: value === "sim" })}
                        disabled={loading}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Escolha uma opção..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-200 shadow-lg">
                          <SelectItem value="sim">✓ Sim, pode divulgar meu nome</SelectItem>
                          <SelectItem value="nao">✕ Não, prefiro manter anônimo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (isSingleRegistrationFlow && state.type === null) {
                          setLocation(`/contribute/help/${campaignId}`);
                          return;
                        }
                        setStep("type");
                      }}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Voltar
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      disabled={!isValid.donorInfo || loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {isSingleRegistrationFlow && state.type === null ? "Concluir cadastro do doador →" : "Próximo →"}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 3: Detalhes da Contribuição */}
              {step === "vip-showcase" && state.type === "financial" && isVipApartmentOffer && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[#d7c18a] bg-gradient-to-r from-[#fff9e7] via-[#fff4d6] to-[#ffeab5] p-4 text-sm text-[#5b3a00]">
                    <p className="font-extrabold uppercase tracking-[0.08em] text-[#8a5b00]">DOADOR VIP · APARTAMENTO COMPLETO</p>
                    <p className="mt-1 font-semibold">Ao clicar em ir para doador VIP, você entra nesta página com os detalhes do apartamento decorado.</p>
                    <p className="mt-1">Este é o apartamento que será construído com a doação VIP completa.</p>
                    <p className="mt-1">Configuração prevista: 5 camas box de solteiro, com adaptação para 1 cama de casal em encontros de casais.</p>
                  </div>

                  {vipHasMedia && (
                    <section className="rounded-lg border border-[#d7c18a] bg-gradient-to-b from-[#fff9e7] via-[#fff4d6] to-[#ffeab5] p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8a5b00]">Apartamento completo</p>
                      <h3 className="mt-1 text-lg font-black uppercase tracking-[0.03em] text-[#6a4600]">Fotos e video do apartamento decorado</h3>

                      {vipVideoUrl && (
                        <div className="mt-3 rounded-md border border-[#e3c98a] bg-white/80 p-3 text-sm text-[#5b3a00]">
                          <p className="font-semibold">Video do apartamento VIP</p>
                          <p className="mt-1">Se o player não abrir no seu aparelho, toque no botão abaixo.</p>
                          <a
                            href={vipVideoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md bg-[#8a6708] px-3 text-xs font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#6d5006]"
                          >
                            Abrir video em nova aba
                          </a>
                        </div>
                      )}

                      {vipVideoUrl && (
                        <div className="mt-3 overflow-hidden rounded-lg border border-[#e3c98a] bg-black">
                          {vipVideoEmbedUrl ? (
                            <div className="aspect-video w-full">
                              <iframe
                                src={vipVideoEmbedUrl}
                                title={`Video de apresentacao do apartamento VIP da campanha ${campaign?.title ?? ""}`}
                                className="h-full w-full"
                                loading="lazy"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          ) : (
                            <video
                              key={vipVideoUrl}
                              className="aspect-video w-full"
                              controls
                              preload="auto"
                              playsInline
                              muted={false}
                              poster={vipGalleryImages[0]}
                              onError={() => {
                                setVipVideoFailed(true);
                                setVipVideoIndex(0);
                              }}
                            >
                              <source src={vipVideoUrl} type={getVideoMimeType(vipVideoUrl)} />
                            </video>
                          )}
                        </div>
                      )}

                      {vipVideoFailed && vipVideoUrl && (
                        <p className="mt-2 text-xs font-semibold text-[#8a2e00]">
                          O player do video teve falha neste dispositivo. Use o botão "Abrir video em nova aba" para assistir.
                        </p>
                      )}

                      {vipGalleryImages.length > 0 && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {vipGalleryImages.map((imageUrl) => (
                            <div key={imageUrl} className="overflow-hidden rounded-lg border border-[#e3c98a] bg-white">
                              <img
                                src={imageUrl}
                                alt={`Foto do apartamento VIP da campanha ${campaign?.title ?? ""}`}
                                className="h-40 w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  <div className="rounded-md border border-[#e3c98a] bg-white/70 p-3">
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-[#5b3a00]">
                      <input
                        type="checkbox"
                        checked={vipMediaReviewed}
                        onChange={(event) => setVipMediaReviewed(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#b59128]"
                      />
                      <span>
                        Vi as fotos e o video do apartamento decorado e desejo continuar com a doacao VIP.
                      </span>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep("donor-info")}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Voltar
                    </Button>
                    <Button
                      onClick={() => setStep("details")}
                      disabled={loading || !vipMediaReviewed}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      Continuar para detalhes →
                    </Button>
                  </div>
                </div>
              )}

              {step === "details" && (
                <div className="space-y-4">
                  {state.type === "financial" && (
                    <>
                      <p className="text-sm text-gray-600 mb-6">Defina os detalhes de sua doação financeira:</p>
                      {initialOffer === "apartment" && (
                        <div className="rounded-lg border border-[#d7c18a] bg-gradient-to-r from-[#fff9e7] via-[#fff4d6] to-[#ffeab5] p-4 text-sm text-[#5b3a00]">
                          <p className="font-extrabold uppercase tracking-[0.08em] text-[#8a5b00]">DOADOR VIP · OFERTA ESPECIAL</p>
                          <p className="mt-1 font-semibold">Doação VIP de apartamento completo selecionada.</p>
                          <p className="mt-1">Você pode manter o valor sugerido ou ajustar antes de continuar.</p>
                          <div className="mt-3 rounded-md border border-[#e3c98a] bg-white/60 p-3">
                            <p className="font-semibold">Breve comentário sobre o apartamento</p>
                            <p className="mt-1">
                              O valor de um apartamento completo fica em torno de R$ 120.000,00,
                              com previsão de 5 camas box de solteiro.
                            </p>
                            <p className="mt-1">
                              Em encontros de casais, o apto pode ser adaptado para 1 cama de casal,
                              mantendo conforto e material de boa qualidade.
                            </p>
                            <p className="mt-1 font-medium">As fotos e o video aparecem abaixo nesta jornada VIP, antes do pagamento.</p>
                          </div>
                        </div>
                      )}

                      {initialOffer === "apartment" && vipHasMedia && (
                        <section className="rounded-lg border border-[#d7c18a] bg-gradient-to-b from-[#fff9e7] via-[#fff4d6] to-[#ffeab5] p-4">
                          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8a5b00]">Apartamento completo</p>
                          <h3 className="mt-1 text-lg font-black uppercase tracking-[0.03em] text-[#6a4600]">Fotos e video do apartamento decorado</h3>

                          {vipVideoUrl && (
                            <div className="mt-3 overflow-hidden rounded-lg border border-[#e3c98a] bg-black">
                              <div className="aspect-video w-full">
                                <video
                                  key={vipVideoUrl}
                                  className="h-full w-full"
                                  controls
                                  preload="metadata"
                                  playsInline
                                  poster={vipGalleryImages[0]}
                                  autoPlay={false}
                                  onLoadedMetadata={(event) => {
                                    event.currentTarget.muted = false;
                                    event.currentTarget.volume = 1;
                                  }}
                                  onPlay={(event) => {
                                    event.currentTarget.muted = false;
                                    event.currentTarget.volume = 1;
                                  }}
                                  onError={() => {
                                    setVipVideoIndex(0);
                                  }}
                                >
                                  <source src={vipVideoUrl ?? undefined} type={getVideoMimeType(vipVideoUrl)} />
                                </video>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <a
                                    href={vipVideoUrl ?? "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#8a6708] px-3 text-xs font-extrabold uppercase tracking-[0.04em] text-white transition hover:bg-[#6d5006]"
                                  >
                                    Abrir vídeo em nova aba
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}

                          {vipGalleryImages.length > 0 && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {vipGalleryImages.map((imageUrl) => (
                                <div key={imageUrl} className="overflow-hidden rounded-lg border border-[#e3c98a] bg-white">
                                  <img
                                    src={imageUrl}
                                    alt={`Foto do apartamento VIP da campanha ${campaign?.title ?? ""}`}
                                    className="h-40 w-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                        <Input
                          type="text"
                          placeholder="Ex.: 1000 ou 1.000,00"
                          inputMode="decimal"
                          value={financialAmountInput || (state.amount ? String(state.amount).replace(".", ",") : "")}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            setFinancialAmountInput(inputValue);
                            const parsed = parseBrlAmount(inputValue);
                            setState({ ...state, amount: Number.isFinite(parsed) ? parsed : undefined });
                          }}
                          disabled={loading}
                        />
                        <p className="mt-1 text-xs text-gray-500">Digite 1000 ou 1.000,00. O sistema entende os dois formatos automaticamente.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Como você gostaria de pagar? *</label>
                        <Select
                          value={state.recurrence}
                          onValueChange={(value) => setState({ ...state, recurrence: value as RecurrenceType, numberOfInstallments: undefined })}
                          disabled={loading}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 shadow-lg">
                            <SelectItem value="unique">À vista (uma vez)</SelectItem>
                            <SelectItem value="installments">Em parcelas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {state.recurrence === "installments" && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Número de Parcelas *</label>
                              <Input
                                type="number"
                                placeholder="Ex: 10"
                                min="2"
                                max="24"
                                value={state.numberOfInstallments || ""}
                                onChange={(e) => setState({ ...state, numberOfInstallments: e.target.value ? parseInt(e.target.value) : undefined })}
                                disabled={loading}
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Frequência *</label>
                              <Select
                                value={state.installmentFrequency || ""}
                                onValueChange={(value) => setState({ ...state, installmentFrequency: value as InstallmentFrequency })}
                                disabled={loading}
                              >
                                <SelectTrigger className="bg-white">
                                  <SelectValue placeholder="Escolha..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white border border-gray-200 shadow-lg">
                                  <SelectItem value="weekly">Semanal</SelectItem>
                                  <SelectItem value="biweekly">Quinzenal</SelectItem>
                                  <SelectItem value="monthly">Mensal</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Início *</label>
                        <Input
                          type="date"
                          value={state.startDate}
                          onChange={(e) => setState({ ...state, startDate: e.target.value })}
                          disabled={loading}
                        />
                      </div>
                    </>
                  )}

                  {state.type === "material" && (
                    <>
                      <p className="text-sm text-gray-600 mb-6">
                        {selectedNeed
                          ? "Confira o item da planilha e informe sua quantidade:"
                          : isLegendario
                            ? materialCopy.description
                            : "Descreva o material que você gostaria de doar:"}
                      </p>
                      {campaignNeeds.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Item da lista</label>
                          <Select
                            value={state.materialNeedId ? String(state.materialNeedId) : ""}
                            onValueChange={(value) => setState({ ...state, materialNeedId: value ? Number(value) : undefined })}
                            disabled={loading}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Escolha um item da lista" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border border-gray-200 shadow-lg">
                              {campaignNeeds.map((need) => (
                                <SelectItem key={need.id} value={String(need.id)}>
                                  {need.name}: {need.targetQuantityExact ?? 0} un. ({formatCurrency(need.unitValueCents ?? 0)}/un.)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedNeed && (
                            <p className="mt-1 text-xs text-[#5f6f61]">
                              Item definido pela planilha. Voce so precisa informar a quantidade.
                            </p>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo da doação</label>
                        <Select
                          value={state.materialDonationType}
                          onValueChange={(value: MaterialDonationType) => setState({ ...state, materialDonationType: value })}
                          disabled={loading}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 text-gray-900 opacity-100 shadow-lg">
                            <SelectItem className="bg-white text-gray-900 hover:bg-gray-100 focus:bg-gray-100" value="detailed">DOACAO DETALHADA</SelectItem>
                            <SelectItem className="bg-white text-gray-900 hover:bg-gray-100 focus:bg-gray-100" value="avulsa">DOACAO AVULSA</SelectItem>
                            <SelectItem className="bg-white text-gray-900 hover:bg-gray-100 focus:bg-gray-100" value="other">OUTRA DOACAO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedNeed && (
                        <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 space-y-1">
                          <p><span className="font-semibold">Item:</span> {normalizeNeedLabel(selectedNeed.name)}</p>
                          <p><span className="font-semibold">Meta:</span> {selectedNeedTargetQuantity} unidades</p>
                          <p><span className="font-semibold">Valor unitário:</span> {formatCurrency(selectedNeedUnitValueCents)}</p>
                          <p><span className="font-semibold">Valor total da meta:</span> {formatCurrency(selectedNeedTargetAmount)}</p>
                          <p><span className="font-semibold">Falta hoje:</span> {selectedNeedRemaining} unidades</p>
                        </div>
                      )}

                      {!selectedNeed && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                          <Textarea
                            placeholder={isLegendario ? materialCopy.placeholder : "Ex: Cimento, tijolos, tintas, etc."}
                            value={state.materialDescription}
                            onChange={(e) => setState({ ...state, materialDescription: e.target.value })}
                            disabled={loading}
                            className="min-h-24"
                          />
                          <p className="mt-1 text-xs text-gray-500">Mínimo de 3 caracteres.</p>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Minha doação (quantidade) {state.materialNeedId ? "*" : "(opcional)"}
                        </label>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={state.materialQuantity}
                          onChange={(e) => setState({ ...state, materialQuantity: e.target.value })}
                          disabled={loading}
                        />
                        {state.materialNeedId && selectedNeedQuantityExact <= 0 && (
                          <p className="mt-1 text-xs text-red-500">Informe a quantidade exata que você vai entregar.</p>
                        )}
                        {state.materialNeedId && selectedNeedExceedsGoal && (
                          <p className="mt-1 text-xs text-red-500">Quantidade acima do saldo da meta. Ajuste para no máximo {selectedNeedRemaining} unidades.</p>
                        )}
                      </div>

                      {selectedNeed && (
                        <div className="rounded-md border border-[#dbe8db] bg-[#f7fbf7] p-3 text-sm text-[#2f4a34] space-y-1">
                          <p><span className="font-semibold">Valor da minha doação:</span> {formatCurrency(selectedNeedEstimatedAmount)}</p>
                          <p><span className="font-semibold">Falta após minha doação:</span> {selectedNeedRemainingAfterContribution} unidades</p>
                        </div>
                      )}

                    </>
                  )}

                  {state.type === "volunteer" && (
                    <>
                      <p className="text-sm text-gray-600 mb-6">Descreva o tipo de mão de obra ou voluntariado que você oferece:</p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                        <Textarea
                          placeholder="Ex: Pedreiro, eletricista, pintor, ajudante, etc."
                          value={state.volunteerDescription}
                          onChange={(e) => setState({ ...state, volunteerDescription: e.target.value })}
                          disabled={loading}
                          className="min-h-24"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep("donor-info")}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Voltar
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      disabled={!isValid.details || loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {state.type === "financial" ? "Escolher Pagamento →" : "Confirmar valores →"}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 4: Revisão VIP antes do pagamento */}
              {/* STEP 4: Confirmação da proposta (material/voluntário) */}
              {step === "confirmation" && state.type !== "financial" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-2">Revise os dados antes de confirmar sua proposta de doação:</p>

                  <div className="rounded-lg border border-[#d9e6d9] bg-[#f6fbf6] p-4 space-y-2 text-sm">
                    <div><span className="font-semibold text-[#2d2d2d]">Campanha:</span> <span className="text-[#4c5a4e]">{campaign?.title}</span></div>
                    <div><span className="font-semibold text-[#2d2d2d]">Doador:</span> <span className="text-[#4c5a4e]">{state.donorName}</span></div>
                    {state.type === "material" ? (
                      <>
                        <div><span className="font-semibold text-[#2d2d2d]">Tipo da doação:</span> <span className="text-[#4c5a4e]">{materialDonationTypeLabel}</span></div>
                        <div><span className="font-semibold text-[#2d2d2d]">Item:</span> <span className="text-[#4c5a4e]">{selectedNeed ? selectedNeed.name : state.materialDescription}</span></div>
                        <div><span className="font-semibold text-[#2d2d2d]">Quantidade:</span> <span className="text-[#4c5a4e]">{state.materialQuantity || "Não informada"}</span></div>
                        <div><span className="font-semibold text-[#2d2d2d]">Valor total:</span> <span className="text-[#4c5a4e]">{formatCurrency(selectedNeedEstimatedAmount)}</span></div>
                        <div><span className="font-semibold text-[#2d2d2d]">Faltam hoje na meta:</span> <span className="text-[#4c5a4e]">{selectedNeedRemaining} unidades</span></div>
                        <div><span className="font-semibold text-[#2d2d2d]">Após sua oferta:</span> <span className="text-[#4c5a4e]">{selectedNeedRemainingAfterContribution} unidades</span></div>
                      </>
                    ) : (
                      <div><span className="font-semibold text-[#2d2d2d]">Serviço oferecido:</span> <span className="text-[#4c5a4e]">{state.volunteerDescription}</span></div>
                    )}
                  </div>

                  {state.type === "material" && selectedNeedEstimatedAmount > 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
                      <p className="font-semibold text-blue-900">Como você quer prosseguir?</p>
                      <p className="mt-1 text-blue-800">Escolha se esta contribuição será em espécie (material) ou em dinheiro (valor equivalente).</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          className={state.materialSettlementMode === "in_kind" ? "bg-green-700 hover:bg-green-800" : "bg-green-600 hover:bg-green-700"}
                          disabled={loading}
                          onClick={() => setState((prev) => ({ ...prev, materialSettlementMode: "in_kind", deliveryMethod: prev.deliveryMethod ?? "pickup" }))}
                        >
                          Em espécie (material)
                        </Button>
                        <Button
                          type="button"
                          variant={state.materialSettlementMode === "cash_equivalent" ? "default" : "outline"}
                          disabled={loading}
                          onClick={() => setState((prev) => ({ ...prev, materialSettlementMode: "cash_equivalent" }))}
                        >
                          Em dinheiro (equivalente)
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setStep("details")}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Ajustar proposta
                    </Button>
                    <Button
                      disabled={loading || (state.type === "material" && selectedNeedEstimatedAmount > 0 && state.materialSettlementMode === null)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      type="button"
                      onClick={() => {
                        if (state.type === "material" && selectedNeedEstimatedAmount > 0 && state.materialSettlementMode === "cash_equivalent") {
                          setState((prev) => ({
                            ...prev,
                            type: "financial",
                            amount: selectedNeedEstimatedAmount / 100,
                            recurrence: "unique",
                            paymentMethod: null,
                          }));
                          setStep("payment");
                          return;
                        }

                        handleSubmit();
                      }}
                    >
                      {state.type === "material" && state.materialSettlementMode === "cash_equivalent"
                        ? "Prosseguir para pagamento →"
                        : "Confirmar proposta"}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 4: Forma de Pagamento (apenas para financeiro) */}
              {step === "payment" && state.type === "financial" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 mb-6">Escolha a forma de pagamento:</p>
                  <div className="grid gap-3">
                    <button
                      onClick={() => setState({ ...state, paymentMethod: "pix" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "pix"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "pix" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">🔗 PIX (cópia e cola)</span>
                    </button>

                    <button
                      onClick={() => setState({ ...state, paymentMethod: "card" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "card"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "card" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">💳 Cartão de Crédito/Débito</span>
                    </button>

                    <button
                      onClick={() => setState({ ...state, paymentMethod: "boleto" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "boleto"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "boleto" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">🧾 Boleto Bancário</span>
                    </button>

                    <button
                      onClick={() => setState({ ...state, paymentMethod: "cash" })}
                      className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition ${
                        state.paymentMethod === "cash"
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-blue-500"
                      }`}
                      disabled={loading}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${state.paymentMethod === "cash" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`} />
                      <span className="font-medium">💵 Dinheiro (presencial)</span>
                    </button>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep("details")}
                      disabled={loading}
                      className="flex-1"
                    >
                      ← Voltar
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      disabled={!isValid.payment || loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      {loading ? "Processando..." : "Confirmar Doação →"}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 5: QR code do Pix embutido — o doador paga sem sair do site */}
              {step === "pix-qr" && pixPaymentData && (
                <div className="space-y-5 text-center">
                  {pixStatus === "approved" ? (
                    <div className="space-y-4 py-6">
                      <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" aria-hidden="true" />
                      <h3 className="text-2xl font-bold text-gray-900">Pagamento aprovado!</h3>
                      <p className="text-gray-600">
                        Sua contribuição de {formatCurrency(pixPaymentData.amountCents)} foi confirmada. Muito obrigado por ajudar!
                      </p>
                      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                        <Button asChild className="flex-1 bg-blue-600 hover:bg-blue-700">
                          <Link href={`/campaign/${campaignId}`}>Voltar à campanha</Link>
                        </Button>
                      </div>
                    </div>
                  ) : pixStatus === "rejected" ? (
                    <div className="space-y-4 py-6">
                      <AlertCircle className="mx-auto h-16 w-16 text-red-600" aria-hidden="true" />
                      <h3 className="text-2xl font-bold text-gray-900">Pagamento não aprovado</h3>
                      <p className="text-gray-600">O Pix não foi confirmado. Você pode tentar novamente.</p>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          setPixPaymentData(null);
                          setStep("payment");
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">Escaneie o código com o app do seu banco ou copie o código Pix:</p>
                      <div className="text-lg font-bold text-gray-900">{formatCurrency(pixPaymentData.amountCents)}</div>
                      <img
                        src={`data:image/png;base64,${pixPaymentData.qrCodeBase64}`}
                        alt="QR code Pix"
                        className="mx-auto h-56 w-56 rounded-lg border border-gray-200"
                      />
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-left">
                        <p className="break-all font-mono text-xs text-gray-500">{pixPaymentData.qrCode}</p>
                      </div>
                      <Button variant="outline" className="w-full" type="button" onClick={handleCopyPixCode}>
                        <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                        {pixCopied ? "Código copiado!" : "Copiar código Pix"}
                      </Button>
                      <div className="flex items-center justify-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                        {pixStatus === "timeout" ? (
                          <span>Ainda não recebemos a confirmação. Se você já pagou, aguarde mais um pouco — o pagamento pode levar alguns minutos.</span>
                        ) : (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            <span>Aguardando pagamento... esta tela atualiza sozinha assim que confirmar.</span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-sm text-gray-500 underline"
                        onClick={() => {
                          setPixPaymentData(null);
                          setStep("payment");
                        }}
                      >
                        ← Escolher outra forma de pagamento
                      </button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
