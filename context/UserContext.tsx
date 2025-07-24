// context/UserContext.tsx

import React, { createContext, useState, useContext } from 'react';

type UserRole = 'pilot' | 'aeroclub';
type AircraftType = 'motor' | 'glider' | '';

interface UserContextType {
  username: string;
  role: UserRole;
  callsign: string;
  aircraftType: AircraftType;
  aircraftModel: string;
  aircraftIcon: string;
  setUser: (name: string, role: UserRole, callsign: string) => void;
  setAircraft: (type: AircraftType, model: string, icon: string, callsign: string) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('pilot');
  const [callsign, setCallsign] = useState('');
  const [aircraftType, setAircraftType] = useState<AircraftType>('');
  const [aircraftModel, setAircraftModel] = useState('');
  const [aircraftIcon, setAircraftIcon] = useState('');

  const setUser = (name: string, role: UserRole, callsign: string) => {
    setUsername(name);
    setRole(role);
    setCallsign(callsign);
  };

  const setAircraft = (type: AircraftType, model: string, icon: string, callsign: string) => {
    setAircraftType(type);
    setAircraftModel(model);
    setAircraftIcon(icon);
    setCallsign(callsign); // ✅ Guarda la matrícula también desde acá
  };

  return (
    <UserContext.Provider
      value={{
        username,
        role,
        callsign,
        aircraftType,
        aircraftModel,
        aircraftIcon,
        setUser,
        setAircraft,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
};
