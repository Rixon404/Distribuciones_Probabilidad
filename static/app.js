(() => {
  const configs = {
    Uniforme: [{ label: 'Mínimo (a)', key: 'a', value: '1', type: 'int' }, { label: 'Máximo (b)', key: 'b', value: '6', type: 'int' }],
    Binomial: [{ label: 'Ensayos (n)', key: 'n', value: '10', type: 'int' }, { label: 'Probabilidad (p)', key: 'p', value: '0.50', type: 'float', min: 0, max: 1 }],
    Hipergeométrica: [{ label: 'Población (N)', key: 'N', value: '30', type: 'int' }, { label: 'Éxitos (K)', key: 'K', value: '12', type: 'int' }, { label: 'Muestra (n)', key: 'n', value: '8', type: 'int' }],
    Geométrica: [
      { label: 'Probabilidad (p)', key: 'p', value: '0.30', type: 'float', min: 0.0001, max: 1 },
      { label: 'Variable X', key: 'mode', value: 'trials', type: 'select', options: [{ value: 'trials', label: 'Ensayos hasta 1.er éxito (x ≥ 1)' }, { value: 'failures', label: 'Fallas antes del 1.er éxito (x ≥ 0)' }] }
    ],
    'Binomial negativa': [
      { label: 'Éxitos (r)', key: 'r', value: '3', type: 'int', min: 1, max: 200 },
      { label: 'Probabilidad (p)', key: 'p', value: '0.40', type: 'float', min: 0.0001, max: 1 },
      { label: 'Variable X', key: 'mode', value: 'failures', type: 'select', options: [{ value: 'failures', label: 'Fallas antes de r éxitos (x ≥ 0)' }, { value: 'trials', label: 'Ensayos hasta r éxitos (x ≥ r)' }] }
    ],
    Poisson: [{ label: 'Tasa (λ)', key: 'lam', value: '4.00', type: 'float', min: 0, max: 500 }],
    Normal: [{ label: 'Media (μ)', key: 'mu', value: '0', type: 'float' }, { label: 'Desviación estándar (σ)', key: 'sigma', value: '1', type: 'float', min: 0.0001 }],
    Exponencial: [{ label: 'Tasa (λ)', key: 'lam', value: '1.00', type: 'float', min: 0.0001, max: 500 }]
  };
  const order = ['Uniforme', 'Binomial', 'Hipergeométrica', 'Geométrica', 'Binomial negativa', 'Poisson', 'Normal', 'Exponencial'];
  let current = 'Poisson';
  let graphMode = 'probability';
  let chart;
  let lastXs = [];
  let lastYs = [];
  let lastCdf = [];
  let lastParams = {};
  let selected = [];
  const grid = document.getElementById('parameter-grid');
  const queryInput = document.getElementById('query-input');
  const errorBox = document.getElementById('error-note');
  const output = document.getElementById('query-output');
  const formatXAxis = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return value;
    const rounded = Number(number.toFixed(4));
    return Object.is(rounded, -0) ? '0' : String(rounded);
  };

  function buildFields() {
    const fields = configs[current];
    grid.className = `parameter-grid count-${fields.length}`;
    grid.innerHTML = fields.map(field => {
      if (field.type === 'select') {
        const optionsHtml = field.options.map(opt => `<option value="${opt.value}"${opt.value === field.value ? ' selected' : ''}>${opt.label}</option>`).join('');
        return `<label class="field"><span>${field.label}</span><select data-key="${field.key}">${optionsHtml}</select></label>`;
      }
      return `<label class="field"><span>${field.label}</span><input data-key="${field.key}" type="number" step="${field.type === 'int' ? '1' : '0.01'}" min="${field.min ?? ''}" max="${field.max ?? ''}" value="${field.value}"></label>`;
    }).join('') + '<button class="update-button" type="submit"><span>↻</span> Actualizar</button>';
    grid.querySelectorAll('input').forEach(input => input.addEventListener('input', update));
    grid.querySelectorAll('select').forEach(select => select.addEventListener('change', update));
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
    grid.querySelectorAll('select[data-key]').forEach(select => {
      params[select.dataset.key] = select.value;
    });
    if (current === 'Uniforme') {
      if (params.a > params.b || params.b - params.a > 5000) throw new Error('El máximo debe ser mayor o igual al mínimo y el rango no puede exceder 5,000.');
    } else if (current === 'Binomial') {
      if (params.n < 0 || params.n > 500 || params.p < 0 || params.p > 1) throw new Error('Usa n entre 0 y 500 y una probabilidad p entre 0 y 1.');
    } else if (current === 'Hipergeométrica') {
      if (params.N < 0 || params.N > 500 || params.K < 0 || params.K > params.N || params.n < 0 || params.n > params.N) throw new Error('Se requiere 0 ≤ K ≤ N, 0 ≤ n ≤ N y N ≤ 500.');
    } else if (current === 'Geométrica') {
      if (params.p <= 0 || params.p > 1) throw new Error('La probabilidad p debe ser mayor que 0 y menor o igual a 1.');
    } else if (current === 'Binomial negativa') {
      if (params.r < 1 || params.r > 200 || params.p <= 0 || params.p > 1) throw new Error('Usa r entero entre 1 y 200 y una probabilidad p mayor que 0 y menor o igual a 1.');
    } else if (current === 'Poisson') {
      if (params.lam < 0 || params.lam > 500) throw new Error('La tasa λ debe estar entre 0 y 500.');
    } else if (current === 'Normal') {
      if (params.sigma <= 0 || params.sigma > 10000 || Math.abs(params.mu) > 100000) {
        throw new Error('σ debe ser mayor que 0 y los parámetros de la normal deben estar dentro del rango permitido.');
      }
    } else if (current === 'Exponencial') {
      if (params.lam <= 0 || params.lam > 500) throw new Error('La tasa λ debe ser mayor que 0 y no exceder 500.');
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

  const logFactCache = [0];
  function logFact(n) {
    if (n < 0) return Infinity;
    if (n <= 10000) {
      for (let i = logFactCache.length; i <= n; i++) {
        logFactCache[i] = logFactCache[i - 1] + Math.log(i);
      }
      return logFactCache[n];
    }
    return (n + 0.5) * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * n);
  }

  function geomPmf(x, p, mode) {
    if (!Number.isInteger(x)) return 0;
    const start = mode === 'trials' ? 1 : 0;
    if (x < start) return 0;
    const k = x - start;
    if (p === 1) return k === 0 ? 1 : 0;
    return Math.exp(k * Math.log1p(-p) + Math.log(p));
  }

  function geomCdf(t, p, mode) {
    const start = mode === 'trials' ? 1 : 0;
    if (t < start) return 0;
    if (p === 1) return 1;
    const m = Math.floor(t) - start + 1;
    return Math.min(1, Math.max(0, -Math.expm1(m * Math.log1p(-p))));
  }

  function geomTailAtLeast(minInt, p, mode) {
    const start = mode === 'trials' ? 1 : 0;
    if (minInt <= start) return 1;
    if (p === 1) return 0;
    const m = minInt - start;
    return Math.min(1, Math.max(0, Math.exp(m * Math.log1p(-p))));
  }

  function negBinPmf(x, r, p, mode) {
    if (!Number.isInteger(x)) return 0;
    const start = mode === 'trials' ? r : 0;
    if (x < start) return 0;
    const k = x - start;
    if (p === 1) return k === 0 ? 1 : 0;
    return Math.exp(logChoose(k + r - 1, r - 1) + r * Math.log(p) + k * Math.log1p(-p));
  }

  function negBinCdf(t, r, p, mode) {
    const start = mode === 'trials' ? r : 0;
    if (t < start) return 0;
    if (p === 1) return 1;
    const maxK = Math.floor(t) - start;
    const meanK = r * (1 - p) / p;
    const std = Math.sqrt(r * (1 - p)) / p;
    if (maxK > 200000 && maxK > meanK + 12 * std) return 1;
    if (maxK > 2000000) return maxK >= meanK ? 1 : 0;
    const logP = r * Math.log(p);
    const logQ = Math.log1p(-p);
    let logC = 0;
    let sum = 0;
    for (let k = 0; k <= maxK; k++) {
      sum += Math.exp(logC + logP + k * logQ);
      if (sum >= 1 - 1e-15) return 1;
      logC += Math.log(k + r) - Math.log(k + 1);
    }
    return Math.min(1, Math.max(0, sum));
  }

  function poissonPmf(x, lam) {
    if (!Number.isInteger(x) || x < 0) return 0;
    if (lam === 0) return x === 0 ? 1 : 0;
    return Math.exp(-lam + x * Math.log(lam) - logFact(x));
  }

  function poissonCdf(t, lam) {
    if (t < 0) return 0;
    if (lam === 0) return 1;
    const limit = Math.ceil(lam + 12 * Math.sqrt(lam + 1)) + 50;
    const maxK = Math.floor(t);
    if (maxK > limit) return 1;
    const logLam = Math.log(lam);
    let logF = 0;
    let sum = 0;
    for (let k = 0; k <= maxK; k++) {
      if (k > 0) logF += Math.log(k);
      sum += Math.exp(-lam + k * logLam - logF);
      if (sum >= 1 - 1e-15) return 1;
    }
    return Math.min(1, Math.max(0, sum));
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
    } else if (current === 'Geométrica') {
      const { p: prob, mode } = p;
      const start = mode === 'trials' ? 1 : 0;
      mean = mode === 'trials' ? 1 / prob : (1 - prob) / prob;
      variance = (1 - prob) / (prob ** 2);
      const maxK = prob === 1 ? 10 : Math.min(300, Math.max(12, Math.ceil(Math.log(0.001) / Math.log1p(-prob))));
      const end = mode === 'trials' ? (prob === 1 ? start + 10 : Math.max(12, maxK)) : maxK;
      xs = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      ys = xs.map(x => geomPmf(x, prob, mode));
    } else if (current === 'Binomial negativa') {
      const { r, p: prob, mode } = p;
      const start = mode === 'trials' ? r : 0;
      const meanK = r * (1 - prob) / prob;
      mean = mode === 'trials' ? r / prob : meanK;
      variance = r * (1 - prob) / (prob ** 2);
      const std = Math.sqrt(variance);
      let lowK, highK;
      if (prob === 1) {
        lowK = 0;
        highK = 10;
      } else {
        const rawHighK = Math.max(12, Math.ceil(meanK + 5.5 * std));
        if (rawHighK <= 300) {
          lowK = 0;
          highK = rawHighK;
        } else {
          lowK = Math.max(0, Math.floor(meanK - 4.5 * std));
          highK = Math.min(rawHighK, lowK + 300);
        }
      }
      xs = [];
      ys = [];
      const nbCdf = [];
      if (prob === 1) {
        for (let k = lowK; k <= highK; k++) {
          xs.push(start + k);
          ys.push(k === 0 ? 1 : 0);
          nbCdf.push(1);
        }
      } else {
        const logP = r * Math.log(prob);
        const logQ = Math.log1p(-prob);
        let logC = 0;
        let running = 0;
        for (let k = 0; k <= highK; k++) {
          const probK = Math.exp(logC + logP + k * logQ);
          running = Math.min(1, running + probK);
          if (k >= lowK) {
            xs.push(start + k);
            ys.push(probK);
            nbCdf.push(running);
          }
          logC += Math.log(k + r) - Math.log(k + 1);
        }
      }
      return { xs, ys, cdf: nbCdf, mean, variance };
    } else if (current === 'Poisson') {
      const lam = p.lam;
      const limit = Math.max(12, Math.floor(lam + 6 * Math.sqrt(lam + 1)));
      xs = Array.from({ length: limit + 1 }, (_, i) => i);
      ys = xs.map(x => poissonPmf(x, lam));
      mean = lam;
      variance = lam;
    } else if (current === 'Normal') {
      const { mu, sigma } = p;
      const low = mu - 4 * sigma, high = mu + 4 * sigma, count = 161;
      xs = Array.from({ length: count }, (_, i) => low + (high - low) * i / (count - 1));
      ys = xs.map(x => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)));
      mean = mu;
      variance = sigma ** 2;
    } else if (current === 'Exponencial') {
      const { lam } = p;
      const low = 0;
      const high = Math.min(Math.max(5 / lam, 5), 1000);
      const count = 161;
      xs = Array.from({ length: count }, (_, i) => low + (high - low) * i / (count - 1));
      ys = xs.map(x => lam * Math.exp(-lam * x));
      mean = 1 / lam;
      variance = 1 / (lam ** 2);
    }
    const cdf = [];
    let cumulative = 0;
    for (let i = 0; i < ys.length; i++) {
      cumulative = Math.min(1, cumulative + ys[i]);
      cdf.push(cumulative);
    }
    if (current === 'Geométrica') cdf.splice(0, cdf.length, ...xs.map(x => geomCdf(x, p.p, p.mode)));
    if (current === 'Normal') cdf.splice(0, cdf.length, ...xs.map(x => normalCdf((x - p.mu) / p.sigma)));
    if (current === 'Exponencial') cdf.splice(0, cdf.length, ...xs.map(x => x < 0 ? 0 : 1 - Math.exp(-p.lam * x)));
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
    const text = condition.replace(/\s+/g, '').replace(/≤/g, '<=').replace(/≥/g, '>=');
    let match = text.match(/^x(<=|>=|<|>|=)(-?\d+(?:\.\d+)?)$/i);
    if (match) {
      const [, op, raw] = match;
      const bound = Number(raw);
      if (op === '=') return { predicate: x => x === bound, equality: bound };
      if (op === '<' || op === '<=') return { predicate: x => compare(x, op, bound), high: bound, highInclusive: op === '<=' };
      return { predicate: x => compare(x, op, bound), low: bound, lowInclusive: op === '>=' };
    }
    match = text.match(/^(-?\d+(?:\.\d+)?)(<=|>=|<|>|=)x$/i);
    if (match) {
      const [, raw, op] = match;
      const bound = Number(raw);
      if (op === '=') return { predicate: x => x === bound, equality: bound };
      if (op === '<' || op === '<=') return { predicate: x => compare(bound, op, x), low: bound, lowInclusive: op === '<=' };
      return { predicate: x => compare(bound, op, x), high: bound, highInclusive: op === '>=' };
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
    const isContinuous = current === 'Normal' || current === 'Exponencial';
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
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#15251a', titleColor: '#e9f4eb', bodyColor: '#a9bdad', borderColor: '#34543c', borderWidth: 1, padding: 10, callbacks: { title: items => isContinuous ? formatXAxis(items[0].label) : items[0].label, label: item => graphMode === 'cumulative' ? ` F(${isContinuous ? formatXAxis(item.label) : item.label})  ${Number(item.raw).toFixed(6)}` : isContinuous ? ` f(${formatXAxis(item.label)})  ${Number(item.raw).toFixed(6)}` : ` P(X = ${item.label})  ${Number(item.raw).toFixed(6)}` } } },
      scales: { x: { title: { display: true, text: 'VALORES DE X', color: '#7e9284', font: { family: 'DM Sans', size: 9, weight: '600' }, padding: { top: 10 } }, ticks: { color: '#819487', maxTicksLimit: 13, font: { family: 'DM Sans', size: 9 }, callback: function(value) { const label = this.getLabelForValue(value); return isContinuous ? formatXAxis(label) : label; } }, grid: { color: 'rgba(141, 179, 154, .12)' } },
        y: { beginAtZero: true, max: graphMode === 'cumulative' ? 1 : undefined, title: { display: true, text: graphMode === 'cumulative' ? 'PROBABILIDAD ACUMULADA' : isContinuous ? 'DENSIDAD' : 'PROBABILIDAD', color: '#7e9284', font: { family: 'DM Sans', size: 9, weight: '600' }, padding: { bottom: 8 } }, ticks: { color: '#819487', maxTicksLimit: 5, font: { family: 'DM Sans', size: 9 } }, grid: { color: 'rgba(141, 179, 154, .12)' } } } };
    if (chart) { chart.data.labels = lastXs; chart.data.datasets = [dataset]; chart.update(); }
    else chart = new Chart(ctx, { type: 'line', data: { labels: lastXs, datasets: [dataset] }, options });
  }

  function showQuery() {
    const query = queryInput.value.trim();
    output.innerHTML = '';
    selected = [];
    if (!query) { drawChart(); return; }
    try {
      const isContinuous = current === 'Normal' || current === 'Exponencial';
      const isUnboundedDiscrete = current === 'Poisson' || current === 'Geométrica' || current === 'Binomial negativa';
      const condition = parseCondition(query);
      selected = lastXs.map((x, i) => condition.predicate(x) ? i : -1).filter(i => i !== -1);
      if (isContinuous && condition.equality !== undefined && !selected.length) {
        selected = [lastXs.reduce((best, x, i) => Math.abs(x - condition.equality) < Math.abs(lastXs[best] - condition.equality) ? i : best, 0)];
      }
      let probability;
      let valueCount;
      let values;
      let suffix;
      if (current === 'Normal') {
        const mu = lastParams.mu, sigma = lastParams.sigma;
        const lower = condition.equality !== undefined ? condition.equality : condition.low;
        const upper = condition.equality !== undefined ? condition.equality : condition.high;
        probability = condition.equality !== undefined ? 0 : normalCdf((upper === undefined ? Infinity : upper - mu) / sigma) - normalCdf((lower === undefined ? -Infinity : lower - mu) / sigma);
      } else if (current === 'Exponencial') {
        const lam = lastParams.lam;
        const lower = condition.equality !== undefined ? condition.equality : (condition.low ?? -Infinity);
        const upper = condition.equality !== undefined ? condition.equality : (condition.high ?? Infinity);
        const expCdf = val => {
          if (val === Infinity) return 1;
          if (val === -Infinity || val <= 0) return 0;
          return 1 - Math.exp(-lam * val);
        };
        probability = condition.equality !== undefined ? 0 : Math.max(0, expCdf(upper) - expCdf(lower));
      } else if (isUnboundedDiscrete) {
        const supportStart = current === 'Geométrica'
          ? (lastParams.mode === 'trials' ? 1 : 0)
          : current === 'Binomial negativa'
            ? (lastParams.mode === 'trials' ? lastParams.r : 0)
            : 0;
        const pmfAt = k => current === 'Poisson'
          ? poissonPmf(k, lastParams.lam)
          : current === 'Geométrica'
            ? geomPmf(k, lastParams.p, lastParams.mode)
            : negBinPmf(k, lastParams.r, lastParams.p, lastParams.mode);
        const cdfAt = t => current === 'Poisson'
          ? poissonCdf(t, lastParams.lam)
          : current === 'Geométrica'
            ? geomCdf(t, lastParams.p, lastParams.mode)
            : negBinCdf(t, lastParams.r, lastParams.p, lastParams.mode);

        if (condition.equality !== undefined) {
          probability = pmfAt(condition.equality);
          const count = Number.isInteger(condition.equality) && condition.equality >= supportStart ? 1 : 0;
          valueCount = `${count} valor${count === 1 ? '' : 'es'}`;
          values = count ? String(condition.equality) : '';
          suffix = '';
        } else if (condition.low === undefined && condition.high !== undefined) {
          const maxInt = condition.highInclusive ? Math.floor(condition.high) : Math.ceil(condition.high) - 1;
          probability = cdfAt(maxInt);
          const count = maxInt >= supportStart ? maxInt - supportStart + 1 : 0;
          valueCount = `${count} valor${count === 1 ? '' : 'es'}`;
          const shown = [];
          for (let k = supportStart; k <= Math.min(maxInt, supportStart + 23); k++) shown.push(k);
          values = shown.join(', ');
          suffix = count > 24 ? ', …' : '';
        } else if (condition.low !== undefined && condition.high === undefined) {
          const minInt = condition.lowInclusive ? Math.ceil(condition.low) : Math.floor(condition.low) + 1;
          if (current === 'Geométrica') {
            probability = geomTailAtLeast(minInt, lastParams.p, lastParams.mode);
          } else {
            probability = Math.max(0, 1 - cdfAt(minInt - 1));
          }
          const firstVal = Math.max(supportStart, minInt);
          valueCount = 'rango infinito';
          const shown = [];
          for (let k = firstVal; k < firstVal + 24; k++) shown.push(k);
          values = shown.join(', ');
          suffix = ', …';
        } else {
          const minInt = condition.lowInclusive ? Math.ceil(condition.low) : Math.floor(condition.low) + 1;
          const maxInt = condition.highInclusive ? Math.floor(condition.high) : Math.ceil(condition.high) - 1;
          if (minInt > maxInt) {
            probability = 0;
          } else if (maxInt - minInt <= 5000) {
            let sum = 0;
            for (let k = Math.max(supportStart, minInt); k <= maxInt; k++) sum += pmfAt(k);
            probability = sum;
          } else {
            probability = Math.max(0, cdfAt(maxInt) - cdfAt(minInt - 1));
          }
          const firstVal = Math.max(supportStart, minInt);
          const count = maxInt >= firstVal ? maxInt - firstVal + 1 : 0;
          valueCount = `${count} valor${count === 1 ? '' : 'es'}`;
          const shown = [];
          for (let k = firstVal; k <= Math.min(maxInt, firstVal + 23); k++) shown.push(k);
          values = shown.join(', ');
          suffix = count > 24 ? ', …' : '';
        }
        probability = Math.min(1, Math.max(0, probability));
      } else {
        probability = selected.reduce((sum, i) => sum + lastYs[i], 0);
      }
      if (!isUnboundedDiscrete) {
        values = selected.slice(0, 24).map(i => isContinuous ? formatXAxis(lastXs[i]) : lastXs[i]).join(', ');
        suffix = selected.length > 24 ? ', …' : '';
        valueCount = isContinuous ? (condition.equality !== undefined ? 'punto exacto' : 'rango continuo') : `${selected.length} valor${selected.length === 1 ? '' : 'es'}`;
      }
      output.innerHTML = `<div class="query-result"><div class="result-icon">Σ</div><div class="result-main"><span>PROBABILIDAD DE ${query.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</span><strong>${probability.toFixed(6)}</strong></div><div class="result-detail">${valueCount}${isContinuous && condition.equality !== undefined ? '<small>En una variable continua, P(X = x) = 0</small>' : values ? `<small>X ∈ { ${values}${suffix} }</small>` : ''}</div></div>`;
    } catch (error) {
      output.innerHTML = `<div class="empty-result error-note">${error.message}</div>`;
    }
    drawChart();
  }

  function update() {
    try {
      errorBox.hidden = true;
      const params = readParams();
      const result = calculate(params);
      lastParams = params;
      lastXs = result.xs; lastYs = result.ys; lastCdf = result.cdf;
      document.getElementById('stat-mean').textContent = result.mean.toFixed(4);
      document.getElementById('stat-variance').textContent = result.variance.toFixed(4);
      document.getElementById('stat-std').textContent = Math.sqrt(Math.max(result.variance, 0)).toFixed(4);
      const isContinuous = current === 'Normal' || current === 'Exponencial';
      document.getElementById('domain-count').textContent = isContinuous ? `${lastXs.length} puntos de la curva` : `${lastXs.length} valores en el dominio`;
      updateGraphLabels();
      showQuery();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  }

  function updateGraphLabels() {
    const cumulative = graphMode === 'cumulative';
    const isContinuous = current === 'Normal' || current === 'Exponencial';
    document.getElementById('chart-title').textContent = cumulative ? 'Función de distribución acumulada' : isContinuous ? 'Función de densidad' : 'Función de probabilidad';
    let description = cumulative ? 'Probabilidad acumulada hasta cada valor de X' : isContinuous ? 'Densidad de probabilidad para cada valor de X' : 'Probabilidad para cada valor posible de X';
    if (!cumulative && current === 'Geométrica') {
      description = lastParams.mode === 'failures'
        ? 'Fallas antes del primer éxito (X ≥ 0)'
        : 'Ensayos necesarios hasta el primer éxito (X ≥ 1)';
    } else if (!cumulative && current === 'Binomial negativa') {
      description = lastParams.mode === 'trials'
        ? `Ensayos necesarios hasta lograr ${lastParams.r ?? 3} éxitos (X ≥ r)`
        : `Fallas antes de lograr ${lastParams.r ?? 3} éxitos (X ≥ 0)`;
    }
    document.getElementById('chart-description').textContent = description;
    document.getElementById('chart-caption-label').textContent = cumulative ? 'F(x) = P(X ≤ x)' : current === 'Normal' ? 'La curva muestra la densidad normal' : current === 'Exponencial' ? 'La curva muestra la densidad exponencial' : 'Cada punto representa un resultado posible';
  }

  document.querySelectorAll('[data-distribution]').forEach(button => button.addEventListener('click', () => {
    current = button.dataset.distribution;
    document.querySelectorAll('[data-distribution]').forEach(item => item.classList.toggle('active', item === button));
    const number = String(order.indexOf(current) + 1).padStart(2, '0');
    document.getElementById('dist-title').textContent = current;
    document.getElementById('footer-dist').textContent = current;
    const footerKind = document.getElementById('footer-kind');
    if (footerKind) {
      footerKind.textContent = (current === 'Normal' || current === 'Exponencial') ? 'Modelo continuo' : 'Modelo discreto';
    }
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
