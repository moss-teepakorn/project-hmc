import React, { useMemo, useRef, useState, useCallback, RefObject } from 'react';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { C } from '../Common';
import { getProjectDateRange, getMonths, getDays, dayOffset, fmtDate, hasChildren } from '../../utils';
import { ROW_H, HDR_H } from '../Table/TasksTab';
import type { Task } from '../../types';

// ── Zoom levels (step-by-step) ──────────────────────────────────────────────
export const ZOOM_LEVELS = [
  { name: 'Quarter', dayWidth: 1.2 },
  { name: 'Month',   dayWidth: 3.5 },
  { name: 'Half Mo', dayWidth: 7   },
  { name: 'Week',    dayWidth: 14  },
  { name: 'Day',     dayWidth: 36  },
] as const;

export type ZoomLevel = typeof ZOOM_LEVELS[number];

const DEFAULT_ZOOM_INDEX = 3; // Week

interface Props {
  tasks: Task[];
  visibleTasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, field: string, value: string) => void;
  ganttBodyRef?: RefObject<HTMLDivElement>;
  onGanttScroll?: () => void;
  zoomIndex: number;
  onZoomChange: (idx: number) => void;
}

export default function GanttChart({ tasks, visibleTasks, selectedId, onSelect, onUpdate, ganttBodyRef, onGanttScroll, zoomIndex, onZoomChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [drag, setDrag]       = useState<{ taskId: string; startX: number; deltaDays: number } | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(true);

  const dayWidth = ZOOM_LEVELS[zoomIndex].dayWidth;

  const { minDate, maxDate } = useMemo(() => getProjectDateRange(tasks), [tasks]);
  const totalDays = useMemo(() => Math.max(30, Math.round((maxDate.getTime() - minDate.getTime()) / 86400000)), [minDate, maxDate]);
  const months    = useMemo(() => getMonths(minDate, maxDate), [minDate, maxDate]);
  const days      = useMemo(() => getDays(minDate, totalDays), [minDate, totalDays]);
  const totalW    = totalDays * dayWidth;
  const todayX    = dayOffset(minDate, format(new Date(), 'yyyy-MM-dd')) * dayWidth + dayWidth / 2;

  const barColor = (t: Task) =>
    t.percentComplete >= 100 ? C.green : t.percentComplete >= 60 ? C.blue : C.primary;

  const onDragStart = useCallback((e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    setDrag({ taskId, startX: e.clientX, deltaDays: 0 });
  }, []);

  const onDragMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.startX) / dayWidth);
    if (delta !== drag.deltaDays) setDrag(d => d ? { ...d, deltaDays: delta } : null);
  }, [drag, dayWidth]);

  const onDragEnd = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.startX) / dayWidth);
    setDrag(null);
    if (delta === 0) return;
    const task = tasks.find(t => t.id === drag.taskId);
    if (!task) return;
    const ns = addDays(parseISO(task.startDate), delta);
    const ne = addDays(parseISO(task.endDate),   delta);
    if (isValid(ns) && isValid(ne)) {
      onUpdate(task.id, 'startDate', format(ns, 'yyyy-MM-dd'));
      onUpdate(task.id, 'endDate',   format(ne, 'yyyy-MM-dd'));
    }
  }, [drag, tasks, onUpdate, dayWidth]);

  const arrows = useMemo(() => {
    return visibleTasks.flatMap((task, ri) => {
      if (!task.relatedTask) return [];
      const predIdx = visibleTasks.findIndex(t => t.id === task.relatedTask);
      if (predIdx < 0) return [];
      const pred = visibleTasks[predIdx];
      const dependencyType = String(task.relatedTaskType || 'FS').toUpperCase();
      const lagDays = Number.isFinite(Number(task.relatedTaskLagDays)) ? Number(task.relatedTaskLagDays) : 0;

      const predStartX = dayOffset(minDate, pred.startDate) * dayWidth;
      const predEndX = dayOffset(minDate, pred.endDate) * dayWidth + dayWidth;
      const taskStartX = dayOffset(minDate, task.startDate) * dayWidth;
      const taskEndX = dayOffset(minDate, task.endDate) * dayWidth + dayWidth;
      const lagX = lagDays * dayWidth;

      const fromStart = dependencyType === 'SS' || dependencyType === 'SF';
      const toEnd = dependencyType === 'FF' || dependencyType === 'SF';

      return [{
        x1: (fromStart ? predStartX : predEndX) + lagX,
        y1: predIdx * ROW_H + ROW_H / 2,
        x2: toEnd ? taskEndX : taskStartX,
        y2: ri      * ROW_H + ROW_H / 2,
        key: task.id,
        label: lagDays !== 0 ? `${dependencyType}${lagDays > 0 ? '+' : ''}${lagDays}` : dependencyType,
      }];
    });
  }, [visibleTasks, minDate, dayWidth]);

  // Show day numbers only when zoomed in enough
  const showDayLabels = dayWidth >= 10;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sticky header - month + day labels — height matches table header (HDR_H) */}
      <div style={{ flexShrink: 0, height: HDR_H, overflowX: 'hidden', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <svg width={totalW} height={HDR_H} style={{ display: 'block' }}>
          {months.map((mo, i) => {
            const x   = dayOffset(minDate, format(mo, 'yyyy-MM-dd')) * dayWidth;
            const nx  = months[i + 1];
            const end = nx ? dayOffset(minDate, format(nx, 'yyyy-MM-dd')) * dayWidth : totalW;
            return (
              <g key={i}>
                <rect x={x} y={0} width={end - x} height={24} fill={C.bg} />
                <rect x={x} y={0} width={1} height={HDR_H} fill={C.border} />
                <text x={x + 8} y={16} fill={C.text2} fontSize={10} fontFamily="Poppins, sans-serif" fontWeight={600} letterSpacing="0.06em">
                  {format(mo, 'MMM yyyy').toUpperCase()}
                </text>
              </g>
            );
          })}
          {showDayLabels && days.map(({ i, d, isWeekend, showLabel }) => (
            <g key={i}>
              <rect x={i * dayWidth} y={24} width={dayWidth} height={HDR_H - 24} fill={isWeekend ? C.bg2 : C.bg} />
              <rect x={i * dayWidth} y={24} width={1} height={HDR_H - 24} fill={C.border} />
              {showLabel && (
                <text x={i * dayWidth + dayWidth / 2} y={HDR_H - 6} textAnchor="middle" fill={isWeekend ? C.border2 : C.text3} fontSize={9} fontFamily="Poppins, sans-serif">
                  {d.getDate()}
                </text>
              )}
            </g>
          ))}
          {/* Today in header */}
          {todayX > 0 && todayX < totalW && (
            <g>
              <rect x={todayX - 18} y={24} width={36} height={HDR_H - 24} fill={C.red} rx={4} />
              <text x={todayX} y={HDR_H - 6} textAnchor="middle" fill="#fff" fontSize={9} fontFamily="Poppins, sans-serif" fontWeight={700}>TODAY</text>
            </g>
          )}
        </svg>
      </div>

      {/* Scrollable body - rows only */}
      <div
        ref={ganttBodyRef}
        onScroll={(e) => { onGanttScroll?.(); if (showScrollHint && (e.currentTarget.scrollLeft > 20)) setShowScrollHint(false); }}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        style={{ flex: 1, overflowY: 'scroll', overflowX: 'auto', userSelect: 'none', background: C.white, position: 'relative' }}>
        {/* Mobile scroll hint */}
        {showScrollHint && window.innerWidth < 768 && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 10, fontFamily: 'Poppins, sans-serif', whiteSpace: 'nowrap', zIndex: 50, pointerEvents: 'none', animation: 'fadeInOut 3s forwards' }}>
            ← Scroll horizontally
          </div>
        )}
        <svg
          ref={svgRef}
          width={totalW}
          height={visibleTasks.length * ROW_H}
          style={{ display: 'block' }}>
          {/* Weekend bg */}
          {days.map(({ i, isWeekend }) => isWeekend && (
            <rect key={i} x={i * dayWidth} y={0} width={dayWidth} height={visibleTasks.length * ROW_H} fill={C.bg} opacity={0.8} />
          ))}
          {/* Row stripes */}
          {visibleTasks.map((_, ri) => ri % 2 === 0 && (
            <rect key={ri} x={0} y={ri * ROW_H} width={totalW} height={ROW_H} fill="#FAFBFF" />
          ))}
          {/* Row dividers */}
          {visibleTasks.map((_, ri) => (
            <line key={ri} x1={0} y1={(ri + 1) * ROW_H} x2={totalW} y2={(ri + 1) * ROW_H} stroke={C.border} strokeWidth={1} />
          ))}
          {/* Today vertical line */}
          {todayX > 0 && todayX < totalW && (
            <line x1={todayX} y1={0} x2={todayX} y2={visibleTasks.length * ROW_H} stroke={C.red} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />
          )}
          {/* Dependency arrows */}
          {arrows.map(a => {
            const mx = (a.x1 + a.x2) / 2;
            return (
              <g key={a.key}>
                <path d={`M${a.x1},${a.y1} C${mx},${a.y1} ${mx},${a.y2} ${a.x2},${a.y2}`}
                  fill="none" stroke={C.primary} strokeWidth={1.5} opacity={0.35} />
                <polygon points={`${a.x2},${a.y2} ${a.x2 - 5},${a.y2 - 3} ${a.x2 - 5},${a.y2 + 3}`} fill={C.primary} opacity={0.45} />
                <text x={mx + 3} y={Math.min(a.y1, a.y2) - 4} fill={C.text3} fontSize={9} fontFamily="Poppins, sans-serif">{a.label}</text>
              </g>
            );
          })}
          {/* Bars */}
          {visibleTasks.map((task, ri) => {
            if (!task.startDate || !task.endDate) return null;
            const isDrag  = drag?.taskId === task.id;
            const delta   = isDrag ? (drag?.deltaDays ?? 0) : 0;
            const bx      = (dayOffset(minDate, task.startDate) + delta) * dayWidth;
            const bw      = Math.max(task.duration * dayWidth, dayWidth);
            const by      = ri * ROW_H + 7;
            const bh      = ROW_H - 14;
            const isParent = hasChildren(tasks, task.id);
            const isSel   = selectedId === task.id;
            const bc      = barColor(task);
            const pw      = (task.percentComplete / 100) * bw;
            return (
              <g key={task.id} style={{ cursor: drag ? 'grabbing' : 'grab' }}
                onMouseDown={e => onDragStart(e, task.id)}
                onClick={() => onSelect(task.id)}
                onMouseEnter={e => {
                  const r = svgRef.current?.getBoundingClientRect();
                  if (r) setTooltip({ task, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onMouseLeave={() => setTooltip(null)}>
                <rect x={bx + 1} y={by + 2} width={bw} height={bh} rx={4} fill="rgba(0,0,0,0.06)" />
                <rect x={bx} y={by} width={bw} height={bh} rx={4}
                  fill={bc + '22'} stroke={isSel ? C.text : bc} strokeWidth={isSel ? 2 : 1} opacity={isDrag ? 0.7 : 1} />
                {pw > 0 && <rect x={bx} y={by} width={pw} height={bh} rx={4} fill={bc} opacity={0.55} />}
                {isParent && (
                  <>
                    <polygon points={`${bx},${by + bh / 2} ${bx + 6},${by} ${bx + 6},${by + bh}`} fill={bc} />
                    <polygon points={`${bx + bw},${by + bh / 2} ${bx + bw - 6},${by} ${bx + bw - 6},${by + bh}`} fill={bc} />
                  </>
                )}
                {bw > 48 && (
                  <>
                    <defs><clipPath id={`clip-${task.id}`}><rect x={bx + 6} y={by} width={bw - 12} height={bh} /></clipPath></defs>
                    <text x={bx + 10} y={by + bh / 2 + 4} fill={C.text} fontSize={10} fontFamily="Poppins, sans-serif"
                      fontWeight={isParent ? 600 : 400} clipPath={`url(#clip-${task.id})`} style={{ pointerEvents: 'none' }}>
                      {task.taskName}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{ position: 'sticky', left: tooltip.x + 14, top: tooltip.y, pointerEvents: 'none', zIndex: 50,
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px',
            boxShadow: C.shadow2, fontSize: 12, minWidth: 180, display: 'inline-block' }}>
            <div style={{ fontWeight: 700, color: C.text, marginBottom: 5 }}>{tooltip.task.taskName}</div>
            <div style={{ color: C.text2 }}>WBS: {tooltip.task.wbs}</div>
            <div style={{ color: C.text2 }}>{fmtDate(tooltip.task.startDate)} → {fmtDate(tooltip.task.endDate)}</div>
            <div style={{ color: C.text2 }}>{tooltip.task.duration} days · {tooltip.task.percentComplete}%</div>
            {tooltip.task.resource && <div style={{ color: C.text2, marginTop: 4 }}>👤 {tooltip.task.resource}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
