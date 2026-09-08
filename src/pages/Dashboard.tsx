import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { apiFetch } from '../lib/api.ts';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  ShieldCheck, 
  Users, 
  Activity, 
  Droplets, 
  Monitor, 
  AlertTriangle, 
  Hammer, 
  TrendingUp, 
  Utensils, 
  Wifi, 
  Clock,
  Briefcase,
  FileText,
  FileSpreadsheet,
  Printer,
  Mail,
  Shield,
  ArrowRight,
  Plus,
  Send,
  Eye,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Lock,
  Unlock,
  Trash2,
  UserPlus,
  Search,
  Key,
  RefreshCw,
  UserCheck,
  UserX,
  ShieldAlert,
  Phone,
  MapPin,
  X
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell
} from 'recharts';
import { ARRONDISSEMENT_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, ROLES, SUPER_ADMIN_ROLES, SYSTEM_ADMIN_ROLES, hasAnyRole } from '../lib/roles.ts';
import * as XLSX from 'xlsx';

interface SchoolSummary {
  ecoles: number;
  classes: number;
  enseignants: number;
  filles: number;
  garcons: number;
  eleves: number;
}

interface AnnualSchoolReport {
  anneeScolaire: string;
  primary: {
    public: SchoolSummary;
    prive: SchoolSummary;
    total: SchoolSummary;
    byArrondissement: Array<{
      arrondissement: string;
      public: SchoolSummary;
      prive: SchoolSummary;
      total: SchoolSummary;
    }>;
  };
  secondary: {
    total: SchoolSummary;
    rows: Array<{
      etablissementId: number;
      nomEtablissement: string;
      arrondissement: string;
      classes: number;
      filles: number;
      garcons: number;
      eleves: number;
      enseignants: number;
    }>;
  };
  cep?: {
    source?: string;
    avecCandidatsLibres?: CepSummary;
    sansCandidatsLibres?: CepSummary;
  };
}

interface CepSummary {
  presents: { filles: number; garcons: number; total: number };
  admis: { filles: number; garcons: number; total: number };
  taux: { filles: number; garcons: number; total: number; province: number };
}

interface DashboardStats {
  totalEtablissements: number;
  conformiteCounts: {
    conforme: number;
    partiel: number;
    nonConforme: number;
    nonRenseigne: number;
  };
  constructionStats: {
    total: number;
    planifie: number;
    enCours: number;
    livre: number;
    suspendu: number;
    abandonne: number;
    totalBudget: number;
    totalConsomme: number;
  };
  enrollmentStats: {
    totalFilles: number;
    totalGarcons: number;
    totalEnseignants: number;
    totalEleves: number;
    byArrondissement: Array<{
      arrondissement: string;
      filles: number;
      garcons: number;
      total: number;
    }>;
  };
  washStats: {
    totalForages: number;
    totalForagesFonctionnels: number;
    totalLatrines: number;
    totalLatrinesFonctionnelles: number;
    totalCantinesFonctionnelles: number;
    countEvaluated: number;
  };
  ticeStats: {
    totalSallesInformatiques: number;
    totalOrdinateurs: number;
    totalOrdinateursFonctionnels: number;
    totalConnectes: number;
    countEvaluated: number;
  };
  incidentStats: {
    total: number;
    signale: number;
    enCours: number;
    resolu: number;
  };
  annualSchoolReport?: AnnualSchoolReport;
}

