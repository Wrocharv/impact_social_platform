import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type CampaignQrCodeDialogProps = {
  campaignId: number | null;
  campaignTitle: string;
  onClose: () => void;
};

export default function CampaignQrCodeDialog({ campaignId, campaignTitle, onClose }: CampaignQrCodeDialogProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = campaignId ? `https://www.parceriadobem.com.br/campaign/${campaignId}` : "";

  useEffect(() => {
    if (!campaignId) {
      setDataUrl(null);
      return;
    }
    QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: "#1c2b1f", light: "#ffffff" } })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [campaignId, url]);

  return (
    <Dialog open={campaignId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle>QR Code — {campaignTitle}</DialogTitle>
        </DialogHeader>
        {dataUrl ? (
          <>
            <img src={dataUrl} alt={`QR Code da campanha ${campaignTitle}`} className="mx-auto w-full max-w-[280px] rounded-lg border border-[#e1e6df]" />
            <p className="break-all text-xs text-[#66736a]">{url}</p>
            <a
              href={dataUrl}
              download={`qrcode-${campaignTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#228B22] px-6 font-semibold text-white hover:bg-[#1a6b1a]"
            >
              <Download className="h-4 w-4" /> Baixar QR Code
            </a>
          </>
        ) : (
          <p className="text-sm text-[#66736a]">Gerando QR Code...</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
