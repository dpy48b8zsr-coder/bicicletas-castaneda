// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useBranch } from "@/context/BranchContext";

interface Movimiento {
  id: string;
  producto_id: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  motivo: string;
  created_at: string;
  productos: {
    nombre: string;
    sku: string | null;
  } | null;
}

interface Producto {
  id: string;
  nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  stock: number;
}

export default function InventarioPage() {
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // Búsqueda de productos
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Datos del formulario
  const [tipoMovimiento, setTipoMovimiento] = useState<"entrada" | "salida">("entrada");
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardandoMovimiento, setGuardandoMovimiento] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const cargarDatos = async () => {
    setCargando(true);
    // Movimientos filtrados por sucursal
    const { data: movs, error: movsError } = await supabase
      .from("movimientos_inventario")
      .select("*, productos(nombre, sku)")
      .eq("activo", true)
      .eq("sucursal_id", sucursalId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!movsError && movs) setMovimientos(movs);

    // Productos filtrados por sucursal (para la búsqueda y selección)
    const { data: prods } = await supabase
      .from("productos")
      .select("id, nombre, sku, codigo_barras, stock")
     .eq("activo", true)
     .eq("sucursal_id", sucursalId)
      .order("nombre");
    if (prods) setProductos(prods);

    setCargando(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [sucursalId]);

  // Búsqueda de productos (también filtrada por sucursal)
  useEffect(() => {
    if (busquedaProducto.trim() === "") {
      setResultadosBusqueda([]);
      return;
    }

    const buscar = async () => {
      setBuscando(true);
      const term = `%${busquedaProducto}%`;
      const { data, error } = await supabase
        .from("productos")
        .select("id, nombre, sku, codigo_barras, stock")
        .eq("activo", true)
        .eq("sucursal_id", sucursalId)
        .or(`nombre.ilike.${term},sku.ilike.${term},codigo_barras.ilike.${term}`)
        .limit(10);

      if (!error && data) {
        setResultadosBusqueda(data);
      } else {
        setResultadosBusqueda([]);
      }
      setBuscando(false);
    };

    const timer = setTimeout(buscar, 300);
    return () => clearTimeout(timer);
  }, [busquedaProducto, sucursalId]);

  const seleccionarProducto = (prod: Producto) => {
    setProductoSeleccionado(prod);
    setBusquedaProducto(`${prod.nombre} ${prod.sku ? `(${prod.sku})` : ""}`);
    setResultadosBusqueda([]);
  };

  const registrarMovimiento = async () => {
    if (!productoSeleccionado || !cantidad || !motivo.trim()) {
      setMensaje({ tipo: "error", texto: "Completa todos los campos." });
      return;
    }

    const cant = parseInt(cantidad);
    if (cant <= 0) {
      setMensaje({ tipo: "error", texto: "La cantidad debe ser mayor a 0." });
      return;
    }

    if (tipoMovimiento === "salida" && cant > productoSeleccionado.stock) {
      setMensaje({ tipo: "error", texto: `Stock insuficiente. Stock actual: ${productoSeleccionado.stock}.` });
      return;
    }

    setGuardandoMovimiento(true);
    setMensaje(null);

    const { error: movError } = await supabase
      .from("movimientos_inventario")
      .insert({
        producto_id: productoSeleccionado.id,
        tipo: tipoMovimiento,
        cantidad: cant,
        motivo: motivo.trim(),
        sucursal_id: sucursalId,
      });

    if (movError) {
      setMensaje({ tipo: "error", texto: "Error al registrar movimiento: " + movError.message });
      setGuardandoMovimiento(false);
      return;
    }

    const nuevoStock =
      tipoMovimiento === "entrada"
        ? productoSeleccionado.stock + cant
        : productoSeleccionado.stock - cant;

    const { error: stockError } = await supabase
      .from("productos")
      .update({ stock: nuevoStock })
      .eq("id", productoSeleccionado.id);

    if (stockError) {
      setMensaje({ tipo: "error", texto: "Movimiento registrado, pero falló la actualización del stock: " + stockError.message });
      setGuardandoMovimiento(false);
      cargarDatos();
      return;
    }

    setMensaje({ tipo: "exito", texto: "Movimiento registrado correctamente." });
    setGuardandoMovimiento(false);
    setMostrarFormulario(false);
    setProductoSeleccionado(null);
    setBusquedaProducto("");
    setCantidad("");
    setMotivo("");
    cargarDatos();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          📋 Inventario
        </h1>
        <button
          onClick={() => {
            setMostrarFormulario(true);
            setMensaje(null);
            setTipoMovimiento("entrada");
            setProductoSeleccionado(null);
            setBusquedaProducto("");
            setCantidad("");
            setMotivo("");
          }}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          + Nuevo movimiento
        </button>
      </div>

      {mensaje && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${mensaje.tipo === "exito" ? "bg-green-100 text-green-900 border border-green-300" : "bg-red-100 text-red-900 border border-red-300"}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Tabla de movimientos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando movimientos...</p>
        ) : movimientos.length === 0 ? (
          <p className="p-4 text-gray-800">No hay movimientos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Producto</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Cantidad</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movimientos.map((mov) => (
                  <tr key={mov.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{new Date(mov.created_at).toLocaleString("es-MX")}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {mov.productos?.nombre || "—"} {mov.productos?.sku ? `(${mov.productos.sku})` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        mov.tipo === "entrada"
                          ? "bg-green-100 text-green-900"
                          : "bg-red-100 text-red-900"
                      }`}>
                        {mov.tipo === "entrada" ? "Entrada" : "Salida"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-semibold">{mov.cantidad}</td>
                    <td className="px-4 py-3 text-gray-700">{mov.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de formulario */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Nuevo movimiento de inventario</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Tipo *</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTipoMovimiento("entrada")}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      tipoMovimiento === "entrada"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Entrada
                  </button>
                  <button
                    onClick={() => setTipoMovimiento("salida")}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      tipoMovimiento === "salida"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Salida
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Producto *</label>
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value);
                    if (e.target.value.trim() === "") {
                      setProductoSeleccionado(null);
                      setResultadosBusqueda([]);
                    }
                  }}
                  placeholder="Buscar por nombre, SKU o código de barras..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                />
                {buscando && <p className="text-xs text-gray-500 mt-1">Buscando...</p>}
                {resultadosBusqueda.length > 0 && (
                  <ul className="border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto bg-white shadow-sm">
                    {resultadosBusqueda.map((prod) => (
                      <li
                        key={prod.id}
                        onClick={() => seleccionarProducto(prod)}
                        className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm flex justify-between items-center"
                      >
                        <div>
                          <span className="text-gray-900 font-medium">{prod.nombre}</span>
                          {prod.sku && <span className="text-gray-500 ml-1 text-xs">({prod.sku})</span>}
                          {prod.codigo_barras && <span className="text-gray-500 ml-1 text-xs">Cód: {prod.codigo_barras}</span>}
                        </div>
                        <span className="text-xs text-gray-600">Stock: {prod.stock}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {productoSeleccionado && (
                  <div className="mt-2 p-2 bg-green-50 rounded-lg text-sm">
                    <span className="font-medium text-green-900">{productoSeleccionado.nombre}</span>
                    <span className="text-green-700 ml-2">Stock actual: {productoSeleccionado.stock}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Cantidad *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cantidad}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d+$/.test(val)) setCantidad(val);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Motivo *</label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                  rows={2}
                  placeholder="Ej: Compra a proveedor, Devolución, Producto dañado..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setMostrarFormulario(false)}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={registrarMovimiento}
                disabled={guardandoMovimiento}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
              >
                {guardandoMovimiento ? "Registrando..." : "Registrar movimiento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}