export default function Dashboard() {
  const { token, user } = useAuth();
  const isTechnicalSuperAdmin = hasAnyRole(user?.role, SUPER_ADMIN_ROLES);

  // General Stats State
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // DSE Admin Specific States
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminAudits, setAdminAudits] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<'audits' | 'control'>('control');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Add user Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newNom, setNewNom] = useState('');
  const [newPrenom, setNewPrenom] = useState('');
  const [newTelephone, setNewTelephone] = useState('');
  const [newRole, setNewRole] = useState<string>(ROLES.DIRECTEUR_DSE);
  const [newArrondissement, setNewArrondissement] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rolesList = [
    ROLES.DIRECTEUR_DSE,
    ROLES.RESPONSABLE_ARR
  ];

  // Cantine & WASH Direct Saisie States
  const [myEtab, setMyEtab] = useState<any>(null);
  const [myWash, setMyWash] = useState<any>(null);
  const [cwLoading, setCwLoading] = useState(false);
  const [showCwModal, setShowCwModal] = useState(false);
  
  // Form states
  const [cwNom, setCwNom] = useState('');
  const [cwType, setCwType] = useState<'Primaire' | 'Secondaire'>('Primaire');
  const [cwArrondissement, setCwArrondissement] = useState('');
  const [cwForages, setCwForages] = useState<number>(0);
  const [cwLatrines, setCwLatrines] = useState<number>(0);
  const [cwCantinesCount, setCwCantinesCount] = useState<number>(0);
  
  const [cwSubmitting, setCwSubmitting] = useState(false);
  const [cwSuccessMsg, setCwSuccessMsg] = useState<string | null>(null);
  const [cwErrorMsg, setCwErrorMsg] = useState<string | null>(null);

  const fetchMyEtabWash = async () => {
    if (!token) return;
    try {
      setCwLoading(true);
      const res = await apiFetch('/api/cantine-wash/my-establishment', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.etablissement) {
          setMyEtab(data.etablissement);
          setCwNom(data.etablissement.nom);
          setCwType(data.etablissement.type);
          setCwArrondissement(data.etablissement.arrondissement);
        } else {
          setCwNom('');
          setCwType(hasAnyRole(user?.role, [ROLES.PROVISEUR]) ? 'Secondaire' : 'Primaire');
          setCwArrondissement(user?.arrondissement || 'Arrondissement 1');
        }
        
        if (data.wash) {
          setMyWash(data.wash);
          setCwForages(data.wash.forages || 0);
          setCwLatrines(data.wash.latrines || 0);
          setCwCantinesCount(data.wash.cantinesCount || 0);
        } else {
          setCwForages(0);
          setCwLatrines(0);
          setCwCantinesCount(0);
        }
      }
    } catch (e) {
      console.error("Failed to load local establishment wash", e);
    } finally {
      setCwLoading(false);
    }
  };

  // Infrastructure Direct Saisie States
  const [myInfraEtab, setMyInfraEtab] = useState<any>(null);
  const [myInfra, setMyInfra] = useState<any>(null);
  const [infraLoading, setInfraLoading] = useState(false);
  const [showInfraModal, setShowInfraModal] = useState(false);

  // Form states
  const [infraNom, setInfraNom] = useState('');
  const [infraType, setInfraType] = useState<'Primaire' | 'Secondaire'>('Primaire');
  const [infraArrondissement, setInfraArrondissement] = useState('');
  const [infraEtudes, setInfraEtudes] = useState<number>(0);
  const [infraAdmin, setInfraAdmin] = useState<number>(0);
  const [infraLaboratoires, setInfraLaboratoires] = useState<number>(0);
  const [infraInfirmerie, setInfraInfirmerie] = useState<number>(0);

  const [infraSubmitting, setInfraSubmitting] = useState(false);
  const [infraSuccessMsg, setInfraSuccessMsg] = useState<string | null>(null);
  const [infraErrorMsg, setInfraErrorMsg] = useState<string | null>(null);

  const fetchMyEtabInfra = async () => {
    if (!token) return;
    try {
      setInfraLoading(true);
      const res = await apiFetch('/api/infrastructures/my-establishment', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.etablissement) {
          setMyInfraEtab(data.etablissement);
          setInfraNom(data.etablissement.nom);
          setInfraType(data.etablissement.type);
          setInfraArrondissement(data.etablissement.arrondissement);
        } else {
          setInfraNom('');
          setInfraType(hasAnyRole(user?.role, [ROLES.PROVISEUR]) ? 'Secondaire' : 'Primaire');
          setInfraArrondissement(user?.arrondissement || 'Arrondissement 1');
        }

        if (data.infrastructure) {
          setMyInfra(data.infrastructure);
          setInfraEtudes(data.infrastructure.batimentsEtudes?.total || 0);
          setInfraAdmin(data.infrastructure.batimentsAdmin?.total || 0);
          setInfraLaboratoires(data.infrastructure.laboratoires || 0);
          setInfraInfirmerie(data.infrastructure.infirmerie || 0);
        } else {
          setInfraEtudes(0);
          setInfraAdmin(0);
          setInfraLaboratoires(0);
          setInfraInfirmerie(0);
        }
      }
    } catch (e) {
      console.error("Failed to load local establishment infrastructure", e);
    } finally {
      setInfraLoading(false);
    }
  };

  const handleInfraSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!infraNom.trim()) {
      setInfraErrorMsg("Le nom de la structure scolaire est obligatoire.");
      return;
    }

    try {
      setInfraSubmitting(true);
      setInfraErrorMsg(null);
      setInfraSuccessMsg(null);

      const res = await apiFetch('/api/infrastructures/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nom: infraNom.trim(),
          type: infraType,
          arrondissement: infraArrondissement || user?.arrondissement || "Arrondissement 1",
          batimentsEtudes: infraEtudes,
          batimentsAdmin: infraAdmin,
          laboratoires: infraLaboratoires,
          infirmerie: infraInfirmerie
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors de la soumission");
      }

      const data = await res.json();
      setInfraSuccessMsg("Les données d'infrastructure de votre structure scolaire ont été enregistrées avec succès !");
      
      await fetchMyEtabInfra();

      // Refresh general stats
      const statsRes = await apiFetch('/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      setTimeout(() => {
        setShowInfraModal(false);
        setInfraSuccessMsg(null);
      }, 2000);
    } catch (err: any) {
      setInfraErrorMsg(err.message || "Une erreur de connexion est survenue.");
    } finally {
      setInfraSubmitting(false);
    }
  };

  const handleCwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!cwNom.trim()) {
      setCwErrorMsg("Le nom de la structure scolaire est obligatoire.");
      return;
    }
    
    try {
      setCwSubmitting(true);
      setCwErrorMsg(null);
      setCwSuccessMsg(null);
      
      const res = await apiFetch('/api/cantine-wash/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nom: cwNom.trim(),
          type: cwType,
          arrondissement: cwArrondissement || user?.arrondissement || "Arrondissement 1",
          forages: cwForages,
          latrines: cwLatrines,
          cantinesCount: cwCantinesCount
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors de la soumission");
      }
      
      await res.json();
      setCwSuccessMsg("Les données de votre structure scolaire ont été enregistrées avec succès !");
      
      await fetchMyEtabWash();
      
      // Refresh general stats
      const statsRes = await apiFetch('/api/dashboard/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      
      setTimeout(() => {
        setShowCwModal(false);
        setCwSuccessMsg(null);
      }, 2000);
      
    } catch (err: any) {
      console.error(err);
      setCwErrorMsg(err.message);
    } finally {
      setCwSubmitting(false);
    }
  };

  // Fetching Admin Data
  const fetchAdminData = async () => {
    if (!token) return;
    try {
      setAdminLoading(true);
      setAdminError(null);
      const [usersRes, auditsRes, healthRes] = await Promise.all([
        apiFetch('/api/users', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/audit-logs', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/system/health', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!usersRes.ok || !auditsRes.ok) {
        throw new Error("Erreur lors de la récupération des données d'administration.");
      }

      const usersData = await usersRes.json();
      const auditsData = await auditsRes.json();

      if (Array.isArray(usersData)) {
        setAdminUsers(usersData);
      }
      if (Array.isArray(auditsData)) {
        setAdminAudits(auditsData.sort((a, b) => new Date(b.log.createdAt).getTime() - new Date(a.log.createdAt).getTime()));
      }
      const healthData = await healthRes.json();
      setSystemHealth(healthData);
    } catch (err: any) {
      console.error(err);
      setAdminError(err.message);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    async function fetchStats() {
      if (!token) return;

      if (isTechnicalSuperAdmin) {
        setLoading(true);
        await fetchAdminData();
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await apiFetch('/api/dashboard/stats', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Erreur de chargement des statistiques');
        const data = await res.json();
        setStats(data);

        // Fetch local establishment if the user is a director or proviseur
        const isLocal = hasAnyRole(user?.role, LOCAL_SCHOOL_ROLES);
        if (isLocal) {
          await fetchMyEtabWash();
          await fetchMyEtabInfra();
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [token, isTechnicalSuperAdmin, user?.role]);

  // Handle Lock
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
      await fetchAdminData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Unlock
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
      await fetchAdminData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Delete (Refuse Access)
  const handleDeleteUser = async (userId: number) => {
    if (!token) return;
    if (!confirm("Êtes-vous certain de vouloir refuser l'accès à cet utilisateur et de supprimer définitivement son compte du système ?")) {
      return;
    }
    try {
      setActionLoading(userId);
      const res = await apiFetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors de la suppression de l'utilisateur");
      }
      await fetchAdminData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Delete Single Audit Log
  const handleDeleteAudit = async (logId: number) => {
    if (!token) return;
    if (!confirm("Supprimer cette ligne d'audit ?")) return;
    try {
      const res = await apiFetch(`/api/audit-logs/${logId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors de la suppression du log");
      }
      await fetchAdminData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Handle Clear All Audit Logs
  const handleClearAllAudits = async () => {
    if (!token) return;
    if (!confirm("ATTENTION : Êtes-vous certain de vouloir VIDER l'ensemble du journal des audits ? Cette action est irréversible !")) {
      return;
    }
    try {
      const res = await apiFetch(`/api/audit-logs`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erreur lors de la suppression des logs");
      }
      await fetchAdminData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Handle Add User
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
        throw new Error(d.error || "Une erreur est survenue lors de la création.");
      }

      setFormSuccess(`L'utilisateur ${newPrenom} ${newNom} a été créé avec succès et un jeton d'accès temporaire de sécurité a été émis.`);
      
      // Reset fields
      setNewEmail('');
      setNewNom('');
      setNewPrenom('');
      setNewTelephone('');
      setNewPassword('');
      setNewRole(ROLES.DIRECTEUR_DSE);
      setNewArrondissement('');
      setShowAddForm(false);
      
      await fetchAdminData();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-500 text-sm">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  if (!isTechnicalSuperAdmin && (error || !stats)) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md text-sm">
        Une erreur est survenue lors du chargement des statistiques du tableau de bord.
      </div>
    );
  }

  // Identify Dashboard Interface Group
  const role = user?.role;
  const isDseDirector = hasAnyRole(role, DSE_ROLES);
  const isLocalActor = hasAnyRole(role, LOCAL_SCHOOL_ROLES);
  const isObserver = !isDseDirector && !isLocalActor;

  // Pre-process conformite data for PieChart
  const conformiteData = stats ? [
    { name: 'Conforme', value: stats.conformiteCounts.conforme, color: '#10B981' },
    { name: 'Partiel', value: stats.conformiteCounts.partiel, color: '#F59E0B' },
    { name: 'Non Conforme', value: stats.conformiteCounts.nonConforme, color: '#EF4444' },
    { name: 'Non Renseigné', value: stats.conformiteCounts.nonRenseigne, color: '#94A3B8' }
  ].filter(item => item.value > 0) : [];

  // Pre-process construction status for BarChart
  const constructionData = stats ? [
    { name: 'Planifié', value: stats.constructionStats.planifie, color: '#3B82F6' },
    { name: 'En cours', value: stats.constructionStats.enCours, color: '#F59E0B' },
    { name: 'Livré', value: stats.constructionStats.livre, color: '#10B981' },
    { name: 'Suspendu', value: stats.constructionStats.suspendu, color: '#EF4444' },
    { name: 'Abandonné', value: stats.constructionStats.abandonne, color: '#64748B' }
  ] : [];

  // Pre-process WASH comparison data
  const washComparisonData = stats ? [
    {
      name: 'Forages',
      Total: stats.washStats.totalForages,
      Fonctionnels: stats.washStats.totalForagesFonctionnels
    },
    {
      name: 'Latrines',
      Total: stats.washStats.totalLatrines,
      Fonctionnels: stats.washStats.totalLatrinesFonctionnelles
    }
  ] : [];

  const totalOrdinateurs = stats?.ticeStats?.totalOrdinateurs ?? 0;
  const ordinateursFonctionnels = stats?.ticeStats?.totalOrdinateursFonctionnels ?? 0;
  const ticeConnectivityPercent = (stats?.ticeStats?.countEvaluated ?? 0) > 0 
    ? Math.round(((stats?.ticeStats?.totalConnectes ?? 0) / stats!.ticeStats.countEvaluated) * 100)
    : 0;

  const totalConformityEvaluated = stats ? (stats.conformiteCounts.conforme + stats.conformiteCounts.partiel + stats.conformiteCounts.nonConforme) : 0;
  const conformityPercent = totalConformityEvaluated > 0 
    ? Math.round((stats!.conformiteCounts.conforme / totalConformityEvaluated) * 100) 
    : 0;

  const annualReport = stats?.annualSchoolReport;
  const formatNumber = (value: number | null | undefined) => Number(value || 0).toLocaleString('fr-FR');

  const summaryToRow = (label: string, item: SchoolSummary) => ({
    Rubrique: label,
    Ecoles: item.ecoles,
    Classes: item.classes,
    Enseignants: item.enseignants,
    Filles: item.filles,
    Garcons: item.garcons,
    Total: item.eleves
  });

  const exportAnnualSchoolReportExcel = () => {
    if (!annualReport) return;

    const workbook = XLSX.utils.book_new();
    const primaryRows = [
      summaryToRow('Primaire public', annualReport.primary.public),
      summaryToRow('Primaire prive', annualReport.primary.prive),
      summaryToRow('Total primaire', annualReport.primary.total),
      ...annualReport.primary.byArrondissement.map(row => ({
        Arrondissement: row.arrondissement,
        'Ecoles publiques': row.public.ecoles,
        'Classes publiques': row.public.classes,
        'Enseignants public': row.public.enseignants,
        'Filles public': row.public.filles,
        'Garcons public': row.public.garcons,
        'Total public': row.public.eleves,
        'Ecoles privees': row.prive.ecoles,
        'Classes privees': row.prive.classes,
        'Enseignants prive': row.prive.enseignants,
        'Filles prive': row.prive.filles,
        'Garcons prive': row.prive.garcons,
        'Total prive': row.prive.eleves,
        'Total general': row.total.eleves
      }))
    ];

    const secondaryRows = [
      summaryToRow('Total secondaire municipal', annualReport.secondary.total),
      ...annualReport.secondary.rows.map(row => ({
        Etablissement: row.nomEtablissement,
        Arrondissement: row.arrondissement,
        Classes: row.classes,
        Enseignants: row.enseignants,
        Filles: row.filles,
        Garcons: row.garcons,
        Total: row.eleves
      }))
    ];

    const cepRows = annualReport.cep ? [
      {
        Rubrique: 'Avec candidats libres',
        'Présentes filles': annualReport.cep.avecCandidatsLibres?.presents.filles || 0,
        'Présents garçons': annualReport.cep.avecCandidatsLibres?.presents.garcons || 0,
        'Présents total': annualReport.cep.avecCandidatsLibres?.presents.total || 0,
        'Admises filles': annualReport.cep.avecCandidatsLibres?.admis.filles || 0,
        'Admis garçons': annualReport.cep.avecCandidatsLibres?.admis.garcons || 0,
        'Admis total': annualReport.cep.avecCandidatsLibres?.admis.total || 0,
        'Taux filles': annualReport.cep.avecCandidatsLibres?.taux.filles || 0,
        'Taux garçons': annualReport.cep.avecCandidatsLibres?.taux.garcons || 0,
        'Taux total': annualReport.cep.avecCandidatsLibres?.taux.total || 0,
        'Taux province': annualReport.cep.avecCandidatsLibres?.taux.province || 0
      },
      {
        Rubrique: 'Sans candidats libres',
        'Présentes filles': annualReport.cep.sansCandidatsLibres?.presents.filles || 0,
        'Présents garçons': annualReport.cep.sansCandidatsLibres?.presents.garcons || 0,
        'Présents total': annualReport.cep.sansCandidatsLibres?.presents.total || 0,
        'Admises filles': annualReport.cep.sansCandidatsLibres?.admis.filles || 0,
        'Admis garçons': annualReport.cep.sansCandidatsLibres?.admis.garcons || 0,
        'Admis total': annualReport.cep.sansCandidatsLibres?.admis.total || 0,
        'Taux filles': annualReport.cep.sansCandidatsLibres?.taux.filles || 0,
        'Taux garçons': annualReport.cep.sansCandidatsLibres?.taux.garcons || 0,
        'Taux total': annualReport.cep.sansCandidatsLibres?.taux.total || 0,
        'Taux province': annualReport.cep.sansCandidatsLibres?.taux.province || 0
      }
    ] : [];

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(primaryRows), 'Primaire');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(secondaryRows), 'Secondaire');
    if (cepRows.length > 0) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cepRows), 'CEP 2026');
    }
    XLSX.writeFile(workbook, `Synthese_scolaire_${annualReport.anneeScolaire}.xlsx`);
  };

  const printAnnualSchoolReport = () => {
    window.print();
  };

  // -------------------------------------------------------------
  // VIEW 0: INTERFACE ADMINISTRATEUR SYSTÈME DSE (Custom Security Dashboard)
  // -------------------------------------------------------------
  if (isTechnicalSuperAdmin) {
    return (
      <div className="space-y-6 animate-fade-in pb-10">
        <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-300">SuperAdmin technique</p>
          <h1 className="mt-2 text-3xl font-black">Centre de supervision</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">Contrôle global des comptes, des rôles, des blocages de sécurité et de la traçabilité du système.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Users className="h-5 w-5 text-blue-600" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Comptes surveillés</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{adminUsers.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Lock className="h-5 w-5 text-rose-600" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Comptes bloqués</p>
            <p className="mt-1 text-2xl font-black text-rose-700">{adminUsers.filter((account) => account.isLocked).length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Shield className="h-5 w-5 text-emerald-600" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Administrateurs métier</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">{adminUsers.filter((account) => hasAnyRole(account.role, SYSTEM_ADMIN_ROLES)).length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Activity className="h-5 w-5 text-amber-600" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Événements d’audit</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{adminAudits.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-cyan-600" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">État technique</p>
            <p className={`mt-1 text-sm font-black ${systemHealth?.status === 'operational' ? 'text-emerald-700' : 'text-rose-700'}`}>
              {systemHealth?.status === 'operational' ? 'Opérationnel' : 'À vérifier'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Base : {systemHealth?.database || 'inconnue'}</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/admin" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300">
            <Shield className="h-6 w-6 text-blue-600" />
            <h2 className="mt-3 font-bold text-slate-900">Administration des comptes</h2>
            <p className="mt-1 text-sm text-slate-500">Creer, surveiller, bloquer et revoquer les acces.</p>
          </Link>
          <Link to="/audit" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
            <h2 className="mt-3 font-bold text-slate-900">Journal d'audit</h2>
            <p className="mt-1 text-sm text-slate-500">Consulter les traces de securite et les actions metiers.</p>
          </Link>
          <Link to="/rapports-annuels" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300">
            <FileText className="h-6 w-6 text-emerald-600" />
            <h2 className="mt-3 font-bold text-slate-900">Rapports scolaires</h2>
            <p className="mt-1 text-sm text-slate-500">Surveiller l'etat des transmissions annuelles.</p>
          </Link>
        </div>
      </div>
    );
  }

  if (isTechnicalSuperAdmin) {
    const filteredUsers = adminUsers.filter(u => {
      const fullName = `${u.prenom || ''} ${u.nom || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const telephone = (u.telephone || '').toLowerCase();
      const role = (u.role || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      return fullName.includes(query) || email.includes(query) || telephone.includes(query) || role.includes(query);
    });

    const filteredAudits = adminAudits.filter(row => {
      const action = (row.log.action || '').toLowerCase();
      const entityType = (row.log.entityType || '').toLowerCase();
      const email = (row.user?.email || row.log.details?.email || '').toLowerCase();
      const fullName = `${row.user?.prenom || ''} ${row.user?.nom || ''}`.toLowerCase();
      const query = searchQuery.toLowerCase();
      return action.includes(query) || entityType.includes(query) || email.includes(query) || fullName.includes(query);
    });

    return (
      <div className="space-y-8 animate-fade-in pb-10">
        {/* Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-slate-800">
          <div className="absolute right-0 bottom-0 opacity-10 translate-y-6 translate-x-6 scale-150">
            <ShieldAlert className="w-64 h-64" />
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500 bg-opacity-20 text-indigo-200 border border-indigo-500 border-opacity-30 mb-4">
            Rôle : Administrateur Système DSE • Contrôle Central de Sécurité
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Console de Sécurité et de Traçabilité
          </h1>
          <p className="mt-2 text-slate-300 max-w-2xl text-sm leading-relaxed">
            Bienvenue sur votre tableau de bord exclusif d'administration système. Vous disposez de la haute autorité de contrôle de l'ensemble du réseau SGSIED : audit complet en direct, blocage instantané et création/révocation des comptes d'accès.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-xs font-mono">
            <div className="bg-white bg-opacity-5 backdrop-blur-sm px-3.5 py-2 rounded-lg border border-white border-opacity-5">
              <span className="text-slate-400">Administrateur :</span> {user?.prenom} {user?.nom}
            </div>
            <div className="bg-white bg-opacity-5 backdrop-blur-sm px-3.5 py-2 rounded-lg border border-white border-opacity-5">
              <span className="text-slate-400">Statut Système :</span> <span className="text-emerald-400 font-bold">Actif • Sécurisé</span>
            </div>
          </div>
        </div>

        {/* Security Counters */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
            <div className="rounded-lg bg-indigo-50 p-3 mr-4 text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Utilisateurs Enregistrés</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{adminUsers.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
            <div className="rounded-lg bg-rose-50 p-3 mr-4 text-rose-600">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Comptes Bloqués</p>
              <p className="text-2xl font-black text-rose-700 mt-0.5">
                {adminUsers.filter(u => u.isLocked).length}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
            <div className="rounded-lg bg-amber-50 p-3 mr-4 text-amber-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Traces d'Audit Actives</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{adminAudits.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center shadow-sm">
            <div className="rounded-lg bg-emerald-50 p-3 mr-4 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Seuil échecs d'accès</p>
              <p className="text-2xl font-black text-emerald-700 mt-0.5">3 Tentatives</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs and Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 gap-4">
          <div className="flex space-x-2">
            <button
              onClick={() => { setAdminTab('control'); setSearchQuery(''); }}
              className={`pb-4 px-4 text-sm font-bold border-b-2 transition ${
                adminTab === 'control'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4" />
                Accès et Contrôle
              </div>
            </button>
            <button
              onClick={() => { setAdminTab('audits'); setSearchQuery(''); }}
              className={`pb-4 px-4 text-sm font-bold border-b-2 transition ${
                adminTab === 'audits'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Journal des Audits
              </div>
            </button>
          </div>

          <div className="pb-3 flex gap-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder={adminTab === 'control' ? "Rechercher un utilisateur..." : "Rechercher un log d'audit..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-xl border border-gray-300 py-1.5 pl-9 pr-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
              />
            </div>

            <button
              onClick={fetchAdminData}
              disabled={adminLoading}
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition disabled:opacity-50"
              title="Rafraîchir les données"
            >
              <RefreshCw className={`h-4 w-4 ${adminLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab content error */}
        {adminError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-xs font-medium">
            {adminError}
          </div>
        )}

        {/* TAB 1: ACCES ET CONTROLE */}
        {adminTab === 'control' && (
          <div className="space-y-6">
            {/* Top Bar inside tab */}
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Gestion et Autorisation des Comptes</h3>
                <p className="text-xs text-slate-400">Ajouter de nouveaux membres, bloquer des comptes ou révoquer/refuser définitivement des accès.</p>
              </div>
              <button
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  setFormError(null);
                  setFormSuccess(null);
                }}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
              >
                {showAddForm ? (
                  <>
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Fermer le formulaire
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                    Ajouter un utilisateur
                  </>
                )}
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-slide-up">
                <div className="px-6 py-4 bg-slate-50 border-b border-gray-100">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center">
                    <UserPlus className="h-4 w-4 mr-2 text-indigo-600" />
                    Enregistrer un nouvel utilisateur
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
                        className="block w-full rounded-xl border border-gray-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                        placeholder="Ex: OUEDRAOGO"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Prénom</label>
                      <input
                        type="text"
                        required
                        value={newPrenom}
                        onChange={(e) => setNewPrenom(e.target.value)}
                        className="block w-full rounded-xl border border-gray-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                        placeholder="Ex: Marc"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email unique (Format @gmail.com)</label>
                      <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="block w-full rounded-xl border border-gray-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                        placeholder="Ex: marc@gmail.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Numéro de Téléphone (Chiffres uniquement)</label>
                      <input
                        type="tel"
                        required
                        value={newTelephone}
                        onChange={(e) => setNewTelephone(e.target.value.replace(/\D/g, ''))}
                        className="block w-full rounded-xl border border-gray-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                        placeholder="Ex: 65112233"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Mot de Passe Initial</label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="block w-full rounded-xl border border-gray-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                        placeholder="Ex: Securite@2026"
                      />
                      <p className="mt-1 text-[10px] text-slate-400">
                        Doit respecter la politique : 8 caractères minimum, une majuscule au début, lettre, chiffre, caractère spécial.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Rôle / Affectation dans le Système</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="block w-full rounded-xl border border-gray-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                      >
                        {rolesList.map((r, idx) => (
                          <option key={idx} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Arrondissement (Si applicable)</label>
                      <select
                        value={newArrondissement}
                        onChange={(e) => setNewArrondissement(e.target.value)}
                        className="block w-full rounded-xl border border-gray-200 py-2.5 px-3 text-slate-950 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 bg-white"
                      >
                        <option value="">Tous les Arrondissements (Global DSE)</option>
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
                      className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
                    >
                      {submitting ? "Création en cours..." : "Enregistrer et émettre les identifiants"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {formSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-semibold flex items-center gap-2 shadow-sm">
                <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                {formSuccess}
              </div>
            )}

            {/* Users List */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
              {adminLoading ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
                  Chargement de l'index des comptes...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-gray-400 italic">Aucun compte ne correspond à votre recherche.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredUsers.map((u) => (
                    <li key={u.id} className="p-6 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            <div className={`h-11 w-11 rounded-full ${u.isLocked ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'} border flex items-center justify-center font-black text-sm`}>
                              {(u.prenom || u.email).charAt(0).toUpperCase()}
                            </div>
                          </div>
                          <div className="ml-4 space-y-1">
                            <div className="text-sm font-bold text-gray-900 flex flex-wrap items-center gap-2">
                              <span>{u.prenom} {u.nom}</span>
                              <span className="text-xs text-slate-400 font-normal">({u.email})</span>
                              {user?.email === u.email && (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                  Moi (Admin Connecté)
                                </span>
                              )}
                              {u.isLocked && (
                                <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 gap-1 animate-pulse">
                                  <Lock className="h-2.5 w-2.5" /> BLOQUÉ
                                </span>
                              )}
                              {u.loginAttempts > 0 && !u.isLocked && (
                                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 gap-1">
                                  <AlertTriangle className="h-2.5 w-2.5" /> {u.loginAttempts}/3 échecs
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center text-xs text-gray-500 gap-x-4 gap-y-1">
                              <span className="flex items-center font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                <Shield className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-slate-500" />
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
                              <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full font-bold">
                                Jeton Actuel: {u.accessToken || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions block/unlock/delete */}
                        <div className="flex items-center gap-2">
                          {user?.email !== u.email && !hasAnyRole(u.role, SUPER_ADMIN_ROLES) && (
                            <>
                              {u.isLocked ? (
                                <button
                                  onClick={() => handleUnlockUser(u.id)}
                                  disabled={actionLoading === u.id}
                                  className="inline-flex items-center px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-700 transition"
                                  title="Déverrouiller le compte pour cet utilisateur"
                                >
                                  <Unlock className="h-3 w-3 mr-1" />
                                  Déverrouiller
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleLockUser(u.id)}
                                  disabled={actionLoading === u.id}
                                  className="inline-flex items-center px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-bold text-amber-700 transition"
                                  title="Bloquer temporairement l'accès de cet utilisateur"
                                >
                                  <Lock className="h-3 w-3 mr-1" />
                                  Bloquer
                                </button>
                              )}

                              {/* Delete/Refuse user completely */}
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={actionLoading === u.id}
                                className="inline-flex items-center p-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 transition"
                                title="Refuser l'accès / Supprimer définitivement l'utilisateur"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          <span className="inline-flex items-center rounded-lg bg-gray-50 border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-400 font-mono">
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
        )}

        {/* TAB 2: JOURNAL DES AUDITS */}
        {adminTab === 'audits' && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Journal d'Audit et Événements Sécurité</h3>
                <p className="text-xs text-slate-400">Traces absolues et immuables des événements d'authentification et de modification du réseau.</p>
              </div>
              <button
                onClick={handleClearAllAudits}
                className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Vider le Journal d'Audit
              </button>
            </div>

            {/* Audit Table */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
              {adminLoading ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
                  Chargement des traces d'audit...
                </div>
              ) : filteredAudits.length === 0 ? (
                <div className="p-12 text-center text-gray-400 italic">Aucune trace d'audit ne correspond à vos filtres.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Heure</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Utilisateur & Contact</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">M. de Passe (Hash) & Jeton</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Entité</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {filteredAudits.map((row, idx) => {
                        const u = row.user;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-gray-400" />
                                {new Date(row.log.createdAt).toLocaleString('fr-FR')}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-xs">
                              {u ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-900">{u.prenom} {u.nom}</div>
                                  <div className="text-slate-400 font-mono">{u.email}</div>
                                  {u.telephone && <div className="text-slate-400 font-mono">{u.telephone}</div>}
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-rose-600">{row.log.details?.createdBy || 'Inconnu / Système'}</div>
                                  {row.log.details?.email && <div className="text-slate-400 font-mono">{row.log.details.email}</div>}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-xs font-mono max-w-xs">
                              {u ? (
                                <div className="space-y-1">
                                  <div className="text-[10px] text-slate-500 truncate" title={u.passwordHash || ''}>
                                    <span className="font-bold text-slate-400">Hash:</span> {u.passwordHash ? u.passwordHash.substring(0, 15) + '...' : 'N/A'}
                                  </div>
                                  <div>
                                    <span className="inline-block bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                                      Jeton: {u.accessToken || 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Non applicable</span>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                row.log.action === 'CREATE' || row.log.action === 'CREATION_UTILISATEUR_ADMIN' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                                row.log.action === 'UPDATE' ? 'bg-blue-50 text-blue-800 border border-blue-100' :
                                row.log.action === 'DELETE' || row.log.action === 'SUPPRESSION_UTILISATEUR' ? 'bg-rose-50 text-rose-800 border border-rose-100' :
                                row.log.action === 'COMPTE_VERROUILLE' ? 'bg-red-100 text-red-900 animate-pulse border border-red-200' :
                                'bg-slate-50 text-slate-800 border border-slate-100'
                              }`}>
                                <Activity className="h-2.5 w-2.5 mr-1" />
                                {row.log.action}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500">
                              {row.log.entityType} <span className="text-slate-400">#{row.log.entityId}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-center text-xs">
                              <button
                                onClick={() => handleDeleteAudit(row.log.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 transition"
                                title="Supprimer ce log d'audit"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  if (isLocalActor) {
    return (
      <div className="space-y-8 animate-fade-in pb-10">
        {/* Customized Welcome Card */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 translate-y-6 translate-x-6 scale-150">
            <Building2 className="w-64 h-64" />
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-600 bg-opacity-40 text-blue-100 border border-blue-500 border-opacity-30 mb-4">
            Espace Acteur Local • Gestion des Établissements
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Bonjour, {user?.prenom || 'Cher'} {user?.nom || 'Collaborateur'} !
          </h1>
          <p className="mt-2 text-blue-100 max-w-2xl text-sm leading-relaxed">
            Bienvenue sur votre portail d'administration dédié. Vous disposez d'un droit complet de pilotage et de modification (CRUD) sur vos modules attribués : Gestion des Établissements (M1), Capitalisation des Effectifs (M3) et Communications Institutionnelles (M6).
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-xs font-mono">
            <div className="bg-white bg-opacity-10 backdrop-blur-sm px-3.5 py-2 rounded-lg border border-white border-opacity-10">
              <span className="text-blue-200">Poste :</span> {user?.role}
            </div>
            {user?.arrondissement && (
              <div className="bg-white bg-opacity-10 backdrop-blur-sm px-3.5 py-2 rounded-lg border border-white border-opacity-10">
                <span className="text-blue-200">Zone :</span> {user?.arrondissement}
              </div>
            )}
            <div className="bg-white bg-opacity-10 backdrop-blur-sm px-3.5 py-2 rounded-lg border border-white border-opacity-10">
              <span className="text-blue-200">Droit d'accès :</span> Lecture/Écriture complet (CRUD)
            </div>
          </div>
        </div>

        {/* Quick Access Modules grid */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Vos modules de gestion dédiés</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* MODULE M1 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between">
              <div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
                  <Building2 className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-gray-900">MODULE M1 : Gestion des Établissements</h3>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  Créez des fiches d'établissement complètes avec géolocalisation, procédez à l'archivage logique temporaire et réalisez l'import en masse (CSV/Excel) des 339 établissements avec contrôle automatique des doublons.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-50">
                <Link 
                  to="/etablissements" 
                  className="inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Ouvrir le module d'édition M1
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </div>
            </div>

            {/* MODULE M3 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between">
              <div>
                <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-gray-900">MODULE M3 : Capitalisation des Effectifs</h3>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  Effectuez les saisies et mises à jour annuelles des effectifs scolarisés (répartition Filles/Garçons), du personnel enseignant et de l'équipe administrative de vos établissements scolaires.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-50">
                <Link 
                  to="/effectifs" 
                  className="inline-flex items-center text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  Mettre à jour les effectifs scolaires M3
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </div>
            </div>

            {/* MODULE Cantine & WASH */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between">
              <div>
                <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
                  <Utensils className="h-6 w-6" />
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900">MODULE Cantine & WASH</h3>
                  {myEtab && (
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Configuré
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  Saisissez ou mettez à jour les informations WASH de votre structure : nom de l'établissement, type (primaire/secondaire), nombre de points d'eau, de latrines et de cantines de restauration.
                </p>
                {myEtab && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800 truncate">{myEtab.nom}</p>
                    <div className="flex justify-between">
                      <span>Type: <strong className="text-slate-800">{myEtab.type}</strong></span>
                      <span>Points d'eau: <strong className="text-slate-800">{cwForages}</strong></span>
                    </div>
                    <div className="flex justify-between">
                      <span>Latrines: <strong className="text-slate-800">{cwLatrines}</strong></span>
                      <span>Cantines: <strong className="text-slate-800">{cwCantinesCount}</strong></span>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-50">
                <button
                  onClick={() => setShowCwModal(true)}
                  className="inline-flex items-center text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline w-full text-left"
                >
                  {myEtab ? "Mettre à jour les données Cantine & WASH" : "Saisir les données Cantine & WASH"}
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </button>
              </div>
            </div>

            {/* MODULE Infrastructure */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between">
              <div>
                <div className="h-12 w-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-5">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900">MODULE Infrastructure</h3>
                  {myInfra && (
                    <span className="bg-sky-100 text-sky-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Configuré
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  Saisissez ou mettez à jour les bâtiments scolaires de votre centre : salles d'étude, bâtiments administratifs, laboratoires et infirmerie.
                </p>
                {myInfraEtab && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800 truncate">{myInfraEtab.nom}</p>
                    <div className="flex justify-between">
                      <span>Classes (études): <strong className="text-slate-800">{infraEtudes}</strong></span>
                      <span>Bât. Admin: <strong className="text-slate-800">{infraAdmin}</strong></span>
                    </div>
                    <div className="flex justify-between">
                      <span>Labos: <strong className="text-slate-800">{infraLaboratoires}</strong></span>
                      <span>Sanitaires (infirmerie): <strong className="text-slate-800">{infraInfirmerie}</strong></span>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-50 flex flex-col gap-2">
                <button
                  onClick={() => setShowInfraModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition shadow-xs hover:shadow-md w-full cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-white" />
                  {myInfra ? "Mettre à jour les infrastructures" : "Ajouter / Saisir les infrastructures"}
                </button>
              </div>
            </div>

            {/* MODULE M6 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between">
              <div>
                <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-gray-900">MODULE M6 : Communication & SMS</h3>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  Consultez les circulaires de la DSE, accusez réception de manière sécurisée avec enregistrement horodaté, et configurez les notifications urgentes par SMS de repli hors-ligne.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-50">
                <Link 
                  to="/communications" 
                  className="inline-flex items-center text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
                >
                  Consulter la boîte de réception M6
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </div>
            </div>

          </div>
        </div>

        {/* Focused Analytics Widget */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2">
            <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-indigo-600" />
              Aperçu Local des Effectifs
            </h3>
            <p className="text-xs text-gray-400 mb-5">
              Visualisation globale de l'équilibre filles/garçons par arrondissement pour situer votre établissement.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.enrollmentStats.byArrondissement}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="arrondissement" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Filles" fill="#EC4899" radius={[3, 3, 0, 0]} dataKey="filles" />
                  <Bar name="Garçons" fill="#3B82F6" radius={[3, 3, 0, 0]} dataKey="garcons" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center">
                <ShieldCheck className="h-5 w-5 mr-2 text-emerald-600" />
                État de Conformité Typologique
              </h3>
              <p className="text-xs text-gray-400 mb-5">
                Répartition globale de conformité des infrastructures scolaires de la commune de Ouagadougou.
              </p>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={conformiteData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={55}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {conformiteData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-2 mt-4 text-xs">
              {conformiteData.map((entry, index) => (
                <div key={index} className="flex items-center justify-between text-xs text-gray-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.color }}></span>
                    {entry.name}
                  </span>
                  <span className="font-bold text-gray-900">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cantine & WASH Data Entry Modal */}
        {showCwModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="cw-modal">
            <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-700 text-white">
                <div className="flex items-center gap-2.5">
                  <Utensils className="h-5.5 w-5.5" />
                  <div>
                    <h3 className="font-black text-lg text-white">Saisie Données Cantine & WASH</h3>
                    <p className="text-[10px] text-emerald-100">Renseigner les infrastructures d'eau et d'alimentation</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCwModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 transition text-white/80 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleCwSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-slate-950">
                {cwErrorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                    <span>{cwErrorMsg}</span>
                  </div>
                )}
                {cwSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{cwSuccessMsg}</span>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Nom de la structure */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      Nom de la structure scolaire *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Lycée Municipal de Ouagadougou"
                      value={cwNom}
                      onChange={(e) => setCwNom(e.target.value)}
                      className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
                    />
                  </div>

                  {/* Type d'établissement */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      Type d'établissement scolaire *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCwType('Primaire')}
                        className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition text-xs ${
                          cwType === 'Primaire' 
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold' 
                            : 'border-gray-200 text-gray-500 hover:bg-slate-50'
                        }`}
                      >
                        Établissement Primaire
                      </button>
                      <button
                        type="button"
                        onClick={() => setCwType('Secondaire')}
                        className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition text-xs ${
                          cwType === 'Secondaire' 
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold' 
                            : 'border-gray-200 text-gray-500 hover:bg-slate-50'
                        }`}
                      >
                        Établissement Secondaire
                      </button>
                    </div>
                  </div>

                  {/* Arrondissement */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      Arrondissement
                    </label>
                    <select
                      value={cwArrondissement}
                      onChange={(e) => setCwArrondissement(e.target.value)}
                      className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white"
                    >
                      {Array.from({ length: 12 }, (_, i) => `Arrondissement ${i + 1}`).map((arr) => (
                        <option key={arr} value={arr}>{arr}</option>
                      ))}
                    </select>
                  </div>

                  <hr className="border-gray-100 my-4" />

                  {/* Infrastructure stats */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* Points d'eau */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1 text-center">
                        Points d'eau (forages)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={cwForages}
                        onChange={(e) => setCwForages(Math.max(0, parseInt(e.target.value) || 0))}
                        className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-center font-bold"
                      />
                    </div>

                    {/* Latrines */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1 text-center">
                        Nombre de latrines
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={cwLatrines}
                        onChange={(e) => setCwLatrines(Math.max(0, parseInt(e.target.value) || 0))}
                        className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-center font-bold"
                      />
                    </div>

                    {/* Cantines */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1 text-center">
                        Nombre de cantines
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={cwCantinesCount}
                        onChange={(e) => setCwCantinesCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white text-center font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCwModal(false)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={cwSubmitting}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {cwSubmitting ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <Send className="h-3 w-3 text-white" />
                        Valider et Soumettre
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Infrastructure Data Entry Modal */}
        {showInfraModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="infra-modal">
            <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-sky-600 to-blue-700 text-white">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5.5 w-5.5" />
                  <div>
                    <h3 className="font-black text-lg text-white">Saisie des Infrastructures</h3>
                    <p className="text-[10px] text-sky-100">Renseigner l'inventaire physique de votre structure</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowInfraModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 transition text-white/80 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleInfraSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-slate-950">
                {infraErrorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                    <span>{infraErrorMsg}</span>
                  </div>
                )}
                {infraSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{infraSuccessMsg}</span>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Nom de la structure */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      Nom de la structure scolaire *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Lycée Municipal de Ouagadougou"
                      value={infraNom}
                      onChange={(e) => setInfraNom(e.target.value)}
                      className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 bg-white"
                    />
                  </div>

                  {/* Type d'établissement */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      Type d'établissement scolaire *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setInfraType('Primaire')}
                        className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition text-xs ${
                          infraType === 'Primaire' 
                            ? 'border-sky-500 bg-sky-50 text-sky-900 font-bold' 
                            : 'border-gray-200 text-gray-500 hover:bg-slate-50'
                        }`}
                      >
                        Établissement Primaire
                      </button>
                      <button
                        type="button"
                        onClick={() => setInfraType('Secondaire')}
                        className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition text-xs ${
                          infraType === 'Secondaire' 
                            ? 'border-sky-500 bg-sky-50 text-sky-900 font-bold' 
                            : 'border-gray-200 text-gray-500 hover:bg-slate-50'
                        }`}
                      >
                        Établissement Secondaire
                      </button>
                    </div>
                  </div>

                  {/* Arrondissement */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                      Arrondissement
                    </label>
                    <select
                      value={infraArrondissement}
                      onChange={(e) => setInfraArrondissement(e.target.value)}
                      className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 bg-white"
                    >
                      {Array.from({ length: 12 }, (_, i) => `Arrondissement ${i + 1}`).map((arr) => (
                        <option key={arr} value={arr}>{arr}</option>
                      ))}
                    </select>
                  </div>

                  <hr className="border-gray-100 my-4" />

                  {/* Infrastructure stats */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Salles d'étude */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1 text-center">
                        Bâtiment d'étude (salle)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={infraEtudes}
                        onChange={(e) => setInfraEtudes(Math.max(0, parseInt(e.target.value) || 0))}
                        className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 bg-white text-center font-bold"
                      />
                    </div>

                    {/* Bâtiments administratifs */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1 text-center">
                        Bâtiment administratif
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={infraAdmin}
                        onChange={(e) => setInfraAdmin(Math.max(0, parseInt(e.target.value) || 0))}
                        className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 bg-white text-center font-bold"
                      />
                    </div>

                    {/* Laboratoires */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1 text-center">
                        Bâtiment de laboratoire
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={infraLaboratoires}
                        onChange={(e) => setInfraLaboratoires(Math.max(0, parseInt(e.target.value) || 0))}
                        className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 bg-white text-center font-bold"
                      />
                    </div>

                    {/* Sanitaires (infirmerie) */}
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wide mb-1 text-center">
                        Sanitaires (infirmerie)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={infraInfirmerie}
                        onChange={(e) => setInfraInfirmerie(Math.max(0, parseInt(e.target.value) || 0))}
                        className="block w-full rounded-xl border border-gray-300 py-2 px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-600 bg-white text-center font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowInfraModal(false)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={infraSubmitting}
                    className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {infraSubmitting ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <Send className="h-3 w-3 text-white" />
                        Valider et Soumettre
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 3: INTERFACE CONSULTATIVE (lambda / Responsable d'Arrondissement)
  // -------------------------------------------------------------
  if (isObserver) {
    const isArrResp = hasAnyRole(role, ARRONDISSEMENT_ROLES);
    return (
      <div className="space-y-8 animate-fade-in pb-10">
        
        {/* Consultative Header Alert Badge */}
        {isArrResp ? (
          <div className="bg-gradient-to-r from-teal-700 to-emerald-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-10 translate-y-6 translate-x-6 scale-150">
              <Building2 className="w-64 h-64" />
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-600 bg-opacity-40 text-emerald-100 border border-emerald-500 border-opacity-30 mb-4">
              Espace Responsable d'Arrondissement • Pilotage Territorial
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Bonjour, {user?.prenom || ''} {user?.nom || ''} !
            </h1>
            <p className="mt-2 text-emerald-100 max-w-2xl text-sm leading-relaxed">
              Bienvenue sur votre espace de pilotage territorial de l'arrondissement de <strong className="text-white">{user?.arrondissement || 'votre zone'}</strong>. Toutes les données du tableau de bord ci-dessous ont été automatiquement filtrées pour votre arrondissement.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs font-mono">
              <div className="bg-white bg-opacity-10 backdrop-blur-sm px-3.5 py-2 rounded-lg border border-white border-opacity-10">
                <span className="text-emerald-200">Rôle :</span> Responsable d'Arrondissement
              </div>
              {user?.arrondissement && (
                <div className="bg-white bg-opacity-10 backdrop-blur-sm px-3.5 py-2 rounded-lg border border-white border-opacity-10">
                  <span className="text-emerald-200">Arrondissement :</span> {user?.arrondissement}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-slate-200 text-slate-700 shrink-0">
                <Shield className="h-5.5 w-5.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-slate-900 text-base">Portail de Consultation & Recherche</h2>
                  <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Lecture Seule
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Vous êtes connecté en tant que <strong>{role || 'Observateur'}</strong>. Ce tableau de bord offre une analyse globale en lecture seule des indicateurs de la DSE pour l'évaluation et la recherche stratégique.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 bg-white border border-slate-200 rounded-lg p-2 items-center gap-2 text-xs font-mono font-bold text-slate-600">
              <Clock className="h-4 w-4 text-slate-400" />
              Actualisé le {new Date().toLocaleDateString('fr-FR')}
            </div>
          </div>
        )}

        {/* Global KPIs Panel (Safe Read-Only, no creation) */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center">
            <div className="rounded-lg bg-slate-50 p-3 mr-4 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Établissements Totaux</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{stats.totalEtablissements}</p>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center">
            <div className="rounded-lg bg-slate-50 p-3 mr-4 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Taux de Conformité</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{conformityPercent}%</p>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center">
            <div className="rounded-lg bg-slate-50 p-3 mr-4 text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Effectif Élèves</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{stats.enrollmentStats.totalEleves.toLocaleString('fr-FR')}</p>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center">
            <div className="rounded-lg bg-slate-50 p-3 mr-4 text-amber-600">
              <Hammer className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Chantiers Actifs</p>
              <p className="text-2xl font-black text-gray-900 mt-0.5">{stats.constructionStats.enCours}</p>
            </div>
          </div>
        </div>

        {/* 2 core Recharts charts for observers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Chart 1 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center">
                <Users className="h-4.5 w-4.5 mr-2 text-indigo-500" />
                Distribution des Éléves par Arrondissement
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.enrollmentStats.byArrondissement}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="arrondissement" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Filles" fill="#EC4899" radius={[4, 4, 0, 0]} dataKey="filles" />
                  <Bar name="Garçons" fill="#3B82F6" radius={[4, 4, 0, 0]} dataKey="garcons" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center">
                <Droplets className="h-4.5 w-4.5 mr-2 text-blue-500" />
                Infrastructures Sanitaires (WASH)
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={washComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Total" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Fonctionnels" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Read-Only Secondary Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center mb-3">
              <Utensils className="h-4 w-4 mr-1.5 text-orange-500" /> Vivres & Cantines (WASH)
            </h4>
            <div className="flex items-center justify-between text-xs mt-2 text-gray-600">
              <span>Cantines fonctionnelles :</span>
              <span className="font-bold text-gray-900">{stats.washStats.totalCantinesFonctionnelles}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center mb-3">
              <Monitor className="h-4 w-4 mr-1.5 text-indigo-500" /> Connectivité TICE
            </h4>
            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex items-center justify-between">
                <span>Parc PC fonctionnels :</span>
                <span className="font-bold text-gray-900">{ordinateursFonctionnels} / {totalOrdinateurs}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Connectés internet :</span>
                <span className="font-bold text-gray-900">{stats.ticeStats.totalConnectes}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center mb-3">
              <AlertTriangle className="h-4 w-4 mr-1.5 text-red-500" /> Maintenance & Incidents
            </h4>
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
              <div className="p-1 rounded bg-red-50 text-red-700 border border-red-100">
                {stats.incidentStats.signale} Signalés
              </div>
              <div className="p-1 rounded bg-yellow-50 text-yellow-700 border border-yellow-100">
                {stats.incidentStats.enCours} En cours
              </div>
              <div className="p-1 rounded bg-green-50 text-green-700 border border-green-100">
                {stats.incidentStats.resolu} Résolus
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 1: INTERFACE 1 (Administrators / Director DSE Group)
  // -------------------------------------------------------------
  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #annual-school-report, #annual-school-report * { visibility: visible; }
          #annual-school-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
            background: white;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      {/* Welcome header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-100 pb-5">
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 mb-2">
            Tableau de bord de Direction DSE & Administration Système
          </span>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Tableau de bord de la DSE</h1>
          <p className="mt-2 text-sm text-gray-500">
            Commune de Ouagadougou • Vue d'ensemble stratégique et pilotage des indicateurs clés.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
          <Activity className="h-5 w-5 text-blue-600 animate-pulse" />
          <span className="text-xs font-semibold text-blue-800">
            Mise à jour en temps réel
          </span>
        </div>
      </div>

      {annualReport && (
        <section id="annual-school-report" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                <FileText className="h-3.5 w-3.5" />
                Rapport annuel DSE
              </div>
              <h2 className="mt-3 text-xl font-extrabold text-gray-900">
                Synthèse des données scolaires {annualReport.anneeScolaire}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Vue consolidée des écoles primaires et établissements secondaires municipaux renseignés dans SGSIS.
              </p>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportAnnualSchoolReportExcel}
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </button>
              <button
                type="button"
                onClick={printAnnualSchoolReport}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Printer className="h-4 w-4 mr-2" />
                PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {[
              { label: 'Primaire public', value: annualReport.primary.public },
              { label: 'Primaire privé', value: annualReport.primary.prive },
              { label: 'Total primaire', value: annualReport.primary.total }
            ].map(item => (
              <div key={item.label} className="p-5">
                <p className="text-sm font-bold text-gray-900">{item.label}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Écoles</p>
                    <p className="text-lg font-black text-gray-900">{formatNumber(item.value.ecoles)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Classes</p>
                    <p className="text-lg font-black text-gray-900">{formatNumber(item.value.classes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Enseignants</p>
                    <p className="text-lg font-black text-gray-900">{formatNumber(item.value.enseignants)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Élèves</p>
                    <p className="text-lg font-black text-gray-900">{formatNumber(item.value.eleves)}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Filles : <span className="font-bold text-gray-700">{formatNumber(item.value.filles)}</span> • Garçons : <span className="font-bold text-gray-700">{formatNumber(item.value.garcons)}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="overflow-x-auto">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Primaire par arrondissement</h3>
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Arrondissement</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Public</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Privé</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Élèves</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Classes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {annualReport.primary.byArrondissement.map(row => (
                    <tr key={row.arrondissement}>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.arrondissement}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNumber(row.public.ecoles)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNumber(row.prive.ecoles)}</td>
                      <td className="px-3 py-2 text-right text-gray-900 font-semibold">{formatNumber(row.total.eleves)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNumber(row.total.classes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Établissements secondaires municipaux</h3>
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Établissement</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Classes</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Enseignants</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Filles</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Garçons</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {annualReport.secondary.rows.slice(0, 12).map(row => (
                    <tr key={row.etablissementId}>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.nomEtablissement}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNumber(row.classes)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNumber(row.enseignants)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNumber(row.filles)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatNumber(row.garcons)}</td>
                      <td className="px-3 py-2 text-right text-gray-900 font-semibold">{formatNumber(row.eleves)}</td>
                    </tr>
                  ))}
                  {annualReport.secondary.rows.length > 12 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-center text-gray-500">
                        {annualReport.secondary.rows.length - 12} autres lignes disponibles dans l'export Excel.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {annualReport.cep && (
            <div className="mx-6 mb-6 rounded-lg border border-cyan-100 bg-cyan-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-bold text-cyan-950">Résultats CEP 2026</h3>
                <span className="text-xs font-semibold text-cyan-700">{annualReport.cep.source}</span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-cyan-100 text-xs">
                  <thead>
                    <tr className="text-cyan-900">
                      <th className="px-3 py-2 text-left font-semibold">Rubrique</th>
                      <th className="px-3 py-2 text-right font-semibold">Présents</th>
                      <th className="px-3 py-2 text-right font-semibold">Admis</th>
                      <th className="px-3 py-2 text-right font-semibold">Taux filles</th>
                      <th className="px-3 py-2 text-right font-semibold">Taux garçons</th>
                      <th className="px-3 py-2 text-right font-semibold">Taux total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-100 bg-white">
                    {[
                      { label: 'Avec candidats libres', value: annualReport.cep.avecCandidatsLibres },
                      { label: 'Sans candidats libres', value: annualReport.cep.sansCandidatsLibres }
                    ].map(row => row.value && (
                      <tr key={row.label}>
                        <td className="px-3 py-2 font-semibold text-gray-800">{row.label}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatNumber(row.value.presents.total)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatNumber(row.value.admis.total)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{row.value.taux.filles.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right text-gray-700">{row.value.taux.garcons.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{row.value.taux.total.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Numerical Indicators Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Etablissements */}
        <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center hover:shadow-md transition-shadow">
          <div className="rounded-lg bg-blue-50 p-3.5 mr-5">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Établissements</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalEtablissements}</p>
          </div>
        </div>

        {/* Card 2: Conformity Rate */}
        <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center hover:shadow-md transition-shadow">
          <div className="rounded-lg bg-emerald-50 p-3.5 mr-5">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Taux de Conformité</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{conformityPercent}%</p>
          </div>
        </div>

        {/* Card 3: School Enrollment */}
        <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center hover:shadow-md transition-shadow">
          <div className="rounded-lg bg-indigo-50 p-3.5 mr-5">
            <Users className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Éléves</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.enrollmentStats.totalEleves.toLocaleString('fr-FR')}</p>
          </div>
        </div>

        {/* Card 4: Construction projects */}
        <div className="bg-white overflow-hidden shadow-sm rounded-xl border border-gray-100 p-6 flex items-center hover:shadow-md transition-shadow">
          <div className="rounded-lg bg-amber-50 p-3.5 mr-5">
            <Hammer className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Chantiers en cours</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.constructionStats.enCours}</p>
          </div>
        </div>
      </div>

      {/* Interactive Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Enrollment per Arrondissement */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <Users className="h-5 w-5 mr-2 text-indigo-500" />
              Distribution des Effectifs par Arrondissement
            </h3>
            <p className="text-xs text-gray-400 mt-1">Comparatif des effectifs de filles et garçons.</p>
          </div>
          <div className="h-80 flex-1">
            {stats.enrollmentStats.byArrondissement.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                Aucune donnée d'effectif disponible
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.enrollmentStats.byArrondissement}
                  margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="arrondissement" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#FFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}
                    labelStyle={{ fontWeight: 'bold', color: '#1E293B' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar name="Filles" fill="#EC4899" radius={[4, 4, 0, 0]} dataKey="filles" />
                  <Bar name="Garçons" fill="#3B82F6" radius={[4, 4, 0, 0]} dataKey="garcons" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Conformite des Infrastructures */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <ShieldCheck className="h-5 w-5 mr-2 text-emerald-500" />
              État de Conformité Global
            </h3>
            <p className="text-xs text-gray-400 mt-1">Conformité par rapport aux modèles types de la DSE (A & B).</p>
          </div>
          <div className="h-80 flex-1 flex flex-col md:flex-row items-center justify-between">
            {conformiteData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm italic">
                Aucune donnée de conformité disponible
              </div>
            ) : (
              <>
                <div className="w-full md:w-3/5 h-64 md:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={conformiteData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {conformiteData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-2/5 space-y-3 mt-4 md:mt-0">
                  {conformiteData.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex items-center space-x-2">
                        <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                        <span className="text-xs font-semibold text-gray-700">{entry.name}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-900">
                        {entry.value} ({Math.round((entry.value / stats.totalEtablissements) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chart 3: WASH Indicators */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <Droplets className="h-5 w-5 mr-2 text-blue-500" />
              Infrastructures Sanitaires (WASH)
            </h3>
            <p className="text-xs text-gray-400 mt-1">Comparatif des infrastructures totales vs fonctionnelles.</p>
          </div>
          <div className="h-80 flex-1">
            {stats.washStats.countEvaluated === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                Aucune évaluation WASH enregistrée
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={washComparisonData}
                  margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                  <Bar dataKey="Total" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Fonctionnels" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Constructions Progression */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <Hammer className="h-5 w-5 mr-2 text-amber-500" />
              Suivi et État des Chantiers
            </h3>
            <p className="text-xs text-gray-400 mt-1">Nombre de chantiers par jalon d'avancement.</p>
          </div>
          <div className="h-80 flex-1">
            {stats.constructionStats.total === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                Aucun projet de construction planifié
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={constructionData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Chantiers" radius={[0, 4, 4, 0]}>
                    {constructionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Specific Secondary Modules Summaries (WASH, TICE, Incidents) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* WASH specific summary */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-2">
            <h4 className="text-sm font-bold text-gray-900 flex items-center">
              <Utensils className="h-4.5 w-4.5 mr-2 text-orange-500" /> Vivres & Cantines
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full">
              WASH
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Cantines fonctionnelles :</span>
            <span className="text-base font-bold text-gray-900">
              {stats.washStats.totalCantinesFonctionnelles}
            </span>
          </div>
          <p className="text-xs text-gray-400 italic">
            Évaluations basées sur {stats.washStats.countEvaluated} rapports terrain d'établissements scolaires.
          </p>
        </div>

        {/* TICE specific summary */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-2">
            <h4 className="text-sm font-bold text-gray-900 flex items-center">
              <Monitor className="h-4.5 w-4.5 mr-2 text-indigo-500" /> Connectivité & TICE
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
              TICE
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Parc PC fonctionnels :</span>
              <span className="font-bold text-gray-900">
                {ordinateursFonctionnels} / {totalOrdinateurs}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Taux de connectivité internet :</span>
              <span className="font-bold text-gray-900">
                {ticeConnectivityPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Incidents specific summary */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-50 pb-2">
            <h4 className="text-sm font-bold text-gray-900 flex items-center">
              <AlertTriangle className="h-4.5 w-4.5 mr-2 text-red-500" /> Maintenance & Incidents
            </h4>
            <span className="text-xs font-semibold px-2 py-0.5 bg-red-50 text-red-700 rounded-full">
              Incidents
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-red-50 border border-red-100">
              <div className="font-bold text-red-700">{stats.incidentStats.signale}</div>
              <div className="text-gray-400 mt-0.5 font-medium scale-90">Signalés</div>
            </div>
            <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-100">
              <div className="font-bold text-yellow-700">{stats.incidentStats.enCours}</div>
              <div className="text-gray-400 mt-0.5 font-medium scale-90">En cours</div>
            </div>
            <div className="p-2 rounded-lg bg-green-50 border border-green-100">
              <div className="font-bold text-green-700">{stats.incidentStats.resolu}</div>
              <div className="text-gray-400 mt-0.5 font-medium scale-90">Résolus</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
