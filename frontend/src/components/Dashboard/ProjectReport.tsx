import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Printer, X } from 'lucide-react';
import { useStore } from '../../store';
import { C, Badge, ProgressBar, MILESTONE_STATUS, PROJECT_STATUS } from '../Common';
import { fmtDate, fmtMoney, compareWbs, PROCESS_STATUS_STYLE, RISK_LEVEL_COLOR } from '../../utils';
import type { Project } from '../../types';
import toast from 'react-hot-toast';

interface Props { project: Project; onClose: () => void; }

function DonutChart({ value, size = 88, color = C.primary }: { value: number; size?: number; color?: string }) {
  const r    = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.bg2} strokeWidth={9}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+5} textAnchor="middle" fontSize={16} fontWeight={700} fill={color} fontFamily="Poppins, sans-serif">{value}%</text>
    </svg>
  );
}

export default function ProjectReport({ project, onClose }: Props) {
  const { tasks, milestones, efforts, changeRequests, issues, risks } = useStore();
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const pt  = tasks.filter(t => t.projectId === project.id);
  const ms  = milestones.filter(m => m.projectId === project.id);
  const ef  = efforts.filter(e => e.projectId === project.id);
  const crs = changeRequests.filter(c => c.projectId === project.id);
  const iss = issues.filter(i => i.projectId === project.id);
  const rks = risks.filter(r => r.projectId === project.id);

  const roots    = pt.filter(t => !t.parentId);
  const tasksForReport = [...roots].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const prog     = roots.length ? Math.round(roots.reduce((s,t)=>s+t.percentComplete,0)/roots.length) : 0;
  const done     = pt.filter(t=>t.percentComplete===100).length;
  const inProg   = pt.filter(t=>t.percentComplete>0&&t.percentComplete<100).length;
  const notStart = pt.filter(t=>t.percentComplete===0).length;

  const totalContract = ms.reduce((s,m)=>s+m.amount,0);
  const paidAmt       = ms.filter(m=>m.status==='paid').reduce((s,m)=>s+m.amount,0);
  const billedAmt     = ms.filter(m=>m.status==='billed').reduce((s,m)=>s+m.amount,0);
  const payPct        = totalContract>0?Math.round((paidAmt/totalContract)*100):0;

  const tBudMD  = ef.reduce((s,e)=>s+e.budgetManday,0);
  const tUsedMD = ef.reduce((s,e)=>s+Object.values(e.monthly||{}).reduce((a,v)=>a+v,0),0);
  const efPct   = tBudMD>0?Math.round((tUsedMD/tBudMD)*100):0;

  const openIssues = iss.filter(i=>i.status==='Open'||i.status==='In Progress').length;
  const openRisks  = rks.filter(r=>r.status==='Monitoring'||r.status==='Mitigating').length;
  const openCRs    = crs.filter(c=>c.status==='Draft'||c.status==='Submitted'||c.status==='Under Review').length;

  const s = PROJECT_STATUS[project.status]??PROJECT_STATUS['Planning'];
  const money2 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  // ── PDF export ─────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();

    // Header band
    doc.setFillColor(79,70,229); doc.rect(0,0,W,26,'F');
    doc.setFontSize(15); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
    doc.text(project.name, 12, 13);
    doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text(`${project.code} | ${project.client} | ${fmtDate(project.startDate)} - ${fmtDate(project.endDate)}`, 12, 20);
    doc.setFillColor(255,255,255);
    doc.roundedRect(W-46,7,32,12,3,3,'F');
    doc.setTextColor(79,70,229); doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text(s.label.toUpperCase(), W-30, 15, {align:'center'});
    doc.setTextColor(200,200,220); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text(`Report: ${new Date().toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'})}`, W-12, 24, {align:'right'});
    doc.setTextColor(0);

    let y = 30;

    // KPI boxes row
    const kpis = [
      {label:'Overall Progress',  value:`${prog}%`,   sub:`${done} done / ${inProg} in-progress`,    c:[79,70,229]  as [number,number,number]},
      {label:'Payment Collected', value:`${payPct}%`, sub:`${money2(paidAmt)} / ${money2(totalContract)}`, c:[16,185,129] as [number,number,number]},
      {label:'Manday Used',       value:`${efPct}%`,  sub:`${tUsedMD} / ${tBudMD} MD`,               c:[245,158,11] as [number,number,number]},
      {label:'Open Issues/CRs',   value:`${openIssues+openCRs}`, sub:`${openRisks} open risks`,    c:openIssues+openCRs>0?[239,68,68] as [number,number,number]:[16,185,129] as [number,number,number]},
    ];
    const kw = (W-28)/4;
    kpis.forEach((k,i) => {
      const x = 12 + i*(kw+1.3);
      doc.setFillColor(248,250,252); doc.roundedRect(x,y,kw,20,2,2,'F');
      doc.setDrawColor(...k.c); doc.setLineWidth(0.4); doc.roundedRect(x,y,kw,20,2,2,'S');
      doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(...k.c);
      doc.text(k.value, x+kw/2, y+12, {align:'center'});
      doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(100);
      doc.text(k.label, x+kw/2, y+6,  {align:'center'});
      doc.text(k.sub,   x+kw/2, y+18, {align:'center'});
    });
    y += 24;

    // Two columns: Tasks | Milestones
    const cw = (W-28-3)/2;

    // Section titles
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.text('Main Tasks', 12, y + 2);
    doc.text('Milestones', 12 + cw + 3, y + 2);
    doc.setFont('helvetica','normal');

    // Tasks
    const summaryTaskRows = tasksForReport.slice(0,12).map(t=>[
      t.wbs, t.taskName.substring(0,36),
      fmtDate(t.startDate), fmtDate(t.endDate),
      t.actualFinish ? fmtDate(t.actualFinish) : '-',
      `${t.percentComplete}%`,
    ]);
    autoTable(doc,{ 
      startY:y + 6, tableWidth:cw, margin:{left:12, right:W-12-cw},
      head:[['WBS','Task','Start','Finish','Actual','%']],
      body:summaryTaskRows.length?summaryTaskRows:[['','No tasks','','','','']],
      styles:{fontSize:7,cellPadding:1.5},
      headStyles:{fillColor:[79,70,229],textColor:255,fontSize:7},
      alternateRowStyles:{fillColor:[248,250,252]},
      columnStyles:{0:{cellWidth:12},1:{cellWidth:cw-80},2:{cellWidth:17},3:{cellWidth:17},4:{cellWidth:17},5:{cellWidth:12}},
      didParseCell(d){
        if(d.column.index===5&&d.section==='body'){
          const p=parseInt(d.cell.raw as string)||0;
          d.cell.styles.textColor=p>=100?[16,185,129]:p>=60?[59,130,246]:[79,70,229];
          d.cell.styles.fontStyle='bold';
        }
      },
    });
    const tasksTableEndY: number = ((doc as any).lastAutoTable?.finalY ?? (y + 35));

    // Milestones
    const msRows = ms.slice(0, 10).map(m=>[m.phase,m.name.substring(0,26),money2(m.amount),fmtDate(m.dueDate),m.status.toUpperCase()]);
    autoTable(doc,{ 
      startY:y + 6, tableWidth:cw, margin:{left:12+cw+3, right:12},
      head:[['Phase','Milestone','Amount','Due','Status']],
      body:msRows.length?msRows:[['','No milestones','','','']],
      styles:{fontSize:7,cellPadding:1.5},
      headStyles:{fillColor:[16,185,129],textColor:255,fontSize:7},
      columnStyles:{0:{cellWidth:14},1:{cellWidth:cw-68},2:{cellWidth:18},3:{cellWidth:17},4:{cellWidth:15}},
      didParseCell(d){
        if(d.column.index===4&&d.section==='body'){
          const v=String(d.cell.raw).toLowerCase();
          d.cell.styles.textColor=v==='paid'?[16,185,129]:v==='billed'?[59,130,246]:[245,158,11];
          d.cell.styles.fontStyle='bold';
        }
      },
    });
    const milestonesTableEndY: number = ((doc as any).lastAutoTable?.finalY ?? (y + 35));

    const midY: number = Math.max(tasksTableEndY, milestonesTableEndY, y + 35) + 4;

    // CR | Issues | Risks (3 columns)
    const sw = (W-28-6)/3;
    const crRows2  = crs.slice(0, 8).map(c=>[c.crId,c.title.substring(0,22),`${c.totalManday}MD`,c.status]);
    const issRows2 = iss.slice(0, 8).map(i=>[fmtDate(i.issueDate),i.title.substring(0,22),i.assignedTo||'-',i.status]);
    const rskRows2 = rks.slice(0, 8).map(r=>[r.title.substring(0,24),r.probability,r.impact,r.status]);
    const sections: Array<{rows:string[][];title:string;head:string[];color:[number,number,number];left:number}> = [
      {rows:crRows2,  title:'Change Requests',head:['CR ID','Title','MD','Status'],       color:[79,70,229],  left:12},
      {rows:issRows2, title:'Issues',          head:['Date','Title','Assigned','Status'], color:[239,68,68],  left:12+sw+3},
      {rows:rskRows2, title:'Risks',           head:['Title','Prob','Impact','Status'],   color:[245,158,11], left:12+2*(sw+3)},
    ];
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    sections.forEach(({title, left}) => {
      doc.setTextColor(0);
      doc.text(title, left, midY + 2);
    });
    doc.setFont('helvetica','normal');

    sections.forEach(({rows, head, color, left}) => {
      autoTable(doc,{ 
        startY:midY + 6, tableWidth:sw, margin:{left, right:W-left-sw},
        head:[head],
        body:rows.length?rows:[['','No data','','']],
        styles:{fontSize:6.5,cellPadding:1.2},
        headStyles:{fillColor:color,textColor:255,fontSize:7,fontStyle:'bold'},
        columnStyles:{0:{cellWidth:sw*0.28},1:{cellWidth:sw*0.38},2:{cellWidth:sw*0.18},3:{cellWidth:sw*0.16}},
      });
    });

    // Footer
    doc.setFontSize(6.5); doc.setTextColor(160);
    doc.text('ProjectMS Enterprise - Executive Report', 12, H-4);
    doc.text('Page 1 of 1 | Confidential', W-12, H-4, {align:'right'});

    doc.save(`report-${project.code}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exported');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', padding: 24, background: 'rgba(15,23,42,0.08)', fontFamily: 'Poppins, sans-serif', zIndex: 500 }}>
      <div className="executive-report-page" style={{ background: C.white, borderRadius: 20, width: '100%', maxWidth: 1400, margin: '0 auto', boxShadow: '0 20px 60px rgba(0,0,0,0.08)', fontSize: 9 }}>
        <style>{`
          .executive-report-page table td,
          .executive-report-page table th,
          .executive-report-page .report-list-row div,
          .executive-report-page .report-list-row span {
            font-size: 9px !important;
            font-family: Poppins, sans-serif !important;
          }
        `}</style>
        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:20, fontWeight:700, color:C.text }}>Executive Report - {project.name}</span>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={exportPDF}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', background:C.primary, border:'none', borderRadius:8, color:'#fff', fontSize:9, fontWeight:600, cursor:'pointer', fontFamily:'Poppins, sans-serif' }}>
              <Printer size={14}/> Export PDF
            </button>
            <button onClick={onClose}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, color:C.text2, fontSize:9, cursor:'pointer', fontFamily:'Poppins, sans-serif' }}>
              <X size={14}/> Close
            </button>
          </div>
        </div>

        {/* Report body */}
        <div style={{ padding:18 }}>
          {/* Header */}
          <div style={{ background:`linear-gradient(135deg,${C.primary},#818CF8)`, borderRadius:12, padding:'14px 20px', marginBottom:14, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800 }}>{project.name}</div>
              <div style={{ fontSize:11, opacity:0.86, marginTop:2 }}>{project.code} | {project.client} | {fmtDate(project.startDate)} - {fmtDate(project.endDate)}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ background:'rgba(255,255,255,0.25)', borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:600 }}>{s.label}</div>
              <div style={{ fontSize:9, opacity:0.75, marginTop:3 }}>{new Date().toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'repeat(4,1fr)', gap:10, marginBottom:12 }}>
            {[
              { label:'Overall Progress', value:prog,   color:C.primary, sub:`${done} done · ${inProg} in progress` },
              { label:'Payment',          value:payPct, color:C.green,   sub:`${money2(paidAmt)} collected` },
              { label:'Manday',           value:efPct,  color:efPct>90?C.red:efPct>70?C.amber:C.primary, sub:`${tUsedMD}/${tBudMD} MD` },
              { label:'Issues/CRs Open', value:openIssues+openCRs, color:openIssues+openCRs>0?C.red:C.green, sub:`${openRisks} risks open`, isCount:true },
            ].map(k => (
              <div key={k.label} style={{ background:C.bg, borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
                {!k.isCount ? <DonutChart value={k.value} color={k.color} size={72}/> : (
                  <div style={{ width:72, height:72, borderRadius:'50%', background:k.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:800, color:k.color }}>{k.value}</div>
                )}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{k.label}</div>
                  <div style={{ fontSize:10, color:C.text2, marginTop:2 }}>{k.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tasks + Milestones */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:10, marginBottom:10 }}>
            {/* Tasks */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:6 }}>Main Tasks ({tasksForReport.length})</div>
              <div style={{ background:C.bg, borderRadius:10, overflow:'hidden', maxHeight:260, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:8 }}>
                  <thead><tr style={{ background:C.primary }}>
                    {['WBS','Task','Start','Finish','Actual','%'].map(h=>(
                      <th key={h} style={{ padding:'5px 7px', color:'#fff', textAlign:'left', fontSize:8, fontWeight:600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {tasksForReport.map((t,i)=>(
                      <tr key={t.id} style={{ background:i%2===0?C.white:C.bg }}>
                        <td style={{ padding:'4px 7px', fontSize:8, color:C.text3 }}>{t.wbs}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, fontWeight:500 }}>{t.taskName}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, color:C.text2 }}>{fmtDate(t.startDate)}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, color:C.text2 }}>{fmtDate(t.endDate)}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, color:t.actualFinish?C.green:C.text3 }}>{t.actualFinish?fmtDate(t.actualFinish):'-'}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, fontWeight:700, color:t.percentComplete>=100?C.green:t.percentComplete>=60?C.blue:C.primary }}>{t.percentComplete}%</td>
                      </tr>
                    ))}
                    {tasksForReport.length===0&&<tr><td colSpan={6} style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No tasks</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Milestones */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:6 }}>Milestones ({ms.length})</div>
              <div style={{ background:C.bg, borderRadius:10, overflow:'hidden', maxHeight:260, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:8 }}>
                  <thead><tr style={{ background:C.green }}>
                    {['Phase','Name','Amount','Due','Status'].map(h=>(
                      <th key={h} style={{ padding:'5px 7px', color:'#fff', textAlign:'left', fontSize:8, fontWeight:600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {ms.map((m,i)=>{const ss=MILESTONE_STATUS[m.status]??MILESTONE_STATUS.pending;return(
                      <tr key={m.id} style={{ background:i%2===0?C.white:C.bg }}>
                        <td style={{ padding:'4px 7px', fontSize:8, color:C.text3 }}>{m.phase}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, fontWeight:500 }}>{m.name}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, fontFamily:'Poppins, sans-serif', color:C.primary }}>{money2(m.amount)}</td>
                        <td style={{ padding:'4px 7px', fontSize:8, color:C.text2 }}>{fmtDate(m.dueDate)}</td>
                        <td style={{ padding:'4px 7px' }}><span style={{ fontSize:8, fontWeight:600, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:10 }}>{ss.label}</span></td>
                      </tr>
                    );})}
                    {ms.length===0&&<tr><td colSpan={5} style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No milestones</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* CR + Issues + Risks summary */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr 1fr', gap:14 }}>
            {/* CRs */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>📝 Change Requests ({crs.length})</div>
              <div style={{ background:C.bg, borderRadius:10, overflow:'hidden' }}>
                {crs.length===0&&<div style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No CRs</div>}
                {crs.map((c,i)=>{const ss=PROCESS_STATUS_STYLE[c.status]??PROCESS_STATUS_STYLE['N/A'];return(
                  <div key={c.id} className="report-list-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:i%2===0?C.white:C.bg, borderBottom:`1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize:8, fontWeight:600, color:C.primary }}>{c.crId}</div>
                      <div style={{ fontSize:8, color:C.text2 }}>{c.title.substring(0,28)} · {c.totalManday}MD</div>
                    </div>
                    <span style={{ fontSize:8, fontWeight:600, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:10, flexShrink:0, marginLeft:8 }}>{c.status}</span>
                  </div>
                );})}
              </div>
            </div>
            {/* Issues */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>🔴 Issues ({iss.length})</div>
              <div style={{ background:C.bg, borderRadius:10, overflow:'hidden' }}>
                {iss.length===0&&<div style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No issues</div>}
                {iss.map((issue,i)=>{const ss=PROCESS_STATUS_STYLE[issue.status]??PROCESS_STATUS_STYLE['N/A'];return(
                  <div key={issue.id} className="report-list-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:i%2===0?C.white:C.bg, borderBottom:`1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize:8, fontWeight:600, color:C.text }}>{issue.title.substring(0,28)}</div>
                      <div style={{ fontSize:8, color:C.text2 }}>{fmtDate(issue.issueDate)} · {issue.assignedTo||'—'}</div>
                    </div>
                    <span style={{ fontSize:8, fontWeight:600, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:10, flexShrink:0, marginLeft:8 }}>{issue.status}</span>
                  </div>
                );})}
              </div>
            </div>
            {/* Risks */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>🎯 Risks ({rks.length})</div>
              <div style={{ background:C.bg, borderRadius:10, overflow:'hidden' }}>
                {rks.length===0&&<div style={{ padding:16, textAlign:'center', fontSize:8, color:C.text3 }}>No risks</div>}
                {rks.map((r,i)=>{
                  const rc=RISK_LEVEL_COLOR[r.impact]||C.text2;
                  const sc=r.status==='Monitoring'?C.red:r.status==='Mitigating'?C.amber:C.green;
                  return(
                  <div key={r.id} className="report-list-row" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:i%2===0?C.white:C.bg, borderBottom:`1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize:8, fontWeight:600, color:C.text }}>{r.title.substring(0,28)}</div>
                      <div style={{ fontSize:8 }}>
                        <span style={{ color:rc, fontWeight:600 }}>P:{r.probability} / I:{r.impact}</span>
                        <span style={{ color:C.text3 }}> · {r.owner||'—'}</span>
                      </div>
                    </div>
                    <span style={{ fontSize:8, fontWeight:600, color:sc, background:sc+'18', padding:'2px 8px', borderRadius:10, flexShrink:0, marginLeft:8 }}>{r.status}</span>
                  </div>
                );})}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
