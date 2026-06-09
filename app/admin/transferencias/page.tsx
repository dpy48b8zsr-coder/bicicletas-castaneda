// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useBranch } from "@/context/BranchContext";

interface Producto {
  id: string;
  nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  precio: number;
  costo: number;
  stock: number;
  categoria_id: string | null;
  imagen_url: string | null;
  descripcion: string | null;
  tipo: string;
}

export default function TransferenciasPage() {
  const { sucursales } = useBranch();
  const [sucursalOrigen, setSucursalOrigen] = useState("");
  const [sucursalDestino, setSucursalDestino] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  const [cargandoProductos, setCargandoProductos] = useState(false);

  // Buscar producto en sucursal origen
  useEffect(() => {
    if (!sucursalOrigen || busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const buscar = async () => {
      setCargandoProductos(true);
      const term = `%${busqueda}%`;
      const { data } = await supabase
        .from("productos")
        .select("*")
        .eq("activo", true)
.eq("sucursal_id", sucursalOrigen)
        .or(`nombre.ilike.${term},sku.ilike.${term},codigo_barras.ilike.${term}`)
        .limit(10);
      setResultados(data || []);
      setCargandoProductos(false);
    };
    const timer = setTimeout(buscar, 300);
    return () => clearTimeout(timer);
  }, [busqueda, sucursalOrigen]);

  const seleccionarProducto = (prod: Producto) => {
    setProductoSeleccionado(prod);
    setBusqueda(`${prod.nombre} ${prod.sku || ""}`);
    setResultados([]);
  };

  const transferir = async () => {
    if (!productoSeleccionado || !cantidad || !sucursalOrigen || !sucursalDestino) {
      setMensaje({ tipo: "error", texto: "Completa todos los campos." });
      return;
    }
    if (sucursalOrigen === sucursalDestino) {
      setMensaje({ tipo: "error", texto: "Origen y destino deben ser diferentes." });
      return;
    }
    const cant = parseInt(cantidad);
    if (cant <= 0 || cant > productoSeleccionado.stock) {
      setMensaje({ tipo: "error", texto: `Cantidad inválida. Stock disponible: ${productoSeleccionado.stock}` });
      return;
    }

    setProcesando(true);
    setMensaje(null);

    try {
      // 1. Verificar si el producto existe en destino (por sku, código de barras o nombre exacto)
      let productoDestinoId: string | null = null;
      let queryExistente = supabase
        .from("productos")
        .select("id, stock")
        .eq("sucursal_id", sucursalDestino);

      // Buscar por SKU primero, luego código de barras, luego nombre
      if (productoSeleccionado.sku) {
        queryExistente = queryExistente.eq("sku", productoSeleccionado.sku);
      } else if (productoSeleccionado.codigo_barras) {
        queryExistente = queryExistente.eq("codigo_barras", productoSeleccionado.codigo_barras);
      } else {
        queryExistente = queryExistente.eq("nombre", productoSeleccionado.nombre);
      }

      const { data: existente } = await queryExistente.limit(1);

      if (existente && existente.length > 0) {
        // El producto ya existe en destino: solo actualizar stock
        productoDestinoId = existente[0].id;
        await supabase
          .from("productos")
          .update({ stock: existente[0].stock + cant })
          .eq("id", productoDestinoId);
      } else {
        // Crear producto en destino copiando datos del origen
        const nuevoProducto = {
          nombre: productoSeleccionado.nombre,
          descripcion: productoSeleccionado.descripcion,
          precio: productoSeleccionado.precio,
          costo: productoSeleccionado.costo,
          stock: cant,
          categoria_id: productoSeleccionado.categoria_id,
          imagen_url: productoSeleccionado.imagen_url,
          sku: productoSeleccionado.sku,
          codigo_barras: productoSeleccionado.codigo_barras,
          tipo: productoSeleccionado.tipo || "producto_simple",
          sucursal_id: sucursalDestino,
        };
        const { data: nuevo } = await supabase
          .from("productos")
          .insert(nuevoProducto)
          .select("id")
          .single();
        if (nuevo) productoDestinoId = nuevo.id;
      }

      // 2. Descontar stock en origen
      await supabase
        .from("productos")
        .update({ stock: productoSeleccionado.stock - cant })
        .eq("id", productoSeleccionado.id);

      // 3. Registrar movimientos de inventario en ambas sucursales
      await supabase.from("movimientos_inventario").insert([
        {
          producto_id: productoSeleccionado.id,
          tipo: "salida",
          cantidad: cant,
          motivo: `Transferencia a sucursal destino`,
          sucursal_id: sucursalOrigen,
        },
        {
          producto_id: productoDestinoId,
          tipo: "entrada",
          cantidad: cant,
          motivo: `Transferencia desde sucursal origen`,
          sucursal_id: sucursalDestino,
        },
      ]);

      setMensaje({ tipo: "exito", texto: `Transferencia exitosa: ${cant} unidades de "${productoSeleccionado.nombre}" transferidas.` });
      setProductoSeleccionado(null);
      setBusqueda("");
      setCantidad("");
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: "Error: " + err.message });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">🚚 Transferir Productos</h1>

      {mensaje && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === "exito" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
        }`}>
          {mensaje.texto}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Sucursal origen</label>
            <select
              value={sucursalOrigen}
              onChange={(e) => { setSucursalOrigen(e.target.value); setProductoSeleccionado(null); setBusqueda(""); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
            >
              <option value="">Seleccionar...</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Sucursal destino</label>
            <select
              value={sucursalDestino}
              onChange={(e) => setSucursalDestino(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
            >
              <option value="">Seleccionar...</option>
              {sucursales.filter(s => s.id !== sucursalOrigen).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>

        {sucursalOrigen && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Buscar producto en origen</label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setProductoSeleccionado(null); }}
                placeholder="Nombre, SKU o código de barras..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
              />
              {cargandoProductos && <p className="text-xs text-gray-500 mt-1">Buscando...</p>}
              {resultados.length > 0 && (
                <ul className="border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto bg-white">
                  {resultados.map(prod => (
                    <li
                      key={prod.id}
                      onClick={() => seleccionarProducto(prod)}
                      className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm flex justify-between"
                    >
                      <span className="font-medium text-gray-900">{prod.nombre} {prod.sku ? `(${prod.sku})` : ""}</span>
                      <span className="text-gray-600">Stock: {prod.stock} | ${prod.precio.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {productoSeleccionado && (
              <div className="bg-green-50 p-4 rounded-lg mb-4">
                <p className="font-semibold text-gray-900">{productoSeleccionado.nombre}</p>
                <p className="text-sm text-gray-700">SKU: {productoSeleccionado.sku || "—"} | Stock disponible: {productoSeleccionado.stock}</p>
                
                <div className="mt-3">
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Cantidad a transferir</label>
                  <input
                    type="number"
                    min="1"
                    max={productoSeleccionado.stock}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </div>

                <button
                  onClick={transferir}
                  disabled={procesando || !sucursalDestino || !cantidad}
                  className="mt-3 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50"
                >
                  {procesando ? "Transfiriendo..." : "Transferir"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}