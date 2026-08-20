import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Mail, 
  Lock, 
  Shield, 
  AlertCircle, 
  Phone, 
  ArrowLeft, 
  KeyRound, 
  User, 
  Inbox, 
  Check, 
  Copy, 
  RefreshCw,
  HelpCircle,
  Clock,
  ShieldCheck,
  Zap,
  Info,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from './AuthProvider.tsx';

const DISPOSABLE_DOMAINS = [
  "yopmail.com", "tempmail.com", "mailinator.com", "10minutemail.com", 
  "trashmail.com", "dispostable.com", "guerrillamail.com", "sharklasers.com",
  "getairmail.com", "burnermail.io", "tempmailo.com"
];

export function Login() {
  const { setSecureSession } = useAuth();
  
  // Auth view mode: 'login' | 'register' | 'recover'
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recover'>('login');
  
  // Login mode: 'password' | 'token' (login with traditional password or security token)
  const [loginMode, setLoginMode] = useState<'password' | 'token'>('password');
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState('');
  
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [role, setRole] = useState('Directeur / Proviseur');
  const [arrondissement, setArrondissement] = useState('');

  // 2FA verification step
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [otpCode, setOtpCode] = useState('');

  // Feedback States
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Email validation helper state for live UI warnings
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  // Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Simulated Inbox state
  const [simulatedEmails, setSimulatedEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const rolesList = [
    "Administrateur DSE",
    "Directeur DSE",
    "Directeurs d'école",
    "Proviseur d'établissement",
    "Sécretaire Adminstratif",
    "Responsable d'Arrondissement",
    "utilisateur lambda(visiteur)"
  ];

  // Load and refresh simulated emails
  const fetchSimulatedEmails = async () => {
    try {
      const res = await fetch('/api/auth/simulated-emails');
      if (res.ok) {
        const data = await res.json();
        setSimulatedEmails(data);
      }
    } catch (e) {
      console.error("Error loading simulated emails", e);
    }
  };

  useEffect(() => {
    fetchSimulatedEmails();
    const interval = setInterval(fetchSimulatedEmails, 3000);
    return () => clearInterval(interval);
  }, []);

  // Validate email in real-time as the user types
  useEffect(() => {
    if (!email) {
      setEmailWarning(null);
      return;
    }
    
    // Check basic email syntax
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      setEmailWarning("Format d'adresse email non conforme aux techniques standard (ex: nom@domaine.com).");
      return;
    }

    // Check domain must be gmail.com
    const parts = email.split('@');
    if (parts.length === 2) {
      const domain = parts[1].toLowerCase().trim();
      if (domain !== 'gmail.com') {
        setEmailWarning("⚠️ Inscription & Connexion : L'email doit obligatoirement respecter le format: nom@gmail.com (Gmail uniquement).");
        return;
      }
    }

    setEmailWarning(null);
  }, [email]);

  // Strict password validation (at least 8 characters, composed of letters, signs/symbols, and numbers)
  // Capital letter only if it appears at the start, followed by lowercase letters.
  const validatePasswordSecured = (pass: string): { isValid: boolean; error?: string } => {
    if (!pass || pass.length < 8) {
      return { isValid: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
    }

    const hasLetter = /[a-zA-Z]/.test(pass);
    const hasDigit = /[0-9]/.test(pass);
    const hasSign = /[^a-zA-Z0-9]/.test(pass);

    if (!hasLetter) {
      return { isValid: false, error: "Le mot de passe doit contenir au moins une lettre." };
    }
    if (!hasDigit) {
      return { isValid: false, error: "Le mot de passe doit contenir au moins un chiffre." };
    }
    if (!hasSign) {
      return { isValid: false, error: "Le mot de passe doit contenir au moins un signe spécial (ex: @, #, $, %, etc.)." };
    }

    const hasUppercase = /[A-Z]/.test(pass);
    if (hasUppercase) {
      if (!/^[A-Z]/.test(pass)) {
        return { isValid: false, error: "La lettre majuscule est uniquement autorisée au tout début du mot de passe." };
      }
      const rest = pass.slice(1);
      if (/[A-Z]/.test(rest)) {
        return { isValid: false, error: "Seule la première lettre au début du mot de passe peut être majuscule. Les lettres suivantes doivent être minuscules." };
      }
    }

    return { isValid: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      // 2FA verification step logic
      if (step === '2fa') {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otpCode })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Code OTP incorrect ou expiré.");
        
        setSecureSession(data.token, data.user);
        return;
      }

      // 1. ACCOUNT RECOVERY MODE
      if (authMode === 'recover') {
        const res = await fetch('/api/auth/recover-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Une erreur est survenue lors de la récupération.");
        
        setSuccessMessage("Méthode de récupération activée avec succès ! Votre jeton d'accès sécurisé a été généré et envoyé à votre email simulé (voir panneau de droite).");
        setAuthMode('login');
        setLoginMode('token');
        fetchSimulatedEmails();
        return;
      }

      // 2. LOGIN MODE
      if (authMode === 'login') {
        const bodyObj: any = { email };
        if (loginMode === 'password') {
          bodyObj.password = password;
        } else {
          bodyObj.accessToken = accessToken;
        }

        const res = await fetch('/api/auth/login-secure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj)
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Échec de l'authentification.");
        }

        if (data.requires2FA) {
          setStep('2fa');
          setSuccessMessage("Double facteur (2FA) requis. Un code OTP à 6 chiffres a été simulé dans la console de votre serveur Express.");
        } else {
          setSecureSession(data.token, data.user);
        }
      } 
      
      // 3. REGISTER MODE
      else if (authMode === 'register') {
        // Strict password validation
        const passCheck = validatePasswordSecured(password);
        if (!passCheck.isValid) {
          throw new Error(`Sécurité insuffisante : ${passCheck.error}`);
        }

        if (emailWarning) {
          throw new Error(`Inscription refusée : ${emailWarning}`);
        }

        const res = await fetch('/api/auth/register-secure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            nom, 
            prenom, 
            email, 
            telephone, 
            password, 
            role, 
            arrondissement: arrondissement || null 
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur lors de la création du compte.");
        
        setSuccessMessage(`Félicitations, votre compte sécurisé a été créé ! Un jeton d'accès réutilisable (${data.accessToken}) vous a été envoyé par email. Veuillez vous connecter.`);
        setAuthMode('login');
        fetchSimulatedEmails();
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue lors de l'opération.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToken = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleBackToLogin = () => {
    setStep('credentials');
    setOtpCode('');
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[85vh]">
        
        {/* LEFT COLUMN: AUTHENTICATION FORM WRAPPER (7 cols) */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between bg-white relative">
          
          {/* Top Branding Header */}
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center space-x-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 shadow-md shadow-blue-200">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-950 leading-tight">
                  SGSIS de la Commune de Ouagadougou
                </h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Burkina Faso</p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
              <ShieldCheck className="h-3 w-3 mr-1 text-emerald-500" />
              Sécurisé AES-256
            </span>
          </div>

          <div className="my-auto py-6 space-y-6">
            
            {/* Context Titles */}
            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                {step === '2fa' 
                  ? 'Double Facteur (2FA)' 
                  : authMode === 'recover'
                    ? 'Récupération de compte'
                    : authMode === 'register'
                      ? 'Créer un profil sécurisé'
                      : 'Authentification d\'accès'}
              </h2>
              <p className="text-xs text-slate-500">
                {step === '2fa' 
                  ? 'Saisissez le code de sécurité envoyé sur votre téléphone mobile.' 
                  : authMode === 'recover'
                    ? 'Indiquez votre adresse email valide pour recevoir immédiatement votre jeton de code sécurisé.'
                    : authMode === 'register'
                      ? 'Remplissez vos informations personnelles obligatoires pour obtenir vos droits de contrôle.'
                      : 'Connectez-vous par mot de passe standard ou via votre jeton de code réutilisable.'}
              </p>
            </div>

            {/* Error and Success Feedback Alerts */}
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 p-3.5 flex items-start space-x-2.5">
                <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="text-xs font-semibold text-rose-800">{error}</div>
              </div>
            )}

            {successMessage && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3.5 flex items-start space-x-2.5">
                <Shield className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs font-medium text-emerald-800">{successMessage}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* 2FA Verification Form */}
              {step === '2fa' ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="otp-code" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Code OTP SMS (Simulé)</label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <KeyRound className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        id="otp-code"
                        type="text"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="block w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm font-semibold tracking-widest text-center"
                        placeholder="Ex: 123456"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="flex items-center text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Retour aux identifiants
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  
                  {/* General Email Address Field (Always visible) */}
                  <div>
                    <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Adresse Email</label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`block w-full rounded-xl border py-3 pl-10 pr-3 text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm ${
                          emailWarning ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                        }`}
                        placeholder="Ex: dse.agent@commune.bf"
                      />
                    </div>
                    {/* Real-time Email Validity & Security Check Warnings */}
                    {emailWarning && (
                      <p className={`mt-1.5 text-xs font-semibold ${emailWarning.includes("Alerte") ? "text-rose-600" : "text-amber-600"}`}>
                        {emailWarning}
                      </p>
                    )}
                  </div>

                  {/* ACCOUNT RECOVERY FIELD: Just email */}
                  {authMode === 'recover' && (
                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('login');
                          setError(null);
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-500 flex items-center"
                      >
                        <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                        Retour à la connexion
                      </button>
                    </div>
                  )}

                  {/* LOGIN MODE FIELDS */}
                  {authMode === 'login' && (
                    <>
                      {/* Connection Selector: Password vs Jeton Code Token */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setLoginMode('password');
                            setError(null);
                          }}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                            loginMode === 'password' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Mot de passe
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginMode('token');
                            setError(null);
                          }}
                          className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1 ${
                            loginMode === 'token' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Zap className="h-3 w-3 text-amber-500" />
                          <span>Jeton de code</span>
                        </button>
                      </div>

                      {/* Password field */}
                      {loginMode === 'password' ? (
                        <div>
                          <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Mot de passe</label>
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <Lock className="h-5 w-5 text-slate-400" />
                            </div>
                            <input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="block w-full rounded-xl border border-slate-200 py-3 pl-10 pr-10 text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm"
                              placeholder="••••••••"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                              title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                            >
                              {showPassword ? (
                                <EyeOff className="h-5 w-5" />
                              ) : (
                                <Eye className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Jeton Access Token field */
                        <div>
                          <label htmlFor="accessToken" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Jeton de Code de Sécurité</label>
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <KeyRound className="h-5 w-5 text-amber-500" />
                            </div>
                            <input
                              id="accessToken"
                              type="text"
                              required
                              value={accessToken}
                              onChange={(e) => setAccessToken(e.target.value)}
                              className="block w-full rounded-xl border border-amber-200 bg-amber-50/5 py-3 pl-10 pr-3 text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm font-mono font-bold"
                              placeholder="Ex: SGSIED-XYZ123-456"
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400 flex items-center">
                            <Info className="h-3 w-3 mr-1 text-slate-300" />
                            Saisissez le jeton d'accès unique généré lors de votre inscription ou récupération.
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('register');
                            setError(null);
                          }}
                          className="font-bold text-blue-600 hover:text-blue-500 transition-colors"
                        >
                          Créer un compte d'accès
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('recover');
                            setError(null);
                          }}
                          className="font-semibold text-slate-400 hover:text-slate-600 transition-colors flex items-center"
                        >
                          <HelpCircle className="h-3.5 w-3.5 mr-1" />
                          Mot de passe oublié ?
                        </button>
                      </div>
                    </>
                  )}

                  {/* REGISTRATION FIELDS */}
                  {authMode === 'register' && (
                    <>
                      {/* Name & Surname fields */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="prenom" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Prénom</label>
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <User className="h-4 w-4 text-slate-400" />
                            </div>
                            <input
                              id="prenom"
                              type="text"
                              required
                              value={prenom}
                              onChange={(e) => setPrenom(e.target.value)}
                              className="block w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm"
                              placeholder="Ex: Ibrahim"
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="nom" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Nom</label>
                          <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <User className="h-4 w-4 text-slate-400" />
                            </div>
                            <input
                              id="nom"
                              type="text"
                              required
                              value={nom}
                              onChange={(e) => setNom(e.target.value)}
                              className="block w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm"
                              placeholder="Ex: Sawadogo"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Phone Number Field */}
                      <div>
                        <label htmlFor="telephone" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Numéro de Téléphone</label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Phone className="h-4 w-4 text-slate-400" />
                          </div>
                          <input
                            id="telephone"
                            type="tel"
                            required
                            value={telephone}
                            onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ''))}
                            className="block w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm"
                            placeholder="Ex: 70000000"
                          />
                        </div>
                      </div>

                      {/* Password Field with Custom security requirements */}
                      <div>
                        <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Mot de passe sécurisé (Min 8 caractères)</label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Lock className="h-4 w-4 text-slate-400" />
                          </div>
                          <input
                            id="password"
                            type={showRegPassword ? "text" : "password"}
                            autoComplete="new-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="block w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-9 text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm"
                            placeholder="Ex: Nomprenom@68"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword(!showRegPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                            title={showRegPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          >
                            {showRegPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="mt-1.5 text-[10px] text-slate-400 leading-normal">
                          <span className="font-semibold text-slate-500">Exigence :</span> Minimum 8 caractères composé d'un ensemble de lettres (majuscule uniquement au début si présente, suivie de minuscules), de signes/symboles et de chiffres. <span className="italic font-medium text-blue-600">(Exemple : Nomprenom@68)</span>
                        </p>
                      </div>

                      {/* Role dropdown choice */}
                      <div>
                        <label htmlFor="role" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Poste / Fonction occupé</label>
                        <select
                          id="role"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm bg-white font-medium"
                        >
                          {rolesList.map((r, idx) => (
                            <option key={idx} value={r}>{r}</option>
                          ))}
                        </select>
                        <div className="mt-1.5 p-2 bg-slate-50 border border-slate-100 rounded-lg text-[10px] text-slate-500 font-medium">
                          {role === "Administrateur DSE" || role === "Directeur DSE" ? (
                            <span className="text-blue-700 font-semibold flex items-center">
                              <ShieldCheck className="h-3 w-3 mr-1 text-blue-600" />
                              Droit attribué d'office : pilotage complet du système (lecture, écriture, recherche)
                            </span>
                          ) : role === "utilisateur lambda(visiteur)" ? (
                            <span className="text-amber-700 font-semibold flex items-center">
                              <Info className="h-3 w-3 mr-1 text-amber-600" />
                              Droit attribué d'office : lecture et recherche uniquement
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold flex items-center">
                              <ShieldCheck className="h-3 w-3 mr-1 text-emerald-600" />
                              Droit attribué d'office : lecture, écriture et recherche (approprié au poste)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Arrondissement optional field */}
                      <div>
                        <label htmlFor="arrondissement" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Arrondissement d'exercice (optionnel)</label>
                        <select
                          id="arrondissement"
                          value={arrondissement}
                          onChange={(e) => setArrondissement(e.target.value)}
                          className="block w-full rounded-xl border border-slate-200 py-2.5 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm bg-white font-medium"
                        >
                          <option value="">Sélectionner un arrondissement</option>
                          {Array.from({ length: 12 }, (_, i) => `Arrondissement ${i + 1}`).map((arr) => (
                            <option key={arr} value={arr}>
                              {arr}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('login');
                            setError(null);
                          }}
                          className="font-bold text-blue-600 hover:text-blue-500 underline"
                        >
                          Déjà un compte ? Connexion
                        </button>
                      </div>
                    </>
                  )}

                </div>
              )}

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative flex w-full justify-center rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  {loading ? (
                    <div className="flex items-center">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Validation sécurisée...
                    </div>
                  ) : step === '2fa' ? (
                    'Confirmer le Code 2FA'
                  ) : authMode === 'recover' ? (
                    'Envoyer mon jeton de récupération'
                  ) : authMode === 'register' ? (
                    'Valider l\'inscription & Générer mon Jeton'
                  ) : (
                    'Se connecter au SGSIS'
                  )}
                </button>
              </div>

            </form>
          </div>

          {/* Core regulatory compliance notice at bottom */}
          <div className="border-t border-slate-100 pt-4 mt-4">
            <p className="text-[10px] text-slate-400 text-center flex flex-col items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>
                Conformité : Contrôle contre les emails frauduleux, blocage après 5 tentatives infructueuses, hachage cryptographique et audit de traçabilité.
              </span>
            </p>
          </div>

        </div>

        {/* RIGHT COLUMN: SIMULATED INBOX DRAWER (5 cols) */}
        <div className="lg:col-span-5 bg-slate-950 p-6 sm:p-8 flex flex-col justify-between text-slate-100 border-l border-slate-900 relative">
          
          <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
            {/* Box Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="h-3 w-3 bg-emerald-500 rounded-full animate-ping" />
                <div className="flex items-center space-x-2">
                  <Inbox className="h-5 w-5 text-emerald-400" />
                  <span className="text-sm font-extrabold uppercase tracking-widest text-emerald-400">SMTP Simulator</span>
                </div>
              </div>
              <button 
                onClick={fetchSimulatedEmails}
                className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-100 transition-colors"
                title="Actualiser la boîte de réception"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            {/* Sub description */}
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 shrink-0">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                🚀 <strong className="text-slate-200">Simulateur d'Email Local :</strong> Pour vous faciliter le test dans cet environnement bac à sable, les emails envoyés automatiquement par le système (welcome, jetons de sécurité, codes de récupération) apparaissent instantanément ici. Cliquez pour copier vos jetons !
              </p>
            </div>

            {/* Email Inbox List */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[480px] pr-1">
              {simulatedEmails.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-800 rounded-2xl">
                  <Clock className="h-8 w-8 text-slate-700 mb-3 animate-pulse" />
                  <p className="text-xs font-bold text-slate-500">Boîte aux lettres vide</p>
                  <p className="text-[10px] text-slate-600 mt-1 max-w-[180px]">
                    Créez un compte ou demandez une récupération pour voir les alertes arriver en temps réel.
                  </p>
                </div>
              ) : (
                simulatedEmails.map((item) => {
                  // Attempt to extract token or OTP code from body if present
                  const tokenMatch = item.body.match(/SGSIED-[A-Z0-9]+-[0-9]+/);
                  const otpMatch = item.body.match(/Code OTP SMS\s*:\s*(\d{6})/);
                  const parsedToken = tokenMatch ? tokenMatch[0] : (otpMatch ? otpMatch[1] : null);
                  const isOtp = !!otpMatch;

                  return (
                    <div 
                      key={item.id} 
                      onClick={() => setSelectedEmail(selectedEmail?.id === item.id ? null : item)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                        selectedEmail?.id === item.id 
                          ? 'bg-slate-900 border-slate-700 shadow-md' 
                          : 'bg-slate-900/40 border-slate-900 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-bold border ${
                          isOtp 
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                            : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        }`}>
                          {isOtp ? 'SGSIED Secure SMS (OTP)' : 'SGSIED Secure Mail'}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          {new Date(item.sentAt).toLocaleTimeString('fr-FR')}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 mt-2 truncate">{item.subject}</h4>
                      <p className="text-[10px] text-slate-400 mt-1">À: <span className="text-slate-300 font-medium font-mono">{item.to}</span></p>

                      {/* Preview body */}
                      {selectedEmail?.id === item.id ? (
                        <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                          <p className="text-[10px] text-slate-300 font-sans whitespace-pre-line leading-relaxed selection:bg-blue-600">
                            {item.body}
                          </p>
                          
                          {/* Token Action box */}
                          {parsedToken && (
                            <div className={`p-2.5 bg-slate-950/80 rounded-lg border flex items-center justify-between mt-2.5 ${
                              isOtp ? 'border-amber-500/30' : 'border-blue-500/20'
                            }`}>
                              <div>
                                <p className={`text-[8px] font-bold uppercase tracking-widest ${
                                  isOtp ? 'text-amber-500' : 'text-blue-400'
                                }`}>
                                  {isOtp ? 'Code OTP Détecté' : "Jeton d'Accès Détecté"}
                                </p>
                                <p className="text-xs font-mono font-black text-slate-100">{parsedToken}</p>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyToken(parsedToken, item.id);
                                }}
                                className={`inline-flex items-center justify-center p-2 rounded-md text-[10px] font-bold transition-all ${
                                  isOtp 
                                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' 
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                }`}
                              >
                                {copiedToken === item.id ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                    Copié !
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                    Copier
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 mt-2 truncate italic">
                          {item.body.substring(0, 70)}...
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* System status details at bottom */}
          <div className="border-t border-slate-900 pt-4 mt-4 text-[10px] text-slate-600 font-mono shrink-0 flex justify-between items-center">
            <span>SGSIED MAIL ENGINE v1.2</span>
            <span className="text-emerald-500 font-bold flex items-center">
              <span className="h-2 w-2 bg-emerald-500 rounded-full mr-1.5 inline-block" />
              ONLINE (SANDBOX)
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}
