import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { 
  Users, 
  Shield, 
  MapPin, 
  Mail, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  UserPlus, 
  Plus, 
  X, 
  Check, 
  Copy,
  AlertCircle, 
  ShieldAlert, 
  Phone,
  Pencil,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';
import { ADMIN_MANAGED_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, SCHOOL_USER_ROLES, SUPER_ADMIN_ROLES, hasAnyRole, ROLES } from '../lib/roles.ts';

export default function Admin() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const { token, user } = useAuth();

  // Form states for adding users
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNom, setNewNom] = useState('');
  const [newPrenom, setNewPrenom] = useState('');
  const [newTelephone, setNewTelephone] = useState('');
  const [newRole, setNewRole] = useState<string>(ROLES.DIRECTEUR_ECOLE);
  const [newArrondissement, setNewArrondissement] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [newEtablissementId, setNewEtablissementId] = useState('');
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [simulatedEmail, setSimulatedEmail] = useState<any | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const isSuperAdmin = hasAnyRole(user?.role, SUPER_ADMIN_ROLES);
  const isDseAdmin = hasAnyRole(user?.role, DSE_ROLES);
  const isProviseur = hasAnyRole(user?.role, [ROLES.PROVISEUR]);
  const canCreateUsers = isSuperAdmin || isDseAdmin || isProviseur;
  const canManageSecurity = isSuperAdmin;

  const rolesList = isSuperAdmin
    ? [...ADMIN_MANAGED_ROLES]
    : isProviseur ? [ROLES.SECRETAIRE_ADMIN] : [...SCHOOL_USER_ROLES];

  useEffect(() => {
    setNewRole(rolesList[0] || ROLES.DIRECTEUR_ECOLE);
  }, [isSuperAdmin, isDseAdmin, isProviseur]);

  const needsEstablishment = hasAnyRole(newRole, LOCAL_SCHOOL_ROLES);

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await apiFetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (Array.isArray(d)) {
        setData(d);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiFetch('/api/etablissements', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((items) => setEtablissements(Array.isArray(items) ? [...items].sort((a, b) => Number(a.id) - Number(b.id)) : []))
      .catch(console.error);
  }, [token]);

  const handleLockUser = async (userId: number) => {
    if (!token) return;
    try {
      setActionLoading(userId);
      const res = await apiFetch(`/api/users/lock/${userId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors du verrouillage de l'utilisateur");
      }
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlockUser = async (userId: number) => {
    if (!token) return;
    try {
      setActionLoading(userId);
      const res = await apiFetch(`/api/users/unlock/${userId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors du déverrouillage de l'utilisateur");
      }
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const startEditing = (account: any) => {
    setEditingUserId(account.id);
    setNewEmail(account.email || '');
    setNewNom(account.nom || '');
    setNewPrenom(account.prenom || '');
    setNewTelephone(account.telephone || '');
    setNewRole(account.role || rolesList[0]);
    setNewArrondissement(account.arrondissement || '');
    setNewEtablissementId(account.etablissementId ? String(account.etablissementId) : '');
    setNewPassword('');
    setShowNewPassword(false);
    setFormError(null);
    setFormSuccess(null);
    setShowAddForm(true);
  };

  const handleDeleteUser = async (userId: number) => {
    if (!token || !confirm('Supprimer définitivement ce compte utilisateur ?')) return;
    try {
      setActionLoading(userId);
      const res = await apiFetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur lors de la suppression.');
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);

    try {
      const res = await apiFetch(editingUserId ? `/api/users/${editingUserId}` : '/api/users', {
        method: editingUserId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nom: newNom,
          prenom: newPrenom,
          email: newEmail,
          telephone: newTelephone,
          password: newPassword,
          role: newRole,
          arrondissement: newArrondissement || null,
          etablissementId: (isProviseur && user?.etablissementId) || newEtablissementId || null
        })
      });

      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || "Une erreur est survenue lors de la création de l'utilisateur.");
      }

      if (!editingUserId && d.simulatedEmail) {
        setSimulatedEmail(d.simulatedEmail);
        setCopiedToken(false);
      }

      setFormSuccess(editingUserId
        ? `Le compte de ${newPrenom} ${newNom} a ete modifie avec succes.`
        : `L'utilisateur ${newPrenom} ${newNom} a ete cree avec succes ! Un jeton d'acces securise a ete genere.`);
      
      // Reset form fields
      setNewEmail('');
      setNewNom('');
      setNewPrenom('');
      setNewTelephone('');
      setNewPassword('');
      setShowNewPassword(false);
      setNewRole(rolesList[0] || ROLES.DIRECTEUR_ECOLE);
      setNewArrondissement('');
      setNewEtablissementId('');
      setEditingUserId(null);
      setShowAddForm(false);
      
      // Refresh list
      await fetchData();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const connectionToken = simulatedEmail?.body?.match(/SGSIED-[A-Za-z0-9_-]+/)?.[0] || null;
  const selectedUserEtablissement = selectedUser?.etablissementId
    ? etablissements.find((item) => Number(item.id) === Number(selectedUser.etablissementId))
    : null;

  const copyConnectionToken = async () => {
    if (!connectionToken) return;
    await navigator.clipboard.writeText(connectionToken);
    setCopiedToken(true);
    window.setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="sm:flex sm:items-center sm:justify-between border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Administration & Contrôle</h1>
          <p className="mt-2 text-sm text-gray-500">
            Gestion des accès utilisateurs, attribution des droits et sécurisation des comptes de la commune.
          </p>
        </div>
        {canCreateUsers && (
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              setFormError(null);
              setFormSuccess(null);
            }}
            className="mt-4 sm:mt-0 inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            {showAddForm ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Fermer le formulaire
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Ajouter un utilisateur
              </>
            )}
          </button>
        )}
      </div>

      {/* Permission restriction warning for other roles */}
      {!canCreateUsers && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
          <ShieldAlert className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-900 text-sm">Droits de gestion restreints</h3>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Vous êtes connecté avec le profil <strong>{user?.role}</strong>. L'accès en lecture et en gestion est limité à votre périmètre.
            </p>
          </div>
        </div>
      )}

      {/* Expandable creation form for authorized administrators */}
      {canCreateUsers && showAddForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-slide-up">
          <div className="px-6 py-4 bg-slate-50 border-b border-gray-100">
            <h3 className="text-sm font-bold text-slate-800 flex items-center">
              <UserPlus className="h-4 w-4 mr-2 text-blue-600" />
              Créer et configurer un nouveau compte utilisateur
            </h3>
          </div>
          <form onSubmit={handleAddUser} className="p-6 space-y-4">
            {formError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Nom</label>
                <input
                  type="text"
                  required
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Ex: OUATTARA"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Prénom</label>
                <input
                  type="text"
                  required
                  value={newPrenom}
                  onChange={(e) => setNewPrenom(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Ex: Mohamed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Adresse Email (Format unique @gmail.com)</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Ex: mohamed@gmail.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Numéro de téléphone (Chiffres uniquement)</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Phone className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={newTelephone}
                    onChange={(e) => setNewTelephone(e.target.value.replace(/\D/g, ''))}
                    className="block w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Ex: 70000000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Mot de Passe Initial</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required={!editingUserId}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="block w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-11 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Ex: Mopass@2026"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-slate-400 hover:text-blue-600"
                    aria-label={showNewPassword ? 'Masquer le mot de passe initial' : 'Afficher le mot de passe initial'}
                    title={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-slate-400 leading-normal">
                  Minimum 8 caractères avec au moins une lettre, un chiffre, un caractère spécial, et majuscule uniquement au début.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Rôle / Poste attribué dans le système</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                >
                  {rolesList.map((r, idx) => (
                    <option key={idx} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Arrondissement d'exercice (Si applicable)</label>
                <select
                  value={newArrondissement}
                  onChange={(e) => setNewArrondissement(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                >
                  <option value="">Tous les Arrondissements (DSE National / Global)</option>
                  {Array.from({ length: 12 }, (_, i) => `Arrondissement ${i + 1}`).map((arr) => (
                    <option key={arr} value={arr}>{arr}</option>
                  ))}
                </select>
              </div>

              {(!isSuperAdmin || needsEstablishment) && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Etablissement rattache</label>
                  <select
                    required
                    value={isProviseur && user?.etablissementId ? String(user.etablissementId) : newEtablissementId}
                    disabled={isProviseur}
                    onChange={(e) => setNewEtablissementId(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white disabled:bg-slate-100"
                  >
                    <option value="">Selectionner un etablissement</option>
                    {etablissements.map((etab) => (
                      <option key={etab.id} value={etab.id}>{etab.nom} ({etab.arrondissement})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? "Création en cours..." : "Enregistrer et envoyer le jeton"}
              </button>
            </div>
          </form>
        </div>
      )}

      {formSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-semibold flex items-center gap-2 shadow-sm">
          <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          {formSuccess}
        </div>
      )}

      {simulatedEmail && (
        <section className="overflow-hidden rounded-2xl border border-cyan-900 bg-gradient-to-br from-cyan-950 via-sky-950 to-emerald-950 text-slate-100 shadow-sm">
          <div className="flex items-center justify-between border-b border-cyan-800 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">SMTP Simulator</p>
              <h3 className="mt-1 text-sm font-bold text-white">Jeton de connexion envoyé</h3>
            </div>
            <Mail className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs text-cyan-100/70">Destinataire</p>
              <p className="font-mono text-sm font-semibold text-white">{simulatedEmail.to}</p>
              <p className="mt-3 text-xs text-cyan-100/70">Objet</p>
              <p className="text-sm font-semibold text-white">{simulatedEmail.subject}</p>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-cyan-800 bg-slate-950/50 p-3 text-[11px] leading-relaxed text-slate-300">{simulatedEmail.body}</pre>
            </div>
            {connectionToken && (
              <div className="self-start rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 lg:min-w-56">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Jeton à transmettre</p>
                <p className="mt-1 break-all font-mono text-sm font-black text-white">{connectionToken}</p>
                <button type="button" onClick={copyConnectionToken} className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300">
                  <Copy className="h-3.5 w-3.5" />
                  {copiedToken ? 'Copié' : 'Copier le jeton'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 sm:px-8">
          <h3 className="text-lg font-bold leading-6 text-gray-900 flex items-center">
            <Users className="h-5 w-5 mr-2 text-blue-500" />
            Utilisateurs & Profils d'accès
          </h3>
          <p className="mt-1 text-sm text-gray-400">
            Liste de tous les utilisateurs enregistrés avec leur rôle et leur état de sécurité actuel.
          </p>
        </div>
        
        {loading && data.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
            Chargement des utilisateurs...
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-gray-400 italic">Aucun utilisateur trouvé.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.map((u) => (
              <li key={u.id} className="p-6 hover:bg-slate-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div
                    className={`flex items-start ${isSuperAdmin ? 'cursor-pointer rounded-xl -m-2 p-2 hover:bg-blue-50/60' : ''}`}
                    onClick={() => isSuperAdmin && setSelectedUser(u)}
                    title={isSuperAdmin ? 'Afficher les informations du compte' : undefined}
                  >
                    <div className="flex-shrink-0">
                      <div className={`h-11 w-11 rounded-full ${u.isLocked ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'} border flex items-center justify-center font-black text-sm`}>
                        {(u.prenom || u.email).charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="ml-4 space-y-1">
                      <div className="text-sm font-bold text-gray-900 flex flex-wrap items-center gap-2">
                        <span>{u.prenom} {u.nom}</span>
                        <span className="text-xs text-slate-400 font-normal">({u.email})</span>
                        {user?.email === u.email && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Moi
                          </span>
                        )}
                        {u.isLocked && (
                          <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 gap-1 animate-pulse">
                            <Lock className="h-3 w-3" /> Bloqué (Accès refusé)
                          </span>
                        )}
                        {u.loginAttempts > 0 && !u.isLocked && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 gap-1">
                            <AlertTriangle className="h-3 w-3" /> {u.loginAttempts}/5 échecs
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center text-xs text-gray-500 gap-x-4 gap-y-1">
                        <span className="flex items-center font-medium">
                          <Shield className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-gray-400" />
                          {u.role}
                        </span>
                        {u.telephone && (
                          <span className="flex items-center font-mono">
                            <Phone className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-gray-400" />
                            {u.telephone}
                          </span>
                        )}
                        {u.arrondissement && (
                          <span className="flex items-center">
                            <MapPin className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-gray-400" />
                            {u.arrondissement}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                          Droits: {u.rights}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions (Lock/Unlock) for authorized administrators */}
                  <div className="flex items-center gap-2">
                    {user?.email !== u.email && !hasAnyRole(u.role, SUPER_ADMIN_ROLES) && (
                      canManageSecurity ? (
                        u.isLocked ? (
                          <button
                            onClick={() => handleUnlockUser(u.id)}
                            disabled={actionLoading === u.id}
                            className="inline-flex items-center px-3.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-700 transition-colors disabled:opacity-50"
                          >
                            <Unlock className="h-3.5 w-3.5 mr-1.5" />
                            Déverrouiller & Autoriser
                          </button>
                        ) : (
                          <button
                            onClick={() => handleLockUser(u.id)}
                            disabled={actionLoading === u.id}
                            className="inline-flex items-center px-3.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 transition-colors disabled:opacity-50"
                          >
                            <Lock className="h-3.5 w-3.5 mr-1.5" />
                            Bloquer l'accès
                          </button>
                        )
                      ) : (
                        <div className="text-xs text-slate-400 italic">Blocage reserve au SuperAdmin</div>
                      )
                    )}
                    {user?.email !== u.email && canCreateUsers && !hasAnyRole(u.role, SUPER_ADMIN_ROLES) && (
                      <>
                        <button
                          onClick={() => startEditing(u)}
                          className="inline-flex items-center px-2.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 transition-colors"
                          title="Modifier le compte"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {canManageSecurity && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={actionLoading === u.id}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 transition-colors disabled:opacity-50"
                            title="Supprimer le compte"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                    <span className="inline-flex items-center rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500">
                      UID: {u.id}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isSuperAdmin && selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-details-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedUser(null);
          }}
        >
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">SuperAdmin · Consultation</p>
                <h2 id="user-details-title" className="mt-1 text-xl font-black text-slate-900">
                  {selectedUser.prenom} {selectedUser.nom}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Informations détaillées du compte utilisateur</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fermer les informations du compte"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Identité du compte</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <p className="text-sm text-slate-700"><strong>Email :</strong> {selectedUser.email || 'Non renseigné'}</p>
                  <p className="text-sm text-slate-700"><strong>Téléphone :</strong> {selectedUser.telephone || 'Non renseigné'}</p>
                  <p className="text-sm text-slate-700"><strong>UID :</strong> <span className="font-mono">{selectedUser.uid || selectedUser.id}</span></p>
                  <p className="text-sm text-slate-700"><strong>Rôle :</strong> {selectedUser.role || 'Non renseigné'}</p>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Périmètre d’accès</p>
                <p className="mt-3 text-sm text-slate-700"><strong>Arrondissement :</strong> {selectedUser.arrondissement || 'Global'}</p>
                <p className="mt-2 text-sm text-slate-700"><strong>Établissement :</strong> {selectedUserEtablissement?.nom || (selectedUser.etablissementId ? `ID ${selectedUser.etablissementId}` : 'Tous les établissements')}</p>
                <p className="mt-2 text-sm text-slate-700"><strong>Droits :</strong> {selectedUser.rights || 'Non renseignés'}</p>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">État de sécurité</p>
                <p className={`mt-3 text-sm font-bold ${selectedUser.isLocked ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {selectedUser.isLocked ? 'Accès bloqué' : 'Compte actif'}
                </p>
                <p className="mt-2 text-sm text-slate-700"><strong>Tentatives échouées :</strong> {selectedUser.loginAttempts || 0}/5</p>
                {selectedUser.lockExpiresAt && <p className="mt-2 text-sm text-slate-700"><strong>Fin du blocage :</strong> {new Date(selectedUser.lockExpiresAt).toLocaleString('fr-FR')}</p>}
              </div>

              <div className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Traçabilité</p>
                <p className="mt-3 text-sm text-slate-700"><strong>Compte créé le :</strong> {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString('fr-FR') : 'Date non disponible'}</p>
                <p className="mt-2 text-xs text-slate-500">Le mot de passe initial, son hash et les jetons secrets ne sont jamais affichés. Pour modifier l’accès, utilisez les actions de gestion du compte.</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
