import { Marked } from 'marked';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// A chart fence is JSON in the Markdown source, rendered as native HTML.
// Every bar has a visible label/value; no client runtime or images required.
export function renderChart(source) {
  const chart = JSON.parse(source);
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

const markdown = new Marked({
  renderer: {
    code(token) {
      if (token.lang === 'chart') return renderChart(token.text);
      return false;
    },
  },
});

export const renderMarkdown = (source) => markdown.parse(source);
