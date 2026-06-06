// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useBranch } from "@/context/BranchContext";

interface Solicitud {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  producto_solicitado: string;
  estado: string;
  created_at: string;
  notas: string | null;
}

export default function SolicitudesPage() {
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(false);

  // Formulario
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    cliente_nombre: "",
    cliente_telefono: "",
    producto_solicitado: "",
    estado: "pendiente",
    notas: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const cargarSolicitudes = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("solicitudes_pendientes")
      .select("*")
      .eq("sucursal_id", sucursalId)
      .order("created_at", { ascending: false });
    if (!error && data) setSolicitudes(data);
    setCargando(false);
  };

  useEffect(() => {
    cargarSolicitudes();
  }, [sucursalId]);

  const abrirNueva = () => {
    setEditandoId(null);
    setFormData({
      cliente_nombre: "",
      cliente_telefono: "",
      producto_solicitado: "",
      estado: "pendiente",
      notas: "",
    });
    setMensaje(null);
    setMostrarForm(true);
  };

  const abrirEditar = (solicitud: Solicitud) => {
    setEditandoId(solicitud.id);
    setFormData({
      cliente_nombre: solicitud.cliente_nombre,
      cliente_telefono: solicitud.cliente_telefono || "",
      producto_solicitado: solicitud.producto_solicitado,
      estado: solicitud.estado,
      notas: solicitud.notas || "",
    });
    setMensaje(null);
    setMostrarForm(true);
  };

  const guardarSolicitud = async () => {
    if (!formData.cliente_nombre.trim() || !formData.producto_solicitado.trim()) {
      setMensaje({ tipo: "error", texto: "Nombre del cliente y producto son obligatorios." });
      return;
    }
    setGuardando(true);
    const datos = {
      cliente_nombre: formData.cliente_nombre.trim(),
      cliente_telefono: formData.cliente_telefono.trim() || null,
      producto_solicitado: formData.producto_solicitado.trim(),
      estado: formData.estado,
      notas: formData.notas.trim() || null,
      sucursal_id: sucursalId,
    };

    if (editandoId) {
      await supabase.from("solicitudes_pendientes").update(datos).eq("id", editandoId);
    } else {
      await supabase.from("solicitudes_pendientes").insert(datos);
    }
    setGuardando(false);
    setMostrarForm(false);
    cargarSolicitudes();
  };

  const cambiarEstado = async (id: string, nuevoEstado: string) => {
    await supabase.from("solicitudes_pendientes").update({ estado: nuevoEstado }).eq("id", id);
    cargarSolicitudes();
  };

  const eliminarSolicitud = async (id: string) => {
    if (!confirm("¿Eliminar esta solicitud?")) return;
    await supabase.from("solicitudes_pendientes").delete().eq("id", id);
    cargarSolicitudes();
  };

  const notificarCliente = (solicitud: Solicitud) => {
    let numero = solicitud.cliente_telefono;
    if (!numero) {
      alert("Este cliente no tiene teléfono registrado.");
      return;
    }
    numero = numero.replace(/[\s\-\(\)]/g, "");
    if (numero.startsWith("52") && numero.length > 10) {
      // OK
    } else if (numero.length === 10) {
      numero = "52" + numero;
    }
    const mensaje = `Hola ${solicitud.cliente_nombre}, te avisamos que el producto *"${solicitud.producto_solicitado}"* que solicitaste ya está disponible. ¡Te esperamos en Bicicletas Castañeda! 🚲`;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
    cambiarEstado(solicitud.id, "notificado");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">📥 Lista de Espera</h1>
        <button
          onClick={abrirNueva}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          + Nueva solicitud
        </button>
      </div>

      {/* Tabla en escritorio */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando...</p>
        ) : solicitudes.length === 0 ? (
          <p className="p-4 text-gray-800">No hay solicitudes pendientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Producto solicitado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {solicitudes.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(s.created_at).toLocaleDateString("es-MX")}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{s.cliente_nombre}</td>
                    <td className="px-4 py-3 text-gray-700">{s.cliente_telefono || "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{s.producto_solicitado}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        s.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                        s.estado === "notificado" ? "bg-green-100 text-green-900" :
                        "bg-gray-100 text-gray-900"
                      }`}>
                        {s.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => notificarCliente(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 text-xs font-medium transition-colors"
                        >
                          📲 Notificar
                        </button>
                        <button
                          onClick={() => abrirEditar(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        <select
                          value={s.estado}
                          onChange={(e) => cambiarEstado(s.id, e.target.value)}
                          className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="notificado">Notificado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                        <button
                          onClick={() => eliminarSolicitud(s.id)}
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
        )}
      </div>

      {/* Tarjetas en móvil */}
      <div className="md:hidden space-y-3">
        {cargando ? (
          <p className="text-center text-gray-800 py-12">Cargando...</p>
        ) : solicitudes.length === 0 ? (
          <p className="text-center text-gray-800 py-12">No hay solicitudes pendientes.</p>
        ) : (
          solicitudes.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{s.cliente_nombre}</h3>
                  <p className="text-xs text-gray-500">{s.cliente_telefono || "Sin teléfono"}</p>
                  <p className="text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString("es-MX")}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  s.estado === "pendiente" ? "bg-yellow-100 text-yellow-900" :
                  s.estado === "notificado" ? "bg-green-100 text-green-900" :
                  "bg-gray-100 text-gray-900"
                }`}>{s.estado}</span>
              </div>
              <p className="mt-2 text-sm text-gray-900 font-medium">{s.producto_solicitado}</p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={() => notificarCliente(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 text-xs font-medium transition-colors"
                >
                  📲 Notificar
                </button>
                <button
                  onClick={() => abrirEditar(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                >
                  ✏️ Editar
                </button>
                <select
                  value={s.estado}
                  onChange={(e) => cambiarEstado(s.id, e.target.value)}
                  className="text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-900 bg-white"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="notificado">Notificado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                <button
                  onClick={() => eliminarSolicitud(s.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-medium transition-colors"
                >
                  🗑️ Eliminar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal formulario */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar solicitud" : "Nueva solicitud"}
            </h2>
            {mensaje && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
                mensaje.tipo === "exito" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
              }`}>
                {mensaje.texto}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Nombre del cliente *</label>
                <input
                  type="text"
                  value={formData.cliente_nombre}
                  onChange={(e) => setFormData({ ...formData, cliente_nombre: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={formData.cliente_telefono}
                  onChange={(e) => setFormData({ ...formData, cliente_telefono: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Producto solicitado *</label>
                <input
                  type="text"
                  value={formData.producto_solicitado}
                  onChange={(e) => setFormData({ ...formData, producto_solicitado: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Estado</label>
                <select
                  value={formData.estado}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="notificado">Notificado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Notas</label>
                <textarea
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setMostrarForm(false)}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={guardarSolicitud}
                disabled={guardando}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}