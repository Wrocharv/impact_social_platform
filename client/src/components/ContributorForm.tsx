import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface ContributorFormData {
  name: string;
  whatsapp: string;
  email?: string;
  city: string;
  church: string;
  donationType: "financial" | "material" | "volunteer";
  amount?: number;
  description?: string;
}

interface ContributorFormProps {
  campaignId: number;
  onSubmit?: (data: ContributorFormData) => Promise<void>;
  loading?: boolean;
}

export function ContributorForm({ campaignId, onSubmit, loading = false }: ContributorFormProps) {
  const [formData, setFormData] = useState<ContributorFormData>({
    name: "",
    whatsapp: "",
    email: "",
    city: "",
    church: "",
    donationType: "material",
    description: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Nome é obrigatório";
    if (!formData.whatsapp.trim()) newErrors.whatsapp = "WhatsApp é obrigatório";
    if (!formData.city.trim()) newErrors.city = "Cidade é obrigatória";
    if (!formData.church.trim()) newErrors.church = "Igreja é obrigatória";

    if (formData.email && !formData.email.includes("@")) {
      newErrors.email = "Email inválido";
    }

    if (formData.donationType === "financial" && !formData.amount) {
      newErrors.amount = "Valor é obrigatório para doação financeira";
    }

    if ((formData.donationType === "material" || formData.donationType === "volunteer") && !formData.description?.trim()) {
      newErrors.description = "Descrição é obrigatória para este tipo de doação";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      if (onSubmit) {
        await onSubmit(formData);
      }
      setSubmitted(true);
      setFormData({
        name: "",
        whatsapp: "",
        email: "",
        city: "",
        church: "",
        donationType: "material",
        description: "",
      });

      setTimeout(() => setSubmitted(false), 5000);
    } catch (error) {
      console.error("Erro ao enviar formulário:", error);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Cadastro de Doador</CardTitle>
        <CardDescription>
          Preencha seus dados para registrar sua contribuição ao projeto
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-900">Cadastro realizado com sucesso!</p>
              <p className="text-sm text-green-800">Entraremos em contato em breve.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações Pessoais */}
          <div>
            <h3 className="font-semibold text-sm mb-4 text-gray-700">Informações Pessoais</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome *
                </label>
                <Input
                  placeholder="Seu nome completo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  WhatsApp *
                </label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  className={errors.whatsapp ? "border-red-500" : ""}
                />
                {errors.whatsapp && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> {errors.whatsapp}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email (opcional)
                </label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> {errors.email}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cidade *
                  </label>
                  <Input
                    placeholder="Sua cidade"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className={errors.city ? "border-red-500" : ""}
                  />
                  {errors.city && (
                    <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" /> {errors.city}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Igreja que Congrega *
                  </label>
                  <Input
                    placeholder="Nome da sua igreja"
                    value={formData.church}
                    onChange={(e) => setFormData({ ...formData, church: e.target.value })}
                    className={errors.church ? "border-red-500" : ""}
                  />
                  {errors.church && (
                    <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" /> {errors.church}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tipo de Contribuição */}
          <div>
            <h3 className="font-semibold text-sm mb-4 text-gray-700">Tipo de Contribuição</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Como você gostaria de contribuir? *
                </label>
                <Select
                  value={formData.donationType}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      donationType: value as "financial" | "material" | "volunteer",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="financial">💰 Doação Financeira</SelectItem>
                    <SelectItem value="material">📦 Doação de Material</SelectItem>
                    <SelectItem value="volunteer">🤝 Mão de Obra / Voluntariado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.donationType === "financial" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valor (R$) *
                  </label>
                  <Input
                    type="number"
                    placeholder="100,00"
                    step="0.01"
                    min="0"
                    value={formData.amount || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        amount: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className={errors.amount ? "border-red-500" : ""}
                  />
                  {errors.amount && (
                    <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" /> {errors.amount}
                    </p>
                  )}
                </div>
              )}

              {(formData.donationType === "material" || formData.donationType === "volunteer") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descrição da Contribuição *
                  </label>
                  <Textarea
                    placeholder={
                      formData.donationType === "material"
                        ? "Ex: Cimento (10 sacos), Tijolos (1000 unidades), etc."
                        : "Ex: Pedreiro, Pintor, Eletricista, etc."
                    }
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={`min-h-24 ${errors.description ? "border-red-500" : ""}`}
                  />
                  {errors.description && (
                    <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" /> {errors.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Registrar Contribuição"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
