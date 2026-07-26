import { Share2, MessageCircle, Facebook, Twitter, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

type SocialShareProps = {
  title: string;
  description: string;
  url: string;
  campaignId: number;
};

export default function SocialShare({ title, description, url, campaignId }: SocialShareProps) {
  const shareLinks = {
    whatsapp: () => {
      const text = `Olá! Conheça essa campanha incrível: "${title}"\n\n${description}\n\nSaiba mais em: ${url}`;
      return `https://wa.me/?text=${encodeURIComponent(text)}`;
    },
    facebook: () => {
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    },
    twitter: () => {
      const text = `Conheça a campanha "${title}". ${description.substring(0, 80)}... Contribua em:`;
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    },
    telegram: () => {
      const text = `${title}\n\n${description}\n\n${url}`;
      return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    },
    email: () => {
      return `mailto:?subject=${encodeURIComponent(`Conheça a campanha: ${title}`)}&body=${encodeURIComponent(`${description}\n\nSaiba mais em: ${url}`)}`;
    },
  };

  const handleShare = (platform: keyof typeof shareLinks) => {
    const link = shareLinks[platform]();
    if (platform === "email") {
      window.location.href = link;
    } else {
      window.open(link, "_blank", "width=600,height=600");
    }
  };

  // Native share API if available
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
      } catch (err) {
        // User cancelled share
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[#2d2d2d]">Compartilhe esta campanha</h3>
      
      <div className="flex flex-wrap gap-2">
        {navigator.share && (
          <Button
            onClick={handleNativeShare}
            size="sm"
            variant="outline"
            className="inline-flex items-center gap-2 rounded-lg border border-[#e7e7e7] px-3 py-2 text-sm font-medium transition hover:bg-[#f9f9f9]"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Compartilhar</span>
          </Button>
        )}

        <Button
          onClick={() => handleShare("whatsapp")}
          size="sm"
          className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#1ead50]"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">WhatsApp</span>
        </Button>

        <Button
          onClick={() => handleShare("facebook")}
          size="sm"
          className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0a66c2]"
        >
          <Facebook className="h-4 w-4" />
          <span className="hidden sm:inline">Facebook</span>
        </Button>

        <Button
          onClick={() => handleShare("twitter")}
          size="sm"
          className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white transition hover:bg-[#333]"
        >
          <Twitter className="h-4 w-4" />
          <span className="hidden sm:inline">X</span>
        </Button>

        <Button
          onClick={() => handleShare("telegram")}
          size="sm"
          className="inline-flex items-center gap-2 rounded-lg bg-[#0088cc] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#006ba3]"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Telegram</span>
        </Button>

        <Button
          onClick={() => handleShare("email")}
          size="sm"
          variant="outline"
          className="inline-flex items-center gap-2 rounded-lg border border-[#e7e7e7] px-3 py-2 text-sm font-medium transition hover:bg-[#f9f9f9]"
        >
          <Mail className="h-4 w-4" />
          <span className="hidden sm:inline">Email</span>
        </Button>
      </div>
    </div>
  );
}
