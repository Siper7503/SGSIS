import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.tsx';
import { Login } from './Login.tsx';
import { Building2, Home, Users, Hammer, Mail, FileText, Settings, LogOut, Briefcase, Map as MapIcon, Sparkles, Menu, X, WifiOff, AlertTriangle, Droplets, Monitor, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { getQueuedActions, syncData } from '../lib/sync.ts';

const navigation = [
  { name: 'Tableau de bord', href: '/', icon: Home },
  { name: 'Établissements (M1)', href: '/etablissements', icon: Building2 },
  { name: 'Cartographie', href: '/carte', icon: MapIcon },
  { name: 'Infrastructures (M2)', href: '/infrastructures', icon: Hammer },
  { name: 'Effectifs (M3)', href: '/effectifs', icon: Users },
  { name: 'Mobilier (M4)', href: '/mobilier', icon: Briefcase },
  { name: 'Constructions (M5)', href: '/constructions', icon: Hammer },
  { name: 'Maintenance (Incidents)', href: '/maintenance', icon: AlertTriangle },
  { name: 'Cantines & WASH', href: '/wash', icon: Droplets },
  { name: 'Équipements (TICE)', href: '/tice', icon: Monitor },
  { name: 'Communications (M6)', href: '/communications', icon: Mail },
  { name: 'Rapports (M7)', href: '/rapports', icon: FileText },
  { name: 'Prédictions IA', href: '/predictions', icon: Sparkles },
  { name: 'Journal Audit', href: '/audit', icon: ShieldAlert },
  { name: 'Administration (M8)', href: '/admin', icon: Settings },
];

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(getQueuedActions().length);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleQueueUpdate = () => setPendingSyncs(getQueuedActions().length);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync_queue_updated', handleQueueUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync_queue_updated', handleQueueUpdate);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);
      // 30 minutes in milliseconds = 30 * 60 * 1000 = 1800000
      timeout = setTimeout(() => {
        logout();
      }, 1800000);
    };

    const events = ['load', 'mousemove', 'mousedown', 'click', 'scroll', 'keypress'];
    
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      clearTimeout(timeout);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-50">Chargement...</div>;
  }

  if (!user) {
    return <Login />;
  }

  // Route Protection: Redirect or block unauthorized access
  const currentPath = location.pathname;
  const role = user?.role;
  const isSuperAdmin = role === "Administrateur DSE" || role === "Directeur DSE";
  const isLocalActor = role === "Proviseur d'établissement" || role === "Sécretaire Adminstratif" || role === "Directeurs d'école";
  const isArrondissementResp = role === "Responsable d'arrondissement" || role === "Responsable d'Arrondissement";

  if (isLocalActor && !['/', '/etablissements', '/effectifs', '/communications', '/infrastructures'].includes(currentPath)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-lg">
          <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Accès Refusé</h2>
          <p className="text-sm text-gray-500 mt-2">
            Votre profil (<strong>{role}</strong>) n'est pas autorisé à accéder au module <code>{currentPath}</code>.
          </p>
          <div className="mt-6">
            <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-blue-700 transition">
              Retour au tableau de bord
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isArrondissementResp && !['/', '/mobilier'].includes(currentPath)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-lg">
          <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Accès Refusé</h2>
          <p className="text-sm text-gray-500 mt-2">
            Votre profil (<strong>{role}</strong>) n'est pas autorisé à accéder au module <code>{currentPath}</code>.
          </p>
          <div className="mt-6">
            <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-blue-700 transition">
              Retour au tableau de bord
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin && !isLocalActor && !isArrondissementResp && ['/admin', '/audit', '/predictions'].includes(currentPath)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-lg">
          <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Accès Réservé</h2>
          <p className="text-sm text-gray-500 mt-2">
            Le module <code>{currentPath}</code> est réservé aux administrateurs de la DSE.
          </p>
          <div className="mt-6">
            <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-blue-700 transition">
              Retour au tableau de bord
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const SidebarContent = () => {
    // Determine user roles
    const userRole = user?.role;
    const isSuper = userRole === "Administrateur DSE" || userRole === "Directeur DSE";
    const isLocal = userRole === "Proviseur d'établissement" || userRole === "Sécretaire Adminstratif" || userRole === "Directeurs d'école";
    const isArrondissementResp = userRole === "Responsable d'arrondissement" || userRole === "Responsable d'Arrondissement";

    // Filter navigation based on role privileges
    const filteredNavigation = navigation.filter((item) => {
      if (isSuper) {
        return true; // Interface 1 sees everything
      }
      if (isLocal) {
        // Interface 2 only sees Dashboard, M1, M2, M3, M6
        return ['/', '/etablissements', '/infrastructures', '/effectifs', '/communications'].includes(item.href);
      }
      if (isArrondissementResp) {
        // Responsable d'arrondissement only sees Dashboard and Mobilier (M4)
        return ['/', '/mobilier'].includes(item.href);
      }
      // Interface 3 (Observer/Lambda) sees everything except Admin (M8), Audit logs and predictions
      return !['/admin', '/audit', '/predictions'].includes(item.href);
    });

    return (
      <>
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-100 justify-between">
          <div className="flex items-center">
            <Building2 className="h-6 w-6 text-blue-600 mr-3" />
            <span className="text-sm font-bold text-gray-900 tracking-tight leading-tight">
              SGSIS de la Commune de Ouagadougou
            </span>
          </div>
          <button className="md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <X className="h-6 w-6 text-gray-500" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <nav className="flex-1 space-y-1 px-3 py-4">
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                    'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors'
                  )}
                >
                  <item.icon
                    className={cn(
                      isActive ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-500',
                      'flex-shrink-0 mr-3 h-5 w-5 transition-colors'
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t border-gray-200 p-4 shrink-0">
          <div className="space-y-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <img 
                  className="h-10 w-10 rounded-xl ring-2 ring-blue-100 object-cover" 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.prenom || user.email}&background=0D8ABC&color=fff`} 
                  alt="Avatar" 
                />
              </div>
              <div className="ml-3 truncate">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {user.prenom && user.nom ? `${user.prenom} ${user.nom}` : (user.displayName || user.email)}
                </p>
                {user.role && (
                  <p className="text-xs font-semibold text-blue-600 truncate">{user.role}</p>
                )}
              </div>
            </div>

            {/* Droit de contrôle auto-assigné */}
            <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Droit de contrôle</p>
              <p className="text-[10px] font-bold text-slate-700 leading-tight mt-0.5">
                {user.rights || "lecture et recherche"}
              </p>
            </div>

            {/* Jeton d'accès de session */}
            {user.accessToken && (
              <div className="bg-amber-50/50 border border-amber-100 p-2 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-bold text-amber-600 uppercase tracking-widest">Mon Jeton Securisé</p>
                  <p className="text-[10px] font-mono font-black text-amber-900 mt-0.5">{user.accessToken}</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold text-amber-800">
                  ACTIF
                </span>
              </div>
            )}
          </div>

          <button
            onClick={logout}
            className="mt-3 flex w-full items-center px-3 py-2 text-xs font-bold text-gray-700 rounded-md hover:bg-rose-50 hover:text-rose-600 transition-all border border-transparent hover:border-rose-100"
          >
            <LogOut className="mr-2.5 h-4 w-4 text-gray-400 group-hover:text-rose-500" />
            Déconnexion
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Sidebar */}
      <div className={cn("fixed inset-0 z-50 flex md:hidden transition-transform duration-300", mobileMenuOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setMobileMenuOpen(false)}></div>
        <div className="relative flex w-full max-w-xs flex-col bg-white">
          <SidebarContent />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col border-r border-gray-200 bg-white">
        <SidebarContent />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden w-full">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center">
            <Building2 className="h-6 w-6 text-blue-600 mr-2" />
            <span className="text-sm font-bold text-gray-900 tracking-tight leading-tight">
              SGSIS de la Commune de Ouagadougou
            </span>
          </div>
          <button onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-6 w-6 text-gray-500" />
          </button>
        </div>
        
        {(isOffline || pendingSyncs > 0) && (
          <div className={`shrink-0 px-4 py-2 flex items-center justify-center space-x-2 text-sm font-medium text-white ${isOffline ? 'bg-amber-500' : 'bg-blue-500'}`}>
            <WifiOff className="h-4 w-4" />
            <span>
              {isOffline ? 'Mode hors-ligne actif.' : 'En ligne.'} 
              {pendingSyncs > 0 && ` ${pendingSyncs} action(s) en attente de synchronisation...`}
            </span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto focus:outline-none">
          <div className="py-6 px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
