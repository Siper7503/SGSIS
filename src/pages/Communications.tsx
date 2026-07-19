import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { 
  Plus, 
  Search, 
  MessageSquare, 
  Clock, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  RefreshCw, 
  Send, 
  Mail, 
  ChevronDown, 
  ChevronUp,
  Inbox,
  Check,
  Smartphone
} from 'lucide-react';
import { CommunicationForm } from '../components/CommunicationForm.tsx';

export default function Communications() {
  const { token, user } = useAuth();
  const isDSE = user?.role === 'Directeur DSE' || user?.role === 'Administrateur DSE';
  const isObserver = !isDSE && !["Proviseur d'établissement", "Sécretaire Adminstratif", "Directeurs d'école"].includes(user?.role || "");

  // State for DSE Director
  const [comms, setComms] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedCommId, setSelectedCommId] = useState<number | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  // State for School Director Inbox
  const [inbox, setInbox] = useState<any[]>([]);
  const [expandedInboxId, setExpandedInboxId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch all relevant data based on role
  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (isDSE || isObserver) {
        // Fetch all sent communications
        const resComms = await apiFetch('/api/communications', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resComms.ok) {
          const d = await resComms.json();
          setComms(Array.isArray(d) ? d : []);
        }

        if (isDSE) {
          // Fetch tardiness alerts
          const resAlerts = await apiFetch('/api/communications/alerts', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (resAlerts.ok) {
            const a = await resAlerts.json();
            setAlerts(Array.isArray(a) ? a : []);
          }
        }
      } else {
        // Fetch inbox for school directors
        const resInbox = await apiFetch('/api/communications/inbox', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resInbox.ok) {
          const i = await resInbox.json();
          setInbox(Array.isArray(i) ? i : []);
        }
      }
    } catch (e) {
      console.error("Erreur lors du chargement des communications :", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, user]);

  // Fetch receipts list for a specific communication
  const fetchReceipts = async (id: number) => {
    if (!token) return;
    setLoadingReceipts(true);
    try {
      const res = await apiFetch(`/api/communications/${id}/receipts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const r = await res.json();
        setReceipts(Array.isArray(r) ? r : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const handleToggleReceipts = (id: number) => {
    if (selectedCommId === id) {
      setSelectedCommId(null);
      setReceipts([]);
    } else {
      setSelectedCommId(id);
      fetchReceipts(id);
    }
  };

  // Mark inbox communication as read
  const handleReadInbox = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`/api/communications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      // Refresh local inbox state without full reload to keep expand state
      setInbox(prev => prev.map(item => item.id === id && item.statut === 'Non lu' ? { ...item, statut: 'Lu' } : item));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleInboxExpand = (id: number) => {
    if (expandedInboxId === id) {
      setExpandedInboxId(null);
    } else {
      setExpandedInboxId(id);
      handleReadInbox(id);
    }
  };

  // Acknowledge receipt
  const handleAcknowledge = async (id: number) => {
    if (!token) return;
    try {
      const res = await apiFetch(`/api/communications/${id}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setActionSuccess("Votre accusé de réception a été enregistré avec succès.");
        setTimeout(() => setActionSuccess(null), 5000);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Simulate SMS nudge / reminder
  const handleSmsNudge = (userEmail: string, title: string) => {
    setActionSuccess(`Rappel SMS urgent envoyé avec succès à ${userEmail} concernant "${title}".`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  // Search filtering
  const displayList = (isDSE || isObserver) ? comms : inbox;
  const filteredData = displayList.filter((item) =>
    item.titre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.contenu?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isFormOpen) {
    return (
      <CommunicationForm
        onSuccess={() => {
          setIsFormOpen(false);
          setActionSuccess("Communication diffusée en parallèle avec succès via in-app et SMS.");
          setTimeout(() => setActionSuccess(null), 5000);
          fetchData();
        }}
        onCancel={() => setIsFormOpen(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Notification Alert */}
      {actionSuccess && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 p-4 rounded-md shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-medium">{actionSuccess}</p>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-500 hover:text-emerald-700 font-bold text-sm">
            ×
          </button>
        </div>
      )}

      {/* Header section */}
      <div className="sm:flex sm:items-center sm:justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-2">
            Espace {isDSE ? 'Administrateur - DSE' : isObserver ? 'Consultation - Observateur' : 'Directeur d\'Établissement'}
          </span>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center">
            <MessageSquare className="h-6 w-6 mr-2 text-blue-600" />
            Communication Institutionnelle
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isDSE 
              ? 'Rédigez, ciblez et diffusez des circulaires ministérielles avec accusé de réception obligatoire et alertes de retards.'
              : isObserver
              ? 'Consultez la liste des circulaires et communications institutionnelles diffusées dans la commune.'
              : 'Consultez les circulaires de la DSE, accusez réception de manière sécurisée et suivez vos notifications.'}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none flex items-center space-x-2">
          <button
            onClick={fetchData}
            title="Actualiser les données"
            className="inline-flex items-center justify-center p-2 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {isDSE && (
            <button
              onClick={() => setIsFormOpen(true)}
              className="inline-flex items-center justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors focus:ring-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              Diffuser un ordre / circulaire
            </button>
          )}
        </div>
      </div>

      {/* DSE ACTIVE ALERTS WIDGET (SF-25) */}
      {isDSE && alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-red-800">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <h2 className="text-base font-semibold">
              Alertes de Retards de Réponse ({alerts.length})
            </h2>
          </div>
          <p className="text-xs text-red-700">
            Les destinataires suivants ont dépassé le délai paramétrable prescrit pour accuser réception de la note de service correspondante.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {alerts.map((alert, idx) => (
              <div key={idx} className="bg-white border border-red-100 rounded-lg p-3.5 shadow-xs flex flex-col justify-between space-y-3 hover:border-red-300 transition-all">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 rounded">
                      Délai dépassé
                    </span>
                    <span className="text-xs font-medium text-gray-400 font-mono">
                      {alert.delaiHeures}h max
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mt-1 line-clamp-1">
                    {alert.titre}
                  </h4>
                  <div className="text-xs text-gray-500 mt-2 space-y-1">
                    <p className="font-semibold text-gray-700 truncate">📧 {alert.userEmail}</p>
                    <p className="text-gray-400">📍 {alert.userArrondissement}</p>
                    <p className="text-[11px]">Diffusé le : {new Date(alert.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="border-t border-gray-50 pt-2 flex items-center justify-between mt-auto">
                  <span className="text-[11px] font-semibold text-amber-600 flex items-center">
                    <Smartphone className="h-3 w-3 mr-1" />
                    SMS de repli actif
                  </span>
                  <button
                    onClick={() => handleSmsNudge(alert.userEmail, alert.titre)}
                    className="inline-flex items-center px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded transition-colors shadow-sm"
                  >
                    <Send className="h-2.5 w-2.5 mr-1" />
                    Relancer d'urgence
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center">
        <div className="relative rounded-md shadow-sm w-full">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full rounded-lg border-gray-200 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border"
            placeholder={isDSE ? "Rechercher parmi les circulaires diffusées..." : "Rechercher dans votre boîte de réception..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          {isDSE || isObserver ? (
            <>
              <Send className="h-5 w-5 mr-2 text-blue-500" />
              Circulaires diffusées par la DSE ({filteredData.length})
            </>
          ) : (
            <>
              <Inbox className="h-5 w-5 mr-2 text-blue-500" />
              Votre boîte de réception ({filteredData.length})
            </>
          )}
        </h2>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-100 shadow-sm space-y-2">
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500 font-medium">Chargement des données...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm text-center">
            <Inbox className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-800">Aucune communication trouvée</p>
            <p className="text-xs text-gray-400 mt-1">Les messages ciblés s'afficheront ici.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredData.map((item) => {
              const isExpanded = (isDSE || isObserver) ? selectedCommId === item.id : expandedInboxId === item.id;
              
              return (
                <div 
                  key={item.id} 
                  className={`bg-white shadow-sm rounded-xl border transition-all duration-200 overflow-hidden ${
                    isExpanded ? 'ring-2 ring-blue-500 border-transparent shadow-md' : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  {/* Item Header */}
                  <div 
                    onClick={() => (isDSE || isObserver) ? handleToggleReceipts(item.id) : handleToggleInboxExpand(item.id)}
                    className="p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white hover:bg-gray-50/50"
                  >
                    <div className="flex items-start space-x-3.5">
                      <div className="flex-shrink-0 mt-1 p-2 bg-blue-50 rounded-lg">
                        <MessageSquare className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-gray-900">
                            {item.titre}
                          </h3>
                          {/* Inbox-specific badges */}
                          {!isDSE && (
                            <>
                              {item.statut === 'Non lu' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                                  Nouveau
                                </span>
                              )}
                              {item.statut === 'Lu' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                                  Lu
                                </span>
                              )}
                              {item.statut === 'Accusé' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center">
                                  <Check className="h-3 w-3 mr-0.5" /> Accusé signé
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span className="flex items-center text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                            <Users className="h-3.5 w-3.5 mr-1" />
                            Cible : {item.ciblage}
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-3.5 w-3.5 mr-1" />
                            {new Date(item.createdAt).toLocaleDateString('fr-FR', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                          <span className="flex items-center text-amber-600 font-medium">
                            ⏱️ Délai de réponse : {item.delaiHeures || 24} heures
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-3 md:pt-0">
                      {/* Dual Channel Indicator badge */}
                      <span className="inline-flex items-center text-xs text-gray-500 font-medium bg-gray-50 border border-gray-100 px-2 py-1 rounded-md">
                        <Smartphone className="h-3.5 w-3.5 mr-1 text-blue-500 animate-pulse" />
                        In-App + SMS
                      </span>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded Body Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-slate-50/50 p-5 space-y-5 animate-fadeIn">
                      <div className="bg-white p-5 rounded-lg border border-gray-100 shadow-xs">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Message officiel</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {item.contenu}
                        </p>
                      </div>

                      {/* ACTIONS FOR RECIPIENTS (School Director) */}
                      {!isDSE && !isObserver && (
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Signature d'accusé de réception (Obligatoire)</p>
                            <p className="text-xs text-blue-600">
                              {item.statut === 'Accusé' 
                                ? `Accusé signé électroniquement le ${new Date(item.accuseAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
                                : `Veuillez certifier avoir pris connaissance de cette directive officielle avant le délai prescrit.`}
                            </p>
                          </div>
                          {item.statut !== 'Accusé' ? (
                            <button
                              onClick={() => handleAcknowledge(item.id)}
                              className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              ✍️ Signer l'accusé de réception
                            </button>
                          ) : (
                            <div className="inline-flex items-center text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold">
                              <Check className="h-4 w-4 mr-1.5" /> Enregistré
                            </div>
                          )}
                        </div>
                      )}

                      {/* ACCUSE RECEPTION DETAILS FOR SENDER (DSE Director) */}
                      {isDSE && (
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-3 gap-2">
                            <h4 className="text-sm font-bold text-gray-900 flex items-center">
                              <Users className="h-4.5 w-4.5 mr-1.5 text-blue-600" />
                              Suivi des accusés de réception par Établissement (SF-24)
                            </h4>
                            <span className="text-xs text-gray-400 font-medium">
                              Canaux actifs : <span className="text-blue-600 font-bold">Portail Web</span> & <span className="text-blue-600 font-bold">SMS de repli</span>
                            </span>
                          </div>

                          {loadingReceipts ? (
                            <p className="text-xs text-gray-500 flex items-center py-2">
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Chargement du statut des établissements...
                            </p>
                          ) : receipts.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">Aucun destinataire généré pour cette cible.</p>
                          ) : (
                            <div className="space-y-4">
                              {/* Statistics Dashboard for this Circular */}
                              {(() => {
                                const total = receipts.length;
                                const signed = receipts.filter(r => r.statut === "Accusé").length;
                                const read = receipts.filter(r => r.statut === "Lu").length;
                                const unread = receipts.filter(r => r.statut === "Non lu").length;
                                const rate = total > 0 ? Math.round((signed / total) * 100) : 0;

                                return (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="text-center p-2 bg-white rounded shadow-2xs border border-gray-100">
                                      <p className="text-[10px] font-semibold text-gray-400 uppercase">Établissements ciblés</p>
                                      <p className="text-lg font-bold text-slate-800 mt-0.5">{total}</p>
                                    </div>
                                    <div className="text-center p-2 bg-white rounded shadow-2xs border border-gray-100">
                                      <p className="text-[10px] font-semibold text-emerald-600 uppercase">Accusés Signés</p>
                                      <p className="text-lg font-bold text-emerald-700 mt-0.5">{signed} <span className="text-xs font-normal text-emerald-500">({rate}%)</span></p>
                                    </div>
                                    <div className="text-center p-2 bg-white rounded shadow-2xs border border-gray-100">
                                      <p className="text-[10px] font-semibold text-blue-500 uppercase">Lus uniquement</p>
                                      <p className="text-lg font-bold text-blue-700 mt-0.5">{read}</p>
                                    </div>
                                    <div className="text-center p-2 bg-white rounded shadow-2xs border border-gray-100">
                                      <p className="text-[10px] font-semibold text-amber-500 uppercase">Non consultés</p>
                                      <p className="text-lg font-bold text-amber-600 mt-0.5">{unread}</p>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Search & Filter Receipts inside circular */}
                              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {receipts.map((rec) => {
                                  let badgeColor = "bg-red-50 text-red-700 border border-red-100";
                                  let badgeLabel = "Non consulté";
                                  if (rec.statut === "Lu") {
                                    badgeColor = "bg-blue-50 text-blue-700 border border-blue-100";
                                    badgeLabel = "Lu - Signature en attente";
                                  } else if (rec.statut === "Accusé") {
                                    badgeColor = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                                    badgeLabel = "Accusé de réception signé";
                                  }

                                  const schoolName = rec.etablissement?.nom || "Établissement non identifié";
                                  const schoolType = rec.etablissement?.type || "";
                                  const schoolArr = rec.etablissement?.arrondissement || rec.user?.arrondissement || "Burkina";
                                  const dirName = rec.user?.prenom || rec.user?.nom ? `${rec.user.prenom || ''} ${rec.user.nom || ''}`.trim() : "Directeur";

                                  return (
                                    <div key={rec.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-200 hover:bg-white hover:shadow-2xs transition-all text-xs gap-3">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-bold text-gray-900 text-sm">🏫 {schoolName}</span>
                                          {schoolType && (
                                            <span className="px-1.5 py-0.25 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded">
                                              {schoolType}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-gray-500 text-[11px] flex flex-wrap gap-x-2.5 gap-y-0.5 items-center">
                                          <span>📍 Arrondissement : <strong className="text-gray-700">{schoolArr}</strong></span>
                                          <span className="text-gray-300">•</span>
                                          <span>Responsable : <strong className="text-gray-700">{dirName}</strong> ({rec.user?.email})</span>
                                          {rec.user?.telephone && (
                                            <>
                                              <span className="text-gray-300">•</span>
                                              <span>📞 {rec.user.telephone}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
                                        <div className="flex items-center space-x-1 text-[11px] text-gray-400">
                                          <Smartphone className="h-3.5 w-3.5 text-blue-500" />
                                          <span>Canal SMS actif</span>
                                        </div>
                                        
                                        <span className={`px-2 py-1 rounded-md text-[11px] font-bold ${badgeColor}`}>
                                          {badgeLabel}
                                        </span>

                                        {rec.accuseAt && (
                                          <span className="text-emerald-700 text-[11px] font-semibold bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center">
                                            ✍️ Signé le {new Date(rec.accuseAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        )}

                                        {rec.statut !== "Accusé" && (
                                          <button
                                            onClick={() => handleSmsNudge(rec.user?.email || "Directeur", item.titre)}
                                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg transition-all shadow-2xs hover:shadow-xs flex items-center gap-1"
                                          >
                                            <Send className="h-3 w-3" />
                                            Relancer par SMS
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
