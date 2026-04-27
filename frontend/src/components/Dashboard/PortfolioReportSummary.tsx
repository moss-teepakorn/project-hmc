import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { useStore } from '../../store';
import { Card, Btn, C, TH, TD } from '../Common';
import { fmtDate } from '../../utils';
import type { Project } from '../../types';

interface SummaryRow {
  projectId: string;
  projectName: string;
  client: string;
  overall: number;
  startDate: string;
  endDate: string;
  startIso: string;
  status: string;
  paymentCollected: string;
  effortUsed: string;
  openIssues: number;
  closedCRs: number;
  totalCRs: number;
}

const CLOSED_STATUSES = ['Close'] as const;
const OPEN_ISSUE_STATUSES = ['Open', 'In Progress'] as const;

export default function PortfolioReportSummary() {
  const { projects, tasks, milestones, efforts, issues, changeRequests, fetchTasks, fetchMilestones, fetchEfforts, fetchIssues, fetchCRs } = useStore();
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchTasks('');
    fetchMilestones('');
    fetchEfforts('');
    fetchIssues('');
    fetchCRs('');
  }, [fetchTasks, fetchMilestones, fetchEfforts, fetchIssues, fetchCRs]);

  const reportRows = useMemo(() => {
    return projects.map((project) => {
      const projectMilestones = milestones.filter((m) => m.projectId === project.id);
      const collectedCount = projectMilestones.filter((m) => String(m.status).toLowerCase() === 'paid').length;
      const totalMilestones = projectMilestones.length;

      const projectEfforts = efforts.filter((e) => e.projectId === project.id);
      const effortUsed = projectEfforts.reduce((sum, e) => sum + Object.values(e.monthly || {}).reduce((acc, value) => acc + Number(value || 0), 0), 0);
      const effortBudget = projectEfforts.reduce((sum, e) => sum + Number(e.budgetManday || 0), 0);

      const projectIssues = issues.filter((i) => i.projectId === project.id);
      const openIssueCount = projectIssues.filter((i) => OPEN_ISSUE_STATUSES.includes(i.status as any)).length;

      const projectCRs = changeRequests.filter((c) => c.projectId === project.id);
      const closedCRCount = projectCRs.filter((c) => CLOSED_STATUSES.includes(c.status as any)).length;

      const projectTasks = tasks.filter((t) => t.projectId === project.id && !t.parentId);
      const overall = projectTasks.length
        ? Math.round(projectTasks.reduce((sum, t) => sum + t.percentComplete, 0) / projectTasks.length)
        : 0;

      return {
        projectId: String(project.code || project.id || '-'),
        projectName: project.name || '-',
        client: project.client || '-',
        overall,
        startDate: fmtDate(project.startDate),
        endDate: fmtDate(project.endDate),
        startIso: project.startDate,
        status: project.status || 'Unknown',
        paymentCollected: `${collectedCount}/${totalMilestones}`,
        effortUsed: `${effortUsed}/${effortBudget}`,
        openIssues: openIssueCount,
        closedCRs: closedCRCount,
        totalCRs: projectCRs.length,
      };
    }).sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
  }, [projects, milestones, efforts, issues, changeRequests, tasks]);

  const ongoingRows = reportRows.filter((row) => row.status !== 'Hyper Care');
  const closeRows = reportRows.filter((row) => row.status === 'Hyper Care');

  const exportExcel = () => {
    const buildSheet = (rows: SummaryRow[]) => {
      const data = [
        ['Project ID', 'Project Name', 'Client', 'Overall %', 'Start Date', 'End Date', 'Status', 'Payments Collected / Total', 'Effort Used / Total', 'Open Issues', 'Closed CRs / Total CRs'],
        ...rows.map((row) => [
          row.projectId,
          row.projectName,
          row.client,
          `${row.overall}%`,
          row.startDate,
          row.endDate,
          row.status,
          row.paymentCollected,
          row.effortUsed,
          row.openIssues,
          `${row.closedCRs}/${row.totalCRs}`,
        ]),
      ];
      return XLSX.utils.aoa_to_sheet(data);
    };

    const wb = XLSX.utils.book_new();
    wb.Props = { Title: 'Portfolio Project Summary', CreatedDate: new Date() } as any;
    wb.SheetNames.push('On Going');
    wb.Sheets['On Going'] = buildSheet(ongoingRows);
    wb.SheetNames.push('Close');
    wb.Sheets['Close'] = buildSheet(closeRows);
    XLSX.writeFile(wb, `portfolio-summary-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel exported');
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text('Portfolio Project Summary', 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 22);
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.8);
    doc.line(14, 24, 286, 24);

    const renderGroup = (title: string, rows: SummaryRow[], yStart: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(23, 34, 63);
      doc.text(`${title} (${rows.length})`, 14, yStart);
      if (rows.length === 0) {
        doc.setFontSize(9);
        doc.text('No projects in this group.', 14, yStart + 8);
        return yStart + 14;
      }
      const body = rows.map((row) => [
        row.projectId,
        row.projectName,
        row.client,
        `${row.overall}%`,
        row.startDate,
        row.endDate,
        row.status,
        row.paymentCollected,
        row.effortUsed,
        String(row.openIssues),
        `${row.closedCRs}/${row.totalCRs}`,
      ]);
      autoTable(doc, {
        startY: yStart + 4,
        head: [[
          'Project ID', 'Project Name', 'Client', 'Overall %', 'Start Date', 'End Date', 'Status', 'Payments', 'Effort', 'Open Issues', 'Closed CRs',
        ]],
        body,
        theme: 'grid',
        tableWidth: 277,
        headStyles: { fillColor: [238, 241, 246], textColor: 36, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 50 },
          2: { cellWidth: 40 },
          3: { cellWidth: 18 },
          4: { cellWidth: 18 },
          5: { cellWidth: 18 },
          6: { cellWidth: 18 },
          7: { cellWidth: 22 },
          8: { cellWidth: 24 },
          9: { cellWidth: 18 },
          10: { cellWidth: 28 },
        },
        margin: { left: 10, right: 10 },
      });
      return (doc as any).lastAutoTable.finalY + 10;
    };

    let y = 28;
    y = renderGroup('On Going Projects', ongoingRows, y);
    if (y + 60 > 190) doc.addPage('a4', 'landscape');
    y = renderGroup('Close Projects', closeRows, y);
    doc.save(`portfolio-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('PDF exported');
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: isMobile ? '18px 16px 24px' : '24px 28px 32px', background: C.bg2, fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 18, marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.05 }}>Portfolio Project Summary</div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.text2, maxWidth: 680, lineHeight: 1.7 }}>
            A polished overview of active and closed projects with payments, effort, issues, and change request status.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
          <Btn variant="ghost" small onClick={exportExcel} style={{ minWidth: 112 }}>Export Excel</Btn>
          <Btn variant="primary" small onClick={exportPDF} style={{ minWidth: 112 }}>Export PDF</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ height: 88, padding: '12px 14px', borderRadius: 22, background: C.white, boxShadow: C.shadow2, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>On Going Projects</div>
          <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800, color: C.primary }}>{ongoingRows.length}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: C.text2 }}>Active projects still in progress</div>
        </div>
        <div style={{ height: 88, padding: '12px 14px', borderRadius: 22, background: C.white, boxShadow: C.shadow2, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Closed Projects</div>
          <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800, color: C.amber }}>{closeRows.length}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: C.text2 }}>Projects moved into close / hypercare status</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24 }}>
        {[
          { title: 'On Going Projects', rows: ongoingRows },
          { title: 'Close Projects', rows: closeRows },
        ].map((group) => (
          <div key={group.title} style={{ width: '100%' }}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{group.title}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: C.text2 }}>{group.rows.length} project{group.rows.length !== 1 ? 's' : ''} in this section.</div>
              </div>
            </div>

            {group.rows.length === 0 ? (
              <Card style={{ padding: 24, textAlign: 'center', color: C.text3, background: C.white, borderRadius: 20, boxShadow: C.shadow2, border: `1px solid ${C.border}` }}>No projects in this group.</Card>
            ) : isMobile ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {group.rows.map((row) => (
                  <div key={row.projectId} style={{ padding: 20, borderRadius: 20, background: C.white, border: `1px solid ${C.border}`, boxShadow: C.shadow2, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{row.projectName}</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: C.text2 }}>{row.projectId} • {row.client}</div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <div style={{ padding: '6px 10px', borderRadius: 999, background: C.primaryBg, color: C.primary, fontSize: 11, fontWeight: 700 }}>{row.status}</div>
                        <div style={{ color: C.text2, fontSize: 12 }}>{row.startDate} — {row.endDate}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'Overall', value: `${row.overall}%` },
                          { label: 'Payments', value: row.paymentCollected },
                          { label: 'Effort', value: row.effortUsed },
                          { label: 'Open Issues', value: String(row.openIssues) },
                          { label: 'Closed CRs', value: `${row.closedCRs}/${row.totalCRs}` },
                        ].map((item) => (
                          <div key={item.label} style={{ padding: 14, borderRadius: 16, background: C.bg, minHeight: 72 }}>
                            <div style={{ fontSize: 11, color: C.text2, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 1080, borderRadius: 20, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: C.shadow2, background: C.white }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: C.bg2, color: C.text2 }}>
                        {['Project ID', 'Project Name', 'Client', 'Overall %', 'Start Date', 'End Date', 'Status', 'Payments', 'Effort', 'Open Issues', 'Closed CRs'].map((label) => (
                          <th key={label} style={{ textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, index) => (
                        <tr key={row.projectId} style={{ background: index % 2 === 0 ? '#fff' : C.bg }}>
                          <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.6 }}>{row.projectId}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text, lineHeight: 1.6 }}>{row.projectName}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.client}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.overall}%</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.startDate}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.endDate}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.primary, fontWeight: 700, lineHeight: 1.6 }}>{row.status}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.paymentCollected}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.effortUsed}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.openIssues}</td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{row.closedCRs}/{row.totalCRs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
