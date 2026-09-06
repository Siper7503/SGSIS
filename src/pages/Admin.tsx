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
  AlertCircle, 
  ShieldAlert, 
  Phone 
} from 'lucide-react';
import { ROLES } from '../lib/roles.ts';

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
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isDseAdmin = user?.role === "Administrateur DSE";

  const rolesList = [
    ROLES.ADMIN_DSE,
    ROLES.DIRECTEUR_DSE,
    ROLES.DIRECTEUR_ECOLE,
    ROLES.PROVISEUR,
    ROLES.SECRETAIRE_ADMIN,
    ROLES.RESPONSABLE_ARR,
    ROLES.VISITEUR
  ];

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

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);

    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
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
          arrondissement: newArrondissement || null
        })
      });

      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || "Une erreur est survenue lors de la création de l'utilisateur.");
      }

      setFormSuccess(`L'utilisateur ${newPrenom} ${newNom} a été créé avec succès ! Un jeton d'accès sécurisé a été généré.`);
      
      // Reset form fields
      setNewEmail('');
      setNewNom('');
      setNewPrenom('');
      setNewTelephone('');
      setNewPassword('');
      setNewRole(ROLES.DIRECTEUR_ECOLE);
      setNewArrondissement('');
      setShowAddForm(false);
      
      // Refresh list
      await fetchData();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
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
        {isDseAdmin && (
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
      {!isDseAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
          <ShieldAlert className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-900 text-sm">Droits de gestion restreints</h3>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Vous êtes connecté avec le profil <strong>{user?.role}</strong>. L'accès en lecture à la liste est autorisé à des fins de pilotage et d'audit, mais la création d'utilisateurs ainsi que le blocage/déverrouillage de comptes sont des privilèges **exclusivement réservés à l'Administrateur DSE**.
            </p>
          </div>
        </div>
      )}

      {/* Expandable creation form (Only available for Administrateur DSE) */}
      {isDseAdmin && showAddForm && (
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
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Ex: Mopass@2026"
                />
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
                  <div className="flex items-start">
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
                  
                  {/* Actions (Lock/Unlock) - ONLY active for Administrateur DSE */}
                  <div className="flex items-center gap-2">
                    {user?.email !== u.email && (
                      isDseAdmin ? (
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
                        <div className="text-xs text-slate-400 italic">Modification interdite</div>
                      )
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
    </div>
  );
}
