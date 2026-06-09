// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useBranch } from "@/context/BranchContext";

interface Cliente {
  id: string;
  nombre: string;
}

interface Cita {
  id: string;
  fecha_hora: string;
  clientes: { nombre: string } | null;
}

interface ProductoInventario {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

interface LineaOrden {
  id?: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

interface Orden {
  id: string;
  cliente_id: string | null;
  cita_id: string | null;
  estado: string;
  total: number;
  notas: string | null;
  created_at: string;
  clientes: { nombre: string } | null;
}

const ESTADOS = ["pendiente", "en_proceso", "lista_para_entrega", "entregada", "facturada"];

const mapearEstadoOrdenACita = (estadoOrden: string): string | null => {
  const mapa: Record<string, string> = {
    pendiente: "en_diagnostico",
    en_proceso: "en_reparacion",
    lista_para_entrega: "lista_para_entrega",
    entregada: "entregada",
    facturada: "entregada",
  };
  return mapa[estadoOrden] || null;
};

function OrdenTallerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const citaIdParam = searchParams.get("cita_id");

  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  const [cargando, setCargando] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string>("");
  const [citaId, setCitaId] = useState<string>("");
  const [estado, setEstado] = useState("pendiente");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaOrden[]>([]);
  const [guardando, setGuardando] = useState(false);

  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ProductoInventario[]>([]);

  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoNombreCliente, setNuevoNombreCliente] = useState("");
  const [nuevoTelefonoCliente, setNuevoTelefonoCliente] = useState("");

