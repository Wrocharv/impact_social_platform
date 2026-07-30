import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Building2, CheckCircle2, Edit2, ExternalLink, FileText, Handshake, Megaphone, PackagePlus, Plus, Trash2, XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminUser } from "@/_core/hooks/adminAccess";
import CampaignAccountabilityDialog from "@/components/admin/CampaignAccountabilityDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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

const EMPTY_CAMPAIGN_EDIT_FORM = {
  title: "",
  description: "",
  longDescription: "",
  goal: "",
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
  priority: "medium" as "high" | "medium" | "low",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = isAdminUser(user, ["gospeltv@gmail.com"]);
  const isLocalhost = window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1");
  const [activeTab, setActiveTab] = useState<"campaigns" | "partners">(() =>
    new URLSearchParams(window.location.search).get("tab") === "partners" ? "partners" : "campaigns",
  );
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [isEditCampaignOpen, setIsEditCampaignOpen] = useState(false);
  const [isCampaignUpdateOpen, setIsCampaignUpdateOpen] = useState(false);
  const [isCampaignNeedOpen, setIsCampaignNeedOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: number; title: string } | null>(null);
  const [accountabilityCampaign, setAccountabilityCampaign] = useState<{ id: number; title: string } | null>(null);
  const [isPartnerOpen, setIsPartnerOpen] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [partnerToDelete, setPartnerToDelete] = useState<{ id: number; name: string } | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    description: "",
    longDescription: "",
    goal: "",
    initialRaised: "",
    imageUrl: "",
  });
  const [campaignEditForm, setCampaignEditForm] = useState(EMPTY_CAMPAIGN_EDIT_FORM);
  const [campaignUpdateForm, setCampaignUpdateForm] = useState(EMPTY_UPDATE_FORM);
  const [campaignNeedForm, setCampaignNeedForm] = useState(EMPTY_NEED_FORM);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER_FORM);
  const [cashValidationNotes, setCashValidationNotes] = useState<Record<number, string>>({});

  const campaignsQuery = trpc.campaigns.getAll.useQuery(undefined, { enabled: isAdmin });
  const partnersQuery = trpc.partners.getAll.useQuery(undefined, { enabled: isAdmin });
  const pendingCashQuery = trpc.contributions.getPendingCashValidations.useQuery(undefined, { enabled: isAdmin });
  const recentCashQuery = trpc.contributions.getRecentCashValidations.useQuery({ limit: 20 }, { enabled: isAdmin });
  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: async () => {
      toast.success("Campanha criada com sucesso!");
      setCampaignForm({ title: "", description: "", longDescription: "", goal: "", initialRaised: "", imageUrl: "" });
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
  const uploadPartnerImage = trpc.partners.uploadImage.useMutation({
    onError: (error) => toast.error(error.message || "Erro ao enviar imagem"),
  });
  const uploadCampaignImage = trpc.campaigns.uploadImage.useMutation({
    onError: (error) => toast.error(error.message || "Erro ao enviar imagem da campanha"),
  });
  const [uploadingPartnerField, setUploadingPartnerField] = useState<"logoUrl" | "storePhotoUrl" | "ownerPhotoUrl" | null>(null);
  const [uploadingCampaignImage, setUploadingCampaignImage] = useState<"create" | "edit" | null>(null);

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
    setEditingCampaignId(campaign.id);
    setCampaignEditForm({
      title: campaign.title,
      description: campaign.description,
      longDescription: campaign.longDescription ?? "",
      goal: String(campaign.goal / 100).replace(".", ","),
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

    createCampaign.mutate({
      title: campaignForm.title,
      description: campaignForm.description,
      longDescription: campaignForm.longDescription,
      goal: goalInCents,
      initialRaised: initialRaisedInCents,
      imageUrl: campaignForm.imageUrl || undefined,
    });
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

    updateCampaign.mutate({
      id: editingCampaignId,
      title: campaignEditForm.title,
      description: campaignEditForm.description,
      longDescription: campaignEditForm.longDescription,
      goal: goalInCents,
      initialRaised: initialRaisedInCents,
      imageUrl: campaignEditForm.imageUrl || null,
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

  function handleCreateCampaignNeed(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCampaign) return;
    createCampaignNeed.mutate({
      campaignId: selectedCampaign.id,
      type: campaignNeedForm.type,
      name: campaignNeedForm.name,
      description: campaignNeedForm.description || undefined,
      quantity: campaignNeedForm.quantity,
      priority: campaignNeedForm.priority,
    });
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

  async function handleCampaignImageUpload(target: "create" | "edit", file?: File) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB.");
      return;
    }

    setUploadingCampaignImage(target);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadCampaignImage.mutateAsync({
        fileName: file.name,
        mimeType: (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") ? file.type : "image/png",
        size: file.size,
        base64,
      });

      if (target === "create") {
        setCampaignForm((current) => ({ ...current, imageUrl: result.url }));
      } else {
        setCampaignEditForm((current) => ({ ...current, imageUrl: result.url }));
      }

      toast.success("Imagem da campanha enviada com sucesso.");
    } finally {
      setUploadingCampaignImage(null);
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

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "campaigns" | "partners")} className="space-y-7">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-[#eaf1e8] p-1 sm:w-auto">
            <TabsTrigger value="campaigns" className="min-h-11 gap-2 px-5"><Building2 className="h-4 w-4" /> Campanhas</TabsTrigger>
            <TabsTrigger value="partners" className="min-h-11 gap-2 px-5"><Handshake className="h-4 w-4" /> Parceiros</TabsTrigger>
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
              <Dialog open={isCreateCampaignOpen} onOpenChange={setIsCreateCampaignOpen}>
                <DialogTrigger asChild><Button className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]"><Plus className="h-4 w-4" /> Nova campanha</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Criar nova campanha</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreateCampaign} className="space-y-4">
                    <Field label="Título *"><Input value={campaignForm.title} onChange={(event) => setCampaignForm({ ...campaignForm, title: event.target.value })} required minLength={5} /></Field>
                    <Field label="Descrição curta *"><Textarea value={campaignForm.description} onChange={(event) => setCampaignForm({ ...campaignForm, description: event.target.value })} required minLength={20} rows={2} /></Field>
                    <Field label="Descrição longa *"><Textarea value={campaignForm.longDescription} onChange={(event) => setCampaignForm({ ...campaignForm, longDescription: event.target.value })} required minLength={50} rows={5} /></Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Meta (R$) *"><Input inputMode="decimal" value={campaignForm.goal} onChange={(event) => setCampaignForm({ ...campaignForm, goal: event.target.value })} required placeholder="Ex.: 50.000,00" /></Field>
                      <Field label="Arrecadação inicial (R$)"><Input inputMode="decimal" value={campaignForm.initialRaised} onChange={(event) => setCampaignForm({ ...campaignForm, initialRaised: event.target.value })} placeholder="Ex.: 12.350,90" /></Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Imagem da campanha (arquivo)">
                        <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleCampaignImageUpload("create", event.target.files?.[0])} />
                        {uploadingCampaignImage === "create" && <p className="text-xs text-[#66736a]">Enviando imagem...</p>}
                        {campaignForm.imageUrl && <p className="text-xs text-[#228B22] break-all">Arquivo enviado: {campaignForm.imageUrl}</p>}
                      </Field>
                      <Field label="Caminho da imagem na raiz (opcional)">
                        <Input
                          value={campaignForm.imageUrl}
                          onChange={(event) => setCampaignForm({ ...campaignForm, imageUrl: event.target.value })}
                          placeholder="Ex.: /obra-paredes.jpg"
                        />
                        <p className="mt-1 text-xs text-[#66736a]">Use um caminho da raiz do site (começando com /) ou envie pelo campo de arquivo.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setCampaignForm((current) => ({ ...current, imageUrl: "/obra-paredes.jpg" }))}>Usar imagem padrão da raiz</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setCampaignForm((current) => ({ ...current, imageUrl: "" }))}>Limpar caminho</Button>
                        </div>
                      </Field>
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

            <div className="space-y-4">
              {campaignsQuery.isLoading ? <LoadingCard label="Carregando campanhas..." /> : campaignsQuery.isError ? <ErrorCard label="Não foi possível carregar as campanhas." onRetry={() => campaignsQuery.refetch()} /> : campaignsQuery.data?.length ? campaignsQuery.data.map((campaign) => (
                <Card key={campaign.id} className="p-5 md:p-6">
                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-bold text-[#243128]">{campaign.title}</h3><StatusBadge status={campaign.status} /></div><p className="mt-2 text-[#66736a]">{campaign.description}</p><div className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><Metric label="Meta" value={formatCurrency(campaign.goal)} /><Metric label="Arrecadado" value={formatCurrency(campaign.raised)} accent /><Metric label="Progresso" value={`${campaign.progress}%`} /></div></div>
                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openEditCampaign(campaign)}><Edit2 className="h-4 w-4" /> Editar</Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openCampaignUpdate(campaign)}><Megaphone className="h-4 w-4" /> Publicar evolução</Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openCampaignNeed(campaign)}><PackagePlus className="h-4 w-4" /> Necessidade</Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setAccountabilityCampaign({ id: campaign.id, title: campaign.title })}><FileText className="h-4 w-4" /> Prestação de contas</Button>
                      <Button asChild variant="ghost" size="sm" className="gap-2"><Link href={`/campaign/${campaign.id}`}><ExternalLink className="h-4 w-4" /> Ver no site</Link></Button>
                    </div>
                  </div>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status *"><Select value={campaignEditForm.status} onValueChange={(status: typeof campaignEditForm.status) => setCampaignEditForm({ ...campaignEditForm, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativa</SelectItem><SelectItem value="paused">Pausada</SelectItem><SelectItem value="completed">Concluída</SelectItem><SelectItem value="archived">Arquivada</SelectItem></SelectContent></Select></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Imagem da campanha (arquivo)">
                  <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleCampaignImageUpload("edit", event.target.files?.[0])} />
                  {uploadingCampaignImage === "edit" && <p className="text-xs text-[#66736a]">Enviando imagem...</p>}
                  {campaignEditForm.imageUrl && <p className="text-xs text-[#228B22] break-all">Arquivo enviado: {campaignEditForm.imageUrl}</p>}
                </Field>
                <Field label="Caminho da imagem na raiz (opcional)">
                  <Input
                    value={campaignEditForm.imageUrl}
                    onChange={(event) => setCampaignEditForm({ ...campaignEditForm, imageUrl: event.target.value })}
                    placeholder="Ex.: /obra-paredes.jpg"
                  />
                  <p className="mt-1 text-xs text-[#66736a]">Use um caminho da raiz do site (começando com /) ou envie pelo campo de arquivo.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setCampaignEditForm((current) => ({ ...current, imageUrl: "/obra-paredes.jpg" }))}>Usar imagem padrão da raiz</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCampaignEditForm((current) => ({ ...current, imageUrl: "" }))}>Limpar caminho</Button>
                  </div>
                </Field>
              </div>
              <p className="rounded-lg bg-[#fff8e6] p-3 text-sm text-[#70571a]">Campanhas pausadas ou arquivadas deixam de aparecer nas áreas públicas. Campanhas concluídas continuam disponíveis para prestação de contas.</p>
              <div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={closeEditCampaignDialog}>Cancelar</Button><Button type="submit" disabled={updateCampaign.isPending}>{updateCampaign.isPending ? "Salvando..." : "Salvar alterações"}</Button></div>
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
                <Field label="URLs de imagens"><Textarea value={campaignUpdateForm.imageUrls} onChange={(event) => setCampaignUpdateForm({ ...campaignUpdateForm, imageUrls: event.target.value })} rows={4} placeholder="Uma URL HTTPS por linha" /></Field>
                <Field label="URLs de vídeos"><Textarea value={campaignUpdateForm.videoUrls} onChange={(event) => setCampaignUpdateForm({ ...campaignUpdateForm, videoUrls: event.target.value })} rows={4} placeholder="Uma URL HTTPS por linha" /></Field>
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
              <Field label="Quantidade *"><Input value={campaignNeedForm.quantity} onChange={(event) => setCampaignNeedForm({ ...campaignNeedForm, quantity: event.target.value })} required placeholder="Ex.: 20 sacos ou 2 voluntários" /></Field>
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
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handlePartnerImageUpload("logoUrl", event.target.files?.[0])} />
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
              <Field label="URL do vídeo de testemunho"><Input type="url" value={partnerForm.testimonialVideoUrl} onChange={(event) => setPartnerForm({ ...partnerForm, testimonialVideoUrl: event.target.value })} placeholder="https://..." /></Field>
              <Field label="Texto do testemunho"><Textarea value={partnerForm.testimonialText} onChange={(event) => setPartnerForm({ ...partnerForm, testimonialText: event.target.value })} rows={4} maxLength={2000} placeholder="Depoimento convidando mais pessoas para a parceria" /></Field>
              <Field label="Site"><Input type="url" value={partnerForm.website} onChange={(event) => setPartnerForm({ ...partnerForm, website: event.target.value })} placeholder="https://..." /></Field>
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
      </div>
    </DashboardLayout>
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
