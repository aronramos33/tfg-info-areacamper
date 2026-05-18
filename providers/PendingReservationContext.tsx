import React, { createContext, useContext, useState } from 'react';
import { Vehicle } from '@/components/utils/vehicle';

export type TravelerDraft = {
  full_name: string;
  doc_type: 'dni' | 'nie' | 'passport';
  doc_number: string;
  doc_support_number: string;
  nationality: string;
  birth_date: string; // YYYY-MM-DD
  gender: 'm' | 'f' | 'other';
  country_of_residence: string;
  city_of_residence: string;
  phone: string;
  email: string;
};

export type NewVehicleDraft = {
  brand: string;
  model: string;
  plate: string;
  alias: string;
  length_m: string;
};

export type VehicleSelection =
  | { type: 'saved'; vehicle: Vehicle }
  | { type: 'new'; draft: NewVehicleDraft; savedVehicle?: Vehicle };

export type PlaceConfig = {
  traveler: TravelerDraft;
  vehicleSelection: VehicleSelection | null;
  extras: { extra_id: number; quantity: number }[];
};

export type HolderDraft = {
  full_name: string;
  phone: string;
  dni: string;
};

export type PendingReservation = {
  numPlaces: number;
  placeConfigs: PlaceConfig[];
  startDate: string;
  endDate: string;
  selectedPlaceIds: number[];
  holder: HolderDraft;
  nightlyCents: number;
};

export function emptyTraveler(): TravelerDraft {
  return {
    full_name: '',
    doc_type: 'dni',
    doc_number: '',
    doc_support_number: '',
    nationality: 'ES',
    birth_date: '',
    gender: 'm',
    country_of_residence: '',
    city_of_residence: '',
    phone: '',
    email: '',
  };
}

export function emptyPlaceConfig(): PlaceConfig {
  return { traveler: emptyTraveler(), vehicleSelection: null, extras: [] };
}

const emptyPending: PendingReservation = {
  numPlaces: 1,
  placeConfigs: [],
  startDate: '',
  endDate: '',
  selectedPlaceIds: [],
  holder: { full_name: '', phone: '', dni: '' },
  nightlyCents: 1500,
};

interface PendingCtx {
  pending: PendingReservation;
  setPending: React.Dispatch<React.SetStateAction<PendingReservation>>;
  resetPending: () => void;
}

const PendingReservationContext = createContext<PendingCtx>({
  pending: emptyPending,
  setPending: () => {},
  resetPending: () => {},
});

export const PendingReservationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [pending, setPending] = useState<PendingReservation>(emptyPending);
  const resetPending = () => setPending(emptyPending);

  return (
    <PendingReservationContext.Provider value={{ pending, setPending, resetPending }}>
      {children}
    </PendingReservationContext.Provider>
  );
};

export const usePendingReservation = () => useContext(PendingReservationContext);
