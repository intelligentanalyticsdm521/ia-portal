import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const COLORS = {
  sky: '#2D9CDB',
  skyDark: '#1A7DB5',
  orange: '#EF6C33',
  green: '#16A34A',
  red: '#DC2626',
  muted: '#5A7A8A',
  tint: '#E8F4FB',
  border: 'rgba(45,156,219,0.12)',
};

const CHART_STYLE = {
  fontSize: 11,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

/* ── Trend Line Chart ── */
export function TrendChart({ data, dataKey, xKey = 'label', color, height = 200, comparison }: {
  data: Array<Record<string, any>>;
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
  comparison?: { data: Array<Record<string, any>>; dataKey: string; label?: string };
}) {
  if (!data?.length) return null;
  const c = color || COLORS.sky;
  const merged = comparison ? data.map((d, i) => ({ ...d, _prior: comparison.data[i]?.[comparison.dataKey] ?? null })) : data;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={merged} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={{ stroke: COLORS.border }} />
        <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
        <Line type="monotone" dataKey={dataKey} stroke={c} strokeWidth={2} dot={{ r: 3, fill: c }} activeDot={{ r: 5 }} name="Current" />
        {comparison && <Line type="monotone" dataKey="_prior" stroke={COLORS.muted} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name={comparison.label || 'Prior'} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Area Chart (filled) ── */
export function AreaTrendChart({ data, dataKey, xKey = 'label', color, height = 200 }: {
  data: Array<Record<string, any>>;
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
}) {
  if (!data?.length) return null;
  const c = color || COLORS.sky;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={{ stroke: COLORS.border }} />
        <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
        <Area type="monotone" dataKey={dataKey} stroke={c} fill={c} fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Bar Chart ── */
export function BarChartViz({ data, dataKey, xKey = 'label', color, height = 200, layout }: {
  data: Array<Record<string, any>>;
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
  layout?: 'vertical' | 'horizontal';
}) {
  if (!data?.length) return null;
  const c = color || COLORS.sky;
  if (layout === 'horizontal') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" style={CHART_STYLE}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
          <XAxis type="number" tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey={xKey} tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={false} width={100} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
          <Bar dataKey={dataKey} fill={c} radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={{ stroke: COLORS.border }} />
        <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
        <Bar dataKey={dataKey} fill={c} radius={[4, 4, 0, 0]} barSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Donut / Pie Chart ── */
const PIE_COLORS = [COLORS.sky, COLORS.orange, COLORS.green, COLORS.skyDark, COLORS.muted, '#8B5CF6', '#EC4899'];

export function DonutChart({ data, dataKey = 'value', nameKey = 'name', height = 200 }: {
  data: Array<Record<string, any>>;
  dataKey?: string;
  nameKey?: string;
  height?: number;
}) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart style={CHART_STYLE}>
        <Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
          {data.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ── Multi-metric Line Chart (for comparison views) ── */
export function MultiLineChart({ data, lines, xKey = 'label', height = 200 }: {
  data: Array<Record<string, any>>;
  lines: Array<{ dataKey: string; color: string; name: string; dashed?: boolean }>;
  xKey?: string;
  height?: number;
}) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} style={CHART_STYLE}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={{ stroke: COLORS.border }} />
        <YAxis tick={{ fontSize: 10, fill: COLORS.muted }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lines.map(l => (
          <Line key={l.dataKey} type="monotone" dataKey={l.dataKey} stroke={l.color} strokeWidth={l.dashed ? 1.5 : 2} strokeDasharray={l.dashed ? '4 4' : undefined} dot={!l.dashed} name={l.name} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
