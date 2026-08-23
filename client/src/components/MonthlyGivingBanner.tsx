import { Link } from "wouter";
import { CalendarClock } from "lucide-react";

const HERO_IMAGE_URL = "/campaigns/hotel-recanto-de-paz-render.jpg";
const BADGE_LABEL = "SÓCIO DOADOR";

export default function MonthlyGivingBanner({
  campaignId,
  title,
  description,
  buttonLabel,
}: {
  campaignId: number;
  title: string;
  description: string;
  buttonLabel: string;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-xl shadow-sm">
      <img src={HERO_IMAGE_URL} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/35" />
      <div className="relative flex flex-col items-start gap-5 px-6 py-9 md:flex-row md:items-center md:justify-between md:px-10 md:py-11">
        <div className="max-w-xl text-white">
          <span className="inline-flex rounded-full bg-[#c9a227] px-3 py-1 text-xs font-bold tracking-wide text-white shadow-md">
            {BADGE_LABEL}
          </span>
          <h2 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">{title}</h2>
          {description ? <p className="mt-2 leading-relaxed text-white/90">{description}</p> : null}
        </div>
        <Link
          href={`/parceiro-mensal/${campaignId}`}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#228B22] px-6 font-semibold text-white shadow-md transition hover:bg-[#1b711b] active:scale-[0.97]"
        >
          <CalendarClock className="h-5 w-5" aria-hidden="true" /> {buttonLabel}
        </Link>
      </div>
    </section>
  );
}
