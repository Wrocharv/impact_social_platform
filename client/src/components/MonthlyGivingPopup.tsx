import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const SESSION_KEY = "parceria-do-bem:monthly-giving-popup-shown";
const SHOW_DELAY_MS = 4000;

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
      <DialogContent className="max-w-md text-center">
        <DialogHeader className="items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#228B22]/10">
            <CalendarClock className="h-7 w-7 text-[#228B22]" aria-hidden="true" />
          </div>
          <DialogTitle className="mt-4 text-2xl">{settings.monthlyGivingPopupTitle}</DialogTitle>
          {settings.monthlyGivingPopupDescription && (
            <DialogDescription className="text-base leading-relaxed">
              {settings.monthlyGivingPopupDescription}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-2">
          <Button asChild className="bg-[#228B22] hover:bg-[#1a6b1a]" onClick={() => setOpen(false)}>
            <Link href={`/parceiro-mensal/${settings.monthlyGivingPopupCampaignId}`}>
              {settings.monthlyGivingPopupButtonLabel}
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Agora não</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
