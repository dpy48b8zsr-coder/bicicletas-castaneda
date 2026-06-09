// @ts-nocheck
"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useBranch } from "@/context/BranchContext";

interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  costo: number;
  stock: number;
  categoria_id: string | null;
  imagen_url: string | null;
  sku: string | null;
  codigo_barras: string | null;
}

interface Categoria {
  id: string;
  nombre: string;
}

export default function ProductosPage() {
  const { sucursalActiva } = useBranch();
  const sucursalId = sucursalActiva?.id;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");

  // Ordenación
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const productosPorPagina = 12;

  // Modal de producto
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    precio: 0,
    costo: 0,
    stock: 0,
    categoria_id: "",
    imagen_url: "",
    sku: "",
    codigo_barras: "",
  });
  const [precioStr, setPrecioStr] = useState("");
  const [costoStr, setCostoStr] = useState("");
  const [stockStr, setStockStr] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [archivoImagen, setArchivoImagen] = useState<File | null>(null);
  const [previewImagen, setPreviewImagen] = useState<string | null>(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const [mostrarNuevaCategoria, setMostrarNuevaCategoria] = useState(false);
  const [nombreNuevaCategoria, setNombreNuevaCategoria] = useState("");
  const [guardandoCategoria, setGuardandoCategoria] = useState(false);

  // Gestión de categorías
  const [mostrarGestionCategorias, setMostrarGestionCategorias] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<Categoria | null>(null);
  const [nuevoNombreCat, setNuevoNombreCat] = useState("");
  const [eliminandoCatId, setEliminandoCatId] = useState<string | null>(null);

  // Mensajes
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  const cargarDatos = async () => {
    setCargando(true);
    const [resProductos, resCategorias] = await Promise.all([
      supabase.from("productos").select("*").eq("sucursal_id", sucursalId).eq("activo", true).order("nombre"),
      supabase.from("categorias").select("*").order("nombre"),
    ]);
    if (resProductos.data) setProductos(resProductos.data);
    if (resCategorias.data) setCategorias(resCategorias.data);
    setCargando(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [sucursalId]);

  // Filtrado y ordenación
  const productosFiltrados = useMemo(() => {
    let lista = productos.filter((p) => {
      const matchNombre = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
      const matchCategoria = !filtroCategoria || p.categoria_id === filtroCategoria;
      return matchNombre && matchCategoria;
    });

    if (sortField) {
      lista.sort((a: any, b: any) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === "stock" || sortField === "precio" || sortField === "costo") {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        } else if (sortField === "sku") {
          valA = (valA || "").toString().toLowerCase();
          valB = (valB || "").toString().toLowerCase();
        } else {
          valA = (valA || "").toString().toLowerCase();
          valB = (valB || "").toString().toLowerCase();
        }
        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return lista;
  }, [productos, busqueda, filtroCategoria, sortField, sortDir]);

  // Calcular total de páginas y productos de la página actual
  const totalPaginas = Math.ceil(productosFiltrados.length / productosPorPagina);
  const inicio = (paginaActual - 1) * productosPorPagina;
  const productosPaginados = productosFiltrados.slice(inicio, inicio + productosPorPagina);

  // Reiniciar a página 1 cuando cambian los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroCategoria]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortArrow = (field: string) => {
    if (sortField !== field) return <span className="text-gray-400 ml-1">⇅</span>;
    return sortDir === "asc" ? <span className="text-green-600 ml-1">▲</span> : <span className="text-green-600 ml-1">▼</span>;
  };

  const abrirNuevo = () => {
    setEditandoId(null);
    setFormData({
      nombre: "",
      descripcion: "",
      precio: 0,
      costo: 0,
      stock: 0,
      categoria_id: categorias[0]?.id || "",
      imagen_url: "",
      sku: "",
      codigo_barras: "",
    });
    setPrecioStr("0");
    setCostoStr("0");
    setStockStr("0");
    setArchivoImagen(null);
    setPreviewImagen(null);
    setMostrarNuevaCategoria(false);
    setNombreNuevaCategoria("");
    setMensaje(null);
    setMostrarFormulario(true);
  };

  const abrirEditar = (producto: Producto) => {
    setEditandoId(producto.id);
    setFormData({
      nombre: producto.nombre,
      descripcion: producto.descripcion || "",
      precio: producto.precio,
      costo: producto.costo || 0,
      stock: producto.stock,
      categoria_id: producto.categoria_id || "",
      imagen_url: producto.imagen_url || "",
      sku: producto.sku || "",
      codigo_barras: producto.codigo_barras || "",
    });
    setPrecioStr(producto.precio.toString());
    setCostoStr((producto.costo || 0).toString());
    setStockStr(producto.stock.toString());
    setArchivoImagen(null);
    setPreviewImagen(producto.imagen_url);
    setMostrarNuevaCategoria(false);
    setNombreNuevaCategoria("");
    setMensaje(null);
    setMostrarFormulario(true);
  };

  const cerrarFormulario = () => {
    setMostrarFormulario(false);
    setEditandoId(null);
  };

  const handleArchivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setArchivoImagen(archivo);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewImagen(event.target?.result as string);
    };
    reader.readAsDataURL(archivo);
  };

  const subirImagen = async (): Promise<string | null> => {
    if (!archivoImagen) return formData.imagen_url;
    setSubiendoImagen(true);
    const extension = archivoImagen.name.split(".").pop();
    const nombreArchivo = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`;
    const filePath = `${nombreArchivo}`;
    const { data, error } = await supabase.storage
      .from("productos")
      .upload(filePath, archivoImagen, { cacheControl: "3600", upsert: false });
    setSubiendoImagen(false);
    if (error) {
      alert("Error al subir imagen: " + error.message);
      return null;
    }
    const { data: urlData } = supabase.storage.from("productos").getPublicUrl(filePath);
    return urlData?.publicUrl || null;
  };

  const crearCategoriaRapida = async () => {
    if (!nombreNuevaCategoria.trim()) return;
    setGuardandoCategoria(true);
    const { data, error } = await supabase
      .from("categorias")
      .insert({ nombre: nombreNuevaCategoria.trim() })
      .select("id, nombre")
      .single();
    if (data) {
      setCategorias([...categorias, data]);
      setFormData({ ...formData, categoria_id: data.id });
      setNombreNuevaCategoria("");
      setMostrarNuevaCategoria(false);
    } else {
      alert("Error al crear categoría");
    }
    setGuardandoCategoria(false);
  };

  const guardarProducto = async () => {
    if (!formData.nombre.trim()) {
      setMensaje({ tipo: "error", texto: "El nombre es obligatorio." });
      return;
    }

    // Validación de duplicados
    const nombreTrim = formData.nombre.trim();
    const skuTrim = formData.sku.trim() || null;
    const codBarrasTrim = formData.codigo_barras.trim() || null;

    let duplicado = false;
    let campoDuplicado = "";

    if (nombreTrim) {
      let query = supabase.from("productos").select("id").eq("nombre", nombreTrim).eq("sucursal_id", sucursalId).eq("activo", true);
      if (editandoId) query = query.neq("id", editandoId);
      const { data: nombreData } = await query.limit(1);
      if (nombreData && nombreData.length > 0) { duplicado = true; campoDuplicado = "nombre"; }
    }

    if (!duplicado && skuTrim) {
      let query = supabase.from("productos").select("id").eq("sku", skuTrim).eq("sucursal_id", sucursalId).eq("activo", true);
      if (editandoId) query = query.neq("id", editandoId);
      const { data: skuData } = await query.limit(1);
      if (skuData && skuData.length > 0) { duplicado = true; campoDuplicado = "SKU"; }
    }

    if (!duplicado && codBarrasTrim) {
      let query = supabase.from("productos").select("id").eq("codigo_barras", codBarrasTrim).eq("sucursal_id", sucursalId).eq("activo", true);
      if (editandoId) query = query.neq("id", editandoId);
      const { data: codData } = await query.limit(1);
      if (codData && codData.length > 0) { duplicado = true; campoDuplicado = "código de barras"; }
    }

    if (duplicado) {
      setMensaje({ tipo: "error", texto: `Ya existe un producto con ese ${campoDuplicado}.` });
      return;
    }

    setGuardando(true);
    setMensaje(null);

    let imagenUrl = formData.imagen_url;
    if (archivoImagen) {
      const urlSubida = await subirImagen();
      if (urlSubida) imagenUrl = urlSubida;
      else { setGuardando(false); return; }
    }
    const precio = parseFloat(precioStr) || 0;
    const costo = parseFloat(costoStr) || 0;
    const stock = editandoId ? formData.stock : 0;

    const datos = {
      nombre: nombreTrim,
      descripcion: formData.descripcion.trim() || null,
      precio,
      costo,
      stock,
      categoria_id: formData.categoria_id || null,
      imagen_url: imagenUrl || null,
      sku: skuTrim,
      codigo_barras: codBarrasTrim,
      sucursal_id: sucursalId,
    };
    if (editandoId) {
      await supabase.from("productos").update(datos).eq("id", editandoId);
    } else {
      await supabase.from("productos").insert({ ...datos, tipo: "producto_simple", activo: true });
    }
    setGuardando(false);
    cerrarFormulario();
    cargarDatos();
  };

  const eliminarProducto = async (id: string) => {
    await supabase.from("productos").update({ activo: false }).eq("id", id);
    setEliminandoId(null);
    cargarDatos();
  };

  // Gestión de categorías
  const abrirGestionCategorias = () => {
    setCategoriaEditando(null);
    setNuevoNombreCat("");
    setMostrarGestionCategorias(true);
  };

  const guardarCategoriaEditada = async () => {
    if (!categoriaEditando || !nuevoNombreCat.trim()) return;
    await supabase.from("categorias").update({ nombre: nuevoNombreCat.trim() }).eq("id", categoriaEditando.id);
    setCategoriaEditando(null);
    setNuevoNombreCat("");
    cargarDatos();
  };

  const agregarNuevaCategoria = async () => {
    if (!nuevoNombreCat.trim()) return;
    await supabase.from("categorias").insert({ nombre: nuevoNombreCat.trim() });
    setNuevoNombreCat("");
    cargarDatos();
  };

  const eliminarCategoria = async (id: string) => {
    await supabase.from("categorias").delete().eq("id", id);
    setEliminandoCatId(null);
    cargarDatos();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">📦 Productos</h1>
        <div className="flex gap-2">
          <button
            onClick={abrirGestionCategorias}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
          >
            Gestionar categorías
          </button>
          <button
            onClick={abrirNuevo}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
          >
            + Nuevo Producto
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-semibold text-gray-900 mb-1">Buscar</label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre del producto..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-1">Categoría</label>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
          >
            <option value="">Todas</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla de productos (escritorio) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hidden md:block">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando productos...</p>
        ) : productosPaginados.length === 0 ? (
          <p className="p-4 text-gray-800">No se encontraron productos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Imagen</th>
                  <th
                    className="px-4 py-3 text-left font-semibold text-gray-900 cursor-pointer select-none"
                    onClick={() => toggleSort("nombre")}
                  >
                    Nombre {renderSortArrow("nombre")}
                  </th>
                  <th
                    className="px-4 py-3 text-left font-semibold text-gray-900 cursor-pointer select-none"
                    onClick={() => toggleSort("sku")}
                  >
                    SKU {renderSortArrow("sku")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">C. Barras</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Precio</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Costo</th>
                  <th
                    className="px-4 py-3 text-left font-semibold text-gray-900 cursor-pointer select-none"
                    onClick={() => toggleSort("stock")}
                  >
                    Stock {renderSortArrow("stock")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Categoría</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {productosPaginados.map((producto) => (
                  <tr key={producto.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {producto.imagen_url ? (
                        <img src={producto.imagen_url} alt={producto.nombre} className="h-10 w-10 object-cover rounded-md" />
                      ) : (
                        <div className="h-10 w-10 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs">Sin img</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{producto.nombre}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{producto.sku || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{producto.codigo_barras || "—"}</td>
                    <td className="px-4 py-3 text-green-700 font-semibold">${producto.precio.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-800">${(producto.costo || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${producto.stock > 5 ? "text-green-600" : producto.stock > 0 ? "text-orange-600" : "text-red-600"}`}>
                        {producto.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {categorias.find(c => c.id === producto.categoria_id)?.nombre || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirEditar(producto)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => setEliminandoId(producto.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-medium transition-colors"
                        >
                          🗑️ Desactivar
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
          <p className="text-center text-gray-800 py-12">Cargando productos...</p>
        ) : productosPaginados.length === 0 ? (
          <p className="text-center text-gray-800 py-12">No se encontraron productos.</p>
        ) : (
          productosPaginados.map((producto) => (
            <div key={producto.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  {producto.imagen_url ? (
                    <img src={producto.imagen_url} alt={producto.nombre} className="h-16 w-16 object-cover rounded-lg" />
                  ) : (
                    <div className="h-16 w-16 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">Sin img</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{producto.nombre}</h3>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span>SKU: {producto.sku || "—"}</span>
                    <span>C. Barras: {producto.codigo_barras || "—"}</span>
                    <span className="font-medium text-green-700">${producto.precio.toFixed(2)}</span>
                    <span>Costo: ${(producto.costo || 0).toFixed(2)}</span>
                    <span className={`font-medium ${producto.stock > 5 ? "text-green-600" : producto.stock > 0 ? "text-orange-600" : "text-red-600"}`}>Stock: {producto.stock}</span>
                    <span>Categoría: {categorias.find(c => c.id === producto.categoria_id)?.nombre || "—"}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => abrirEditar(producto)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => setEliminandoId(producto.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-medium transition-colors"
                    >
                      🗑️ Desactivar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
            disabled={paginaActual === 1}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            ← Anterior
          </button>
          <div className="flex gap-1">
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => setPaginaActual(num)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                  paginaActual === num
                    ? "bg-green-600 text-white shadow-sm"
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
            disabled={paginaActual === totalPaginas}
            className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Modal de formulario */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar Producto" : "Nuevo Producto"}
            </h2>

            {mensaje && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${mensaje.tipo === "exito" ? "bg-green-100 text-green-900 border border-green-300" : "bg-red-100 text-red-900 border border-red-300"}`}>
                {mensaje.texto}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                    placeholder="Ej: Bicicleta Urbana"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">SKU</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                    placeholder="Ej: BICI-URB-001"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Código de barras</label>
                <input
                  type="text"
                  value={formData.codigo_barras}
                  onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                  placeholder="Ej: 7501234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Descripción</label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                  rows={2}
                  placeholder="Descripción breve..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Precio *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={precioStr}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setPrecioStr(val);
                        setFormData({ ...formData, precio: parseFloat(val) || 0 });
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Costo</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={costoStr}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d*\.?\d*$/.test(val)) {
                        setCostoStr(val);
                        setFormData({ ...formData, costo: parseFloat(val) || 0 });
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Stock (solo lectura)</label>
                  <input
                    type="text"
                    value={formData.stock}
                    readOnly
                    disabled
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-100 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">Se modifica mediante ventas o Inventario.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1">Categoría</label>
                  <select
                    value={formData.categoria_id}
                    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
                  >
                    <option value="">-- Sin categoría --</option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                  </select>
                  {!mostrarNuevaCategoria && (
                    <button
                      type="button"
                      onClick={() => setMostrarNuevaCategoria(true)}
                      className="text-green-600 text-xs font-medium hover:underline mt-1"
                    >
                      + Nueva categoría
                    </button>
                  )}
                  {mostrarNuevaCategoria && (
                    <div className="mt-2 flex gap-2 items-center">
                      <input
                        type="text"
                        value={nombreNuevaCategoria}
                        onChange={(e) => setNombreNuevaCategoria(e.target.value)}
                        placeholder="Nombre categoría"
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-500"
                      />
                      <button
                        onClick={crearCategoriaRapida}
                        disabled={guardandoCategoria || !nombreNuevaCategoria.trim()}
                        className="bg-green-600 text-white px-2 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                      >
                        {guardandoCategoria ? "..." : "Crear"}
                      </button>
                      <button
                        onClick={() => setMostrarNuevaCategoria(false)}
                        className="text-gray-500 hover:text-gray-700 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Imagen</label>
                <div className="flex items-start gap-4">
                  {previewImagen && (
                    <img
                      src={previewImagen}
                      alt="Vista previa"
                      className="h-24 w-24 object-cover rounded-lg border border-gray-200"
                    />
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleArchivoChange}
                      className="w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {archivoImagen
                        ? `Archivo seleccionado: ${archivoImagen.name}`
                        : editandoId
                        ? "Selecciona una imagen para cambiar la actual"
                        : "Selecciona una imagen para el producto"}
                    </p>
                  </div>
                </div>
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
                onClick={guardarProducto}
                disabled={guardando || !formData.nombre.trim()}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50"
              >
                {guardando || subiendoImagen ? "Guardando..." : editandoId ? "Actualizar" : "Crear Producto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gestión de categorías (modal) */}
      {mostrarGestionCategorias && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Gestionar Categorías</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={nuevoNombreCat}
                onChange={(e) => setNuevoNombreCat(e.target.value)}
                placeholder="Nueva categoría"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
              />
              <button
                onClick={agregarNuevaCategoria}
                disabled={!nuevoNombreCat.trim()}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
            <div className="space-y-2">
              {categorias.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  {categoriaEditando?.id === cat.id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        type="text"
                        value={nuevoNombreCat}
                        onChange={(e) => setNuevoNombreCat(e.target.value)}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <button
                        onClick={guardarCategoriaEditada}
                        className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setCategoriaEditando(null)}
                        className="text-gray-500 text-xs hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-gray-900 font-medium text-sm">{cat.nombre}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setCategoriaEditando(cat);
                            setNuevoNombreCat(cat.nombre);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setEliminandoCatId(cat.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setMostrarGestionCategorias(false)}
                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación eliminar categoría */}
      {eliminandoCatId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar categoría?</h3>
            <p className="text-gray-700 mb-4">Los productos en esta categoría se quedarán sin categoría.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEliminandoCatId(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminarCategoria(eliminandoCatId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación desactivar producto */}
      {eliminandoId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Desactivar producto?</h3>
            <p className="text-gray-700 mb-4">El producto se ocultará del inventario pero se conservará el historial de ventas.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEliminandoId(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminarProducto(eliminandoId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}