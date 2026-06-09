// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useBranch } from "@/context/BranchContext";

// Interfaces
interface Cliente {
  id: string;
  nombre: string;
}

interface Cita {
  id: string;
  cliente_id: string | null;
  fecha_hora: string;
  duracion_min: number;
  estado: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  descripcion_problema: string | null;
  diagnostico: string | null;
  notas: string | null;
  clientes: { nombre: string } | null;
}

interface ProductoInventario {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}

interface LineaOrden {
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

const ESTADOS = ["agendada", "en_diagnostico", "esperando_repuestos", "en_reparacion", "lista_para_entrega", "entregada"];

export default function AgendarTallerPage() {
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  // Datos principales
  const [citas, setCitas] = useState<Cita[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<ProductoInventario[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtroFecha, setFiltroFecha] = useState<string>(new Date().toISOString().slice(0, 10));

  // Modal de cita (crear/editar)
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    cliente_id: "",
    fecha: "",
    hora: "",
    duracion: 60,
    estado: "agendada",
    marca: "",
    modelo: "",
    numero_serie: "",
    descripcion_problema: "",
    diagnostico: "",
    notas: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Crear cliente al vuelo en el modal de cita
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoNombreCliente, setNuevoNombreCliente] = useState("");
  const [nuevoTelefonoCliente, setNuevoTelefonoCliente] = useState("");

  // Panel de creación rápida de orden
  const [mostrarPanelOrden, setMostrarPanelOrden] = useState(false);
  const [citaPanel, setCitaPanel] = useState<Cita | null>(null);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ProductoInventario[]>([]);
  const [lineas, setLineas] = useState<LineaOrden[]>([]);
  const [guardandoOrden, setGuardandoOrden] = useState(false);

  // Cargar datos iniciales
  const cargarDatos = async () => {
    setCargando(true);
    const inicio = `${filtroFecha}T00:00:00`;
    const fin = `${filtroFecha}T23:59:59`;

    const [
      { data: citasData },
      { data: clientesData },
      { data: prodsData },
    ] = await Promise.all([
      supabase.from("citas_taller")
        .select("*, clientes(nombre)")
        .eq("activo", true)
.eq("sucursal_id", sucursalId)
        .gte("fecha_hora", inicio)
        .lte("fecha_hora", fin)
        .order("fecha_hora", { ascending: true }),
      supabase.from("clientes").select("id, nombre").order("nombre"),
      supabase.from("productos")
        .select("id, nombre, precio, stock")
        .eq("activo", true)
.eq("sucursal_id", sucursalId)
        .order("nombre"),
    ]);

    if (citasData) setCitas(citasData);
    if (clientesData) setClientes(clientesData);
    if (prodsData) setProductos(prodsData);
    setCargando(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [filtroFecha, sucursalId]);

  // --- Lógica de citas (crear/editar/eliminar) ---
  const abrirNueva = () => {
    setEditandoId(null);
    setFormData({
      cliente_id: "",
      fecha: filtroFecha,
      hora: "09:00",
      duracion: 60,
      estado: "agendada",
      marca: "",
      modelo: "",
      numero_serie: "",
      descripcion_problema: "",
      diagnostico: "",
      notas: "",
    });
    setMensaje(null);
    setMostrarNuevoCliente(false);
    setNuevoNombreCliente("");
    setNuevoTelefonoCliente("");
    setMostrarForm(true);
  };

  const abrirEditar = (cita: Cita) => {
    setEditandoId(cita.id);
    const fecha = new Date(cita.fecha_hora);
    const dia = fecha.toISOString().slice(0, 10);
    const hora = fecha.toTimeString().slice(0, 5);
    setFormData({
      cliente_id: cita.cliente_id || "",
      fecha: dia,
      hora: hora,
      duracion: cita.duracion_min,
      estado: cita.estado,
      marca: cita.marca || "",
      modelo: cita.modelo || "",
      numero_serie: cita.numero_serie || "",
      descripcion_problema: cita.descripcion_problema || "",
      diagnostico: cita.diagnostico || "",
      notas: cita.notas || "",
    });
    setMensaje(null);
    setMostrarNuevoCliente(false);
    setNuevoNombreCliente("");
    setNuevoTelefonoCliente("");
    setMostrarForm(true);
  };

  // Crear cliente rápido desde el modal
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
      setFormData({ ...formData, cliente_id: data.id });
      setNuevoNombreCliente("");
      setNuevoTelefonoCliente("");
      setMostrarNuevoCliente(false);
    } else {
      setMensaje("Error al crear cliente: " + error?.message);
    }
  };

