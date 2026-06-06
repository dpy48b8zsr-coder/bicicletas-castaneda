// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useBranch } from "@/context/BranchContext";

interface PedidoOnline {
  id: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  items: any;
  total: number;
  estado: string;
  created_at: string;
}

const ESTADOS = ["pendiente", "confirmado", "en_preparacion", "listo", "entregado", "cancelado"];

export default function PedidosOnlinePage() {
  const router = useRouter();
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [pedidos, setPedidos] = useState<PedidoOnline[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargarPedidos = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("pedidos_online")
      .select("*")
      .eq("sucursal_id", sucursalId)
      .order("created_at", { ascending: false });
    if (!error && data) setPedidos(data);
    setCargando(false);
  };

  useEffect(() => {
    cargarPedidos();
  }, [sucursalId]);

  const cambiarEstado = async (id: string, nuevoEstado: string) => {
    await supabase.from("pedidos_online").update({ estado: nuevoEstado }).eq("id", id);
    cargarPedidos();
  };

  const convertirEnVenta = (pedido: PedidoOnline) => {
    sessionStorage.setItem("pedido_online_convertir", JSON.stringify(pedido));
    router.push("/admin?pedido_online=true");
  };

  const obtenerItems = (pedido: PedidoOnline): any[] => {
    if (!pedido.items) return [];
    if (Array.isArray(pedido.items)) return pedido.items;
    try {
      const parsed = JSON.parse(pedido.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">🛍️ Pedidos Online</h1>
      </div>

      {/* Tabla en escritorio */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando pedidos...</p>
        ) : pedidos.length === 0 ? (
          <p className="p-4 text-gray-800">No hay pedidos online.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Productos</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pedidos.map(p => {
                  const items = obtenerItems(p);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{new Date(p.created_at).toLocaleString("es-MX")}</td>
                      <td className="px-4 py-3 text-gray-900">
                        <p className="font-medium">{p.cliente_nombre || "—"}</p>
                        <p className="text-xs text-gray-500">{p.cliente_telefono || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {items.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} className="text-xs">{item.nombre} x{item.cantidad}</div>
                        ))}
                        {items.length > 3 && <div className="text-xs text-gray-400">...y {items.length - 3} más</div>}
                        {items.length === 0 && "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">${p.total?.toFixed(2) || "0.00"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          p.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                          p.estado === "confirmado" ? "bg-blue-100 text-blue-900" :
                          p.estado === "en_preparacion" ? "bg-purple-100 text-purple-900" :
                          p.estado === "listo" ? "bg-green-100 text-green-900" :
                          p.estado === "entregado" ? "bg-gray-100 text-gray-900" :
                          "bg-red-100 text-red-900"
                        }`}>{p.estado.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <select
                            value={p.estado}
                            onChange={(e) => cambiarEstado(p.id, e.target.value)}
                            className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                          >
                            {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                          </select>
                          <button
  onClick={() => convertirEnVenta(p)}
  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-medium transition-colors"
>
  🛒 Convertir en venta
</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tarjetas en móvil */}
      <div className="md:hidden space-y-3">
        {cargando ? (
          <p className="text-center text-gray-800 py-12">Cargando pedidos...</p>
        ) : pedidos.length === 0 ? (
          <p className="text-center text-gray-800 py-12">No hay pedidos online.</p>
        ) : (
          pedidos.map(p => {
            const items = obtenerItems(p);
            return (
              <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{p.cliente_nombre || "Sin nombre"}</h3>
                    <p className="text-xs text-gray-500">{p.cliente_telefono || "Sin teléfono"}</p>
                    <p className="text-xs text-gray-500">{new Date(p.created_at).toLocaleString("es-MX")}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    p.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                    p.estado === "confirmado" ? "bg-blue-100 text-blue-900" :
                    p.estado === "en_preparacion" ? "bg-purple-100 text-purple-900" :
                    p.estado === "listo" ? "bg-green-100 text-green-900" :
                    p.estado === "entregado" ? "bg-gray-100 text-gray-900" :
                    "bg-red-100 text-red-900"
                  }`}>{p.estado.replace(/_/g, " ")}</span>
                </div>
                <div className="mt-2">
                  {items.slice(0, 3).map((item: any, idx: number) => (
                    <p key={idx} className="text-xs text-gray-700">{item.nombre} x{item.cantidad}</p>
                  ))}
                  {items.length > 3 && <p className="text-xs text-gray-400">...y {items.length - 3} más</p>}
                  {items.length === 0 && <p className="text-xs text-gray-400">—</p>}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-bold text-green-700">${p.total?.toFixed(2) || "0.00"}</span>
                  <div className="flex gap-2">
                    <select
                      value={p.estado}
                      onChange={(e) => cambiarEstado(p.id, e.target.value)}
                      className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                    >
                      {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                    </select>
                    <button
  onClick={() => convertirEnVenta(p)}
  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-medium transition-colors"
>
  🛒 Convertir en venta
</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}