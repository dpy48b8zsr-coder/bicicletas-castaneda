// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ConfiguracionPage() {
  const [config, setConfig] = useState({
    nombre_taller: "Refacciones Castañeda",
    direccion: "",
    telefono: "",
    mensaje_ticket: "¡Gracias por tu compra!",
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Cargar configuración existente
  useEffect(() => {
    const cargarConfig = async () => {
      setCargando(true);
      const { data, error } = await supabase
        .from("configuracion")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) {
        setConfig({
          nombre_taller: data.nombre_taller || "Refacciones Castañeda",
          direccion: data.direccion || "",
          telefono: data.telefono || "",
          mensaje_ticket: data.mensaje_ticket || "¡Gracias por tu compra!",
        });
      }
      setCargando(false);
    };

    cargarConfig();
  }, []);

  const guardarConfig = async () => {
    setGuardando(true);
    setMensaje(null);

    const { error } = await supabase
      .from("configuracion")
      .upsert(
        {
          id: 1,
          nombre_taller: config.nombre_taller.trim(),
          direccion: config.direccion.trim(),
          telefono: config.telefono.trim(),
          mensaje_ticket: config.mensaje_ticket.trim(),
        },
        { onConflict: "id" }
      );

    if (error) {
      setMensaje("Error al guardar: " + error.message);
    } else {
      setMensaje("Configuración guardada correctamente.");
      setTimeout(() => setMensaje(null), 3000);
    }
    setGuardando(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">⚙️ Configuración</h1>
      </div>

      {cargando ? (
        <p className="text-gray-800">Cargando configuración...</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Personalización del Ticket</h2>
          <p className="text-sm text-gray-600 mb-4">Estos datos aparecerán en los comprobantes de venta y al enviar por WhatsApp.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Nombre del taller</label>
              <input
                type="text"
                value={config.nombre_taller}
                onChange={(e) => setConfig({ ...config, nombre_taller: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                placeholder="Ej: Refacciones Castañeda"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Dirección</label>
              <input
                type="text"
                value={config.direccion}
                onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                placeholder="Calle, número, colonia"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Teléfono</label>
              <input
                type="text"
                value={config.telefono}
                onChange={(e) => setConfig({ ...config, telefono: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                placeholder="10 dígitos"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">Mensaje final del ticket</label>
              <textarea
                value={config.mensaje_ticket}
                onChange={(e) => setConfig({ ...config, mensaje_ticket: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                rows={2}
                placeholder="¡Gracias por tu compra!"
              />
            </div>
          </div>

          {mensaje && (
            <div className="mt-4 px-4 py-3 rounded-lg text-sm font-medium bg-green-100 text-green-900 border border-green-300">
              {mensaje}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={guardarConfig}
              disabled={guardando}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>

          {/* Sección de impresora (informativa) */}
          <div className="mt-8 pt-4 border-t border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Impresora</h2>
            <p className="text-sm text-gray-700">
              La impresión de tickets utiliza el cuadro de diálogo del sistema.
              Asegúrate de tener tu impresora térmica instalada y configurada como predeterminada.
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Para imprimir, haz clic en <strong>🖨️ Imprimir</strong> en el ticket de venta.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}