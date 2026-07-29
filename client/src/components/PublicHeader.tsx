import { Handshake } from "lucide-react";
import { Link } from "wouter";

export default function PublicHeader() {
  return (
    <nav className="sticky top-0 z-50 border-b border-[#dcdcdc] bg-white/95 backdrop-blur-sm">
      <div className="container flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-3" aria-label="Ir para a página inicial">
          <Handshake className="h-8 w-8 shrink-0 text-[#111111]" aria-hidden="true" />
          <span
            className="text-2xl font-black uppercase tracking-[0.2em] text-[#111111] sm:text-3xl md:text-[2.2rem]"
            style={{ fontFamily: "'Orbitron', 'Segoe UI', sans-serif" }}
          >
            PARCERIA DO BEM
          </span>
        </Link>

        <Link
          href="/admin?tab=partners"
          className="inline-flex items-center rounded-full border border-[#228B22] bg-[#228B22] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1b711b]"
        >
          Área administrativa
        </Link>
      </div>
    </nav>
  );
}
