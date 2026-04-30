import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Edit3, Trash2 } from 'lucide-react';
import { Modal, Input, Btn, C } from '../Common';
import type { MasterCode } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  project_status: 'Project Status',
  task_phase: 'Task Phase',
};

export default function SetupModal({ onClose }: { onClose: () => void }) {
  const masterCodes = useStore((s) => s.masterCodes);
  const fetchMasterCodes = useStore((s) => s.fetchMasterCodes);
  const globalError = useStore((s) => s.error);
  const createMasterCode = useStore((s) => s.createMasterCode);
  const updateMasterCode = useStore((s) => s.updateMasterCode);
  const deleteMasterCode = useStore((s) => s.deleteMasterCode);
  const [activeType, setActiveType] = useState('project_status');
  const [editing, setEditing] = useState<Record<string, MasterCode>>({});
  const [newCode, setNewCode] = useState<Partial<MasterCode>>({
    codeType: 'project_status',
    codeKey: '',
    codeValue: '',
    label: '',
    sortOrder: 100,
    active: true,
  });
  const ROW_HEIGHT = 36;
  const SMALL_INPUT_STYLE: React.CSSProperties = { fontSize: 10, padding: '4px 8px', lineHeight: 1.3 };
  const ICON_BUTTON_STYLE: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: C.bg2, color: C.text2 };
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const success = await fetchMasterCodes();
      if (!mounted) return;
      if (!success) {
        setLoadError(globalError || 'Unable to load lookup values');
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [fetchMasterCodes, globalError]);

  const codeTypes = useMemo(() => {
    const types = Array.from(new Set(masterCodes.map((code) => code.codeType)));
    if (!types.includes('project_status')) types.unshift('project_status');
    if (!types.includes('task_phase')) types.unshift('task_phase');
    return types;
  }, [masterCodes]);

  useEffect(() => {
    setNewCode((prev) => ({ ...prev, codeType: activeType }));
  }, [activeType]);

  useEffect(() => {
    if (!codeTypes.includes(activeType) && codeTypes.length > 0) {
      setActiveType(codeTypes[0]);
    }
  }, [activeType, codeTypes]);

  const codes = useMemo(
    () => masterCodes
      .filter((code) => code.codeType === activeType)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.codeValue.localeCompare(b.codeValue)),
    [masterCodes, activeType]
  );

  const startEdit = (code: MasterCode) => setEditing((prev) => ({ ...prev, [code.id]: code }));
  const cancelEdit = (id: string) => setEditing((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });

  const saveEdit = async (id: string) => {
    const updated = editing[id];
    if (!updated) return;
    if (!updated.codeKey.trim() || !updated.codeValue.trim()) {
      toast.error('Code key and value are required');
      return;
    }
    try {
      await updateMasterCode(id, {
        codeKey: updated.codeKey.trim(),
        codeValue: updated.codeValue.trim(),
        label: updated.label.trim() || updated.codeValue.trim(),
        sortOrder: Number(updated.sortOrder) || 100,
        active: updated.active,
      });
      cancelEdit(id);
      toast.success('Lookup value saved');
    } catch (error) {
      toast.error((error as Error).message || 'Unable to save lookup value');
    }
  };

  const handleAdd = async () => {
    if (!newCode.codeKey?.trim() || !newCode.codeValue?.trim()) {
      toast.error('Code key and value are required');
      return;
    }
    try {
      await createMasterCode({
        codeType: activeType,
        codeKey: newCode.codeKey.trim(),
        codeValue: newCode.codeValue.trim(),
        label: newCode.label?.trim() || newCode.codeValue?.trim() || '',
        sortOrder: Number(newCode.sortOrder) || 100,
        active: newCode.active ?? true,
      });
      setNewCode((prev) => ({ ...prev, codeKey: '', codeValue: '', label: '', sortOrder: prev.sortOrder, active: true }));
      toast.success('Lookup value added');
    } catch (error) {
      toast.error((error as Error).message || 'Unable to add lookup value');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMasterCode(id);
      toast.success('Lookup value deleted');
    } catch (error) {
      toast.error((error as Error).message || 'Unable to delete lookup value');
    }
  };

  const refreshMasterCodes = async () => {
    setLoading(true);
    setLoadError(null);
    const success = await fetchMasterCodes();
    if (!success) {
      setLoadError(globalError || 'Unable to load lookup values');
    }
    setLoading(false);
  };

  return (
    <Modal title="Admin Setup" onClose={onClose} width={900}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {codeTypes.map((type) => (
            <button key={type} type="button" onClick={() => setActiveType(type)}
              style={{
                padding: '8px 14px', borderRadius: 10, border: `1px solid ${activeType === type ? C.primary : C.border}`,
                background: activeType === type ? C.primaryBg : C.white, color: activeType === type ? C.primary : C.text,
                cursor: 'pointer', fontWeight: 700,
              }}>
              {TYPE_LABELS[type] ?? type}
            </button>
          ))}
        </div>
        <button type="button" onClick={refreshMasterCodes}
          style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, color: C.text, cursor: 'pointer', fontSize: 12 }}>
          {loading ? 'Reloading…' : 'Refresh'}
        </button>
      </div>
      <div style={{ fontSize: 13, color: C.text2, marginBottom: 10 }}>
        Manage shared lookup values used by project and task dropdowns. Only admin users can change these values.
      </div>
      {loading && (
        <div style={{ padding: 16, borderRadius: 12, background: C.bg2, color: C.text3, marginBottom: 12 }}>
          Loading lookup values…
        </div>
      )}
      {loadError && (
        <div style={{ padding: 16, borderRadius: 12, background: C.redBg, color: C.red, marginBottom: 12 }}>
          Failed to load lookup values. <button type="button" onClick={refreshMasterCodes} style={{ border: 'none', background: 'transparent', color: C.primary, textDecoration: 'underline', cursor: 'pointer' }}>Try again</button>
        </div>
      )}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14, fontSize: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: C.bg2, color: C.text2, fontWeight: 700, fontSize: 10 }}>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Code Key</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Code Value</th>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>Label</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 90 }}>Text Color</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 90 }}>Background</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', width: 90 }}>Sort Order</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: 70 }}>Active</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => {
              const draft = editing[code.id];
              return (
                <tr key={code.id} style={{ borderTop: `1px solid ${C.border}`, background: C.white, fontSize: 10, height: ROW_HEIGHT }}>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={draft.codeKey} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], codeKey: v } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.codeKey}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={draft.codeValue} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], codeValue: v } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.codeValue}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={draft.label} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], label: v } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.label}</span>
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input type="color" value={draft.textColor} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], textColor: v } }))} style={{ width: 28, padding: 2, height: 26 }} />
                    ) : (
                      <span style={{ width: 18, height: 18, display: 'inline-block', borderRadius: 4, background: code.textColor, border: '1px solid #CBD5E1' }} />
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input type="color" value={draft.bgColor} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], bgColor: v } }))} style={{ width: 28, padding: 2, height: 26 }} />
                    ) : (
                      <span style={{ width: 18, height: 18, display: 'inline-block', borderRadius: 4, background: code.bgColor, border: '1px solid #CBD5E1' }} />
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {draft ? (
                      <Input value={String(draft.sortOrder)} onChange={(v) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], sortOrder: Number(v) || 0 } }))} style={SMALL_INPUT_STYLE} />
                    ) : (
                      <span style={{ color: C.text }}>{code.sortOrder}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                    {draft ? (
                      <input type="checkbox" checked={draft.active} onChange={(e) => setEditing((prev) => ({ ...prev, [code.id]: { ...prev[code.id], active: e.target.checked } }))} />
                    ) : (
                      <span>{code.active ? 'Yes' : 'No'}</span>
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', verticalAlign: 'middle', textAlign: 'right' }}>
                    {draft ? (
                      <>
                        <button type="button" onClick={() => saveEdit(code.id)}
                          style={{ ...ICON_BUTTON_STYLE, background: C.primary, color: '#fff', width: 28, height: 28, padding: 0 }}>
                          <Edit3 size={14} />
                        </button>
                        <button type="button" onClick={() => cancelEdit(code.id)}
                          style={{ ...ICON_BUTTON_STYLE, marginLeft: 6, padding: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEdit(code)}
                          style={{ ...ICON_BUTTON_STYLE, marginRight: 6, padding: 0 }}>
                          <Edit3 size={14} />
                        </button>
                        <button type="button" onClick={() => handleDelete(code.id)}
                          style={{ ...ICON_BUTTON_STYLE, background: C.redBg, color: C.red, padding: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {codes.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 16, textAlign: 'center', color: C.text3, background: C.bg2 }}>
                  No values found for this lookup type.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 90px 90px 90px 70px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <Input value={newCode.codeKey || ''} onChange={(v) => setNewCode((prev) => ({ ...prev, codeKey: v }))} placeholder="New code key" style={SMALL_INPUT_STYLE} />
          <Input value={newCode.codeValue || ''} onChange={(v) => setNewCode((prev) => ({ ...prev, codeValue: v }))} placeholder="New code value" style={SMALL_INPUT_STYLE} />
          <Input value={newCode.label || ''} onChange={(v) => setNewCode((prev) => ({ ...prev, label: v }))} placeholder="Label (optional)" style={SMALL_INPUT_STYLE} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="color" value={newCode.textColor || '#0F172A'} onChange={(v) => setNewCode((prev) => ({ ...prev, textColor: v }))} style={{ width: 28, padding: 2, height: 26 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input type="color" value={newCode.bgColor || '#EEF2FF'} onChange={(v) => setNewCode((prev) => ({ ...prev, bgColor: v }))} style={{ width: 28, padding: 2, height: 26 }} />
          </div>
          <Input value={String(newCode.sortOrder ?? 100)} onChange={(v) => setNewCode((prev) => ({ ...prev, sortOrder: Number(v) || 100 }))} placeholder="Order" style={SMALL_INPUT_STYLE} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input type="checkbox" checked={newCode.active ?? true} onChange={(e) => setNewCode((prev) => ({ ...prev, active: e.target.checked }))} />
          </div>
          <Btn onClick={handleAdd} style={{ width: '100%' }}>Add</Btn>
        </div>
      </div>
    </Modal>
  );
}