  const guardarCita = async () => {
    if (!formData.cliente_id) { setMensaje("Selecciona un cliente."); return; }
    const fechaHora = `${formData.fecha}T${formData.hora}:00`;

    const payload = {
      cliente_id: formData.cliente_id,
      fecha_hora: new Date(fechaHora).toISOString(),
      duracion_min: formData.duracion,
      estado: formData.estado,
      marca: formData.marca.trim() || null,
      modelo: formData.modelo.trim() || null,
      numero_serie: formData.numero_serie.trim() || null,
      descripcion_problema: formData.descripcion_problema.trim() || null,
      diagnostico: formData.diagnostico.trim() || null,
      notas: formData.notas.trim() || null,
      sucursal_id: sucursalId,
    };

    setGuardando(true);
    if (editandoId) {
      await supabase.from("citas_taller").update(payload).eq("id", editandoId);
    } else {
      await supabase.from("citas_taller").insert(payload);
    }
    setGuardando(false);
    setMostrarForm(false);
    cargarDatos();
  };

  const cambiarEstadoCita = async (id: string, nuevoEstado: string) => {
    await supabase.from("citas_taller").update({ estado: nuevoEstado }).eq("id", id);
    cargarDatos();
  };

  const eliminarCita = async (id: string) => {
    if (!confirm("¿Eliminar esta cita?")) return;
    await supabase.from("citas_taller").delete().eq("id", id);
    cargarDatos();
  };

  // --- Lógica del panel de orden rápida ---
  const abrirPanelOrden = (cita: Cita) => {
    setCitaPanel(cita);
    const lineasIniciales: LineaOrden[] = cita.descripcion_problema
      ? [{ producto_id: null, descripcion: cita.descripcion_problema, cantidad: 1, precio_unitario: 0 }]
      : [];
    setLineas(lineasIniciales);
    setBusquedaProducto("");
    setResultadosBusqueda([]);
    setMostrarPanelOrden(true);
  };

  // Búsqueda de productos mientras se escribe (filtrada por sucursal)
  useEffect(() => {
    if (!mostrarPanelOrden) return;
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
  }, [busquedaProducto, mostrarPanelOrden, sucursalId]);

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

