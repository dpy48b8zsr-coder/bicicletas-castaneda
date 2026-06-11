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

interface TicketData {
  id: string;
  carrito: ItemCarrito[];
  clienteSeleccionado: string;
  clientePuntos: number;
  puntosACanjear: number;
  descuentoPuntos: number;
  descuentoManual: number;
  descuentoManualTipo: "porcentaje" | "monto";
}

interface VentaContextType {
  tickets: TicketData[];
  ticketActivoId: string;
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
  descuentoManual: number;
  setDescuentoManual: (descuento: number) => void;
  descuentoManualTipo: "porcentaje" | "monto";
  setDescuentoManualTipo: (tipo: "porcentaje" | "monto") => void;
  crearNuevoTicket: () => void;
  cambiarTicket: (id: string) => void;
  cerrarTicket: (id: string) => void;
}

const VentaContext = createContext<VentaContextType | undefined>(undefined);

function generarId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

export function VentaProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<TicketData[]>([
    { id: generarId(), carrito: [], clienteSeleccionado: "", clientePuntos: 0, puntosACanjear: 0, descuentoPuntos: 0, descuentoManual: 0, descuentoManualTipo: "monto" }
  ]);
  const [ticketActivoId, setTicketActivoId] = useState(tickets[0].id);

  const ticketActivo = tickets.find(t => t.id === ticketActivoId) || tickets[0];

  const actualizarTicketActivo = useCallback((actualizador: (ticket: TicketData) => TicketData) => {
    setTickets(prev => prev.map(t => t.id === ticketActivoId ? actualizador(t) : t));
  }, [ticketActivoId]);

  const agregarAlCarrito = useCallback((producto: Producto) => {
    if (producto.stock === 0) return;
    actualizarTicketActivo(ticket => {
      const existe = ticket.carrito.find(item => item.producto.id === producto.id);
      if (existe) {
        if (existe.cantidad < producto.stock)
          return {
            ...ticket,
            carrito: ticket.carrito.map(item =>
              item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
            )
          };
        return ticket;
      }
      return { ...ticket, carrito: [...ticket.carrito, { producto, cantidad: 1 }] };
    });
  }, [actualizarTicketActivo]);

  const eliminarDelCarrito = useCallback((id: string) => {
    actualizarTicketActivo(ticket => ({
      ...ticket,
      carrito: ticket.carrito
        .map(item => item.producto.id === id ? { ...item, cantidad: item.cantidad - 1 } : item)
        .filter(item => item.cantidad > 0)
    }));
  }, [actualizarTicketActivo]);

  const vaciarCarrito = useCallback(() => {
    actualizarTicketActivo(ticket => ({
      ...ticket,
      carrito: [],
      clienteSeleccionado: "",
      clientePuntos: 0,
      puntosACanjear: 0,
      descuentoPuntos: 0,
      descuentoManual: 0,
      descuentoManualTipo: "monto",
    }));
  }, [actualizarTicketActivo]);

  const setClienteSeleccionado = useCallback((id: string) => {
    actualizarTicketActivo(ticket => ({ ...ticket, clienteSeleccionado: id }));
  }, [actualizarTicketActivo]);

  const setClientePuntos = useCallback((puntos: number) => {
    actualizarTicketActivo(ticket => ({ ...ticket, clientePuntos: puntos }));
  }, [actualizarTicketActivo]);

  const setPuntosACanjear = useCallback((puntos: number) => {
    actualizarTicketActivo(ticket => ({ ...ticket, puntosACanjear: puntos }));
  }, [actualizarTicketActivo]);

  const setDescuentoPuntos = useCallback((descuento: number) => {
    actualizarTicketActivo(ticket => ({ ...ticket, descuentoPuntos: descuento }));
  }, [actualizarTicketActivo]);

  const setDescuentoManual = useCallback((descuento: number) => {
    actualizarTicketActivo(ticket => ({ ...ticket, descuentoManual: descuento }));
  }, [actualizarTicketActivo]);

  const setDescuentoManualTipo = useCallback((tipo: "porcentaje" | "monto") => {
    actualizarTicketActivo(ticket => ({ ...ticket, descuentoManualTipo: tipo }));
  }, [actualizarTicketActivo]);

  const crearNuevoTicket = useCallback(() => {
    const nuevoTicket: TicketData = {
      id: generarId(),
      carrito: [],
      clienteSeleccionado: "",
      clientePuntos: 0,
      puntosACanjear: 0,
      descuentoPuntos: 0,
      descuentoManual: 0,
      descuentoManualTipo: "monto",
    };
    setTickets(prev => [...prev, nuevoTicket]);
    setTicketActivoId(nuevoTicket.id);
  }, []);

  const cambiarTicket = useCallback((id: string) => {
    setTicketActivoId(id);
  }, []);

  const cerrarTicket = useCallback((id: string) => {
    setTickets(prev => {
      const nuevos = prev.filter(t => t.id !== id);
      if (nuevos.length === 0) {
        const unico = { id: generarId(), carrito: [], clienteSeleccionado: "", clientePuntos: 0, puntosACanjear: 0, descuentoPuntos: 0, descuentoManual: 0, descuentoManualTipo: "monto" };
        return [unico];
      }
      return nuevos;
    });
    setTicketActivoId(prev => {
      if (prev === id) {
        const nuevos = tickets.filter(t => t.id !== id);
        return nuevos.length > 0 ? nuevos[0].id : "";
      }
      return prev;
    });
  }, [tickets]);

  const subtotal = ticketActivo.carrito.reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0);
  const montoDescuentoManual = ticketActivo.descuentoManualTipo === "porcentaje"
    ? (subtotal * ticketActivo.descuentoManual) / 100
    : ticketActivo.descuentoManual;
  const total = subtotal - ticketActivo.descuentoPuntos - montoDescuentoManual;

  return (
    <VentaContext.Provider
      value={{
        tickets,
        ticketActivoId,
        carrito: ticketActivo.carrito,
        agregarAlCarrito,
        eliminarDelCarrito,
        vaciarCarrito,
        subtotal,
        total,
        clienteSeleccionado: ticketActivo.clienteSeleccionado,
        setClienteSeleccionado,
        clientePuntos: ticketActivo.clientePuntos,
        setClientePuntos,
        puntosACanjear: ticketActivo.puntosACanjear,
        setPuntosACanjear,
        descuentoPuntos: ticketActivo.descuentoPuntos,
        setDescuentoPuntos,
        descuentoManual: ticketActivo.descuentoManual,
        setDescuentoManual,
        descuentoManualTipo: ticketActivo.descuentoManualTipo,
        setDescuentoManualTipo,
        crearNuevoTicket,
        cambiarTicket,
        cerrarTicket,
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