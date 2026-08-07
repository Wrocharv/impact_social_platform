export function isLegendarioCampaign(title?: string | null) {
  return title?.trim().toUpperCase() === "LEGENDARIO SOLIDARIO";
}

export function shouldShowMaterialContributionOption(input: {
  campaignTitle?: string | null;
  campaignNeeds: Array<{ id: number; name: string }>;
  currentType?: string | null;
  initialType?: string | null;
  isLocalHost?: boolean;
}) {
  const isLegendario = isLegendarioCampaign(input.campaignTitle);
  const isRecantoCampaign = /recanto de paz/i.test(input.campaignTitle ?? "");
  const hasExplicitNeeds = (input.campaignNeeds ?? []).length > 0;
  const isLocalHost = input.isLocalHost ?? (typeof window !== "undefined" && /localhost|127\.0\.0\.1/i.test(window.location.hostname));

  if (isLegendario) {
    return true;
  }

  if (isRecantoCampaign && isLocalHost) {
    return true;
  }

  return hasExplicitNeeds && (input.currentType === "material" || input.initialType === "material");
}

export function getMaterialContributionCopy(campaignTitle?: string | null) {
  const isLegendario = isLegendarioCampaign(campaignTitle);

  if (isLegendario) {
    return {
      label: "Kit/Itens",
      subtitle: "Mochila, saco de dormir, bastão, itens de montanhismo e outros itens do kit",
      description: "Informe o kit completo ou itens separados para a campanha de montanhismo.",
      placeholder: "Ex.: 1 kit completo + 2 bastões, mochila, saco de dormir e outros itens...",
      submitLabel: "Enviar oferta de kit/itens",
    };
  }

  return {
    label: "Material",
    subtitle: "Materiais de construção, alimentos e outros itens",
    description: "Informe o material, a quantidade, o estado e como ele poderá ser entregue ou retirado.",
    placeholder: "Ex.: 100 sacos de cimento, disponíveis para retirada...",
    submitLabel: "Enviar oferta de material",
  };
}
