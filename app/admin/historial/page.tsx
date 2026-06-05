// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useBranch } from "@/context/BranchContext";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

// Función para rango local (sin cambios)
function localDateRange(dateStr: string) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const hoy = new Date();
    const start = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const end = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface Venta {
  id: string;
  total: number;
  metodo_pago: string;
  created_at: string;
  monto_recibido?: number;
  cambio?: number;
  cliente_id?: string;
  detalle_pago?: any;
  puntos_ganados?: number;
  puntos_canjeados?: number;
  estado?: string;
}

interface MetricaConMargen {
  total: number;
  cantidad: number;
  promedio: number;
  metodoTop: string;
  margen: number;
  margenPorcentaje: number;
}

interface Cliente {
  id: string;
  nombre: string;
  puntos: number;
}

// ---------- Modal de devolución (sin cambios) ----------
function DevolucionModal({
  venta,
  onClose,
}: {
  venta: Venta;
  onClose: () => void;
}) {
  const [detalles, setDetalles] = useState<any[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState("");
  const [metodoReembolso, setMetodoReembolso] = useState("efectivo");
  const [clienteId, setClienteId] = useState("");
  const [puntosAcreditar, setPuntosAcreditar] = useState<number>(0);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");

  const PUNTOS_POR_DOLAR = 10;
  const ventaEfectivo = venta.metodo_pago === "efectivo";

  useEffect(() => {
    if (ventaEfectivo) {
      setMetodoReembolso("efectivo");
    } else {
      setMetodoReembolso("puntos");
    }
  }, [venta.metodo_pago]);

  useEffect(() => {
    const fetchClientes = async () => {
      const { data } = await supabase.from("clientes").select("id, nombre, puntos").order("nombre");
      if (data) setClientes(data);
    };
    fetchClientes();
  }, []);

  useEffect(() => {
    const cargarDetalles = async () => {
      const { data, error } = await supabase
        .from("detalle_venta")
        .select("cantidad, precio_unitario, producto_id, productos(nombre, stock)")
        .eq("venta_id", venta.id);
      if (!error && data) {
        setDetalles(data);
        const initCant: Record<string, number> = {};
        data.forEach((d: any) => {
          initCant[d.producto_id] = 0;
        });
        setCantidades(initCant);
      }
      setCargando(false);
    };
    cargarDetalles();
  }, [venta.id]);

  const handleCantidadChange = (productoId: string, nuevaCantidad: number) => {
    const detalle = detalles.find(d => d.producto_id === productoId);
    if (!detalle) return;
    const max = detalle.cantidad;
    setCantidades(prev => ({
      ...prev,
      [productoId]: Math.min(Math.max(0, nuevaCantidad), max),
    }));
  };

  const totalDevuelto = detalles.reduce((sum, d) => {
    const cant = cantidades[d.producto_id] || 0;
    return sum + cant * d.precio_unitario;
  }, 0);

  const itemsDevueltos = detalles
    .filter(d => cantidades[d.producto_id] > 0)
    .map(d => ({
      producto_id: d.producto_id,
      nombre: d.productos?.nombre || "Producto",
      cantidad_devuelta: cantidades[d.producto_id],
      precio: d.precio_unitario,
    }));

  const puntosEquivalentes = Math.floor(totalDevuelto * PUNTOS_POR_DOLAR);

  useEffect(() => {
    setPuntosAcreditar(puntosEquivalentes);
  }, [totalDevuelto, metodoReembolso]);

  const crearCliente = async () => {
    if (!nuevoNombre.trim()) return;
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nombre: nuevoNombre.trim(), telefono: nuevoTelefono.trim() || null, puntos: 0 })
      .select("id, nombre, puntos")
      .single();
    if (data) {
      setClientes(prev => [...prev, data]);
      setClienteId(data.id);
      setNuevoNombre("");
      setNuevoTelefono("");
      setMostrarNuevoCliente(false);
    } else {
      setMensaje("Error al crear cliente: " + error?.message);
    }
  };

  const procesarDevolucion = async () => {
    if (itemsDevueltos.length === 0) {
      setMensaje("Selecciona al menos un producto para devolver.");
      return;
    }
    if (!motivo.trim()) {
      setMensaje("Escribe el motivo de la devolución.");
      return;
    }
    if (metodoReembolso === "puntos" && !clienteId) {
      setMensaje("Selecciona un cliente para acreditar los puntos.");
      return;
    }

    setProcesando(true);
    setMensaje(null);

    try {
      const { error: insError } = await supabase.from("devoluciones").insert({
        venta_id: venta.id,
        items: itemsDevueltos,
        motivo: motivo.trim(),
        total_devuelto: totalDevuelto,
        sucursal_id: venta.sucursal_id,
      });
      if (insError) throw insError;

      await supabase.from("ventas").update({ estado: "devuelta" }).eq("id", venta.id);

      for (const item of itemsDevueltos) {
        const { data: prodActual } = await supabase
          .from("productos")
          .select("stock")
          .eq("id", item.producto_id)
          .single();
        if (prodActual) {
          const nuevoStock = (prodActual.stock || 0) + item.cantidad_devuelta;
          await supabase.from("productos").update({ stock: nuevoStock }).eq("id", item.producto_id);
        }
      }

      if (metodoReembolso === "efectivo") {
        const motivoCaja = `Devolución venta #${venta.id.slice(0, 8)} - ${motivo.trim()}`;
        await supabase.from("movimientos_caja").insert({
          tipo: "salida",
          monto: totalDevuelto,
          motivo: motivoCaja,
          sucursal_id: venta.sucursal_id,
        });
      }

      if (metodoReembolso === "puntos" && clienteId) {
        const { data: clienteActual } = await supabase
          .from("clientes")
          .select("puntos")
          .eq("id", clienteId)
          .single();
        if (clienteActual) {
          const nuevosPuntos = (clienteActual.puntos || 0) + puntosAcreditar;
          await supabase.from("clientes").update({ puntos: nuevosPuntos }).eq("id", clienteId);
        }
      }

      setMensaje("Devolución registrada. Venta anulada de estadísticas.");
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setMensaje("Error: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg border border-gray-200 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Devolución de Venta #{venta.id.slice(0, 8)}</h2>

        {cargando ? (
          <p className="text-gray-600">Cargando productos...</p>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              {detalles.map((detalle: any) => (
                <div key={detalle.producto_id} className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{detalle.productos?.nombre || "Producto"}</p>
                    <p className="text-sm text-gray-600">
                      Vendido: {detalle.cantidad} x ${detalle.precio_unitario.toFixed(2)}
                    </p>
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-gray-500">A devolver</label>
                    <input
                      type="number"
                      min={0}
                      max={detalle.cantidad}
                      value={cantidades[detalle.producto_id] || 0}
                      onChange={(e) => handleCantidadChange(detalle.producto_id, parseInt(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Motivo de la devolución</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                rows={2}
                placeholder="Ej: Producto defectuoso, error en talla..."
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-1">¿Cómo se hará el reembolso?</label>
              <select
                value={metodoReembolso}
                onChange={(e) => setMetodoReembolso(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
              >
                {ventaEfectivo && (
                  <option value="efectivo">Efectivo (se registra salida en caja)</option>
                )}
                <option value="puntos">Acreditar puntos a cliente</option>
              </select>
              {!ventaEfectivo && (
                <p className="text-xs text-gray-600 mt-1">Esta venta fue con {venta.metodo_pago}. Solo se permite acreditar puntos.</p>
              )}
            </div>

            {metodoReembolso === "efectivo" && totalDevuelto > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg mb-4 border border-blue-200">
                <p className="text-sm text-blue-900">
                  <strong>Efectivo a retirar de caja:</strong> ${totalDevuelto.toFixed(2)}
                </p>
                <p className="text-xs text-blue-700">Se registrará automáticamente una salida de efectivo.</p>
              </div>
            )}

            {metodoReembolso === "puntos" && (
              <div className="bg-purple-50 p-3 rounded-lg mb-4 border border-purple-200">
                <label className="block text-sm font-semibold text-gray-900 mb-1">Cliente que recibe los puntos</label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                >
                  <option value="">-- Seleccionar cliente --</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.puntos} pts actuales)</option>
                  ))}
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
                  <div className="mt-2 space-y-1 bg-gray-50 p-2 rounded-lg">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={nuevoNombre}
                      onChange={(e) => setNuevoNombre(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500"
                    />
                    <input
                      type="text"
                      placeholder="Teléfono (opcional)"
                      value={nuevoTelefono}
                      onChange={(e) => setNuevoTelefono(e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={crearCliente}
                        className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setMostrarNuevoCliente(false)}
                        className="text-gray-500 text-xs hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2">
                  <p className="text-sm text-gray-700">
                    Puntos a acreditar: <strong>{puntosAcreditar} pts</strong> (equivalentes a ${totalDevuelto.toFixed(2)})
                  </p>
                  <p className="text-xs text-gray-500">10 puntos = $1.00</p>
                </div>
              </div>
            )}

            <div className="bg-gray-100 rounded-lg p-3 mb-4 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Total a devolver</span>
              <span className="text-lg font-bold text-red-600">${totalDevuelto.toFixed(2)}</span>
            </div>

            {mensaje && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
                mensaje.includes("Error") ? "bg-red-100 text-red-900" : "bg-green-100 text-green-900"
              }`}>
                {mensaje}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button onClick={onClose} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">
                Cancelar
              </button>
              <button
                onClick={procesarDevolucion}
                disabled={procesando}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
              >
                {procesando ? "Procesando..." : "Procesar devolución"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Componente principal del historial ----------
export default function HistorialPage() {
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [periodo, setPeriodo] = useState<string>("hoy");
  const [fechaInicio, setFechaInicio] = useState<string>(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  });
  const [fechaFin, setFechaFin] = useState<string>(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  });

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [ticketReimpresion, setTicketReimpresion] = useState<any>(null);
  const [whatsappReimpresion, setWhatsappReimpresion] = useState("");
  const [ventaDevolucion, setVentaDevolucion] = useState<Venta | null>(null);

  const [metrica, setMetrica] = useState<MetricaConMargen>({
    total: 0, cantidad: 0, promedio: 0, metodoTop: "—", margen: 0, margenPorcentaje: 0,
  });

  const [ventasPorDia, setVentasPorDia] = useState<{ labels: string[]; valores: number[] }>({
    labels: [], valores: [],
  });
  const [metodosPago, setMetodosPago] = useState<{ labels: string[]; valores: number[] }>({
    labels: [], valores: [],
  });
  const [ventasPorCategoria, setVentasPorCategoria] = useState<{ categoria: string; total: number }[]>([]);

  const [devolucionesCount, setDevolucionesCount] = useState(0);
  const [devolucionesTotal, setDevolucionesTotal] = useState(0);

  // Función actualizarPeriodo con hora local (ya corregida)
  const actualizarPeriodo = (nuevoPeriodo: string) => {
    setPeriodo(nuevoPeriodo);
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const hoyStr = `${year}-${month}-${day}`;

    let inicio = "";
    let fin = hoyStr;

    switch (nuevoPeriodo) {
      case "hoy":
        inicio = hoyStr;
        break;
      case "ayer":
        const ayer = new Date(hoy);
        ayer.setDate(hoy.getDate() - 1);
        const aYear = ayer.getFullYear();
        const aMonth = String(ayer.getMonth() + 1).padStart(2, '0');
        const aDay = String(ayer.getDate()).padStart(2, '0');
        inicio = `${aYear}-${aMonth}-${aDay}`;
        fin = inicio;
        break;
      case "esta-semana":
        const diaSemana = hoy.getDay();
        const lunes = new Date(hoy);
        lunes.setDate(hoy.getDate() - ((diaSemana + 6) % 7));
        const lYear = lunes.getFullYear();
        const lMonth = String(lunes.getMonth() + 1).padStart(2, '0');
        const lDay = String(lunes.getDate()).padStart(2, '0');
        inicio = `${lYear}-${lMonth}-${lDay}`;
        break;
      case "este-mes":
        inicio = `${year}-${month}-01`;
        break;
      case "personalizado":
        break;
    }

    setFechaInicio(inicio);
    if (nuevoPeriodo !== "personalizado") setFechaFin(fin);
  };

  const cargarVentas = async () => {
    setCargando(true);
    const { start: inicio } = localDateRange(fechaInicio);
    const { end: fin } = localDateRange(fechaFin);

    let queryVentas = supabase.from("ventas").select("*")
      .gte("created_at", inicio)
      .lte("created_at", fin)
      .order("created_at", { ascending: false });
    if (sucursalId) queryVentas = queryVentas.eq("sucursal_id", sucursalId);
    const { data: ventasData, error } = await queryVentas;

    let queryDev = supabase.from("devoluciones").select("total_devuelto")
      .gte("created_at", inicio)
      .lte("created_at", fin);
    if (sucursalId) queryDev = queryDev.eq("sucursal_id", sucursalId);
    const { data: devolucionesData } = await queryDev;

    if (error || !ventasData) {
      setVentas([]);
      setMetrica({ total: 0, cantidad: 0, promedio: 0, metodoTop: "—", margen: 0, margenPorcentaje: 0 });
      setVentasPorDia({ labels: [], valores: [] });
      setMetodosPago({ labels: [], valores: [] });
      setVentasPorCategoria([]);
      setDevolucionesCount(0);
      setDevolucionesTotal(0);
      setCargando(false);
      return;
    }

    if (devolucionesData) {
      setDevolucionesCount(devolucionesData.length);
      const totalDev = devolucionesData.reduce((sum, d) => sum + d.total_devuelto, 0);
      setDevolucionesTotal(totalDev);
    } else {
      setDevolucionesCount(0);
      setDevolucionesTotal(0);
    }

    setVentas(ventasData);

    const ventasActivas = ventasData.filter(v => v.estado !== "devuelta");

    const total = ventasActivas.reduce((acc, v) => acc + v.total, 0);
    const cantidad = ventasActivas.length;
    const promedio = cantidad > 0 ? total / cantidad : 0;
    const metodosMap: Record<string, number> = {};
    ventasActivas.forEach(v => { metodosMap[v.metodo_pago] = (metodosMap[v.metodo_pago] || 0) + v.total; });
    const topMetodo = Object.entries(metodosMap).sort(([, a], [, b]) => b - a)[0];
    const metodoTop = topMetodo ? topMetodo[0] : "—";

    const ventaIds = ventasActivas.map(v => v.id);
    const { data: detallesData, error: detallesError } = await supabase
      .from("detalle_venta")
      .select("venta_id, cantidad, precio_unitario, producto_id, productos(costo, categoria_id, categorias(nombre))")
      .in("venta_id", ventaIds);

    let margen = 0;
    if (detallesData && !detallesError) {
      margen = detallesData.reduce((acc: number, detalle: any) => {
        const costo = detalle.productos?.costo || 0;
        return acc + (detalle.precio_unitario - costo) * detalle.cantidad;
      }, 0);
    }
    const margenPorcentaje = total > 0 ? (margen / total) * 100 : 0;
    setMetrica({ total, cantidad, promedio, metodoTop, margen, margenPorcentaje });

    const ventasPorDiaMap: Record<string, number> = {};
    ventasActivas.forEach(v => {
      const fecha = new Date(v.created_at).toISOString().slice(0, 10);
      ventasPorDiaMap[fecha] = (ventasPorDiaMap[fecha] || 0) + v.total;
    });
    const fechasOrdenadas = Object.keys(ventasPorDiaMap).sort();
    setVentasPorDia({
      labels: fechasOrdenadas.map(f => new Date(f + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })),
      valores: fechasOrdenadas.map(f => ventasPorDiaMap[f]),
    });

    setMetodosPago({ labels: Object.keys(metodosMap), valores: Object.values(metodosMap) });

    const categoriaMap: Record<string, number> = {};
    if (detallesData && !detallesError) {
      detallesData.forEach((detalle: any) => {
        const nombreCat = detalle.productos?.categorias?.nombre || "Sin categoría";
        const monto = detalle.precio_unitario * detalle.cantidad;
        categoriaMap[nombreCat] = (categoriaMap[nombreCat] || 0) + monto;
      });
    }
    const categoriasArray = Object.entries(categoriaMap).map(([categoria, total]) => ({ categoria, total }));
    categoriasArray.sort((a, b) => b.total - a.total);
    setVentasPorCategoria(categoriasArray);

    setCargando(false);
  };

  useEffect(() => {
    cargarVentas();
  }, [fechaInicio, fechaFin, sucursalId]);

  const reimprimirTicket = async (venta: Venta) => {
    if (venta.estado === "devuelta") return;
    const { data: detalles, error } = await supabase
      .from("detalle_venta")
      .select("cantidad, precio_unitario, productos(nombre)")
      .eq("venta_id", venta.id);
    if (error || !detalles) { alert("No se pudieron cargar los detalles."); return; }
    let clienteNombre = null; let clienteTelefono = null;
    if (venta.cliente_id) {
      const { data: clienteData } = await supabase.from("clientes").select("nombre, telefono").eq("id", venta.cliente_id).single();
      if (clienteData) { clienteNombre = clienteData.nombre; clienteTelefono = clienteData.telefono; }
    }
    const descuentoPuntos = venta.puntos_canjeados ? venta.puntos_canjeados / 10 : 0;
    setTicketReimpresion({ venta, detalles, clienteNombre, clienteTelefono, descuentoPuntos, sucursalNombre: sucursalActiva?.nombre });
    setWhatsappReimpresion(clienteTelefono || "");
  };

  const enviarWhatsAppReimpresion = () => {
    if (!ticketReimpresion) return;
    let numero = whatsappReimpresion.trim();
    if (!numero) { alert("Ingresa un número de teléfono."); return; }
    numero = numero.replace(/[\s\-\(\)]/g, "");
    if (numero.startsWith("52") && numero.length > 10) {} else if (numero.length === 10) numero = "52" + numero;
    const venta = ticketReimpresion.venta;
    let mensaje = `🧾 *Comprobante Bicicletas Castañeda*\nVenta #${venta.id.slice(0, 8)}\nFecha: ${new Date(venta.created_at).toLocaleString("es-MX")}\n`;
    if (ticketReimpresion.sucursalNombre) mensaje += `Sucursal: ${ticketReimpresion.sucursalNombre}\n`;
    mensaje += `\n*Productos:*\n`;
    ticketReimpresion.detalles.forEach((item: any) => {
      mensaje += `- ${item.productos?.nombre || "Producto"} x${item.cantidad}: $${(item.precio_unitario * item.cantidad).toFixed(2)}\n`;
    });
    if (ticketReimpresion.descuentoPuntos > 0) mensaje += `\n*Descuento por puntos:* -$${ticketReimpresion.descuentoPuntos.toFixed(2)}\n`;
    mensaje += `\n*Total: $${venta.total.toFixed(2)}*\nMétodo: ${venta.metodo_pago}\n`;
    if (venta.monto_recibido != null) { mensaje += `Recibido: $${venta.monto_recibido.toFixed(2)}\n`; if (venta.cambio != null) mensaje += `Cambio: $${venta.cambio.toFixed(2)}\n`; }
    if (venta.detalle_pago) { mensaje += `Desglose mixto:\n`; venta.detalle_pago.forEach((p: any) => { mensaje += `  ${p.metodo}: $${p.monto.toFixed(2)}\n`; }); }
    if (venta.puntos_ganados) mensaje += `Puntos ganados: ${venta.puntos_ganados}\n`;
    if (venta.puntos_canjeados) mensaje += `Puntos canjeados: ${venta.puntos_canjeados}\n`;
    mensaje += `\n¡Gracias por tu compra!`;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const imprimirTicket = () => {
    if (!ticketReimpresion) return;

    const venta = ticketReimpresion.venta;
    const detalles = ticketReimpresion.detalles;
    const sucursal = ticketReimpresion.sucursalNombre || "";
    const clienteNombre = ticketReimpresion.clienteNombre || "";

    const lineasHTML = detalles
      .map(
        (item: any) => `
      <div style="display: flex; justify-content: space-between; font-size: 14px; padding: 2px 0;">
        <span>${item.productos?.nombre || "Producto"} x${item.cantidad}</span>
        <span>$${(item.precio_unitario * item.cantidad).toFixed(2)}</span>
      </div>`
      )
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>Ticket #${venta.id.slice(0, 8)}</title>
          <style>
  @page {
    size: 58mm auto;
    margin: 0;
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
    width: 54mm;
    margin: 0 auto;
    padding: 2mm;
    font-size: 13px;
    font-weight: normal;
  }
  h2, p { margin: 3px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
  @media print {
    body { 
      margin: 0; 
      width: 54mm;
    }
  }
</style>
        </head>
        <body>
          <h2 style="text-align: center;">Bicicletas Castañeda</h2>
          ${sucursal ? `<p style="text-align: center; font-size: 12px;">${sucursal}</p>` : ""}
          <p style="text-align: center; font-size: 12px;">Reimpresión</p>
          <hr>
          <p>Ticket #${venta.id.slice(0, 8)}</p>
          <p>${new Date(venta.created_at).toLocaleString("es-MX")}</p>
          <hr>
          ${lineasHTML}
          ${
            ticketReimpresion.descuentoPuntos > 0
              ? `<div style="display: flex; justify-content: space-between; font-size: 14px; padding: 2px 0;">
                  <span>Descuento puntos</span>
                  <span>-$${ticketReimpresion.descuentoPuntos.toFixed(2)}</span>
                </div>`
              : ""
          }
          <hr>
          <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold;">
            <span>Total</span>
            <span>$${venta.total.toFixed(2)}</span>
          </div>
          <p>Método: ${venta.metodo_pago}</p>
          ${
            venta.monto_recibido != null
              ? `<p>Recibido: $${venta.monto_recibido.toFixed(2)}</p>
                 ${
                   venta.cambio != null
                     ? `<p>Cambio: $${venta.cambio.toFixed(2)}</p>`
                     : ""
                 }`
              : ""
          }
          ${
            venta.detalle_pago
              ? venta.detalle_pago
                  .map((p: any) => `<p>${p.metodo}: $${p.monto.toFixed(2)}</p>`)
                  .join("")
              : ""
          }
          ${clienteNombre ? `<p>Cliente: ${clienteNombre}</p>` : ""}
          ${venta.puntos_ganados > 0 ? `<p>Puntos ganados: +${venta.puntos_ganados}</p>` : ""}
          ${venta.puntos_canjeados > 0 ? `<p>Puntos canjeados: -${venta.puntos_canjeados}</p>` : ""}
          <hr>
          <p style="text-align: center;">¡Gracias por tu compra!</p>
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const ventana = window.open(url, "_blank");
    if (ventana) {
      ventana.onload = () => {
        ventana.print();
      };
    } else {
      alert("Permite las ventanas emergentes para imprimir el ticket.");
    }
  };

  const barOptions = { responsive: true, plugins: { legend: { display: false } } };
  const doughnutOptions = { responsive: true, plugins: { legend: { position: "bottom" as const } } };

  const barData = {
    labels: ventasPorDia.labels,
    datasets: [{ label: "Ventas ($)", data: ventasPorDia.valores, backgroundColor: "#16a34a", borderRadius: 6 }],
  };

  const doughnutData = {
    labels: metodosPago.labels.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
    datasets: [{ data: metodosPago.valores, backgroundColor: ["#16a34a", "#3b82f6", "#8b5cf6", "#f59e0b", "#6b7280"], borderWidth: 0 }],
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .ticket-print, .ticket-print * { visibility: visible; }
          .ticket-print { position: absolute; left: 0; top: 0; width: 80mm; font-size: 12px; background: white; padding: 0; margin: 0; }
          .no-print { display: none; }
        }
      `}</style>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">📊 Historial de Ventas</h1>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-2 items-center">
          <div className="flex gap-2 flex-wrap">
            {["hoy", "ayer", "esta-semana", "este-mes", "personalizado"].map((key) => (
              <button key={key} onClick={() => actualizarPeriodo(key)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${periodo === key ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                {key === "hoy" ? "Hoy" : key === "ayer" ? "Ayer" : key === "esta-semana" ? "Esta Semana" : key === "este-mes" ? "Este Mes" : "Personalizado"}
              </button>
            ))}
          </div>
          {periodo === "personalizado" && (
            <div className="flex gap-4 ml-auto items-end">
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Desde</label><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Hasta</label><input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /></div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><p className="text-sm text-gray-600 mb-1">Total Ventas</p><p className="text-2xl font-bold text-green-600">${metrica.total.toFixed(2)}</p></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><p className="text-sm text-gray-600 mb-1">Número de Ventas</p><p className="text-2xl font-bold text-gray-900">{metrica.cantidad}</p></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><p className="text-sm text-gray-600 mb-1">Ticket Promedio</p><p className="text-2xl font-bold text-blue-600">${metrica.promedio.toFixed(2)}</p></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><p className="text-sm text-gray-600 mb-1">Método más usado</p><p className="text-2xl font-bold text-purple-600 capitalize">{metrica.metodoTop}</p></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><p className="text-sm text-gray-600 mb-1">Margen Bruto</p><p className={`text-2xl font-bold ${metrica.margen >= 0 ? "text-emerald-600" : "text-red-600"}`}>${metrica.margen.toFixed(2)}</p></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><p className="text-sm text-gray-600 mb-1">% Margen Promedio</p><p className={`text-2xl font-bold ${metrica.margenPorcentaje >= 0 ? "text-emerald-600" : "text-red-600"}`}>{metrica.margenPorcentaje.toFixed(1)}%</p></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-600 mb-1">Devoluciones</p>
            <p className="text-2xl font-bold text-red-600">{devolucionesCount}</p>
            {devolucionesTotal > 0 && (
              <p className="text-xs text-red-500 mt-1">Total: ${devolucionesTotal.toFixed(2)}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Ventas por día</h2>
            {ventasPorDia.labels.length > 0 ? <Bar data={barData} options={barOptions} /> : <p className="text-gray-500 text-center py-8">Sin datos</p>}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Distribución por método</h2>
            {metodosPago.labels.length > 0 ? <Doughnut data={doughnutData} options={doughnutOptions} /> : <p className="text-gray-500 text-center py-8">Sin datos</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Ventas por Categoría</h2>
          {ventasPorCategoria.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-4 py-3 text-left font-semibold text-gray-900">Categoría</th><th className="px-4 py-3 text-right font-semibold text-gray-900">Total Vendido</th></tr></thead>
                <tbody className="divide-y divide-gray-100">{ventasPorCategoria.map((item, idx) => (<tr key={idx} className="hover:bg-gray-50"><td className="px-4 py-3 text-gray-900 font-medium">{item.categoria}</td><td className="px-4 py-3 text-right text-gray-800 font-semibold">${item.total.toFixed(2)}</td></tr>))}</tbody>
              </table>
            </div>
          ) : <p className="text-gray-500 text-center py-8">Sin datos de categorías.</p>}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Resumen por Método</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(
              (() => {
                const metodos: Record<string, number> = {};
                ventas.filter(v => v.estado !== "devuelta").forEach(v => { metodos[v.metodo_pago] = (metodos[v.metodo_pago] || 0) + v.total; });
                return metodos;
              })()
            ).map(([metodo, total]) => (<div key={metodo} className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-700 capitalize font-medium">{metodo}</p><p className="text-lg font-bold text-green-700">${total.toFixed(2)}</p></div>))}
          </div>
        </div>

        {/* Tabla de ventas con diseño responsive: tabla en escritorio, tarjetas en móvil */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {cargando ? <p className="p-4 text-gray-800">Cargando ventas...</p> : ventas.length === 0 ? <p className="p-4 text-gray-800">No hay ventas en este período.</p> : (
            <>
              {/* Tabla normal en escritorio (md hacia arriba) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr><th className="px-4 py-3 text-left font-semibold text-gray-900">ID</th><th className="px-4 py-3 text-left font-semibold text-gray-900">Fecha</th><th className="px-4 py-3 text-left font-semibold text-gray-900">Método</th><th className="px-4 py-3 text-left font-semibold text-gray-900">Total</th><th className="px-4 py-3 text-left font-semibold text-gray-900">Cambio</th><th className="px-4 py-3 text-left font-semibold text-gray-900">Estado</th><th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventas.map((venta) => (
                      <tr key={venta.id} className={`hover:bg-gray-50 ${venta.estado === "devuelta" ? "bg-red-50" : ""}`}>
                        <td className="px-4 py-3 text-gray-800 font-mono text-xs">{venta.id.slice(0, 8)}...</td>
                        <td className="px-4 py-3 text-gray-900">{new Date(venta.created_at).toLocaleString("es-MX")}</td>
                        <td className="px-4 py-3 capitalize"><span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${venta.metodo_pago === "efectivo" ? "bg-green-100 text-green-900" : venta.metodo_pago === "tarjeta" ? "bg-blue-100 text-blue-900" : venta.metodo_pago === "transferencia" ? "bg-purple-100 text-purple-900" : venta.metodo_pago === "credito" ? "bg-orange-100 text-orange-900" : "bg-gray-100 text-gray-900"}`}>{venta.metodo_pago}</span></td>
                        <td className="px-4 py-3 font-semibold text-gray-900">${venta.total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-gray-800">{venta.cambio != null ? `$${venta.cambio.toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-3">
                          {venta.estado === "devuelta" ? (
                            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-900">Devuelta</span>
                          ) : (
                            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-900">Activa</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {venta.estado !== "devuelta" ? (
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => reimprimirTicket(venta)} className="text-green-600 hover:text-green-800 text-xs font-medium underline">Reimprimir</button>
                              <button onClick={() => setVentaDevolucion(venta)} className="text-red-600 hover:text-red-800 text-xs font-medium underline">Devolución</button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas en móvil (menos de md) */}
              <div className="md:hidden divide-y divide-gray-100">
                {ventas.map((venta) => (
                  <div key={venta.id} className={`p-4 ${venta.estado === "devuelta" ? "bg-red-50" : ""}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-xs text-gray-500">#{venta.id.slice(0, 8)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        venta.estado === "devuelta" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                      }`}>
                        {venta.estado === "devuelta" ? "Devuelta" : "Activa"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <p className="text-gray-500">Fecha:</p>
                      <p className="text-gray-900 text-right">{new Date(venta.created_at).toLocaleString("es-MX")}</p>
                      <p className="text-gray-500">Método:</p>
                      <p className="text-gray-900 text-right capitalize">{venta.metodo_pago}</p>
                      <p className="text-gray-500">Total:</p>
                      <p className="text-gray-900 text-right font-semibold">${venta.total.toFixed(2)}</p>
                      <p className="text-gray-500">Cambio:</p>
                      <p className="text-gray-900 text-right">{venta.cambio != null ? `$${venta.cambio.toFixed(2)}` : "—"}</p>
                    </div>
                    {venta.estado !== "devuelta" && (
                      <div className="flex gap-3 mt-3">
                        <button onClick={() => reimprimirTicket(venta)} className="text-green-600 text-xs font-medium underline">Reimprimir</button>
                        <button onClick={() => setVentaDevolucion(venta)} className="text-red-600 text-xs font-medium underline">Devolución</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal reimpresión */}
      {ticketReimpresion && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto ticket-print">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">🧾 Comprobante de Venta</h2>
              <p className="text-sm text-gray-800 font-medium">Bicicletas Castañeda</p>
              {ticketReimpresion.sucursalNombre && <p className="text-xs text-gray-600">{ticketReimpresion.sucursalNombre}</p>}
              <p className="text-sm text-gray-900 mt-1">#{ticketReimpresion.venta.id.slice(0, 8)}</p>
              <p className="text-sm text-gray-800">{new Date(ticketReimpresion.venta.created_at).toLocaleString("es-MX")}</p>
            </div>
            <div className="border-t border-dashed border-gray-400 pt-3 mb-3">
              {ticketReimpresion.detalles.map((item: any, idx: number) => (<div key={idx} className="flex justify-between text-sm py-1 text-gray-900"><span className="font-medium">{item.productos?.nombre || "Producto"} x{item.cantidad}</span><span className="font-semibold">${(item.precio_unitario * item.cantidad).toFixed(2)}</span></div>))}
            </div>
            {ticketReimpresion.descuentoPuntos > 0 && <div className="flex justify-between text-sm text-green-700 font-medium py-1"><span>Descuento por puntos</span><span>-${ticketReimpresion.descuentoPuntos.toFixed(2)}</span></div>}
            <div className="border-t border-dashed border-gray-400 pt-2 mt-2 space-y-2 text-sm">
              <div className="flex justify-between font-bold text-base text-gray-900"><span>Total</span><span>${ticketReimpresion.venta.total.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-800"><span>Método</span><span className="capitalize font-medium">{ticketReimpresion.venta.metodo_pago}</span></div>
              {ticketReimpresion.venta.monto_recibido != null && <div className="flex justify-between text-gray-800"><span>Recibido</span><span className="font-medium">${ticketReimpresion.venta.monto_recibido.toFixed(2)}</span></div>}
              {ticketReimpresion.venta.cambio != null && <div className="flex justify-between text-gray-800"><span>Cambio</span><span className="font-medium">${ticketReimpresion.venta.cambio.toFixed(2)}</span></div>}
              {ticketReimpresion.venta.detalle_pago && <div className="mt-2"><p className="text-sm font-semibold text-gray-900 mb-1">Desglose mixto:</p>{ticketReimpresion.venta.detalle_pago.map((p: any, i: number) => (<div key={i} className="flex justify-between text-sm text-gray-800"><span className="capitalize">{p.metodo}</span><span>${p.monto.toFixed(2)}</span></div>))}</div>}
              {ticketReimpresion.clienteNombre && <div className="flex justify-between text-gray-800"><span>Cliente</span><span className="font-medium">{ticketReimpresion.clienteNombre}</span></div>}
              {ticketReimpresion.venta.puntos_ganados > 0 && <div className="flex justify-between text-green-700 font-medium"><span>Puntos ganados</span><span>+{ticketReimpresion.venta.puntos_ganados}</span></div>}
              {ticketReimpresion.venta.puntos_canjeados > 0 && <div className="flex justify-between text-orange-700"><span>Puntos canjeados</span><span>-{ticketReimpresion.venta.puntos_canjeados}</span></div>}
            </div>
            <p className="text-center mt-3 text-sm text-gray-800 font-medium">¡Gracias por tu compra!</p>
            <div className="mt-4 border-t border-gray-300 pt-4 no-print">
              <label className="block text-sm font-medium text-gray-900 mb-1">Enviar por WhatsApp</label>
              <div className="flex gap-2"><input type="text" value={whatsappReimpresion} onChange={(e) => setWhatsappReimpresion(e.target.value)} placeholder="Número de teléfono" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" /><button onClick={enviarWhatsAppReimpresion} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1">💬 Enviar</button></div>
            </div>
            <div className="flex gap-2 mt-3 no-print">
              <button onClick={imprimirTicket} className="flex-1 bg-gray-800 hover:bg-gray-900 text-white py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-1">🖨️ Imprimir</button>
              <button onClick={() => setTicketReimpresion(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2.5 rounded-lg font-medium transition">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal devolución */}
      {ventaDevolucion && <DevolucionModal venta={ventaDevolucion} onClose={() => setVentaDevolucion(null)} />}
    </>
  );
}