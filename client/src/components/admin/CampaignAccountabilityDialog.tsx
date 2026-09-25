import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Download, FileCheck2, ReceiptText, ScrollText, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CampaignReference = { id: number; title: string };

const EMPTY_EXPENSE = {
  category: "beneficiary_transfer" as "materials" | "labor" | "equipment" | "services" | "transport" | "fees" | "other" | "beneficiary_transfer",
  title: "",
  description: "",
  quantity: "",
  unitPrice: "",
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
  beneficiary_transfer: "Repasse a beneficiário",
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
  const cashAuditQuery = trpc.contributions.getRecentCashValidations.useQuery(
    { campaignId: campaign?.id ?? 1, limit: 10 },
    { enabled: open && Boolean(campaign) },
  );
  const statementQuery = trpc.accountability.getStatement.useQuery(input, { enabled: open && Boolean(campaign) });
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  // Quando um destes tem id, o formulario esta corrigindo um lancamento em vez de criar outro.
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);
  const [aba, setAba] = useState("expense");

  async function invalidateReport() {
    if (!campaign) return;
    await Promise.all([
      utils.accountability.getAdminReport.invalidate({ campaignId: campaign.id }),
      utils.accountability.getPublicReport.invalidate({ campaignId: campaign.id }),
      utils.campaigns.getById.invalidate({ id: campaign.id }),
      utils.accountability.getStatement.invalidate({ campaignId: campaign.id }),
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

  const updateExpense = trpc.accountability.updateExpense.useMutation({
    onSuccess: async () => {
      toast.success("Despesa corrigida.");
      setExpenseForm(EMPTY_EXPENSE);
      setEditingExpenseId(null);
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível corrigir a despesa."),
  });

  const deleteExpense = trpc.accountability.deleteExpense.useMutation({
    onSuccess: async () => {
      toast.success("Despesa excluída.");
      setExpenseForm(EMPTY_EXPENSE);
      setEditingExpenseId(null);
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível excluir a despesa."),
  });

  const updateDocument = trpc.accountability.updateDocument.useMutation({
    onSuccess: async () => {
      toast.success("Documento corrigido.");
      setDocumentForm(EMPTY_DOCUMENT);
      setEditingDocumentId(null);
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível corrigir o documento."),
  });

  const deleteDocument = trpc.accountability.deleteDocument.useMutation({
    onSuccess: async () => {
      toast.success("Documento retirado do ar.");
      setDocumentForm(EMPTY_DOCUMENT);
      setEditingDocumentId(null);
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível excluir o documento."),
  });

  const setExpensePublished = trpc.accountability.setExpensePublished.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success(variables.published ? "Despesa publicada na página da campanha." : "Despesa voltou para rascunho.");
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível mudar a publicação."),
  });

  const setDocumentPublished = trpc.accountability.setDocumentPublished.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success(variables.published ? "Documento publicado na página da campanha." : "Documento voltou para rascunho.");
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível mudar a publicação."),
  });

  const publishPending = trpc.accountability.publishPending.useMutation({
    onSuccess: async () => {
      toast.success("Tudo o que estava em rascunho foi publicado.");
      await invalidateReport();
    },
    onError: (error) => toast.error(error.message || "Não foi possível publicar."),
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

    const unitPriceCents = expenseForm.unitPrice ? parseCurrencyInput(expenseForm.unitPrice) : 0;

    const dados = {
      campaignId: campaign.id,
      category: expenseForm.category,
      title: expenseForm.title,
      description: expenseForm.description || undefined,
      quantity: expenseForm.quantity || undefined,
      unitPriceCents: unitPriceCents > 0 ? unitPriceCents : undefined,
      amount,
      expenseDate,
      documentId: expenseForm.documentId === "none" ? undefined : Number(expenseForm.documentId),
    };

    if (editingExpenseId) updateExpense.mutate({ id: editingExpenseId, ...dados });
    else createExpense.mutate(dados);
  }

  /** Abre a despesa escolhida no formulário de cima, já preenchida, pra corrigir. */
  function editarDespesa(expense: { id: number; category: string; title: string; description?: string | null; quantity?: string | null; unitPriceCents?: number | null; amount: number; expenseDate: string | Date; documentId?: number | null }) {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      category: expense.category as typeof EMPTY_EXPENSE.category,
      title: expense.title,
      description: expense.description ?? "",
      quantity: expense.quantity ?? "",
      unitPrice: expense.unitPriceCents ? (expense.unitPriceCents / 100).toFixed(2).replace(".", ",") : "",
      amount: (expense.amount / 100).toFixed(2).replace(".", ","),
      expenseDate: new Date(expense.expenseDate).toISOString().slice(0, 10),
      documentId: expense.documentId ? String(expense.documentId) : "none",
    });
    setAba("expense");
  }

  /** Idem para o comprovante: o arquivo continua o mesmo, mudam só os dados. */
  function editarDocumento(document: { id: number; type: string; title: string; description?: string | null; amount?: number | null }) {
    setEditingDocumentId(document.id);
    setDocumentForm({
      type: document.type as typeof EMPTY_DOCUMENT.type,
      title: document.title,
      description: document.description ?? "",
      amount: document.amount ? (document.amount / 100).toFixed(2).replace(".", ",") : "",
    });
    setDocumentFile(null);
    setAba("document");
  }

  function handleQuantityOrPriceChange(field: "quantity" | "unitPrice", value: string) {
    const next = { ...expenseForm, [field]: value };
    const quantityNumeric = Number((field === "quantity" ? value : expenseForm.quantity).replace(",", ".").match(/[\d.]+/)?.[0] ?? "");
    const unitPriceCents = parseCurrencyInput(field === "unitPrice" ? value : expenseForm.unitPrice);
    if (Number.isFinite(quantityNumeric) && quantityNumeric > 0 && unitPriceCents > 0) {
      next.amount = (Math.round(quantityNumeric * unitPriceCents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    setExpenseForm(next);
  }

  async function handleUploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!campaign) return;

    // Corrigindo um documento ja publicado: nao se manda arquivo de novo.
    if (editingDocumentId) {
      const valor = documentForm.amount ? parseCurrencyInput(documentForm.amount) : undefined;
      if (documentForm.amount && !valor) {
        toast.error("Informe um valor associado válido.");
        return;
      }
      updateDocument.mutate({
        id: editingDocumentId,
        campaignId: campaign.id,
        type: documentForm.type,
        title: documentForm.title,
        description: documentForm.description || undefined,
        amount: valor,
      });
      return;
    }

    if (!documentFile) {
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

  const rascunhos =
    (reportQuery.data?.expenses.filter((expense) => !expense.publishedAt).length ?? 0) +
    (reportQuery.data?.documents.filter((document) => !document.publishedAt).length ?? 0);

  /** Baixa o extrato em planilha (abre no Excel e no Google Planilhas). */
  function baixarPlanilha() {
    const dados = statementQuery.data;
    if (!dados) return;
    const valor = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");
    const dia = (data: string | Date) => new Date(data).toLocaleDateString("pt-BR");
    const escapar = (texto: string) => `"${String(texto ?? "").replace(/"/g, '""')}"`;

    const linhas = [
      ["Tipo", "Data", "Descrição", "Quem / Categoria", "Forma", "Situação", "Valor (R$)"].join(";"),
      ...(dados.initialRaisedEntry > 0
        ? [["ENTRADA", "", escapar("Arrecadação inicial registrada na campanha"), "", "", "No ar", valor(dados.initialRaisedEntry)].join(";")]
        : []),
      ...dados.entries.map((entrada) =>
        ["ENTRADA", dia(entrada.date), escapar(entrada.description || (entrada.type === "material" ? "Doação de material" : "Contribuição financeira")), escapar(entrada.name), escapar(entrada.method || ""), "No ar", valor(entrada.amount)].join(";"),
      ),
      ...dados.expenses.map((despesa) =>
        ["DESPESA", dia(despesa.expenseDate), escapar(despesa.title), escapar(CATEGORY_LABELS[despesa.category] ?? despesa.category), escapar(despesa.quantity || ""), despesa.publishedAt ? "No ar" : "Rascunho", valor(despesa.amount)].join(";"),
      ),
      "",
      ["TOTAL ENTRADAS", "", "", "", "", "", valor(dados.totalEntries)].join(";"),
      ["TOTAL DESPESAS", "", "", "", "", "", valor(dados.totalSpent)].join(";"),
      ["SALDO", "", "", "", "", "", valor(dados.balance)].join(";"),
    ].join("\n");

    // O BOM faz o Excel abrir os acentos certos.
    const blob = new Blob([`\ufeff${linhas}`], { type: "text/csv;charset=utf-8" });
    const a = window.document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prestacao-de-contas-${campaign?.id ?? ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
            <Summary label="Entradas confirmadas" value={formatCurrency(reportQuery.data?.financialSummary.totalConfirmedEntries ?? 0)} />
            <Summary label="Despesas" value={formatCurrency(reportQuery.data?.financialSummary.totalSpent ?? reportQuery.data?.summary.totalSpent ?? 0)} />
            <Summary label="Saldo disponível" value={formatCurrency(reportQuery.data?.financialSummary.availableBalance ?? 0)} />
          </div>
        )}

        {!reportQuery.isLoading && !reportQuery.isError && (
          <p className="text-xs text-[#66736a]">
            {reportQuery.data?.financialSummary.confirmedContributionsCount ?? 0} contribuição(ões) financeira(s)
            confirmada(s) na campanha e {reportQuery.data?.documents.length ?? 0} comprovante(s) publicado(s).
            {(reportQuery.data?.financialSummary.initialRaisedEntry ?? 0) > 0 && (
              <> Inclui {formatCurrency(reportQuery.data?.financialSummary.initialRaisedEntry ?? 0)} de arrecadação inicial registrada na campanha.</>
            )}
          </p>
        )}

        <Tabs value={aba} onValueChange={setAba} className="mt-2">
          <TabsList className="grid h-auto w-full grid-cols-3 bg-[#edf3eb] p-1">
            <TabsTrigger value="expense" className="min-h-11 gap-2"><ReceiptText className="h-4 w-4" /> {editingExpenseId ? "Corrigir despesa" : "Registrar despesa"}</TabsTrigger>
            <TabsTrigger value="document" className="min-h-11 gap-2"><FileCheck2 className="h-4 w-4" /> {editingDocumentId ? "Corrigir documento" : "Publicar documento"}</TabsTrigger>
            <TabsTrigger value="statement" className="min-h-11 gap-2"><ScrollText className="h-4 w-4" /> Conferência</TabsTrigger>
          </TabsList>

          <TabsContent value="expense" className="mt-5">
            <form onSubmit={handleCreateExpense} className="space-y-4">
              {editingExpenseId && (
                <p className="rounded-lg bg-[#fff6e5] p-3 text-sm text-[#8a5a00]">
                  Você está corrigindo uma despesa já lançada. Altere o que estiver errado e salve — ou cancele para voltar a registrar uma nova.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categoria *"><Select value={expenseForm.category} onValueChange={(category: typeof expenseForm.category) => setExpenseForm({ ...expenseForm, category })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Título *"><Input value={expenseForm.title} onChange={(event) => setExpenseForm({ ...expenseForm, title: event.target.value })} required minLength={2} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Quantidade"><Input value={expenseForm.quantity} onChange={(event) => handleQuantityOrPriceChange("quantity", event.target.value)} placeholder="Ex.: 50 sacos" /></Field>
                <Field label="Preço unitário (R$)"><Input inputMode="decimal" value={expenseForm.unitPrice} onChange={(event) => handleQuantityOrPriceChange("unitPrice", event.target.value)} placeholder="0,00" /></Field>
                <Field label="Valor total (R$) *"><Input inputMode="decimal" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} required placeholder="0,00" /></Field>
              </div>
              <p className="text-xs text-[#758078]">Preenchendo quantidade e preço unitário, o valor total é calculado sozinho (dá pra ajustar depois).</p>
              {!editingExpenseId && (
                <p className="text-xs text-[#758078]">A despesa entra como <strong>rascunho</strong>: aparece só aqui no painel até você conferir e publicar.</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Data *"><Input type="date" max={new Date().toISOString().slice(0, 10)} value={expenseForm.expenseDate} onChange={(event) => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })} required /></Field>
                <Field label="Comprovante publicado"><Select value={expenseForm.documentId} onValueChange={(documentId) => setExpenseForm({ ...expenseForm, documentId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem comprovante vinculado</SelectItem>{reportQuery.data?.documents.map((document) => <SelectItem key={document.id} value={String(document.id)}>{document.title}</SelectItem>)}</SelectContent></Select></Field>
              </div>
              <Field label="Descrição (discriminação)"><Textarea value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} rows={3} maxLength={2000} /></Field>
              <div className="flex justify-end gap-2">
                {editingExpenseId && (
                  <Button type="button" variant="outline" onClick={() => { setEditingExpenseId(null); setExpenseForm(EMPTY_EXPENSE); }}>
                    Cancelar correção
                  </Button>
                )}
                <Button type="submit" disabled={createExpense.isPending || updateExpense.isPending}>
                  {editingExpenseId
                    ? (updateExpense.isPending ? "Salvando..." : "Salvar correção")
                    : (createExpense.isPending ? "Registrando..." : "Registrar despesa")}
                </Button>
              </div>
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
              {editingDocumentId ? (
                <p className="rounded-lg bg-[#fff6e5] p-3 text-sm text-[#8a5a00]">
                  Corrigindo um documento já publicado. O arquivo continua o mesmo — para trocar o arquivo, exclua este e publique outro.
                </p>
              ) : (
                <Field label="Arquivo *"><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} required /><span className="block text-xs font-normal text-[#758078]">PDF, JPEG ou PNG, até 5 MB. Entra como rascunho: só vai para a página pública depois que você publicar.</span></Field>
              )}
              <div className="flex justify-end gap-2">
                {editingDocumentId && (
                  <Button type="button" variant="outline" onClick={() => { setEditingDocumentId(null); setDocumentForm(EMPTY_DOCUMENT); }}>
                    Cancelar correção
                  </Button>
                )}
                <Button type="submit" disabled={uploadDocument.isPending || updateDocument.isPending}>
                  {editingDocumentId
                    ? (updateDocument.isPending ? "Salvando..." : "Salvar correção")
                    : (uploadDocument.isPending ? "Enviando..." : "Publicar documento")}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="statement" className="mt-5">
            {statementQuery.isLoading ? (
              <Card className="p-6 text-center text-[#66736a]">Montando o extrato...</Card>
            ) : statementQuery.isError ? (
              <Card className="border-red-200 bg-red-50 p-6 text-center text-red-700">Não foi possível montar o extrato.</Card>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[#66736a]">Tudo o que entrou e tudo o que saiu, lançamento por lançamento, para conferir com o extrato do banco.</p>
                  <Button type="button" variant="outline" className="gap-2" onClick={baixarPlanilha}>
                    <Download className="h-4 w-4" /> Baixar planilha
                  </Button>
                </div>

                <div className={`rounded-lg p-4 text-sm ${rascunhos > 0 ? "bg-[#fff6e5] text-[#8a5a00]" : "bg-[#f0f7ee] text-[#33613a]"}`}>
                  {rascunhos > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p>
                        <strong>{rascunhos}</strong> lançamento(s) em rascunho — aparecem só aqui. Confira a lista abaixo e publique quando estiver certo.
                      </p>
                      <Button
                        type="button"
                        disabled={publishPending.isPending}
                        onClick={() => {
                          if (!campaign) return;
                          if (!window.confirm(`Publicar ${rascunhos} lançamento(s) na página da campanha?`)) return;
                          publishPending.mutate({ campaignId: campaign.id });
                        }}
                      >
                        {publishPending.isPending ? "Publicando..." : "Publicar tudo"}
                      </Button>
                    </div>
                  ) : (
                    <p>Tudo conferido está publicado na página da campanha.</p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Summary label="Total de entradas" value={formatCurrency(statementQuery.data?.totalEntries ?? 0)} />
                  <Summary label="Total de despesas" value={formatCurrency(statementQuery.data?.totalSpent ?? 0)} />
                  <Summary label="Saldo" value={formatCurrency(statementQuery.data?.balance ?? 0)} />
                </div>

                <section>
                  <h3 className="font-bold text-[#243128]">Entradas ({(statementQuery.data?.entries.length ?? 0) + ((statementQuery.data?.initialRaisedEntry ?? 0) > 0 ? 1 : 0)})</h3>
                  <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-[#e2eade]">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-[#f5f8f3] text-xs uppercase tracking-wide text-[#66736a]">
                        <tr><th className="p-2">Data</th><th className="p-2">Quem</th><th className="p-2">Forma</th><th className="p-2 text-right">Valor</th></tr>
                      </thead>
                      <tbody>
                        {(statementQuery.data?.initialRaisedEntry ?? 0) > 0 && (
                          <tr className="border-t border-[#e2eade]">
                            <td className="p-2 text-[#66736a]">—</td>
                            <td className="p-2">Arrecadação inicial da campanha</td>
                            <td className="p-2 text-[#66736a]">registrada no cadastro</td>
                            <td className="p-2 text-right font-semibold">{formatCurrency(statementQuery.data?.initialRaisedEntry ?? 0)}</td>
                          </tr>
                        )}
                        {statementQuery.data?.entries.map((entrada) => (
                          <tr key={`entrada-${entrada.id}`} className="border-t border-[#e2eade]">
                            <td className="p-2 whitespace-nowrap text-[#66736a]">{new Date(entrada.date).toLocaleDateString("pt-BR")}</td>
                            <td className="p-2">
                              {entrada.name}
                              {entrada.type === "material" && <span className="ml-1 text-xs text-[#66736a]">(material{entrada.description ? `: ${entrada.description}` : ""})</span>}
                            </td>
                            <td className="p-2 text-[#66736a]">{entrada.method || "—"}</td>
                            <td className="p-2 text-right font-semibold">{formatCurrency(entrada.amount)}</td>
                          </tr>
                        ))}
                        {!statementQuery.data?.entries.length && (statementQuery.data?.initialRaisedEntry ?? 0) === 0 && (
                          <tr><td className="p-3 text-[#66736a]" colSpan={4}>Nenhuma entrada confirmada nesta campanha.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 className="font-bold text-[#243128]">Despesas ({statementQuery.data?.expenses.length ?? 0})</h3>
                  <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-[#e2eade]">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-[#f5f8f3] text-xs uppercase tracking-wide text-[#66736a]">
                        <tr><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th><th className="p-2">Situação</th><th className="p-2 text-right">Valor</th></tr>
                      </thead>
                      <tbody>
                        {statementQuery.data?.expenses.map((despesa) => (
                          <tr key={`despesa-${despesa.id}`} className="border-t border-[#e2eade]">
                            <td className="p-2 whitespace-nowrap text-[#66736a]">{new Date(despesa.expenseDate).toLocaleDateString("pt-BR")}</td>
                            <td className="p-2">{despesa.title}</td>
                            <td className="p-2 text-[#66736a]">{CATEGORY_LABELS[despesa.category] ?? despesa.category}</td>
                            <td className="p-2"><Selo publicado={Boolean(despesa.publishedAt)} /></td>
                            <td className="p-2 text-right font-semibold">{formatCurrency(despesa.amount)}</td>
                          </tr>
                        ))}
                        {!statementQuery.data?.expenses.length && (
                          <tr><td className="p-3 text-[#66736a]" colSpan={5}>Nenhuma despesa lançada ainda.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {(reportQuery.data?.expenses.length ?? 0) > 0 && (
          <section className="border-t pt-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#228B22]" /><h3 className="font-bold text-[#243128]">Despesas registradas</h3></div>
            <p className="mt-1 text-sm text-[#66736a]">Toque em <strong>Corrigir</strong> para mudar o que ficou errado, ou em <strong>Excluir</strong> para apagar o lançamento.</p>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {reportQuery.data?.expenses.map((expense) => (
                <div key={expense.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-sm ${editingExpenseId === expense.id ? "bg-[#fff6e5] ring-1 ring-[#e0b465]" : "bg-[#f5f8f3]"}`}>
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-semibold text-[#243128]">{expense.title}</p>
                    <p className="text-[#66736a]">
                      {CATEGORY_LABELS[expense.category] ?? expense.category} · {new Date(expense.expenseDate).toLocaleDateString("pt-BR")}
                      {expense.quantity ? ` · ${expense.quantity}` : ""}
                      {expense.unitPriceCents ? ` × ${formatCurrency(expense.unitPriceCents)}` : ""}
                    </p>
                  </div>
                  <strong className="whitespace-nowrap">{formatCurrency(expense.amount)}</strong>
                  <div className="flex flex-wrap items-center gap-2">
                    <Selo publicado={Boolean(expense.publishedAt)} />
                    <Button
                      type="button"
                      size="sm"
                      variant={expense.publishedAt ? "outline" : "default"}
                      disabled={setExpensePublished.isPending}
                      onClick={() => campaign && setExpensePublished.mutate({ id: expense.id, campaignId: campaign.id, published: !expense.publishedAt })}
                    >
                      {expense.publishedAt ? "Tirar do ar" : "Publicar"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => editarDespesa(expense)}>Corrigir</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={deleteExpense.isPending}
                      onClick={() => {
                        if (!campaign) return;
                        if (!window.confirm(`Excluir a despesa "${expense.title}" de ${formatCurrency(expense.amount)}? Isso não pode ser desfeito.`)) return;
                        deleteExpense.mutate({ id: expense.id, campaignId: campaign.id });
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(reportQuery.data?.documents.length ?? 0) > 0 && (
          <section className="border-t pt-5">
            <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-[#228B22]" /><h3 className="font-bold text-[#243128]">Documentos publicados</h3></div>
            <p className="mt-1 text-sm text-[#66736a]">Excluir tira o comprovante do ar; as despesas ligadas a ele ficam sem comprovante.</p>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {reportQuery.data?.documents.map((document) => (
                <div key={document.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-sm ${editingDocumentId === document.id ? "bg-[#fff6e5] ring-1 ring-[#e0b465]" : "bg-[#f5f8f3]"}`}>
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-semibold text-[#243128]">{document.title}</p>
                    <p className="text-[#66736a]">
                      {DOCUMENT_LABELS[document.type] ?? document.type}
                      {document.amount ? ` · ${formatCurrency(document.amount)}` : ""}
                      {document.uploadedAt ? ` · ${new Date(document.uploadedAt).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Selo publicado={Boolean(document.publishedAt)} />
                    <a href={document.documentUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-[#cfdac9] px-3 text-xs font-semibold text-[#243128]">Abrir</a>
                    <Button
                      type="button"
                      size="sm"
                      variant={document.publishedAt ? "outline" : "default"}
                      disabled={setDocumentPublished.isPending}
                      onClick={() => campaign && setDocumentPublished.mutate({ id: document.id, campaignId: campaign.id, published: !document.publishedAt })}
                    >
                      {document.publishedAt ? "Tirar do ar" : "Publicar"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => editarDocumento(document)}>Corrigir</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={deleteDocument.isPending}
                      onClick={() => {
                        if (!campaign) return;
                        if (!window.confirm(`Excluir o documento "${document.title}"? Ele sai da página pública e isso não pode ser desfeito.`)) return;
                        deleteDocument.mutate({ id: document.id, campaignId: campaign.id });
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="border-t pt-5">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#228B22]" /><h3 className="font-bold text-[#243128]">Auditoria da validação presencial</h3></div>
          <p className="mt-1 text-sm text-[#66736a]">Registro das aprovações e rejeições de contribuições em dinheiro presencial.</p>
          {cashAuditQuery.isLoading ? (
            <p className="mt-3 text-sm text-[#66736a]">Carregando auditoria...</p>
          ) : cashAuditQuery.isError ? (
            <Card className="mt-3 border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar a trilha de auditoria da validação presencial.</Card>
          ) : cashAuditQuery.data?.length ? (
            <div className="mt-3 space-y-2">
              {cashAuditQuery.data.map((item) => {
                const isApproved = item.paymentStatusDetail === "cash_validated_in_person";
                const validator = item.validatorName || item.validatorEmail || (item.validatedBy ? `Usuário #${item.validatedBy}` : "Não identificado");
                return (
                  <div key={`cash-audit-${item.id}`} className="rounded-lg bg-[#f5f8f3] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#243128]">Contribuição #{item.id} · {formatCurrency(item.amount ?? 0)}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isApproved ? "bg-[#daf4df] text-[#1a6b1a]" : "bg-red-100 text-red-700"}`}>
                        {isApproved ? "Aprovada" : "Rejeitada"}
                      </span>
                    </div>
                    <p className="mt-1 text-[#4e5c53]">Doador: {item.donorName || "Não informado"}</p>
                    <p className="mt-1 text-[#4e5c53]">Validado por: {validator} · Em: {item.validatedAt ? new Date(item.validatedAt).toLocaleString("pt-BR") : "Data não informada"}</p>
                    {item.validationNote && <p className="mt-1 text-[#4e5c53]">Observação: {item.validationNote}</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#66736a]">Nenhuma validação presencial auditada para esta campanha.</p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/** Mostra, em uma palavra, se aquele lancamento ja esta na pagina publica. */
function Selo({ publicado }: { publicado: boolean }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${publicado ? "bg-[#daf4df] text-[#1a6b1a]" : "bg-[#fdf0d5] text-[#8a5a00]"}`}>
      {publicado ? "No ar" : "Rascunho"}
    </span>
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
