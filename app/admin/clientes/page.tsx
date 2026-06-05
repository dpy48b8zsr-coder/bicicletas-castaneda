// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useBranch } from "@/context/BranchContext";

interface Cliente {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  puntos: number;
  created_at: string;
}

interface VentaCredito {
  id: string;
  total: number;
  created_at: string;
}

interface Abono {
  id: string;
  monto: number;
  motivo: string | null;
  metodo_pago: string;
  created_at: string;
}

export default function ClientesPage() {
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // Modal de cliente
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    telefono: "",
    puntos: 0,
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  // Confirmación de eliminación
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  // Estado de cuenta
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [ventasCredito, setVentasCredito] = useState<VentaCredito[]>([]);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [mostrarEstadoCuenta, setMostrarEstadoCuenta] = useState(false);
  const [montoAbono, setMontoAbono] = useState("");
  const [metodoAbono, setMetodoAbono] = useState("efectivo");
  const [motivoAbono, setMotivoAbono] = useState("Pago de crédito");
  const [registrandoAbono, setRegistrandoAbono] = useState(false);

  const cargarClientes = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("nombre");
    if (!error && data) setClientes(data);
    setCargando(false);
  };

  useEffect(() => {
    cargarClientes();
  }, []);

  const clientesFiltrados = clientes.filter((c) => {
    if (!busqueda.trim()) return true;
    const term = busqueda.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(term) ||
      (c.telefono && c.telefono.includes(term))
    );
  });

  const abrirNuevo = () => {
    setEditandoId(null);
    setFormData({ nombre: "", email: "", telefono: "", puntos: 0 });
    setMensaje(null);
    setMostrarFormulario(true);
  };

  const abrirEditar = (cliente: Cliente) => {
    setEditandoId(cliente.id);
    setFormData({
      nombre: cliente.nombre,
      email: cliente.email || "",
      telefono: cliente.telefono || "",
      puntos: cliente.puntos,
    });
    setMensaje(null);
    setMostrarFormulario(true);
  };

  const cerrarFormulario = () => {
    setMostrarFormulario(false);
    setEditandoId(null);
  };

  const guardarCliente = async () => {
    if (!formData.nombre.trim()) {
      setMensaje({ tipo: "error", texto: "El nombre es obligatorio." });
      return;
    }
    if (formData.email.trim()) {
      const { data: emailExistente } = await supabase
        .from("clientes")
        .select("id")
        .eq("email", formData.email.trim())
        .neq("id", editandoId || "")
        .limit(1);
      if (emailExistente && emailExistente.length > 0) {
        setMensaje({ tipo: "error", texto: "El email ya está registrado en otro cliente." });
        return;
      }
    }
    setGuardando(true);
    setMensaje(null);
    const datos = {
      nombre: formData.nombre.trim(),
      email: formData.email.trim() || null,
      telefono: formData.telefono.trim() || null,
      puntos: formData.puntos,
    };
    if (editandoId) {
      await supabase.from("clientes").update(datos).eq("id", editandoId);
    } else {
      await supabase.from("clientes").insert(datos);
    }
    setGuardando(false);
    cerrarFormulario();
    cargarClientes();
  };

  const eliminarCliente = async (id: string) => {
    await supabase.from("ventas").update({ cliente_id: null }).eq("cliente_id", id);
    await supabase.from("abonos_credito").delete().eq("cliente_id", id);
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) alert("No se pudo eliminar el cliente.");
    setEliminandoId(null);
    cargarClientes();
  };

  // Abrir estado de cuenta
  const abrirEstadoCuenta = async (cliente: Cliente) => {
    setClienteSeleccionado(cliente);
    setMostrarEstadoCuenta(true);

    // Cargar ventas a crédito (método 'credito') de este cliente, filtradas por sucursal
    let queryVentas = supabase
      .from("ventas")
      .select("id, total, created_at")
      .eq("cliente_id", cliente.id)
      .eq("metodo_pago", "credito");
    if (sucursalId) queryVentas = queryVentas.eq("sucursal_id", sucursalId);
    const { data: ventasData } = await queryVentas.order("created_at", { ascending: false });
    setVentasCredito(ventasData || []);

    // Cargar abonos, filtrados por sucursal
    let queryAbonos = supabase
      .from("abonos_credito")
      .select("id, monto, motivo, metodo_pago, created_at")
      .eq("cliente_id", cliente.id);
    if (sucursalId) queryAbonos = queryAbonos.eq("sucursal_id", sucursalId);
    const { data: abonosData } = await queryAbonos.order("created_at", { ascending: false });
    setAbonos(abonosData || []);

    setMontoAbono("");
    setMetodoAbono("efectivo");
    setMotivoAbono("Pago de crédito");
  };

  // Registrar abono
  const registrarAbono = async () => {
    if (!montoAbono || parseFloat(montoAbono) <= 0 || !clienteSeleccionado) return;

    setRegistrandoAbono(true);
    const { error } = await supabase.from("abonos_credito").insert({
      cliente_id: clienteSeleccionado.id,
      monto: parseFloat(montoAbono),
      metodo_pago: metodoAbono,
      motivo: motivoAbono.trim() || "Pago de crédito",
      sucursal_id: sucursalId,
    });

    if (error) {
      alert("Error al registrar abono: " + error.message);
      setRegistrandoAbono(false);
      return;
    }

    setRegistrandoAbono(false);
    setMontoAbono("");
    setMotivoAbono("Pago de crédito");
    setMetodoAbono("efectivo");
    abrirEstadoCuenta(clienteSeleccionado);
  };

  // Calcular saldo pendiente
  const totalCredito = ventasCredito.reduce((acc, v) => acc + v.total, 0);
  const totalAbonos = abonos.reduce((acc, a) => acc + a.monto, 0);
  const saldoPendiente = totalCredito - totalAbonos;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">👥 Clientes</h1>
        <button
          onClick={abrirNuevo}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          + Nuevo Cliente
        </button>
      </div>

      {/* Buscador */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <label className="block text-sm font-semibold text-gray-900 mb-1">Buscar</label>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o teléfono..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
        />
      </div>

      {/* Tabla de clientes (escritorio) */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando clientes...</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="p-4 text-gray-800">No se encontraron clientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Puntos</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientesFiltrados.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{cliente.nombre}</td>
                    <td className="px-4 py-3 text-gray-700">{cliente.telefono || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{cliente.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-green-700">{cliente.puntos}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirEstadoCuenta(cliente)}
                          className="text-green-600 hover:text-green-800 text-xs font-medium underline"
                        >
                          Estado de cuenta
                        </button>
                        <button
                          onClick={() => abrirEditar(cliente)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setEliminandoId(cliente.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium underline"
                        >
                          Eliminar
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

      {/* Tarjetas (móvil) */}
      <div className="md:hidden space-y-3">
        {cargando ? (
          <p className="text-center text-gray-800 py-12">Cargando clientes...</p>
        ) : clientesFiltrados.length === 0 ? (
          <p className="text-center text-gray-800 py-12">No se encontraron clientes.</p>
        ) : (
          clientesFiltrados.map((cliente) => (
            <div key={cliente.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900">{cliente.nombre}</h3>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                <span>📞 {cliente.telefono || "—"}</span>
                <span>✉️ {cliente.email || "—"}</span>
                <span className="font-bold text-green-700">{cliente.puntos} pts</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => abrirEstadoCuenta(cliente)} className="text-green-600 text-xs font-medium underline">Estado de cuenta</button>
                <button onClick={() => abrirEditar(cliente)} className="text-blue-600 text-xs font-medium underline">Editar</button>
                <button onClick={() => setEliminandoId(cliente.id)} className="text-red-600 text-xs font-medium underline">Eliminar</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal formulario (sin cambios) */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar Cliente" : "Nuevo Cliente"}
            </h2>
            {mensaje && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${mensaje.tipo === "exito" ? "bg-green-100 text-green-900 border border-green-300" : "bg-red-100 text-red-900 border border-red-300"}`}>
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                  placeholder="Nombre del cliente"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                  placeholder="Ej: 5512345678"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Puntos de lealtad</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.puntos}
                  onChange={(e) => setFormData({ ...formData, puntos: parseInt(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
                <p className="text-xs text-gray-500 mt-1">Puedes ajustar manualmente si es necesario.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={cerrarFormulario}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCliente}
                disabled={guardando || !formData.nombre.trim()}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
              >
                {guardando ? "Guardando..." : editandoId ? "Actualizar" : "Crear Cliente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación eliminar */}
      {eliminandoId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar cliente?</h3>
            <p className="text-gray-700 mb-4">Las ventas y abonos asociados se conservarán sin cliente.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEliminandoId(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminarCliente(eliminandoId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Estado de Cuenta */}
      {mostrarEstadoCuenta && clienteSeleccionado && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Estado de cuenta: {clienteSeleccionado.nombre}
            </h2>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <p className="text-xs text-red-700 mb-1">Crédito total</p>
                <p className="text-2xl font-bold text-red-600">${totalCredito.toFixed(2)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <p className="text-xs text-green-700 mb-1">Total abonado</p>
                <p className="text-2xl font-bold text-green-600">${totalAbonos.toFixed(2)}</p>
              </div>
              <div className={`rounded-lg p-4 border ${saldoPendiente > 0 ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-200"}`}>
                <p className="text-xs text-gray-700 mb-1">Saldo pendiente</p>
                <p className={`text-2xl font-bold ${saldoPendiente > 0 ? "text-orange-600" : "text-gray-700"}`}>
                  ${saldoPendiente.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Registrar abono */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="text-md font-semibold text-gray-900 mb-3">Registrar abono</h3>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monto</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={montoAbono}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) setMontoAbono(val);
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Método de pago</label>
                  <select
                    value={metodoAbono}
                    onChange={(e) => setMetodoAbono(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Motivo</label>
                  <input
                    type="text"
                    value={motivoAbono}
                    onChange={(e) => setMotivoAbono(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                    placeholder="Ej: Pago de crédito"
                  />
                </div>
              </div>
              <button
                onClick={registrarAbono}
                disabled={registrandoAbono || !montoAbono || parseFloat(montoAbono) <= 0}
                className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                {registrandoAbono ? "Registrando..." : "Registrar abono"}
              </button>
            </div>

            {/* Historial de ventas a crédito */}
            <h3 className="text-md font-semibold text-gray-900 mb-2">Ventas a crédito</h3>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">ID</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Fecha</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ventasCredito.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-center text-gray-500">Sin ventas a crédito</td>
                    </tr>
                  ) : (
                    ventasCredito.map((venta) => (
                      <tr key={venta.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600 font-mono text-xs">{venta.id.slice(0, 8)}...</td>
                        <td className="px-4 py-2 text-gray-700">{new Date(venta.created_at).toLocaleString("es-MX")}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">${venta.total.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Historial de abonos */}
            <h3 className="text-md font-semibold text-gray-900 mb-2">Abonos realizados</h3>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Fecha</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700">Monto</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Método</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {abonos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-center text-gray-500">Sin abonos registrados</td>
                    </tr>
                  ) : (
                    abonos.map((abono) => (
                      <tr key={abono.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{new Date(abono.created_at).toLocaleString("es-MX")}</td>
                        <td className="px-4 py-2 text-right font-semibold text-green-700">${abono.monto.toFixed(2)}</td>
                        <td className="px-4 py-2 text-gray-800 capitalize">{abono.metodo_pago}</td>
                        <td className="px-4 py-2 text-gray-600">{abono.motivo || "Pago de crédito"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setMostrarEstadoCuenta(false)}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}