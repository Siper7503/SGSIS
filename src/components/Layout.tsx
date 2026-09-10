import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.tsx';
import { Login } from './Login.tsx';
import { Building2, Home, Users, Hammer, Mail, FileText, Settings, LogOut, Briefcase, Map as MapIcon, Sparkles, Menu, X, WifiOff, AlertTriangle, Droplets, Monitor, ShieldAlert, UserCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { getQueuedActions, syncData } from '../lib/sync.ts';
import { apiFetch } from '../lib/api.ts';
import { ARRONDISSEMENT_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, ROLES, SUPER_ADMIN_ROLES, hasAnyRole } from '../lib/roles.ts';

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
  { name: 'Rapports scolaires annuels', href: '/rapports-annuels', icon: FileText },
  { name: 'Prédictions IA', href: '/predictions', icon: Sparkles },
  { name: 'Journal Audit', href: '/audit', icon: ShieldAlert },
  { name: 'Administration (M8)', href: '/admin', icon: Settings },
];

export function Layout() {
  const { user, loading, token, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState(getQueuedActions().length);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEstablishmentName, setProfileEstablishmentName] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profilePasswordConfirmation, setProfilePasswordConfirmation] = useState('');
  const [showProfileNewPassword, setShowProfileNewPassword] = useState(false);
  const [showProfilePasswordConfirmation, setShowProfilePasswordConfirmation] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (!profileOpen || !token || !user?.etablissementId) return;
    apiFetch('/api/etablissements', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((items) => {
        if (!Array.isArray(items)) return;
        const establishment = items.find((item) => Number(item.id) === Number(user.etablissementId));
        setProfileEstablishmentName(establishment?.nom || null);
      })
      .catch(() => setProfileEstablishmentName(null));
  }, [profileOpen, token, user?.etablissementId]);

  const openProfile = () => {
    setProfileOpen(true);
    setProfileError(null);
    setProfileSuccess(null);
    setCurrentPassword('');
    setProfileNewPassword('');
    setProfilePasswordConfirmation('');
    setShowProfileNewPassword(false);
    setShowProfilePasswordConfirmation(false);
  };

  const handleProfilePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setProfileError(null);
    setProfileSuccess(null);

    if (profileNewPassword !== profilePasswordConfirmation) {
      setProfileError('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }

    setProfileSaving(true);
    try {
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword: profileNewPassword })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de modifier le mot de passe.');

      setCurrentPassword('');
      setProfileNewPassword('');
      setProfilePasswordConfirmation('');
      setProfileSuccess('Votre mot de passe a ete modifie avec succes.');
    } catch (error: any) {
      setProfileError(error.message);
    } finally {
      setProfileSaving(false);
    }
  };

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
  const isSuperAdmin = hasAnyRole(role, SUPER_ADMIN_ROLES);
  const isDseAdmin = hasAnyRole(role, DSE_ROLES);
  const isLocalActor = hasAnyRole(role, LOCAL_SCHOOL_ROLES);
  const isArrondissementResp = hasAnyRole(role, ARRONDISSEMENT_ROLES);

  if (isLocalActor && !(hasAnyRole(role, [ROLES.PROVISEUR]) && currentPath === '/admin') && !['/', '/etablissements', '/effectifs', '/communications', '/infrastructures', '/mobilier', '/constructions', '/maintenance', '/wash', '/tice', '/rapports-annuels'].includes(currentPath)) {
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

  if (isArrondissementResp && !['/', '/etablissements', '/infrastructures', '/effectifs', '/mobilier', '/constructions', '/maintenance', '/wash', '/tice', '/carte', '/rapports', '/rapports-annuels'].includes(currentPath)) {
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

  if (!isSuperAdmin && !isDseAdmin && currentPath === '/predictions') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-lg">
          <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">AccÃ¨s RÃ©servÃ©</h2>
          <p className="text-sm text-gray-500 mt-2">
            Le module <code>{currentPath}</code> est rÃ©servÃ© au Directeur DSE et au SuperAdmin.
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

  if (!isSuperAdmin && currentPath === '/audit') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-lg">
          <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">AccÃ¨s RÃ©servÃ©</h2>
          <p className="text-sm text-gray-500 mt-2">
            Le journal d'audit global est rÃ©servÃ© au SuperAdmin.
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

  if (!isSuperAdmin && !isDseAdmin && !(hasAnyRole(role, [ROLES.PROVISEUR])) && currentPath === '/admin') {
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
    const isSuper = hasAnyRole(userRole, SUPER_ADMIN_ROLES);
    const isDse = hasAnyRole(userRole, DSE_ROLES);
    const isLocal = hasAnyRole(userRole, LOCAL_SCHOOL_ROLES);
    const isArrondissementResp = hasAnyRole(userRole, ARRONDISSEMENT_ROLES);

    // Filter navigation based on role privileges
    const filteredNavigation = navigation.filter((item) => {
      if (isSuper) {
        return ['/', '/admin', '/audit', '/carte', '/rapports', '/rapports-annuels'].includes(item.href);
      }
      if (isDse) {
        return item.href !== '/audit';
      }
      if (isLocal) {
        // Les responsables scolaires voient les modules de saisie de leur établissement.
        return ['/', '/etablissements', '/infrastructures', '/effectifs', '/mobilier', '/constructions', '/maintenance', '/wash', '/tice', '/communications', '/rapports-annuels'].includes(item.href) || (hasAnyRole(userRole, [ROLES.PROVISEUR]) && item.href === '/admin');
      }
      if (isArrondissementResp) {
        return ['/', '/etablissements', '/infrastructures', '/effectifs', '/mobilier', '/constructions', '/maintenance', '/wash', '/tice', '/carte', '/rapports', '/rapports-annuels'].includes(item.href);
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
            <button
              type="button"
              onClick={openProfile}
              className="flex w-full items-center rounded-xl text-left hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              title="Ouvrir mon profil"
            >
              <div className="flex-shrink-0">
                <img 
                  className="h-10 w-10 rounded-xl ring-2 ring-blue-100 object-cover" 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.prenom || user.email}&background=0D8ABC&color=fff`} 
                  alt="Avatar" 
                />
              </div>
              <div className="ml-3 min-w-0 truncate">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {user.prenom && user.nom ? `${user.prenom} ${user.nom}` : (user.displayName || user.email)}
                </p>
                {user.role && (
                  <p className="text-xs font-semibold text-blue-600 truncate">{user.role}</p>
                )}
              </div>
              <UserCircle className="ml-auto h-4 w-4 flex-shrink-0 text-slate-400" />
            </button>

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

      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-profile-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileOpen(false);
          }}
        >
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Mon espace personnel</p>
                <h2 id="my-profile-title" className="mt-1 text-xl font-black text-slate-900">Mon profil</h2>
                <p className="mt-1 text-sm text-slate-500">Consultez vos informations et gerez votre mot de passe.</p>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fermer mon profil"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                <div className="flex items-center gap-3">
                  <img
                    className="h-12 w-12 rounded-xl ring-2 ring-blue-100 object-cover"
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.prenom || user.email}&background=0D8ABC&color=fff`}
                    alt="Avatar du profil"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-900">{user.prenom || ''} {user.nom || ''}</p>
                    <p className="truncate text-sm text-blue-600">{user.role || 'Utilisateur'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Identite</p>
                <dl className="mt-3 space-y-2 text-sm text-slate-700">
                  <div><dt className="inline font-semibold">Nom : </dt><dd className="inline">{user.nom || 'Non renseigne'}</dd></div>
                  <div><dt className="inline font-semibold">Prenom : </dt><dd className="inline">{user.prenom || 'Non renseigne'}</dd></div>
                  <div><dt className="inline font-semibold">Email : </dt><dd className="inline break-all">{user.email || 'Non renseigne'}</dd></div>
                  <div><dt className="inline font-semibold">Telephone : </dt><dd className="inline">{user.telephone || 'Non renseigne'}</dd></div>
                </dl>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Affectation et droits</p>
                <dl className="mt-3 space-y-2 text-sm text-slate-700">
                  <div><dt className="inline font-semibold">Role : </dt><dd className="inline">{user.role || 'Non renseigne'}</dd></div>
                  <div><dt className="inline font-semibold">Arrondissement : </dt><dd className="inline">{user.arrondissement || 'Global'}</dd></div>
                  <div><dt className="inline font-semibold">Etablissement : </dt><dd className="inline">{profileEstablishmentName || (user.etablissementId ? `ID ${user.etablissementId}` : 'Tous les etablissements')}</dd></div>
                  <div><dt className="inline font-semibold">Droits : </dt><dd className="inline">{user.rights || 'Lecture et recherche'}</dd></div>
                </dl>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:col-span-2">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">Mot de passe et jeton de securite</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">Pour votre securite, le mot de passe actuel et le jeton existant ne sont jamais affiches. Le mot de passe est stocke sous forme de hash et le jeton est renouvelable.</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleProfilePasswordChange} className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Modifier mon mot de passe</p>
                {profileError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{profileError}</p>}
                {profileSuccess && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{profileSuccess}</p>}

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-semibold text-slate-600">
                    Mot de passe actuel
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                      className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Nouveau mot de passe
                    <span className="relative mt-1.5 block">
                      <input
                        type={showProfileNewPassword ? 'text' : 'password'}
                        required
                        value={profileNewPassword}
                        onChange={(event) => setProfileNewPassword(event.target.value)}
                        autoComplete="new-password"
                        className="block w-full rounded-lg border border-slate-200 py-2.5 pl-3 pr-10 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="button" onClick={() => setShowProfileNewPassword((visible) => !visible)} className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center text-slate-400 hover:text-blue-600" aria-label="Afficher ou masquer le nouveau mot de passe">
                        {showProfileNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </span>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Confirmation
                    <span className="relative mt-1.5 block">
                      <input
                        type={showProfilePasswordConfirmation ? 'text' : 'password'}
                        required
                        value={profilePasswordConfirmation}
                        onChange={(event) => setProfilePasswordConfirmation(event.target.value)}
                        autoComplete="new-password"
                        className="block w-full rounded-lg border border-slate-200 py-2.5 pl-3 pr-10 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="button" onClick={() => setShowProfilePasswordConfirmation((visible) => !visible)} className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center text-slate-400 hover:text-blue-600" aria-label="Afficher ou masquer la confirmation du mot de passe">
                        {showProfilePasswordConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </span>
                  </label>
                </div>
                <p className="mt-2 text-[10px] text-slate-400">Minimum 8 caracteres avec une lettre, un chiffre et un caractere special.</p>
                <button type="submit" disabled={profileSaving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  <KeyRound className="h-4 w-4" />
                  {profileSaving ? 'Modification en cours...' : 'Modifier le mot de passe'}
                </button>
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
