(() => {
  const configs = {
    Uniforme: [{ label: 'Mínimo (a)', key: 'a', value: '1', type: 'int' }, { label: 'Máximo (b)', key: 'b', value: '6', type: 'int' }],
    Binomial: [{ label: 'Ensayos (n)', key: 'n', value: '10', type: 'int' }, { label: 'Probabilidad (p)', key: 'p', value: '0.50', type: 'float', min: 0, max: 1 }],
    Hipergeométrica: [{ label: 'Población (N)', key: 'N', value: '30', type: 'int' }, { label: 'Éxitos (K)', key: 'K', value: '12', type: 'int' }, { label: 'Muestra (n)', key: 'n', value: '8', type: 'int' }],
    Poisson: [{ label: 'Tasa (λ)', key: 'lam', value: '4.00', type: 'float', min: 0, max: 500 }]
  };
  const order = ['Uniforme', 'Binomial', 'Hipergeométrica', 'Poisson'];
  let current = 'Poisson';
  let chart;
  let lastXs = [];
  let lastYs = [];
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
    } else if (params.lam < 0 || params.lam > 500) throw new Error('La tasa λ debe estar entre 0 y 500.');
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
    } else {
      const lam = p.lam;
      const limit = Math.max(12, Math.floor(lam + 6 * Math.sqrt(lam + 1)));
      xs = Array.from({ length: limit + 1 }, (_, i) => i);
      ys = [Math.exp(-lam)];
      for (let x = 1; x <= limit; x++) ys.push(ys[x - 1] * lam / x);
      mean = lam;
      variance = lam;
    }
    return { xs, ys, mean, variance };
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
      return x => compare(x, op, bound);
    }
    match = text.match(/^(-?\d+(?:\.\d+)?)(<=|<|>=|>)x(<=|<|>=|>)(-?\d+(?:\.\d+)?)$/i);
    if (match) {
      const [, rawLow, leftOp, rightOp, rawHigh] = match;
      const low = Number(rawLow), high = Number(rawHigh);
      return x => compare(low, leftOp, x) && compare(x, rightOp, high);
    }
    throw new Error('Formato no reconocido. Prueba x=3, x<2, x>=1 o 0<=x<3.');
  }

  function drawChart() {
    const ctx = document.getElementById('pmfChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(66,245,141,.22)');
    gradient.addColorStop(1, 'rgba(66,245,141,0)');
    const chosen = new Set(selected);
    const dataset = { data: lastYs, borderColor: '#42f58d', backgroundColor: gradient, borderWidth: 2, tension: .22, fill: true,
      pointRadius: lastXs.map((_, i) => chosen.has(i) ? 5 : 3), pointHoverRadius: 6,
      pointBackgroundColor: lastXs.map((_, i) => chosen.has(i) ? '#f4c27a' : '#42f58d'),
      pointBorderColor: lastXs.map((_, i) => chosen.has(i) ? '#fff0cf' : '#b8ffd1'), pointBorderWidth: lastXs.map((_, i) => chosen.has(i) ? 2 : 1) };
    const options = { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#15251a', titleColor: '#e9f4eb', bodyColor: '#a9bdad', borderColor: '#34543c', borderWidth: 1, padding: 10, callbacks: { label: item => ` P(X = ${item.label})  ${Number(item.raw).toFixed(6)}` } } },
      scales: { x: { title: { display: true, text: 'VALORES DE X', color: '#7e9284', font: { family: 'DM Sans', size: 9, weight: '600' }, padding: { top: 10 } }, ticks: { color: '#819487', maxTicksLimit: 13, font: { family: 'DM Sans', size: 9 } }, grid: { color: 'rgba(141, 179, 154, .12)' } },
        y: { beginAtZero: true, title: { display: true, text: 'PROBABILIDAD', color: '#7e9284', font: { family: 'DM Sans', size: 9, weight: '600' }, padding: { bottom: 8 } }, ticks: { color: '#819487', maxTicksLimit: 5, font: { family: 'DM Sans', size: 9 } }, grid: { color: 'rgba(141, 179, 154, .12)' } } } };
    if (chart) { chart.data.labels = lastXs; chart.data.datasets = [dataset]; chart.update(); }
    else chart = new Chart(ctx, { type: 'line', data: { labels: lastXs, datasets: [dataset] }, options });
  }

  function showQuery() {
    const query = queryInput.value.trim();
    output.innerHTML = '';
    selected = [];
    if (!query) { drawChart(); return; }
    try {
      const predicate = parseCondition(query);
      selected = lastXs.map((x, i) => predicate(x) ? i : -1).filter(i => i !== -1);
      const probability = selected.reduce((sum, i) => sum + lastYs[i], 0);
      const values = selected.slice(0, 24).map(i => lastXs[i]).join(', ');
      const suffix = selected.length > 24 ? ', …' : '';
      output.innerHTML = `<div class="query-result"><div class="result-icon">Σ</div><div class="result-main"><span>PROBABILIDAD DE ${query.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</span><strong>${probability.toFixed(6)}</strong></div><div class="result-detail">${selected.length} valor${selected.length === 1 ? '' : 'es'} incluido${selected.length === 1 ? '' : 's'}${selected.length ? `<small>X ∈ { ${values}${suffix} }</small>` : ''}</div></div>`;
    } catch (error) {
      output.innerHTML = `<div class="empty-result error-note">${error.message}</div>`;
    }
    drawChart();
  }

  function update() {
    try {
      errorBox.hidden = true;
      const result = calculate(readParams());
      lastXs = result.xs; lastYs = result.ys;
      document.getElementById('stat-mean').textContent = result.mean.toFixed(4);
      document.getElementById('stat-variance').textContent = result.variance.toFixed(4);
      document.getElementById('stat-std').textContent = Math.sqrt(Math.max(result.variance, 0)).toFixed(4);
      document.getElementById('domain-count').textContent = `${lastXs.length} valores en el dominio`;
      showQuery();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
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
  }));
  document.getElementById('explore-form').addEventListener('submit', event => { event.preventDefault(); update(); });
  queryInput.addEventListener('input', showQuery);
  document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => { queryInput.value = button.dataset.query; showQuery(); }));
  buildFields();
})();
