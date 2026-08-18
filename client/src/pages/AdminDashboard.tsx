import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Building2, CheckCircle2, Edit2, ExternalLink, FileText, Handshake, Megaphone, PackagePlus, Plus, Trash2, Users, XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminUser } from "@/_core/hooks/adminAccess";
import CampaignAccountabilityDialog from "@/components/admin/CampaignAccountabilityDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { clearLocalNeedsForCampaign, mergeNeedsForManagement, readLocalNeedsForCampaign, removeLocalNeed, saveLocalNeed, updateLocalNeed } from "@/lib/localNeeds";
import { resolveCampaignImageUrl } from "@/lib/campaignMedia";
import { getCampaignContent, saveCampaignContent } from "@/lib/campaignContent";
import { getSiteContent, saveSiteContent } from "@/lib/siteContent";
import { resolveMediaUrl } from "@/lib/mediaInput";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const EMPTY_PARTNER_FORM = {
  name: "",
  type: "company" as "company" | "individual",
  ownerName: "",
  description: "",
  logoUrl: "",
  storePhotoUrl: "",
  ownerPhotoUrl: "",
  address: "",
  contactInfo: "",
  testimonialVideoUrl: "",
  testimonialText: "",
  website: "",
};

type NewNeedDraft = {
  type: "material" | "labor" | "equipment" | "other";
  name: string;
  quantity: string;
  targetQuantityExact: string;
  unitValue: string;
  priority: "high" | "medium" | "low";
  description: string;
};

const createEmptyNeedDraft = (): NewNeedDraft => ({
  type: "material",
  name: "",
  quantity: "",
  targetQuantityExact: "",
  unitValue: "",
  priority: "medium",
  description: "",
});

type CampaignModelType = "custom" | "construction_hotel";
type HelpTierOption = "material" | "financial" | "vip";
const DEFAULT_HELP_TIER_OPTIONS: HelpTierOption[] = ["material", "financial", "vip"];

const CONSTRUCTION_HOTEL_NEEDS_TEMPLATE: NewNeedDraft[] = [
  {
    type: "material",
    name: "Cimento",
    quantity: "200 sacos",
    targetQuantityExact: "200",
    unitValue: "45,00",
    priority: "high",
    description: "Materiais essenciais para a fase inicial da construção.",
  },
  {
    type: "material",
    name: "Tijolo",
    quantity: "12.000 unidades",
    targetQuantityExact: "12000",
    unitValue: "1,20",
    priority: "high",
    description: "Para avanço das paredes e divisórias da obra.",
  },
];

const CONSTRUCTION_HOTEL_DESCRIPTION =
  "Apoie a construção com materiais e contribuições para avançar cada etapa da obra com transparência e impacto social.";

const CONSTRUCTION_HOTEL_LONG_DESCRIPTION =
  "Esta campanha segue o modelo de construção colaborativa, com necessidades concretas por item, metas exatas de materiais e acompanhamento contínuo da evolução da obra. Sua contribuição ajuda a acelerar fases essenciais como estrutura, divisórias e acabamento.";

const EMPTY_CAMPAIGN_EDIT_FORM = {
  title: "",
  description: "",
  longDescription: "",
  goal: "",
  vipApartmentAmount: "",
  helpTierOptions: DEFAULT_HELP_TIER_OPTIONS,
  vipImageUrls: "",
  vipVideoUrls: "",
  initialRaised: "",
  imageUrl: "",
  status: "active" as "active" | "completed" | "paused" | "archived",
};

const EMPTY_UPDATE_FORM = {
  title: "",
  description: "",
  phase: "during" as "before" | "during" | "after",
  imageUrls: "",
  videoUrls: "",
};

