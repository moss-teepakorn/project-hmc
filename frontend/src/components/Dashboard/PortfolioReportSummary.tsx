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
  const { projects, milestones, efforts, issues, changeRequests, fetchMilestones, fetchEfforts, fetchIssues, fetchCRs } = useStore();
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchMilestones('');
    fetchEfforts('');
    fetchIssues('');
    fetchCRs('');
  }, [fetchMilestones, fetchEfforts, fetchIssues, fetchCRs]);

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

      return {
        projectId: String(project.code || project.id || '-'),
        projectName: project.name || '-',
        client: project.client || '-',
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
  }, [projects, milestones, efforts, issues, changeRequests]);

  const ongoingRows = reportRows.filter((row) => row.status !== 'Hyper Care');
  const closeRows = reportRows.filter((row) => row.status === 'Hyper Care');

  const exportExcel = () => {
    const buildSheet = (rows: SummaryRow[]) => {
      const data = [
        ['Project ID', 'Project Name', 'Client', 'Start Date', 'End Date', 'Status', 'Payments Collected / Total', 'Effort Used / Total', 'Open Issues', 'Closed CRs / Total CRs'],
        ...rows.map((row) => [
          row.projectId,
          row.projectName,
          row.client,
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
    doc.setFontSize(14);
    doc.text('Portfolio Project Summary', 14, 14);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 20);

    const renderGroup = (title: string, rows: SummaryRow[], yStart: number) => {
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
          'Project ID', 'Project Name', 'Client', 'Start Date', 'End Date', 'Status', 'Payments', 'Effort', 'Open Issues', 'Closed CRs',
        ]],
        body,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 40 },
          2: { cellWidth: 30 },
          3: { cellWidth: 18 },
          4: { cellWidth: 18 },
          5: { cellWidth: 18 },
          6: { cellWidth: 20 },
          7: { cellWidth: 22 },
          8: { cellWidth: 16 },
          9: { cellWidth: 24 },
        },
        margin: { left: 14, right: 14 },
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
    <Card style={{ padding: 18, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Project Summary Report</div>
          <div style={{ fontSize: 11, color: C.text2, marginTop: 4 }}>Summary of all projects grouped by On Going and Close.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="ghost" small onClick={exportExcel}>Export Excel</Btn>
          <Btn variant="ghost" small onClick={exportPDF}>Export PDF</Btn>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div style={{ padding: 12, background: C.bg, borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: C.text2 }}>On Going Projects</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.primary }}>{ongoingRows.length}</div>
          </div>
          <div style={{ padding: 12, background: C.bg, borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: C.text2 }}>Close Projects</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.amber }}>{closeRows.length}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {[
          { title: 'On Going Projects', rows: ongoingRows },
          { title: 'Close Projects', rows: closeRows },
        ].map((group) => (
          <div key={group.title}>
            <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: C.text }}>{group.title} ({group.rows.length})</div>
            {group.rows.length === 0 ? (
              <Card style={{ padding: 16, textAlign: 'center', color: C.text3 }}>No projects</Card>
            ) : isMobile ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {group.rows.map((row) => (
                  <Card key={row.projectId} style={{ padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{row.projectName}</div>
                        <div style={{ fontSize: 11, color: C.text2, marginBottom: 4 }}>{row.client}</div>
                        <div style={{ fontSize: 11, color: C.text2 }}>{row.projectId}</div>
                      </div>
                      <div style={{ display: 'grid', gap: 4, minWidth: 120, textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{row.status}</div>
                        <div style={{ fontSize: 10, color: C.text2 }}>{row.startDate} - {row.endDate}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: C.text2 }}><strong style={{ color: C.text }}>Payments</strong><br />{row.paymentCollected}</div>
                      <div style={{ fontSize: 11, color: C.text2 }}><strong style={{ color: C.text }}>Effort</strong><br />{row.effortUsed}</div>
                      <div style={{ fontSize: 11, color: C.text2 }}><strong style={{ color: C.text }}>Open Issues</strong><br />{row.openIssues}</div>
                      <div style={{ fontSize: 11, color: C.text2 }}><strong style={{ color: C.text }}>Closed CRs</strong><br />{row.closedCRs}/{row.totalCRs}</div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      {['Project ID', 'Project Name', 'Client', 'Start Date', 'End Date', 'Status', 'Payments', 'Effort', 'Open Issues', 'Closed CRs'].map((label) => (
                        <th key={label} style={{ ...TH, padding: '10px 12px', fontSize: 11, textAlign: 'left' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, index) => (
                      <tr key={row.projectId} style={{ background: index % 2 === 0 ? C.white : C.bg }}>
                        <td style={{ ...TD, padding: '10px 12px', fontWeight: 700 }}>{row.projectId}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.projectName}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.client}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.startDate}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.endDate}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.status}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.paymentCollected}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.effortUsed}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.openIssues}</td>
                        <td style={{ ...TD, padding: '10px 12px' }}>{row.closedCRs}/{row.totalCRs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
