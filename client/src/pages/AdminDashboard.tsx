import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Building2, Edit2, ExternalLink, FileText, Handshake, Megaphone, PackagePlus, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
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
  description: "",
  logoUrl: "",
  website: "",
};

const EMPTY_CAMPAIGN_EDIT_FORM = {
  title: "",
  description: "",
  longDescription: "",
  goal: "",
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
  const isAdmin = user?.role === "admin";
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
    imageUrl: "",
  });
  const [campaignEditForm, setCampaignEditForm] = useState(EMPTY_CAMPAIGN_EDIT_FORM);
  const [campaignUpdateForm, setCampaignUpdateForm] = useState(EMPTY_UPDATE_FORM);
  const [campaignNeedForm, setCampaignNeedForm] = useState(EMPTY_NEED_FORM);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER_FORM);

  const campaignsQuery = trpc.campaigns.getAll.useQuery(undefined, { enabled: isAdmin });
  const partnersQuery = trpc.partners.getAll.useQuery(undefined, { enabled: isAdmin });
  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: async () => {
      toast.success("Campanha criada com sucesso!");
      setCampaignForm({ title: "", description: "", longDescription: "", goal: "", imageUrl: "" });
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
      description: partner.description ?? "",
      logoUrl: partner.logoUrl ?? "",
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
    const goal = Number(campaignForm.goal.replace(",", "."));
    if (!Number.isFinite(goal) || goal <= 0) {
      toast.error("Informe uma meta válida");
      return;
    }
    createCampaign.mutate({
      title: campaignForm.title,
      description: campaignForm.description,
      longDescription: campaignForm.longDescription,
      goal: Math.round(goal * 100),
      imageUrl: campaignForm.imageUrl || undefined,
    });
  }

  function handleUpdateCampaign(event: React.FormEvent) {
    event.preventDefault();
    if (!editingCampaignId) return;
    const goal = Number(campaignEditForm.goal.replace(",", "."));
    if (!Number.isFinite(goal) || goal <= 0) {
      toast.error("Informe uma meta válida");
      return;
    }
    updateCampaign.mutate({
      id: editingCampaignId,
      title: campaignEditForm.title,
      description: campaignEditForm.description,
      longDescription: campaignEditForm.longDescription,
      goal: Math.round(goal * 100),
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
      description: partnerForm.description || undefined,
      logoUrl: partnerForm.logoUrl || undefined,
      website: partnerForm.website || undefined,
    };
    if (editingPartnerId) updatePartner.mutate({ id: editingPartnerId, ...values });
    else createPartner.mutate(values);
  }

  const partnerMutationPending = createPartner.isPending || updatePartner.isPending;

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
                      <Field label="Meta (R$) *"><Input inputMode="decimal" value={campaignForm.goal} onChange={(event) => setCampaignForm({ ...campaignForm, goal: event.target.value })} required /></Field>
                      <Field label="URL da imagem"><Input type="url" value={campaignForm.imageUrl} onChange={(event) => setCampaignForm({ ...campaignForm, imageUrl: event.target.value })} placeholder="https://..." /></Field>
                    </div>
                    <div className="flex justify-end gap-3 pt-3"><Button type="button" variant="outline" onClick={() => setIsCreateCampaignOpen(false)}>Cancelar</Button><Button type="submit" disabled={createCampaign.isPending}>{createCampaign.isPending ? "Criando..." : "Criar campanha"}</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
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
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><h2 className="text-2xl font-bold text-[#243128]">Parceiros</h2><p className="mt-1 text-[#66736a]">Somente estes registros aparecem na vitrine pública.</p></div>
              <Button onClick={openNewPartner} className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]"><Plus className="h-4 w-4" /> Novo parceiro</Button>
            </div>
            {partnersQuery.isLoading ? <LoadingCard label="Carregando parceiros..." /> : partnersQuery.isError ? <ErrorCard label="Não foi possível carregar os parceiros." onRetry={() => partnersQuery.refetch()} /> : partnersQuery.data?.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {partnersQuery.data.map((partner) => (
                  <Card key={partner.id} className="p-5">
                    <div className="flex gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef4ec] p-2">{partner.logoUrl ? <img src={partner.logoUrl} alt="" className="h-full w-full object-contain" /> : <Handshake className="h-7 w-7 text-[#228B22]" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-[#243128]">{partner.name}</h3><Badge variant="secondary">{partner.type === "company" ? "Empresa" : "Profissional"}</Badge></div>{partner.description && <p className="mt-2 line-clamp-2 text-sm text-[#66736a]">{partner.description}</p>}{partner.website && <a href={partner.website} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#228B22] hover:underline">Abrir site <ExternalLink className="h-3.5 w-3.5" /></a>}</div></div>
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
                <Field label="Meta (R$) *"><Input inputMode="decimal" value={campaignEditForm.goal} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, goal: event.target.value })} required /></Field>
                <Field label="Status *"><Select value={campaignEditForm.status} onValueChange={(status: typeof campaignEditForm.status) => setCampaignEditForm({ ...campaignEditForm, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativa</SelectItem><SelectItem value="paused">Pausada</SelectItem><SelectItem value="completed">Concluída</SelectItem><SelectItem value="archived">Arquivada</SelectItem></SelectContent></Select></Field>
              </div>
              <Field label="URL da imagem"><Input type="url" value={campaignEditForm.imageUrl} onChange={(event) => setCampaignEditForm({ ...campaignEditForm, imageUrl: event.target.value })} placeholder="https://..." /></Field>
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
              <Field label="Descrição"><Textarea value={partnerForm.description} onChange={(event) => setPartnerForm({ ...partnerForm, description: event.target.value })} rows={4} maxLength={1500} /></Field>
              <Field label="URL da logomarca"><Input type="url" value={partnerForm.logoUrl} onChange={(event) => setPartnerForm({ ...partnerForm, logoUrl: event.target.value })} placeholder="https://..." /></Field>
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
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir parceiro?</AlertDialogTitle><AlertDialogDescription>O registro de <strong>{partnerToDelete?.name}</strong> será removido da vitrine pública. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-700 hover:bg-red-800" disabled={deletePartner.isPending} onClick={() => partnerToDelete && deletePartner.mutate({ id: partnerToDelete.id })}>{deletePartner.isPending ? "Excluindo..." : "Excluir parceiro"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
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
