import React, { useState } from 'react';
import { Check, Clock3, RotateCcw, Send } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from './AuthProvider.tsx';
import { ARRONDISSEMENT_ROLES, DSE_ROLES, ROLES, hasAnyRole } from '../lib/roles.ts';

interface ModuleWorkflowActionsProps {
  module: string;
  recordId?: number | null;
  workflowStatus?: string | null;
  onUpdated: () => void;
  compact?: boolean;
}

export function ModuleWorkflowActions({ module, recordId, workflowStatus, onUpdated, compact = false }: ModuleWorkflowActionsProps) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const status = workflowStatus || (recordId ? 'Non soumis' : 'Non renseigne');
  const isDse = hasAnyRole(user?.role, DSE_ROLES);
  const isProviseur = hasAnyRole(user?.role, [ROLES.PROVISEUR]);
  const isArrondissement = hasAnyRole(user?.role, ARRONDISSEMENT_ROLES);
  const canApprove = Boolean(recordId && ((isDse && status === 'Soumis au DSE') || (isProviseur && status === 'Soumis au proviseur')));
  const canReject = Boolean(recordId && ((isDse && status === 'Soumis au DSE') || (isProviseur && status === 'Soumis au proviseur') || (isArrondissement && ['Soumis au proviseur', 'Soumis au DSE'].includes(status))));

  const decide = async (decision: 'approuver' | 'rejeter') => {
    if (!token || !recordId || loading) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/module-submissions/${module}/${recordId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ decision })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de traiter la transmission.');
      onUpdated();
    } catch (error: any) {
      window.alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const tone = status === 'Valide'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'A corriger' || status === 'Rejete'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : status === 'Brouillon' || status === 'Non soumis' || status === 'Non renseigne'
        ? 'bg-slate-50 text-slate-600 border-slate-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className={`flex ${compact ? 'flex-col items-end gap-1' : 'flex-wrap items-center gap-2'}`}>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${tone}`}>
        {status === 'Valide' ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
        {status}
      </span>
      {canApprove && (
        <button type="button" disabled={loading} onClick={() => decide('approuver')} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          <Check className="h-3 w-3" /> Approuver
        </button>
      )}
      {canReject && (
        <button type="button" disabled={loading} onClick={() => decide('rejeter')} className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
          <RotateCcw className="h-3 w-3" /> A corriger
        </button>
      )}
      {recordId && (status === 'Brouillon' || status === 'A corriger') && !isDse && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
          <Send className="h-3 w-3" /> Soumission attendue
        </span>
      )}
    </div>
  );
}
