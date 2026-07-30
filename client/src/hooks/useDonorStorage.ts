import { useEffect, useState } from "react";

export interface DonorData {
  donorId: string; // ID único para sorteios
  donorName: string;
  donorWhatsapp: string;
  donorEmail: string;
  donorCity: string;
  donorChurch: string;
  createdAt: string;
  donationsCount: number; // Quantas vezes doou
}

const DONORS_STORAGE_KEY = "impact_donors";
const CURRENT_DONOR_KEY = "impact_current_donor";

function normalizeWhatsapp(value: string) {
  return value.replace(/\D/g, "");
}

/**
 * Gera ID único para doador (baseado em timestamp + random)
 */
function generateDonorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `DONOR-${timestamp}-${random}`.toUpperCase();
}

/**
 * Hook para gerenciar armazenamento local de doadores
 */
export function useDonorStorage() {
  const [donors, setDonors] = useState<DonorData[]>([]);
  const [currentDonor, setCurrentDonor] = useState<DonorData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Carregar doadores do localStorage ao montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DONORS_STORAGE_KEY);
      const storedCurrent = localStorage.getItem(CURRENT_DONOR_KEY);
      let parsedDonors: DonorData[] = [];

      if (stored) {
        parsedDonors = JSON.parse(stored);
        setDonors(parsedDonors);
      }
      if (storedCurrent) {
        setCurrentDonor(JSON.parse(storedCurrent));
      }
    } catch (error) {
      console.error("Erro ao carregar doadores:", error);
    }
    setIsLoaded(true);
  }, []);

  /**
   * Buscar doador existente por WhatsApp
   */
  function findDonorByWhatsapp(whatsapp: string): DonorData | undefined {
    const normalized = normalizeWhatsapp(whatsapp);
    return donors.find((d) => normalizeWhatsapp(d.donorWhatsapp) === normalized);
  }

  /**
   * Salvar ou atualizar doador
   */
  function saveDonor(donorData: Omit<DonorData, "donorId" | "createdAt" | "donationsCount">) {
    const normalizedWhatsapp = normalizeWhatsapp(donorData.donorWhatsapp.trim());
    const existing = donors.find((d) => normalizeWhatsapp(d.donorWhatsapp) === normalizedWhatsapp);

    let donor: DonorData;

    if (existing) {
      donor = {
        ...existing,
        donorName: donorData.donorName.trim() || existing.donorName,
        donorEmail: donorData.donorEmail.trim() || existing.donorEmail,
        donorCity: donorData.donorCity.trim() || existing.donorCity,
        donorChurch: donorData.donorChurch.trim() || existing.donorChurch,
        donationsCount: existing.donationsCount + 1,
      };

      const nextDonors = donors.map((d) => (d.donorId === donor.donorId ? donor : d));
      setDonors(nextDonors);
      localStorage.setItem(DONORS_STORAGE_KEY, JSON.stringify(nextDonors));
    } else {
      donor = {
        ...donorData,
        donorWhatsapp: normalizedWhatsapp,
        donorName: donorData.donorName.trim(),
        donorEmail: donorData.donorEmail.trim(),
        donorCity: donorData.donorCity.trim(),
        donorChurch: donorData.donorChurch.trim(),
        donorId: generateDonorId(),
        createdAt: new Date().toISOString(),
        donationsCount: 1,
      };

      const nextDonors = [...donors, donor];
      setDonors(nextDonors);
      localStorage.setItem(DONORS_STORAGE_KEY, JSON.stringify(nextDonors));
    }

    setCurrentDonor(donor);
    localStorage.setItem(CURRENT_DONOR_KEY, JSON.stringify(donor));

    return donor;
  }

  /**
   * Limpar doador atual (não remove do histórico)
   */
  function clearCurrentDonor() {
    setCurrentDonor(null);
    localStorage.removeItem(CURRENT_DONOR_KEY);
  }

  /**
   * Limpar todos os dados salvos do doador neste dispositivo
   */
  function clearSavedDonors() {
    setCurrentDonor(null);
    setDonors([]);
    localStorage.removeItem(CURRENT_DONOR_KEY);
    localStorage.removeItem(DONORS_STORAGE_KEY);
  }

  /**
   * Obter todos os doadores (para futuros sorteios)
   */
  function getAllDonors(): DonorData[] {
    return donors;
  }

  /**
   * Obter estatísticas dos doadores
   */
  function getDonorsStats() {
    return {
      totalDonors: donors.length,
      totalDonations: donors.reduce((sum, d) => sum + d.donationsCount, 0),
    };
  }

  return {
    isLoaded,
    donors,
    currentDonor,
    saveDonor,
    clearCurrentDonor,
    clearSavedDonors,
    findDonorByWhatsapp,
    getAllDonors,
    getDonorsStats,
  };
}
