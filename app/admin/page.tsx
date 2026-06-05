// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useVenta } from "@/context/VentaContext";
import { useBranch } from "@/context/BranchContext";

// ============ Funciones para manejar el huso horario de México (UTC-6) ============
function obtenerRangoDiaLocal() {
  const ahora = new Date();
  const inicioUTC = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 6, 0, 0);
  const finUTC = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 29, 59, 59, 999);
  return {
    inicio: new Date(inicioUTC).toISOString(),
    fin: new Date(finUTC).toISOString(),
  };
}

// ============ Tipos ============
interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  tipo: string;
  imagen_url: string | null;
  sku: string | null;
  codigo_barras: string | null;
  categoria_id: string | null;
}

interface Categoria {
  id: string;
  nombre: string;
}

interface Cliente {
  id: string;
  nombre: string;
  telefono?: string;
  puntos: number;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "credito" | "mixto";

interface PagoParcial {
  metodo: Exclude<MetodoPago, "mixto">;
  monto: number;
  cliente_id?: string;
}

interface TicketData {
  ventaId: string;
  items: ItemCarrito[];
  total: number;
  metodoPago: MetodoPago;
  montoRecibido?: number;
  cambio?: number;
  pagosParciales?: PagoParcial[];
  clienteId?: string;
  fecha: string;
  puntosGanados: number;
  puntosCanjeados: number;
  descuentoPuntos: number;
}

interface MovimientoCaja {
  id: string;
  tipo: "entrada" | "salida";
  monto: number;
  motivo: string | null;
  created_at: string;
}

interface CorteCaja {
  id: string;
  fecha_inicio: string;
  fecha_fin: string;
  total_ventas: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  credito: number;
  mixto: number;
  efectivo_real: number | null;
  diferencia: number | null;
  comentario: string | null;
  created_at: string;
}

// ============ Componente independiente de Caja ============
function CajaModal({ onClose, sucursalId }: { onClose: () => void; sucursalId?: string }) {
  const [cajaData, setCajaData] = useState({
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    credito: 0,
    total: 0,
    montoInicial: 0,
  });
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [cortes, setCortes] = useState<CorteCaja[]>([]);
  const [mostrarFormMov, setMostrarFormMov] = useState(false);
  const [tipoMov, setTipoMov] = useState<"entrada" | "salida">("entrada");
  const [montoMov, setMontoMov] = useState("");
  const [motivoMov, setMotivoMov] = useState("");
  const [montoInicialInput, setMontoInicialInput] = useState("");
  const [efectivoRealCorte, setEfectivoRealCorte] = useState("");
  const [comentarioCorte, setComentarioCorte] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const hoyStr = new Date().toISOString().slice(0, 10);
  const { inicio: inicioDia, fin: finDia } = obtenerRangoDiaLocal();

  const cargarDatosCaja = async () => {
    setCargando(true);
    try {
      const { data: ultimoCorte } = await supabase
        .from("cortes_caja")
        .select("fecha_fin")
        .eq("sucursal_id", sucursalId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let inicioEfectivo = inicioDia;
      if (ultimoCorte?.fecha_fin) {
        const fechaCorte = new Date(ultimoCorte.fecha_fin);
        if (fechaCorte > new Date(inicioDia)) {
          inicioEfectivo = fechaCorte.toISOString();
        }
      }

      const [
        { data: ventasHoy },
        { data: abonos },
        { data: movs },
        { data: cajaInicial },
        { data: cortesData },
      ] = await Promise.all([
        supabase.from("ventas").select("total, metodo_pago, detalle_pago, created_at")
          .eq("sucursal_id", sucursalId)
          .gte("created_at", inicioDia).lte("created_at", finDia),
        supabase.from("abonos_credito").select("monto, metodo_pago")
          .eq("sucursal_id", sucursalId)
          .gte("created_at", inicioEfectivo).lte("created_at", finDia),
        supabase.from("movimientos_caja").select("*")
          .eq("sucursal_id", sucursalId)
          .gte("created_at", inicioEfectivo).lte("created_at", finDia).order("created_at", { ascending: false }),
        supabase.from("caja_diaria").select("monto_inicial").eq("fecha", hoyStr).maybeSingle(),
        supabase.from("cortes_caja").select("*")
          .eq("sucursal_id", sucursalId)
          .order("created_at", { ascending: false }).limit(10),
      ]);

      let efectivo = 0, tarjeta = 0, transferencia = 0, credito = 0, total = 0;
      if (ventasHoy) {
        const ventasFiltradas = ventasHoy.filter(v => new Date(v.created_at) >= new Date(inicioEfectivo));
        ventasFiltradas.forEach((v) => {
          total += v.total;
          if (v.metodo_pago === "efectivo") efectivo += v.total;
          else if (v.metodo_pago === "tarjeta") tarjeta += v.total;
          else if (v.metodo_pago === "transferencia") transferencia += v.total;
          else if (v.metodo_pago === "credito") credito += v.total;
          else if (v.metodo_pago === "mixto" && v.detalle_pago) {
            v.detalle_pago.forEach((p: any) => {
              if (p.metodo === "efectivo") efectivo += p.monto;
              else if (p.metodo === "tarjeta") tarjeta += p.monto;
              else if (p.metodo === "transferencia") transferencia += p.monto;
              else if (p.metodo === "credito") credito += p.monto;
            });
          }
        });
        if (abonos) {
          abonos.forEach((a) => {
            if (a.metodo_pago === "efectivo") efectivo += a.monto;
            else if (a.metodo_pago === "tarjeta") tarjeta += a.monto;
            else if (a.metodo_pago === "transferencia") transferencia += a.monto;
          });
        }
      }

      const inicial = cajaInicial?.monto_inicial || 0;
      setCajaData({ efectivo, tarjeta, transferencia, credito, total, montoInicial: inicial });
      setMovimientos(movs || []);
      setCortes(cortesData || []);
      setMontoInicialInput(inicial.toString());
    } catch (err: any) {
      setMensaje("Error al cargar la caja: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatosCaja();
  }, []);

  const guardarMontoInicial = async () => {
    const monto = parseFloat(montoInicialInput) || 0;
    await supabase.from("caja_diaria").upsert({ fecha: hoyStr, monto_inicial: monto }, { onConflict: "fecha" });
    setCajaData(prev => ({ ...prev, montoInicial: monto }));
    setMensaje("Monto inicial actualizado");
    setTimeout(() => setMensaje(null), 2000);
  };

  const registrarMovimiento = async () => {
    const monto = parseFloat(montoMov);
    if (!monto || monto <= 0 || !motivoMov.trim()) return;
    await supabase.from("movimientos_caja").insert({
      tipo: tipoMov,
      monto,
      motivo: motivoMov.trim(),
      sucursal_id: sucursalId,
    });
    setMontoMov("");
    setMotivoMov("");
    setMostrarFormMov(false);
    cargarDatosCaja();
    setMensaje("Movimiento registrado");
    setTimeout(() => setMensaje(null), 2000);
  };

  const realizarCorte = async () => {
    const efectivoReal = parseFloat(efectivoRealCorte) || undefined;
    const ahora = new Date().toISOString();
    const inicioPeriodo = inicioDia;
    await supabase.from("cortes_caja").insert({
      fecha_inicio: inicioPeriodo,
      fecha_fin: ahora,
      total_ventas: cajaData.total,
      efectivo: cajaData.efectivo,
      tarjeta: cajaData.tarjeta,
      transferencia: cajaData.transferencia,
      credito: cajaData.credito,
      mixto: 0,
      efectivo_real: efectivoReal,
      comentario: comentarioCorte.trim() || null,
      sucursal_id: sucursalId,
    });
    setEfectivoRealCorte("");
    setComentarioCorte("");
    setMensaje("Corte registrado. Caja reiniciada.");
    setTimeout(() => setMensaje(null), 2000);
    cargarDatosCaja();
  };

  const totalEfectivo = () => {
    const entradas = movimientos.filter(m => m.tipo === "entrada").reduce((a, m) => a + m.monto, 0);
    const salidas = movimientos.filter(m => m.tipo === "salida").reduce((a, m) => a + m.monto, 0);
    return cajaData.montoInicial + cajaData.efectivo + entradas - salidas;
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg border border-gray-200 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">💰 Caja del Día</h2>
        {cargando ? (
          <p className="text-center text-gray-800 py-8">Cargando caja...</p>
        ) : (
          <>
            <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
              <label className="block text-sm font-semibold text-gray-900 mb-1">Monto inicial</label>
              <div className="flex gap-2">
                <input type="text" inputMode="decimal" value={montoInicialInput} onChange={(e) => { const val = e.target.value; if (val === "" || /^\d*\.?\d*$/.test(val)) setMontoInicialInput(val); }} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
                <button onClick={guardarMontoInicial} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Guardar</button>
              </div>
              {mensaje && <p className="text-xs text-blue-700 mt-1">{mensaje}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-green-50 rounded-lg p-3 border border-green-200"><p className="text-xs text-green-700 font-medium">Efectivo (ventas + abonos)</p><p className="text-xl font-bold text-green-800">${cajaData.efectivo.toFixed(2)}</p></div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200"><p className="text-xs text-blue-700 font-medium">Tarjeta</p><p className="text-xl font-bold text-blue-800">${cajaData.tarjeta.toFixed(2)}</p></div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200"><p className="text-xs text-purple-700 font-medium">Transferencia</p><p className="text-xl font-bold text-purple-800">${cajaData.transferencia.toFixed(2)}</p></div>
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200"><p className="text-xs text-orange-700 font-medium">Crédito (ventas)</p><p className="text-xl font-bold text-orange-800">${cajaData.credito.toFixed(2)}</p></div>
            </div>

            <div className="bg-gray-100 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900">Efectivo en caja</span>
                <span className="text-2xl font-bold text-gray-900">${totalEfectivo().toFixed(2)}</span>
              </div>
            </div>

            <div className="mb-4">
              <button onClick={() => setMostrarFormMov(!mostrarFormMov)} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 py-2 rounded-lg text-sm font-medium border border-gray-300">+ Registrar entrada/salida</button>
              {mostrarFormMov && (
                <div className="bg-gray-50 rounded-lg p-4 mt-2 border border-gray-200">
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setTipoMov("entrada")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${tipoMov === "entrada" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"}`}>Entrada</button>
                    <button onClick={() => setTipoMov("salida")} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${tipoMov === "salida" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"}`}>Salida</button>
                  </div>
                  <div className="space-y-3">
                    <input type="text" inputMode="decimal" value={montoMov} onChange={(e) => { const val = e.target.value; if (val === "" || /^\d*\.?\d*$/.test(val)) setMontoMov(val); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Monto" />
                    <input type="text" value={motivoMov} onChange={(e) => setMotivoMov(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Motivo" />
                    <button onClick={registrarMovimiento} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">Registrar movimiento</button>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Movimientos del día</h3>
              <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg">
                {movimientos.length === 0 ? <p className="text-xs text-gray-800 text-center py-4">Sin movimientos</p> : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-300"><tr><th className="px-2 py-1 text-left font-semibold text-gray-900">Tipo</th><th className="px-2 py-1 text-right font-semibold text-gray-900">Monto</th><th className="px-2 py-1 text-left font-semibold text-gray-900">Motivo</th></tr></thead>
                    <tbody className="divide-y divide-gray-200">{movimientos.map(m => (<tr key={m.id}><td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${m.tipo === "entrada" ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>{m.tipo === "entrada" ? "Entrada" : "Salida"}</span></td><td className="px-2 py-1 text-right font-semibold text-gray-900">${m.monto.toFixed(2)}</td><td className="px-2 py-1 text-gray-800">{m.motivo || "—"}</td></tr>))}</tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Corte de Caja</h3>
              <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-900 mb-1">Efectivo contado ($)</label><input type="text" inputMode="decimal" value={efectivoRealCorte} onChange={(e) => { const val = e.target.value; if (val === "" || /^\d*\.?\d*$/.test(val)) setEfectivoRealCorte(val); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /><p className="text-xs text-gray-700 mt-1">Esperado: ${cajaData.efectivo.toFixed(2)}</p></div>
                  <div><label className="block text-xs font-medium text-gray-900 mb-1">Comentario</label><input type="text" value={comentarioCorte} onChange={(e) => setComentarioCorte(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <button onClick={realizarCorte} className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg text-sm">Realizar Corte</button>
              </div>
              <details>
                <summary className="text-sm text-green-700 font-medium cursor-pointer">Ver últimos cortes</summary>
                <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg mt-2">
                  {cortes.length === 0 ? <p className="text-xs text-gray-800 text-center py-4">No hay cortes</p> : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 border-b border-gray-300"><tr><th className="px-2 py-1 text-left font-semibold text-gray-900">Fecha</th><th className="px-2 py-1 text-right font-semibold text-gray-900">Total</th><th className="px-2 py-1 text-right font-semibold text-gray-900">Efectivo</th><th className="px-2 py-1 text-right font-semibold text-gray-900">Dif.</th></tr></thead>
                      <tbody className="divide-y divide-gray-200">{cortes.map(c => (<tr key={c.id}><td className="px-2 py-1 text-gray-800">{new Date(c.created_at).toLocaleDateString("es-MX")}</td><td className="px-2 py-1 text-right font-semibold text-gray-900">${c.total_ventas.toFixed(2)}</td><td className="px-2 py-1 text-right text-green-700 font-semibold">${c.efectivo.toFixed(2)}</td><td className={`px-2 py-1 text-right font-semibold ${c.diferencia !== null && c.diferencia !== 0 ? (c.diferencia > 0 ? "text-green-600" : "text-red-600") : "text-gray-600"}`}>{c.diferencia !== null ? `$${c.diferencia.toFixed(2)}` : "—"}</td></tr>))}</tbody>
                    </table>
                  )}
                </div>
              </details>
            </div>
          </>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-medium transition">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ============ Componente principal del POS ============
function PosPage() {
  const searchParams = useSearchParams();
  const presupuestoParam = searchParams.get("presupuesto");
  const ordenTallerParam = searchParams.get("orden_taller");
  const clienteIdParam = searchParams.get("cliente_id");

  // Contextos
  const {
    carrito,
    agregarAlCarrito,
    eliminarDelCarrito,
    vaciarCarrito,
    total,
    clienteSeleccionado,
    setClienteSeleccionado,
    clientePuntos,
    setClientePuntos,
    puntosACanjear,
    setPuntosACanjear,
    descuentoPuntos,
    setDescuentoPuntos,
  } = useVenta();
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  // Estados locales
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  const [mostrarModalPago, setMostrarModalPago] = useState(false);
  const [metodoSeleccionado, setMetodoSeleccionado] = useState<MetodoPago>("efectivo");
  const [pagosMixto, setPagosMixto] = useState({ efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0, clienteCredito: "" });
  const [montoRecibido, setMontoRecibido] = useState<number>(0);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoNombreCliente, setNuevoNombreCliente] = useState("");
  const [nuevoTelefonoCliente, setNuevoTelefonoCliente] = useState("");
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [whatsappNumero, setWhatsappNumero] = useState("");
  const [metricaVentasHoy, setMetricaVentasHoy] = useState(0);
  const [metricaTotalHoy, setMetricaTotalHoy] = useState(0);
  const [metricaStockBajo, setMetricaStockBajo] = useState(0);
  const [mostrarProductoComun, setMostrarProductoComun] = useState(false);
  const [productoComunNombre, setProductoComunNombre] = useState("");
  const [productoComunPrecio, setProductoComunPrecio] = useState("");
  const [mostrarModalCaja, setMostrarModalCaja] = useState(false);

  // NUEVO: Filtro de stock bajo activo/inactivo
  const [filtroStockBajo, setFiltroStockBajo] = useState(false);

  const [configTicket, setConfigTicket] = useState({
    nombre_taller: "Bicicletas Castañeda",
    direccion: "",
    telefono: "",
    mensaje_ticket: "¡Gracias por tu compra!",
  });

  const PUNTOS_A_PESOS = 10;

  // Cargar métricas del día y categorías
  const cargarMetricas = async () => {
    const { inicio, fin } = obtenerRangoDiaLocal();
    let query = supabase.from("ventas").select("total")
      .gte("created_at", inicio).lte("created_at", fin);
    if (sucursalId) query = query.eq("sucursal_id", sucursalId);
    const { data: ventasHoy } = await query;
    if (ventasHoy) {
      setMetricaVentasHoy(ventasHoy.length);
      setMetricaTotalHoy(ventasHoy.reduce((acc, v) => acc + v.total, 0));
    } else {
      setMetricaVentasHoy(0); setMetricaTotalHoy(0);
    }

    let prodQuery = supabase.from("productos").select("id").lte("stock", 5).limit(10);
    if (sucursalId) prodQuery = prodQuery.eq("sucursal_id", sucursalId);
    const { data: prodsBajos } = await prodQuery;
    setMetricaStockBajo(prodsBajos?.length || 0);

    const { data: cats } = await supabase.from("categorias").select("*").order("nombre");
    if (cats) setCategorias(cats);
  };

  useEffect(() => {
    cargarMetricas();
    const loadClients = async () => {
      const { data } = await supabase.from("clientes").select("id, nombre, telefono, puntos").order("nombre");
      if (data) setClientes(data);
    };
    loadClients();

    supabase.from("configuracion").select("*").eq("id", 1).single().then(({ data }) => {
      if (data) {
        setConfigTicket({
          nombre_taller: data.nombre_taller || "Bicicletas Castañeda",
          direccion: data.direccion || "",
          telefono: data.telefono || "",
          mensaje_ticket: data.mensaje_ticket || "¡Gracias por tu compra!",
        });
      }
    });
  }, [sucursalId]);

  // Efecto para convertir presupuesto en venta
  useEffect(() => {
    if (!presupuestoParam) return;
    const cargarPresupuestoEnCarrito = async () => {
      const { data: lineas, error } = await supabase
        .from("detalle_presupuesto")
        .select("producto_id, descripcion, cantidad, precio_unitario")
        .eq("presupuesto_id", presupuestoParam);
      if (error || !lineas || lineas.length === 0) return;
      const nuevosItems: ItemCarrito[] = [];
      for (const linea of lineas) {
        if (linea.producto_id) {
          const { data: producto } = await supabase.from("productos").select("*").eq("id", linea.producto_id).single();
          if (producto) {
            nuevosItems.push({ producto: { ...producto }, cantidad: linea.cantidad });
          } else {
            nuevosItems.push({
              producto: {
                id: `generic_${Date.now()}_${Math.random()}`,
                nombre: linea.descripcion || "Producto del presupuesto",
                descripcion: null, precio: linea.precio_unitario, stock: 999,
                tipo: "producto_simple", imagen_url: null, sku: null, codigo_barras: null, categoria_id: null,
              },
              cantidad: linea.cantidad,
            });
          }
        } else {
          nuevosItems.push({
            producto: {
              id: `generic_${Date.now()}_${Math.random()}`,
              nombre: linea.descripcion || "Producto sin nombre",
              descripcion: null, precio: linea.precio_unitario, stock: 999,
              tipo: "producto_simple", imagen_url: null, sku: null, codigo_barras: null, categoria_id: null,
            },
            cantidad: linea.cantidad,
          });
        }
      }
      nuevosItems.forEach(item => agregarAlCarrito(item.producto));
      const url = new URL(window.location.href);
      url.searchParams.delete("presupuesto");
      window.history.replaceState({}, "", url.toString());
    };
    cargarPresupuestoEnCarrito();
  }, [presupuestoParam]);

  // Efecto para convertir orden de taller en venta
  useEffect(() => {
    if (!ordenTallerParam) return;
    const cargarOrdenEnCarrito = async () => {
      const { data: lineas, error } = await supabase
        .from("detalle_orden_taller")
        .select("producto_id, descripcion, cantidad, precio_unitario")
        .eq("orden_id", ordenTallerParam);
      if (error || !lineas || lineas.length === 0) return;
      const nuevosItems: ItemCarrito[] = [];
      for (const linea of lineas) {
        if (linea.producto_id) {
          const { data: producto } = await supabase.from("productos").select("*").eq("id", linea.producto_id).single();
          if (producto) {
            nuevosItems.push({ producto: { ...producto }, cantidad: linea.cantidad });
          } else {
            nuevosItems.push({
              producto: {
                id: `orden_${Date.now()}_${Math.random()}`,
                nombre: linea.descripcion || "Producto de orden",
                descripcion: null, precio: linea.precio_unitario, stock: 999,
                tipo: "producto_simple", imagen_url: null, sku: null, codigo_barras: null, categoria_id: null,
              },
              cantidad: linea.cantidad,
            });
          }
        } else {
          nuevosItems.push({
            producto: {
              id: `orden_${Date.now()}_${Math.random()}`,
              nombre: linea.descripcion || "Servicio",
              descripcion: null, precio: linea.precio_unitario, stock: 999,
              tipo: "servicio_taller", imagen_url: null, sku: null, codigo_barras: null, categoria_id: null,
            },
            cantidad: linea.cantidad,
          });
        }
      }
      nuevosItems.forEach(item => agregarAlCarrito(item.producto));
      if (clienteIdParam) {
        setClienteSeleccionado(clienteIdParam);
        const { data: clienteData } = await supabase
          .from("clientes")
          .select("puntos")
          .eq("id", clienteIdParam)
          .single();
        if (clienteData) {
          setClientePuntos(clienteData.puntos || 0);
        }
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("orden_taller");
      url.searchParams.delete("cliente_id");
      window.history.replaceState({}, "", url.toString());
    };
    cargarOrdenEnCarrito();
  }, [ordenTallerParam, clienteIdParam]);

  // Efecto para convertir pedido online en venta
  useEffect(() => {
    const pedidoStr = sessionStorage.getItem("pedido_online_convertir");
    if (!pedidoStr) return;
    const pedido = JSON.parse(pedidoStr);
    sessionStorage.removeItem("pedido_online_convertir");
    const cargarPedidoEnCarrito = async () => {
      const nuevosItems: ItemCarrito[] = [];
      try {
        const items = JSON.parse(pedido.items);
        for (const item of items) {
          const { data: producto } = await supabase
            .from("productos")
            .select("*")
            .ilike("nombre", item.nombre)
            .single();
          if (producto) {
            nuevosItems.push({ producto: { ...producto }, cantidad: item.cantidad });
          } else {
            nuevosItems.push({
              producto: {
                id: `pedido_${Date.now()}_${Math.random()}`,
                nombre: item.nombre,
                descripcion: null,
                precio: item.precio,
                stock: 999,
                tipo: "producto_simple",
                imagen_url: null,
                sku: null,
                codigo_barras: null,
                categoria_id: null,
              },
              cantidad: item.cantidad,
            });
          }
        }
        nuevosItems.forEach(item => agregarAlCarrito(item.producto));
      } catch {}
    };
    cargarPedidoEnCarrito();
  }, []);

  // Búsqueda de productos filtrada por sucursal y opcionalmente por stock bajo
  useEffect(() => {
    const buscarProductos = async () => {
      if (busqueda.trim() === "" && !categoriaActiva && !filtroStockBajo) {
        setResultados([]);
        return;
      }
      setCargando(true);
      let query = supabase.from("productos").select("*");
      if (sucursalId) query = query.eq("sucursal_id", sucursalId);
      
      if (filtroStockBajo) {
        query = query.lte("stock", 5);
      }
      
      if (busqueda.trim() !== "") {
        const term = `%${busqueda}%`;
        query = query.or(`nombre.ilike.${term},sku.ilike.${term},codigo_barras.ilike.${term}`);
      }
      if (categoriaActiva) query = query.eq("categoria_id", categoriaActiva);
      
      const { data, error } = await query.limit(20);
      if (!error && data) setResultados(data); else setResultados([]);
      setCargando(false);
    };
    const timer = setTimeout(buscarProductos, 300);
    return () => clearTimeout(timer);
  }, [busqueda, categoriaActiva, sucursalId, filtroStockBajo]);

  // Funciones de carrito (heredadas del contexto, no se tocan)
  const abrirModalCobro = () => {
    if (carrito.length === 0) return;
    setMetodoSeleccionado("efectivo");
    setPagosMixto({ efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0, clienteCredito: "" });
    setMontoRecibido(0);
    setMostrarModalPago(true);
  };

  const cambiarMetodo = (metodo: MetodoPago) => {
    setMetodoSeleccionado(metodo);
    if (metodo !== "mixto") setPagosMixto({ efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0, clienteCredito: "" });
    setMontoRecibido(0);
  };

  const sumaPagosMixto = pagosMixto.efectivo + pagosMixto.tarjeta + pagosMixto.transferencia + pagosMixto.credito;

  const crearCliente = async () => {
    if (!nuevoNombreCliente.trim()) return;
    const { data, error } = await supabase.from("clientes").insert({ nombre: nuevoNombreCliente.trim(), telefono: nuevoTelefonoCliente.trim() || null, puntos: 0 }).select("id, nombre, telefono, puntos").single();
    if (data) {
      setClientes(prev => [...prev, data]);
      setClienteSeleccionado(data.id);
      setClientePuntos(data.puntos);
      setPuntosACanjear(0);
      setDescuentoPuntos(0);
      setNuevoNombreCliente("");
      setNuevoTelefonoCliente("");
      setMostrarNuevoCliente(false);
    } else setMensaje({ tipo: "error", texto: "Error al crear cliente" });
  };

  const handleClienteChange = (id: string) => {
    setClienteSeleccionado(id);
    if (id) {
      const c = clientes.find(c => c.id === id);
      setClientePuntos(c?.puntos || 0);
      setPuntosACanjear(0);
      setDescuentoPuntos(0);
    } else { setClientePuntos(0); setPuntosACanjear(0); setDescuentoPuntos(0); }
  };

  const handlePuntosCanjearChange = (puntos: number) => {
    const max = Math.min(puntos, clientePuntos);
    setPuntosACanjear(max);
    setDescuentoPuntos(Math.floor(max / PUNTOS_A_PESOS));
  };

  const confirmarCobro = useCallback(async () => {
    if (carrito.length === 0) return;
    if (metodoSeleccionado === "efectivo" && montoRecibido < total) { setMensaje({ tipo: "error", texto: "Monto recibido insuficiente." }); return; }
    if (metodoSeleccionado === "mixto") {
      if (Math.abs(sumaPagosMixto - total) > 0.01) { setMensaje({ tipo: "error", texto: "La suma de pagos no coincide con el total." }); return; }
      if (pagosMixto.credito > 0 && !pagosMixto.clienteCredito) { setMensaje({ tipo: "error", texto: "Seleccione cliente para crédito." }); return; }
    }
    if (metodoSeleccionado === "credito" && !clienteSeleccionado) { setMensaje({ tipo: "error", texto: "Seleccione cliente." }); return; }

    setMostrarModalPago(false);
    setCobrando(true);
    setMensaje(null);
    const ventaPayload: any = {
      total,
      metodo_pago: metodoSeleccionado,
      sucursal_id: sucursalId,
    };
    let montoRec = undefined, cambioVal = undefined;
    if (metodoSeleccionado === "efectivo") { montoRec = montoRecibido; cambioVal = montoRecibido - total; ventaPayload.monto_recibido = montoRec; ventaPayload.cambio = cambioVal; }
    if (clienteSeleccionado) { ventaPayload.cliente_id = clienteSeleccionado; ventaPayload.puntos_canjeados = puntosACanjear; ventaPayload.puntos_ganados = Math.floor(total / 10); }
    if (metodoSeleccionado === "mixto") {
      const parciales: PagoParcial[] = [];
      if (pagosMixto.efectivo > 0) parciales.push({ metodo: "efectivo", monto: pagosMixto.efectivo });
      if (pagosMixto.tarjeta > 0) parciales.push({ metodo: "tarjeta", monto: pagosMixto.tarjeta });
      if (pagosMixto.transferencia > 0) parciales.push({ metodo: "transferencia", monto: pagosMixto.transferencia });
      if (pagosMixto.credito > 0) parciales.push({ metodo: "credito", monto: pagosMixto.credito, cliente_id: pagosMixto.clienteCredito });
      ventaPayload.detalle_pago = parciales;
    }
    const { data: ventaData, error: ventaError } = await supabase.from("ventas").insert(ventaPayload).select("id, created_at").single();
    if (ventaError) { setMensaje({ tipo: "error", texto: "Error al registrar venta" }); setCobrando(false); return; }
    const ventaId = ventaData.id, fechaVenta = ventaData.created_at;
    const itemsReales = carrito.filter(item => !item.producto.id.startsWith("generic_") && !item.producto.id.startsWith("orden_") && !item.producto.id.startsWith("pedido_"));
    const detalles = itemsReales.map(item => ({ venta_id: ventaId, producto_id: item.producto.id, cantidad: item.cantidad, precio_unitario: item.producto.precio }));
    if (detalles.length > 0) {
      const { error: detError } = await supabase.from("detalle_venta").insert(detalles);
      if (detError) { await supabase.from("ventas").delete().eq("id", ventaId); setMensaje({ tipo: "error", texto: "Error en detalles" }); setCobrando(false); return; }
    }
    const updates = itemsReales.map(item => supabase.from("productos").update({ stock: item.producto.stock - item.cantidad }).eq("id", item.producto.id));
    await Promise.all(updates);
    if (clienteSeleccionado) {
      const nuevosPuntos = clientePuntos - puntosACanjear + ventaPayload.puntos_ganados;
      await supabase.from("clientes").update({ puntos: nuevosPuntos }).eq("id", clienteSeleccionado);
    }
    setTicketData({ ventaId, items: [...carrito], total, metodoPago: metodoSeleccionado, montoRecibido: montoRec, cambio: cambioVal, pagosParciales: metodoSeleccionado === "mixto" ? ventaPayload.detalle_pago : undefined, clienteId: clienteSeleccionado || undefined, fecha: fechaVenta, puntosGanados: ventaPayload.puntos_ganados || 0, puntosCanjeados: puntosACanjear, descuentoPuntos });
    if (clienteSeleccionado) { const cli = clientes.find(c => c.id === clienteSeleccionado); setWhatsappNumero(cli?.telefono || ""); } else setWhatsappNumero("");
    vaciarCarrito();
    setCobrando(false);
    cargarMetricas();
  }, [carrito, total, metodoSeleccionado, montoRecibido, clienteSeleccionado, clientes, pagosMixto, sumaPagosMixto, puntosACanjear, descuentoPuntos, clientePuntos, sucursalId]);

  const cerrarTicket = () => { setTicketData(null); setWhatsappNumero(""); };

  const enviarWhatsApp = () => {
    if (!ticketData) return;
    let numero = whatsappNumero.trim();
    if (!numero) {
      if (ticketData.clienteId) {
        const cliente = clientes.find(c => c.id === ticketData.clienteId);
        if (cliente?.telefono) numero = cliente.telefono;
      }
      if (!numero) {
        alert("Ingresa un número de teléfono o asigna un cliente con teléfono.");
        return;
      }
    }
    numero = numero.replace(/[\s\-\(\)]/g, "");
    if (!numero.startsWith("52")) {
      if (numero.length === 10) numero = "52" + numero;
      else if (numero.length > 10) numero = "52" + numero.slice(-10);
    }
    let mensaje = `🧾 *Comprobante Bicicletas Castañeda*\nVenta #${ticketData.ventaId.slice(0, 8)}\nFecha: ${new Date(ticketData.fecha).toLocaleString("es-MX")}\n\n*Productos:*\n`;
    ticketData.items.forEach(item => {
      mensaje += `- ${item.producto.nombre} x${item.cantidad}: $${(item.producto.precio * item.cantidad).toFixed(2)}\n`;
    });
    if (ticketData.descuentoPuntos > 0) mensaje += `\n*Descuento por puntos:* -$${ticketData.descuentoPuntos.toFixed(2)}\n`;
    mensaje += `\n*Total: $${ticketData.total.toFixed(2)}*\nMétodo: ${ticketData.metodoPago}\n`;
    if (ticketData.montoRecibido !== undefined) {
      mensaje += `Recibido: $${ticketData.montoRecibido.toFixed(2)}\n`;
      if (ticketData.cambio !== undefined && ticketData.cambio >= 0) mensaje += `Cambio: $${ticketData.cambio.toFixed(2)}\n`;
    }
    if (ticketData.pagosParciales && ticketData.pagosParciales.length > 0) {
      mensaje += `Desglose mixto:\n`;
      ticketData.pagosParciales.forEach((p: any) => { mensaje += `  ${p.metodo}: $${p.monto.toFixed(2)}\n`; });
    }
    if (ticketData.puntosGanados > 0) mensaje += `Puntos ganados: ${ticketData.puntosGanados}\n`;
    if (ticketData.puntosCanjeados > 0) mensaje += `Puntos canjeados: ${ticketData.puntosCanjeados}\n`;
    mensaje += `\n${configTicket.mensaje_ticket}`;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const imprimirTicket = () => {
    if (!ticketData) return;

    const lineasHTML = ticketData.items
      .map(
        (item) => `
      <div style="display: flex; justify-content: space-between; font-size: 14px; padding: 2px 0;">
        <span>${item.producto.nombre} x${item.cantidad}</span>
        <span>$${(item.producto.precio * item.cantidad).toFixed(2)}</span>
      </div>`
      )
      .join("");

    const metodoPago = ticketData.metodoPago;
    const sucursal = sucursalActiva?.nombre || "";
    const taller = configTicket.nombre_taller || "Bicicletas Castañeda";
    const direccion = configTicket.direccion || "";
    const telefono = configTicket.telefono || "";

    const html = `
      <html>
        <head>
          <meta charset="utf-8">
          <title>Ticket #${ticketData.ventaId.slice(0, 8)}</title>
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
    font-size: 16px;
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
          <h2 style="text-align: center;">${taller}</h2>
          <p style="text-align: center; font-size: 12px;">${direccion}</p>
          <p style="text-align: center; font-size: 12px;">${telefono}</p>
          ${sucursal ? `<p style="text-align: center; font-size: 12px;">${sucursal}</p>` : ""}
          <hr>
          <p>Ticket #${ticketData.ventaId.slice(0, 8)}</p>
          <p>${new Date(ticketData.fecha).toLocaleString("es-MX")}</p>
          <hr>
          ${lineasHTML}
          ${
            ticketData.descuentoPuntos > 0
              ? `<div style="display: flex; justify-content: space-between; font-size: 14px; padding: 2px 0;">
                  <span>Descuento puntos</span>
                  <span>-$${ticketData.descuentoPuntos.toFixed(2)}</span>
                </div>`
              : ""
          }
          <hr>
          <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold;">
            <span>Total</span>
            <span>$${ticketData.total.toFixed(2)}</span>
          </div>
          <p>Método: ${metodoPago}</p>
          ${
            ticketData.montoRecibido !== undefined
              ? `<p>Recibido: $${ticketData.montoRecibido.toFixed(2)}</p>
                 ${
                   ticketData.cambio !== undefined && ticketData.cambio >= 0
                     ? `<p>Cambio: $${ticketData.cambio.toFixed(2)}</p>`
                     : ""
                 }`
              : ""
          }
          ${
            ticketData.pagosParciales && ticketData.pagosParciales.length > 0
              ? ticketData.pagosParciales
                  .map((p) => `<p>${p.metodo}: $${p.monto.toFixed(2)}</p>`)
                  .join("")
              : ""
          }
          ${
            ticketData.clienteId
              ? `<p>Cliente: ${
                  clientes.find((c) => c.id === ticketData.clienteId)?.nombre || "—"
                }</p>`
              : ""
          }
          ${ticketData.puntosGanados > 0 ? `<p>Puntos ganados: +${ticketData.puntosGanados}</p>` : ""}
          ${ticketData.puntosCanjeados > 0 ? `<p>Puntos canjeados: -${ticketData.puntosCanjeados}</p>` : ""}
          <hr>
          <p style="text-align: center;">${configTicket.mensaje_ticket}</p>
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

  const agregarProductoComun = () => {
    if (!productoComunNombre.trim() || parseFloat(productoComunPrecio) <= 0) return;
    const nuevo: Producto = { id: `generic_${Date.now()}`, nombre: productoComunNombre.trim(), descripcion: null, precio: parseFloat(productoComunPrecio), stock: 999, tipo: "producto_simple", imagen_url: null, sku: null, codigo_barras: null, categoria_id: null };
    agregarAlCarrito(nuevo);
    setMostrarProductoComun(false); setProductoComunNombre(""); setProductoComunPrecio("");
  };

  // ================ INTERFAZ ================
  return (
    <>
      <style jsx global>{`@media print { body * { visibility: hidden; } .ticket-print, .ticket-print * { visibility: visible; } .ticket-print { position: absolute; left: 0; top: 0; width: 80mm; font-size: 12px; background: white; padding: 0; margin: 0; } .no-print { display: none; } }`}</style>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Columna izquierda */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800">🚲 <span className="text-green-600">{configTicket.nombre_taller}</span> POS</h1>
            </div>
            <button onClick={() => setMostrarModalCaja(true)} className="text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors font-medium shadow-sm">💰 Caja</button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3"><p className="text-xs text-gray-600">Ventas Hoy</p><p className="text-xl font-bold text-gray-900">{metricaVentasHoy}</p></div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3"><p className="text-xs text-gray-600">Total Hoy</p><p className="text-xl font-bold text-green-600">${metricaTotalHoy.toFixed(2)}</p></div>
            <div
              className={`bg-white rounded-xl shadow-sm border p-3 cursor-pointer transition-all ${
                filtroStockBajo ? "border-orange-500 bg-orange-50 shadow-md" : "border-gray-200"
              }`}
              onClick={() => {
                setFiltroStockBajo(!filtroStockBajo);
                setCategoriaActiva(null);
                setBusqueda("");
              }}
            >
              <p className="text-xs text-gray-600">Stock Bajo</p>
              <p className="text-xl font-bold text-orange-600">{metricaStockBajo}</p>
              {filtroStockBajo && <p className="text-xs text-orange-500 mt-1 font-medium">Mostrando bajo stock</p>}
            </div>
          </div>

          {filtroStockBajo && (
            <div className="mb-4 px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
              <span className="text-sm text-orange-800 font-medium">🔍 Mostrando productos con stock bajo (≤5)</span>
              <button
                onClick={() => setFiltroStockBajo(false)}
                className="text-xs text-orange-700 hover:text-orange-900 underline"
              >
                Quitar filtro
              </button>
            </div>
          )}

          {mensaje && <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${mensaje.tipo === "exito" ? "bg-green-100 text-green-900 border border-green-300" : "bg-red-100 text-red-900 border border-red-300"}`}>{mensaje.texto}</div>}

          <div className="relative mb-4">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">🔍</span>
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, SKU o código de barras..." className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl shadow-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition" />
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => setCategoriaActiva(null)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${categoriaActiva === null ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>Todos</button>
            {categorias.map(cat => <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${categoriaActiva === cat.id ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>{cat.nombre}</button>)}
          </div>

          <div className="flex-1">
            {cargando && <div className="text-center py-12 text-gray-800 animate-pulse">Buscando productos...</div>}
            {!cargando && resultados.length === 0 && busqueda.trim() === "" && !categoriaActiva && !filtroStockBajo && <div className="text-center py-16 text-gray-500"><p className="text-4xl mb-3">🔎</p><p className="text-lg">Busca un producto o selecciona una categoría</p></div>}
            {!cargando && resultados.length === 0 && (busqueda.trim() !== "" || categoriaActiva || filtroStockBajo) && <div className="text-center py-12 text-gray-800">No se encontraron productos.</div>}
            {resultados.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                {resultados.map(producto => (
                  <div key={producto.id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-green-300 transition-all duration-200 flex flex-col">
  <div className="h-24 bg-gray-100 rounded-t-lg flex items-center justify-center overflow-hidden">
    {producto.imagen_url ? <img src={producto.imagen_url} alt={producto.nombre} className="h-full w-full object-cover" /> : <span className="text-lg text-gray-300">📷</span>}
  </div>
  <div className="p-2.5 flex flex-col flex-1">
    <h3 className="font-medium text-gray-900 text-sm leading-tight truncate">{producto.nombre}</h3>
    <div className="mt-1.5 flex items-center justify-between">
      <span className="text-base font-bold text-green-600">${producto.precio.toFixed(2)}</span>
      <span className={`text-xs font-medium ${producto.stock > 5 ? "text-green-600" : producto.stock > 0 ? "text-orange-600" : "text-red-600"}`}>Stock: {producto.stock}</span>
    </div>
    <button onClick={() => agregarAlCarrito(producto)} disabled={producto.stock === 0} className={`mt-2 w-full py-1.5 rounded-md font-medium text-xs transition ${producto.stock === 0 ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white shadow-sm"}`}>{producto.stock === 0 ? "Agotado" : "Agregar al carrito"}</button>
  </div>
</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Carrito compacto */}
        <div className="lg:w-96 flex flex-col">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col" style={{ maxHeight: "calc(100vh - 8rem)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">🛒 Carrito</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setMostrarProductoComun(true)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg font-medium">+ Prod. común</button>
                {carrito.length > 0 && <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">{carrito.reduce((acc, item) => acc + item.cantidad, 0)}</span>}
              </div>
            </div>
            {carrito.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm py-8">Carrito vacío</div> : (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: "calc(100vh - 28rem)" }}>
                  {carrito.map(item => (
                    <div key={item.producto.id} className="flex items-center justify-between py-2 px-2 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0"><p className="font-medium text-gray-900 text-xs truncate">{item.producto.nombre}</p><p className="text-xs text-gray-500">${item.producto.precio.toFixed(2)} x {item.cantidad}</p></div>
                      <div className="flex items-center gap-2 ml-2"><span className="font-semibold text-gray-800 text-xs">${(item.producto.precio * item.cantidad).toFixed(2)}</span><button onClick={() => eliminarDelCarrito(item.producto.id)} className="text-gray-400 hover:text-red-500 text-sm">×</button></div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex items-center gap-2">
                    <select value={clienteSeleccionado} onChange={(e) => handleClienteChange(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white text-gray-900">
                      <option value="">Sin cliente</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.puntos} pts)</option>)}
                    </select>
                    <button type="button" onClick={() => setMostrarNuevoCliente(!mostrarNuevoCliente)} className="text-green-600 text-xs font-medium hover:underline whitespace-nowrap">+ Nuevo</button>
                  </div>
                  {mostrarNuevoCliente && (
                    <div className="mt-2 space-y-1 bg-gray-50 p-2 rounded-lg">
                      <input type="text" placeholder="Nombre" value={nuevoNombreCliente} onChange={(e) => setNuevoNombreCliente(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500" />
                      <input type="text" placeholder="Teléfono (opcional)" value={nuevoTelefonoCliente} onChange={(e) => setNuevoTelefonoCliente(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-gray-500" />
                      <button onClick={crearCliente} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">Guardar</button>
                    </div>
                  )}
                  {clienteSeleccionado && (
                    <div className="mt-2 bg-green-50 rounded-lg p-2 border border-green-200">
                      <div className="flex items-center justify-between text-xs"><span className="text-green-800 font-medium">Puntos: {clientePuntos}</span>{puntosACanjear > 0 && <span className="text-green-700">Descuento: -${descuentoPuntos.toFixed(2)}</span>}</div>
                      <div className="flex items-center gap-2 mt-1"><input type="number" min="0" max={clientePuntos} value={puntosACanjear || ""} onChange={(e) => handlePuntosCanjearChange(parseInt(e.target.value) || 0)} placeholder="Canjear pts" className="w-20 border border-gray-300 rounded px-1 py-0.5 text-xs" /><span className="text-xs text-gray-500">10 pts = $1</span></div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-2 mt-2">
                  {descuentoPuntos > 0 && <div className="flex justify-between text-xs text-green-700 mb-1"><span>Descuento puntos</span><span>-${descuentoPuntos.toFixed(2)}</span></div>}
                  <div className="flex justify-between items-center text-base font-bold mb-2"><span className="text-gray-800">Total</span><span className="text-green-600 text-lg">${total.toFixed(2)}</span></div>
                  <button onClick={abrirModalCobro} disabled={cobrando} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg text-sm shadow-sm disabled:opacity-50 transition-colors">{cobrando ? "Procesando..." : `Cobrar $${total.toFixed(2)}`}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Producto Común */}
        {mostrarProductoComun && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Producto común (sin inventario)</h3>
              <div className="space-y-3">
                <div><label className="block text-sm font-semibold text-gray-900 mb-1">Nombre</label><input type="text" value={productoComunNombre} onChange={(e) => setProductoComunNombre(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" placeholder="Ej: Reparación exprés" /></div>
                <div><label className="block text-sm font-semibold text-gray-900 mb-1">Precio</label><input type="text" inputMode="decimal" value={productoComunPrecio} onChange={(e) => { const val = e.target.value; if (val === "" || /^\d*\.?\d*$/.test(val)) setProductoComunPrecio(val); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" placeholder="0.00" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
                <button onClick={() => setMostrarProductoComun(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium transition">Cancelar</button>
                <button onClick={agregarProductoComun} disabled={!productoComunNombre.trim() || parseFloat(productoComunPrecio) <= 0} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50">Agregar al carrito</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de pago */}
        {mostrarModalPago && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg border border-gray-200 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Método de pago</h3>
              <p className="text-gray-800 mb-4">Total a cobrar: <span className="text-green-600 font-bold text-lg">${total.toFixed(2)}</span></p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(["efectivo", "tarjeta", "transferencia", "credito", "mixto"] as MetodoPago[]).map(metodo => (
                  <button key={metodo} onClick={() => cambiarMetodo(metodo)} className={`p-3 rounded-lg text-sm font-medium capitalize transition border ${metodoSeleccionado === metodo ? "border-green-500 bg-green-50 text-green-800 shadow-sm" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"}`}>
                    {metodo === "efectivo" && "💵 "}{metodo === "tarjeta" && "💳 "}{metodo === "transferencia" && "🏦 "}{metodo === "credito" && "👤 "}{metodo === "mixto" && "🔄 "}{metodo}
                  </button>
                ))}
              </div>
              {metodoSeleccionado === "efectivo" && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-900">Monto recibido</label>
                  <input type="number" min="0" step="0.01" value={montoRecibido || ""} onChange={(e) => setMontoRecibido(parseFloat(e.target.value) || 0)} placeholder="Ingrese el monto entregado" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-green-400 focus:border-transparent" />
                  {montoRecibido > 0 && <div className={`text-sm font-medium ${montoRecibido >= total ? "text-green-700" : "text-red-600"}`}>{montoRecibido >= total ? `Cambio: $${(montoRecibido - total).toFixed(2)}` : `Faltan: $${(total - montoRecibido).toFixed(2)}`}</div>}
                </div>
              )}
              {metodoSeleccionado === "credito" && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-900">Cliente a crédito</label>
                  <select value={clienteSeleccionado} onChange={(e) => handleClienteChange(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900">
                    <option value="">-- Elegir --</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              )}
              {metodoSeleccionado === "mixto" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-800 font-medium">Distribuye el pago. Suma = ${total.toFixed(2)}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-gray-200 bg-white"><div className="flex items-center gap-2 mb-2"><span className="text-xl">💵</span><p className="font-semibold text-gray-900 text-sm">Efectivo</p></div><input type="number" min="0" step="0.01" value={pagosMixto.efectivo || ""} onChange={(e) => setPagosMixto(prev => ({ ...prev, efectivo: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400" /></div>
                    <div className="p-3 rounded-xl border border-gray-200 bg-white"><div className="flex items-center gap-2 mb-2"><span className="text-xl">💳</span><p className="font-semibold text-gray-900 text-sm">Tarjeta</p></div><input type="number" min="0" step="0.01" value={pagosMixto.tarjeta || ""} onChange={(e) => setPagosMixto(prev => ({ ...prev, tarjeta: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400" /></div>
                    <div className="p-3 rounded-xl border border-gray-200 bg-white"><div className="flex items-center gap-2 mb-2"><span className="text-xl">🏦</span><p className="font-semibold text-gray-900 text-sm">Transferencia</p></div><input type="number" min="0" step="0.01" value={pagosMixto.transferencia || ""} onChange={(e) => setPagosMixto(prev => ({ ...prev, transferencia: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400" /></div>
                    <div className="p-3 rounded-xl border border-gray-200 bg-white"><div className="flex items-center gap-2 mb-2"><span className="text-xl">👤</span><p className="font-semibold text-gray-900 text-sm">Crédito</p></div><input type="number" min="0" step="0.01" value={pagosMixto.credito || ""} onChange={(e) => setPagosMixto(prev => ({ ...prev, credito: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 mb-2" />{pagosMixto.credito > 0 && (<select value={pagosMixto.clienteCredito} onChange={(e) => setPagosMixto(prev => ({ ...prev, clienteCredito: e.target.value }))} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white text-gray-900"><option value="">-- Cliente --</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>)}</div>
                  </div>
                  <div className="flex justify-between items-center bg-gray-100 rounded-lg p-3"><span className="text-sm font-medium text-gray-700">Suma</span><span className={`text-lg font-bold ${Math.abs(sumaPagosMixto - total) < 0.01 ? "text-green-600" : "text-red-600"}`}>${sumaPagosMixto.toFixed(2)} / ${total.toFixed(2)}</span></div>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
                <button onClick={() => setMostrarModalPago(false)} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">Cancelar</button>
                <button onClick={confirmarCobro} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition">Confirmar cobro</button>
              </div>
            </div>
          </div>
        )}

        {/* Ticket */}
        {ticketData && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto ticket-print">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">🧾 Comprobante de Venta</h2>
                <p className="text-sm text-gray-800 font-medium">{configTicket.nombre_taller}</p>
                {sucursalActiva && <p className="text-xs text-gray-600">{sucursalActiva.nombre}</p>}
                {configTicket.direccion && <p className="text-xs text-gray-600">{configTicket.direccion}</p>}
                {configTicket.telefono && <p className="text-xs text-gray-600">{configTicket.telefono}</p>}
                <p className="text-sm text-gray-900 mt-1">#{ticketData.ventaId.slice(0, 8)}</p>
                <p className="text-sm text-gray-800">{new Date(ticketData.fecha).toLocaleString("es-MX")}</p>
              </div>
              <div className="border-t border-dashed border-gray-400 pt-3 mb-3">
                {ticketData.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1 text-gray-900"><span className="font-medium">{item.producto.nombre} x{item.cantidad}</span><span className="font-semibold">${(item.producto.precio * item.cantidad).toFixed(2)}</span></div>
                ))}
              </div>
              {ticketData.descuentoPuntos > 0 && <div className="flex justify-between text-sm text-green-700 font-medium py-1"><span>Descuento por puntos</span><span>-${ticketData.descuentoPuntos.toFixed(2)}</span></div>}
              <div className="border-t border-dashed border-gray-400 pt-2 mt-2 space-y-2 text-sm">
                <div className="flex justify-between font-bold text-base text-gray-900"><span>Total</span><span>${ticketData.total.toFixed(2)}</span></div>
                <div className="flex justify-between text-gray-800"><span>Método</span><span className="capitalize font-medium">{ticketData.metodoPago}</span></div>
                {ticketData.montoRecibido !== undefined && <div className="flex justify-between text-gray-800"><span>Recibido</span><span className="font-medium">${ticketData.montoRecibido.toFixed(2)}</span></div>}
                {ticketData.cambio !== undefined && ticketData.cambio >= 0 && <div className="flex justify-between text-gray-800"><span>Cambio</span><span className="font-medium">${ticketData.cambio.toFixed(2)}</span></div>}
                {ticketData.pagosParciales && ticketData.pagosParciales.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-gray-900 mb-1">Desglose mixto:</p>
                    {ticketData.pagosParciales.map((p, i) => (
                      <div key={i} className="flex justify-between text-sm text-gray-800"><span className="capitalize">{p.metodo}</span><span>${p.monto.toFixed(2)}</span>{p.cliente_id && <span className="text-xs text-gray-500 ml-2">({clientes.find(c => c.id === p.cliente_id)?.nombre || ""})</span>}</div>
                    ))}
                  </div>
                )}
                {ticketData.clienteId && <div className="flex justify-between text-gray-800"><span>Cliente</span><span className="font-medium">{clientes.find(c => c.id === ticketData.clienteId)?.nombre || "—"}</span></div>}
                {ticketData.puntosGanados > 0 && <div className="flex justify-between text-green-700 font-medium"><span>Puntos ganados</span><span>+{ticketData.puntosGanados}</span></div>}
                {ticketData.puntosCanjeados > 0 && <div className="flex justify-between text-orange-700"><span>Puntos canjeados</span><span>-{ticketData.puntosCanjeados}</span></div>}
              </div>
              <p className="text-center mt-3 text-sm text-gray-800 font-medium">{configTicket.mensaje_ticket}</p>
              <div className="mt-4 border-t border-gray-300 pt-4 no-print">
                <label className="block text-sm font-medium text-gray-900 mb-1">Enviar por WhatsApp</label>
                <div className="flex gap-2">
                  <input type="text" value={whatsappNumero} onChange={(e) => setWhatsappNumero(e.target.value)} placeholder="Número de teléfono (10 dígitos)" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" />
                  <button onClick={enviarWhatsApp} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1">💬 Enviar</button>
                </div>
                <p className="text-xs text-gray-700 mt-1">Se abrirá WhatsApp con el mensaje listo.</p>
              </div>
              <div className="flex gap-2 mt-3 no-print">
                <button onClick={imprimirTicket} className="flex-1 bg-gray-800 hover:bg-gray-900 text-white py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-1">🖨️ Imprimir</button>
                <button onClick={cerrarTicket} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2.5 rounded-lg font-medium transition">Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Caja */}
        {mostrarModalCaja && <CajaModal onClose={() => setMostrarModalCaja(false)} sucursalId={sucursalId} />}
      </div>
    </>
  );
}

// Envolver en Suspense para useSearchParams
export default function PosPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Cargando POS...</div>}>
      <PosPage />
    </Suspense>
  );
}