import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const SESSION_KEY = "parceria-do-bem:monthly-giving-popup-shown";
const SHOW_DELAY_MS = 4000;
const BADGE_LABEL = "SÓCIO DOADOR";
const HERO_IMAGE_URL = "/campaigns/hotel-recanto-de-paz-render.jpg";

export default function MonthlyGivingPopup({ currentCampaignId }: { currentCampaignId: number }) {
  const [open, setOpen] = useState(false);
  const siteSettingsQuery = trpc.siteSettings.get.useQuery();
  const settings = siteSettingsQuery.data;
  // Só mostra na página da campanha configurada no admin — não no site inteiro.
  const matchesCurrentCampaign = settings?.monthlyGivingPopupCampaignId === currentCampaignId;

  useEffect(() => {
    if (!settings?.monthlyGivingPopupEnabled || !matchesCurrentCampaign) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const timer = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      setOpen(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [settings?.monthlyGivingPopupEnabled, matchesCurrentCampaign]);

  if (!settings?.monthlyGivingPopupEnabled || !matchesCurrentCampaign) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-sm">
        <div className="relative">
          <img
            src={HERO_IMAGE_URL}
            alt="Hotel Recanto de Paz"
            className="h-44 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute bottom-3 left-3 rounded-full bg-[#c9a227] px-3 py-1 text-xs font-bold tracking-wide text-white shadow-md">
            {BADGE_LABEL}
          </span>
        </div>
        <div className="p-6 text-center">
          <DialogHeader className="items-center">
            <DialogTitle className="text-2xl">{settings.monthlyGivingPopupTitle}</DialogTitle>
            {settings.monthlyGivingPopupDescription && (
              <DialogDescription className="text-base leading-relaxed">
                {settings.monthlyGivingPopupDescription}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Button asChild className="bg-[#228B22] hover:bg-[#1a6b1a]" onClick={() => setOpen(false)}>
              <Link href={`/parceiro-mensal/${settings.monthlyGivingPopupCampaignId}`}>
                {settings.monthlyGivingPopupButtonLabel}
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Agora não</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