  const confirmarOrden = async () => {
    if (!citaPanel || !citaPanel.cliente_id) return;
    if (lineas.length === 0) {
      setMensaje("Agrega al menos un concepto a la orden.");
      return;
    }

    setGuardandoOrden(true);
    if (citaPanel.estado !== "en_reparacion") {
      await supabase.from("citas_taller").update({ estado: "en_reparacion" }).eq("id", citaPanel.id);
    }

    const { data: orden, error: ordenError } = await supabase
      .from("ordenes_taller")
      .insert({
        cliente_id: citaPanel.cliente_id,
        cita_id: citaPanel.id,
        estado: "pendiente",
        total: totalOrden,
        notas: citaPanel.descripcion_problema || "",
        sucursal_id: sucursalId,
      })
      .select("id")
      .single();

    if (ordenError) {
      setMensaje("Error al crear la orden.");
      setGuardandoOrden(false);
      return;
    }

    const lineasParaInsertar = lineas.map(l => ({
      orden_id: orden.id,
      producto_id: l.producto_id || null,
      descripcion: l.descripcion || "Sin descripción",
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    }));

    const { error: lineasError } = await supabase.from("detalle_orden_taller").insert(lineasParaInsertar);
    if (lineasError) {
      setMensaje("Error al guardar los conceptos.");
      setGuardandoOrden(false);
      return;
    }

    setGuardandoOrden(false);
    setMostrarPanelOrden(false);
    cargarDatos();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">📅 Agendar Taller</h1>
        <button
          onClick={abrirNueva}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          + Nueva Cita
        </button>
      </div>

      {/* Filtro de fecha */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex items-center gap-4">
        <label className="text-sm font-semibold text-gray-900">Fecha</label>
        <input
          type="date"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
        />
        <button onClick={cargarDatos} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium">
          Actualizar
        </button>
      </div>

      {/* Lista de citas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando citas...</p>
        ) : citas.length === 0 ? (
          <p className="p-4 text-gray-800">No hay citas para esta fecha.</p>
        ) : (
          <>
            {/* Tabla en escritorio */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Hora</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Cliente</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Bicicleta</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Problema</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {citas.map((cita) => (
                    <tr key={cita.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {new Date(cita.fecha_hora).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} ({cita.duracion_min} min)
                      </td>
                      <td className="px-4 py-3 text-gray-900">{cita.clientes?.nombre || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {cita.marca ? `${cita.marca} ${cita.modelo || ""} (${cita.numero_serie || "s/n"})` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{cita.descripcion_problema || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          cita.estado === "agendada" ? "bg-blue-100 text-blue-900" :
                          cita.estado === "en_diagnostico" ? "bg-yellow-100 text-yellow-900" :
                          cita.estado === "esperando_repuestos" ? "bg-orange-100 text-orange-900" :
                          cita.estado === "en_reparacion" ? "bg-purple-100 text-purple-900" :
                          cita.estado === "lista_para_entrega" ? "bg-green-100 text-green-900" :
                          "bg-gray-100 text-gray-900"
                        }`}>{cita.estado.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap items-center">
                          <button
                            onClick={() => abrirEditar(cita)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                          >
                            ✏️ Editar
                          </button>
                          <select
                            value={cita.estado}
                            onChange={(e) => cambiarEstadoCita(cita.id, e.target.value)}
                            className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                          >
                            {ESTADOS.map(e => <option key={e} value={e} className="text-gray-900">{e.replace(/_/g, " ")}</option>)}
                          </select>
                          <button
                            onClick={() => abrirPanelOrden(cita)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            🔧 Iniciar reparación
                          </button>
                          <button
                            onClick={() => eliminarCita(cita.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-medium transition-colors"
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjetas en móvil */}
            <div className="md:hidden divide-y divide-gray-100">
              {citas.map((cita) => (
                <div key={cita.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{cita.clientes?.nombre || "Sin cliente"}</h3>
                      <p className="text-xs text-gray-500">
                        {new Date(cita.fecha_hora).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} ({cita.duracion_min} min)
                      </p>
                      {cita.marca && <p className="text-xs text-gray-500">{cita.marca} {cita.modelo || ""} ({cita.numero_serie || "s/n"})</p>}
                      {cita.descripcion_problema && <p className="text-xs text-gray-600 mt-1">{cita.descripcion_problema}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      cita.estado === "agendada" ? "bg-blue-100 text-blue-900" :
                      cita.estado === "en_diagnostico" ? "bg-yellow-100 text-yellow-900" :
                      cita.estado === "esperando_repuestos" ? "bg-orange-100 text-orange-900" :
                      cita.estado === "en_reparacion" ? "bg-purple-100 text-purple-900" :
                      cita.estado === "lista_para_entrega" ? "bg-green-100 text-green-900" :
                      "bg-gray-100 text-gray-900"
                    }`}>{cita.estado.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => abrirEditar(cita)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <select
                      value={cita.estado}
                      onChange={(e) => cambiarEstadoCita(cita.id, e.target.value)}
                      className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                    >
                      {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                    </select>
                    <button
                      onClick={() => abrirPanelOrden(cita)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 text-xs font-medium transition-colors"
                    >
                      🔧 Iniciar reparación
                    </button>
                    <button
                      onClick={() => eliminarCita(cita.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-medium transition-colors"
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal de formulario de cita */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar Cita" : "Nueva Cita"}
            </h2>

            {mensaje && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm font-medium bg-red-100 text-red-900 border border-red-300">
                {mensaje}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Cliente *</label>
                <select
                  value={formData.cliente_id}
                  onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                >
                  <option value="">-- Seleccionar --</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {!mostrarNuevoCliente ? (
                  <button
                    type="button"
                    onClick={() => setMostrarNuevoCliente(true)}
                    className="text-green-600 text-xs font-medium hover:underline mt-1"
                  >
                    + Nuevo cliente
                  </button>
                ) : (
                  <div className="mt-2 space-y-2 bg-gray-50 p-3 rounded-lg">
                    <input
                      type="text"
                      placeholder="Nombre del cliente"
                      value={nuevoNombreCliente}
                      onChange={(e) => setNuevoNombreCliente(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-500"
                    />
                    <input
                      type="text"
                      placeholder="Teléfono (opcional)"
                      value={nuevoTelefonoCliente}
                      onChange={(e) => setNuevoTelefonoCliente(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={crearClienteRapido}
                        disabled={!nuevoNombreCliente.trim()}
                        className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50"
                      >
                        Guardar cliente
                      </button>
                      <button
                        onClick={() => {
                          setMostrarNuevoCliente(false);
                          setNuevoNombreCliente("");
                          setNuevoTelefonoCliente("");
                        }}
                        className="text-gray-500 text-xs hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Estado</label>
                <select
                  value={formData.estado}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                >
                  {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Fecha *</label>
                <input
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Hora *</label>
                <input
                  type="time"
                  value={formData.hora}
                  onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Duración (minutos)</label>
              <input
                type="number"
                min="10"
                step="10"
                value={formData.duracion}
                onChange={(e) => setFormData({ ...formData, duracion: parseInt(e.target.value) || 60 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Marca</label>
                <input
                  type="text"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Modelo</label>
                <input
                  type="text"
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Nº Serie</label>
                <input
                  type="text"
                  value={formData.numero_serie}
                  onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Descripción del problema</label>
              <textarea
                value={formData.descripcion_problema}
                onChange={(e) => setFormData({ ...formData, descripcion_problema: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                rows={2}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Diagnóstico (mecánico)</label>
              <textarea
                value={formData.diagnostico}
                onChange={(e) => setFormData({ ...formData, diagnostico: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                rows={2}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Notas internas</label>
              <textarea
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => setMostrarForm(false)}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCita}
                disabled={guardando}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
              >
                {guardando ? "Guardando..." : editandoId ? "Actualizar" : "Crear Cita"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel lateral para crear orden rápida */}
      {mostrarPanelOrden && citaPanel && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex justify-end z-50">
          <div className="bg-white w-full max-w-lg h-full shadow-xl p-6 overflow-y-auto border-l border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">🔧 Orden de reparación</h2>
              <button
                onClick={() => setMostrarPanelOrden(false)}
                className="text-gray-500 hover:text-gray-800 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600">Cliente: <span className="font-semibold text-gray-900">{citaPanel.clientes?.nombre || "—"}</span></p>
              <p className="text-sm text-gray-600 mt-1">Problema: <span className="text-gray-900">{citaPanel.descripcion_problema || "No especificado"}</span></p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Agregar repuesto</label>
              <input
                type="text"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                placeholder="Buscar por nombre, SKU..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
              />
              {resultadosBusqueda.length > 0 && (
                <ul className="border border-gray-200 rounded-lg mt-1 max-h-32 overflow-y-auto bg-white shadow-sm">
                  {resultadosBusqueda.map(prod => (
                    <li
                      key={prod.id}
                      onClick={() => agregarLineaProducto(prod)}
                      className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm flex justify-between items-center"
                    >
                      <span className="text-gray-900 font-medium">{prod.nombre}</span>
                      <span className="text-green-700 font-semibold">${prod.precio.toFixed(2)} (Stock: {prod.stock})</span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={agregarLineaManual}
                className="text-green-600 text-xs font-medium hover:underline mt-1"
              >
                + Agregar servicio manual
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Conceptos</h3>
              <div className="space-y-2">
                {lineas.map((linea, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={linea.descripcion}
                        onChange={(e) => actualizarLinea(index, "descripcion", e.target.value)}
                        placeholder="Descripción"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900"
                      />
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={linea.cantidad}
                      onChange={(e) => actualizarLinea(index, "cantidad", parseInt(e.target.value) || 1)}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={linea.precio_unitario}
                      onChange={(e) => { const val = parseFloat(e.target.value) || 0; actualizarLinea(index, "precio_unitario", val); }}
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-xs text-gray-900"
                    />
                    <span className="text-xs text-gray-700 font-semibold w-16 text-right">${(linea.cantidad * linea.precio_unitario).toFixed(2)}</span>
                    <button onClick={() => eliminarLinea(index)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                  </div>
                ))}
              </div>
              {lineas.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">No hay conceptos. Agrega repuestos o servicios.</p>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4 mt-auto">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold text-gray-900">Total</span>
                <span className="text-xl font-bold text-green-700">${totalOrden.toFixed(2)}</span>
              </div>
              <button
                onClick={confirmarOrden}
                disabled={guardandoOrden || lineas.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-sm disabled:opacity-50 transition"
              >
                {guardandoOrden ? "Creando orden..." : "Confirmar e iniciar reparación"}
              </button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Se creará la orden y la cita pasará a "en reparación".
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}