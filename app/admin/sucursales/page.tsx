// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Sucursal {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activo: boolean;
}

export default function SucursalesPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(false);

  // Formulario
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    activo: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const cargarSucursales = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("sucursales")
      .select("*")
      .order("nombre");
    if (!error && data) setSucursales(data);
    setCargando(false);
  };

  useEffect(() => {
    cargarSucursales();
  }, []);

  const abrirNueva = () => {
    setEditandoId(null);
    setFormData({ nombre: "", direccion: "", telefono: "", activo: true });
    setMensaje(null);
    setMostrarForm(true);
  };

  const abrirEditar = (sucursal: Sucursal) => {
    setEditandoId(sucursal.id);
    setFormData({
      nombre: sucursal.nombre,
      direccion: sucursal.direccion || "",
      telefono: sucursal.telefono || "",
      activo: sucursal.activo,
    });
    setMensaje(null);
    setMostrarForm(true);
  };

  const guardarSucursal = async () => {
    if (!formData.nombre.trim()) {
      setMensaje({ tipo: "error", texto: "El nombre es obligatorio." });
      return;
    }
    setGuardando(true);
    const datos = {
      nombre: formData.nombre.trim(),
      direccion: formData.direccion.trim() || null,
      telefono: formData.telefono.trim() || null,
      activo: formData.activo,
    };

    if (editandoId) {
      await supabase.from("sucursales").update(datos).eq("id", editandoId);
    } else {
      await supabase.from("sucursales").insert(datos);
    }
    setGuardando(false);
    setMostrarForm(false);
    cargarSucursales();
  };

  const toggleActivo = async (id: string, activo: boolean) => {
    await supabase.from("sucursales").update({ activo: !activo }).eq("id", id);
    cargarSucursales();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">🏢 Sucursales</h1>
        <button
          onClick={abrirNueva}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          + Nueva Sucursal
        </button>
      </div>

      {/* Tabla de sucursales */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando sucursales...</p>
        ) : sucursales.length === 0 ? (
          <p className="p-4 text-gray-800">No hay sucursales registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Dirección</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sucursales.map((suc) => (
                  <tr key={suc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{suc.nombre}</td>
                    <td className="px-4 py-3 text-gray-700">{suc.direccion || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{suc.telefono || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          suc.activo ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
                        }`}
                      >
                        {suc.activo ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirEditar(suc)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActivo(suc.id, suc.activo)}
                          className={`text-xs font-medium underline ${
                            suc.activo
                              ? "text-red-600 hover:text-red-800"
                              : "text-green-600 hover:text-green-800"
                          }`}
                        >
                          {suc.activo ? "Desactivar" : "Activar"}
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

      {/* Modal formulario */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar Sucursal" : "Nueva Sucursal"}
            </h2>
            {mensaje && (
              <div
                className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
                  mensaje.tipo === "exito"
                    ? "bg-green-100 text-green-900 border border-green-300"
                    : "bg-red-100 text-red-900 border border-red-300"
                }`}
              >
                {mensaje.texto}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="Ej: Sucursal Centro"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Dirección</label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="Calle, número, colonia"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  placeholder="10 dígitos"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label className="text-sm text-gray-900">Sucursal activa</label>
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
                onClick={guardarSucursal}
                disabled={guardando || !formData.nombre.trim()}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
              >
                {guardando ? "Guardando..." : editandoId ? "Actualizar" : "Crear Sucursal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}