  const cargarDatos = async () => {
    setCargando(true);
    const [
      { data: ordenesData },
      { data: clientesData },
      { data: citasData },
      { data: prodsData },
    ] = await Promise.all([
      supabase.from("ordenes_taller")
        .select("*, clientes(nombre)")
       .eq("activo", true)
.eq("sucursal_id", sucursalId)
        .order("created_at", { ascending: false }),
      supabase.from("clientes").select("id, nombre").order("nombre"),
      supabase.from("citas_taller")
        .select("id, fecha_hora, clientes(nombre)")
        .eq("activo", true)
.eq("sucursal_id", sucursalId)
        .order("fecha_hora", { ascending: false })
        .limit(20),
      supabase.from("productos")
        .select("id, nombre, precio, stock")
        .eq("activo", true)
.eq("sucursal_id", sucursalId)
        .order("nombre"),
    ]);
    if (ordenesData) setOrdenes(ordenesData);
    if (clientesData) setClientes(clientesData);
    if (citasData) setCitas(citasData);
    if (prodsData) setProductos(prodsData);
    setCargando(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [sucursalId]);

  useEffect(() => {
    if (!citaIdParam) return;
    const precargarDesdeCita = async () => {
      const { data: cita } = await supabase
        .from("citas_taller")
        .select("*, clientes!inner(nombre)")
        .eq("id", citaIdParam)
        .single();
      if (!cita) return;
      setClienteId(cita.cliente_id || "");
      setNotas(cita.descripcion_problema || "");
      setCitaId(cita.id);
      if (cita.descripcion_problema) {
        setLineas([{
          producto_id: null,
          descripcion: cita.descripcion_problema,
          cantidad: 1,
          precio_unitario: 0,
        }]);
      }
    };
    precargarDesdeCita();
  }, [citaIdParam]);

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
        .eq("activo", true)
.eq("sucursal_id", sucursalId)
        .or(`nombre.ilike.${term},sku.ilike.${term},codigo_barras.ilike.${term}`)
        .limit(5);
      if (data) setResultadosBusqueda(data);
    };
    const timer = setTimeout(buscar, 200);
    return () => clearTimeout(timer);
  }, [busquedaProducto, sucursalId]);

  const abrirNueva = () => {
    setEditandoId(null);
    setClienteId("");
    setCitaId("");
    setEstado("pendiente");
    setNotas("");
    setLineas([]);
    setMostrarNuevoCliente(false);
    setNuevoNombreCliente("");
    setNuevoTelefonoCliente("");
    setMostrarForm(true);
  };

  const abrirEditar = async (orden: Orden) => {
    setEditandoId(orden.id);
    setClienteId(orden.cliente_id || "");
    setCitaId(orden.cita_id || "");
    setEstado(orden.estado);
    setNotas(orden.notas || "");
    setMostrarNuevoCliente(false);
    setNuevoNombreCliente("");
    setNuevoTelefonoCliente("");
    const { data: lineasData } = await supabase
      .from("detalle_orden_taller")
      .select("*")
      .eq("orden_id", orden.id);
    if (lineasData && lineasData.length > 0) {
      setLineas(lineasData.map((l: any) => ({
        id: l.id,
        producto_id: l.producto_id || null,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
      })));
    } else {
      setLineas([]);
    }
    setMostrarForm(true);
  };

  const crearClienteRapido = async () => {
    if (!nuevoNombreCliente.trim()) return;
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nombre: nuevoNombreCliente.trim(),
        telefono: nuevoTelefonoCliente.trim() || null,
        puntos: 0,
      })
      .select("id, nombre")
      .single();

    if (data) {
      setClientes(prev => [...prev, data]);
      setClienteId(data.id);
      setNuevoNombreCliente("");
      setNuevoTelefonoCliente("");
      setMostrarNuevoCliente(false);
    } else {
      alert("Error al crear cliente: " + error?.message);
    }
  };

  const agregarLineaProducto = (prod: ProductoInventario) => {
    setLineas(prev => [...prev, {
      producto_id: prod.id,
      descripcion: prod.nombre,
      cantidad: 1,
      precio_unitario: prod.precio,
    }]);
    setBusquedaProducto("");
    setResultadosBusqueda([]);
  };

  const agregarLineaManual = () => {
    setLineas(prev => [...prev, {
      producto_id: null,
      descripcion: "",
      cantidad: 1,
      precio_unitario: 0,
    }]);
  };

  const actualizarLinea = (index: number, campo: keyof LineaOrden, valor: any) => {
    const nuevas = [...lineas];
    (nuevas[index] as any)[campo] = valor;
    setLineas(nuevas);
  };

  const eliminarLinea = (index: number) => {
    setLineas(lineas.filter((_, i) => i !== index));
  };

  const totalOrden = lineas.reduce((sum, l) => sum + l.cantidad * l.precio_unitario, 0);

  const guardarOrden = async () => {
    if (!clienteId) { alert("Selecciona un cliente."); return; }
    if (lineas.length === 0) { alert("Agrega al menos un concepto."); return; }

    const payload = {
      cliente_id: clienteId,
      cita_id: citaId || null,
      estado: estado,
      total: totalOrden,
      notas: notas.trim() || null,
      sucursal_id: sucursalId,
    };

    setGuardando(true);
    let ordenId: string | null = editandoId;

    if (editandoId) {
      await supabase.from("ordenes_taller").update(payload).eq("id", editandoId);
      await supabase.from("detalle_orden_taller").delete().eq("orden_id", editandoId);
    } else {
      const { data } = await supabase.from("ordenes_taller").insert(payload).select("id").single();
      if (data) ordenId = data.id;
    }

    if (!ordenId) { alert("Error al guardar la orden."); setGuardando(false); return; }

    const lineasParaInsertar = lineas.map(l => ({
      orden_id: ordenId,
      producto_id: l.producto_id || null,
      descripcion: l.descripcion || "Concepto sin nombre",
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    }));

    const { error: lineasError } = await supabase.from("detalle_orden_taller").insert(lineasParaInsertar);
    if (lineasError) { alert("Error al guardar las líneas."); setGuardando(false); return; }

    if (citaId && !editandoId) {
      const estadoCita = mapearEstadoOrdenACita(estado);
      if (estadoCita) {
        await supabase.from("citas_taller").update({ estado: estadoCita }).eq("id", citaId);
      }
    }

    setGuardando(false);
    setMostrarForm(false);
    cargarDatos();
  };

  const cambiarEstado = async (id: string, nuevoEstado: string, citaIdAsociada?: string) => {
    await supabase.from("ordenes_taller").update({ estado: nuevoEstado }).eq("id", id);
    if (citaIdAsociada) {
      const estadoCita = mapearEstadoOrdenACita(nuevoEstado);
      if (estadoCita) {
        await supabase.from("citas_taller").update({ estado: estadoCita }).eq("id", citaIdAsociada);
      }
    }
    cargarDatos();
  };

  const convertirEnVenta = async (orden: Orden) => {
    await supabase.from("ordenes_taller").update({ estado: "facturada" }).eq("id", orden.id);
    if (orden.cita_id) {
      await supabase.from("citas_taller").update({ estado: "entregada" }).eq("id", orden.cita_id);
    }
    router.push(`/admin?orden_taller=${orden.id}&cliente_id=${orden.cliente_id || ""}`);
  };

  const descargarPDF = async (orden: Orden) => {
    const { data: lineasData } = await supabase
      .from("detalle_orden_taller")
      .select("*")
      .eq("orden_id", orden.id);

    const lineas = lineasData || [];
    const fecha = new Date(orden.created_at).toLocaleDateString("es-MX", {
      year: "numeric", month: "long", day: "numeric",
    });

    const nombreCliente = orden.clientes?.nombre || "No asignado";

    const terminos = `Términos y Condiciones del Servicio de Taller:
1. El cliente acepta que el taller realice los trabajos descritos en esta orden.
2. El taller no se hace responsable de daños causados por uso inadecuado o desgaste natural.
3. El cliente autoriza la sustitución de piezas necesarias, previa notificación.
4. El plazo de entrega es estimado y puede variar según disponibilidad de refacciones.
5. Cualquier reclamo debe presentarse dentro de los 7 días posteriores a la entrega.`;

    const generarCopia = (titulo: string, esCliente: boolean) => `
      <div style="border: 1px solid #000; padding: 15px; margin-bottom: 20px; page-break-after: always;">
        <h2 style="text-align: center;">${titulo}</h2>
        <p><strong>Orden Nº:</strong> ${orden.id.slice(0, 8)}</p>
        <p><strong>Fecha:</strong> ${fecha}</p>
        <p><strong>Cliente:</strong> ${nombreCliente}</p>
        <p><strong>Estado:</strong> ${orden.estado.replace(/_/g, " ")}</p>
        ${orden.notas ? `<p><strong>Notas:</strong> ${orden.notas}</p>` : ""}
        
        <h3 style="margin-top: 15px;">Conceptos</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
          <thead>
            <tr style="background: #f0f0f0;">
              <th style="border: 1px solid #000; padding: 5px; text-align: left;">Descripción</th>
              <th style="border: 1px solid #000; padding: 5px; text-align: center;">Cant.</th>
              <th style="border: 1px solid #000; padding: 5px; text-align: right;">P.Unit.</th>
              <th style="border: 1px solid #000; padding: 5px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineas.map((l: any) => `
              <tr>
                <td style="border: 1px solid #000; padding: 5px;">${l.descripcion || "—"}</td>
                <td style="border: 1px solid #000; padding: 5px; text-align: center;">${l.cantidad}</td>
                <td style="border: 1px solid #000; padding: 5px; text-align: right;">$${l.precio_unitario.toFixed(2)}</td>
                <td style="border: 1px solid #000; padding: 5px; text-align: right;">$${(l.cantidad * l.precio_unitario).toFixed(2)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p style="text-align: right; font-weight: bold; font-size: 16px;">Total: $${orden.total.toFixed(2)}</p>

        <div style="margin-top: 30px;">
          <h4>Términos y Condiciones</h4>
          <p style="font-size: 12px; white-space: pre-line;">${terminos}</p>
        </div>

        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
          <div style="width: 45%;">
            <p>_________________________</p>
            <p>Firma del Cliente</p>
            ${esCliente ? "<p style='color: blue;'>Copia para el Cliente</p>" : "<p style='color: red;'>Copia para el Taller</p>"}
          </div>
          <div style="width: 45%;">
            <p>_________________________</p>
            <p>Firma del Taller</p>
            <p>Bicicletas Castañeda</p>
          </div>
        </div>
      </div>
    `;

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>Orden de Taller #${orden.id.slice(0, 8)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          ${generarCopia("COPIA CLIENTE - Orden de Taller", true)}
          ${generarCopia("COPIA TALLER - Orden de Taller", false)}
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Orden_Taller_${orden.id.slice(0, 8)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">🔧 Órdenes de Taller</h1>
        <button onClick={abrirNueva} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition">+ Nueva Orden</button>
      </div>

      {/* Tabla en escritorio */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando órdenes...</p>
        ) : ordenes.length === 0 ? (
          <p className="p-4 text-gray-800">No hay órdenes de taller.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Cita</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-900">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ordenes.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{o.clientes?.nombre || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{o.cita_id ? `Cita #${o.cita_id.slice(0, 8)}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        o.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                        o.estado === "en_proceso" ? "bg-blue-100 text-blue-900" :
                        o.estado === "lista_para_entrega" ? "bg-green-100 text-green-900" :
                        o.estado === "entregada" ? "bg-purple-100 text-purple-900" :
                        "bg-gray-100 text-gray-900"
                      }`}>{o.estado.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">${o.total.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => abrirEditar(o)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => descargarPDF(o)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 text-xs font-medium transition-colors"
                        >
                          📄 PDF
                        </button>
                        <select
                          value={o.estado}
                          onChange={(e) => cambiarEstado(o.id, e.target.value, o.cita_id)}
                          className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                        >
                          {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                        </select>
                        {o.estado !== "facturada" && (
                          <button
                            onClick={() => convertirEnVenta(o)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-medium transition-colors"
                          >
                            🛒 Convertir en venta
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
          <p className="text-center text-gray-800 py-12">Cargando órdenes...</p>
        ) : ordenes.length === 0 ? (
          <p className="text-center text-gray-800 py-12">No hay órdenes de taller.</p>
        ) : (
          ordenes.map(o => (
            <div key={o.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{o.clientes?.nombre || "Sin cliente"}</h3>
                  <p className="text-xs text-gray-500">{o.cita_id ? `Cita #${o.cita_id.slice(0, 8)}` : "Sin cita"}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  o.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                  o.estado === "en_proceso" ? "bg-blue-100 text-blue-900" :
                  o.estado === "lista_para_entrega" ? "bg-green-100 text-green-900" :
                  o.estado === "entregada" ? "bg-purple-100 text-purple-900" :
                  "bg-gray-100 text-gray-900"
                }`}>{o.estado.replace(/_/g, " ")}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-lg font-bold text-green-700">${o.total.toFixed(2)}</span>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => abrirEditar(o)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => descargarPDF(o)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 text-xs font-medium transition-colors"
                  >
                    📄 PDF
                  </button>
                  <select
                    value={o.estado}
                    onChange={(e) => cambiarEstado(o.id, e.target.value, o.cita_id)}
                    className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                  >
                    {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                  </select>
                  {o.estado !== "facturada" && (
                    <button
                      onClick={() => convertirEnVenta(o)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-medium transition-colors"
                    >
                      🛒 Convertir en venta
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal formulario */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar Orden" : "Nueva Orden"}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Cliente *</label>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                  <option value="">-- Seleccionar --</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {!mostrarNuevoCliente ? (
                  <button type="button" onClick={() => setMostrarNuevoCliente(true)} className="text-green-600 text-xs font-medium hover:underline mt-1">+ Nuevo cliente</button>
                ) : (
                  <div className="mt-2 space-y-2 bg-gray-50 p-3 rounded-lg">
                    <input type="text" placeholder="Nombre del cliente" value={nuevoNombreCliente} onChange={(e) => setNuevoNombreCliente(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-500" />
                    <input type="text" placeholder="Teléfono (opcional)" value={nuevoTelefonoCliente} onChange={(e) => setNuevoTelefonoCliente(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-500" />
                    <div className="flex gap-2">
                      <button onClick={crearClienteRapido} disabled={!nuevoNombreCliente.trim()} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50">Guardar cliente</button>
                      <button onClick={() => { setMostrarNuevoCliente(false); setNuevoNombreCliente(""); setNuevoTelefonoCliente(""); }} className="text-gray-500 text-xs hover:underline">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Cita (opcional)</label>
                <select value={citaId} onChange={(e) => setCitaId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                  <option value="">-- Sin cita --</option>
                  {citas.map(c => (
                    <option key={c.id} value={c.id}>{new Date(c.fecha_hora).toLocaleString("es-MX")} - {c.clientes?.nombre || "—"}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Agregar repuesto del inventario</label>
              <input type="text" value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar por nombre, SKU o código..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" />
              {resultadosBusqueda.length > 0 && (
                <ul className="border border-gray-200 rounded-lg mt-1 max-h-32 overflow-y-auto bg-white shadow-sm">
                  {resultadosBusqueda.map(prod => (
                    <li key={prod.id} onClick={() => agregarLineaProducto(prod)} className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm flex justify-between items-center">
                      <span className="text-gray-900 font-medium">{prod.nombre}</span>
                      <span className="text-green-700 font-semibold">${prod.precio.toFixed(2)} (Stock: {prod.stock})</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={agregarLineaManual} className="text-green-600 text-xs font-medium hover:underline mt-1">+ Agregar servicio manual</button>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Conceptos</h3>
              <div className="space-y-2">
                {lineas.map((linea, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                    <div className="flex-1">
                      <input type="text" value={linea.descripcion} onChange={(e) => actualizarLinea(index, "descripcion", e.target.value)} placeholder="Descripción" className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900" />
                    </div>
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
              <span className="text-xl font-bold text-green-700">${totalOrden.toFixed(2)}</span>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Notas</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" rows={2} placeholder="Observaciones..." />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
              <button onClick={() => setMostrarForm(false)} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">Cancelar</button>
              <button onClick={guardarOrden} disabled={guardando} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50">{guardando ? "Guardando..." : editandoId ? "Actualizar" : "Crear Orden"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdenTallerPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Cargando...</div>}>
      <OrdenTallerPage />
    </Suspense>
  );
}