"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { VentaProvider } from "@/context/VentaContext";
import { BranchProvider, useBranch } from "@/context/BranchContext";

// Definición de módulos (igual que antes)
const allMenuItems = [
  { href: "/admin", label: "Venta", icon: "🛒", key: "venta" },
  { href: "/admin/historial", label: "Historial", icon: "📊", key: "historial" },
  { href: "/admin/productos", label: "Productos", icon: "📦", key: "productos" },
  { href: "/admin/clientes", label: "Clientes", icon: "👥", key: "clientes" },
  { href: "/admin/presupuestos", label: "Presupuestos", icon: "📝", key: "presupuestos" },
  { href: "/admin/agendar-taller", label: "Agendar Taller", icon: "📅", key: "agendar_taller" },
  { href: "/admin/orden-taller", label: "Orden de Taller", icon: "🔧", key: "orden_taller" },
  { href: "/admin/inventario", label: "Inventario", icon: "📋", key: "inventario" },
  { href: "/admin/pedidos-online", label: "Pedidos Online", icon: "🛍️", key: "pedidos_online" },
  { href: "/admin/solicitudes", label: "Lista de Espera", icon: "📥", key: "solicitudes" },
  { href: "/admin/transferencias", label: "Transferencias", icon: "🚚", key: "transferencias" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "🛡️", key: "usuarios" },
  { href: "/admin/sucursales", label: "Sucursales", icon: "🏢", key: "sucursales" },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙️", key: "configuracion" },
];

// Categorías del menú (cada una contiene varias keys de módulos)
const menuCategories = [
  {
    label: "Ventas",
    icon: "🛒",
    keys: ["venta", "historial"],
  },
  {
    label: "Inventario",
    icon: "📦",
    keys: ["productos", "inventario", "transferencias"],
  },
  {
    label: "Clientes",
    icon: "👥",
    keys: ["clientes", "solicitudes", "pedidos_online"],
  },
  {
    label: "Taller",
    icon: "🔧",
    keys: ["agendar_taller", "orden_taller", "presupuestos"],
  },
  {
    label: "Administración",
    icon: "⚙️",
    keys: ["usuarios", "sucursales", "configuracion"],
  },
];

const defaultPermissions = { venta: true, historial: true };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Estados para sucursales
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalActiva, setSucursalActiva] = useState<any>(null);

  // Estado para menú móvil
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Estado para categorías expandidas (acordeón)
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  const toggleCategory = (label: string) => {
    setExpandedCategories(prev =>
      prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]
    );
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        if (!currentSession) {
          router.replace("/login");
          return;
        }

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
          sucQuery = supabase.from("sucursales").select("*").eq("activo", true).order("nombre");
        } else {
          const { data: asignaciones } = await supabase
            .from("usuarios_sucursales")
            .select("sucursal_id")
            .eq("user_id", currentSession.user.id);
          const ids = asignaciones?.map(a => a.sucursal_id) || [];
          if (ids.length > 0) {
            sucQuery = supabase.from("sucursales").select("*").eq("activo", true).in("id", ids).order("nombre");
          } else {
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

  // Filtrar módulos permitidos
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

  // Componente reutilizable para el contenido de la barra lateral
  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <div className="p-5 border-b border-gray-800">
        <h1 className="text-xl font-bold text-green-400 flex items-center gap-2">
          🚲 Bicicletas Castañeda
        </h1>
        <p className="text-xs text-gray-500 mt-1">Panel de Administración</p>

        {sucursales.length > 0 && (
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">Sucursal activa</label>
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
        {menuCategories.map(categoria => {
          // Filtrar los módulos de esta categoría que están permitidos
          const itemsCategoria = menuItems.filter(item => categoria.keys.includes(item.key));
          if (itemsCategoria.length === 0) return null;

          const isExpanded = expandedCategories.includes(categoria.label);

          return (
            <div key={categoria.label} className="mb-1">
              <button
                onClick={() => toggleCategory(categoria.label)}
                className="w-full flex items-center justify-between px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg mx-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{categoria.icon}</span>
                  <span>{categoria.label}</span>
                </div>
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="ml-8 mt-1 space-y-1">
                  {itemsCategoria.map(item => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => mobile && setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-400 truncate mb-2">{session.user?.email}</p>
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          🚪 Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <VentaProvider>
      <BranchProvider
        sucursalActiva={sucursalActiva}
        sucursales={sucursales}
        cambiarSucursal={cambiarSucursal}
      >
        <div className="flex min-h-screen bg-gray-100 font-sans">
          {/* Sidebar para escritorio (siempre visible en lg) */}
          <aside className="hidden lg:flex lg:flex-col w-64 bg-gray-900 text-gray-300 fixed inset-y-0 left-0 z-40 shadow-xl">
            <SidebarContent />
          </aside>

          {/* Menú hamburguesa para móviles */}
          <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-800 hover:text-green-700 text-2xl"
            >
              ☰
            </button>
            <span className="font-bold text-green-700">Bicicletas Castañeda</span>
            <div className="w-8"></div> {/* Espacio para centrar */}
          </div>

          {/* Overlay para menú móvil */}
          {mobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setMobileMenuOpen(false)}
              ></div>
              <div className="absolute top-0 left-0 bottom-0 w-64 bg-gray-900 text-gray-300 flex flex-col shadow-xl">
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                  <span className="text-green-400 font-bold">Menú</span>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-gray-400 hover:text-white text-xl"
                  >
                    ✕
                  </button>
                </div>
                <SidebarContent mobile />
              </div>
            </div>
          )}

          {/* Contenido principal */}
          <main className="flex-1 lg:ml-64 mt-14 lg:mt-0 p-4 md:p-6 bg-gray-100 min-h-screen">
            {children}
          </main>
        </div>
      </BranchProvider>
    </VentaProvider>
  );
}