import { useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Camera, ChevronDown, ChevronLeft, Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminUser } from "@/_core/hooks/adminAccess";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AdminMobilePage() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user, ["gospeltv@gmail.com"]);

  const [activeTab, setActiveTab] = useState<"campaigns" | "create">(() => "campaigns");
  const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(null);

  // Form states
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    description: "",
    longDescription: "",
    category: "outro" as any,
    goal: "",
    vipApartmentAmount: "",
    helpTierOptions: ["material", "financial", "vip"] as Array<"material" | "financial" | "vip">,
    imageUrl: "",
  });

  const [updateForm, setUpdateForm] = useState({
    campaignId: "" as any,
    title: "",
    description: "",
    phase: "during" as "before" | "during" | "after",
    imageUrls: "",
  });

  const [needForm, setNeedForm] = useState({
    campaignId: "" as any,
    type: "material" as any,
    name: "",
    description: "",
    quantity: "",
    targetQuantityExact: "",
    unitValue: "",
    priority: "high" as any,
  });

  // Queries
  const campaignsQuery = trpc.campaigns.getAll.useQuery(undefined, { enabled: isAdmin });
  const campaigns = campaignsQuery.data ?? [];

  // Mutations
  const createCampaignMutation = trpc.campaigns.create.useMutation({
    onSuccess: async () => {
      toast.success("✅ Campanha criada!");
      setCampaignForm({ title: "", description: "", longDescription: "", category: "outro", goal: "", vipApartmentAmount: "", helpTierOptions: ["material", "financial", "vip"], imageUrl: "" });
      setActiveTab("campaigns");
      await campaignsQuery.refetch();
    },
    onError: (err) => toast.error(`❌ ${err.message}`),
  });

  const createUpdateMutation = trpc.campaigns.createUpdate.useMutation({
    onSuccess: async () => {
      toast.success("✅ Atualização publicada!");
      setUpdateForm({ campaignId: "", title: "", description: "", phase: "during", imageUrls: "" });
      await campaignsQuery.refetch();
    },
    onError: (err) => toast.error(`❌ ${err.message}`),
  });

  const createNeedMutation = trpc.campaigns.createNeed.useMutation({
    onSuccess: async () => {
      toast.success("✅ Necessidade registrada!");
      setNeedForm({ campaignId: "", type: "material", name: "", description: "", quantity: "", targetQuantityExact: "", unitValue: "", priority: "high" });
      await campaignsQuery.refetch();
    },
    onError: (err) => toast.error(`❌ ${err.message}`),
  });

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8faf7] p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h1 className="mb-2 text-xl font-bold">Acesso negado</h1>
          <p className="mb-6 text-[#666]">Você precisa ser administrador</p>
          <Link href="/" className="inline-block text-[#228B22] font-semibold hover:underline">
            ← Voltar ao início
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#e7e7e7] bg-white py-4 shadow-sm">
        <div className="container max-w-2xl px-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-[#2d2d2d]">Gerenciar Campanhas</h1>
            <Link href="/" className="text-[#228B22] hover:underline">
              Sair
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container max-w-2xl px-4 py-6">
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="campaigns">Campanhas ({campaigns.length})</TabsTrigger>
            <TabsTrigger value="create">+ Criar</TabsTrigger>
          </TabsList>

          {/* CAMPANHAS EXISTENTES */}
          <TabsContent value="campaigns" className="space-y-3">
            {campaignsQuery.isLoading && <div className="text-center py-8 text-[#666]">Carregando...</div>}

            {campaigns.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-[#666] mb-4">Nenhuma campanha criada ainda</p>
                <Button onClick={() => setActiveTab("create")} className="w-full bg-[#228B22]">
                  + Criar primeira campanha
                </Button>
              </Card>
            )}

            {campaigns.map((campaign) => (
              <Card key={campaign.id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedCampaignId(expandedCampaignId === campaign.id ? null : campaign.id)}
                  className="w-full p-4 text-left hover:bg-[#f9f9f9] transition flex items-center justify-between"
                >
                  <div className="flex-1">
                    <h3 className="font-bold text-[#2d2d2d] mb-1">{campaign.title}</h3>
                    <p className="text-sm text-[#666] line-clamp-1">{campaign.description}</p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-[#666] transition ${expandedCampaignId === campaign.id ? "rotate-180" : ""}`}
                  />
                </button>

                {expandedCampaignId === campaign.id && (
                  <div className="border-t border-[#e7e7e7] bg-[#fafafa] p-4 space-y-3">
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-3 rounded border border-[#e7e7e7]">
                        <p className="text-xs text-[#666]">Arrecadado</p>
                        <p className="font-bold text-[#228B22]">R$ {(campaign.raised / 100).toFixed(2)}</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-[#e7e7e7]">
                        <p className="text-xs text-[#666]">Meta</p>
                        <p className="font-bold text-[#2d2d2d]">R$ {(campaign.goal / 100).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Atualizações */}
                    <div>
                      <label className="text-sm font-semibold text-[#2d2d2d] mb-2 block">Publicar Atualização</label>
                      <div className="space-y-2">
                        <Input
                          placeholder="Título da atualização"
                          value={updateForm.campaignId === campaign.id ? updateForm.title : ""}
                          onChange={(e) => {
                            setUpdateForm({ ...updateForm, campaignId: campaign.id, title: e.target.value });
                          }}
                          className="text-sm"
                        />
                        <Textarea
                          placeholder="Descrição da atualização"
                          value={updateForm.campaignId === campaign.id ? updateForm.description : ""}
                          onChange={(e) => {
                            setUpdateForm({ ...updateForm, campaignId: campaign.id, description: e.target.value });
                          }}
                          className="min-h-20 text-sm"
                        />
                        <Select value={updateForm.phase} onValueChange={(v: any) => setUpdateForm({ ...updateForm, phase: v })}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="before">🔨 Antes (Planejamento)</SelectItem>
                            <SelectItem value="during">⚙️ Durante (Em andamento)</SelectItem>
                            <SelectItem value="after">✅ Depois (Concluído)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() => {
                            if (!updateForm.title || !updateForm.description) {
                              toast.error("Preencha título e descrição");
                              return;
                            }
                            createUpdateMutation.mutate({
                              campaignId: campaign.id,
                              title: updateForm.title,
                              description: updateForm.description,
                              phase: updateForm.phase,
                              imageUrls: updateForm.imageUrls ? updateForm.imageUrls.split(",") : [],
                              videoUrls: [],
                            });
                          }}
                          disabled={createUpdateMutation.isPending}
                          className="w-full bg-[#228B22]"
                          size="sm"
                        >
                          {createUpdateMutation.isPending ? "Publicando..." : "📸 Publicar Atualização"}
                        </Button>
                      </div>
                    </div>

                    {/* Necessidades */}
                    <div>
                      <label className="text-sm font-semibold text-[#2d2d2d] mb-2 block">Registrar Necessidade</label>
                      <div className="space-y-2">
                        <Input
                          placeholder="Nome da necessidade (ex: Cimento)"
                          value={needForm.campaignId === campaign.id ? needForm.name : ""}
                          onChange={(e) => {
                            setNeedForm({ ...needForm, campaignId: campaign.id, name: e.target.value });
                          }}
                          className="text-sm"
                        />
                        <Textarea
                          placeholder="Descrição da necessidade"
                          value={needForm.campaignId === campaign.id ? needForm.description : ""}
                          onChange={(e) => {
                            setNeedForm({ ...needForm, campaignId: campaign.id, description: e.target.value });
                          }}
                          className="min-h-16 text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Meta exata (ex: 3700)"
                            type="number"
                            min={1}
                            value={needForm.campaignId === campaign.id ? needForm.targetQuantityExact : ""}
                            onChange={(e) => {
                              setNeedForm({ ...needForm, campaignId: campaign.id, targetQuantityExact: e.target.value });
                            }}
                            className="text-sm"
                          />
                          <Input
                            placeholder="Valor unit. (ex: 1,80)"
                            value={needForm.campaignId === campaign.id ? needForm.unitValue : ""}
                            onChange={(e) => {
                              setNeedForm({ ...needForm, campaignId: campaign.id, unitValue: e.target.value });
                            }}
                            className="text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Quantidade textual (opcional)"
                            value={needForm.campaignId === campaign.id ? needForm.quantity : ""}
                            onChange={(e) => {
                              setNeedForm({ ...needForm, campaignId: campaign.id, quantity: e.target.value });
                            }}
                            className="text-sm"
                          />
                          <Select value={needForm.priority} onValueChange={(v: any) => setNeedForm({ ...needForm, priority: v })}>
                            <SelectTrigger className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="high">🔴 Alta</SelectItem>
                              <SelectItem value="medium">🟡 Média</SelectItem>
                              <SelectItem value="low">🟢 Baixa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          onClick={() => {
                            const targetQuantityExact = Number.parseInt(needForm.targetQuantityExact, 10);
                            const unitValueCents = parseCurrencyToCents(needForm.unitValue);

                            if (!needForm.name || !needForm.description || !needForm.quantity || !targetQuantityExact || targetQuantityExact <= 0 || !unitValueCents || unitValueCents <= 0) {
                              toast.error("Preencha nome, descrição, quantidade textual, meta exata e valor unitário");
                              return;
                            }
                            createNeedMutation.mutate({
                              campaignId: campaign.id,
                              type: needForm.type,
                              name: needForm.name,
                              description: needForm.description,
                              quantity: needForm.quantity.trim(),
                              targetQuantityExact,
                              unitValueCents,
                              priority: needForm.priority,
                            });
                          }}
                          disabled={createNeedMutation.isPending}
                          className="w-full bg-[#228B22]"
                          size="sm"
                        >
                          {createNeedMutation.isPending ? "Salvando..." : "✅ Registrar Necessidade"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </TabsContent>

          {/* CRIAR CAMPANHA */}
          <TabsContent value="create" className="space-y-4">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-[#2d2d2d] mb-4">Nova Campanha</h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">Título da Campanha</label>
                  <Input
                    placeholder="ex: Construção Hotel Recanto de Paz"
                    value={campaignForm.title}
                    onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">Descrição Curta</label>
                  <Textarea
                    placeholder="Descrição resumida da campanha"
                    value={campaignForm.description}
                    onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                    className="min-h-20 w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">Descrição Detalhada</label>
                  <Textarea
                    placeholder="Texto completo sobre o projeto"
                    value={campaignForm.longDescription}
                    onChange={(e) => setCampaignForm({ ...campaignForm, longDescription: e.target.value })}
                    className="min-h-24 w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">Categoria</label>
                  <Select value={campaignForm.category} onValueChange={(v) => setCampaignForm({ ...campaignForm, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moradia">🏠 Moradia</SelectItem>
                      <SelectItem value="educacao">📚 Educação</SelectItem>
                      <SelectItem value="saude">🏥 Saúde</SelectItem>
                      <SelectItem value="alimentacao">🍽️ Alimentação</SelectItem>
                      <SelectItem value="infraestrutura">🏗️ Infraestrutura</SelectItem>
                      <SelectItem value="outro">🔹 Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">Meta em Reais (ex: 10000)</label>
                  <Input
                    type="number"
                    placeholder="10000"
                    value={campaignForm.goal}
                    onChange={(e) => setCampaignForm({ ...campaignForm, goal: e.target.value })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">Valor VIP apartamento (R$)</label>
                  <Input
                    placeholder="120.000,00"
                    value={campaignForm.vipApartmentAmount}
                    onChange={(e) => setCampaignForm({ ...campaignForm, vipApartmentAmount: e.target.value })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">Opções de ajuda</label>
                  <div className="grid gap-2 rounded-lg border border-[#dce5d8] bg-[#f8fbf6] p-3">
                    {(["material", "financial", "vip"] as Array<"material" | "financial" | "vip">).map((option) => {
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
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2d2d2d] mb-2">URL da Imagem</label>
                  <Input
                    placeholder="/obra-paredes.jpg"
                    value={campaignForm.imageUrl}
                    onChange={(e) => setCampaignForm({ ...campaignForm, imageUrl: e.target.value })}
                    className="w-full"
                  />
                </div>

                <Button
                  onClick={() => {
                    if (!campaignForm.title || !campaignForm.description || !campaignForm.goal) {
                      toast.error("Preencha todos os campos obrigatórios");
                      return;
                    }

                    const vipApartmentAmountCents = campaignForm.vipApartmentAmount.trim().length > 0
                      ? parseCurrencyToCents(campaignForm.vipApartmentAmount)
                      : 0;
                    if (vipApartmentAmountCents === null || vipApartmentAmountCents < 0) {
                      toast.error("Informe um valor VIP válido");
                      return;
                    }

                    createCampaignMutation.mutate({
                      title: campaignForm.title,
                      description: campaignForm.description,
                      longDescription: campaignForm.longDescription,
                      goal: Math.round(Number(campaignForm.goal) * 100),
                      vipApartmentAmountCents,
                      helpTierOptions: campaignForm.helpTierOptions.length > 0 ? campaignForm.helpTierOptions : ["material", "financial", "vip"],
                      imageUrl: campaignForm.imageUrl || "/obra-paredes.jpg",
                      category: campaignForm.category,
                    });
                  }}
                  disabled={createCampaignMutation.isPending}
                  className="w-full bg-[#228B22] h-12 font-semibold text-white"
                  size="lg"
                >
                  {createCampaignMutation.isPending ? "Criando..." : "✅ Criar Campanha"}
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return 0;
  const onlyAllowed = normalized.replace(/\s/g, "");
  if (!/^[-+]?\d{1,3}(\.\d{3})*(,\d{0,2})?$|^[-+]?\d+(,\d{0,2})?$|^[-+]?\d+(\.\d{0,2})?$/.test(onlyAllowed)) {
    return null;
  }
  const hasComma = onlyAllowed.includes(",");
  const normalizedNumber = hasComma ? onlyAllowed.replace(/\./g, "").replace(",", ".") : onlyAllowed;
  const parsed = Number(normalizedNumber);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}
