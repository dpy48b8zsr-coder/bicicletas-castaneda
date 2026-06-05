// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useBranch } from "@/context/BranchContext";

interface Cliente {
  id: string;
  nombre: string;
}

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

interface LineaPresupuesto {
  id?: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

interface Presupuesto {
  id: string;
  cliente_id: string | null;
  estado: string;
  total: number;
  notas: string | null;
  created_at: string;
  clientes: { nombre: string } | null;
}

export default function PresupuestosPage() {
  const router = useRouter();
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);

  // Modal
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaPresupuesto[]>([]);
  const [guardando, setGuardando] = useState(false);

  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<Producto[]>([]);

  const cargarDatos = async () => {
    setCargando(true);
    const [{ data: pres }, { data: cli }, { data: prods }] = await Promise.all([
      supabase.from("presupuestos")
        .select("*, clientes(nombre)")
        .eq("sucursal_id", sucursalId)
        .order("created_at", { ascending: false }),
      supabase.from("clientes").select("id, nombre").order("nombre"),
      supabase.from("productos")
        .select("id, nombre, precio, stock")
        .eq("sucursal_id", sucursalId)
        .order("nombre"),
    ]);
    if (pres) setPresupuestos(pres);
    if (cli) setClientes(cli);
    if (prods) setProductos(prods);
    setCargando(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [sucursalId]);

  useEffect(() => {
    const buscar = async () => {
      if (busquedaProducto.trim() === "") {
        setResultadosBusqueda([]);
        return;
      }
      const term = `%${busquedaProducto}%`;
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, stock")
        .eq("sucursal_id", sucursalId)
        .or(`nombre.ilike.${term},sku.ilike.${term},codigo_barras.ilike.${term}`)
        .limit(5);
      if (data) setResultadosBusqueda(data);
    };
    const timer = setTimeout(buscar, 200);
    return () => clearTimeout(timer);
  }, [busquedaProducto, sucursalId]);

  const abrirNuevo = () => {
    setEditandoId(null);
    setClienteId("");
    setNotas("");
    setLineas([]);
    setMostrarForm(true);
  };

  const abrirEditar = async (presupuesto: Presupuesto) => {
    setEditandoId(presupuesto.id);
    setClienteId(presupuesto.cliente_id || "");
    setNotas(presupuesto.notas || "");
    const { data: lineasData } = await supabase
      .from("detalle_presupuesto")
      .select("*")
      .eq("presupuesto_id", presupuesto.id);
    if (lineasData) {
      setLineas(lineasData.map((l: any) => ({
        id: l.id,
        producto_id: l.producto_id,
        descripcion: l.descripcion || "",
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
      })));
    } else {
      setLineas([]);
    }
    setMostrarForm(true);
  };

  const agregarLineaProducto = (producto: Producto) => {
    const nuevaLinea: LineaPresupuesto = {
      producto_id: producto.id,
      descripcion: producto.nombre,
      cantidad: 1,
      precio_unitario: producto.precio,
    };
    setLineas(prev => [...prev, nuevaLinea]);
    setBusquedaProducto("");
    setResultadosBusqueda([]);
  };

  const agregarLineaManual = () => {
    setLineas(prev => [...prev, { producto_id: null, descripcion: "", cantidad: 1, precio_unitario: 0 }]);
  };

  const actualizarLinea = (index: number, campo: keyof LineaPresupuesto, valor: any) => {
    const nuevas = [...lineas];
    (nuevas[index] as any)[campo] = valor;
    setLineas(nuevas);
  };

  const eliminarLinea = (index: number) => {
    setLineas(lineas.filter((_, i) => i !== index));
  };

  const totalPresupuesto = lineas.reduce((sum, l) => sum + l.cantidad * l.precio_unitario, 0);

  const guardarPresupuesto = async () => {
    if (!clienteId) { alert("Selecciona un cliente."); return; }
    if (lineas.length === 0) { alert("Agrega al menos una línea."); return; }
    setGuardando(true);

    const payload = {
      cliente_id: clienteId,
      total: totalPresupuesto,
      notas: notas.trim() || null,
      sucursal_id: sucursalId,
    };

    let presupuestoId: string | null = editandoId;

    if (editandoId) {
      await supabase.from("presupuestos").update(payload).eq("id", editandoId);
      await supabase.from("detalle_presupuesto").delete().eq("presupuesto_id", editandoId);
    } else {
      const { data } = await supabase.from("presupuestos").insert(payload).select("id").single();
      if (data) presupuestoId = data.id;
    }

    if (!presupuestoId) { alert("Error al guardar el presupuesto."); setGuardando(false); return; }

    const lineasParaInsertar = lineas.map(l => ({
      presupuesto_id: presupuestoId,
      producto_id: l.producto_id || null,
      descripcion: l.descripcion || null,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    }));

    const { error: lineasError } = await supabase.from("detalle_presupuesto").insert(lineasParaInsertar);
    if (lineasError) { alert("Error al guardar las líneas."); setGuardando(false); return; }

    setGuardando(false);
    setMostrarForm(false);
    cargarDatos();
  };

  const cambiarEstado = async (id: string, nuevoEstado: string) => {
    await supabase.from("presupuestos").update({ estado: nuevoEstado }).eq("id", id);
    cargarDatos();
  };

  const convertirEnVenta = (presupuestoId: string) => {
    router.push(`/admin?presupuesto=${presupuestoId}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">📝 Presupuestos</h1>
        <button onClick={abrirNuevo} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition">
          + Nuevo Presupuesto
        </button>
      </div>

      {/* Tabla en escritorio */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando...</p>
        ) : presupuestos.length === 0 ? (
          <p className="p-4 text-gray-800">No hay presupuestos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {presupuestos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{p.clientes?.nombre || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{new Date(p.created_at).toLocaleDateString("es-MX")}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        p.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                        p.estado === "aprobado" ? "bg-green-100 text-green-900" :
                        "bg-red-100 text-red-900"
                      }`}>{p.estado}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">${p.total.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => abrirEditar(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium underline">Editar</button>
                        {p.estado === "pendiente" && (
                          <>
                            <button onClick={() => cambiarEstado(p.id, "aprobado")} className="text-green-600 hover:text-green-800 text-xs font-medium underline">Aprobar</button>
                            <button onClick={() => cambiarEstado(p.id, "rechazado")} className="text-red-600 hover:text-red-800 text-xs font-medium underline">Rechazar</button>
                          </>
                        )}
                        {p.estado === "aprobado" && (
                          <button onClick={() => convertirEnVenta(p.id)} className="text-purple-600 hover:text-purple-800 text-xs font-bold underline">
                            Convertir en venta
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tarjetas en móvil */}
      <div className="md:hidden space-y-3">
        {cargando ? (
          <p className="text-center text-gray-800 py-12">Cargando...</p>
        ) : presupuestos.length === 0 ? (
          <p className="text-center text-gray-800 py-12">No hay presupuestos.</p>
        ) : (
          presupuestos.map(p => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{p.clientes?.nombre || "Sin cliente"}</h3>
                  <p className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString("es-MX")}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  p.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                  p.estado === "aprobado" ? "bg-green-100 text-green-900" :
                  "bg-red-100 text-red-900"
                }`}>{p.estado}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-lg font-bold text-green-700">${p.total.toFixed(2)}</span>
                <div className="flex gap-2">
                  <button onClick={() => abrirEditar(p)} className="text-blue-600 text-xs font-medium underline">Editar</button>
                  {p.estado === "pendiente" && (
                    <>
                      <button onClick={() => cambiarEstado(p.id, "aprobado")} className="text-green-600 text-xs font-medium underline">Aprobar</button>
                      <button onClick={() => cambiarEstado(p.id, "rechazado")} className="text-red-600 text-xs font-medium underline">Rechazar</button>
                    </>
                  )}
                  {p.estado === "aprobado" && (
                    <button onClick={() => convertirEnVenta(p.id)} className="text-purple-600 text-xs font-bold underline">Convertir en venta</button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de formulario (sin cambios) */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar Presupuesto" : "Nuevo Presupuesto"}
            </h2>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Cliente *</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                <option value="">-- Seleccionar cliente --</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Agregar producto</label>
              <input type="text" value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar por nombre, SKU o código..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" />
              {resultadosBusqueda.length > 0 && (
                <ul className="border border-gray-200 rounded-lg mt-1 max-h-32 overflow-y-auto bg-white shadow-sm">
                  {resultadosBusqueda.map(prod => (
                    <li key={prod.id} onClick={() => agregarLineaProducto(prod)} className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm flex justify-between items-center">
                      <span className="text-gray-900 font-medium">{prod.nombre}</span>
                      <span className="text-green-700 font-semibold">${prod.precio.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={agregarLineaManual} className="text-green-600 text-xs font-medium hover:underline mt-1">+ Agregar línea manual</button>
            </div>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Partidas</h3>
              <div className="space-y-2">
                {lineas.map((linea, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                    <div className="flex-1"><input type="text" value={linea.descripcion} onChange={(e) => actualizarLinea(index, "descripcion", e.target.value)} placeholder="Descripción" className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900" /></div>
                    <input type="number" min="1" value={linea.cantidad} onChange={(e) => actualizarLinea(index, "cantidad", parseInt(e.target.value) || 1)} className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900" />
                    <input type="text" inputMode="decimal" value={linea.precio_unitario} onChange={(e) => { const val = parseFloat(e.target.value) || 0; actualizarLinea(index, "precio_unitario", val); }} className="w-24 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900" />
                    <span className="text-xs text-gray-700 font-semibold w-20 text-right">${(linea.cantidad * linea.precio_unitario).toFixed(2)}</span>
                    <button onClick={() => eliminarLinea(index)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-center bg-gray-100 rounded-lg p-3 mb-4">
              <span className="text-sm font-semibold text-gray-900">Total</span>
              <span className="text-xl font-bold text-green-700">${totalPresupuesto.toFixed(2)}</span>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Notas</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" rows={2} placeholder="Observaciones del presupuesto..." />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
              <button onClick={() => setMostrarForm(false)} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">Cancelar</button>
              <button onClick={guardarPresupuesto} disabled={guardando} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50">
                {guardando ? "Guardando..." : editandoId ? "Actualizar" : "Crear Presupuesto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}