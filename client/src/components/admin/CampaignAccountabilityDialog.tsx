import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { FileCheck2, ReceiptText, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CampaignReference = { id: number; title: string };

const EMPTY_EXPENSE = {
  category: "materials" as "materials" | "labor" | "equipment" | "services" | "transport" | "fees" | "other",
  title: "",
  description: "",
  amount: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  documentId: "none",
};

const EMPTY_DOCUMENT = {
  type: "receipt" as "invoice" | "receipt" | "report" | "other",
  title: "",
  description: "",
  amount: "",
};

const CATEGORY_LABELS: Record<string, string> = {
  materials: "Materiais",
  labor: "Mão de obra",
  equipment: "Equipamentos",
  services: "Serviços",
  transport: "Transporte",
  fees: "Taxas",
  other: "Outros",
};

const DOCUMENT_LABELS: Record<string, string> = {
  invoice: "Nota fiscal",
  receipt: "Recibo",
  report: "Relatório",
  other: "Outro documento",
};

export default function CampaignAccountabilityDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign: CampaignReference | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const input = useMemo(() => ({ campaignId: campaign?.id ?? 1 }), [campaign?.id]);
  const reportQuery = trpc.accountability.getAdminReport.useQuery(input, { enabled: open && Boolean(campaign) });
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  async function invalidateReport() {
    if (!campaign) return;
    await Promise.all([
      utils.accountability.getAdminReport.invalidate({ campaignId: campaign.id }),
      utils.accountability.getPublicReport.invalidate({ campaignId: campaign.id }),
      utils.campaigns.getById.invalidate({ id: campaign.id }),
    ]);
  }

  const createExpense = trpc.accountability.createExpense.useMutation({
    onSuccess: async () => {
      toast.success("Despesa registrada com sucesso.");
      setExpenseForm(EMPTY_EXPENSE);
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível registrar a despesa."),
  });

  const uploadDocument = trpc.accountability.uploadDocument.useMutation({
    onSuccess: async () => {
      toast.success("Documento publicado com sucesso.");
      setDocumentForm(EMPTY_DOCUMENT);
      setDocumentFile(null);
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível publicar o documento."),
  });

  function handleCreateExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!campaign) return;
    const amount = parseCurrencyInput(expenseForm.amount);
    if (!amount) {
      toast.error("Informe um valor válido para a despesa.");
      return;
    }
    const expenseDate = Date.parse(`${expenseForm.expenseDate}T12:00:00.000Z`);
    if (!Number.isFinite(expenseDate)) {
      toast.error("Informe uma data válida.");
      return;
    }

    createExpense.mutate({
      campaignId: campaign.id,
      category: expenseForm.category,
      title: expenseForm.title,
      description: expenseForm.description || undefined,
      amount,
      expenseDate,
      documentId: expenseForm.documentId === "none" ? undefined : Number(expenseForm.documentId),
    });
  }

  async function handleUploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!campaign || !documentFile) {
      toast.error("Selecione um documento PDF, JPEG ou PNG.");
      return;
    }
    if (documentFile.size > 5 * 1024 * 1024) {
      toast.error("O documento deve ter no máximo 5 MB.");
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(documentFile.type)) {
      toast.error("Formato não permitido. Use PDF, JPEG ou PNG.");
      return;
    }

    const amount = documentForm.amount ? parseCurrencyInput(documentForm.amount) : undefined;
    if (documentForm.amount && !amount) {
      toast.error("Informe um valor associado válido.");
      return;
    }

    try {
      uploadDocument.mutate({
        campaignId: campaign.id,
        type: documentForm.type,
        title: documentForm.title,
        description: documentForm.description || undefined,
        amount,
        file: {
          name: documentFile.name,
          mimeType: documentFile.type as "application/pdf" | "image/jpeg" | "image/png",
          size: documentFile.size,
          base64: await fileToBase64(documentFile),
        },
      });
    } catch {
      toast.error("Não foi possível ler o arquivo selecionado.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prestação de contas</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[#66736a]">Campanha: <strong className="text-[#243128]">{campaign?.title}</strong></p>

        {reportQuery.isLoading ? (
          <Card className="p-6 text-center text-[#66736a]">Carregando dados financeiros...</Card>
        ) : reportQuery.isError ? (
          <Card className="border-red-200 bg-red-50 p-6 text-center text-red-700">Não foi possível carregar a prestação de contas.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Despesas" value={formatCurrency(reportQuery.data?.summary.totalSpent ?? 0)} />
            <Summary label="Comprovantes" value={String(reportQuery.data?.documents.length ?? 0)} />
            <Summary label="Lançamentos" value={String(reportQuery.data?.expenses.length ?? 0)} />
          </div>
        )}

        <Tabs defaultValue="expense" className="mt-2">
          <TabsList className="grid h-auto w-full grid-cols-2 bg-[#edf3eb] p-1">
            <TabsTrigger value="expense" className="min-h-11 gap-2"><ReceiptText className="h-4 w-4" /> Registrar despesa</TabsTrigger>
            <TabsTrigger value="document" className="min-h-11 gap-2"><FileCheck2 className="h-4 w-4" /> Publicar documento</TabsTrigger>
          </TabsList>

          <TabsContent value="expense" className="mt-5">
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categoria *"><Select value={expenseForm.category} onValueChange={(category: typeof expenseForm.category) => setExpenseForm({ ...expenseForm, category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Valor (R$) *"><Input inputMode="decimal" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} required placeholder="0,00" /></Field>
              </div>
              <Field label="Título *"><Input value={expenseForm.title} onChange={(event) => setExpenseForm({ ...expenseForm, title: event.target.value })} required minLength={2} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Data *"><Input type="date" max={new Date().toISOString().slice(0, 10)} value={expenseForm.expenseDate} onChange={(event) => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })} required /></Field>
                <Field label="Comprovante publicado"><Select value={expenseForm.documentId} onValueChange={(documentId) => setExpenseForm({ ...expenseForm, documentId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem comprovante vinculado</SelectItem>{reportQuery.data?.documents.map((document) => <SelectItem key={document.id} value={String(document.id)}>{document.title}</SelectItem>)}</SelectContent></Select></Field>
              </div>
              <Field label="Descrição"><Textarea value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} rows={3} maxLength={2000} /></Field>
              <div className="flex justify-end"><Button type="submit" disabled={createExpense.isPending}>{createExpense.isPending ? "Registrando..." : "Registrar despesa"}</Button></div>
            </form>
          </TabsContent>

          <TabsContent value="document" className="mt-5">
            <form onSubmit={handleUploadDocument} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo *"><Select value={documentForm.type} onValueChange={(type: typeof documentForm.type) => setDocumentForm({ ...documentForm, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOCUMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Valor associado (R$)"><Input inputMode="decimal" value={documentForm.amount} onChange={(event) => setDocumentForm({ ...documentForm, amount: event.target.value })} placeholder="Opcional" /></Field>
              </div>
              <Field label="Título *"><Input value={documentForm.title} onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })} required minLength={2} /></Field>
              <Field label="Descrição"><Textarea value={documentForm.description} onChange={(event) => setDocumentForm({ ...documentForm, description: event.target.value })} rows={3} maxLength={2000} /></Field>
              <Field label="Arquivo *"><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} required /><span className="block text-xs font-normal text-[#758078]">PDF, JPEG ou PNG, até 5 MB. O conteúdo será validado no servidor.</span></Field>
              <div className="flex justify-end"><Button type="submit" disabled={uploadDocument.isPending}>{uploadDocument.isPending ? "Enviando..." : "Publicar documento"}</Button></div>
            </form>
          </TabsContent>
        </Tabs>

        {(reportQuery.data?.expenses.length ?? 0) > 0 && (
          <section className="border-t pt-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#228B22]" /><h3 className="font-bold text-[#243128]">Últimas despesas registradas</h3></div>
            <div className="mt-3 space-y-2">{reportQuery.data?.expenses.slice(0, 5).map((expense) => <div key={expense.id} className="flex items-center justify-between gap-4 rounded-lg bg-[#f5f8f3] p-3 text-sm"><div><p className="font-semibold text-[#243128]">{expense.title}</p><p className="text-[#66736a]">{CATEGORY_LABELS[expense.category] ?? expense.category} · {new Date(expense.expenseDate).toLocaleDateString("pt-BR")}</p></div><strong>{formatCurrency(expense.amount)}</strong></div>)}</div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-semibold text-[#334139]">{label}</span>{children}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <Card className="p-4"><p className="text-xs uppercase tracking-[0.1em] text-[#758078]">{label}</p><p className="mt-2 text-xl font-bold text-[#243128]">{value}</p></Card>;
}

function parseCurrencyInput(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function formatCurrency(value: number) {
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
