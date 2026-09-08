import React, { useState } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Upload, X, AlertCircle, CheckCircle2, AlertTriangle, Download, FileSpreadsheet, RefreshCw, Cloud } from 'lucide-react';

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportCsvModal({ isOpen, onClose, onSuccess }: ImportCsvModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const { token } = useAuth();

  const driveClientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
  const driveApiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY as string | undefined;
  const driveAppId = import.meta.env.VITE_GOOGLE_DRIVE_APP_ID as string | undefined;

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      acceptFile(e.target.files[0]);
    }
  };

  const acceptFile = (candidate: File) => {
    const name = candidate.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.pdf')) {
      setError('Format de fichier non supporte. Utilisez CSV, Excel ou PDF.');
      return;
    }
    setFile(candidate);
    setReport(null);
    setError(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const ext = droppedFile.name.toLowerCase();
      if (ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.pdf')) {
        setFile(droppedFile);
        setReport(null);
        setError(null);
      } else {
        setError("Format de fichier non supporté. Veuillez déposer un fichier CSV, Excel ou PDF.");
      }
    }
  };

  const loadGoogleScripts = async () => {
    const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger Google Drive.'));
      document.body.appendChild(script);
    });
    await loadScript('https://apis.google.com/js/api.js');
    await loadScript('https://accounts.google.com/gsi/client');
    await new Promise<void>((resolve, reject) => window.gapi.load('picker', { callback: resolve, onerror: reject }));
  };

  const chooseFromGoogleDrive = async () => {
    if (!driveClientId || !driveApiKey || !driveAppId) {
      setError('Google Drive necessite VITE_GOOGLE_DRIVE_CLIENT_ID, VITE_GOOGLE_DRIVE_API_KEY et VITE_GOOGLE_DRIVE_APP_ID dans .env.');
      return;
    }
    setDriveLoading(true);
    setError(null);
    try {
      await loadGoogleScripts();
      await new Promise<void>((resolve, reject) => {
        let completed = false;
        const complete = (callback: () => void) => {
          if (completed) return;
          completed = true;
          callback();
        };

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: driveClientId,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
          callback: (oauthResponse: any) => {
            if (oauthResponse.error) {
              complete(() => reject(new Error('Autorisation Google Drive refusee.')));
              return;
            }

            try {
              const picker = new window.google.picker.PickerBuilder()
                .setDeveloperKey(driveApiKey)
                .setAppId(driveAppId)
                .setOAuthToken(oauthResponse.access_token)
                .addView(new window.google.picker.DocsView().setMimeTypes('text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
                .setCallback(async (pickerData: any) => {
                  if (pickerData.action !== window.google.picker.Action.PICKED) {
                    complete(resolve);
                    return;
                  }

                  const selected = pickerData.docs?.[0];
                  if (!selected) {
                    complete(resolve);
                    return;
                  }

                  try {
                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${selected.id}?alt=media`, {
                      headers: { Authorization: `Bearer ${oauthResponse.access_token}` }
                    });
                    if (!response.ok) throw new Error('Le fichier Google Drive ne peut pas etre telecharge.');
                    const blob = await response.blob();
                    acceptFile(new File([blob], selected.name || 'google-drive-file', { type: blob.type }));
                    complete(resolve);
                  } catch (downloadError) {
                    complete(() => reject(downloadError));
                  }
                })
                .build();
              picker.setVisible(true);
            } catch (pickerError) {
              complete(() => reject(pickerError));
            }
          }
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
      });
    } catch (driveError: any) {
      setError(driveError.message || 'Erreur pendant la connexion a Google Drive.');
    } finally {
      setDriveLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !token) return;

    setLoading(true);
    setError(null);
    setReport(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch('/api/etablissements/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'importation");
      }
      setReport(data);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadErrorReport = () => {
    if (!report || !report.errorRows || report.errorRows.length === 0) return;

    // Colonnes du rapport d'erreur
    const headers = ["Ligne", "Nom", "Type", "Arrondissement", "Statut", "Directeur", "Coordonnees", "Motif d'erreur"];
    
    const rows = report.errorRows.map((item: any) => [
      item.line || "",
      item.nom || "",
      item.type || "",
      item.arrondissement || "",
      item.statut || "",
      item.nomDirecteur || "",
      item.coordonnees || "",
      item.motif || ""
    ]);

    // Encodage en format CSV avec BOM UTF-8 pour Excel
    const csvContent = [
      headers.join(";"),
      ...rows.map((row: any[]) => 
        row.map(val => {
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(";")
      )
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rapport_erreurs_import_${file ? file.name.split('.')[0] : 'etablissements'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetState = () => {
    setFile(null);
    setReport(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-slate-900 bg-opacity-60" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

        <div className="inline-block transform overflow-hidden rounded-xl bg-white text-left align-bottom shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:align-middle border border-slate-100">
          
          {/* Header */}
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Importation en masse d'établissements
            </h3>
            <button 
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="bg-white px-6 py-5">
            {/* Guide & Requirements */}
            <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
              <h4 className="font-semibold text-slate-700 mb-2">Instructions d'importation :</h4>
              <p className="mb-2">
                Le système valide la structure de votre fichier avant traitement. Un contrôle de doublon est effectué sur la paire <strong className="text-slate-800">Nom + Arrondissement</strong>.
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-white p-2 rounded.md border border-slate-100">
                <div><span className="font-semibold text-slate-800">Nom :</span> Requis (ex: "École Ouezzin")</div>
                <div><span className="font-semibold text-slate-800">Type :</span> Requis ("Primaire" ou "Secondaire")</div>
                <div><span className="font-semibold text-slate-800">Arrondissement :</span> Requis (ex: "Arrondissement 1")</div>
                <div><span className="font-semibold text-slate-800">Statut :</span> Requis ("public", "privé", "en construction")</div>
                <div className="col-span-2"><span className="font-semibold text-slate-800">Directeur :</span> Optionnel</div>
                <div className="col-span-2"><span className="font-semibold text-slate-800">Coordonnées :</span> Optionnel (Format "Latitude, Longitude" ex: "12.368, -1.527")</div>
              </div>
            </div>

            {/* Error main alerts */}
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-lg flex items-start gap-2.5 text-sm">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold">Échec de l'importation</h5>
                  <p className="mt-0.5 text-red-600">{error}</p>
                </div>
              </div>
            )}

            {/* Step 1: Upload local or Google Drive */}
            {!report && (
              <div className="space-y-3">
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragActive 
                    ? 'border-blue-500 bg-blue-50/50' 
                    : file 
                    ? 'border-emerald-400 bg-emerald-50/20' 
                    : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <input
                  id="file-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                
                {file ? (
                  <div className="space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                      <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB - Fichier prêt pour l'analyse</p>
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="text-xs text-red-600 hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Choisir un autre fichier
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Faites glisser votre fichier ici, ou parcourez</p>
                      <p className="text-xs text-slate-400 mt-1">Accepte CSV, Excel et PDF</p>
                    </div>
                  </div>
                )}
              </div>
              <button type="button" onClick={chooseFromGoogleDrive} disabled={driveLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                <Cloud className="h-4 w-4" />
                {driveLoading ? 'Connexion a Google Drive...' : 'Choisir dans Google Drive'}
              </button>
              </div>
            )}

            {/* Step 2: Consolidated Report of Results */}
            {report && (
              <div className="space-y-6">
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">{report.pdf ? 'PDF extrait avec succes' : 'Analyse et traitement termines'}</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      {report.pdf ? 'Le contenu est disponible en apercu. Verifiez-le puis saisissez les donnees structurees dans Rapports scolaires annuels.' : `${report.imported} fiches d'etablissement ont ete integrees avec succes sur un total de ${report.total} lignes lues.`}
                    </p>
                  </div>
                </div>

                {report.pdf && (
                  <div className="rounded-lg border border-slate-200 bg-slate-950 p-4">
                    <p className="mb-2 text-xs font-bold text-slate-300">Apercu du texte extrait</p>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-slate-200">{report.textPreview}</pre>
                  </div>
                )}

                {/* KPI metrics row */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-center">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total lignes</span>
                    <span className="text-xl font-bold text-slate-800 mt-0.5 block">{report.total}</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-center">
                    <span className="block text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Importés</span>
                    <span className="text-xl font-bold text-emerald-800 mt-0.5 block">{report.imported}</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-center">
                    <span className="block text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Doublons</span>
                    <span className="text-xl font-bold text-amber-800 mt-0.5 block">{report.duplicates}</span>
                  </div>
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-center">
                    <span className="block text-[10px] uppercase tracking-wider text-red-700 font-semibold">Erreurs</span>
                    <span className="text-xl font-bold text-red-800 mt-0.5 block">{report.errors}</span>
                  </div>
                </div>

                {/* Download error report helper if mistakes occurred */}
                {(report.errors > 0 || report.duplicates > 0) && (
                  <div className="bg-slate-900 text-slate-100 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-6 w-6 text-amber-400 flex-shrink-0" />
                      <div>
                        <h5 className="text-xs font-bold">Rapport de corrections disponible</h5>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          Contient {report.errors + report.duplicates} lignes non insérées avec le motif précis de l'échec pour correction manuelle.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={downloadErrorReport}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 text-xs font-semibold text-white rounded-lg hover:bg-blue-500 transition shadow-sm whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Télécharger le rapport (.csv)
                    </button>
                  </div>
                )}

                {/* Detailed Logs Panel */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-700">Rapport de traitement détaillé</span>
                    <span className="text-[10px] text-slate-400">Total logs : {report.details?.length || 0}</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto p-3 bg-slate-950 font-mono text-[11px] text-slate-300 space-y-1.5">
                    {report.details && report.details.length > 0 ? (
                      report.details.map((detail: string, idx: number) => {
                        let colorClass = "text-slate-300";
                        if (detail.includes("Doublon")) colorClass = "text-amber-400";
                        if (detail.includes("requis") || detail.includes("invalide") || detail.includes("Erreur")) colorClass = "text-red-400";
                        return (
                          <div key={idx} className={`${colorClass} border-b border-slate-800/60 pb-1 last:border-0`}>
                            {detail}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-slate-500 italic text-center py-4">Aucune anomalie ou avertissement consigné.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row-reverse sm:justify-between items-center gap-3">
            <div className="flex gap-2 w-full sm:w-auto">
              {!report ? (
                <button
                  type="button"
                  disabled={!file || loading}
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 transition"
                  onClick={handleImport}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Traitement en cours...
                    </>
                  ) : (
                    'Lancer l\'importation'
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetState}
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition"
                >
                  Nouvelle tentative
                </button>
              )}
              
              <button
                type="button"
                className="w-full sm:w-auto inline-flex justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition"
                onClick={onClose}
              >
                {report ? 'Terminer' : 'Annuler'}
              </button>
            </div>

            {report && (
              <p className="text-xs text-slate-500 w-full sm:w-auto text-center sm:text-left">
                * Les établissements importés sont immédiatement visibles dans l'annuaire.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