const EMPTY_NEED_FORM = {
  type: "material" as "material" | "labor" | "equipment" | "other",
  name: "",
  description: "",
  quantity: "",
  targetQuantityExact: "",
  unitValue: "",
  priority: "medium" as "high" | "medium" | "low",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = isAdminUser(user, ["gospeltv@gmail.com"]);
  const isLocalhost = window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1");
  const [activeTab, setActiveTab] = useState<"campaigns" | "partners" | "community">(() =>
    new URLSearchParams(window.location.search).get("tab") === "partners" ? "partners" : "campaigns",
  );
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [isEditCampaignOpen, setIsEditCampaignOpen] = useState(false);
  const [isCampaignUpdateOpen, setIsCampaignUpdateOpen] = useState(false);
  const [isCampaignNeedOpen, setIsCampaignNeedOpen] = useState(false);
  const [isManageNeedsOpen, setIsManageNeedsOpen] = useState(false);
  const [managingNeedsCampaign, setManagingNeedsCampaign] = useState<{ id: number; title: string } | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: number; title: string } | null>(null);
  const [accountabilityCampaign, setAccountabilityCampaign] = useState<{ id: number; title: string } | null>(null);
  const [isPartnerOpen, setIsPartnerOpen] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: number; title: string } | null>(null);
  const [partnerToDelete, setPartnerToDelete] = useState<{ id: number; name: string } | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    description: "",
    longDescription: "",
    goal: "",
    vipApartmentAmount: "",
    helpTierOptions: DEFAULT_HELP_TIER_OPTIONS,
    initialRaised: "",
    imageUrl: "",
  });
  const [campaignNeedsDrafts, setCampaignNeedsDrafts] = useState<NewNeedDraft[]>([]);
  const [campaignModelType, setCampaignModelType] = useState<CampaignModelType>("custom");
  const [campaignEditForm, setCampaignEditForm] = useState(EMPTY_CAMPAIGN_EDIT_FORM);
  const [campaignUpdateForm, setCampaignUpdateForm] = useState(EMPTY_UPDATE_FORM);
  const [campaignNeedForm, setCampaignNeedForm] = useState(EMPTY_NEED_FORM);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER_FORM);
  const [cashValidationNotes, setCashValidationNotes] = useState<Record<number, string>>({});
  const [materialValidationNotes, setMaterialValidationNotes] = useState<Record<number, string>>({});
  const [validationCampaignFilter, setValidationCampaignFilter] = useState<string>("all");
  const [siteContentForm, setSiteContentForm] = useState(getSiteContent());
  const [campaignContentForm, setCampaignContentForm] = useState<{ [campaignId: number]: ReturnType<typeof getCampaignContent> }>({});

  const selectedValidationCampaignId = validationCampaignFilter === "all"
    ? undefined
    : Number.parseInt(validationCampaignFilter, 10);

  const registeredDonorsQuery = trpc.contributions.getRegisteredDonors.useQuery(undefined, { enabled: isAdmin });
  const [communityGenderFilter, setCommunityGenderFilter] = useState("all");
  const [communityCityFilter, setCommunityCityFilter] = useState("");
  const [communityAgeMin, setCommunityAgeMin] = useState("");
  const [communityAgeMax, setCommunityAgeMax] = useState("");

  const filteredCommunityDonors = (registeredDonorsQuery.data ?? []).filter((d) => {
    if (communityGenderFilter !== "all" && (d as { donorGender?: string }).donorGender !== communityGenderFilter) return false;
    if (communityCityFilter && !(d.donorCity ?? "").toLowerCase().includes(communityCityFilter.toLowerCase())) return false;
    if (communityAgeMin || communityAgeMax) {
      const birth = (d as { donorBirthDate?: string }).donorBirthDate;
      if (!birth) return false;
      const age = Math.floor((Date.now() - new Date(birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      if (communityAgeMin && age < Number(communityAgeMin)) return false;
      if (communityAgeMax && age > Number(communityAgeMax)) return false;
    }
    return true;
  });

  const campaignsQuery = trpc.campaigns.getAll.useQuery(undefined, { enabled: isAdmin });
  useEffect(() => {
    if (campaignsQuery.error) {
      toast.error(campaignsQuery.error.message || "Erro ao carregar campanhas");
    }
  }, [campaignsQuery.error]);
  const partnersQuery = trpc.partners.getAll.useQuery(undefined, { enabled: isAdmin });
  const pendingCashQuery = trpc.contributions.getPendingCashValidations.useQuery(
    selectedValidationCampaignId ? { campaignId: selectedValidationCampaignId } : undefined,
    { enabled: isAdmin },
  );
  const recentCashQuery = trpc.contributions.getRecentCashValidations.useQuery(
    selectedValidationCampaignId ? { campaignId: selectedValidationCampaignId, limit: 20 } : { limit: 20 },
    { enabled: isAdmin },
  );
  const pendingMaterialQuery = trpc.contributions.getPendingMaterialValidations.useQuery(
    selectedValidationCampaignId ? { campaignId: selectedValidationCampaignId } : undefined,
    { enabled: isAdmin },
  );
  const recentMaterialQuery = trpc.contributions.getRecentMaterialValidations.useQuery(
    selectedValidationCampaignId ? { campaignId: selectedValidationCampaignId, limit: 20 } : { limit: 20 },
    { enabled: isAdmin },
  );
  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: async () => {
      toast.success("Campanha criada com sucesso!");
      resetCreateCampaignForm();
      setIsCreateCampaignOpen(false);
      await invalidateCampaignData();
    },
    onError: (error) => toast.error(error.message || "Erro ao criar campanha"),
  });
  const updateCampaign = trpc.campaigns.update.useMutation({
    onSuccess: async () => {
      toast.success("Campanha atualizada com sucesso!");
      closeEditCampaignDialog();
      await invalidateCampaignData();
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar campanha"),
  });
  const publishCampaignUpdate = trpc.campaigns.createUpdate.useMutation({
    onSuccess: async () => {
      toast.success("Atualização publicada com sucesso!");
      closeCampaignUpdateDialog();
      await invalidateCampaignData();
    },
    onError: (error) => toast.error(error.message || "Erro ao publicar atualização"),
  });
  const createCampaignNeed = trpc.campaigns.createNeed.useMutation({
    onSuccess: async () => {
      toast.success("Necessidade cadastrada com sucesso!");
      closeCampaignNeedDialog();
      await invalidateCampaignData();
    },
    onError: (error) => toast.error(error.message || "Erro ao cadastrar necessidade"),
  });
  const updateNeed = trpc.campaigns.updateNeed.useMutation({
    onSuccess: async () => {
      toast.success("Item atualizado.");
      await invalidateCampaignData();
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar item"),
  });
  const deleteNeed = trpc.campaigns.deleteNeed.useMutation({
    onSuccess: async () => {
      toast.success("Item removido.");
      await invalidateCampaignData();
    },
    onError: (error) => toast.error(error.message || "Erro ao remover item"),
  });
  const deleteCampaign = trpc.campaigns.delete.useMutation({
    onSuccess: async () => {
      toast.success("Campanha removida com sucesso!");
      setCampaignToDelete(null);
      await invalidateCampaignData();
    },
    onError: (error) => toast.error(error.message || "Erro ao remover campanha"),
  });
  const createPartner = trpc.partners.create.useMutation({
    onSuccess: async () => {
      toast.success("Parceiro cadastrado com sucesso!");
      closePartnerDialog();
      await Promise.all([utils.partners.getAll.invalidate(), utils.partners.listPublished.invalidate()]);
    },
    onError: (error) => toast.error(error.message || "Erro ao cadastrar parceiro"),
  });
  const updatePartner = trpc.partners.update.useMutation({
    onSuccess: async () => {
      toast.success("Parceiro atualizado com sucesso!");
      closePartnerDialog();
      await Promise.all([utils.partners.getAll.invalidate(), utils.partners.listPublished.invalidate()]);
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar parceiro"),
  });
  const deletePartner = trpc.partners.delete.useMutation({
    onSuccess: async () => {
      toast.success("Parceiro removido com sucesso!");
      setPartnerToDelete(null);
      await Promise.all([utils.partners.getAll.invalidate(), utils.partners.listPublished.invalidate()]);
    },
    onError: (error) => toast.error(error.message || "Erro ao remover parceiro"),
  });
  const reviewCashContribution = trpc.contributions.reviewCashContribution.useMutation({
    onSuccess: async (result) => {
      toast.success(result.status === "approved" ? "Contribuição em dinheiro validada." : "Contribuição em dinheiro rejeitada.");
      setCashValidationNotes((current) => {
        const next = { ...current };
        delete next[result.contributionId];
        return next;
      });
      await Promise.all([
        pendingCashQuery.refetch(),
        recentCashQuery.refetch(),
        invalidateCampaignData(),
        utils.contributions.getPublicDonors.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message || "Erro ao revisar contribuição em dinheiro"),
  });
  const reviewMaterialContribution = trpc.contributions.reviewMaterialContribution.useMutation({
    onSuccess: async (result) => {
      toast.success(result.status === "approved" ? "Oferta de material aprovada." : "Oferta de material rejeitada.");
      setMaterialValidationNotes((current) => {
        const next = { ...current };
        delete next[result.contributionId];
        return next;
      });
      await Promise.all([
        pendingMaterialQuery.refetch(),
        recentMaterialQuery.refetch(),
        invalidateCampaignData(),
        utils.contributions.getPublicDonors.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message || "Erro ao revisar oferta de material"),
  });
  const uploadPartnerImage = trpc.partners.uploadImage.useMutation({
    onError: (error) => toast.error(error.message || "Erro ao enviar imagem"),
  });
  const uploadCampaignImage = trpc.campaigns.uploadImage.useMutation({
    onError: (error) => toast.error(error.message || "Erro ao enviar imagem da campanha"),
  });
  const uploadCampaignVideo = trpc.campaigns.uploadVideo.useMutation({
    onError: (error) => toast.error(error.message || "Erro ao enviar vídeo da campanha"),
  });
  const [uploadingPartnerField, setUploadingPartnerField] = useState<"logoUrl" | "storePhotoUrl" | "ownerPhotoUrl" | "testimonialVideoUrl" | null>(null);
  const [uploadingCampaignImage, setUploadingCampaignImage] = useState<"create" | "edit" | null>(null);
  const [campaignMediaYouTubeUrl, setCampaignMediaYouTubeUrl] = useState("");
  const [siteMediaYouTubeUrl, setSiteMediaYouTubeUrl] = useState("");
  const [partnerMediaYouTubeUrl, setPartnerMediaYouTubeUrl] = useState("");
  const [campaignContentMediaYouTubeUrls, setCampaignContentMediaYouTubeUrls] = useState<Record<number, { gallery: string; videos: string }>>({});
  const [campaignUpdateMediaYouTubeUrls, setCampaignUpdateMediaYouTubeUrls] = useState({ image: "", video: "" });
  const [vipMediaYouTubeUrls, setVipMediaYouTubeUrls] = useState({ image: "", video: "" });

  if (!user) return <DashboardLayout><div /></DashboardLayout>;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7f3] px-4">
        <Card className="max-w-md p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-600" aria-hidden="true" />
          <h1 className="mb-2 text-2xl font-bold text-[#2d2d2d]">Acesso negado</h1>
          <p className="mb-6 text-[#66736a]">Você não tem permissão para acessar esta área.</p>
          <Button asChild className="w-full"><Link href="/">Voltar para o site</Link></Button>
        </Card>
      </div>
    );
  }

  function closePartnerDialog() {
    setIsPartnerOpen(false);
    setEditingPartnerId(null);
    setPartnerForm(EMPTY_PARTNER_FORM);
  }

  async function invalidateCampaignData() {
    await Promise.all([
      utils.campaigns.getAll.invalidate(),
      utils.campaigns.listPublished.invalidate(),
      utils.campaigns.getPublicStats.invalidate(),
      utils.campaigns.getById.invalidate(),
      utils.campaigns.getUpdates.invalidate(),
      utils.campaigns.getNeeds.invalidate(),
    ]);
  }

  function openNewPartner() {
    setEditingPartnerId(null);
    setPartnerForm(EMPTY_PARTNER_FORM);
    setIsPartnerOpen(true);
  }

  function openEditPartner(partner: NonNullable<typeof partnersQuery.data>[number]) {
    setEditingPartnerId(partner.id);
    setPartnerForm({
      name: partner.name,
      type: partner.type,
      ownerName: partner.ownerName ?? "",
      description: partner.description ?? "",
      logoUrl: partner.logoUrl ?? "",
      storePhotoUrl: partner.storePhotoUrl ?? "",
      ownerPhotoUrl: partner.ownerPhotoUrl ?? "",
      address: partner.address ?? "",
      contactInfo: partner.contactInfo ?? "",
      testimonialVideoUrl: partner.testimonialVideoUrl ?? "",
      testimonialText: partner.testimonialText ?? "",
      website: partner.website ?? "",
    });
    setIsPartnerOpen(true);
  }

  function openEditCampaign(campaign: NonNullable<typeof campaignsQuery.data>[number]) {
    const vipImages = "vipMediaImages" in campaign && Array.isArray(campaign.vipMediaImages)
      ? campaign.vipMediaImages
      : [];
    const vipVideos = "vipMediaVideos" in campaign && Array.isArray(campaign.vipMediaVideos)
      ? campaign.vipMediaVideos
      : [];

    setEditingCampaignId(campaign.id);
    setCampaignEditForm({
      title: campaign.title,
      description: campaign.description,
      longDescription: campaign.longDescription ?? "",
      goal: String(campaign.goal / 100).replace(".", ","),
      vipApartmentAmount: String((("vipApartmentAmountCents" in campaign ? campaign.vipApartmentAmountCents : undefined) ?? 0) / 100).replace(".", ","),
      helpTierOptions: Array.isArray((campaign as { helpTierOptions?: unknown }).helpTierOptions)
        ? ((campaign as { helpTierOptions?: HelpTierOption[] }).helpTierOptions ?? DEFAULT_HELP_TIER_OPTIONS)
        : DEFAULT_HELP_TIER_OPTIONS,
      vipImageUrls: vipImages.join("\n"),
      vipVideoUrls: vipVideos.join("\n"),
      initialRaised: String((("initialRaised" in campaign ? campaign.initialRaised : undefined) ?? campaign.raised) / 100).replace(".", ","),
      imageUrl: campaign.imageUrl ?? "",
      status: campaign.status,
    });
    setIsEditCampaignOpen(true);
  }

  function closeEditCampaignDialog() {
    setIsEditCampaignOpen(false);
    setEditingCampaignId(null);
    setCampaignEditForm(EMPTY_CAMPAIGN_EDIT_FORM);
  }

  function openCampaignUpdate(campaign: NonNullable<typeof campaignsQuery.data>[number]) {
    setSelectedCampaign({ id: campaign.id, title: campaign.title });
    setCampaignUpdateForm(EMPTY_UPDATE_FORM);
    setIsCampaignUpdateOpen(true);
  }

  function closeCampaignUpdateDialog() {
    setIsCampaignUpdateOpen(false);
    setSelectedCampaign(null);
    setCampaignUpdateForm(EMPTY_UPDATE_FORM);
  }

  function openCampaignNeed(campaign: NonNullable<typeof campaignsQuery.data>[number]) {
    setSelectedCampaign({ id: campaign.id, title: campaign.title });
    setCampaignNeedForm(EMPTY_NEED_FORM);
    setIsCampaignNeedOpen(true);
  }

  function closeCampaignNeedDialog() {
    setIsCampaignNeedOpen(false);
    setSelectedCampaign(null);
    setCampaignNeedForm(EMPTY_NEED_FORM);
  }

  function resetCreateCampaignForm() {
    setCampaignForm({
      title: "",
      description: "",
      longDescription: "",
      goal: "",
      vipApartmentAmount: "",
      helpTierOptions: DEFAULT_HELP_TIER_OPTIONS,
      initialRaised: "",
      imageUrl: "",
    });
    setCampaignNeedsDrafts([]);
    setCampaignModelType("custom");
  }

  function applyCampaignNeedsTemplate(template: CampaignModelType) {
    if (template === "construction_hotel") {
      setCampaignNeedsDrafts(CONSTRUCTION_HOTEL_NEEDS_TEMPLATE.map((item) => ({ ...item })));
      setCampaignForm((current) => ({
        ...current,
        description: current.description.trim().length > 0 ? current.description : CONSTRUCTION_HOTEL_DESCRIPTION,
        longDescription: current.longDescription.trim().length > 0 ? current.longDescription : CONSTRUCTION_HOTEL_LONG_DESCRIPTION,
      }));
      setCampaignModelType("construction_hotel");
      toast.success("Modelo de construção aplicado com itens e descrições base do Hotel.");
      return;
    }

    setCampaignNeedsDrafts([]);
    setCampaignModelType("custom");
  }

  function handleCreateCampaign(event: React.FormEvent) {
    event.preventDefault();
    const goalInCents = parseCurrencyToCents(campaignForm.goal);
    if (goalInCents === null || goalInCents <= 0) {
      toast.error("Informe uma meta válida");
      return;
    }

    const initialRaisedInCents = parseCurrencyToCents(campaignForm.initialRaised);
    if (initialRaisedInCents === null || initialRaisedInCents < 0) {
      toast.error("Informe uma arrecadação inicial válida");
      return;
    }

    if (initialRaisedInCents > goalInCents) {
      toast.error("A arrecadação inicial não pode ser maior que a meta");
      return;
    }

    const vipApartmentAmountCents = parseCurrencyToCents(campaignForm.vipApartmentAmount);
    if (vipApartmentAmountCents === null || vipApartmentAmountCents < 0) {
      toast.error("Informe um valor VIP válido");
      return;
    }

    const resolvedImageUrl = resolveCampaignImageUrl(campaignForm.imageUrl, campaignForm.imageUrl);

    try {
      const parsedNeeds = campaignNeedsDrafts.map((need, index) => {
        const targetQuantityExact = Number.parseInt(need.targetQuantityExact, 10);
        const unitValueCents = parseCurrencyToCents(need.unitValue);

        if (!need.name.trim() || !need.quantity.trim()) {
          throw new Error(`Preencha manualmente item e quantidade no item ${index + 1}.`);
        }

        if (!Number.isInteger(targetQuantityExact) || targetQuantityExact <= 0) {
          throw new Error(`Meta exata inválida no item ${index + 1}.`);
        }

        if (unitValueCents === null || unitValueCents <= 0) {
          throw new Error(`Valor unitário inválido no item ${index + 1}.`);
        }

        return {
          type: need.type,
          name: need.name.trim(),
          description: need.description.trim() || undefined,
          quantity: need.quantity.trim(),
          targetQuantityExact,
          unitValueCents,
          priority: need.priority,
        };
      });

      createCampaign.mutate({
        title: campaignForm.title,
        description: campaignForm.description,
        longDescription: campaignForm.longDescription,
        goal: goalInCents,
        vipApartmentAmountCents,
        helpTierOptions: campaignForm.helpTierOptions.length > 0 ? campaignForm.helpTierOptions : DEFAULT_HELP_TIER_OPTIONS,
        initialRaised: initialRaisedInCents,
        imageUrl: resolvedImageUrl,
        needs: parsedNeeds,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revise os itens da campanha.");
    }
  }

  function handleUpdateCampaign(event: React.FormEvent) {
    event.preventDefault();
    if (!editingCampaignId) return;
    const goalInCents = parseCurrencyToCents(campaignEditForm.goal);
    if (goalInCents === null || goalInCents <= 0) {
      toast.error("Informe uma meta válida");
      return;
    }

    const initialRaisedInCents = parseCurrencyToCents(campaignEditForm.initialRaised);
    if (initialRaisedInCents === null || initialRaisedInCents < 0) {
      toast.error("Informe uma arrecadação inicial válida");
      return;
    }

    if (initialRaisedInCents > goalInCents) {
      toast.error("A arrecadação inicial não pode ser maior que a meta");
      return;
    }

    const vipApartmentAmountCents = parseCurrencyToCents(campaignEditForm.vipApartmentAmount);
    if (vipApartmentAmountCents === null || vipApartmentAmountCents < 0) {
      toast.error("Informe um valor VIP válido");
      return;
    }

    const vipImagesParsed = parseVipMediaUrlsInput(campaignEditForm.vipImageUrls);
    if (vipImagesParsed.invalid.length > 0) {
      toast.error(`URL inválida em Imagens VIP: ${vipImagesParsed.invalid[0]}`);
      return;
    }

    const vipVideosParsed = parseVipMediaUrlsInput(campaignEditForm.vipVideoUrls);
    if (vipVideosParsed.invalid.length > 0) {
      toast.error(`URL inválida em Vídeos VIP: ${vipVideosParsed.invalid[0]}`);
      return;
    }

    const vipImageUrls = vipImagesParsed.values;
    const vipVideoUrls = vipVideosParsed.values;
    const resolvedImageUrl = resolveCampaignImageUrl(campaignEditForm.imageUrl, campaignEditForm.imageUrl);

    updateCampaign.mutate({
      id: editingCampaignId,
      title: campaignEditForm.title,
      description: campaignEditForm.description,
      longDescription: campaignEditForm.longDescription,
      goal: goalInCents,
      vipApartmentAmountCents,
      helpTierOptions: campaignEditForm.helpTierOptions.length > 0 ? campaignEditForm.helpTierOptions : DEFAULT_HELP_TIER_OPTIONS,
      vipImageUrls,
      vipVideoUrls,
      initialRaised: initialRaisedInCents,
      imageUrl: resolvedImageUrl || null,
      status: campaignEditForm.status,
    });
  }

  function handlePublishCampaignUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCampaign) return;
    publishCampaignUpdate.mutate({
      campaignId: selectedCampaign.id,
      title: campaignUpdateForm.title,
      description: campaignUpdateForm.description,
      phase: campaignUpdateForm.phase,
      imageUrls: parseMediaUrlsInput(campaignUpdateForm.imageUrls),
      videoUrls: parseMediaUrlsInput(campaignUpdateForm.videoUrls),
    });
  }

  async function handleCreateCampaignNeed(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCampaign) return;

    const targetQuantityExact = Number.parseInt(campaignNeedForm.targetQuantityExact, 10);
    if (!Number.isInteger(targetQuantityExact) || targetQuantityExact <= 0) {
      toast.error("Informe uma meta exata válida (número inteiro maior que zero)");
      return;
    }

    const unitValueCents = parseCurrencyToCents(campaignNeedForm.unitValue);
    if (unitValueCents === null || unitValueCents <= 0) {
      toast.error("Informe um valor unitário válido");
      return;
    }

    if (!campaignNeedForm.quantity.trim()) {
      toast.error("Preencha manualmente a quantidade textual do item");
      return;
    }

    try {
      await createCampaignNeed.mutateAsync({
        campaignId: selectedCampaign.id,
        type: campaignNeedForm.type,
        name: campaignNeedForm.name,
        description: campaignNeedForm.description || undefined,
        quantity: campaignNeedForm.quantity.trim(),
        targetQuantityExact,
        unitValueCents,
        priority: campaignNeedForm.priority,
      });

      clearLocalNeedsForCampaign(selectedCampaign.id);
      toast.success(isLocalhost ? "Necessidade sincronizada no modo local." : "Necessidade cadastrada com sucesso!");
      closeCampaignNeedDialog();
      await invalidateCampaignData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("database not available")) {
        saveLocalNeed({
          campaignId: selectedCampaign.id,
          type: campaignNeedForm.type,
          name: campaignNeedForm.name.trim(),
          description: campaignNeedForm.description.trim() || undefined,
          quantity: campaignNeedForm.quantity.trim(),
          targetQuantityExact,
          unitValueCents,
          priority: campaignNeedForm.priority,
        });
        toast.success("Necessidade cadastrada no modo local.");
        closeCampaignNeedDialog();
        return;
      }

      toast.error(message || "Erro ao cadastrar necessidade");
    }
  }

  async function handleCreateNeed(campaignId: number, payload: {
    name: string;
    description?: string;
    quantity: string;
    targetQuantityExact: number;
    unitValueCents: number;
    type: "material" | "labor" | "equipment" | "other";
    priority: "high" | "medium" | "low";
  }) {
    await createCampaignNeed.mutateAsync({
      campaignId,
      type: payload.type,
      name: payload.name,
      description: payload.description,
      quantity: payload.quantity,
      targetQuantityExact: payload.targetQuantityExact,
      unitValueCents: payload.unitValueCents,
      priority: payload.priority,
    });

    clearLocalNeedsForCampaign(campaignId);

    if (isLocalhost) {
      toast.success("Item sincronizado no modo local.");
      await invalidateCampaignData();
    }
  }

  async function handleDeleteNeed(needId: number, campaignId: number) {
    if (isLocalhost) {
      await deleteNeed.mutateAsync({ needId, campaignId });
      removeLocalNeed(campaignId, needId);
      clearLocalNeedsForCampaign(campaignId);
      toast.success("Item removido no modo local.");
      await invalidateCampaignData();
      return;
    }

    await deleteNeed.mutateAsync({ needId, campaignId });
  }

  async function handleUpdateNeed(needId: number, campaignId: number, updates: {
    name: string;
    description?: string;
    quantity: string;
    targetQuantityExact: number;
    unitValueCents: number;
    type: "material" | "labor" | "equipment" | "other";
    priority: "high" | "medium" | "low";
  }) {
    await updateNeed.mutateAsync({
      needId,
      campaignId,
      name: updates.name,
      description: updates.description,
      quantity: updates.quantity,
      targetQuantityExact: updates.targetQuantityExact,
      unitValueCents: updates.unitValueCents,
      type: updates.type,
      priority: updates.priority,
    });

    if (isLocalhost) {
      updateLocalNeed({
        id: needId,
        campaignId,
        type: updates.type,
        name: updates.name,
        description: updates.description?.trim() || undefined,
        quantity: updates.quantity,
        targetQuantityExact: updates.targetQuantityExact,
        unitValueCents: updates.unitValueCents,
        priority: updates.priority,
      });
      clearLocalNeedsForCampaign(campaignId);
      toast.success("Item atualizado no modo local.");
      await invalidateCampaignData();
    }
  }

  function handleSaveSiteContent(event: React.FormEvent) {
    event.preventDefault();
    saveSiteContent(siteContentForm);
    toast.success("Ajustes do painel foram aplicados no site público.");
  }

  function handleSaveCampaignContent(event: React.FormEvent, campaignId: number) {
    event.preventDefault();
    const current = campaignContentForm[campaignId] ?? getCampaignContent(campaignId);
    saveCampaignContent(campaignId, current);
    toast.success("Ajustes do painel foram aplicados na campanha pública.");
  }

  function handleSavePartner(event: React.FormEvent) {
    event.preventDefault();
    const values = {
      name: partnerForm.name,
      type: partnerForm.type,
      ownerName: partnerForm.ownerName || undefined,
      description: partnerForm.description || undefined,
      logoUrl: partnerForm.logoUrl || undefined,
      storePhotoUrl: partnerForm.storePhotoUrl || undefined,
      ownerPhotoUrl: partnerForm.ownerPhotoUrl || undefined,
      address: partnerForm.address || undefined,
      contactInfo: partnerForm.contactInfo || undefined,
      testimonialVideoUrl: partnerForm.testimonialVideoUrl || undefined,
      testimonialText: partnerForm.testimonialText || undefined,
      website: partnerForm.website || undefined,
    };
    if (editingPartnerId) updatePartner.mutate({ id: editingPartnerId, ...values });
    else createPartner.mutate(values);
  }

  async function handlePartnerImageUpload(field: "logoUrl" | "storePhotoUrl" | "ownerPhotoUrl", file?: File) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }

    setUploadingPartnerField(field);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadPartnerImage.mutateAsync({
        fileName: file.name,
        mimeType: (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") ? file.type : "image/png",
        size: file.size,
        base64,
      });
      setPartnerForm((current) => ({ ...current, [field]: result.url }));
      toast.success("Imagem enviada com sucesso.");
    } finally {
      setUploadingPartnerField(null);
    }
  }

  async function handlePartnerVideoUpload(file?: File) {
    if (!file) return;

    const mimeType = inferSupportedVideoMimeType(file);
    if (!mimeType) {
      toast.error("Selecione um vídeo válido (.mp4, .mov, .webm ou .ogg).");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("O vídeo deve ter no máximo 100MB.");
      return;
    }

    setUploadingPartnerField("testimonialVideoUrl");
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadCampaignVideo.mutateAsync({
        fileName: file.name,
        mimeType,
        size: file.size,
        base64,
      });
      setPartnerForm((current) => ({ ...current, testimonialVideoUrl: result.url }));
      toast.success("Vídeo do parceiro enviado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar vídeo do parceiro.");
    } finally {
      setUploadingPartnerField(null);
    }
  }

  async function handleCampaignImageUpload(target: "create" | "edit", file?: File) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido.");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast.error("A imagem é grande demais. Tente uma foto menor.");
      return;
    }

    setUploadingCampaignImage(target);
    try {
      const preparedFile = await prepareImageForUpload(file);
      const base64 = await fileToBase64(preparedFile);
      const result = await uploadCampaignImage.mutateAsync({
        fileName: preparedFile.name,
        mimeType: (preparedFile.type === "image/jpeg" || preparedFile.type === "image/png" || preparedFile.type === "image/webp") ? preparedFile.type : "image/png",
        size: preparedFile.size,
        base64,
      });

      if (target === "create") {
        setCampaignForm((current) => ({ ...current, imageUrl: result.url }));
      } else {
        setCampaignEditForm((current) => ({ ...current, imageUrl: result.url }));
      }

      toast.success("Imagem enviada. Você pode salvar ou colar uma URL/YouTube se preferir.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem. Tente uma imagem menor.");
    } finally {
      setUploadingCampaignImage(null);
    }
  }

  async function uploadCampaignMediaFile(file: File) {
    if (file.type.startsWith("image/")) {
      const preparedFile = await prepareImageForUpload(file);
      const base64 = await fileToBase64(preparedFile);
      const result = await uploadCampaignImage.mutateAsync({
        fileName: preparedFile.name,
        mimeType: (preparedFile.type === "image/jpeg" || preparedFile.type === "image/png" || preparedFile.type === "image/webp") ? preparedFile.type : "image/png",
        size: preparedFile.size,
        base64,
      });
      return result.url;
    }

    const mimeType = inferSupportedVideoMimeType(file);
    if (mimeType) {
      if (file.size > 100 * 1024 * 1024) {
        throw new Error("O vídeo deve ter no máximo 100MB.");
      }

      const base64 = await fileToBase64(file);
      const result = await uploadCampaignVideo.mutateAsync({
        fileName: file.name,
        mimeType,
        size: file.size,
        base64,
      });
      return result.url;
    }

    throw new Error("Selecione apenas arquivos de imagem ou vídeos (.mp4, .mov, .webm, .ogg).");
  }

  async function handleCampaignContentMediaUpload(campaignId: number, kind: "gallery" | "videos", files?: FileList | null) {
    if (!files?.length) return;

    try {
      const entries: string[] = [];
      for (const file of Array.from(files)) {
        entries.push(await uploadCampaignMediaFile(file));
      }

      setCampaignContentForm((current) => {
        const base = current[campaignId] ?? getCampaignContent(campaignId);
        return {
          ...current,
          [campaignId]: {
            ...base,
            ...(kind === "gallery"
              ? { galleryImageUrls: appendMediaValues(base.galleryImageUrls, entries) }
              : { videoUrls: appendMediaValues(base.videoUrls, entries) }),
          },
        };
      });

      toast.success(kind === "gallery" ? "Arquivos da galeria adicionados." : "Vídeos adicionados à campanha.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a mídia.");
    }
  }

  async function handleSitePresentationVideoUpload(file?: File) {
    if (!file) return;

    const mimeType = inferSupportedVideoMimeType(file);
    if (!mimeType) {
      toast.error("Selecione um vídeo válido (.mp4, .mov, .webm ou .ogg).");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("O vídeo deve ter no máximo 100MB.");
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      const result = await uploadCampaignVideo.mutateAsync({
        fileName: file.name,
        mimeType,
        size: file.size,
        base64,
      });

      setSiteContentForm((current) => {
        const next = { ...current, presentationVideoUrl: result.url };
        saveSiteContent(next);
        return next;
      });
      toast.success("Vídeo de apresentação enviado e salvo com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o vídeo.");
    }
  }

  async function handleCampaignUpdateMediaUpload(kind: "image" | "video", files?: FileList | null) {
    if (!files?.length) return;

    try {
      const entries: string[] = [];
      for (const file of Array.from(files)) {
        entries.push(await uploadCampaignMediaFile(file));
      }

      setCampaignUpdateForm((current) => ({
        ...current,
        [kind === "image" ? "imageUrls" : "videoUrls"]: appendMediaValues(parseMediaUrlsInput(current[kind === "image" ? "imageUrls" : "videoUrls"]), entries).join("\n"),
      }));

      toast.success(kind === "image" ? "Imagens adicionadas à atualização." : "Vídeos adicionados à atualização.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a mídia.");
    }
  }

  async function handleVipMediaUpload(kind: "image" | "video", files?: FileList | null) {
    if (!files?.length) return;

    try {
      const entries: string[] = [];
      for (const file of Array.from(files)) {
        entries.push(await uploadCampaignMediaFile(file));
      }

      setCampaignEditForm((current) => ({
        ...current,
        [kind === "image" ? "vipImageUrls" : "vipVideoUrls"]: appendMediaValues(parseMediaUrlsInput(current[kind === "image" ? "vipImageUrls" : "vipVideoUrls"]), entries).join("\n"),
      }));

      toast.success(kind === "image" ? "Imagens VIP adicionadas." : "Vídeos VIP adicionados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a mídia.");
    }
  }

  const partnerMutationPending = createPartner.isPending || updatePartner.isPending;
  const primaryCampaign = campaignsQuery.data?.[0] ?? null;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl py-4 md:py-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">Administração</p>
          <h1 className="mt-2 text-3xl font-bold text-[#243128] md:text-4xl">Gestão da plataforma</h1>
          <p className="mt-2 text-[#66736a]">Gerencie campanhas e os parceiros exibidos publicamente.</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "campaigns" | "partners" | "community")} className="space-y-7">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-[#eaf1e8] p-1 sm:w-auto">
            <TabsTrigger value="campaigns" className="min-h-11 gap-2 px-5"><Building2 className="h-4 w-4" /> Campanhas</TabsTrigger>
            <TabsTrigger value="partners" className="min-h-11 gap-2 px-5"><Handshake className="h-4 w-4" /> Parceiros</TabsTrigger>
            <TabsTrigger value="community" className="min-h-11 gap-2 px-5"><Users className="h-4 w-4" /> Comunidade</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-6">
            {isLocalhost && (
              <Card className="border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  Você está no painel local (localhost). Se o banco estiver indisponível, validação de dinheiro e dados publicados do site podem não carregar aqui.
                  Para operação real e efeito no www, use o painel em produção.
                </p>
              </Card>
            )}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><h2 className="text-2xl font-bold text-[#243128]">Campanhas</h2><p className="mt-1 text-[#66736a]">Acompanhe os projetos cadastrados.</p></div>
              <Dialog open={isCreateCampaignOpen} onOpenChange={(open) => {
                setIsCreateCampaignOpen(open);
                resetCreateCampaignForm();
              }}>
                <DialogTrigger asChild><Button className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]"><Plus className="h-4 w-4" /> Nova campanha</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Criar nova campanha</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreateCampaign} className="space-y-4">
                    <Field label="Modelo da campanha">
                      <Select
                        value={campaignModelType}
                        onValueChange={(value: CampaignModelType) => applyCampaignNeedsTemplate(value)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Outro (personalizada)</SelectItem>
                          <SelectItem value="construction_hotel">Construção (igual Hotel Recanto)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-[#66736a]">Use o modelo de construção quando a nova campanha seguir o mesmo formato de doação por materiais da obra do hotel.</p>
                    </Field>
                    <Field label="Título *"><Input value={campaignForm.title} onChange={(event) => setCampaignForm({ ...campaignForm, title: event.target.value })} required minLength={5} /></Field>
                    <Field label="Descrição curta *"><Textarea value={campaignForm.description} onChange={(event) => setCampaignForm({ ...campaignForm, description: event.target.value })} required minLength={20} rows={2} /></Field>
                    <Field label="Descrição longa *"><Textarea value={campaignForm.longDescription} onChange={(event) => setCampaignForm({ ...campaignForm, longDescription: event.target.value })} required minLength={50} rows={5} /></Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Meta (R$) *"><Input inputMode="decimal" value={campaignForm.goal} onChange={(event) => setCampaignForm({ ...campaignForm, goal: event.target.value })} required placeholder="Ex.: 50.000,00" /></Field>
                      <Field label="Arrecadação inicial (R$)"><Input inputMode="decimal" value={campaignForm.initialRaised} onChange={(event) => setCampaignForm({ ...campaignForm, initialRaised: event.target.value })} placeholder="Ex.: 12.350,90" /></Field>
                    </div>
                    <Field label="Valor VIP apartamento (R$) (opcional)"><Input inputMode="decimal" value={campaignForm.vipApartmentAmount} onChange={(event) => setCampaignForm({ ...campaignForm, vipApartmentAmount: event.target.value })} placeholder="Ex.: 120.000,00" /></Field>
                    <Field label="Opções de ajuda públicas">
                      <div className="grid gap-3 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3 sm:grid-cols-3">
                        {(["material", "financial", "vip"] as HelpTierOption[]).map((option) => {
                          const label = option === "material" ? "Materiais" : option === "financial" ? "Dinheiro" : "VIP";
                          const checked = campaignForm.helpTierOptions.includes(option);
                          return (
                            <label key={option} className="flex items-center gap-2 rounded-md border border-[#dce5d8] bg-white px-3 py-2 text-sm font-medium text-[#334139]">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => {
                                  const next = value ? [...campaignForm.helpTierOptions, option] : campaignForm.helpTierOptions.filter((item) => item !== option);
                                  setCampaignForm({ ...campaignForm, helpTierOptions: next });
                                }}
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-xs text-[#66736a]">Marque quais páginas de ajuda devem aparecer para a campanha no público.</p>
                    </Field>
                    <Field label="Imagem da campanha">
                      <Input
                        value={campaignForm.imageUrl}
                        onChange={(event) => setCampaignForm({ ...campaignForm, imageUrl: event.target.value })}
                        placeholder="URL da imagem (opcional)"
                      />
                      <div className="mt-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                        <div className="mt-2 space-y-2">
                          <div>
                            <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                            <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleCampaignImageUpload("create", event.target.files?.[0])} />
                            <p className="mt-1 text-[11px] text-[#889284]">JPG, PNG ou WEBP. Ideal: 1920×1080px (paisagem). Fotos maiores são reduzidas automaticamente.</p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                            <Input value={campaignMediaYouTubeUrl} onChange={(event) => { setCampaignMediaYouTubeUrl(event.target.value); if (event.target.value.trim()) { setCampaignForm((current) => ({ ...current, imageUrl: event.target.value.trim() })); } }} placeholder="https://www.youtube.com/watch?v=..." />
                          </div>
                        </div>
                      </div>
                      {uploadingCampaignImage === "create" && <p className="text-xs text-[#66736a]">Enviando imagem...</p>}
                      {campaignForm.imageUrl && <p className="text-xs text-[#228B22] break-all">Imagem pronta: {campaignForm.imageUrl.startsWith("data:") ? "arquivo carregado" : campaignForm.imageUrl}</p>}
                      <p className="mt-1 text-xs text-[#66736a]">Use URL direta, arquivo local do seu computador ou YouTube. Para vídeo, também vale o mesmo fluxo.</p>
                    </Field>

                    <div className="rounded-lg border border-[#dce5d8] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#334139]">Novo item / Criar item</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCampaignNeedsDrafts((current) => [...current, createEmptyNeedDraft()])}
                        >
                          + Novo item
                        </Button>
                      </div>

                      {campaignNeedsDrafts.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#d7dfd4] bg-[#f8fbf6] p-3 text-sm text-[#66736a]">
                          <p className="font-semibold text-[#334139]">Adicione os itens agora na criação da campanha.</p>
                          <p className="mt-1">Preencha o nome, a meta exata, o valor unitário e a quantidade textual. Isso define a meta real do item para o público.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {campaignNeedsDrafts.map((need, index) => (
                            <div key={`create-need-${index}`} className="rounded-md border border-[#e5ece2] p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-semibold text-[#334139]">Item {index + 1}</p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-700"
                                  onClick={() => setCampaignNeedsDrafts((current) => current.filter((_, i) => i !== index))}
                                >
                                  Remover
                                </Button>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="ITEM *">
                                  <Input
                                    value={need.name}
                                    onChange={(event) => setCampaignNeedsDrafts((current) => current.map((row, i) => i === index ? { ...row, name: event.target.value } : row))}
                                    placeholder="Ex.: TIJOLO CERÂMICO"
                                  />
                                </Field>
                                <Field label="QUANTIDADE TEXTUAL *">
                                  <Input
                                    value={need.quantity}
                                    onChange={(event) => setCampaignNeedsDrafts((current) => current.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))}
                                    placeholder="Ex.: 3.700 unidades"
                                  />
                                  <p className="text-xs text-[#66736a]">Texto exibido para o público, como "3.700 unidades".</p>
                                </Field>
                                <Field label="META EXATA (unidades) *">
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={need.targetQuantityExact}
                                    onChange={(event) => setCampaignNeedsDrafts((current) => current.map((row, i) => i === index ? { ...row, targetQuantityExact: event.target.value } : row))}
                                    placeholder="Ex.: 3700"
                                  />
                                  <p className="text-xs text-[#66736a]">Meta real do item, usada para calcular o progresso da campanha.</p>
                                </Field>
                                <Field label="VALOR UNITÁRIO (R$) *">
                                  <Input
                                    inputMode="decimal"
                                    value={need.unitValue}
                                    onChange={(event) => setCampaignNeedsDrafts((current) => current.map((row, i) => i === index ? { ...row, unitValue: event.target.value } : row))}
                                    placeholder="Ex.: 1,80"
                                  />
                                </Field>
                                <Field label="Tipo">
                                  <Select
                                    value={need.type}
                                    onValueChange={(type: NewNeedDraft["type"]) => setCampaignNeedsDrafts((current) => current.map((row, i) => i === index ? { ...row, type } : row))}
                                  >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="material">Material</SelectItem>
                                      <SelectItem value="labor">Mão de obra</SelectItem>
                                      <SelectItem value="equipment">Equipamento</SelectItem>
                                      <SelectItem value="other">Outro</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </Field>
                                <Field label="Prioridade">
                                  <Select
                                    value={need.priority}
                                    onValueChange={(priority: NewNeedDraft["priority"]) => setCampaignNeedsDrafts((current) => current.map((row, i) => i === index ? { ...row, priority } : row))}
                                  >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="high">Alta</SelectItem>
                                      <SelectItem value="medium">Média</SelectItem>
                                      <SelectItem value="low">Baixa</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </Field>
                              </div>
                              <Field label="Descrição (opcional)">
                                <Textarea
                                  rows={2}
                                  value={need.description}
                                  onChange={(event) => setCampaignNeedsDrafts((current) => current.map((row, i) => i === index ? { ...row, description: event.target.value } : row))}
                                  placeholder="Detalhes do item"
                                />
                              </Field>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={() => setIsCreateCampaignOpen(false)}>Cancelar</Button><Button type="submit" disabled={createCampaign.isPending}>{createCampaign.isPending ? "Criando..." : "Criar campanha"}</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="border-[#d7dfd4] bg-[#f8fbf6] p-5 md:p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <h3 className="text-lg font-bold text-[#243128]">Edição rápida da campanha</h3>
                  {campaignsQuery.isLoading ? (
                    <p className="mt-1 text-sm text-[#66736a]">Carregando campanha para edição...</p>
                  ) : primaryCampaign ? (
                    <p className="mt-1 text-sm text-[#66736a]">
                      Campanha atual: <span className="font-semibold text-[#243128]">{primaryCampaign.title}</span>. Use o atalho para editar meta e arrecadação inicial agora.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-[#66736a]">Nenhuma campanha disponível. Clique em Nova campanha para iniciar.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => primaryCampaign && openEditCampaign(primaryCampaign)}
                    disabled={!primaryCampaign || campaignsQuery.isLoading}
                  >
                    <Edit2 className="h-4 w-4" /> Editar meta e arrecadação
                  </Button>
                  <Button
                    type="button"
                    className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]"
                    onClick={() => setIsCreateCampaignOpen(true)}
                  >
                    <Plus className="h-4 w-4" /> Nova campanha
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-5 md:p-6">
              <div className="mb-4 rounded-lg border border-[#e1e6df] bg-[#f8fbf6] p-4">
                <h3 className="text-lg font-bold text-[#243128]">Conteúdo manual do site</h3>
                <p className="mt-1 text-sm text-[#66736a]">Edite título, subtítulo, imagem principal e vídeo de apresentação sem depender da IA.</p>
                <p className="mt-2 text-xs font-semibold text-[#70571a]">Se quiser trocar o vídeo de teste, é este campo de vídeo de apresentação da home. Não é o vídeo VIP da campanha.</p>
                <form onSubmit={handleSaveSiteContent} className="mt-4 space-y-4">
                  <Field label="Título principal"><Input value={siteContentForm.heroTitle} onChange={(event) => setSiteContentForm({ ...siteContentForm, heroTitle: event.target.value })} /></Field>
                  <Field label="Subtítulo principal"><Textarea value={siteContentForm.heroSubtitle} onChange={(event) => setSiteContentForm({ ...siteContentForm, heroSubtitle: event.target.value })} rows={3} /></Field>
                  <Field label="Imagem da home (URL direta ou caminho local)"><Input value={siteContentForm.heroImageUrl} onChange={(event) => setSiteContentForm({ ...siteContentForm, heroImageUrl: event.target.value })} placeholder="https://... ou /caminho/arquivo.jpg" /></Field>
                  <Field label="Título da seção de vídeo"><Input value={siteContentForm.presentationTitle} onChange={(event) => setSiteContentForm({ ...siteContentForm, presentationTitle: event.target.value })} /></Field>
                  <Field label="Descrição da seção de vídeo"><Textarea value={siteContentForm.presentationDescription} onChange={(event) => setSiteContentForm({ ...siteContentForm, presentationDescription: event.target.value })} rows={3} /></Field>
                  <Field label="Vídeo de apresentação da home (trocar o vídeo de teste)">
                    <Input
                      value={siteContentForm.presentationVideoUrl}
                      onChange={(event) => setSiteContentForm({ ...siteContentForm, presentationVideoUrl: event.target.value })}
                      placeholder="https://www.youtube.com/watch?v=... ou /video.mp4"
                    />
                    <div className="mt-2 rounded-lg border border-[#dce5d8] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Ou enviar arquivo do computador</p>
                      <Input
                        className="mt-2"
                        type="file"
                        accept="video/mp4,video/webm,video/ogg,video/quicktime"
                        onChange={(event) => void handleSitePresentationVideoUpload(event.target.files?.[0])}
                      />
                    </div>
                  </Field>
                  <div className="flex justify-end"><Button type="submit">Salvar conteúdo</Button></div>
                </form>
              </div>

              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[#e1e6df] bg-[#f8fbf6] p-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-[#243128]">Filtro de validação</h3>
                  <p className="mt-1 text-sm text-[#66736a]">Selecione uma campanha para focar nas ofertas e validações daquele projeto.</p>
                </div>
                <div className="w-full sm:w-[320px]">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[#546459]">Campanha</label>
                  <Select value={validationCampaignFilter} onValueChange={setValidationCampaignFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as campanhas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as campanhas</SelectItem>
                      {(campaignsQuery.data ?? []).map((campaign) => (
                        <SelectItem key={`validation-filter-${campaign.id}`} value={String(campaign.id)}>{campaign.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#243128]">Validação presencial de dinheiro</h3>
                  <p className="text-sm text-[#66736a]">Contribuições em dinheiro só entram no total após validação manual de recebimento.</p>
                </div>
                <Badge variant="secondary">
                  {pendingCashQuery.data?.length ?? 0} pendente(s)
                </Badge>
              </div>

              {pendingCashQuery.isLoading ? (
                <p className="text-sm text-[#66736a]">Carregando pendências...</p>
              ) : pendingCashQuery.isError ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-[#b42318]">
                    Não foi possível carregar as pendências de validação.
                    {pendingCashQuery.error?.message ? ` Motivo: ${pendingCashQuery.error.message}` : ""}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => pendingCashQuery.refetch()}>Tentar novamente</Button>
                </div>
              ) : pendingCashQuery.data?.length ? (
                <div className="space-y-3">
                  {pendingCashQuery.data.map((item) => (
                    <div key={item.id} className="rounded-lg border border-[#e1e6df] p-4">
                      <div className="grid gap-2 text-sm text-[#4e5c53] sm:grid-cols-2 lg:grid-cols-4">
                        <p><span className="font-semibold text-[#243128]">Contribuição:</span> #{item.id}</p>
                        <p><span className="font-semibold text-[#243128]">Campanha:</span> #{item.campaignId}</p>
                        <p><span className="font-semibold text-[#243128]">Doador:</span> {item.donorName || "Não informado"}</p>
                        <p><span className="font-semibold text-[#243128]">Valor:</span> {formatCurrency(item.amount ?? 0)}</p>
                      </div>
                      <div className="mt-1 grid gap-2 text-sm text-[#4e5c53] sm:grid-cols-2">
                        <p><span className="font-semibold text-[#243128]">WhatsApp:</span> {item.donorWhatsapp || "Não informado"}</p>
                        <p><span className="font-semibold text-[#243128]">Cidade:</span> {item.donorCity || "Não informada"}</p>
                      </div>
                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[#546459]">Observação da validação (opcional)</label>
                        <Textarea
                          rows={2}
                          maxLength={500}
                          placeholder="Ex.: Confirmado presencialmente no bazar de domingo."
                          value={cashValidationNotes[item.id] ?? ""}
                          onChange={(event) => setCashValidationNotes((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]"
                          disabled={reviewCashContribution.isPending}
                          onClick={() => reviewCashContribution.mutate({
                            contributionId: item.id,
                            decision: "approve",
                            validationNote: cashValidationNotes[item.id]?.trim() || undefined,
                          })}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Confirmar recebimento
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 border-red-300 text-red-700 hover:text-red-800"
                          disabled={reviewCashContribution.isPending}
                          onClick={() => reviewCashContribution.mutate({
                            contributionId: item.id,
                            decision: "reject",
                            validationNote: cashValidationNotes[item.id]?.trim() || undefined,
                          })}
                        >
                          <XCircle className="h-4 w-4" /> Rejeitar validação
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#66736a]">Sem pendências de validação presencial no momento.</p>
              )}

              <div className="mt-6 border-t border-[#e1e6df] pt-5">
                <h4 className="text-sm font-bold text-[#243128]">Histórico recente de validações presenciais</h4>
                <p className="mt-1 text-xs text-[#66736a]">Auditoria de quem validou/rejeitou contribuições em dinheiro e quando.</p>
                {recentCashQuery.isLoading ? (
                  <p className="mt-3 text-sm text-[#66736a]">Carregando histórico...</p>
                ) : recentCashQuery.isError ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <p className="text-sm text-[#b42318]">
                      Não foi possível carregar o histórico de validações.
                      {recentCashQuery.error?.message ? ` Motivo: ${recentCashQuery.error.message}` : ""}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => recentCashQuery.refetch()}>Tentar novamente</Button>
                  </div>
                ) : recentCashQuery.data?.length ? (
                  <div className="mt-3 space-y-2">
                    {recentCashQuery.data.map((item) => {
                      const isApproved = item.paymentStatusDetail === "cash_validated_in_person";
                      const validator = item.validatorName || item.validatorEmail || (item.validatedBy ? `Usuário #${item.validatedBy}` : "Não identificado");
                      const when = item.validatedAt ? new Date(item.validatedAt).toLocaleString("pt-BR") : "Data não informada";
                      return (
                        <div key={`cash-validation-${item.id}`} className="rounded-lg bg-[#f5f8f3] p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-[#243128]">Contribuição #{item.id} · Campanha #{item.campaignId}</p>
                            <Badge variant={isApproved ? "default" : "secondary"} className={isApproved ? "bg-[#228B22]" : "bg-red-100 text-red-700"}>
                              {isApproved ? "Aprovada" : "Rejeitada"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[#4e5c53]">Valor: {formatCurrency(item.amount ?? 0)} · Doador: {item.donorName || "Não informado"}</p>
                          <p className="mt-1 text-[#4e5c53]">Validado por: {validator} · Em: {when}</p>
                          {item.validationNote && <p className="mt-1 text-[#4e5c53]">Observação: {item.validationNote}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#66736a]">Nenhuma validação presencial auditada ainda.</p>
                )}
              </div>
            </Card>

            <Card className="p-5 md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#243128]">Validação de ofertas de material</h3>
                  <p className="text-sm text-[#66736a]">As ofertas de material só entram no progresso das necessidades após aprovação da equipe.</p>
                </div>
                <Badge variant="secondary">
                  {pendingMaterialQuery.data?.length ?? 0} pendente(s)
                </Badge>
              </div>

              {pendingMaterialQuery.isLoading ? (
                <p className="text-sm text-[#66736a]">Carregando pendências...</p>
              ) : pendingMaterialQuery.isError ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-[#b42318]">
                    Não foi possível carregar as pendências de material.
                    {pendingMaterialQuery.error?.message ? ` Motivo: ${pendingMaterialQuery.error.message}` : ""}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => pendingMaterialQuery.refetch()}>Tentar novamente</Button>
                </div>
              ) : pendingMaterialQuery.data?.length ? (
                <div className="space-y-3">
                  {pendingMaterialQuery.data.map((item) => {
                    const quantityLabel = Number.isInteger(item.quantityExact) && (item.quantityExact ?? 0) > 0
                      ? `${item.quantityExact} unidade(s)`
                      : (item.quantity || item.description || "Não informado");

                    return (
                      <div key={item.id} className="rounded-lg border border-[#e1e6df] p-4">
                        <div className="grid gap-2 text-sm text-[#4e5c53] sm:grid-cols-2 lg:grid-cols-4">
                          <p><span className="font-semibold text-[#243128]">Oferta:</span> #{item.id}</p>
                          <p><span className="font-semibold text-[#243128]">Campanha:</span> #{item.campaignId}</p>
                          <p><span className="font-semibold text-[#243128]">Necessidade:</span> {item.campaignNeedId ? `#${item.campaignNeedId}` : "Não vinculada"}</p>
                          <p><span className="font-semibold text-[#243128]">Doador:</span> {item.donorName || "Não informado"}</p>
                        </div>
                        <div className="mt-1 grid gap-2 text-sm text-[#4e5c53] sm:grid-cols-2 lg:grid-cols-3">
                          <p><span className="font-semibold text-[#243128]">Quantidade:</span> {quantityLabel}</p>
                          <p><span className="font-semibold text-[#243128]">Valor estimado:</span> {formatCurrency(item.estimatedAmount ?? 0)}</p>
                          <p><span className="font-semibold text-[#243128]">WhatsApp:</span> {item.donorWhatsapp || "Não informado"}</p>
                        </div>
                        <p className="mt-1 text-sm text-[#4e5c53]"><span className="font-semibold text-[#243128]">Cidade:</span> {item.donorCity || "Não informada"}</p>
                        {item.description && (
                          <p className="mt-1 text-sm text-[#4e5c53]"><span className="font-semibold text-[#243128]">Descrição:</span> {item.description}</p>
                        )}
                        <div className="mt-3">
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[#546459]">Observação da validação (opcional)</label>
                          <Textarea
                            rows={2}
                            maxLength={500}
                            placeholder="Ex.: Conferido com responsável da obra e item aprovado."
                            value={materialValidationNotes[item.id] ?? ""}
                            onChange={(event) => setMaterialValidationNotes((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))}
                          />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]"
                            disabled={reviewMaterialContribution.isPending}
                            onClick={() => reviewMaterialContribution.mutate({
                              contributionId: item.id,
                              decision: "approve",
                              validationNote: materialValidationNotes[item.id]?.trim() || undefined,
                            })}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Aprovar oferta
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 border-red-300 text-red-700 hover:text-red-800"
                            disabled={reviewMaterialContribution.isPending}
                            onClick={() => reviewMaterialContribution.mutate({
                              contributionId: item.id,
                              decision: "reject",
                              validationNote: materialValidationNotes[item.id]?.trim() || undefined,
                            })}
                          >
                            <XCircle className="h-4 w-4" /> Rejeitar oferta
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[#66736a]">Sem ofertas de material pendentes no momento.</p>
              )}

              <div className="mt-6 border-t border-[#e1e6df] pt-5">
                <h4 className="text-sm font-bold text-[#243128]">Histórico recente de validações de material</h4>
                <p className="mt-1 text-xs text-[#66736a]">Auditoria das ofertas aprovadas ou rejeitadas pela equipe.</p>
                {recentMaterialQuery.isLoading ? (
                  <p className="mt-3 text-sm text-[#66736a]">Carregando histórico...</p>
                ) : recentMaterialQuery.isError ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <p className="text-sm text-[#b42318]">
                      Não foi possível carregar o histórico de material.
                      {recentMaterialQuery.error?.message ? ` Motivo: ${recentMaterialQuery.error.message}` : ""}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => recentMaterialQuery.refetch()}>Tentar novamente</Button>
                  </div>
                ) : recentMaterialQuery.data?.length ? (
                  <div className="mt-3 space-y-2">
                    {recentMaterialQuery.data.map((item) => {
                      const isApproved = item.paymentStatusDetail === "material_validated";
                      const validator = item.validatorName || item.validatorEmail || (item.validatedBy ? `Usuário #${item.validatedBy}` : "Não identificado");
                      const when = item.validatedAt ? new Date(item.validatedAt).toLocaleString("pt-BR") : "Data não informada";
                      const quantityLabel = Number.isInteger(item.quantityExact) && (item.quantityExact ?? 0) > 0
                        ? `${item.quantityExact} unidade(s)`
                        : (item.description || "Não informado");

                      return (
                        <div key={`material-validation-${item.id}`} className="rounded-lg bg-[#f5f8f3] p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-[#243128]">Oferta #{item.id} · Campanha #{item.campaignId}</p>
                            <Badge variant={isApproved ? "default" : "secondary"} className={isApproved ? "bg-[#228B22]" : "bg-red-100 text-red-700"}>
                              {isApproved ? "Aprovada" : "Rejeitada"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[#4e5c53]">Quantidade: {quantityLabel} · Doador: {item.donorName || "Não informado"}</p>
                          <p className="mt-1 text-[#4e5c53]">Valor estimado: {formatCurrency(item.estimatedAmount ?? 0)}</p>
                          <p className="mt-1 text-[#4e5c53]">Validado por: {validator} · Em: {when}</p>
                          {item.validationNote && <p className="mt-1 text-[#4e5c53]">Observação: {item.validationNote}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#66736a]">Nenhuma validação de material auditada ainda.</p>
                )}
              </div>
            </Card>

            <div className="space-y-4">
              {campaignsQuery.isLoading ? <LoadingCard label="Carregando campanhas..." /> : campaignsQuery.isError ? (
                <Card className="border-[#f3d2ce] bg-[#fff7f6] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-[#b42318]">
                      Não foi possível carregar as campanhas.
                      {campaignsQuery.error?.message ? ` Motivo: ${campaignsQuery.error.message}` : ""}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => campaignsQuery.refetch()}>Tentar novamente</Button>
                  </div>
                </Card>
              ) : campaignsQuery.data?.length ? campaignsQuery.data.map((campaign) => (
                <Card key={campaign.id} className="p-5 md:p-6">
                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-bold text-[#243128]">{campaign.title}</h3><StatusBadge status={campaign.status} /></div><p className="mt-2 text-[#66736a]">{campaign.description}</p><div className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><Metric label="Meta" value={formatCurrency(campaign.goal)} /><Metric label="Arrecadado" value={formatCurrency(campaign.raised)} accent /><Metric label="Progresso" value={`${campaign.progress}%`} /></div></div>
                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openEditCampaign(campaign)}><Edit2 className="h-4 w-4" /> Editar</Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openCampaignUpdate(campaign)}><Megaphone className="h-4 w-4" /> Publicar evolução</Button>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => openCampaignNeed(campaign)}><PackagePlus className="h-4 w-4" /> Novo item</Button>
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => { setManagingNeedsCampaign({ id: campaign.id, title: campaign.title }); setIsManageNeedsOpen(true); }}><Edit2 className="h-3 w-3" /> Gerenciar itens para doar</Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setAccountabilityCampaign({ id: campaign.id, title: campaign.title })}><FileText className="h-4 w-4" /> Prestação de contas</Button>
                      <Button variant="outline" size="sm" className="gap-2 text-red-700 hover:text-red-800" onClick={() => setCampaignToDelete({ id: campaign.id, title: campaign.title })}><Trash2 className="h-4 w-4" /> Excluir</Button>
                      <Button asChild variant="ghost" size="sm" className="gap-2"><Link href={`/campaign/${campaign.id}`}><ExternalLink className="h-4 w-4" /> Ver no site</Link></Button>
                    </div>
                  </div>
                  <form onSubmit={(event) => handleSaveCampaignContent(event, campaign.id)} className="mt-6 space-y-4 rounded-lg border border-[#e1e6df] bg-[#f8fbf6] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[#243128]">Conteúdo manual da campanha</h4>
                        <p className="text-xs text-[#66736a]">Edite título, subtítulo, hero e galeria sem depender de código.</p>
                        <p className="mt-1 text-xs font-semibold text-[#70571a]">Para salvar vídeo/foto VIP da campanha, use o botão "Editar" acima e clique em "Salvar alterações" no modal.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="default" className="bg-[#228B22] hover:bg-[#1a6b1a]" onClick={() => openEditCampaign(campaign)}>Abrir editor da campanha</Button>
                        <Button type="submit" size="sm" variant="outline">Descartar conteúdo manual</Button>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Título exibido na página">
                        <Input value={(campaignContentForm[campaign.id]?.title ?? getCampaignContent(campaign.id).title) || campaign.title} onChange={(event) => setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), title: event.target.value } }))} />
                      </Field>
                      <Field label="Subtítulo exibido no topo">
                        <Input value={(campaignContentForm[campaign.id]?.subtitle ?? getCampaignContent(campaign.id).subtitle) || ""} onChange={(event) => setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), subtitle: event.target.value } }))} />
                      </Field>
                    </div>
                    <Field label="Descrição curta"><Textarea rows={3} value={(campaignContentForm[campaign.id]?.description ?? getCampaignContent(campaign.id).description) || ""} onChange={(event) => setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), description: event.target.value } }))} /></Field>
                    <Field label="Descrição longa"><Textarea rows={5} value={(campaignContentForm[campaign.id]?.longDescription ?? getCampaignContent(campaign.id).longDescription) || ""} onChange={(event) => setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), longDescription: event.target.value } }))} /></Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Imagem principal (URL, arquivo local ou YouTube)">
                        <Input value={(campaignContentForm[campaign.id]?.heroImageUrl ?? getCampaignContent(campaign.id).heroImageUrl) || ""} onChange={(event) => setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), heroImageUrl: event.target.value } }))} placeholder="https://... ou /arquivo.jpg" />
                        <div className="mt-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                          <div className="mt-2 space-y-2">
                            <div>
                              <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                              <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void handleCampaignImageUpload("edit", file); }} />
                              <p className="mt-1 text-[11px] text-[#889284]">JPG, PNG ou WEBP. Ideal: 1920×1080px (paisagem). Fotos maiores são reduzidas automaticamente.</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                              <div className="flex gap-2">
                                <Input value={campaignContentMediaYouTubeUrls[campaign.id]?.gallery ?? ""} onChange={(event) => setCampaignContentMediaYouTubeUrls((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? { gallery: "", videos: "" }), gallery: event.target.value } }))} placeholder="https://www.youtube.com/watch?v=..." />
                                <Button type="button" size="sm" variant="outline" onClick={() => { const value = (campaignContentMediaYouTubeUrls[campaign.id]?.gallery ?? "").trim(); if (!value) return; setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), heroImageUrl: value } })); setCampaignContentMediaYouTubeUrls((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? { gallery: "", videos: "" }), gallery: "" } })); toast.success("YouTube adicionado ao hero da campanha."); }}>Adicionar</Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Field>
                      <Field label="Galeria (uma URL por linha)">
                        <Textarea rows={4} value={(campaignContentForm[campaign.id]?.galleryImageUrls ?? getCampaignContent(campaign.id).galleryImageUrls).join("\n")} onChange={(event) => setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), galleryImageUrls: event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) } }))} placeholder="https://.../foto1.jpg" />
                        <div className="mt-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                          <div className="mt-2 space-y-2">
                            <div>
                              <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                              <Input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void handleCampaignContentMediaUpload(campaign.id, "gallery", event.target.files)} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                              <div className="flex gap-2">
                                <Input value={campaignContentMediaYouTubeUrls[campaign.id]?.gallery ?? ""} onChange={(event) => setCampaignContentMediaYouTubeUrls((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? { gallery: "", videos: "" }), gallery: event.target.value } }))} placeholder="https://www.youtube.com/watch?v=..." />
                                <Button type="button" size="sm" variant="outline" onClick={() => { const value = (campaignContentMediaYouTubeUrls[campaign.id]?.gallery ?? "").trim(); if (!value) return; setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), galleryImageUrls: appendMediaValues((current[campaign.id] ?? getCampaignContent(campaign.id)).galleryImageUrls, [value]) } })); setCampaignContentMediaYouTubeUrls((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? { gallery: "", videos: "" }), gallery: "" } })); toast.success("YouTube adicionado à galeria."); }}>Adicionar</Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Field>
                    </div>
                    <Field label="Vídeos (uma URL por linha ou YouTube)">
                      <Textarea rows={4} value={(campaignContentForm[campaign.id]?.videoUrls ?? getCampaignContent(campaign.id).videoUrls).join("\n")} onChange={(event) => setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), videoUrls: event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) } }))} placeholder="https://www.youtube.com/watch?v=..." />
                      <div className="mt-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                        <div className="mt-2 space-y-2">
                          <div>
                            <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                            <Input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" multiple onChange={(event) => void handleCampaignContentMediaUpload(campaign.id, "videos", event.target.files)} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                            <div className="flex gap-2">
                              <Input value={campaignContentMediaYouTubeUrls[campaign.id]?.videos ?? ""} onChange={(event) => setCampaignContentMediaYouTubeUrls((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? { gallery: "", videos: "" }), videos: event.target.value } }))} placeholder="https://www.youtube.com/watch?v=..." />
                              <Button type="button" size="sm" variant="outline" onClick={() => { const value = (campaignContentMediaYouTubeUrls[campaign.id]?.videos ?? "").trim(); if (!value) return; setCampaignContentForm((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? getCampaignContent(campaign.id)), videoUrls: appendMediaValues((current[campaign.id] ?? getCampaignContent(campaign.id)).videoUrls, [value]) } })); setCampaignContentMediaYouTubeUrls((current) => ({ ...current, [campaign.id]: { ...(current[campaign.id] ?? { gallery: "", videos: "" }), videos: "" } })); toast.success("YouTube adicionado aos vídeos da campanha."); }}>Adicionar</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Field>
                  </form>
                </Card>
              )) : <EmptyCard icon={Building2} title="Nenhuma campanha cadastrada" description="Crie a primeira campanha para iniciar a operação." action={<Button onClick={() => setIsCreateCampaignOpen(true)}>Criar campanha</Button>} />}
            </div>
          </TabsContent>

          <TabsContent value="partners" className="space-y-6">
            {isLocalhost && (
              <Card className="border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  Você está editando parceiros no localhost. Essas alterações podem ficar apenas no fallback local e não aparecer no www.
                  Para refletir no site publicado, faça a gestão pelo painel em produção.
                </p>
              </Card>
            )}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><h2 className="text-2xl font-bold text-[#243128]">Parceiros</h2><p className="mt-1 text-[#66736a]">Somente estes registros aparecem na vitrine pública.</p></div>
              <Button onClick={openNewPartner} className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]"><Plus className="h-4 w-4" /> Novo parceiro</Button>
            </div>
            {partnersQuery.isLoading ? <LoadingCard label="Carregando parceiros..." /> : partnersQuery.isError ? <ErrorCard label="Não foi possível carregar os parceiros." onRetry={() => partnersQuery.refetch()} /> : partnersQuery.data?.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {partnersQuery.data.map((partner) => (
                  <Card key={partner.id} className="p-5">
                    <div className="flex gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef4ec] p-2">{partner.logoUrl ? <img src={partner.logoUrl} alt="" className="h-full w-full object-contain" /> : <Handshake className="h-7 w-7 text-[#228B22]" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-[#243128]">{partner.name}</h3><Badge variant="secondary">{partner.type === "company" ? "Empresa" : "Profissional"}</Badge></div>{partner.ownerName && <p className="mt-1 text-sm font-medium text-[#55645a]">Responsável: {partner.ownerName}</p>}{partner.description && <p className="mt-2 line-clamp-2 text-sm text-[#66736a]">{partner.description}</p>}{partner.address && <p className="mt-2 text-sm text-[#66736a]">Endereço: {partner.address}</p>}{partner.contactInfo && <p className="mt-1 text-sm text-[#66736a]">Contato: {partner.contactInfo}</p>}{partner.website && <a href={partner.website} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#228B22] hover:underline">Abrir site <ExternalLink className="h-3.5 w-3.5" /></a>}</div></div>
                    {(partner.storePhotoUrl || partner.ownerPhotoUrl) && (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="overflow-hidden rounded-lg bg-[#eef4ec]">
                          {partner.storePhotoUrl ? (
                            <img src={partner.storePhotoUrl} alt={`Foto da loja de ${partner.name}`} className="h-24 w-full object-cover" />
                          ) : (
                            <div className="flex h-24 items-center justify-center text-xs font-medium text-[#66736a]">Sem foto da loja</div>
                          )}
                        </div>
                        <div className="overflow-hidden rounded-lg bg-[#eef4ec]">
                          {partner.ownerPhotoUrl ? (
                            <img src={partner.ownerPhotoUrl} alt={`Foto do responsável de ${partner.name}`} className="h-24 w-full object-cover" />
                          ) : (
                            <div className="flex h-24 items-center justify-center text-xs font-medium text-[#66736a]">Sem foto do responsável</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="mt-5 flex justify-end gap-2 border-t pt-4"><Button variant="outline" size="sm" className="gap-2" onClick={() => openEditPartner(partner)}><Edit2 className="h-4 w-4" /> Editar</Button><Button variant="outline" size="sm" className="gap-2 text-red-700 hover:text-red-800" onClick={() => setPartnerToDelete({ id: partner.id, name: partner.name })}><Trash2 className="h-4 w-4" /> Excluir</Button></div>
                  </Card>
                ))}
              </div>
            ) : <EmptyCard icon={Handshake} title="Nenhum parceiro cadastrado" description="Cadastre somente parceiros cuja exibição pública já tenha sido autorizada." action={<Button onClick={openNewPartner}>Cadastrar parceiro</Button>} />}
          </TabsContent>

          <TabsContent value="community" className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-bold text-[#243128]">Comunidade de doadores</h2>
                <p className="mt-1 text-[#66736a]">Pessoas cadastradas via doação ou registro, disponíveis para contato sobre novas campanhas.</p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const donors = filteredCommunityDonors;
                  if (!donors.length) { toast.error("Nenhum doador para exportar."); return; }
                  const header = "Nome,CPF,WhatsApp,Email,Cidade,Igreja,Sexo,Nascimento,Total doado (R$),Doações";
                  const rows = donors.map((d) => [
                    d.donorName ?? "",
                    d.donorCpf ?? "",
                    d.donorWhatsapp ?? "",
                    d.donorEmail ?? "",
                    d.donorCity ?? "",
                    d.donorChurch ?? "",
                    (d as { donorGender?: string }).donorGender ?? "",
                    (d as { donorBirthDate?: string }).donorBirthDate ?? "",
                    ((d.totalAmountCents ?? 0) / 100).toFixed(2).replace(".", ","),
                    String(d.donationsCount ?? 0),
                  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
                  const csv = [header, ...rows].join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "comunidade-doadores.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <FileText className="h-4 w-4" /> Exportar CSV
              </Button>
            </div>
            {registeredDonorsQuery.isLoading ? (
              <p className="text-sm text-[#66736a]">Carregando comunidade...</p>
            ) : registeredDonorsQuery.isError ? (
              <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar os doadores.</Card>
            ) : (registeredDonorsQuery.data?.length ?? 0) > 0 ? (<>
              <Card className="border-[#dbe7d8] bg-[#f9fcf8] p-4">
                <p className="text-sm font-semibold text-[#2d2d2d] mb-3">Filtros</p>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium text-[#66736a] mb-1">Sexo</label>
                    <Select value={communityGenderFilter} onValueChange={setCommunityGenderFilter}>
                      <SelectTrigger className="h-9 bg-white text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="male">Masculino</SelectItem>
                        <SelectItem value="female">Feminino</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefere não informar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#66736a] mb-1">Cidade</label>
                    <Input className="h-9 text-sm" placeholder="Filtrar por cidade" value={communityCityFilter} onChange={(e) => setCommunityCityFilter(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#66736a] mb-1">Idade mínima</label>
                    <Input className="h-9 text-sm" type="number" placeholder="Ex: 18" value={communityAgeMin} onChange={(e) => setCommunityAgeMin(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#66736a] mb-1">Idade máxima</label>
                    <Input className="h-9 text-sm" type="number" placeholder="Ex: 60" value={communityAgeMax} onChange={(e) => setCommunityAgeMax(e.target.value)} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-[#66736a]">{filteredCommunityDonors.length} de {registeredDonorsQuery.data?.length ?? 0} pessoa(s)</p>
              </Card>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#eef3ec] text-[#2d2d2d]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Nome</th>
                        <th className="px-4 py-3 font-semibold">WhatsApp</th>
                        <th className="px-4 py-3 font-semibold">Cidade</th>
                        <th className="px-4 py-3 font-semibold">Sexo</th>
                        <th className="px-4 py-3 font-semibold">Idade</th>
                        <th className="px-4 py-3 font-semibold">Total</th>
                        <th className="px-4 py-3 font-semibold">Doações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCommunityDonors.map((donor, idx) => {
                        const birth = (donor as { donorBirthDate?: string }).donorBirthDate;
                        const age = birth ? Math.floor((Date.now() - new Date(birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;
                        const genderLabel: Record<string, string> = { male: "Masculino", female: "Feminino", other: "Outro", prefer_not_to_say: "—" };
                        return (
                          <tr key={idx} className="border-t border-[#e2e9df]">
                            <td className="px-4 py-2 font-medium text-[#2d2d2d]">{donor.donorName || "—"}</td>
                            <td className="px-4 py-2 text-[#4d5e4f]">{donor.donorWhatsapp || "—"}</td>
                            <td className="px-4 py-2 text-[#4d5e4f]">{donor.donorCity || "—"}</td>
                            <td className="px-4 py-2 text-[#4d5e4f]">{genderLabel[(donor as { donorGender?: string }).donorGender ?? ""] ?? "—"}</td>
                            <td className="px-4 py-2 text-[#4d5e4f]">{age !== null ? `${age} anos` : "—"}</td>
                            <td className="px-4 py-2 text-[#228B22] font-semibold">{((donor.totalAmountCents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                            <td className="px-4 py-2 text-[#4d5e4f]">{donor.donationsCount ?? 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>) : (
              <Card className="p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-[#b0bfb0]" />
                <p className="mt-3 font-semibold text-[#2d2d2d]">Nenhum doador cadastrado ainda</p>
                <p className="mt-1 text-sm text-[#66736a]">Quando alguém fizer uma doação ou se cadastrar, aparece aqui.</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isEditCampaignOpen} onOpenChange={(open) => open ? setIsEditCampaignOpen(true) : closeEditCampaignDialog()}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>Editar campanha</DialogTitle></DialogHeader>
            <form onSubmit={handleUpdateCampaign} className="space-y-4">
              <Field label="Título *"><Input value={campaignEditForm.title} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, title: event.target.value })} required minLength={5} /></Field>
              <Field label="Descrição curta *"><Textarea value={campaignEditForm.description} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, description: event.target.value })} required minLength={20} rows={2} /></Field>
              <Field label="Descrição longa *"><Textarea value={campaignEditForm.longDescription} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, longDescription: event.target.value })} required minLength={50} rows={5} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Meta (R$) *"><Input inputMode="decimal" value={campaignEditForm.goal} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, goal: event.target.value })} required placeholder="Ex.: 50.000,00" /></Field>
                <Field label="Arrecadação inicial (R$)"><Input inputMode="decimal" value={campaignEditForm.initialRaised} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, initialRaised: event.target.value })} placeholder="Ex.: 12.350,90" /></Field>
              </div>
              <Field label="Valor VIP apartamento (R$) (opcional)"><Input inputMode="decimal" value={campaignEditForm.vipApartmentAmount} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, vipApartmentAmount: event.target.value })} placeholder="Ex.: 120.000,00" /></Field>
              <Field label="Opções de ajuda públicas">
                <div className="grid gap-3 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3 sm:grid-cols-3">
                  {(["material", "financial", "vip"] as HelpTierOption[]).map((option) => {
                    const label = option === "material" ? "Materiais" : option === "financial" ? "Dinheiro" : "VIP";
                    const checked = campaignEditForm.helpTierOptions.includes(option);
                    return (
                      <label key={option} className="flex items-center gap-2 rounded-md border border-[#dce5d8] bg-white px-3 py-2 text-sm font-medium text-[#334139]">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            const next = value ? [...campaignEditForm.helpTierOptions, option] : campaignEditForm.helpTierOptions.filter((item) => item !== option);
                            setCampaignEditForm({ ...campaignEditForm, helpTierOptions: next });
                          }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-[#66736a]">Marque quais páginas de ajuda devem aparecer para a campanha no público.</p>
              </Field>
              <div className="rounded-lg border border-[#e1e6df] bg-[#f8fbf6] p-4">
                <p className="text-sm font-bold text-[#243128]">Configuração da página VIP</p>
                <p className="mt-1 text-xs text-[#66736a]">Essas mídias aparecem na página VIP antes do pagamento. Use URL, arquivo local ou YouTube.</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Fotos VIP (URLs)">
                    <Textarea
                      value={campaignEditForm.vipImageUrls}
                      onChange={(event) => setCampaignEditForm({ ...campaignEditForm, vipImageUrls: event.target.value })}
                      rows={5}
                      placeholder="https://site.com/foto-1.jpg"
                    />
                    <div className="mt-2 rounded-lg border border-[#dce5d8] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                          <Input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void handleVipMediaUpload("image", event.target.files)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                          <div className="flex gap-2">
                            <Input value={vipMediaYouTubeUrls.image} onChange={(event) => setVipMediaYouTubeUrls((current) => ({ ...current, image: event.target.value }))} placeholder="https://www.youtube.com/watch?v=..." />
                            <Button type="button" size="sm" variant="outline" onClick={() => { const value = vipMediaYouTubeUrls.image.trim(); if (!value) return; setCampaignEditForm((current) => ({ ...current, vipImageUrls: appendMediaValues(current.vipImageUrls, [value]).join("\n") })); setVipMediaYouTubeUrls((current) => ({ ...current, image: "" })); toast.success("YouTube adicionado às fotos VIP."); }}>Adicionar</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Field>
                  <Field label="Vídeos VIP (URLs)">
                    <Textarea
                      value={campaignEditForm.vipVideoUrls}
                      onChange={(event) => setCampaignEditForm({ ...campaignEditForm, vipVideoUrls: event.target.value })}
                      rows={5}
                      placeholder="https://site.com/video-1.mp4"
                    />
                    <div className="mt-2 rounded-lg border border-[#dce5d8] bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                          <Input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" multiple onChange={(event) => void handleVipMediaUpload("video", event.target.files)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                          <div className="flex gap-2">
                            <Input value={vipMediaYouTubeUrls.video} onChange={(event) => setVipMediaYouTubeUrls((current) => ({ ...current, video: event.target.value }))} placeholder="https://www.youtube.com/watch?v=..." />
                            <Button type="button" size="sm" variant="outline" onClick={() => { const value = vipMediaYouTubeUrls.video.trim(); if (!value) return; setCampaignEditForm((current) => ({ ...current, vipVideoUrls: appendMediaValues(current.vipVideoUrls, [value]).join("\n") })); setVipMediaYouTubeUrls((current) => ({ ...current, video: "" })); toast.success("YouTube adicionado aos vídeos VIP."); }}>Adicionar</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Field>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status *"><Select value={campaignEditForm.status} onValueChange={(status: typeof campaignEditForm.status) => setCampaignEditForm({ ...campaignEditForm, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativa</SelectItem><SelectItem value="paused">Pausada</SelectItem><SelectItem value="completed">Concluída</SelectItem><SelectItem value="archived">Arquivada</SelectItem></SelectContent></Select></Field>
              </div>
              <Field label="Imagem da campanha">
                <Input
                  value={campaignEditForm.imageUrl}
                  onChange={(event) => setCampaignEditForm({ ...campaignEditForm, imageUrl: event.target.value })}
                  placeholder="URL da imagem (opcional)"
                />
                <div className="mt-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                      <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleCampaignImageUpload("edit", event.target.files?.[0])} />
                      <p className="mt-1 text-[11px] text-[#889284]">JPG, PNG ou WEBP. Ideal: 1920×1080px (paisagem). Fotos maiores são reduzidas automaticamente.</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                      <Input value={campaignMediaYouTubeUrl} onChange={(event) => { setCampaignMediaYouTubeUrl(event.target.value); if (event.target.value.trim()) { setCampaignEditForm((current) => ({ ...current, imageUrl: event.target.value.trim() })); } }} placeholder="https://www.youtube.com/watch?v=..." />
                    </div>
                  </div>
                </div>
                {uploadingCampaignImage === "edit" && <p className="text-xs text-[#66736a]">Enviando imagem...</p>}
                {campaignEditForm.imageUrl && <p className="text-xs text-[#228B22] break-all">Imagem atual: {campaignEditForm.imageUrl.startsWith("data:") ? "arquivo carregado" : campaignEditForm.imageUrl}</p>}
                <p className="mt-1 text-xs text-[#66736a]">Use URL direta, arquivo local do seu computador ou YouTube. Para vídeo, também vale o mesmo fluxo.</p>
              </Field>
              <p className="rounded-lg bg-[#fff8e6] p-3 text-sm text-[#70571a]">Campanhas pausadas ou arquivadas deixam de aparecer nas áreas públicas. Campanhas concluídas continuam disponíveis para prestação de contas.</p>
              <div className="sticky bottom-0 z-10 -mx-6 mt-4 flex justify-end gap-3 border-t border-[#e1e6df] bg-white px-6 py-3">
                <Button type="button" variant="outline" onClick={closeEditCampaignDialog}>Cancelar</Button>
                <Button type="submit" disabled={updateCampaign.isPending}>{updateCampaign.isPending ? "Salvando..." : "Salvar alterações"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isCampaignUpdateOpen} onOpenChange={(open) => open ? setIsCampaignUpdateOpen(true) : closeCampaignUpdateDialog()}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>Publicar nova atualização da obra</DialogTitle></DialogHeader>
            <p className="text-sm text-[#66736a]">Campanha: <strong className="text-[#243128]">{selectedCampaign?.title}</strong></p>
            <p className="text-sm text-[#66736a]">Adicione fotos ou vídeos reais da construção para mostrar a evolução do projeto etapa a etapa.</p>
            <form onSubmit={handlePublishCampaignUpdate} className="space-y-4">
              <Field label="Título *"><Input value={campaignUpdateForm.title} onChange={(event) => setCampaignUpdateForm({ ...campaignUpdateForm, title: event.target.value })} required minLength={5} /></Field>
              <Field label="Descrição *"><Textarea value={campaignUpdateForm.description} onChange={(event) => setCampaignUpdateForm({ ...campaignUpdateForm, description: event.target.value })} required minLength={20} rows={5} /></Field>
              <Field label="Fase *"><Select value={campaignUpdateForm.phase} onValueChange={(phase: typeof campaignUpdateForm.phase) => setCampaignUpdateForm({ ...campaignUpdateForm, phase })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="before">Antes</SelectItem><SelectItem value="during">Durante</SelectItem><SelectItem value="after">Depois</SelectItem></SelectContent></Select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="URLs de imagens">
                  <Textarea value={campaignUpdateForm.imageUrls} onChange={(event) => setCampaignUpdateForm({ ...campaignUpdateForm, imageUrls: event.target.value })} rows={4} placeholder="Uma URL HTTPS por linha" />
                  <div className="mt-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                        <Input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void handleCampaignUpdateMediaUpload("image", event.target.files)} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                        <div className="flex gap-2">
                          <Input value={campaignUpdateMediaYouTubeUrls.image} onChange={(event) => setCampaignUpdateMediaYouTubeUrls((current) => ({ ...current, image: event.target.value }))} placeholder="https://www.youtube.com/watch?v=..." />
                          <Button type="button" size="sm" variant="outline" onClick={() => { const value = campaignUpdateMediaYouTubeUrls.image.trim(); if (!value) return; setCampaignUpdateForm((current) => ({ ...current, imageUrls: appendMediaValues(current.imageUrls, [value]).join("\n") })); setCampaignUpdateMediaYouTubeUrls((current) => ({ ...current, image: "" })); toast.success("YouTube adicionado às imagens da atualização."); }}>Adicionar</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Field>
                <Field label="URLs de vídeos">
                  <Textarea value={campaignUpdateForm.videoUrls} onChange={(event) => setCampaignUpdateForm({ ...campaignUpdateForm, videoUrls: event.target.value })} rows={4} placeholder="Uma URL HTTPS por linha" />
                  <div className="mt-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                        <Input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" multiple onChange={(event) => void handleCampaignUpdateMediaUpload("video", event.target.files)} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                        <div className="flex gap-2">
                          <Input value={campaignUpdateMediaYouTubeUrls.video} onChange={(event) => setCampaignUpdateMediaYouTubeUrls((current) => ({ ...current, video: event.target.value }))} placeholder="https://www.youtube.com/watch?v=..." />
                          <Button type="button" size="sm" variant="outline" onClick={() => { const value = campaignUpdateMediaYouTubeUrls.video.trim(); if (!value) return; setCampaignUpdateForm((current) => ({ ...current, videoUrls: appendMediaValues(current.videoUrls, [value]).join("\n") })); setCampaignUpdateMediaYouTubeUrls((current) => ({ ...current, video: "" })); toast.success("YouTube adicionado aos vídeos da atualização."); }}>Adicionar</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Field>
              </div>
              <p className="rounded-lg bg-[#f1f6ef] p-3 text-sm text-[#55645a]">As mídias serão exibidas publicamente. Use somente arquivos autorizados e URLs HTTPS acessíveis.</p>
              <div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={closeCampaignUpdateDialog}>Cancelar</Button><Button type="submit" disabled={publishCampaignUpdate.isPending}>{publishCampaignUpdate.isPending ? "Publicando..." : "Publicar atualização"}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isCampaignNeedOpen} onOpenChange={(open) => open ? setIsCampaignNeedOpen(true) : closeCampaignNeedDialog()}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader><DialogTitle>Cadastrar necessidade</DialogTitle></DialogHeader>
            <p className="text-sm text-[#66736a]">Campanha: <strong className="text-[#243128]">{selectedCampaign?.title}</strong></p>
            <form onSubmit={handleCreateCampaignNeed} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo *"><Select value={campaignNeedForm.type} onValueChange={(type: typeof campaignNeedForm.type) => setCampaignNeedForm({ ...campaignNeedForm, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="material">Material</SelectItem><SelectItem value="labor">Mão de obra</SelectItem><SelectItem value="equipment">Equipamento</SelectItem><SelectItem value="other">Outro</SelectItem></SelectContent></Select></Field>
                <Field label="Prioridade *"><Select value={campaignNeedForm.priority} onValueChange={(priority: typeof campaignNeedForm.priority) => setCampaignNeedForm({ ...campaignNeedForm, priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">Alta</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="low">Baixa</SelectItem></SelectContent></Select></Field>
              </div>
              <Field label="Nome *"><Input value={campaignNeedForm.name} onChange={(event) => setCampaignNeedForm({ ...campaignNeedForm, name: event.target.value })} required minLength={3} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Meta exata (unidades) *"><Input type="number" min={1} step={1} value={campaignNeedForm.targetQuantityExact} onChange={(event) => setCampaignNeedForm({ ...campaignNeedForm, targetQuantityExact: event.target.value })} required placeholder="Ex.: 3700" /></Field>
                <Field label="Valor unitário (R$) *"><Input inputMode="decimal" value={campaignNeedForm.unitValue} onChange={(event) => setCampaignNeedForm({ ...campaignNeedForm, unitValue: event.target.value })} required placeholder="Ex.: 1,80" /></Field>
              </div>
              <Field label="Quantidade textual *"><Input value={campaignNeedForm.quantity} onChange={(event) => setCampaignNeedForm({ ...campaignNeedForm, quantity: event.target.value })} required placeholder="Ex.: 3.700 unidades" /></Field>
              <Field label="Descrição"><Textarea value={campaignNeedForm.description} onChange={(event) => setCampaignNeedForm({ ...campaignNeedForm, description: event.target.value })} rows={4} /></Field>
              <div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={closeCampaignNeedDialog}>Cancelar</Button><Button type="submit" disabled={createCampaignNeed.isPending}>{createCampaignNeed.isPending ? "Salvando..." : "Cadastrar necessidade"}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isPartnerOpen} onOpenChange={(open) => open ? setIsPartnerOpen(true) : closePartnerDialog()}>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader><DialogTitle>{editingPartnerId ? "Editar parceiro" : "Cadastrar parceiro"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSavePartner} className="space-y-4">
              <Field label="Nome *"><Input value={partnerForm.name} onChange={(event) => setPartnerForm({ ...partnerForm, name: event.target.value })} required minLength={2} /></Field>
              <Field label="Tipo *"><Select value={partnerForm.type} onValueChange={(value: "company" | "individual") => setPartnerForm({ ...partnerForm, type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="company">Empresa</SelectItem><SelectItem value="individual">Profissional</SelectItem></SelectContent></Select></Field>
              <Field label="Nome do responsável"><Input value={partnerForm.ownerName} onChange={(event) => setPartnerForm({ ...partnerForm, ownerName: event.target.value })} maxLength={255} /></Field>
              <Field label="Descrição"><Textarea value={partnerForm.description} onChange={(event) => setPartnerForm({ ...partnerForm, description: event.target.value })} rows={4} maxLength={1500} /></Field>
              <Field label="Logomarca (arquivo)">
                <div className="rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#55645a]">Opções para mídia</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-xs font-medium text-[#334139]">1. Arquivo local</label>
                      <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handlePartnerImageUpload("logoUrl", event.target.files?.[0])} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#334139]">2. YouTube</label>
                      <Input value={partnerMediaYouTubeUrl} onChange={(event) => { setPartnerMediaYouTubeUrl(event.target.value); if (event.target.value.trim()) { setPartnerForm((current) => ({ ...current, logoUrl: event.target.value.trim() })); } }} placeholder="https://www.youtube.com/watch?v=..." />
                    </div>
                  </div>
                </div>
                {uploadingPartnerField === "logoUrl" && <p className="text-xs text-[#66736a]">Enviando logomarca...</p>}
                {partnerForm.logoUrl && <p className="text-xs text-[#228B22] break-all">Arquivo enviado: {partnerForm.logoUrl}</p>}
              </Field>
              <Field label="Foto da loja (arquivo)">
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handlePartnerImageUpload("storePhotoUrl", event.target.files?.[0])} />
                {uploadingPartnerField === "storePhotoUrl" && <p className="text-xs text-[#66736a]">Enviando foto da loja...</p>}
                {partnerForm.storePhotoUrl && <p className="text-xs text-[#228B22] break-all">Arquivo enviado: {partnerForm.storePhotoUrl}</p>}
              </Field>
              <Field label="Foto do responsável (arquivo)">
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handlePartnerImageUpload("ownerPhotoUrl", event.target.files?.[0])} />
                {uploadingPartnerField === "ownerPhotoUrl" && <p className="text-xs text-[#66736a]">Enviando foto do responsável...</p>}
                {partnerForm.ownerPhotoUrl && <p className="text-xs text-[#228B22] break-all">Arquivo enviado: {partnerForm.ownerPhotoUrl}</p>}
              </Field>
              <Field label="Endereço"><Textarea value={partnerForm.address} onChange={(event) => setPartnerForm({ ...partnerForm, address: event.target.value })} rows={3} maxLength={1000} /></Field>
              <Field label="Contato"><Input value={partnerForm.contactInfo} onChange={(event) => setPartnerForm({ ...partnerForm, contactInfo: event.target.value })} maxLength={255} placeholder="Telefone, WhatsApp ou e-mail" /></Field>
              <Field label="URL do vídeo de testemunho">
                <Input value={partnerForm.testimonialVideoUrl} onChange={(event) => setPartnerForm({ ...partnerForm, testimonialVideoUrl: event.target.value })} placeholder="https://... ou /uploads/..." />
                <div className="mt-2">
                  <label className="text-xs font-medium text-[#334139]">Ou enviar arquivo de vídeo</label>
                  <Input type="file" accept=".mp4,.mov,.webm,.ogg,video/mp4,video/webm,video/ogg,video/quicktime" onChange={(event) => void handlePartnerVideoUpload(event.target.files?.[0])} />
                </div>
                {uploadingPartnerField === "testimonialVideoUrl" && <p className="text-xs text-[#66736a]">Enviando vídeo do parceiro...</p>}
              </Field>
              <Field label="Texto do testemunho"><Textarea value={partnerForm.testimonialText} onChange={(event) => setPartnerForm({ ...partnerForm, testimonialText: event.target.value })} rows={4} maxLength={2000} placeholder="Depoimento convidando mais pessoas para a parceria" /></Field>
              <Field label="Site"><Input value={partnerForm.website} onChange={(event) => setPartnerForm({ ...partnerForm, website: event.target.value })} placeholder="https://..." /></Field>
              <p className="rounded-lg bg-[#f1f6ef] p-3 text-sm text-[#55645a]">Ao salvar, o parceiro poderá aparecer imediatamente na homepage. Cadastre somente dados cuja publicação tenha sido autorizada.</p>
              <div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={closePartnerDialog}>Cancelar</Button><Button type="submit" disabled={partnerMutationPending}>{partnerMutationPending ? "Salvando..." : "Salvar parceiro"}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        <CampaignAccountabilityDialog
          campaign={accountabilityCampaign}
          open={Boolean(accountabilityCampaign)}
          onOpenChange={(open) => !open && setAccountabilityCampaign(null)}
        />

        <AlertDialog open={Boolean(campaignToDelete)} onOpenChange={(open) => !open && setCampaignToDelete(null)}>
          <AlertDialogContent className="border border-[#d7dfd4] bg-white text-[#1f2a23] shadow-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
              <AlertDialogDescription className="text-[#4e5c53]">
                A campanha <strong>{campaignToDelete?.title}</strong> será removida do painel e do site público. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-700 hover:bg-red-800"
                disabled={deleteCampaign.isPending}
                onClick={() => campaignToDelete && deleteCampaign.mutate({ id: campaignToDelete.id })}
              >
                {deleteCampaign.isPending ? "Excluindo..." : "Excluir campanha"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={Boolean(partnerToDelete)} onOpenChange={(open) => !open && setPartnerToDelete(null)}>
          <AlertDialogContent className="border border-[#d7dfd4] bg-white text-[#1f2a23] shadow-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir parceiro?</AlertDialogTitle>
              <AlertDialogDescription className="text-[#4e5c53]">
                O registro de <strong>{partnerToDelete?.name}</strong> será removido da vitrine pública. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-red-700 hover:bg-red-800" disabled={deletePartner.isPending} onClick={() => partnerToDelete && deletePartner.mutate({ id: partnerToDelete.id })}>{deletePartner.isPending ? "Excluindo..." : "Excluir parceiro"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ManageNeedsDialog
          campaign={managingNeedsCampaign}
          open={isManageNeedsOpen}
          onOpenChange={(open) => { setIsManageNeedsOpen(open); if (!open) setManagingNeedsCampaign(null); }}
          onCreate={handleCreateNeed}
          onDelete={handleDeleteNeed}
          onUpdate={handleUpdateNeed}
        />
      </div>
    </DashboardLayout>
  );
}

function ManageNeedsDialog({ campaign, open, onOpenChange, onCreate, onDelete, onUpdate }: {
  campaign: { id: number; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (campaignId: number, payload: {
    name: string;
    description?: string;
    quantity: string;
    targetQuantityExact: number;
    unitValueCents: number;
    type: "material" | "labor" | "equipment" | "other";
    priority: "high" | "medium" | "low";
  }) => Promise<void>;
  onDelete: (needId: number, campaignId: number) => Promise<void>;
  onUpdate: (needId: number, campaignId: number, updates: {
    name: string;
    description?: string;
    quantity: string;
    targetQuantityExact: number;
    unitValueCents: number;
    type: "material" | "labor" | "equipment" | "other";
    priority: "high" | "medium" | "low";
  }) => Promise<void>;
}) {
  const isLocalhost = typeof window !== "undefined" && (window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1"));
  const [editingNeedId, setEditingNeedId] = useState<number | null>(null);
  const [isCreatingNeed, setIsCreatingNeed] = useState(false);
  const [newNeedDraft, setNewNeedDraft] = useState({
    name: "",
    quantity: "",
    targetQuantityExact: "",
    unitValue: "",
    type: "material" as "material" | "labor" | "equipment" | "other",
    priority: "medium" as "high" | "medium" | "low",
    description: "",
  });
  const [creatingNeed, setCreatingNeed] = useState(false);
  const [syncingLegacyLocalNeeds, setSyncingLegacyLocalNeeds] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<number, {
    name: string;
    quantity: string;
    targetQuantityExact: string;
    unitValue: string;
    type: "material" | "labor" | "equipment" | "other";
    priority: "high" | "medium" | "low";
    description: string;
  }>>({});
  const [savingNeedId, setSavingNeedId] = useState<number | null>(null);

  const needsQuery = trpc.campaigns.getNeeds.useQuery(
    { campaignId: campaign?.id ?? 0 },
    { enabled: open && Boolean(campaign) },
  );

  const localNeedsForCampaign = campaign ? readLocalNeedsForCampaign(campaign.id) : [];
  const needsForDisplay = mergeNeedsForManagement(
    (needsQuery.data ?? []).map((need) => ({
      ...need,
      description: need.description ?? undefined,
      quantity: need.quantity ?? "",
      targetQuantityExact: need.targetQuantityExact ?? 0,
      unitValueCents: need.unitValueCents ?? 0,
    })),
    localNeedsForCampaign as Array<{
      id: number;
      campaignId: number;
      type: "material" | "labor" | "equipment" | "other";
      name: string;
      description: string | undefined;
      quantity: string;
      targetQuantityExact: number | null | undefined;
      unitValueCents: number | null | undefined;
      priority: "high" | "medium" | "low";
    }>,
    campaign?.id,
  );

  useEffect(() => {
    if (!open || !campaign || !isLocalhost || syncingLegacyLocalNeeds || !localNeedsForCampaign.length || needsQuery.status !== "success") {
      return;
    }

    const normalizeName = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

    const serverNeeds = (needsQuery.data ?? []).map((need) => ({
      ...need,
      description: need.description ?? undefined,
      quantity: need.quantity ?? "",
      targetQuantityExact: need.targetQuantityExact ?? 0,
      unitValueCents: need.unitValueCents ?? 0,
    }));

    const localNames = new Set(localNeedsForCampaign.map((need) => normalizeName(need.name)));
    const listsAlreadyMatch = serverNeeds.length === localNeedsForCampaign.length && serverNeeds.every((need) => {
      const matchingLocal = localNeedsForCampaign.find((localNeed) => normalizeName(localNeed.name) === normalizeName(need.name));
      return Boolean(
        matchingLocal
        && matchingLocal.quantity === need.quantity
        && (matchingLocal.targetQuantityExact ?? 0) === (need.targetQuantityExact ?? 0)
        && (matchingLocal.unitValueCents ?? 0) === (need.unitValueCents ?? 0),
      );
    });

    if (listsAlreadyMatch) {
      clearLocalNeedsForCampaign(campaign.id);
      return;
    }

    setSyncingLegacyLocalNeeds(true);

    void (async () => {
      try {
        for (const serverNeed of serverNeeds) {
          if (!localNames.has(normalizeName(serverNeed.name))) {
            await onDelete(serverNeed.id, campaign.id);
          }
        }

        for (const localNeed of localNeedsForCampaign) {
          const matchingServer = serverNeeds.find((serverNeed) => normalizeName(serverNeed.name) === normalizeName(localNeed.name));
          const payload = {
            name: localNeed.name,
            description: localNeed.description?.trim() || undefined,
            quantity: localNeed.quantity,
            targetQuantityExact: localNeed.targetQuantityExact ?? 0,
            unitValueCents: localNeed.unitValueCents ?? 0,
            type: localNeed.type,
            priority: localNeed.priority,
          };

          if (matchingServer) {
            await onUpdate(matchingServer.id, campaign.id, payload);
          } else {
            await onCreate(campaign.id, payload);
          }
        }

        clearLocalNeedsForCampaign(campaign.id);
        await needsQuery.refetch();
        toast.success("Itens locais migrados para a campanha pública.");
      } catch (error) {
        console.error(error);
        toast.error("Não foi possível sincronizar os itens locais desta campanha.");
      } finally {
        setSyncingLegacyLocalNeeds(false);
      }
    })();
  }, [campaign, isLocalhost, localNeedsForCampaign, needsQuery, onCreate, onDelete, onUpdate, open, syncingLegacyLocalNeeds]);

  if (!open || !campaign) return null;

  function startEditing(need: {
    id: number;
    campaignId: number;
    type: "material" | "labor" | "equipment" | "other";
    name: string;
    description?: string | null;
    quantity: string;
    targetQuantityExact?: number | null;
    unitValueCents?: number | null;
    priority: "high" | "medium" | "low";
  }) {
    setEditingNeedId(need.id);
    setEditDrafts((current) => ({
      ...current,
      [need.id]: {
        name: need.name ?? "",
        quantity: need.quantity ?? "",
        targetQuantityExact: need.targetQuantityExact != null ? String(need.targetQuantityExact) : "",
        unitValue: need.unitValueCents != null ? (need.unitValueCents / 100).toFixed(2).replace(".", ",") : "",
        type: need.type,
        priority: need.priority,
        description: need.description ?? "",
      },
    }));
  }

  async function saveEditing(need: {
    id: number;
    campaignId: number;
    type: "material" | "labor" | "equipment" | "other";
    name: string;
    description?: string | null;
    quantity: string;
    targetQuantityExact?: number | null;
    unitValueCents?: number | null;
    priority: "high" | "medium" | "low";
  }) {
    const draft = editDrafts[need.id];
    if (!draft) return;

    const targetQuantityExact = Number.parseInt(draft.targetQuantityExact, 10);
    if (!Number.isInteger(targetQuantityExact) || targetQuantityExact <= 0) {
      toast.error("Informe uma meta exata válida.");
      return;
    }

    const unitValueCents = parseCurrencyToCents(draft.unitValue);
    if (unitValueCents === null || unitValueCents <= 0) {
      toast.error("Informe um valor unitário válido.");
      return;
    }

    if (!draft.name.trim() || !draft.quantity.trim()) {
      toast.error("Nome e quantidade textual são obrigatórios.");
      return;
    }

    try {
      setSavingNeedId(need.id);
      if (!campaign) return;
      await onUpdate(need.id, campaign.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        quantity: draft.quantity.trim(),
        targetQuantityExact,
        unitValueCents,
        type: draft.type,
        priority: draft.priority,
      });
      setEditingNeedId(null);
    } finally {
      setSavingNeedId(null);
    }
  }

  async function saveNewNeed() {
    if (!campaign) return;

    const targetQuantityExact = Number.parseInt(newNeedDraft.targetQuantityExact, 10);
    if (!Number.isInteger(targetQuantityExact) || targetQuantityExact <= 0) {
      toast.error("Informe uma meta exata válida para o novo item.");
      return;
    }

    const unitValueCents = parseCurrencyToCents(newNeedDraft.unitValue);
    if (unitValueCents === null || unitValueCents <= 0) {
      toast.error("Informe um valor unitário válido para o novo item.");
      return;
    }

    if (!newNeedDraft.name.trim() || !newNeedDraft.quantity.trim()) {
      toast.error("Nome e quantidade textual são obrigatórios.");
      return;
    }

    try {
      setCreatingNeed(true);
      await onCreate(campaign.id, {
        name: newNeedDraft.name.trim(),
        description: newNeedDraft.description.trim() || undefined,
        quantity: newNeedDraft.quantity.trim(),
        targetQuantityExact,
        unitValueCents,
        type: newNeedDraft.type,
        priority: newNeedDraft.priority,
      });
      setIsCreatingNeed(false);
      setNewNeedDraft({
        name: "",
        quantity: "",
        targetQuantityExact: "",
        unitValue: "",
        type: "material",
        priority: "medium",
        description: "",
      });
    } finally {
      setCreatingNeed(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => onOpenChange(false)}>
      <div className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[#e1e6df] bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#243128]">Gerenciar itens para doar</h2>
            <p className="mt-1 text-sm text-[#66736a]">Edite, remova ou ajuste os itens de doação desta campanha aqui.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>

        <div className="mt-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#334139]">Itens cadastrados</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCreatingNeed((current) => !current)}>
              {isCreatingNeed ? "Cancelar" : "+ Adicionar item"}
            </Button>
          </div>

          {isCreatingNeed ? (
            <div className="mb-4 rounded-lg border border-[#e1e6df] bg-[#f8fbf6] p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ITEM *">
                  <Input value={newNeedDraft.name} onChange={(event) => setNewNeedDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: TIJOLO CERÂMICO" />
                </Field>
                <Field label="QUANTIDADE TEXTUAL *">
                  <Input value={newNeedDraft.quantity} onChange={(event) => setNewNeedDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="Ex.: 3.700 unidades" />
                </Field>
                <Field label="META EXATA (unidades) *">
                  <Input type="number" min={1} step={1} value={newNeedDraft.targetQuantityExact} onChange={(event) => setNewNeedDraft((current) => ({ ...current, targetQuantityExact: event.target.value }))} placeholder="Ex.: 3700" />
                </Field>
                <Field label="VALOR UNITÁRIO (R$) *">
                  <Input inputMode="decimal" value={newNeedDraft.unitValue} onChange={(event) => setNewNeedDraft((current) => ({ ...current, unitValue: event.target.value }))} placeholder="Ex.: 1,80" />
                </Field>
                <Field label="Tipo">
                  <Select value={newNeedDraft.type} onValueChange={(type: typeof newNeedDraft.type) => setNewNeedDraft((current) => ({ ...current, type }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="labor">Mão de obra</SelectItem>
                      <SelectItem value="equipment">Equipamento</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Prioridade">
                  <Select value={newNeedDraft.priority} onValueChange={(priority: typeof newNeedDraft.priority) => setNewNeedDraft((current) => ({ ...current, priority }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="low">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Descrição (opcional)">
                <Textarea rows={2} value={newNeedDraft.description} onChange={(event) => setNewNeedDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Detalhes do item" />
              </Field>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsCreatingNeed(false)}>Cancelar</Button>
                <Button type="button" size="sm" disabled={creatingNeed} onClick={() => void saveNewNeed()}>{creatingNeed ? "Salvando..." : "Salvar item"}</Button>
              </div>
            </div>
          ) : null}

          {needsQuery.isLoading && !localNeedsForCampaign.length ? (
            <p className="text-sm text-[#66736a]">Carregando itens...</p>
          ) : needsQuery.isError && !localNeedsForCampaign.length ? (
            <p className="text-sm text-red-600">Erro ao carregar itens.</p>
          ) : needsForDisplay.length ? (
            <div className="space-y-3">
              {needsForDisplay.map((need) => {
                const draft = editDrafts[need.id];
                const isEditing = editingNeedId === need.id;

                return (
                  <div key={need.id} className="rounded-lg border border-[#e1e6df] p-3">
                    {isEditing && draft ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="ITEM *">
                            <Input
                              value={draft.name}
                              onChange={(event) => setEditDrafts((current) => ({ ...current, [need.id]: { ...current[need.id], name: event.target.value } }))}
                              placeholder="Ex.: TIJOLO CERÂMICO"
                            />
                          </Field>
                          <Field label="QUANTIDADE TEXTUAL *">
                            <Input
                              value={draft.quantity}
                              onChange={(event) => setEditDrafts((current) => ({ ...current, [need.id]: { ...current[need.id], quantity: event.target.value } }))}
                              placeholder="Ex.: 3.700 unidades"
                            />
                          </Field>
                          <Field label="META EXATA (unidades) *">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={draft.targetQuantityExact}
                              onChange={(event) => setEditDrafts((current) => ({ ...current, [need.id]: { ...current[need.id], targetQuantityExact: event.target.value } }))}
                              placeholder="Ex.: 3700"
                            />
                          </Field>
                          <Field label="VALOR UNITÁRIO (R$) *">
                            <Input
                              inputMode="decimal"
                              value={draft.unitValue}
                              onChange={(event) => setEditDrafts((current) => ({ ...current, [need.id]: { ...current[need.id], unitValue: event.target.value } }))}
                              placeholder="Ex.: 1,80"
                            />
                          </Field>
                          <Field label="Tipo">
                            <Select
                              value={draft.type}
                              onValueChange={(type: typeof draft.type) => setEditDrafts((current) => ({ ...current, [need.id]: { ...current[need.id], type } }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="material">Material</SelectItem>
                                <SelectItem value="labor">Mão de obra</SelectItem>
                                <SelectItem value="equipment">Equipamento</SelectItem>
                                <SelectItem value="other">Outro</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Prioridade">
                            <Select
                              value={draft.priority}
                              onValueChange={(priority: typeof draft.priority) => setEditDrafts((current) => ({ ...current, [need.id]: { ...current[need.id], priority } }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="high">Alta</SelectItem>
                                <SelectItem value="medium">Média</SelectItem>
                                <SelectItem value="low">Baixa</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        </div>
                        <Field label="Descrição (opcional)">
                          <Textarea
                            rows={2}
                            value={draft.description}
                            onChange={(event) => setEditDrafts((current) => ({ ...current, [need.id]: { ...current[need.id], description: event.target.value } }))}
                            placeholder="Detalhes do item"
                          />
                        </Field>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditingNeedId(null)}>Cancelar</Button>
                          <Button type="button" size="sm" disabled={savingNeedId === need.id} onClick={() => void saveEditing(need)}>
                            {savingNeedId === need.id ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#243128]">{need.name}</p>
                          {need.quantity && <p className="text-xs text-[#66736a]">{need.quantity}</p>}
                          {need.targetQuantityExact != null ? <p className="text-xs font-medium text-[#228B22]">Meta por item: {need.targetQuantityExact} unidades</p> : null}
                          {need.unitValueCents ? <p className="text-xs text-[#66736a]">Valor unit.: {(need.unitValueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p> : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => startEditing(need)}>Editar</Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1 text-red-700 hover:text-red-800"
                            onClick={() => void onDelete(need.id, campaign.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Excluir
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[#d7dfd4] bg-[#f8fbf6] p-4 text-sm text-[#66736a]">
              <p className="font-semibold text-[#334139]">Ainda não há itens para esta campanha.</p>
              <p className="mt-1">Cadastre o primeiro item aqui para definir a meta por item e o valor unitário.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2"><span className="text-sm font-semibold text-[#334139]">{label}</span>{children}</label>; }
function LoadingCard({ label }: { label: string }) { return <Card className="p-8 text-center text-[#66736a]">{label}</Card>; }
function ErrorCard({ label, onRetry }: { label: string; onRetry: () => void }) { return <Card className="p-8 text-center"><p className="text-[#66736a]">{label}</p><Button variant="outline" className="mt-4" onClick={onRetry}>Tentar novamente</Button></Card>; }
function EmptyCard({ icon: Icon, title, description, action }: { icon: typeof Building2; title: string; description: string; action: React.ReactNode }) { return <Card className="border-dashed p-10 text-center"><Icon className="mx-auto h-10 w-10 text-[#228B22]" /><h3 className="mt-4 text-xl font-bold text-[#243128]">{title}</h3><p className="mx-auto mt-2 max-w-xl text-[#66736a]">{description}</p><div className="mt-5">{action}</div></Card>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div><p className="text-[#7a877e]">{label}</p><p className={`mt-1 font-semibold ${accent ? "text-[#228B22]" : "text-[#243128]"}`}>{value}</p></div>; }
function formatCurrency(value: number) { return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function StatusBadge({ status }: { status: string }) { const labels: Record<string, string> = { active: "Ativa", completed: "Concluída", paused: "Pausada", archived: "Arquivada" }; return <Badge variant="secondary">{labels[status] ?? status}</Badge>; }
function parseMediaUrlsInput(value: string) { return value.split(/[\n,]/).map((url) => url.trim()).filter(Boolean); }

function normalizeVipMediaUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/") || trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (trimmed.startsWith("www.") || trimmed.startsWith("youtube.com/") || trimmed.startsWith("youtu.be/")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isAllowedVipMediaUrl(value: string) {
  if (value.startsWith("/") || value.startsWith("data:")) return true;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseVipMediaUrlsInput(value: string) {
  const entries = value.split(/[\n,]/)
    .map((url) => normalizeVipMediaUrlInput(url))
    .filter(Boolean);

  const invalid = entries.filter((entry) => !isAllowedVipMediaUrl(entry));
  const valid = entries.filter((entry) => isAllowedVipMediaUrl(entry));

  return {
    values: Array.from(new Set(valid)),
    invalid,
  };
}

function appendMediaValues(currentValues: string[] | string, nextValues: string[]) {
  const normalizedCurrent = typeof currentValues === "string"
    ? currentValues.split(/\n|,/).map((value) => value.trim()).filter(Boolean)
    : currentValues.map((value) => value.trim()).filter(Boolean);

  const next = Array.from(new Set([...normalizedCurrent, ...nextValues.map((value) => value.trim()).filter(Boolean)]));
  return next;
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;

  const onlyAllowed = normalized.replace(/\s/g, "");
  if (!/^[-+]?\d{1,3}(\.\d{3})*(,\d{0,2})?$|^[-+]?\d+(,\d{0,2})?$|^[-+]?\d+(\.\d{0,2})?$/.test(onlyAllowed)) {
    return null;
  }

  const hasComma = onlyAllowed.includes(",");
  const normalizedNumber = hasComma
    ? onlyAllowed.replace(/\./g, "").replace(",", ".")
    : onlyAllowed;
  const parsed = Number(normalizedNumber);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Math.round(parsed * 100);
}

const SUPPORTED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"] as const;
type SupportedVideoMimeType = (typeof SUPPORTED_VIDEO_MIME_TYPES)[number];

function inferSupportedVideoMimeType(file: File): SupportedVideoMimeType | null {
  const fileType = (file.type ?? "").toLowerCase();
  if (SUPPORTED_VIDEO_MIME_TYPES.includes(fileType as SupportedVideoMimeType)) {
    return fileType as SupportedVideoMimeType;
  }

  // Alguns navegadores retornam MIME vazio ou não padronizado para MOV/MP4.
  const normalizedName = file.name.trim().toLowerCase();
  if (normalizedName.endsWith(".mov") || fileType === "video/mov") return "video/quicktime";
  if (normalizedName.endsWith(".webm")) return "video/webm";
  if (normalizedName.endsWith(".ogv") || normalizedName.endsWith(".ogg")) return "video/ogg";
  if (normalizedName.endsWith(".mp4") || normalizedName.endsWith(".m4v") || fileType === "video/x-m4v") return "video/mp4";

  return null;
}

function compressImageFile(file: File, maxDimension = 1920, quality = 0.82): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Não foi possível reduzir a imagem."));
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = objectUrl;
  });
}

async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 1.5 * 1024 * 1024) {
    return file;
  }

  try {
    let result = await compressImageFile(file);
    if (result.size > 8 * 1024 * 1024) {
      result = await compressImageFile(file, 1280, 0.7);
    }
    return result;
  } catch {
    return file;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      if (!base64) {
        reject(new Error("Não foi possível ler o arquivo."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}
