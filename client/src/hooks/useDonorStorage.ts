import { useEffect, useState } from "react";

export interface DonorData {
  donorId: string;
  donorName: string;
  donorCpf: string;
  donorWhatsapp: string;
  donorEmail: string;
  donorCity: string;
  donorChurch: string;
  donorBirthDate: string; // YYYY-MM-DD
  donorGender: "male" | "female" | "other" | "prefer_not_to_say" | "";
  createdAt: string;
  donationsCount: number;
}

const DONORS_STORAGE_KEY = "impact_donors";
const CURRENT_DONOR_KEY = "impact_current_donor";

function normalizeWhatsapp(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
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
        parsedDonors = (JSON.parse(stored) as DonorData[]).map((donor) => ({
          ...donor,
          donorCpf: normalizeCpf(donor.donorCpf || ""),
          donorWhatsapp: normalizeWhatsapp(donor.donorWhatsapp || ""),
          donorBirthDate: donor.donorBirthDate || "",
          donorGender: donor.donorGender || "",
        }));
        setDonors(parsedDonors);
      }
      if (storedCurrent) {
        const parsedCurrent = JSON.parse(storedCurrent) as DonorData;
        setCurrentDonor({
          ...parsedCurrent,
          donorCpf: normalizeCpf(parsedCurrent.donorCpf || ""),
          donorWhatsapp: normalizeWhatsapp(parsedCurrent.donorWhatsapp || ""),
          donorBirthDate: parsedCurrent.donorBirthDate || "",
          donorGender: parsedCurrent.donorGender || "",
        });
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

  function findDonorByCpf(cpf: string): DonorData | undefined {
    const normalized = normalizeCpf(cpf);
    return donors.find((d) => normalizeCpf(d.donorCpf || "") === normalized);
  }

  function findDonorByName(name: string): DonorData | undefined {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return undefined;
    return donors.find((d) => d.donorName.trim().toLowerCase() === normalized)
      || donors.find((d) => d.donorName.trim().toLowerCase().includes(normalized));
  }

  /**
   * Salvar ou atualizar doador
   */
  function saveDonor(donorData: Omit<DonorData, "donorId" | "createdAt" | "donationsCount">) {
    const normalizedCpf = normalizeCpf(donorData.donorCpf.trim());
    const normalizedWhatsapp = normalizeWhatsapp(donorData.donorWhatsapp.trim());
    const normalizedEmail = donorData.donorEmail.trim().toLowerCase();
    const normalizedName = donorData.donorName.trim().toLowerCase();
    const existing = donors.find((d) => normalizeCpf(d.donorCpf || "") === normalizedCpf)
      || donors.find((d) => normalizeWhatsapp(d.donorWhatsapp) === normalizedWhatsapp)
      || donors.find((d) => d.donorEmail.trim().toLowerCase() === normalizedEmail)
      || donors.find((d) => d.donorName.trim().toLowerCase() === normalizedName);

    let donor: DonorData;

    if (existing) {
      donor = {
        ...existing,
        donorName: donorData.donorName.trim() || existing.donorName,
        donorCpf: normalizedCpf || existing.donorCpf,
        donorEmail: donorData.donorEmail.trim() || existing.donorEmail,
        donorCity: donorData.donorCity.trim() || existing.donorCity,
        donorChurch: donorData.donorChurch.trim() || existing.donorChurch,
        donorBirthDate: donorData.donorBirthDate || existing.donorBirthDate || "",
        donorGender: donorData.donorGender || existing.donorGender || "",
        donationsCount: existing.donationsCount + 1,
      };

      const nextDonors = donors.map((d) => (d.donorId === donor.donorId ? donor : d));
      setDonors(nextDonors);
      localStorage.setItem(DONORS_STORAGE_KEY, JSON.stringify(nextDonors));
    } else {
      donor = {
        ...donorData,
        donorCpf: normalizedCpf || "",
        donorWhatsapp: normalizedWhatsapp,
        donorName: donorData.donorName.trim(),
        donorEmail: donorData.donorEmail.trim(),
        donorCity: donorData.donorCity.trim(),
        donorChurch: donorData.donorChurch.trim(),
        donorBirthDate: donorData.donorBirthDate || "",
        donorGender: donorData.donorGender || "",
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

  function rememberDonorProfile(donorData: Omit<DonorData, "donorId" | "createdAt" | "donationsCount">) {
    const normalizedCpf = normalizeCpf(donorData.donorCpf.trim());
    const normalizedWhatsapp = normalizeWhatsapp(donorData.donorWhatsapp.trim());
    const normalizedEmail = donorData.donorEmail.trim().toLowerCase();
    const normalizedName = donorData.donorName.trim().toLowerCase();
    const existing = donors.find((d) => normalizeCpf(d.donorCpf || "") === normalizedCpf)
      || donors.find((d) => normalizeWhatsapp(d.donorWhatsapp) === normalizedWhatsapp)
      || donors.find((d) => d.donorEmail.trim().toLowerCase() === normalizedEmail)
      || donors.find((d) => d.donorName.trim().toLowerCase() === normalizedName);

    const donor: DonorData = existing
      ? {
          ...existing,
          donorName: donorData.donorName.trim() || existing.donorName,
          donorCpf: normalizedCpf || existing.donorCpf,
          donorEmail: donorData.donorEmail.trim() || existing.donorEmail,
          donorCity: donorData.donorCity.trim() || existing.donorCity,
          donorChurch: donorData.donorChurch.trim() || existing.donorChurch,
          donorBirthDate: donorData.donorBirthDate || existing.donorBirthDate || "",
          donorGender: donorData.donorGender || existing.donorGender || "",
        }
      : {
          ...donorData,
          donorCpf: normalizedCpf || "",
          donorWhatsapp: normalizedWhatsapp,
          donorName: donorData.donorName.trim(),
          donorEmail: donorData.donorEmail.trim(),
          donorCity: donorData.donorCity.trim(),
          donorChurch: donorData.donorChurch.trim(),
          donorBirthDate: donorData.donorBirthDate || "",
          donorGender: donorData.donorGender || "",
          donorId: generateDonorId(),
          createdAt: new Date().toISOString(),
          donationsCount: 0,
        };

    const nextDonors = existing
      ? donors.map((d) => (d.donorId === donor.donorId ? donor : d))
      : [...donors, donor];

    setDonors(nextDonors);
    setCurrentDonor(donor);
    localStorage.setItem(DONORS_STORAGE_KEY, JSON.stringify(nextDonors));
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
    rememberDonorProfile,
    clearCurrentDonor,
    clearSavedDonors,
      findDonorByCpf,
      findDonorByName,
    findDonorByWhatsapp,
    getAllDonors,
    getDonorsStats,
  };
}
