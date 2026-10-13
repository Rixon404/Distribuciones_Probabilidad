(() => {
  const configs = {
    Uniforme: [{ label: 'Mínimo (a)', key: 'a', value: '1', type: 'int' }, { label: 'Máximo (b)', key: 'b', value: '6', type: 'int' }],
    Binomial: [{ label: 'Ensayos (n)', key: 'n', value: '10', type: 'int' }, { label: 'Probabilidad (p)', key: 'p', value: '0.50', type: 'float', min: 0, max: 1 }],
    Hipergeométrica: [{ label: 'Población (N)', key: 'N', value: '30', type: 'int' }, { label: 'Éxitos (K)', key: 'K', value: '12', type: 'int' }, { label: 'Muestra (n)', key: 'n', value: '8', type: 'int' }],
    Poisson: [{ label: 'Tasa (λ)', key: 'lam', value: '4.00', type: 'float', min: 0, max: 500 }],
    Normal: [{ label: 'Media (μ)', key: 'mu', value: '0', type: 'float' }, { label: 'Desviación estándar (σ)', key: 'sigma', value: '1', type: 'float', min: 0.0001 }]
  };
  const order = ['Uniforme', 'Binomial', 'Hipergeométrica', 'Poisson', 'Normal'];
  let current = 'Poisson';
  let graphMode = 'probability';
  let chart;
  let lastXs = [];
  let lastYs = [];
  let lastCdf = [];
  let selected = [];
  const grid = document.getElementById('parameter-grid');
  const queryInput = document.getElementById('query-input');
  const errorBox = document.getElementById('error-note');
  const output = document.getElementById('query-output');

  function buildFields() {
    const fields = configs[current];
    grid.className = `parameter-grid count-${fields.length}`;
    grid.innerHTML = fields.map(field => `<label class="field"><span>${field.label}</span><input data-key="${field.key}" type="number" step="${field.type === 'int' ? '1' : '0.01'}" min="${field.min ?? ''}" max="${field.max ?? ''}" value="${field.value}"></label>`).join('') + '<button class="update-button" type="submit"><span>↻</span> Actualizar</button>';
    grid.querySelectorAll('input').forEach(input => input.addEventListener('input', update));
    update();
  }

  function readParams() {
    const params = {};
    grid.querySelectorAll('input[data-key]').forEach(input => {
      const n = Number(input.value);
      if (input.value.trim() === '' || !Number.isFinite(n)) throw new Error('Completa los parámetros con números válidos.');
      if (input.step === '1' && !Number.isInteger(n)) throw new Error('Los parámetros de conteo deben ser números enteros.');
      params[input.dataset.key] = n;
    });
    if (current === 'Uniforme') {
      if (params.a > params.b || params.b - params.a > 5000) throw new Error('El máximo debe ser mayor o igual al mínimo y el rango no puede exceder 5,000.');
    } else if (current === 'Binomial') {
      if (params.n < 0 || params.n > 500 || params.p < 0 || params.p > 1) throw new Error('Usa n entre 0 y 500 y una probabilidad p entre 0 y 1.');
    } else if (current === 'Hipergeométrica') {
      if (params.N < 0 || params.N > 500 || params.K < 0 || params.K > params.N || params.n < 0 || params.n > params.N) throw new Error('Se requiere 0 ≤ K ≤ N, 0 ≤ n ≤ N y N ≤ 500.');
    } else if (current === 'Poisson') {
      if (params.lam < 0 || params.lam > 500) throw new Error('La tasa λ debe estar entre 0 y 500.');
    } else if (params.sigma <= 0 || params.sigma > 10000 || Math.abs(params.mu) > 100000) {
      throw new Error('σ debe ser mayor que 0 y los parámetros de la normal deben estar dentro del rango permitido.');
    }
    return params;
  }

  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    k = Math.min(k, n - k);
    let value = 0;
    for (let i = 1; i <= k; i++) value += Math.log(n - k + i) - Math.log(i);
    return value;
  }

  function calculate(p) {
    let xs, ys, mean, variance;
    if (current === 'Uniforme') {
      const { a, b } = p;
      xs = Array.from({ length: b - a + 1 }, (_, i) => a + i);
      ys = xs.map(() => 1 / xs.length);
      mean = (a + b) / 2;
      variance = ((b - a + 1) ** 2 - 1) / 12;
    } else if (current === 'Binomial') {
      const { n, p: prob } = p;
      xs = Array.from({ length: n + 1 }, (_, i) => i);
      ys = xs.map(x => prob === 0 ? Number(x === 0) : prob === 1 ? Number(x === n) : Math.exp(logChoose(n, x) + x * Math.log(prob) + (n - x) * Math.log1p(-prob)));
      mean = n * prob;
      variance = n * prob * (1 - prob);
    } else if (current === 'Hipergeométrica') {
      const { N, K, n } = p;
      const low = Math.max(0, n - (N - K));
      const high = Math.min(n, K);
      xs = Array.from({ length: high - low + 1 }, (_, i) => low + i);
      const denom = logChoose(N, n);
      ys = xs.map(x => Math.exp(logChoose(K, x) + logChoose(N - K, n - x) - denom));
      mean = N ? n * K / N : 0;
      variance = N > 1 ? n * K / N * (N - K) / N * (N - n) / (N - 1) : 0;
    } else if (current === 'Poisson') {
      const lam = p.lam;
      const limit = Math.max(12, Math.floor(lam + 6 * Math.sqrt(lam + 1)));
      xs = Array.from({ length: limit + 1 }, (_, i) => i);
      ys = [Math.exp(-lam)];
      for (let x = 1; x <= limit; x++) ys.push(ys[x - 1] * lam / x);
      mean = lam;
      variance = lam;
    } else {
      const { mu, sigma } = p;
      const low = mu - 4 * sigma, high = mu + 4 * sigma, count = 161;
      xs = Array.from({ length: count }, (_, i) => low + (high - low) * i / (count - 1));
      ys = xs.map(x => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)));
      mean = mu;
      variance = sigma ** 2;
    }
    const cdf = [];
    let cumulative = 0;
    for (let i = 0; i < ys.length; i++) {
      cumulative += ys[i];
      cdf.push(cumulative);
    }
    if (current === 'Normal') cdf.splice(0, cdf.length, ...xs.map(x => normalCdf((x - p.mu) / p.sigma)));
    return { xs, ys, cdf, mean, variance };
  }

  function normalCdf(z) {
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
  }

  function compare(left, op, right) {
    return op === '<' ? left < right : op === '<=' ? left <= right : op === '>' ? left > right : op === '>=' ? left >= right : left === right;
  }

  function parseCondition(condition) {
    const text = condition.replace(/\s+/g, '');
    let match = text.match(/^x(<=|>=|<|>|=)(-?\d+(?:\.\d+)?)$/i);
    if (match) {
      const [, op, raw] = match;
      const bound = Number(raw);
      if (op === '=') return { predicate: x => x === bound, equality: bound };
      if (op === '<' || op === '<=') return { predicate: x => compare(x, op, bound), high: bound, highInclusive: op === '<=' };
      return { predicate: x => compare(x, op, bound), low: bound, lowInclusive: op === '>=' };
    }
    match = text.match(/^(-?\d+(?:\.\d+)?)(<=|<)x(<|<=)(-?\d+(?:\.\d+)?)$/i);
    if (match) {
      const [, rawLow, leftOp, rightOp, rawHigh] = match;
      const low = Number(rawLow), high = Number(rawHigh);
      return { predicate: x => compare(low, leftOp, x) && compare(x, rightOp, high), low, high, lowInclusive: leftOp === '<=', highInclusive: rightOp === '<=' };
    }
    throw new Error('Formato no reconocido. Prueba x=3, x<2, x>=1 o 0<=x<3.');
  }

  function drawChart() {
    const ctx = document.getElementById('pmfChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(66,245,141,.22)');
    gradient.addColorStop(1, 'rgba(66,245,141,0)');
    const chosen = new Set(selected);
    const values = graphMode === 'cumulative' ? lastCdf : lastYs;
    const dataset = { data: values, borderColor: '#42f58d', backgroundColor: gradient, borderWidth: 2, tension: .22, fill: true,
      pointRadius: lastXs.map((_, i) => chosen.has(i) ? 5 : 3), pointHoverRadius: 6,
      pointBackgroundColor: lastXs.map((_, i) => chosen.has(i) ? '#f4c27a' : '#42f58d'),
      pointBorderColor: lastXs.map((_, i) => chosen.has(i) ? '#fff0cf' : '#b8ffd1'), pointBorderWidth: lastXs.map((_, i) => chosen.has(i) ? 2 : 1) };
    const options = { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#15251a', titleColor: '#e9f4eb', bodyColor: '#a9bdad', borderColor: '#34543c', borderWidth: 1, padding: 10, callbacks: { label: item => graphMode === 'cumulative' ? ` F(${item.label})  ${Number(item.raw).toFixed(6)}` : current === 'Normal' ? ` f(${Number(item.label).toFixed(3)})  ${Number(item.raw).toFixed(6)}` : ` P(X = ${item.label})  ${Number(item.raw).toFixed(6)}` } } },
      scales: { x: { title: { display: true, text: 'VALORES DE X', color: '#7e9284', font: { family: 'DM Sans', size: 9, weight: '600' }, padding: { top: 10 } }, ticks: { color: '#819487', maxTicksLimit: 13, font: { family: 'DM Sans', size: 9 } }, grid: { color: 'rgba(141, 179, 154, .12)' } },
        y: { beginAtZero: true, max: graphMode === 'cumulative' ? 1 : undefined, title: { display: true, text: graphMode === 'cumulative' ? 'PROBABILIDAD ACUMULADA' : current === 'Normal' ? 'DENSIDAD' : 'PROBABILIDAD', color: '#7e9284', font: { family: 'DM Sans', size: 9, weight: '600' }, padding: { bottom: 8 } }, ticks: { color: '#819487', maxTicksLimit: 5, font: { family: 'DM Sans', size: 9 } }, grid: { color: 'rgba(141, 179, 154, .12)' } } } };
    if (chart) { chart.data.labels = lastXs; chart.data.datasets = [dataset]; chart.update(); }
    else chart = new Chart(ctx, { type: 'line', data: { labels: lastXs, datasets: [dataset] }, options });
  }

  function showQuery() {
    const query = queryInput.value.trim();
    output.innerHTML = '';
    selected = [];
    if (!query) { drawChart(); return; }
    try {
      const condition = parseCondition(query);
      selected = lastXs.map((x, i) => condition.predicate(x) ? i : -1).filter(i => i !== -1);
      if (current === 'Normal' && condition.equality !== undefined && !selected.length) {
        selected = [lastXs.reduce((best, x, i) => Math.abs(x - condition.equality) < Math.abs(lastXs[best] - condition.equality) ? i : best, 0)];
      }
      let probability;
      if (current === 'Normal') {
        const mu = Number(grid.querySelector('[data-key="mu"]').value), sigma = Number(grid.querySelector('[data-key="sigma"]').value);
        const lower = condition.equality !== undefined ? condition.equality : condition.low;
        const upper = condition.equality !== undefined ? condition.equality : condition.high;
        probability = condition.equality !== undefined ? 0 : normalCdf((upper === undefined ? Infinity : upper - mu) / sigma) - normalCdf((lower === undefined ? -Infinity : lower - mu) / sigma);
      } else probability = selected.reduce((sum, i) => sum + lastYs[i], 0);
      const values = selected.slice(0, 24).map(i => lastXs[i]).join(', ');
      const suffix = selected.length > 24 ? ', …' : '';
      const valueCount = current === 'Normal' ? (condition.equality !== undefined ? 'punto exacto' : 'rango continuo') : `${selected.length} valor${selected.length === 1 ? '' : 'es'}`;
      output.innerHTML = `<div class="query-result"><div class="result-icon">Σ</div><div class="result-main"><span>PROBABILIDAD DE ${query.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</span><strong>${probability.toFixed(6)}</strong></div><div class="result-detail">${valueCount}${current === 'Normal' && condition.equality !== undefined ? '<small>En una variable continua, P(X = x) = 0</small>' : selected.length ? `<small>X ∈ { ${values}${suffix} }</small>` : ''}</div></div>`;
    } catch (error) {
      output.innerHTML = `<div class="empty-result error-note">${error.message}</div>`;
    }
    drawChart();
  }

  function update() {
    try {
      errorBox.hidden = true;
      const result = calculate(readParams());
      lastXs = result.xs; lastYs = result.ys; lastCdf = result.cdf;
      document.getElementById('stat-mean').textContent = result.mean.toFixed(4);
      document.getElementById('stat-variance').textContent = result.variance.toFixed(4);
      document.getElementById('stat-std').textContent = Math.sqrt(Math.max(result.variance, 0)).toFixed(4);
      document.getElementById('domain-count').textContent = current === 'Normal' ? `${lastXs.length} puntos de la curva` : `${lastXs.length} valores en el dominio`;
      showQuery();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  }

  function updateGraphLabels() {
    const cumulative = graphMode === 'cumulative';
    document.getElementById('chart-title').textContent = cumulative ? 'Función de distribución acumulada' : current === 'Normal' ? 'Función de densidad' : 'Función de probabilidad';
    document.getElementById('chart-description').textContent = cumulative ? 'Probabilidad acumulada hasta cada valor de X' : current === 'Normal' ? 'Densidad de probabilidad para cada valor de X' : 'Probabilidad para cada valor posible de X';
    document.getElementById('chart-caption-label').textContent = cumulative ? 'F(x) = P(X ≤ x)' : current === 'Normal' ? 'La curva muestra la densidad normal' : 'Cada punto representa un resultado posible';
  }

  document.querySelectorAll('[data-distribution]').forEach(button => button.addEventListener('click', () => {
    current = button.dataset.distribution;
    document.querySelectorAll('[data-distribution]').forEach(item => item.classList.toggle('active', item === button));
    const number = String(order.indexOf(current) + 1).padStart(2, '0');
    document.getElementById('dist-title').textContent = current;
    document.getElementById('footer-dist').textContent = current;
    document.getElementById('dist-number').textContent = number;
    document.getElementById('heading-symbol').textContent = number;
    buildFields();
    updateGraphLabels();
  }));
  document.getElementById('explore-form').addEventListener('submit', event => { event.preventDefault(); update(); });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    graphMode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
    updateGraphLabels();
    drawChart();
  }));
  queryInput.addEventListener('input', showQuery);
  document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => { queryInput.value = button.dataset.query; showQuery(); }));
  buildFields();
})();
