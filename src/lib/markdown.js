import { Marked } from 'marked';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// A chart fence is JSON in the Markdown source, rendered as native HTML.
// Every bar has a visible label/value; no client runtime or images required.
export function renderChart(source) {
  const chart = JSON.parse(source);
  if (chart.type === 'line') return renderLineChart(chart);
  if (chart.type === 'diverging') return renderDeltaChart(chart);
  if (!chart.title || !Array.isArray(chart.rows) || !chart.rows.length) {
    throw new Error('A chart needs a title and at least one row');
  }
  const rows = chart.rows.map((row) => {
    const value = row.value;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error('Chart values must be percentages between 0 and 100');
    }
    const tone = ['neutral', 'warning'].includes(row.tone) ? row.tone : 'neutral';
    return `<li class="chart-row"><div class="chart-label"><span>${escape(row.label)}</span><span class="chart-value">${escape(row.display ?? `${value}%`)}</span></div><div class="chart-track" aria-hidden="true"><span class="chart-bar chart-bar--${tone}" style="width:${value}%"></span></div>${row.detail ? `<span class="chart-detail">${escape(row.detail)}</span>` : ''}</li>`;
  }).join('');
  return `<figure class="native-chart"><figcaption>${escape(chart.title)}</figcaption><ol>${rows}</ol><div class="chart-axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>${chart.note ? `<p class="chart-note">${escape(chart.note)}</p>` : ''}</figure>`;
}

function dataTable(headers, rows) {
  return `<details class="chart-data"><summary>View exact values</summary><div class="chart-table-wrap"><table><thead><tr>${headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

function renderLineChart(chart) {
  const { labels, series } = chart;
  const max = chart.max ?? 100;
  if (!chart.title || !Array.isArray(labels) || labels.length < 2 || !Array.isArray(series) || !series.length || !Number.isFinite(max) || max <= 0) throw new Error('Invalid line chart');
  const colors = ['#9ab7be', '#c99470'];
  const x = i => 48 + i * 504 / (labels.length - 1);
  const y = v => 234 - v / max * 194;
  const grid = [0, max / 2, max].map(v => `<line x1="48" x2="552" y1="${y(v)}" y2="${y(v)}" class="plot-grid"/><text x="38" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const lines = series.map((s, index) => {
    if (!Array.isArray(s.values) || s.values.length !== labels.length || s.values.some(v => !Number.isFinite(v) || v < 0 || v > max)) throw new Error('Invalid line series');
    const color = colors[index % colors.length];
    return `<polyline points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" ${index % 2 ? 'stroke-dasharray="6 5"' : ''}/>${s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${color}" tabindex="0" role="img" aria-label="${escape(`${labels[i]}, ${s.label}: ${v.toFixed(1)}%`)}"><title>${escape(`${labels[i]} · ${s.label}: ${v.toFixed(1)}%`)}</title></circle>`).join('')}`;
  }).join('');
  const legend = series.map((s, i) => `<span><i style="--series-color:${colors[i % colors.length]}" class="${i % 2 ? 'is-dashed' : ''}"></i>${escape(s.label)}</span>`).join('');
  return `<figure class="native-chart native-chart--line"><figcaption>${escape(chart.title)}</figcaption><div class="chart-legend">${legend}</div><svg class="line-plot" viewBox="0 0 600 280" role="img" aria-label="${escape(chart.title)}"><title>${escape(chart.title)}</title>${grid}${lines}${labels.map((label, i) => `<text x="${x(i)}" y="258" text-anchor="middle">${escape(label)}</text>`).join('')}</svg>${chart.note ? `<p class="chart-note">${escape(chart.note)}</p>` : ''}${dataTable(['Form', ...series.map(s => s.label)], labels.map((l, i) => [l, ...series.map(s => `${s.values[i].toFixed(2)}%`)]))}</figure>`;
}

function renderDeltaChart(chart) {
  const max = chart.max ?? 100;
  if (!chart.title || !Array.isArray(chart.rows) || !chart.rows.length || !Number.isFinite(max) || max <= 0) throw new Error('Invalid change chart');
  const rows = chart.rows.map(row => {
    if (!Number.isFinite(row.value) || Math.abs(row.value) > max) throw new Error('Change outside chart scale');
    const negative = row.value < 0;
    const width = Math.abs(row.value) / max * 50;
    const display = `${row.value > 0 ? '+' : ''}${row.value.toFixed(1)} pp`;
    return `<li class="delta-row"><span>${escape(row.label)}</span><div class="delta-track" aria-hidden="true"><span class="delta-bar ${negative ? 'is-negative' : ''}" style="left:${negative ? 50 - width : 50}%;width:${width}%"></span></div><span class="delta-value ${negative ? 'is-negative' : ''}">${display}</span></li>`;
  }).join('');
  return `<figure class="native-chart"><figcaption>${escape(chart.title)}</figcaption><div class="delta-axis" aria-hidden="true"><span>−${max} pp</span><span>0</span><span>+${max} pp</span></div><ol class="delta-list">${rows}</ol>${chart.note ? `<p class="chart-note">${escape(chart.note)}</p>` : ''}${dataTable(['Form', 'Change in text F1'], chart.rows.map(r => [r.label, `${r.value > 0 ? '+' : ''}${r.value.toFixed(2)} pp`]))}</figure>`;
}

const markdown = new Marked({
  renderer: {
    code(token) {
      if (token.lang === 'chart') return renderChart(token.text);
      return false;
    },
  },
});

export const renderMarkdown = (source) => markdown.parse(source);
