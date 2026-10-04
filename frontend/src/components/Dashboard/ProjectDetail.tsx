import React, { useEffect, useState } from 'react';
import { ChevronLeft, Copy, Download, Home, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Badge, Tabs, C, PROJECT_STATUS, ProgressBar, Btn, Modal, FormRow, Select, Input } from '../Common';
import { fmtDate, computeBaselineProgress } from '../../utils';
import type { Project } from '../../types';
import TasksTab          from '../Table/TasksTab';
import ProjectSummaryTab from './ProjectSummaryTab';
import MembersTab        from '../Members/MembersTab';
import MilestonesTab     from '../Milestones/MilestonesTab';
import EffortTab         from '../Effort/EffortTab';
import ChangeRequestTab  from '../ChangeRequest/ChangeRequestTab';
import IssuesTab         from '../Issues/IssuesTab';
import RiskRegisterTab   from '../RiskRegister/RiskRegisterTab';
import ActivitiesTab     from '../Activities/ActivitiesTab';
import ProjectEnvironmentTab from './ProjectEnvironmentTab';
import ExecutiveOnePage  from './ExecutiveOnePage';
import { useStore }      from '../../store';
import { useAuth } from '../../contexts/AuthContext';
import { useRolePermissions } from '../../hooks/useRolePermissions';
import { effortApi, memberApi, milestoneApi, projectChecklistApi, riskApi, taskApi } from '../../services/api';
import {
  PROJECT_CHECKLIST_CATEGORIES,
  PROJECT_CHECKLIST_STAGES,
  type ProjectChecklistProgress,
  type ProjectChecklistProgressEntry,
  type ProjectChecklistCategoryId,
  type ProjectChecklistStageId,
  type ProjectChecklistTopic,
} from '../../utils/projectChecklist';

