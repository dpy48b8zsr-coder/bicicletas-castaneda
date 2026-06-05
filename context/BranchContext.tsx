// @ts-nocheck
"use client";

import { createContext, useContext, ReactNode } from "react";

interface Sucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activo: boolean;
}

interface BranchContextType {
  sucursalActiva: Sucursal | null;
  sucursales: Sucursal[];
  cambiarSucursal: (id: string) => void;
}

const BranchContext = createContext<BranchContextType>({
  sucursalActiva: null,
  sucursales: [],
  cambiarSucursal: () => {},
});

export function BranchProvider({
  children,
  sucursalActiva,
  sucursales,
  cambiarSucursal,
}: {
  children: ReactNode;
  sucursalActiva: Sucursal | null;
  sucursales: Sucursal[];
  cambiarSucursal: (id: string) => void;
}) {
  return (
    <BranchContext.Provider value={{ sucursalActiva, sucursales, cambiarSucursal }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  return useContext(BranchContext);
}