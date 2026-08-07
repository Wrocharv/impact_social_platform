import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { getMaterialContributionCopy } from "@/lib/contributionFlow";
import { AlertCircle, ChevronLeft, Heart, Package, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

export default function ContributionPage() {
  const [, params] = useRoute("/contribute/:id");
  const campaignId = Number(params?.id ?? 0);
  const campaignQuery = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: Number.isInteger(campaignId) && campaignId > 0 },
  );
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("");
  const [selectedNeedId, setSelectedNeedId] = useState("");
  const [volunteerDescription, setVolunteerDescription] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const createMaterial = trpc.contributions.createMaterialContribution.useMutation();
  const createVolunteer = trpc.contributions.createVolunteerContribution.useMutation();

  const materialInput = {
    campaignId,
    description: materialDescription,
    donorName,
    donorCpf: "",
    donorEmail,
    donorWhatsapp: "",
    donorCity: "",
    donorChurch: "",
    allowPublicDisplay: false,
    campaignNeedId: selectedNeedId ? Number(selectedNeedId) : undefined,
    quantity: materialQuantity.trim() || undefined,
  };

  const volunteerInput = {
    campaignId,
    description: volunteerDescription,
    donorName,
    donorCpf: "",
    donorEmail,
    donorWhatsapp: "",
    donorCity: "",
    donorChurch: "",
    allowPublicDisplay: false,
  };

  const resetContact = () => {
    setDonorName("");
    setDonorEmail("");
  };

  const campaignNeeds = campaignQuery.data?.needs ?? [];

  const handleMaterialSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createMaterial.mutate(
      materialInput,
      {
        onSuccess: () => {
          toast.success("Oferta de material recebida para análise.");
          setMaterialDescription("");
          setMaterialQuantity("");
          setSelectedNeedId("");
          resetContact();
        },
        onError: (error) => toast.error(error.message || "Não foi possível registrar a oferta."),
      },
    );
  };

  const handleVolunteerSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createVolunteer.mutate(
      volunteerInput,
      {
        onSuccess: () => {
          toast.success("Oferta de voluntariado recebida para análise.");
          setVolunteerDescription("");
          resetContact();
        },
        onError: (error) => toast.error(error.message || "Não foi possível registrar a oferta."),
      },
    );
  };

  const campaign = campaignQuery.data;
  const isLegendarioCampaign = campaign?.title?.trim().toUpperCase() === "LEGENDARIO SOLIDARIO";
  const materialCopy = getMaterialContributionCopy(campaign?.title);
  if (!campaignId || campaignQuery.isError || (!campaignQuery.isLoading && !campaign)) {
    return (
      <div className="min-h-screen bg-[#f8faf7]">
        <PublicHeader />
        <div className="container max-w-xl px-4 py-24 text-center">
          <AlertCircle className="mx-auto h-11 w-11 text-[#a87508]" aria-hidden="true" />
          <h1 className="mt-5 text-3xl font-bold text-[#2d2d2d]">Campanha não encontrada</h1>
          <Link href="/campaigns" className="mt-7 inline-flex min-h-11 items-center rounded-md bg-[#228B22] px-6 font-semibold text-white">Ver campanhas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf7]">
      <PublicHeader />
      <main className="container max-w-3xl px-4 py-12 md:py-16">
        <Link href={`/campaign/${campaignId}`} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#4f6550] hover:text-[#228B22]">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar à campanha
        </Link>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#228B22]">{campaignQuery.isLoading ? "Carregando campanha" : campaign?.title}</p>
        <h1 className="mt-3 text-4xl font-bold text-[#2d2d2d] md:text-5xl">Como você quer ajudar?</h1>
        <p className="mt-4 text-lg text-[#656565]">
          {isLegendarioCampaign
            ? "Escolha uma modalidade. Para esta campanha, recebemos doação financeira e kit completo ou itens do kit para a montanha."
            : "Escolha uma modalidade. As ofertas de materiais e trabalho serão analisadas pela equipe responsável."}
        </p>

        <Tabs defaultValue="financial" className="mt-9">
          <TabsList className={`grid h-auto ${isLegendarioCampaign ? "grid-cols-2" : "grid-cols-3"} bg-[#edf2ec] p-1`}>
            <TabsTrigger value="financial" className="gap-2"><Heart className="h-4 w-4" /><span className="hidden sm:inline">Financeira</span></TabsTrigger>
            <TabsTrigger value="material" className="gap-2"><Package className="h-4 w-4" /><span className="hidden sm:inline">{isLegendarioCampaign ? "Kit/Itens" : "Material"}</span></TabsTrigger>
            {!isLegendarioCampaign && (
              <TabsTrigger value="volunteer" className="gap-2"><Users className="h-4 w-4" /><span className="hidden sm:inline">Voluntariado</span></TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="financial" className="mt-6">
            <Card className="p-7 md:p-9">
              <h2 className="text-2xl font-bold text-[#2d2d2d]">Doação financeira</h2>
              <p className="mt-3 leading-relaxed text-[#656565]">O valor e os dados do doador serão informados no próximo passo. A plataforma criará apenas um registro pendente ao iniciar o checkout.</p>
              <div className="mt-6 flex gap-3 rounded-lg border border-[#228B22]/20 bg-[#228B22]/5 p-4 text-sm text-[#2d2d2d]">
                <AlertCircle className="h-5 w-5 flex-none text-[#228B22]" aria-hidden="true" />
                O pagamento é iniciado no servidor e concluído na conta do Mercado Pago.
              </div>
              <Link href={`/checkout/${campaignId}`} className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-[#228B22] px-6 font-semibold text-white transition hover:bg-[#1b711b] active:scale-[0.97]">
                Prosseguir para pagamento
              </Link>
            </Card>
          </TabsContent>

          <TabsContent value="material" className="mt-6">
            <OfferForm
              title={materialCopy.label}
              description={isLegendarioCampaign ? materialCopy.description : "Informe o material, a quantidade, o estado e como ele poderá ser entregue ou retirado."}
              value={materialDescription}
              onValueChange={setMaterialDescription}
              placeholder={isLegendarioCampaign ? materialCopy.placeholder : "Ex.: 100 sacos de cimento, disponíveis para retirada..."}
              campaignNeeds={campaignNeeds}
              selectedNeedId={selectedNeedId}
              onNeedChange={setSelectedNeedId}
              materialQuantity={materialQuantity}
              onQuantityChange={setMaterialQuantity}
              showNeedSelection
              donorName={donorName}
              donorEmail={donorEmail}
              onNameChange={setDonorName}
              onEmailChange={setDonorEmail}
              onSubmit={handleMaterialSubmit}
              isPending={createMaterial.isPending}
              submitLabel={materialCopy.submitLabel}
            />
          </TabsContent>

          {!isLegendarioCampaign && (
            <TabsContent value="volunteer" className="mt-6">
              <OfferForm
                title="Oferta de mão de obra"
                description="Descreva sua habilidade, disponibilidade e região para que a equipe possa avaliar a necessidade."
                value={volunteerDescription}
                onValueChange={setVolunteerDescription}
                placeholder="Ex.: sou eletricista e tenho disponibilidade aos sábados..."
                donorName={donorName}
                donorEmail={donorEmail}
                onNameChange={setDonorName}
                onEmailChange={setDonorEmail}
                onSubmit={handleVolunteerSubmit}
                isPending={createVolunteer.isPending}
                submitLabel="Enviar oferta de voluntariado"
              />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function OfferForm({
  title,
  description,
  value,
  onValueChange,
  placeholder,
  donorName,
  donorEmail,
  onNameChange,
  onEmailChange,
  onSubmit,
  isPending,
  submitLabel,
  campaignNeeds,
  selectedNeedId,
  onNeedChange,
  materialQuantity,
  onQuantityChange,
  showNeedSelection = false,
}: {
  title: string;
  description: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  donorName: string;
  donorEmail: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  isPending: boolean;
  submitLabel: string;
  campaignNeeds?: Array<{ id: number; name: string; quantity: string | null; description: string | null }>;
  selectedNeedId?: string;
  onNeedChange?: (value: string) => void;
  materialQuantity?: string;
  onQuantityChange?: (value: string) => void;
  showNeedSelection?: boolean;
}) {
  return (
    <Card className="p-7 md:p-9">
      <h2 className="text-2xl font-bold text-[#2d2d2d]">{title}</h2>
      <p className="mt-3 text-[#656565]">{description}</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-5">
        {showNeedSelection && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={`${title}-need`} className="mb-2 block text-sm font-semibold text-[#2d2d2d]">Necessidade da campanha</label>
              <select id={`${title}-need`} value={selectedNeedId ?? ""} onChange={(event) => onNeedChange?.(event.target.value)} className="flex min-h-11 w-full rounded-md border border-[#d9dfd7] bg-white px-3 py-2 text-sm text-[#2d2d2d] shadow-sm focus:border-[#228B22] focus:outline-none">
                <option value="">Escolha a necessidade</option>
                {(campaignNeeds ?? []).map((need) => (
                  <option key={need.id} value={need.id}>
                    {need.name}{need.quantity ? ` · ${need.quantity}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${title}-quantity`} className="mb-2 block text-sm font-semibold text-[#2d2d2d]">Quantidade que você pode doar</label>
              <Input id={`${title}-quantity`} value={materialQuantity ?? ""} onChange={(event) => onQuantityChange?.(event.target.value)} placeholder="Ex.: 20 sacos" />
            </div>
          </div>
        )}
        <div>
          <label htmlFor={`${title}-description`} className="mb-2 block text-sm font-semibold text-[#2d2d2d]">Detalhes da oferta *</label>
          <Textarea id={`${title}-description`} value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} rows={5} minLength={10} required />
        </div>
        <div>
          <label htmlFor={`${title}-name`} className="mb-2 block text-sm font-semibold text-[#2d2d2d]">Seu nome</label>
          <Input id={`${title}-name`} value={donorName} onChange={(event) => onNameChange(event.target.value)} autoComplete="name" />
        </div>
        <div>
          <label htmlFor={`${title}-email`} className="mb-2 block text-sm font-semibold text-[#2d2d2d]">E-mail *</label>
          <Input id={`${title}-email`} type="email" value={donorEmail} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" required />
        </div>
        <Button type="submit" disabled={isPending} className="min-h-12 w-full bg-[#228B22] font-semibold text-white hover:bg-[#1b711b]">
          {isPending ? "Enviando..." : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