interface Props { project: Project; }
type CopyScope = 'tasks' | 'members' | 'ms' | 'effort' | 'risks';
const CHECKLIST_TABS = [
  { id: 'project', label: 'Project', icon: '📋' },
  { id: 'setup', label: 'Setup', icon: '⚙️' },
  { id: 'migrate-data', label: 'Migrate Data', icon: '🔄' },
];
function getTodayPassword(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

function getLocalDateInputValue(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function ProjectChecklistTable({ project, category, workSystem, workSystemOrder }: { project: Project; category: ProjectChecklistCategoryId; workSystem: string; workSystemOrder: string[] }) {
  const projectId = project.id;
  const { profile } = useAuth();
  const [topics, setTopics] = useState<ProjectChecklistTopic[] | null>(null);
  const [progress, setProgress] = useState<ProjectChecklistProgress>({});
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loadedProjectId, setLoadedProjectId] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoadedProjectId('');
    setLoadError('');
    Promise.all([projectChecklistApi.getTopics(), projectChecklistApi.getProgress(projectId)])
      .then(([loadedTopics, loadedProgress]) => {
        if (!active) return;
        setTopics(loadedTopics);
        setProgress(loadedProgress);
        setSavedSnapshot(JSON.stringify(loadedProgress));
      })
      .catch((error) => {
        if (!active) return;
        setTopics([]);
        setProgress({});
        setSavedSnapshot('{}');
        setLoadError(error instanceof Error ? error.message : 'Unable to load checklist data');
      })
      .finally(() => { if (active) setLoadedProjectId(projectId); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const refreshTopics = async () => {
      try {
        const loadedTopics = await projectChecklistApi.getTopics();
        if (active) setTopics(loadedTopics);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : 'Unable to refresh checklist topics');
      }
    };
    window.addEventListener('checklist-topics-updated', refreshTopics);
    return () => {
      active = false;
      window.removeEventListener('checklist-topics-updated', refreshTopics);
    };
  }, []);

  const isLoaded = loadedProjectId === projectId;
  const stageOrder = new Map<ProjectChecklistStageId, number>(PROJECT_CHECKLIST_STAGES.map((stage, index) => [stage.id, index]));
  const requiresWorkSystem = category !== 'project';
  const workSystemOrderMap = new Map(workSystemOrder.map((system, index) => [system.trim().toLocaleLowerCase(), index]));
  const getWorkSystemOrder = (system?: string) => workSystemOrderMap.get(String(system || '').trim().toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER;
  const matchingTopics = (topics || []).filter((topic) =>
    topic.category === category && (category === 'project' || !workSystem || topic.workSystem === workSystem)
  );
  const currentTopics = !isLoaded ? [] : category === 'project'
    ? matchingTopics.filter((topic) => topic.stage).slice().sort((left, right) => (stageOrder.get(left.stage!)! - stageOrder.get(right.stage!)!) || left.orderNo - right.orderNo || left.title.localeCompare(right.title))
    : matchingTopics.slice().sort((left, right) => getWorkSystemOrder(left.workSystem) - getWorkSystemOrder(right.workSystem) || Number(left.orderNo) - Number(right.orderNo) || left.title.localeCompare(right.title));
  const moduleNames = [...new Set(currentTopics.map((topic) => topic.workSystem || ''))]
    .sort((left, right) => getWorkSystemOrder(left) - getWorkSystemOrder(right) || left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  const checklistColumnCount = category === 'migrate-data' ? 13 : requiresWorkSystem ? 7 : 8;
  const categoryLabel = PROJECT_CHECKLIST_CATEGORIES.find((item) => item.id === category)?.label || 'Project';
  const hasUnsavedChanges = isLoaded && JSON.stringify(progress) !== savedSnapshot;

  const exportChecklistPdf = () => {
    const title = category === 'project' ? 'Project Checklist' : category === 'setup' ? 'Setup Checklist' : 'Data Migration Checklist';
    const notRequiredMark = '__CHECKLIST_NOT_REQUIRED__';
    const doneMark = '__CHECKLIST_DONE__';
    let sequenceNo = 0;
    const columns = category === 'migrate-data'
      ? ['No.', 'Checklist Topic', 'Not Required', 'Done', 'Completion Date', 'Completed By', 'UAT Customer', 'UAT HMC', 'UAT Diff', 'Production Customer', 'Production HMC', 'Production Diff', 'Notes']
      : requiresWorkSystem
        ? ['No.', 'Checklist Topic', 'Not Required', 'Done', 'Completion Date', 'Completed By', 'Notes']
        : ['No.', 'Checklist Topic', 'Not Required', 'Done', 'Completion Date', 'Completed By', 'JIRA ID', 'Notes'];
    const pdfHead: any[][] = category === 'migrate-data'
      ? [
          [
            { content: 'No.', rowSpan: 2 }, { content: 'Checklist Topic', rowSpan: 2 },
            { content: 'Not Required', rowSpan: 2 }, { content: 'Done', rowSpan: 2 },
            { content: 'Completion Date', rowSpan: 2 }, { content: 'Completed By', rowSpan: 2 },
            { content: 'UAT Stage', colSpan: 3 }, { content: 'Production Stage', colSpan: 3 },
            { content: 'Notes', rowSpan: 2 },
          ],
          ['Customer', 'HMC', 'Diff', 'Customer', 'HMC', 'Diff'],
        ]
      : [columns];
    const body: any[] = [];
    const progressCells = (topic: ProjectChecklistTopic, rowNumber: number) => {
      const item = progress[topic.id] || { notRequired: false, done: false, completionDate: '', completedBy: '', jiraId: '', notes: '' };
      const row = [
        String(rowNumber).padStart(2, '0'),
        topic.title,
        item.notRequired ? notRequiredMark : '',
        !item.notRequired && (item.done || item.completionDate) ? doneMark : '',
        item.completionDate ? fmtDate(item.completionDate) : '',
        item.completedBy,
      ];
      if (category === 'migrate-data') {
        const diff = (customer?: string, hmc?: string) => {
          if (!customer && !hmc) return '';
          const difference = (Number(customer) || 0) - (Number(hmc) || 0);
          return String(Math.round(difference * 100) / 100);
        };
        row.push(item.uatCustomer || '', item.uatHmc || '', diff(item.uatCustomer, item.uatHmc));
        row.push(item.productionCustomer || '', item.productionHmc || '', diff(item.productionCustomer, item.productionHmc));
      } else if (!requiresWorkSystem) row.push(item.jiraId);
      row.push(item.notes);
      return row;
    };
    const groupRow = (label: string) => [{
      content: label,
      colSpan: columns.length,
      styles: { fillColor: [241, 245, 249], textColor: [30, 30, 30], fontStyle: 'bold' as const, halign: 'left' as const },
    }];

    if (category === 'project') {
      PROJECT_CHECKLIST_STAGES.forEach((stage) => {
        const stageTopics = currentTopics.filter((topic) => topic.stage === stage.id);
        body.push(groupRow(`Stage: ${stage.label}`));
        stageTopics.forEach((topic) => body.push(progressCells(topic, ++sequenceNo)));
      });
    } else {
      moduleNames.forEach((moduleName) => {
        const moduleTopics = currentTopics.filter((topic) => (topic.workSystem || '') === moduleName);
        body.push(groupRow(`Module: ${moduleName || '—'}`));
        moduleTopics.forEach((topic) => body.push(progressCells(topic, ++sequenceNo)));
      });
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 8;
    const right = 8;
    const headerHeight = 18;
    const footerHeight = 10;
    const contentWidth = pageWidth - left - right;
    autoTable(doc, {
      head: pdfHead,
      body,
      startY: headerHeight + 5,
      margin: { top: headerHeight + 5, bottom: footerHeight + 5, left, right },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, textColor: [30, 30, 30], lineColor: [203, 213, 225], lineWidth: 0.15, overflow: 'linebreak' },
      headStyles: { fillColor: [239, 246, 255], textColor: [49, 46, 129], fontStyle: 'bold', halign: 'center' },
      columnStyles: category === 'migrate-data'
        ? {
            0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 58 },
            2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 14, halign: 'center' },
            4: { cellWidth: 22, halign: 'center' }, 5: { cellWidth: 30 },
            6: { cellWidth: 17, halign: 'center' }, 7: { cellWidth: 15, halign: 'center' }, 8: { cellWidth: 14, halign: 'center' },
            9: { cellWidth: 17, halign: 'center' }, 10: { cellWidth: 15, halign: 'center' }, 11: { cellWidth: 14, halign: 'center' },
            12: { cellWidth: 37 },
          }
        : { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 76 }, 2: { cellWidth: 25, halign: 'center' }, 3: { cellWidth: 16, halign: 'center' }, 4: { cellWidth: 30 }, 5: { cellWidth: 38 } },
      showHead: 'everyPage',
      didParseCell: (data: any) => {
        if (data.cell.raw === notRequiredMark || data.cell.raw === doneMark) data.cell.text = [];
      },
      didDrawCell: (data: any) => {
        if (data.section !== 'body') return;
        const mark = data.cell.raw;
        if (mark !== notRequiredMark && mark !== doneMark) return;
        const centerX = data.cell.x + data.cell.width / 2;
        const centerY = data.cell.y + data.cell.height / 2;
        const size = Math.min(1.1, data.cell.height * 0.15);
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(0.225);
        if (mark === notRequiredMark) {
          doc.line(centerX - size, centerY - size, centerX + size, centerY + size);
          doc.line(centerX + size, centerY - size, centerX - size, centerY + size);
        } else {
          doc.line(centerX - size, centerY, centerX - size * 0.2, centerY + size * 0.75);
          doc.line(centerX - size * 0.2, centerY + size * 0.75, centerX + size, centerY - size);
        }
      },
    });

    const today = new Date();
    const reportDate = [String(today.getDate()).padStart(2, '0'), String(today.getMonth() + 1).padStart(2, '0'), today.getFullYear()].join('-');
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(left, 2, contentWidth, headerHeight, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(9.5);
      doc.text(doc.splitTextToSize(project.client || project.name || 'Project', 150)[0], left + 5.5, 10.8);
      doc.setFontSize(11.5);
      doc.text(title, left + 5.5, 16.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Print Date : ${reportDate}`, pageWidth - right - 5, 11, { align: 'right' });

      const footerLineY = pageHeight - footerHeight;
      const footerTextY = pageHeight - footerHeight + 5;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(left, footerLineY, pageWidth - right, footerLineY);
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Prepared by Humanica Public Company Limited', left, footerTextY);
      doc.setFont('helvetica', 'bold');
      doc.text('Confidential', pageWidth / 2, footerTextY, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text(`Project ID: ${project.code || projectId} | Page ${page} of ${totalPages}`, pageWidth - right, footerTextY, { align: 'right' });
    }

    const customerAbbreviation = String(project.customerAbbreviation || '').trim().replace(/[\\/:*?"<>|]/g, '-');
    doc.save(`${customerAbbreviation ? `${customerAbbreviation} ` : ''}${title}.pdf`);
    toast.success('Exported PDF');
  };

  const updateProgress = (topicId: string, updates: Partial<ProjectChecklistProgressEntry>) => {
    setProgress((currentProgress) => {
      const existing = currentProgress[topicId];
      return {
        ...currentProgress,
        [topicId]: {
          notRequired: updates.notRequired ?? existing?.notRequired ?? false,
          done: updates.done ?? existing?.done ?? Boolean(existing?.completionDate),
          completionDate: updates.completionDate ?? existing?.completionDate ?? '',
          completedBy: updates.completedBy ?? existing?.completedBy ?? '',
          jiraId: updates.jiraId ?? existing?.jiraId ?? '',
          notes: updates.notes ?? existing?.notes ?? '',
          uatCustomer: updates.uatCustomer ?? existing?.uatCustomer ?? '',
          uatHmc: updates.uatHmc ?? existing?.uatHmc ?? '',
          productionCustomer: updates.productionCustomer ?? existing?.productionCustomer ?? '',
          productionHmc: updates.productionHmc ?? existing?.productionHmc ?? '',
        },
      };
    });
  };

  const saveItems = async () => {
    try {
      const topicIds = new Set((topics || []).map((topic) => topic.id));
      const savedProgress = Object.fromEntries(
        Object.entries(progress).filter(([topicId]) => topicIds.has(topicId))
      );
      const serializedItems = JSON.stringify(savedProgress);
      await projectChecklistApi.saveProgress(projectId, savedProgress);
      setProgress(savedProgress);
      setSavedSnapshot(serializedItems);
      toast.success('Progress saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save progress');
    }
  };

  const headerStyle: React.CSSProperties = {
    padding: category === 'migrate-data' ? '7px 5px' : '10px 12px',
    background: C.bg2,
    borderBottom: `1px solid ${C.border}`,
    color: C.text2,
    fontSize: 10,
    fontWeight: 700,
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  const cellStyle: React.CSSProperties = {
    padding: category === 'migrate-data' ? '3px 4px' : '4px 8px',
    borderBottom: `1px solid ${C.border}`,
    color: C.text,
    fontSize: 10,
    verticalAlign: 'middle',
  };
  const inputStyle: React.CSSProperties = {
    height: 28,
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '4px 8px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    background: C.white,
    color: C.text,
    fontFamily: 'Poppins, sans-serif',
    fontSize: 10,
  };
  const disabledInputStyle: React.CSSProperties = {
    background: C.bg2,
    borderColor: C.border,
    color: C.text3,
    cursor: 'not-allowed',
  };
  const renderTopicRow = (topic: ProjectChecklistTopic, index: number, rowNumber = topic.orderNo) => {
    const itemProgress = progress[topic.id] || { notRequired: false, done: false, completionDate: '', completedBy: '', jiraId: '', notes: '' };
    const isNotRequired = Boolean(itemProgress.notRequired);
    const isDone = !isNotRequired && Boolean(itemProgress.done || itemProgress.completionDate);
    const progressFieldStyle = isNotRequired ? { ...inputStyle, ...disabledInputStyle } : inputStyle;
    const diffValue = (customer?: string, hmc?: string) => {
      if (!customer && !hmc) return '—';
      const difference = (Number(customer) || 0) - (Number(hmc) || 0);
      return String(Math.round(difference * 100) / 100);
    };
    return (
      <tr key={topic.id}>
        <td style={{ ...cellStyle, color: C.text3, fontVariantNumeric: 'tabular-nums' }}>{String(rowNumber).padStart(2, '0')}</td>
        <td style={{ ...cellStyle, fontWeight: 600 }}>{topic.title}</td>
        <td style={{ ...cellStyle, textAlign: 'center' }}>
          <input
            type="checkbox"
            aria-label={`Mark ${topic.title} not required`}
            checked={isNotRequired}
            onChange={(event) => {
              const notRequired = event.currentTarget.checked;
              updateProgress(topic.id, {
                notRequired,
                ...(notRequired ? { done: false, completionDate: '', completedBy: '' } : {}),
              });
            }}
            style={{ width: 16, height: 16, accentColor: C.text2, cursor: 'pointer' }}
          />
        </td>
        <td style={{ ...cellStyle, textAlign: 'center' }}>
          <input
            type="checkbox"
            aria-label={`Mark ${topic.title} done`}
            checked={isDone}
            disabled={isNotRequired}
            onChange={(event) => {
              const done = event.currentTarget.checked;
              updateProgress(topic.id, {
                done,
                completionDate: done ? getLocalDateInputValue() : '',
                completedBy: done ? (profile?.fullName?.trim() || profile?.email || '') : '',
              });
            }}
            style={{ width: 17, height: 17, accentColor: C.green, cursor: isNotRequired ? 'not-allowed' : 'pointer' }}
          />
        </td>
        <td style={cellStyle}><input aria-label={`${topic.title} completion date`} type="date" value={itemProgress.completionDate} disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { completionDate: event.target.value })} style={{ ...progressFieldStyle, width: 110, maxWidth: '100%' }} /></td>
        <td style={cellStyle}><input aria-label={`${topic.title} completed by`} value={itemProgress.completedBy} placeholder="Name" disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { completedBy: event.target.value })} style={progressFieldStyle} /></td>
        {category === 'migrate-data' && <>
          <td style={cellStyle}><input aria-label={`${topic.title} UAT Customer`} type="number" step="any" value={itemProgress.uatCustomer || ''} disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { uatCustomer: event.target.value })} style={{ ...progressFieldStyle, textAlign: 'right' }} /></td>
          <td style={cellStyle}><input aria-label={`${topic.title} UAT HMC`} type="number" step="any" value={itemProgress.uatHmc || ''} disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { uatHmc: event.target.value })} style={{ ...progressFieldStyle, textAlign: 'right' }} /></td>
          <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: Number(itemProgress.uatCustomer || 0) - Number(itemProgress.uatHmc || 0) < 0 ? C.red : C.text }}>{diffValue(itemProgress.uatCustomer, itemProgress.uatHmc)}</td>
          <td style={cellStyle}><input aria-label={`${topic.title} Production Customer`} type="number" step="any" value={itemProgress.productionCustomer || ''} disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { productionCustomer: event.target.value })} style={{ ...progressFieldStyle, textAlign: 'right' }} /></td>
          <td style={cellStyle}><input aria-label={`${topic.title} Production HMC`} type="number" step="any" value={itemProgress.productionHmc || ''} disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { productionHmc: event.target.value })} style={{ ...progressFieldStyle, textAlign: 'right' }} /></td>
          <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: Number(itemProgress.productionCustomer || 0) - Number(itemProgress.productionHmc || 0) < 0 ? C.red : C.text }}>{diffValue(itemProgress.productionCustomer, itemProgress.productionHmc)}</td>
        </>}
        {!requiresWorkSystem && <td style={cellStyle}><input aria-label={`${topic.title} JIRA ID`} value={itemProgress.jiraId} placeholder="HMC-123" disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { jiraId: event.target.value })} style={progressFieldStyle} /></td>}
        <td style={cellStyle}><input aria-label={`${topic.title} notes`} value={itemProgress.notes} placeholder="Notes" disabled={isNotRequired} onChange={(event) => updateProgress(topic.id, { notes: event.target.value })} style={progressFieldStyle} /></td>
      </tr>
    );
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{categoryLabel} Checklist</h3>
            <span style={{ display: 'block', marginTop: 4, color: C.text3, fontSize: 11 }}>
              Topics are managed in Setup{requiresWorkSystem && workSystem ? ` · System Module: ${workSystem}` : ''}. Progress is stored in the project database.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {hasUnsavedChanges && <span style={{ color: C.amber, fontSize: 12, fontWeight: 600 }}>Unsaved changes</span>}
            <Btn onClick={exportChecklistPdf} disabled={!isLoaded || !currentTopics.length} small><Download size={14} /> Export PDF</Btn>
            <Btn onClick={saveItems} disabled={!isLoaded || !hasUnsavedChanges || !currentTopics.length} small>
              <Save size={14} /> Save Progress
            </Btn>
          </div>
        </div>
        {loadError && (
          <div style={{ marginBottom: 12, padding: '9px 12px', border: `1px solid ${C.red}`, background: C.redBg, color: C.red, fontSize: 12 }}>
            Unable to load checklist data. Apply the project checklist database migration and verify project access. {loadError}
          </div>
        )}
        <div style={{ overflowX: 'hidden', border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, width: '100%', minWidth: 0 }}>
          <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10 }}>
            <colgroup>
              {category === 'migrate-data' ? <>
                <col style={{ width: '4%' }} /><col style={{ width: '16%' }} />
                <col style={{ width: '7%' }} /><col style={{ width: '4%' }} />
                <col style={{ width: '9%' }} /><col style={{ width: '11%' }} />
                <col style={{ width: '7%' }} /><col style={{ width: '6%' }} /><col style={{ width: '5%' }} />
                <col style={{ width: '7%' }} /><col style={{ width: '6%' }} /><col style={{ width: '5%' }} />
                <col style={{ width: '13%' }} />
              </> : <>
                <col style={{ width: 64 }} />
                <col style={{ width: 400 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 160 }} />
                {!requiresWorkSystem && <col style={{ width: 130 }} />}
                <col />
              </>}
            </colgroup>
            <thead>
              {category === 'migrate-data' ? <>
                <tr>
                  <th rowSpan={2} style={headerStyle}>No.</th>
                  <th rowSpan={2} style={headerStyle}>Checklist Topic</th>
                  <th rowSpan={2} style={{ ...headerStyle, textAlign: 'center' }}>Not Required</th>
                  <th rowSpan={2} style={{ ...headerStyle, textAlign: 'center' }}>Done</th>
                  <th rowSpan={2} style={headerStyle}>Completion Date</th>
                  <th rowSpan={2} style={headerStyle}>Completed By</th>
                  <th colSpan={3} style={{ ...headerStyle, textAlign: 'center' }}>UAT Stage</th>
                  <th colSpan={3} style={{ ...headerStyle, textAlign: 'center' }}>Production Stage</th>
                  <th rowSpan={2} style={headerStyle}>Notes</th>
                </tr>
                <tr>
                  {['Customer', 'HMC', 'Diff', 'Customer', 'HMC', 'Diff'].map((label, index) => <th key={`${label}-${index}`} style={{ ...headerStyle, textAlign: index % 3 === 2 ? 'right' : 'left' }}>{label}</th>)}
                </tr>
              </> : <tr>
                <th style={headerStyle}>No.</th>
                <th style={headerStyle}>Checklist Topic</th>
                <th style={{ ...headerStyle, textAlign: 'center' }}>Not Required</th>
                <th style={{ ...headerStyle, textAlign: 'center' }}>Done</th>
                <th style={headerStyle}>Completion Date</th>
                <th style={headerStyle}>Completed By</th>
                {!requiresWorkSystem && <th style={headerStyle}>JIRA ID</th>}
                <th style={headerStyle}>Notes</th>
              </tr>}
            </thead>
            {category === 'project' ? PROJECT_CHECKLIST_STAGES.map((stage) => {
              const stageTopics = currentTopics.filter((topic) => topic.stage === stage.id);
              return (
                <tbody key={stage.id}>
                  <tr>
                    <td colSpan={checklistColumnCount} style={{ padding: '10px 12px', background: C.bg2, borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 10, fontWeight: 700, textAlign: 'left' }}>
                      Stage: {stage.label}
                    </td>
                  </tr>
                  {stageTopics.map((topic, index) => renderTopicRow(topic, index))}
                  {stageTopics.length === 0 && (
                    <tr><td colSpan={checklistColumnCount} style={{ padding: '10px 12px', color: C.text3, fontSize: 10 }}>No topics configured for this stage.</td></tr>
                  )}
                </tbody>
              );
            }) : (
              <>
                {moduleNames.map((moduleName) => {
                  const moduleTopics = currentTopics.filter((topic) => (topic.workSystem || '') === moduleName);
                  return (
                    <tbody key={moduleName}>
                      <tr>
                        <td colSpan={checklistColumnCount} style={{ padding: '10px 12px', background: C.bg2, borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 10, fontWeight: 700, textAlign: 'left' }}>
                          Module: {moduleName || '—'}
                        </td>
                      </tr>
                      {moduleTopics.map((topic, index) => renderTopicRow(topic, index, index + 1))}
                    </tbody>
                  );
                })}
                {currentTopics.length === 0 && (
                  <tbody><tr><td colSpan={checklistColumnCount} style={{ padding: '10px 12px', color: C.text3, fontSize: 10 }}>{workSystem ? `No ${categoryLabel.toLowerCase()} topics configured for ${workSystem}.` : `No ${categoryLabel.toLowerCase()} topics configured in Setup.`}</td></tr></tbody>
                )}
              </>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetail({ project }: Props) {
  const [activeTab, setActiveTab]   = useState('tasks');
  const [activeChecklistTab, setActiveChecklistTab] = useState<ProjectChecklistCategoryId>('project');
  const [isMobile, setIsMobile] = useState(false);
  const readOnlyContentRef = React.useRef<HTMLDivElement>(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceProjectId, setCopySourceProjectId] = useState('');
  const [copyPassword, setCopyPassword] = useState('');
  const [copying, setCopying] = useState(false);
  const permissions = useRolePermissions();
  const {
    projects,
    tasks,
    members,
    milestones,
    efforts,
    changeRequests,
    issues,
    risks,
    activities,
    projectEnvironments,
    fetchProjects,
    fetchTasks,
    fetchProjectProgressSnapshots,
    fetchMembers,
    fetchMilestones,
    fetchEfforts,
    fetchCRs,
    fetchIssues,
    fetchRisks,
    fetchActivities,
    fetchProjectEnvironments,
  } = useStore();

  const { masterCodes } = useStore();
  const workSystemOrder = masterCodes
    .filter((code) => code.codeType === 'work_system' && code.active)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.codeValue.localeCompare(right.codeValue))
    .map((code) => code.codeValue.trim());
  const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === project.status);
  const s = statusCode ? { bg: statusCode.bgColor, color: statusCode.textColor, label: statusCode.label } : { bg: C.bg2, color: C.text, label: project.status || 'Unknown' };
  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const rootTasks = projectTasks.filter((t) => !t.parentId);
  const overallProgress = rootTasks.length ? Math.round(rootTasks.reduce((sum, t) => sum + t.percentComplete, 0) / rootTasks.length) : 0;

  const currentDate = new Date();
  const todayIso = currentDate.toISOString().slice(0, 10);
  const todayBaseline = computeBaselineProgress(projectTasks, [todayIso]);
  const plannedPercent = todayBaseline[0]?.baselinePercent ?? 0;
  const scheduleGap = plannedPercent - overallProgress;
  const scheduleStatus = !todayBaseline.length ? 'Plan N/A'
    : scheduleGap > 20 ? 'Stoper'
    : scheduleGap > 3 ? 'Delay'
    : 'On Track';
  const scheduleColor = scheduleStatus === 'Stoper'
    ? C.red
    : scheduleStatus === 'Delay'
      ? C.amber
      : scheduleStatus === 'Plan N/A'
        ? C.text3
        : C.green;
  const scheduleBg = scheduleStatus === 'Stoper'
    ? C.redBg
    : scheduleStatus === 'Delay'
      ? C.amberBg
      : scheduleStatus === 'Plan N/A'
        ? C.bg2
        : C.greenBg;
  const scheduleLabel = scheduleStatus === 'Plan N/A' ? 'Plan N/A' : `Project Health : ${scheduleStatus}`;

  const copyTabLabel: Record<CopyScope, string> = {
    tasks: 'Task',
    members: 'Member',
    ms: 'Milestone',
    effort: 'Effort',
    risks: 'Risk',
  };
  const copyScope = (['tasks', 'members', 'ms', 'effort', 'risks'].includes(activeTab)
    ? activeTab
    : null) as CopyScope | null;
  const sourceProjectOptions = projects
    .filter((p) => p.id !== project.id)
    .map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));

  const openCopyModal = () => {
    setCopySourceProjectId(sourceProjectOptions[0]?.value || '');
    setCopyPassword('');
    setCopyModalOpen(true);
  };

  const copyButton = (scope: CopyScope) => (
    <button
      type="button"
      onClick={() => {
        setActiveTab(scope);
        openCopyModal();
      }}
      title={`Copy ${copyTabLabel[scope]} from another project`}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        background: C.white,
        color: C.primary,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Copy size={16} />
    </button>
  );

  const handleConfirmCopy = async () => {
    if (!copyScope) return;
    if (!copySourceProjectId) {
      toast.error('Please select source project');
      return;
    }
    if (copyPassword.trim() !== getTodayPassword()) {
      toast.error('Invalid password');
      return;
    }

    setCopying(true);
    try {
      if (copyScope === 'tasks') {
        await taskApi.copyFromProject(copySourceProjectId, project.id, 'all');
        await fetchTasks(project.id);
      } else if (copyScope === 'members') {
        await memberApi.copyFromProject(copySourceProjectId, project.id);
        await fetchMembers(project.id);
      } else if (copyScope === 'ms') {
        await milestoneApi.copyFromProject(copySourceProjectId, project.id);
        await fetchMilestones(project.id);
      } else if (copyScope === 'effort') {
        await effortApi.copyFromProject(copySourceProjectId, project.id);
        await fetchEfforts(project.id);
      } else if (copyScope === 'risks') {
        await riskApi.copyFromProject(copySourceProjectId, project.id);
        await fetchRisks(project.id);
      }

      toast.success(`${copyTabLabel[copyScope]} copied successfully`);
      setCopyModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to copy ${copyScope}`);
    } finally {
      setCopying(false);
    }
  };

  /* Old Section
  const allTabs = [
    { id: 'tasks',    label: 'Tasks',      icon: '📋', count: tasks.filter(t => t.projectId === project.id).length },
    { id: 'summary',  label: 'Summary',    icon: '📈' },
    { id: 'members',  label: 'Members',    icon: '👥', count: members.length },
    { id: 'ms',       label: 'Milestones', icon: '🏁', count: milestones.length },
    { id: 'effort',   label: 'Effort',     icon: '⚡', count: efforts.length },
    { id: 'cr',       label: 'Change Req', icon: '📝', count: changeRequests.length },
    { id: 'issues',   label: 'Issues',     icon: '🔴', count: issues.filter(i => i.status !== 'Resolved' && i.status !== 'Blocked').length },
    { id: 'risks',    label: 'Risks',      icon: '🎯', count: risks.filter(r => r.status === 'Monitoring' || r.status === 'Mitigating').length },
    { id: 'env',      label: 'Program URL', icon: '🌐', count: projectEnvironments.filter((e) => e.projectId === project.id).length },
    { id: 'report',   label: 'Report',     icon: '📊' },
  ];
  */
  const allTabs = [
    { id: 'tasks',    label: 'Tasks',      icon: '📋', count: tasks.filter(t => t.projectId === project.id).length },
    { id: 'summary',  label: 'Summary',    icon: '📈' },
    { id: 'members',  label: 'Members',    icon: '👥', count: members.length },
    { id: 'ms',       label: 'Milestones', icon: '🏁', count: milestones.length },
    { id: 'effort',   label: 'Effort',     icon: '⚡', count: efforts.length },
    { id: 'checklists', label: 'Checklist', icon: '☑️' },
    { id: 'cr',       label: 'Change Req', icon: '📝', count: changeRequests.length },
    { id: 'issues',   label: 'Issues',     icon: '🔴', count: issues.filter(i => i.status !== 'Resolved' && i.status !== 'Blocked').length },
    { id: 'risks',    label: 'Risks',      icon: '🎯', count: risks.filter(r => r.status === 'Monitoring' || r.status === 'Mitigating').length },
    { id: 'activities', label: 'Activities', icon: '🗓️', count: activities.filter((a) => a.projectId === project.id).length },
    { id: 'env',      label: 'Program URL', icon: '🌐', count: projectEnvironments.filter((e) => e.projectId === project.id).length },
    { id: 'onepage',  label: 'One Page',   icon: '🧭' },
  ];

  // Filter tabs based on role permissions
  const TABS = allTabs.filter(tab => permissions.isTabVisible(tab.id));
  const activeScreenAccess = permissions.getScreenAccess(activeTab);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    const handleSetTab = (e: Event) => {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab;
      if (tab && permissions.isTabVisible(tab)) setActiveTab(tab);
    };
    window.addEventListener('app-set-tab', handleSetTab);
    return () => window.removeEventListener('app-set-tab', handleSetTab);
  }, [permissions]);

  React.useEffect(() => {
    if (TABS.length && !permissions.isTabVisible(activeTab)) setActiveTab(TABS[0].id);
  }, [activeTab, permissions, TABS]);

  React.useEffect(() => {
    const content = readOnlyContentRef.current;
    if (!content) return;
    if (activeScreenAccess === 'read') content.setAttribute('inert', '');
    else content.removeAttribute('inert');
  }, [activeScreenAccess]);

  React.useEffect(() => {
    if (!projects.length) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);

  React.useEffect(() => {
    if (!project?.id) return;

    // Preload all project datasets so Executive Report and all tabs are complete immediately.
    Promise.allSettled([
      fetchTasks(project.id),
      fetchProjectProgressSnapshots(project.id),
      fetchMembers(project.id),
      fetchMilestones(project.id),
      fetchEfforts(project.id),
      fetchCRs(project.id),
      fetchIssues(project.id),
      fetchRisks(project.id),
      fetchActivities(project.id),
      fetchProjectEnvironments(project.id),
    ]);
  }, [
    project?.id,
    fetchTasks,
    fetchProjectProgressSnapshots,
    fetchMembers,
    fetchMilestones,
    fetchEfforts,
    fetchCRs,
    fetchIssues,
    fetchRisks,
    fetchActivities,
    fetchProjectEnvironments,
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ padding: isMobile ? '12px 16px 0' : '14px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 10, height: 42, borderRadius: 5, background: project.color || C.primary, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: 0 }}>{project.name}</h2>
                <Badge bg={s.bg} color={s.color}>{s.label}</Badge>
              </div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>
                {project.code} · {project.client} · {fmtDate(project.startDate)} – {fmtDate(project.endDate)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <Badge bg={scheduleBg} color={scheduleColor}>
                  {scheduleLabel}
                </Badge>
                <span style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap' }}>
                  Overall Progress : {overallProgress}% - Target : {plannedPercent}%
                </span>
              </div>
            </div>
          </div>
          <Tabs tabs={TABS} active={activeTab} onChange={id => {
            if (id === 'checklists') setActiveChecklistTab('project');
            setActiveTab(id);
          }} />
        </div>
      </div>

      <div ref={readOnlyContentRef} aria-readonly={activeScreenAccess === 'read'} style={{ flex: 1, overflow: 'hidden', background: activeTab === 'tasks' ? C.white : C.bg }}>
        {TABS.length === 0 ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24, color: C.text2, fontSize: 13, textAlign: 'center' }}>
            No project screens are enabled for your account. Contact an administrator.
          </div>
        ) : <>
        {activeTab === 'tasks'   && <div style={{ height: '100%' }}><TasksTab         projectId={project.id} extraActions={copyButton('tasks')} /></div>}
        {activeTab === 'summary' && <div style={{ height: '100%', overflowY: 'auto' }}><ProjectSummaryTab project={project} /></div>}
        {activeTab === 'members' && <div style={{ height: '100%', overflowY: 'auto' }}><MembersTab        projectId={project.id} extraActions={copyButton('members')} /></div>}
        {activeTab === 'ms'      && <div style={{ height: '100%', overflowY: 'auto' }}><MilestonesTab     projectId={project.id} extraActions={copyButton('ms')} /></div>}
        {activeTab === 'effort'  && <div style={{ height: '100%', overflowY: 'auto' }}><EffortTab         projectId={project.id} extraActions={copyButton('effort')} /></div>}
        {activeTab === 'checklists' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: isMobile ? '0 16px' : '0 24px' }}>
              <Tabs tabs={CHECKLIST_TABS} active={activeChecklistTab} onChange={(category) => setActiveChecklistTab(category as ProjectChecklistCategoryId)} />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <ProjectChecklistTable project={project} category={activeChecklistTab} workSystem={project.softwareVersion} workSystemOrder={workSystemOrder} />
            </div>
          </div>
        )}
        {activeTab === 'cr'      && <div style={{ height: '100%', overflowY: 'auto' }}><ChangeRequestTab  projectId={project.id} /></div>}
        {activeTab === 'issues'  && <div style={{ height: '100%', overflowY: 'auto' }}><IssuesTab         projectId={project.id} /></div>}
        {activeTab === 'risks'   && <div style={{ height: '100%', overflowY: 'auto' }}><RiskRegisterTab   projectId={project.id} extraActions={copyButton('risks')} /></div>}
        {activeTab === 'activities' && <div style={{ height: '100%', overflowY: 'auto' }}><ActivitiesTab projectId={project.id} /></div>}
        {activeTab === 'env'     && <div style={{ height: '100%', overflowY: 'auto' }}><ProjectEnvironmentTab project={project} /></div>}
        {activeTab === 'onepage' && <div style={{ height: '100%', overflowY: 'auto' }}><ExecutiveOnePage project={project} /></div>}
        </>}
      </div>

      {copyModalOpen && copyScope && (
        <Modal title={`Copy ${copyTabLabel[copyScope]} From Another Project`} onClose={() => setCopyModalOpen(false)} width={560}>
          <div style={{ display: 'grid', gap: 10 }}>
            <FormRow label="Source Project" required>
              <Select
                value={copySourceProjectId}
                onChange={setCopySourceProjectId}
                options={sourceProjectOptions.length ? sourceProjectOptions : [{ value: '', label: 'No source project available' }]}
                disabled={!sourceProjectOptions.length}
              />
            </FormRow>

            <FormRow label="Password" required>
              <Input value={copyPassword} onChange={setCopyPassword} placeholder="*********" />
            </FormRow>

            <div style={{ padding: '10px 12px', borderRadius: 10, background: C.amberBg, fontSize: 12, color: C.text2 }}>
              Copy will append data from source project into this tab of current project.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setCopyModalOpen(false)} disabled={copying}>Cancel</Btn>
              <Btn onClick={handleConfirmCopy} disabled={copying || !copySourceProjectId || !copyPassword.trim()}>
                {copying ? 'Copying…' : 'Confirm Copy'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
