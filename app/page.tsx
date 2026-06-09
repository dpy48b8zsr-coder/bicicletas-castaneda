// @ts-nocheck
"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// ============ Contexto del carrito (sin cambios) ============
interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  imagen_url: string | null;
  categoria_id: string | null;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

interface CartContextType {
  carrito: ItemCarrito[];
  agregarAlCarrito: (producto: Producto) => void;
  eliminarDelCarrito: (id: string) => void;
  vaciarCarrito: () => void;
  total: number;
}

const CartContext = createContext<CartContextType>({
  carrito: [],
  agregarAlCarrito: () => {},
  eliminarDelCarrito: () => {},
  vaciarCarrito: () => {},
  total: 0,
});

function useCarrito() {
  return useContext(CartContext);
}

function CartProvider({ children }: { children: React.ReactNode }) {
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("carrito");
    if (saved) {
      try { setCarrito(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("carrito", JSON.stringify(carrito));
  }, [carrito]);

  const agregarAlCarrito = (producto: Producto) => {
    if (producto.stock === 0) return;
    setCarrito(prev => {
      const existe = prev.find(item => item.producto.id === producto.id);
      if (existe) {
        if (existe.cantidad < producto.stock)
          return prev.map(item => item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item);
        return prev;
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const eliminarDelCarrito = (id: string) => {
    setCarrito(prev => prev.filter(item => item.producto.id !== id));
  };

  const vaciarCarrito = () => setCarrito([]);

  const total = carrito.reduce((sum, item) => sum + item.producto.precio * item.cantidad, 0);

  return (
    <CartContext.Provider value={{ carrito, agregarAlCarrito, eliminarDelCarrito, vaciarCarrito, total }}>
      {children}
    </CartContext.Provider>
  );
}

// ============ Componente principal ============
export default function TiendaPage() {
  return (
    <CartProvider>
      <TiendaContent />
    </CartProvider>
  );
}

function TiendaContent() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarCarrito, setMostrarCarrito] = useState(false);
  const { carrito, agregarAlCarrito, eliminarDelCarrito, vaciarCarrito, total } = useCarrito();

  // Sucursales para tienda pública
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalId, setSucursalId] = useState<string>("");

  // Modal para datos del cliente
  const [mostrarModalDatos, setMostrarModalDatos] = useState(false);
  const [nombreCliente, setNombreCliente] = useState("");
  const [telefonoCliente, setTelefonoCliente] = useState("");

  // Animación de agregar
  const [animandoId, setAnimandoId] = useState<string | null>(null);

  useEffect(() => {
    const cargarSucursales = async () => {
      const { data } = await supabase.from("sucursales").select("*").eq("activo", true).order("nombre");
      if (data && data.length > 0) {
        setSucursales(data);
        const savedId = localStorage.getItem("sucursalTienda");
        if (savedId && data.find((s: any) => s.id === savedId)) {
          setSucursalId(savedId);
        } else {
          setSucursalId(data[0].id);
          localStorage.setItem("sucursalTienda", data[0].id);
        }
      }
    };
    cargarSucursales();
  }, []);

  useEffect(() => {
    if (!sucursalId) return;
    const cargarDatos = async () => {
      setCargando(true);
      const [{ data: prods }, { data: cats }] = await Promise.all([
        supabase.from("productos").select("*").eq("sucursal_id", sucursalId).eq("activo", true).order("nombre"),
        supabase.from("categorias").select("*").order("nombre"),
      ]);
      if (prods) setProductos(prods);
      if (cats) setCategorias(cats);
      setCargando(false);
    };
    cargarDatos();
  }, [sucursalId]);

  const productosFiltrados = productos.filter(p => {
    const matchNombre = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    const matchCat = !categoriaActiva || p.categoria_id === categoriaActiva;
    return matchNombre && matchCat;
  });

  const handleSucursalChange = (id: string) => {
    setSucursalId(id);
    localStorage.setItem("sucursalTienda", id);
  };

  const abrirWhatsApp = () => {
    if (carrito.length === 0) return;
    setMostrarModalDatos(true);
  };

  const confirmarPedido = async () => {
    if (!nombreCliente.trim()) {
      alert("Por favor ingresa tu nombre.");
      return;
    }
    const { data: config } = await supabase.from("configuracion").select("telefono").eq("id", 1).single();
    const numeroTaller = config?.telefono || "521234567890";
    let numero = numeroTaller.replace(/[\s\-\(\)]/g, "");
    if (numero.startsWith("52") && numero.length > 10) {} else if (numero.length === 10) numero = "52" + numero;

    let mensaje = `🧾 *Nuevo pedido de Bicicletas Castañeda*\n--------------------------------\n`;
    carrito.forEach(item => {
      mensaje += `• ${item.producto.nombre} x${item.cantidad} = $${(item.producto.precio * item.cantidad).toFixed(2)}\n`;
    });
    mensaje += `--------------------------------\n*Total: $${total.toFixed(2)}*\n\n*Datos del cliente:*\nNombre: ${nombreCliente.trim()}\n`;
    if (telefonoCliente.trim()) mensaje += `Teléfono: ${telefonoCliente.trim()}\n`;

    const itemsParaGuardar = carrito.map(item => ({
      nombre: item.producto.nombre,
      cantidad: item.cantidad,
      precio: item.producto.precio,
    }));

    await supabase.from("pedidos_online").insert({
      cliente_nombre: nombreCliente.trim(),
      cliente_telefono: telefonoCliente.trim() || null,
      items: JSON.stringify(itemsParaGuardar),
      total: total,
      sucursal_id: sucursalId,
    });

    vaciarCarrito();
    setMostrarCarrito(false);
    setMostrarModalDatos(false);
    setNombreCliente("");
    setTelefonoCliente("");

    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const animarAgregar = (id: string) => {
    setAnimandoId(id);
    setTimeout(() => setAnimandoId(null), 500);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Encabezado estilo app */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-green-700">🚲 Bicicletas Castañeda</Link>
          <div className="flex items-center gap-4">
            {sucursales.length > 0 && (
              <select
                value={sucursalId}
                onChange={(e) => handleSucursalChange(e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-900"
              >
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            )}
            <Link href="/admin" className="text-sm text-gray-800 bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded-lg transition-colors font-medium">
              🔧 Admin
            </Link>
          </div>
        </div>
      </header>

      {/* Barra de búsqueda y chips de categorías */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full border border-gray-300 rounded-full px-5 py-3 text-sm text-gray-900 placeholder-gray-500 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2 no-scrollbar">
          <button
            onClick={() => setCategoriaActiva(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              !categoriaActiva ? "bg-green-600 text-white shadow" : "bg-white text-gray-700 border border-gray-300"
            }`}
          >
            Todos
          </button>
          {categorias.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoriaActiva(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                categoriaActiva === cat.id ? "bg-green-600 text-white shadow" : "bg-white text-gray-700 border border-gray-300"
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Productos */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        {cargando ? (
          <p className="text-center text-gray-800 py-12">Cargando productos...</p>
        ) : productosFiltrados.length === 0 ? (
          <p className="text-center text-gray-800 py-12">No se encontraron productos.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {productosFiltrados.map(producto => (
              <div key={producto.id} className="bg-white rounded-2xl shadow-sm border hover:shadow-md transition overflow-hidden flex flex-col">
                <div className="h-40 bg-gray-100 flex items-center justify-center">
                  {producto.imagen_url ? (
                    <img src={producto.imagen_url} alt={producto.nombre} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-4xl text-gray-300">📷</span>
                  )}
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <h3 className="font-semibold text-gray-900 text-sm truncate">{producto.nombre}</h3>
                  <span className="text-lg font-bold text-green-700 mt-1">${producto.precio.toFixed(2)}</span>
                  <span className="text-xs text-gray-500">Stock: {producto.stock}</span>
                  <button
                    onClick={() => { agregarAlCarrito(producto); animarAgregar(producto.id); }}
                    disabled={producto.stock === 0}
                    className={`mt-auto w-full py-2 rounded-xl text-sm font-medium transition-all ${
                      producto.stock === 0
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : animandoId === producto.id
                        ? "bg-green-400 text-white scale-95"
                        : "bg-green-600 hover:bg-green-700 text-white"
                    }`}
                  >
                    {producto.stock === 0 ? "Agotado" : animandoId === producto.id ? "¡Agregado!" : "Agregar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Barra inferior fija (tipo app) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-40 flex justify-around py-2 px-4">
        <button onClick={() => setCategoriaActiva(null)} className="flex flex-col items-center text-gray-500 hover:text-green-600 transition">
          <span className="text-xl">🏠</span>
          <span className="text-xs font-medium">Inicio</span>
        </button>
        <button onClick={() => setMostrarCarrito(!mostrarCarrito)} className="flex flex-col items-center text-gray-500 hover:text-green-600 transition relative">
          <span className="text-xl">🛒</span>
          <span className="text-xs font-medium">Carrito</span>
          {carrito.length > 0 && (
            <span className="absolute -top-1 -right-2 bg-green-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {carrito.reduce((acc, item) => acc + item.cantidad, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Carrito modal (pantalla completa en móvil) */}
      {mostrarCarrito && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-xl p-6 overflow-y-auto animate-slide-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">🛒 Carrito</h2>
              <button onClick={() => setMostrarCarrito(false)} className="text-gray-500 hover:text-gray-800 text-2xl">✕</button>
            </div>
            {carrito.length === 0 ? (
              <p className="text-gray-800 text-center py-12">Carrito vacío</p>
            ) : (
              <>
                <div className="space-y-3 flex-1">
                  {carrito.map(item => (
                    <div key={item.producto.id} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl">
                      <div>
                        <p className="font-medium text-gray-900">{item.producto.nombre}</p>
                        <p className="text-sm text-gray-600">${item.producto.precio.toFixed(2)} x {item.cantidad}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">${(item.producto.precio * item.cantidad).toFixed(2)}</span>
                        <button onClick={() => eliminarDelCarrito(item.producto.id)} className="text-red-500 hover:text-red-700">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4 mt-6">
                  <p className="text-lg font-bold text-gray-900">Total: ${total.toFixed(2)}</p>
                  <button onClick={abrirWhatsApp} className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg transition">
                    🛍️ Pedir por WhatsApp
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal datos del cliente (igual que antes) */}
      {mostrarModalDatos && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Datos para el pedido</h2>
            <p className="text-sm text-gray-600 mb-4">Completa tus datos para enviar el pedido por WhatsApp.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Nombre *</label>
                <input type="text" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" placeholder="Tu nombre" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Teléfono (opcional)</label>
                <input type="text" value={telefonoCliente} onChange={(e) => setTelefonoCliente(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500" placeholder="10 dígitos" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
              <button onClick={() => { setMostrarModalDatos(false); setNombreCliente(""); setTelefonoCliente(""); }} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">Cancelar</button>
              <button onClick={confirmarPedido} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition">Enviar pedido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}