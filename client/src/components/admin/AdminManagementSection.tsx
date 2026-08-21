import { useState } from "react";
import { AlertCircle, Plus, Shield, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const SECTION_LABELS: Record<string, string> = {
  campaigns: "Campanhas",
  content: "Conteúdo do site",
  validations: "Validações",
  partners: "Parceiros",
  community: "Comunidade",
  comments: "Depoimentos",
};

type SectionKey = "campaigns" | "content" | "validations" | "partners" | "community" | "comments";

const SECTION_KEYS = Object.keys(SECTION_LABELS) as SectionKey[];

const ROLE_LABELS: Record<string, string> = {
  owner: "Administrador geral",
  full: "Acesso total",
  partial: "Acesso parcial",
};

type FormState = {
  id: number | null;
  email: string;
  password: string;
  name: string;
  role: "owner" | "full" | "partial";
  allowedSections: SectionKey[];
};

const EMPTY_FORM: FormState = { id: null, email: "", password: "", name: "", role: "full", allowedSections: [] };

export default function AdminManagementSection({ currentAdminId }: { currentAdminId: number }) {
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const listQuery = trpc.adminAuth.list.useQuery();

  const invalidate = () => utils.adminAuth.list.invalidate();

  const createMutation = trpc.adminAuth.create.useMutation({
    onSuccess: () => {
      toast.success("Administrador criado!");
      setIsOpen(false);
      invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const updateMutation = trpc.adminAuth.update.useMutation({
    onSuccess: () => {
      toast.success("Administrador atualizado!");
      setIsOpen(false);
      invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const removeMutation = trpc.adminAuth.remove.useMutation({
    onSuccess: () => {
      toast.success("Administrador removido.");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setIsOpen(true);
  }

  function openEdit(admin: NonNullable<typeof listQuery.data>[number]) {
    setForm({
      id: admin.id,
      email: admin.email,
      password: "",
      name: admin.name ?? "",
      role: admin.role as FormState["role"],
      allowedSections: admin.allowedSections as SectionKey[],
    });
    setError(null);
    setIsOpen(true);
  }

  function toggleSection(key: SectionKey) {
    setForm((prev) => ({
      ...prev,
      allowedSections: prev.allowedSections.includes(key)
        ? prev.allowedSections.filter((s) => s !== key)
        : [...prev.allowedSections, key],
    }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.role === "partial" && form.allowedSections.length === 0) {
      setError("Selecione ao menos uma área para acesso parcial.");
      return;
    }

    if (form.id) {
      updateMutation.mutate({
        id: form.id,
        name: form.name || undefined,
        role: form.role,
        allowedSections: form.role === "partial" ? form.allowedSections : undefined,
        password: form.password || undefined,
      });
    } else {
      if (!form.password) {
        setError("Defina uma senha para o novo administrador.");
        return;
      }
      createMutation.mutate({
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        role: form.role,
        allowedSections: form.role === "partial" ? form.allowedSections : undefined,
      });
    }
  }

  function handleDelete(id: number, email: string) {
    if (!confirm(`Remover o acesso de ${email}? Essa pessoa perde acesso imediatamente.`)) return;
    removeMutation.mutate({ id });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#228B22]/10 text-[#228B22]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#243128]">Administradores</h2>
            <p className="text-sm text-[#66736a]">Adicione ou remova pessoas com acesso ao painel — total ou só de algumas áreas.</p>
          </div>
        </div>
        <Button className="gap-2 bg-[#228B22] hover:bg-[#1a6b1a]" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo administrador
        </Button>
      </div>

      <Card className="p-5 md:p-6">
        {listQuery.isLoading ? (
          <p className="text-sm text-[#66736a]">Carregando...</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-[#b42318]">Não foi possível carregar os administradores.</p>
        ) : (
          <div className="space-y-3">
            {(listQuery.data ?? []).map((admin) => (
              <div
                key={admin.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e1e6df] bg-[#f8fbf6] p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {admin.role === "owner" ? (
                      <ShieldCheck className="h-4 w-4 text-[#228B22]" aria-hidden="true" />
                    ) : (
                      <Shield className="h-4 w-4 text-[#66736a]" aria-hidden="true" />
                    )}
                    <p className="font-semibold text-[#243128]">{admin.name || admin.email}</p>
                    {admin.id === currentAdminId && <Badge variant="secondary">Você</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-[#66736a]">{admin.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{ROLE_LABELS[admin.role] ?? admin.role}</Badge>
                    {admin.role === "partial" &&
                      admin.allowedSections.map((s) => (
                        <Badge key={s} variant="secondary">{SECTION_LABELS[s] ?? s}</Badge>
                      ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => openEdit(admin)}>
                    <UserCog className="h-4 w-4" /> Editar
                  </Button>
                  {admin.id !== currentAdminId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-[#f3d2ce] text-[#b42318] hover:bg-[#fff7f6]"
                      onClick={() => handleDelete(admin.id, admin.email)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {(listQuery.data ?? []).length === 0 && (
              <p className="text-sm text-[#66736a]">Nenhum administrador cadastrado.</p>
            )}
          </div>
        )}
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar administrador" : "Novo administrador"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#243128]">E-mail</label>
              <Input
                type="email"
                required
                disabled={Boolean(form.id)}
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="pessoa@exemplo.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#243128]">Nome</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Nome da pessoa"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#243128]">{form.id ? "Nova senha (opcional)" : "Senha"}</label>
              <Input
                type="password"
                required={!form.id}
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={form.id ? "Deixe em branco para manter a atual" : "Pelo menos 6 caracteres"}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#243128]">Nível de acesso</label>
              <Select value={form.role} onValueChange={(value) => setForm((prev) => ({ ...prev, role: value as FormState["role"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Acesso total (todas as áreas)</SelectItem>
                  <SelectItem value="partial">Acesso parcial (só algumas áreas)</SelectItem>
                  <SelectItem value="owner">Administrador geral (também gerencia administradores)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.role === "partial" && (
              <div className="space-y-1.5 rounded-lg border border-[#e1e6df] bg-[#f8fbf6] p-3">
                <p className="text-sm font-medium text-[#243128]">Áreas liberadas</p>
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-[#243128]">
                      <Checkbox
                        checked={form.allowedSections.includes(key)}
                        onCheckedChange={() => toggleSection(key)}
                      />
                      {SECTION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[#f3d2ce] bg-[#fff7f6] p-3 text-sm text-[#b42318]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full bg-[#228B22] hover:bg-[#1a6b1a]" disabled={isSaving}>
              {isSaving ? "Salvando..." : form.id ? "Salvar alterações" : "Criar administrador"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
