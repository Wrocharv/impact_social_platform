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

      if (stored) {
        setDonors(JSON.parse(stored));
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
    return donors.find((d) => d.donorWhatsapp === whatsapp);
  }

  /**
   * Salvar ou atualizar doador
   */
  function saveDonor(donorData: Omit<DonorData, "donorId" | "createdAt" | "donationsCount">) {
    const existing = findDonorByWhatsapp(donorData.donorWhatsapp);

    let donor: DonorData;

    if (existing) {
      // Atualizar doador existente
      donor = {
        ...existing,
        donorName: donorData.donorName,
        donorEmail: donorData.donorEmail,
        donorCity: donorData.donorCity,
        donorChurch: donorData.donorChurch,
        donationsCount: existing.donationsCount + 1,
      };

      setDonors((prev) =>
        prev.map((d) => (d.donorId === donor.donorId ? donor : d)),
      );
    } else {
      // Criar novo doador
      donor = {
        ...donorData,
        donorId: generateDonorId(),
        createdAt: new Date().toISOString(),
        donationsCount: 1,
      };

      setDonors((prev) => [...prev, donor]);
    }

    // Salvar no localStorage
    setCurrentDonor(donor);
    localStorage.setItem(DONORS_STORAGE_KEY, JSON.stringify(donors));
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
    findDonorByWhatsapp,
    getAllDonors,
    getDonorsStats,
  };
}
