// @ts-nocheck
"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  tipo: string;
  imagen_url: string | null;
  sku: string | null;
  codigo_barras: string | null;
  categoria_id: string | null;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

interface VentaContextType {
  carrito: ItemCarrito[];
  agregarAlCarrito: (producto: Producto) => void;
  eliminarDelCarrito: (id: string) => void;
  vaciarCarrito: () => void;
  subtotal: number;
  total: number;
  clienteSeleccionado: string;
  setClienteSeleccionado: (id: string) => void;
  clientePuntos: number;
  setClientePuntos: (puntos: number) => void;
  puntosACanjear: number;
  setPuntosACanjear: (puntos: number) => void;
  descuentoPuntos: number;
  setDescuentoPuntos: (descuento: number) => void;
}

const VentaContext = createContext<VentaContextType | undefined>(undefined);

export function VentaProvider({ children }: { children: ReactNode }) {
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string>("");
  const [clientePuntos, setClientePuntos] = useState<number>(0);
  const [puntosACanjear, setPuntosACanjear] = useState<number>(0);
  const [descuentoPuntos, setDescuentoPuntos] = useState<number>(0);

  const agregarAlCarrito = useCallback((producto: Producto) => {
    if (producto.stock === 0) return;
    setCarrito(prev => {
      const existe = prev.find(item => item.producto.id === producto.id);
      if (existe) {
        if (existe.cantidad < producto.stock)
          return prev.map(item =>
            item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
          );
        return prev;
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  }, []);

  const eliminarDelCarrito = useCallback((id: string) => {
    setCarrito(prev =>
      prev.map(item =>
        item.producto.id === id ? { ...item, cantidad: item.cantidad - 1 } : item
      ).filter(item => item.cantidad > 0)
    );
  }, []);

  const vaciarCarrito = useCallback(() => {
    setCarrito([]);
    setClienteSeleccionado("");
    setClientePuntos(0);
    setPuntosACanjear(0);
    setDescuentoPuntos(0);
  }, []);

  const subtotal = carrito.reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0);
  const total = subtotal - descuentoPuntos;

  return (
    <VentaContext.Provider
      value={{
        carrito,
        agregarAlCarrito,
        eliminarDelCarrito,
        vaciarCarrito,
        subtotal,
        total,
        clienteSeleccionado,
        setClienteSeleccionado,
        clientePuntos,
        setClientePuntos,
        puntosACanjear,
        setPuntosACanjear,
        descuentoPuntos,
        setDescuentoPuntos,
      }}
    >
      {children}
    </VentaContext.Provider>
  );
}

export function useVenta() {
  const context = useContext(VentaContext);
  if (context === undefined) {
    throw new Error("useVenta debe usarse dentro de un VentaProvider");
  }
  return context;
}