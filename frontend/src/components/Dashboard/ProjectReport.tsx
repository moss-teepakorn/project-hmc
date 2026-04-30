import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { Printer } from 'lucide-react';
import { useStore } from '../../store';
import { C, Badge, Card, ProgressBar, MILESTONE_STATUS, PROJECT_STATUS } from '../Common';
import { fmtDate, fmtMoney, compareWbs, PROCESS_STATUS_STYLE, RISK_LEVEL_COLOR } from '../../utils';
import type { Project } from '../../types';
import toast from 'react-hot-toast';

interface Props { project: Project; }

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

export default function ProjectReport({ project }: Props) {
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

  const { masterCodes } = useStore();
  const statusCode = masterCodes.find((code) => code.codeType === 'project_status' && code.active && code.codeValue === project.status);
  const s = statusCode ? { bg: statusCode.bgColor, color: statusCode.textColor, label: statusCode.label } : { bg: C.bg2, color: C.text, label: project.status || 'Unknown' };
  const money2 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  // ── PDF export ─────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    const element = document.querySelector('.executive-report-page');
    if (!element) return;
    const canvas = await html2canvas(element as HTMLElement, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = W;
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    doc.save(`report-${project.code}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exported');
  };

  const exportImage = async () => {
    const element = document.querySelector('.executive-report-page');
    if (!element) return;
    const canvas = await html2canvas(element as HTMLElement, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `executive-report-${project.code}-${new Date().toISOString().split('T')[0]}.png`;
    link.click();
    toast.success('Image exported');
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', padding: 24, background: C.bg2, fontFamily: 'Poppins, sans-serif' }}>
      <div className="executive-report-page" style={{ background: C.white, borderRadius: 20, width: '100%', margin: '0 auto', boxShadow: '0 20px 60px rgba(0,0,0,0.08)', fontSize: 9 }}>
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
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={exportPDF}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', background:C.primary, border:'none', borderRadius:8, color:'#fff', fontSize:9, fontWeight:600, cursor:'pointer', fontFamily:'Poppins, sans-serif' }}>
              <Printer size={14}/> Export PDF
            </button>
            <button onClick={exportImage}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', background:C.blue, border:'none', borderRadius:8, color:'#fff', fontSize:9, fontWeight:600, cursor:'pointer', fontFamily:'Poppins, sans-serif' }}>
              Export Image
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
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {tasksForReport.map((t) => (
                    <Card key={t.id} style={{ padding: 10, marginBottom: 0, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{t.taskName}</div>
                          <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{t.wbs}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: C.text2 }}>Progress</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: t.percentComplete >= 100 ? C.green : t.percentComplete >= 60 ? C.blue : C.primary }}>{t.percentComplete}%</div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
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
              )}
            </div>
            {/* Milestones */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:6 }}>Milestones ({ms.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {ms.map((m) => {
                    const ss = MILESTONE_STATUS[m.status] ?? MILESTONE_STATUS.pending;
                    return (
                      <Card key={m.id} style={{ padding: 10, marginBottom: 0, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{m.phase}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{m.name}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 9, color: C.text2 }}>Due {fmtDate(m.dueDate)}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color:ss.color }}>{ss.label}</div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
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
              )}
            </div>
          </div>

          {/* CR + Issues + Risks summary */}
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr 1fr', gap:14 }}>
            {/* CRs */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>📝 Change Requests ({crs.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {crs.map((c) => {
                    const ss = PROCESS_STATUS_STYLE[c.status] ?? PROCESS_STATUS_STYLE['N/A'];
                    return (
                      <Card key={c.id} style={{ padding: 10, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.primary }}>{c.crId}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{c.title.substring(0,30)}</div>
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 600, color: ss.color, background: ss.bg, padding: '2px 8px', borderRadius: 10 }}>{c.status}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
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
              )}
            </div>
            {/* Issues */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>🔴 Issues ({iss.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {iss.map((issue) => {
                    const ss = PROCESS_STATUS_STYLE[issue.status] ?? PROCESS_STATUS_STYLE['N/A'];
                    return (
                      <Card key={issue.id} style={{ padding: 10, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{issue.title.substring(0,30)}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>{fmtDate(issue.issueDate)} · {issue.assignedTo||'—'}</div>
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 600, color:ss.color, background:ss.bg, padding: '2px 8px', borderRadius: 10 }}>{issue.status}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
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
              )}
            </div>
            {/* Risks */}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:C.text, marginBottom:8 }}>🎯 Risks ({rks.length})</div>
              {isMobile ? (
                <div style={{ display:'grid', gap:8 }}>
                  {rks.map((r) => {
                    const rc = RISK_LEVEL_COLOR[r.impact] || C.text2;
                    const sc = r.status === 'Monitoring' ? C.red : r.status === 'Mitigating' ? C.amber : C.green;
                    return (
                      <Card key={r.id} style={{ padding: 10, boxShadow: 'rgba(0,0,0,0.06) 0px 1px 3px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.text }}>{r.title.substring(0,30)}</div>
                            <div style={{ fontSize: 9, color: C.text2, marginTop: 2 }}>P:{r.probability} / I:{r.impact}</div>
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 600, color: sc, background: sc + '18', padding: '2px 8px', borderRadius: 10 }}>{r.status}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
