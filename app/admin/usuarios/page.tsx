// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Usuario {
  id: string;
  email: string;
  rol: string;
  permissions: Record<string, boolean>;
}

const MODULOS = [
  { key: "venta", label: "Venta" },
  { key: "historial", label: "Historial" },
  { key: "productos", label: "Productos" },
  { key: "clientes", label: "Clientes" },
  { key: "presupuestos", label: "Presupuestos" },
  { key: "agendar_taller", label: "Agenda de Taller" },
  { key: "orden_taller", label: "Órdenes de Taller" },
  { key: "inventario", label: "Inventario" },
  { key: "pedidos_online", label: "Pedidos Online" },
  { key: "solicitudes", label: "Lista de Espera" },
  { key: "transferencias", label: "Transferencias" },
  { key: "usuarios", label: "Usuarios" },
  { key: "sucursales", label: "Sucursales" },
  { key: "configuracion", label: "Configuración" },
];

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("cajero");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [sucursalesAsignadas, setSucursalesAsignadas] = useState<string[]>([]);
  const [todasSucursales, setTodasSucursales] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargarUsuarios = async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/usuarios");
      const data = await res.json();
      if (Array.isArray(data)) {
        const usuariosParseados = data.map((u: any) => ({
          ...u,
          permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions || '{}') : (u.permissions || {}),
        }));
        setUsuarios(usuariosParseados);
      } else if (data.error) {
        setMensaje("Error: " + data.error);
      }
    } catch (err: any) {
      setMensaje("Error de conexión");
    } finally {
      setCargando(false);
    }
  };

  const cargarSucursales = async () => {
    const { data } = await supabase.from("sucursales").select("id, nombre").eq("activo", true).order("nombre");
    if (data) setTodasSucursales(data);
  };

  useEffect(() => {
    cargarUsuarios();
    cargarSucursales();
  }, []);

  const togglePermiso = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const abrirNuevo = () => {
    setEditandoId(null);
    setEmail("");
    setPassword("");
    setRol("cajero");
    setPermissions({});
    setSucursalesAsignadas([]);
    setMensaje(null);
    setMostrarForm(true);
  };

  const abrirEditar = async (usuario: Usuario) => {
    setEditandoId(usuario.id);
    setEmail(usuario.email);
    setPassword("");
    setRol(usuario.rol);
    let perms = usuario.permissions || {};
    if (typeof perms === "string") {
      try { perms = JSON.parse(perms); } catch { perms = {}; }
    }
    setPermissions(perms);

    // Cargar sucursales asignadas al usuario
    const { data: asignadas } = await supabase
      .from("usuarios_sucursales")
      .select("sucursal_id")
      .eq("user_id", usuario.id);
    setSucursalesAsignadas(asignadas?.map(a => a.sucursal_id) || []);

    setMensaje(null);
    setMostrarForm(true);
  };

  const guardarUsuario = async () => {
    if (!email.trim() || (!editandoId && !password.trim())) {
      setMensaje("Completa todos los campos.");
      return;
    }
    setGuardando(true);
    setMensaje(null);

    try {
      if (editandoId) {
        // Actualizar rol y permisos
        const { error: updateError } = await supabase
          .from("user_roles")
          .upsert({ id: editandoId, rol, permissions }, { onConflict: "id" });

        if (updateError) throw updateError;

        // Actualizar contraseña si se ingresó una nueva
        if (password.trim()) {
          const res = await fetch("/api/admin/usuarios", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editandoId, password: password.trim() }),
          });
          const data = await res.json();
          if (data.error) {
            setMensaje("Rol y permisos guardados, pero error al cambiar contraseña: " + data.error);
            setGuardando(false);
            return;
          }
        }

        // Actualizar asignaciones de sucursales
        await supabase.from("usuarios_sucursales").delete().eq("user_id", editandoId);
        if (sucursalesAsignadas.length > 0) {
          await supabase.from("usuarios_sucursales").insert(
            sucursalesAsignadas.map(sucId => ({ user_id: editandoId, sucursal_id: sucId }))
          );
        }

        setMensaje("Usuario actualizado correctamente.");
      } else {
        // Crear nuevo usuario
        const res = await fetch("/api/admin/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password: password.trim(), rol, permissions }),
        });
        const data = await res.json();
        if (data.error) {
          setMensaje("Error al crear: " + data.error);
          setGuardando(false);
          return;
        }

        // Asignar sucursales al nuevo usuario (data.user?.id o data.id según la API)
        const userId = data.user?.id || data.id;
        if (userId && sucursalesAsignadas.length > 0) {
          await supabase.from("usuarios_sucursales").insert(
            sucursalesAsignadas.map(sucId => ({ user_id: userId, sucursal_id: sucId }))
          );
        }

        setMensaje("Usuario creado correctamente.");
      }
      setMostrarForm(false);
      cargarUsuarios();
    } catch (err: any) {
      setMensaje("Error: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarUsuario = async (id: string) => {
    if (!confirm("¿Eliminar este usuario permanentemente?")) return;
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.error) {
        alert("Error: " + data.error);
      } else {
        cargarUsuarios();
      }
    } catch (err: any) {
      alert("Error de red.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">🛡️ Gestión de Usuarios</h1>
        <button
          onClick={abrirNuevo}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition"
        >
          + Nuevo Usuario
        </button>
      </div>

      {mensaje && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          mensaje.includes("Error") ? "bg-red-100 text-red-900 border border-red-300" : "bg-green-100 text-green-900 border border-green-300"
        }`}>
          {mensaje}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? (
          <p className="p-4 text-gray-800">Cargando usuarios...</p>
        ) : usuarios.length === 0 ? (
          <p className="p-4 text-gray-800">No hay usuarios registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Rol</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        u.rol === "admin" ? "bg-red-100 text-red-900" :
                        u.rol === "cajero" ? "bg-green-100 text-green-900" :
                        "bg-blue-100 text-blue-900"
                      }`}>{u.rol}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => abrirEditar(u)} className="text-blue-600 hover:text-blue-800 text-xs font-medium underline">Editar</button>
                        <button onClick={() => eliminarUsuario(u.id)} className="text-red-600 hover:text-red-800 text-xs font-medium underline">Eliminar</button>
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
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editandoId ? "Editar Usuario" : "Nuevo Usuario"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  disabled={!!editandoId}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">
                  {editandoId ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Rol</label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                >
                  <option value="admin">Administrador</option>
                  <option value="cajero">Cajero</option>
                  <option value="mecanico">Mecánico</option>
                </select>
              </div>

              {/* Sucursales asignadas */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Sucursales permitidas</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {todasSucursales.map(suc => (
                    <label key={suc.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={sucursalesAsignadas.includes(suc.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSucursalesAsignadas(prev => [...prev, suc.id]);
                          } else {
                            setSucursalesAsignadas(prev => prev.filter(id => id !== suc.id));
                          }
                        }}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      {suc.nombre}
                    </label>
                  ))}
                </div>
              </div>

              {/* Permisos */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Permisos de acceso</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {MODULOS.map(mod => (
                    <label key={mod.key} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={permissions[mod.key] || false}
                        onChange={() => togglePermiso(mod.key)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4">
              <button onClick={() => setMostrarForm(false)} className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">Cancelar</button>
              <button onClick={guardarUsuario} disabled={guardando} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition disabled:opacity-50">
                {guardando ? "Guardando..." : editandoId ? "Actualizar" : "Crear Usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}