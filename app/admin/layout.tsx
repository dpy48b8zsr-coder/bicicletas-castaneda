"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { VentaProvider } from "@/context/VentaContext";
import { BranchProvider } from "@/context/BranchContext";

const allMenuItems = [
  { href: "/admin", label: "Venta", icon: "🛒", key: "venta" },
  { href: "/admin/historial", label: "Historial", icon: "📊", key: "historial" },
  { href: "/admin/productos", label: "Productos", icon: "📦", key: "productos" },
  { href: "/admin/transferencias", label: "Transferencias", icon: "🚚", key: "transferencias" },
  { href: "/admin/clientes", label: "Clientes", icon: "👥", key: "clientes" },
  { href: "/admin/presupuestos", label: "Presupuestos", icon: "📝", key: "presupuestos" },
  { href: "/admin/agendar-taller", label: "Agendar Taller", icon: "📅", key: "agendar_taller" },
  { href: "/admin/orden-taller", label: "Orden de Taller", icon: "🔧", key: "orden_taller" },
  { href: "/admin/inventario", label: "Inventario", icon: "📋", key: "inventario" },
  { href: "/admin/pedidos-online", label: "Pedidos Online", icon: "🛍️", key: "pedidos_online" },
  { href: "/admin/solicitudes", label: "Lista de Espera", icon: "📥", key: "solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "🛡️", key: "usuarios" },
  { href: "/admin/sucursales", label: "Sucursales", icon: "🏢", key: "sucursales" },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙️", key: "configuracion" },
];

const defaultPermissions = { venta: true, historial: true };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Sucursales para el selector (se llenan según rol)
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalActiva, setSucursalActiva] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        if (!currentSession) {
          router.replace("/login");
          return;
        }

        // Cargar permisos del usuario
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("rol, permissions")
          .eq("id", currentSession.user.id)
          .single();

        if (roleData) {
          if (roleData.rol === "admin") {
            const fullPerms: Record<string, boolean> = {};
            allMenuItems.forEach(item => fullPerms[item.key] = true);
            setUserPermissions(fullPerms);
          } else {
            const perms = roleData.permissions || {};
            const hasAny = Object.values(perms).some(v => v === true);
            setUserPermissions(hasAny ? perms : defaultPermissions);
          }
        }

        // Cargar sucursales según el rol
        let sucQuery;
        if (roleData?.rol === "admin") {
          // Admin ve todas las sucursales activas
          sucQuery = supabase.from("sucursales").select("*").eq("activo", true).order("nombre");
        } else {
          // Usuario no admin: solo las asignadas en usuarios_sucursales
          const { data: asignaciones } = await supabase
            .from("usuarios_sucursales")
            .select("sucursal_id")
            .eq("user_id", currentSession.user.id);
          const ids = asignaciones?.map(a => a.sucursal_id) || [];
          if (ids.length > 0) {
            sucQuery = supabase.from("sucursales").select("*").eq("activo", true).in("id", ids).order("nombre");
          } else {
            // Sin asignaciones: sin sucursales
            setSucursales([]);
            setSucursalActiva(null);
            setLoading(false);
            return;
          }
        }

        const { data: sucData } = await sucQuery;
        if (sucData && sucData.length > 0) {
          setSucursales(sucData);
          const savedId = localStorage.getItem("sucursalActiva");
          const found = savedId ? sucData.find((s: any) => s.id === savedId) : null;
          setSucursalActiva(found || sucData[0]);
        } else {
          setSucursales([]);
          setSucursalActiva(null);
        }
      } catch (err) {
        console.error("Error en init:", err);
      } finally {
        setLoading(false);
      }
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) router.replace("/login");
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (!session) return null;

  const menuItems = allMenuItems.filter(item => userPermissions[item.key]);

  const cambiarSucursal = (id: string) => {
    const nueva = sucursales.find(s => s.id === id);
    if (nueva) {
      localStorage.setItem("sucursalActiva", id);
      window.location.reload();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <VentaProvider>
      <BranchProvider
        sucursalActiva={sucursalActiva}
        sucursales={sucursales}
        cambiarSucursal={cambiarSucursal}
      >
        <div className="flex min-h-screen bg-gray-100 font-sans">
          <aside className="w-64 bg-gray-900 text-gray-300 flex flex-col fixed inset-y-0 left-0 z-40 shadow-xl">
            <div className="p-5 border-b border-gray-800">
              <h1 className="text-xl font-bold text-green-400 flex items-center gap-2">
                🚲 Bicicletas Castañeda
              </h1>
              <p className="text-xs text-gray-500 mt-1">Panel de Administración</p>

              {sucursales.length > 0 && (
                <div className="mt-3">
                  <select
                    value={sucursalActiva?.id || ""}
                    onChange={(e) => cambiarSucursal(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300"
                  >
                    {sucursales.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
              {menuItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-3 mx-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-green-700 text-white shadow-md"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-gray-800">
              <p className="text-xs text-gray-400 truncate mb-2">{session.user?.email}</p>
              <button onClick={handleLogout} className="w-full text-left text-xs text-red-400 hover:text-red-300 transition-colors">
                🚪 Cerrar sesión
              </button>
            </div>
          </aside>

          <main className="flex-1 ml-64 p-4 md:p-6 bg-gray-100 min-h-screen">
            {children}
          </main>
        </div>
      </BranchProvider>
    </VentaProvider>
  );
}