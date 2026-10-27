/* AURORA performance workbench. Standalone, dependency-free chart module. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = { ohlins: '#713597', kw: '#BA70CF', dssv: '#B98A2C' };
  const NAMES = { ohlins: 'Öhlins DFV', kw: 'KW V3', dssv: 'DSSV' };
  const BASE = {
    ohlins: { slope: 11.1, knee: 1370, fade: .082, rms: .34, frequency: 10.6, decay: 4.9, wheel: 8.2, tune: 87 },
    kw: { slope: 9.2, knee: 1150, fade: .110, rms: .29, frequency: 9.1, decay: 4.2, wheel: 9.1, tune: 94 },
    dssv: { slope: 12.6, knee: 1520, fade: .052, rms: .41, frequency: 12.3, decay: 6.1, wheel: 6.7, tune: 72 }
  };
  const SCENARIOS = {
    street: { label: '日常通勤', en: 'STREET', rms: 1, response: 1, wheel: 1, force: 1 },
    track: { label: '赛道体验', en: 'TRACK', rms: 1.23, response: .86, wheel: .86, force: 1.17 },
    rough: { label: '颠簸路面', en: 'ROUGH ROAD', rms: 1.57, response: 1.12, wheel: 1.27, force: .93 }
  };
  const CURVES = {
    force: { label: '阻尼力—速度', en: 'FORCE / VELOCITY', x: '活塞速度 / mm·s⁻¹', y: '阻尼力 / N', xUnit: 'mm/s', yUnit: 'N', precision: 0, note: '默认比较 100 mm/s 参考点。该计算模型在零速度时阻尼力为 0 N，属于模型边界，并非数据缺失；力的大小本身不等于性能优劣。' },
    thermal: { label: '热稳定性', en: 'THERMAL RETENTION', x: '油温 / °C', y: '同速点阻尼保持率 / %', xUnit: '°C', yUnit: '%', precision: 1, note: '以 25°C 的同速点阻尼力为 100%，展示温度上升后的保持率。' },
    step: { label: '阶跃响应', en: 'STEP RESPONSE', x: '时间 / s', y: '归一化位移 / —', xUnit: 's', yUnit: '—', precision: 2, note: '归一化阶跃输入；响应回到 1±2% 后保持稳定，记为稳定时间。' },
    ride: { label: '路面响应', en: 'RIDE RESPONSE', x: '时间 / s', y: '车身加速度 / m·s⁻²', xUnit: 's', yUnit: 'm/s²', precision: 2, note: '相同输入频率下的模型车身加速度；RMS 越低表示该工况下振动越小。' }
  };
  const state = { scenario: 'street', temperature: 60, curve: 'force', visible: [], imported: {}, cursors: {}, pinned: {} };
  const playback = { enabled: null, reducedMotion: false, pointerHeld: false, focusHeld: false, keyboardMode: true, globalEnabled: true, elapsed: 0, duration: 8000, scanOffset: 0, resumeAt: 0, lastFrame: 0, lastReadout: 0, raf: 0, transitions: 0 };
  let playbackKey = '', playerElements = null;
  let productList = [], context = {}, root = null, aborter = null, resizeObserver = null, chartGeometries = {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fixed = (v, d = 1) => Number(v).toLocaleString('zh-CN', { maximumFractionDigits: d, minimumFractionDigits: d });
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const ico = name => {
    const paths = { down: 'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6', plus: 'M12 4v16M4 12h16', check: 'm5 12 4 4L20 5', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', reset: 'M3 10a9 9 0 1 1 2 8M3 3v7h7', arrow: 'M4 12h16m-6-6 6 6-6 6', upload: 'M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6', info: 'M12 11v6m0-10v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', pause: 'M8 5v14M16 5v14', play: 'm8 5 11 7-11 7V5Z' };
    return `<svg class="lv-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.arrow}"/></svg>`;
  };
  function notice(text) { if (context.toast) context.toast(text); }
  function selected() { return productList.filter(p => state.visible.includes(p.id)); }
  function sourceFor(curve) { return state.imported[curve] ? 'imported' : 'simulation'; }
  function condition() { return SCENARIOS[state.scenario]; }

  function modelPoints(id, type) {
    const b = BASE[id], c = condition(), hot = 1 - b.fade * (state.temperature - 25) / 100;
    if (type === 'force') return Array.from({ length: 81 }, (_, i) => {
      const x = (i - 40) * 7.5;
      return [x, (b.slope * x + b.knee * Math.tanh(x / 88)) * c.force * hot];
    });
    if (type === 'thermal') return Array.from({ length: 39 }, (_, i) => [25 + i * 2.5, 100 - b.fade * i * 2.5]);
    if (type === 'step') return Array.from({ length: 151 }, (_, i) => {
      const x = i * .02, decay = b.decay / c.response * hot;
      return [x, 1 - Math.exp(-decay * x) * (Math.cos(b.frequency * x) + .26 * Math.sin(b.frequency * x))];
    });
    const points = Array.from({ length: 201 }, (_, i) => {
      const x = i * .025;
      return [x, Math.sin(x * 8.5) * .65 + Math.sin(x * 19.5 + .4) * .23 + Math.sin(x * 4.2 - .3) * .18 + Math.exp(-((x - 2.4) ** 2) / .025) * .6];
    });
    const rms = Math.sqrt(points.reduce((n, p) => n + p[1] ** 2, 0) / points.length);
    const target = b.rms * c.rms * (1 + (1 - hot) * .4);
    return points.map(([x, y]) => [x, y / rms * target]);
  }

  function points(id, curve = state.curve) {
    if (state.imported[curve]) return state.imported[curve].series[id] || [];
    return modelPoints(id, curve);
  }

  function modelMetrics(id) {
    const b = BASE[id], c = condition(), step = modelPoints(id, 'step'), ride = modelPoints(id, 'ride');
    let lastOutside = 0;
    step.forEach((p, i) => { if (Math.abs(p[1] - 1) > .02) lastOutside = i; });
    return {
      thermal: 100 - b.fade * (state.temperature - 25),
      rms: Math.sqrt(ride.reduce((n, p) => n + p[1] ** 2, 0) / ride.length),
      settle: step[Math.min(lastOutside + 1, step.length - 1)][0] * 1000,
      wheel: b.wheel * c.wheel * (1 + (state.temperature - 25) * .0008),
      tune: b.tune
    };
  }

  function radarMetrics(id) {
    const m = modelMetrics(id);
    return [clamp(100 - (m.rms - .20) * 90, 0, 100), clamp(100 - (m.settle - 300) / 10, 0, 100), clamp(100 - (m.wheel - 5) * 4.4, 0, 100), m.thermal, m.tune];
  }

  function render(products, compareIds = []) {
    productList = products.filter(p => BASE[p.id]);
    const valid = compareIds.filter(id => productList.some(p => p.id === id));
    state.visible = valid.length ? valid : productList.map(p => p.id);
    const cards = productList.map((p, i) => `<article class="lv-product ${state.visible.includes(p.id) ? 'is-visible' : 'is-muted'}" data-lv-product="${p.id}" style="--series:${COLORS[p.id]}"><button class="lv-product-toggle" data-lv="toggle" data-id="${p.id}" aria-pressed="${state.visible.includes(p.id)}" aria-label="切换 ${esc(p.brand)} 对比可见性"><span class="lv-product-photo"><img src="${esc(p.image)}" alt="${esc(p.name)}"></span><span class="lv-product-copy"><small>方案 ${'ABC'[i]} · ${esc(p.brand)}</small><strong>${esc(p.name)}</strong><span>${esc(p.fit)}</span><b><i></i><span class="lv-product-status">${state.visible.includes(p.id) ? '已加入图表' : '已隐藏'}</span></b></span><span class="lv-check">${ico('check')}</span></button><div class="lv-product-bottom"><span>参考预算 <b>¥${Number(p.price).toLocaleString('zh-CN')}</b></span><button data-lv="add" data-id="${p.id}" aria-label="将 ${esc(p.name)} 加入清单">${ico('plus')} 加入清单</button></div></article>`).join('');
    return `<div id="performance-lab-v2" class="lv-workbench">
      <header class="lv-page-heading"><div><span class="lv-kicker">PERFORMANCE LAB</span><h1>让性能差异，一眼可见。</h1><p>从单一规格到动态表现，找到更适合你的性能方案。</p></div><div class="lv-heading-actions"><span class="lv-source-badge">模型计算 <small>SIMULATION</small></span><button class="lv-btn lv-outline" data-lv="export-report">${ico('down')} 导出对比报告</button></div></header>
      <div class="lv-product-strip">${cards}</div>
      <section class="lv-controls" aria-label="模型工况设置"><div class="lv-control-group"><span class="lv-label">使用场景<small>DRIVING SCENARIO</small></span><div class="lv-segmented">${Object.entries(SCENARIOS).map(([key,c]) => `<button data-lv="scenario" data-value="${key}" class="${state.scenario===key?'active':''}" aria-pressed="${state.scenario===key}">${c.label}</button>`).join('')}</div></div><label class="lv-temperature"><span class="lv-label">工作温度<small>OPERATING TEMPERATURE</small></span><input id="lv-temperature" type="range" min="25" max="120" step="5" value="${state.temperature}" aria-label="模型工作温度"><output id="lv-temperature-value">${state.temperature}°C</output></label><button class="lv-reset" data-lv="reset">${ico('reset')} 重置</button></section>
      <p class="lv-source-summary" id="lv-source-summary"></p>
      <div class="lv-overview-grid"><section class="lv-card lv-bars-card"><div class="lv-card-heading"><div><span class="lv-kicker">KEY METRICS</span><h2>四项关键指标</h2></div><span class="lv-card-tag">模型计算</span></div><div id="lv-bars"></div><p class="lv-chart-note">每组独立刻度；单位与方向标在指标旁，避免把量纲不同的数值直接相加。</p></section><section class="lv-card lv-radar-card"><div class="lv-card-heading"><div><span class="lv-kicker">PERFORMANCE PROFILE</span><h2>五维性能轮廓</h2></div><span class="lv-card-tag">模型指数</span></div><div id="lv-radar"></div><p class="lv-chart-note">0–100 归一化模型指数 · 展示取向，不计算综合排名。</p></section></div>
      <section class="lv-curve-player"><div class="lv-expanded-heading"><div><span class="lv-kicker">PERFORMANCE IN MOTION</span><h2>性能，在每一次响应中展开。</h2><p>持续回放四种响应，移入图中即可停下来细看。</p></div><div id="lv-legend" class="lv-legend"></div></div><div class="lv-player-shell"><div class="lv-player-toolbar"><div class="lv-play-indicator"><i></i><span id="lv-play-status">自动巡览</span><small>SEQUENCE PLAYBACK</small></div><span class="lv-play-counter"><b id="lv-play-countdown">8.0</b> s <small>后切换</small></span><button class="lv-btn lv-outline" data-lv="playback" id="lv-play-toggle" aria-pressed="true">${ico('pause')} 暂停播放</button></div><div class="lv-autotabs" role="tablist" aria-label="性能曲线">${Object.entries(CURVES).map(([key,c])=>`<button class="lv-autotab ${key===state.curve?'active':''}" id="lv-tab-${key}" role="tab" data-lv="curve" data-curve="${key}" aria-controls="lv-panel-${key}" aria-selected="${key===state.curve}" tabindex="${key===state.curve?'0':'-1'}"><strong>${c.label}</strong><small>${c.en}</small><span class="lv-tab-progress"></span></button>`).join('')}</div><div class="lv-player-progress" id="lv-play-progress" role="progressbar" aria-label="当前曲线播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><div class="lv-curve-stage">${curveCardsHTML()}</div></div><div class="lv-data-toolbar"><div><strong>接入你的测试曲线</strong><p>CSV 使用 curve, product, x, y 四列。导入后按原始数据回放，模型设置不改写文件数值。</p></div><label class="lv-btn lv-primary lv-upload">${ico('upload')} 导入 CSV<input id="lv-csv-file" type="file" accept=".csv,text/csv" aria-label="导入性能曲线 CSV"></label></div><div id="lv-import-status" class="lv-import-status" aria-live="polite"></div></section>
      <details class="lv-method"><summary>计算来源与归一化方法 <span>DATA NOTES</span></summary><div><p>当前性能数值来自预设参数模型计算，并非品牌实测；应用车型不同，不构成真实性能排名。预算为项目参考方案。场景和温度控件只调整计算模型，导入曲线保持原值；柱状图与雷达图不从导入曲线推断其他指标。</p><p>舒适指数 = 100 − (加速度 RMS − 0.20) × 90；响应指数 = 100 − (稳定时间 ms − 300) ÷ 10；轮荷稳定指数 = 100 − (轮荷 CV − 5) × 4.4；热稳定指数 = 当前温度下阻尼保持率；调校指数为模型预设。各项限制在 0–100，不计算总分。</p><p>CSV 列为 curve, product, x, y；curve 可取 force / thermal / step / ride，product 可取 ohlins / kw / dssv。导入数据仅在当前浏览器处理，不进行真实性或工况认证。</p></div></details>
      <details class="lv-specifications" open><summary><span>公开规格与适配<small>SPECIFICATIONS & FITMENT</small></span><b>点击展开 / 收起</b></summary><div class="lv-spec-table"><table><thead><tr><th>比较维度</th>${productList.map(p=>`<th>${esc(p.brand)}<small>${esc(p.name)}</small></th>`).join('')}</tr></thead><tbody>${[['应用车型',p=>p.fit],['型号 / 配置',p=>p.model],['结构',p=>p.structure],['调节方式',p=>p.adjust],['参考预算',p=>'¥'+Number(p.price).toLocaleString('zh-CN')]].map(([label,fn])=>`<tr><td>${label}</td>${productList.map(p=>`<td>${esc(fn(p))}</td>`).join('')}</tr>`).join('')}<tr><td>规格来源</td>${productList.map(p=>`<td><a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">官方产品资料 ↗</a></td>`).join('')}</tr></tbody></table></div></details>
    </div>`;
  }

  function barsHTML() {
    const rows = [
      { key: 'thermal', title: '阻尼保持率', en: 'THERMAL RETENTION', unit: '%', direction: '越高越稳定', max: 100, dp: 1 },
      { key: 'rms', title: '车身加速度', en: 'ACCELERATION RMS', unit: 'm/s²', direction: '越低越舒适', max: .8, dp: 2 },
      { key: 'settle', title: '阶跃稳定时间', en: 'SETTLING TIME', unit: 'ms', direction: '越低响应越快', max: 1400, dp: 0 },
      { key: 'wheel', title: '轮荷波动', en: 'WHEEL-LOAD CV', unit: '%', direction: '越低越稳定', max: 14, dp: 1 }
    ];
    return `<div class="lv-metric-grid">${rows.map(m=>`<div class="lv-metric"><div class="lv-metric-title"><strong>${m.title}<small>${m.en}</small></strong><span>${m.direction}<b>${m.unit}</b></span></div><div class="lv-bar-series">${productList.map(p=>{const val=modelMetrics(p.id)[m.key], visible=state.visible.includes(p.id);return `<div class="lv-bar-row ${visible?'':'is-off'}" style="--series:${COLORS[p.id]}"><span>${NAMES[p.id]}</span><div class="lv-bar-track"><div class="lv-bar-fill" style="width:${clamp(val/m.max*100,0,100).toFixed(2)}%"></div></div><b>${fixed(val,m.dp)}</b></div>`}).join('')}</div><div class="lv-bar-scale"><span>0</span><span>${m.max} ${m.unit}</span></div></div>`).join('')}</div>`;
  }

  function radarHTML() {
    const labels=[['舒适性','COMFORT'],['响应速度','RESPONSE'],['轮荷稳定','ROAD HOLDING'],['热稳定性','THERMAL'],['调校便利','ADJUSTABILITY']];
    const cx=220,cy=183,r=122, xy=(i,radius)=>[cx+Math.sin(i*Math.PI*2/5)*radius,cy-Math.cos(i*Math.PI*2/5)*radius];
    let svg=`<polygon points="${labels.map((_,i)=>xy(i,r).join(',')).join(' ')}" fill="#FCF9FE"/>`;
    [20,40,60,80,100].forEach(v=>{svg+=`<polygon points="${labels.map((_,i)=>xy(i,r*v/100).join(',')).join(' ')}" fill="none" stroke="#E9DEEF" stroke-width="1"/>`;});
    labels.forEach((l,i)=>{const [x,y]=xy(i,r),[tx,ty]=xy(i,r+32),anchor=i===0?'middle':i<3?'start':'end';svg+=`<path d="M${cx} ${cy}L${x} ${y}" stroke="#E9DEEF"/><text x="${tx}" y="${ty-4}" text-anchor="${anchor}" class="lv-radar-label">${l[0]}</text><text x="${tx}" y="${ty+12}" text-anchor="${anchor}" class="lv-radar-en">${l[1]}</text>`});
    productList.forEach(product=>{const metrics=radarMetrics(product.id),pts=metrics.map((v,i)=>xy(i,r*v/100));svg+=`<g class="lv-series ${state.visible.includes(product.id)?'':'is-off'}" data-series="${product.id}" style="--series:${COLORS[product.id]}"><polygon class="lv-radar-shape" points="${pts.map(p=>p.join(',')).join(' ')}" fill="${COLORS[product.id]}" fill-opacity=".09" stroke="${COLORS[product.id]}" stroke-width="2.4"/>${pts.map((point,i)=>`<circle cx="${point[0]}" cy="${point[1]}" r="3" fill="${COLORS[product.id]}"><title>${NAMES[product.id]} ${labels[i][0]} ${fixed(metrics[i],0)}</title></circle>`).join('')}</g>`});
    let output=`<svg class="lv-radar-svg" viewBox="0 0 440 350" role="img" aria-label="五维性能雷达图：舒适性、响应速度、轮荷稳定、热稳定性和调校便利">${svg}</svg>`;
    return output;
  }

  function curveCardsHTML() {
    return Object.entries(CURVES).map(([key,c],index)=>`<article class="lv-card lv-curve-card" id="lv-panel-${key}" role="tabpanel" aria-labelledby="lv-tab-${key}" data-lv-curve-card="${key}" ${key!==state.curve?'hidden':''}><header class="lv-curve-card-heading"><div><span class="lv-kicker">0${index+1} / ${c.en}</span><h3>${c.label}</h3></div><span class="lv-curve-source" id="lv-curve-source-${key}"></span></header><p class="lv-curve-condition" id="lv-condition-${key}"></p><div class="lv-live-chart-layout"><div class="lv-plot-area" data-lv-plot="${key}"><div id="lv-chart-${key}"></div><div class="lv-tooltip" id="lv-tooltip-${key}" hidden></div></div><aside class="lv-live-readout"><div class="lv-readout-heading"><span class="lv-kicker">LIVE TELEMETRY</span><h4>即时响应</h4></div><div class="lv-reference-row"><span id="lv-cursor-label-${key}"></span><button data-lv="reference" data-curve="${key}">参考点</button></div><div class="lv-card-readouts" id="lv-cursor-values-${key}"></div></aside></div><p class="lv-chart-note" id="lv-curve-note-${key}">${c.note}</p><div class="lv-curve-import-note" id="lv-import-${key}"></div><footer class="lv-curve-card-footer"><span class="lv-live-footnote">${ico('info')} 光标与高亮轨迹沿已有数据推进</span><button class="lv-btn lv-subtle" data-lv="template" data-curve="${key}">下载曲线模板</button><button class="lv-btn lv-outline" data-lv="export-data" data-curve="${key}">${ico('down')} 导出本图数据</button></footer></article>`).join('');
  }

  function lineChartHTML(curve) {
    const conf=CURVES[curve],datasets=selected().map(p=>({id:p.id,points:points(p.id,curve)})).filter(d=>d.points.length),all=datasets.flatMap(d=>d.points);
    if(!all.length){delete chartGeometries[curve];return '<div class="lv-no-data">所选方案没有本图的数据。<br>显示其他方案，或恢复本图模型计算数据。</div>'}
    const plot=root?.querySelector(`[data-lv-plot="${curve}"]`),plotWidth=plot?.clientWidth||960,compact=plotWidth<480;
    const w=compact?430:plotWidth<700?720:960,h=compact?320:390,l=compact?55:70,r=compact?13:22,t=31,b=51;
    let xmin=Math.min(...all.map(p=>p[0])),xmax=Math.max(...all.map(p=>p[0])),ymin=Math.min(...all.map(p=>p[1])),ymax=Math.max(...all.map(p=>p[1]));
    if(sourceFor(curve)==='simulation'){
      if(curve==='thermal'){ymin=85;ymax=102}
      if(curve==='step'){ymin=-.05;ymax=1.4}
      if(curve==='force'){const bound=Math.ceil(Math.max(Math.abs(ymin),Math.abs(ymax))/1000)*1000;ymin=-bound;ymax=bound}
      if(curve==='ride'){const bound=Math.ceil(Math.max(Math.abs(ymin),Math.abs(ymax))*2)/2;ymin=-bound;ymax=bound}
    }else{const pad=(ymax-ymin)*.12||1;ymin-=pad;ymax+=pad}
    if(xmin===xmax){xmin-=1;xmax+=1}
    if(ymin===ymax){ymin-=1;ymax+=1}
    const X=x=>l+(x-xmin)/(xmax-xmin)*(w-l-r),Y=y=>h-b-(y-ymin)/(ymax-ymin)*(h-t-b);
    chartGeometries[curve]={w,h,l,r,t,b,xmin,xmax,ymin,ymax,X,Y,datasets};
    let svg=`<defs><clipPath id="lv-plot-clip-${curve}"><rect x="${l}" y="${t}" width="${w-l-r}" height="${h-t-b}"/></clipPath><clipPath id="lv-replay-clip-${curve}"><rect id="lv-replay-window-${curve}" x="${l}" y="${t}" width="${w-l-r}" height="${h-t-b}"/></clipPath><linearGradient id="lv-scan-gradient-${curve}" x1="0" x2="1"><stop offset="0" stop-color="#B78FD1" stop-opacity="0"/><stop offset=".8" stop-color="#A575C5" stop-opacity=".16"/><stop offset="1" stop-color="#7B3A9B" stop-opacity=".27"/></linearGradient></defs>`;
    for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4;svg+=`<path d="M${l} ${Y(y)}H${w-r}" class="lv-grid-line"/><text x="${l-11}" y="${Y(y)+5}" text-anchor="end" class="lv-axis-number">${fixed(y,Math.abs(y)>=100?0:curve==='thermal'?0:1)}</text>`}
    const xTicks=compact?4:6;
    for(let i=0;i<=xTicks;i++){const x=xmin+(xmax-xmin)*i/xTicks;svg+=`<path d="M${X(x)} ${t}V${h-b}" class="lv-grid-line lv-grid-vertical"/><text x="${X(x)}" y="${h-b+23}" text-anchor="middle" class="lv-axis-number">${fixed(x,Math.abs(x)>=10?0:1)}</text>`}
    if(ymin<=0&&ymax>=0)svg+=`<path d="M${l} ${Y(0)}H${w-r}" stroke="#CCBCD8" stroke-width="1.2"/>`;
    if(curve==='step')svg+=`<path d="M${l} ${Y(1)}H${w-r}" stroke="#BAA1CC" stroke-dasharray="4 4" stroke-width="1.2"/>`;
    svg+=`<text x="${l}" y="16" class="lv-axis-title">${conf.y}</text><text x="${w-r}" y="${h-2}" text-anchor="end" class="lv-axis-title">${conf.x}</text>`;
    datasets.forEach(d=>{
      const path=d.points.map((p,i)=>`${i?'L':'M'}${X(p[0]).toFixed(2)} ${Y(p[1]).toFixed(2)}`).join(' ');
      svg+=`<g class="lv-plot-series" data-series="${d.id}" clip-path="url(#lv-plot-clip-${curve})"><path class="lv-curve-base" d="${path}" fill="none" stroke="${COLORS[d.id]}" stroke-opacity=".22" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/><g clip-path="url(#lv-replay-clip-${curve})"><path class="lv-curve-line" d="${path}" fill="none" stroke="${COLORS[d.id]}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/></g></g>`;
    });
    svg+=`<g clip-path="url(#lv-plot-clip-${curve})" pointer-events="none"><rect id="lv-scan-beam-${curve}" class="lv-scan-beam" x="${l}" y="${t}" width="100" height="${h-t-b}" fill="url(#lv-scan-gradient-${curve})"/></g>`;
    svg+=`<g id="lv-crosshair-${curve}" opacity="0"><path id="lv-crosshair-line-${curve}" d="M${l} ${t}V${h-b}" stroke="#8C659D" stroke-width="1.2" stroke-dasharray="3 4"/>${productList.map(p=>`<circle id="lv-cursor-${curve}-${p.id}" r="4.5" fill="${COLORS[p.id]}" stroke="white" stroke-width="2"/>`).join('')}</g><rect x="${l}" y="${t}" width="${w-l-r}" height="${h-t-b}" fill="transparent" class="lv-pointer-target" data-curve="${curve}" tabindex="0" role="slider" aria-label="${conf.label}读数位置，可使用左右箭头移动" aria-valuemin="${xmin}" aria-valuemax="${xmax}" aria-valuenow="${xmin}"/>`;
    return `<svg class="lv-line-svg" data-curve="${curve}" viewBox="0 0 ${w} ${h}" aria-label="${conf.label}对比曲线" role="group">${svg}</svg>`;
  }

  function legendHTML(){return productList.map(p=>`<button data-lv="toggle" data-id="${p.id}" class="${state.visible.includes(p.id)?'active':''}" aria-pressed="${state.visible.includes(p.id)}" style="--series:${COLORS[p.id]}"><i></i>${NAMES[p.id]}<span>${state.visible.includes(p.id)?'显示':'隐藏'}</span></button>`).join('')}

  // Same x for every series; never clamp an unavailable sample to an endpoint.
  function interpolate(series,x){
    if(!series?.length||!Number.isFinite(x)||x<series[0][0]||x>series[series.length-1][0])return null;
    let low=0,high=series.length-1;
    while(low<=high){const mid=(low+high)>>1;if(series[mid][0]===x)return series[mid][1];if(series[mid][0]<x)low=mid+1;else high=mid-1}
    if(high<0||low>=series.length)return null;
    const [x0,y0]=series[high],[x1,y1]=series[low];
    return y0+(y1-y0)*(x-x0)/(x1-x0);
  }

  function defaultReference(curve){
    const desired={force:100,thermal:state.temperature,step:.5,ride:1}[curve],g=chartGeometries[curve];
    if(!g||sourceFor(curve)==='simulation'||(desired>=g.xmin&&desired<=g.xmax))return desired;
    const low=Math.max(...g.datasets.map(d=>d.points[0][0])),high=Math.min(...g.datasets.map(d=>d.points[d.points.length-1][0]));
    return low<=high?(low+high)/2:(g.xmin+g.xmax)/2;
  }

  function readings(curve,x){return selected().map(p=>{const series=points(p.id,curve),value=interpolate(series,x);return {id:p.id,x,value,status:!series.length?'missing':value===null?'out_of_range':'available'}})}

  function updateCursor(curve,x,remember=false,mode='manual'){
    if(!root?.isConnected)return;
    const conf=CURVES[curve],g=chartGeometries[curve],values=readings(curve,x);
    state.cursors[curve]=x;if(remember){state.pinned[curve]=true;playback.resumeAt=performance.now()+1100;syncScanOffset(curve,x)}
    root.querySelector('#lv-cursor-label-'+curve).innerHTML=`<span>${mode==='playback'?'连续回放':state.pinned[curve]?'同位置读数':'参考点读数'}</span><strong>${conf.x.split(' / ')[0]} ${fixed(x,Math.abs(x)>=10?1:2)} <small>${conf.xUnit}</small></strong>`;
    root.querySelector('#lv-cursor-values-'+curve).innerHTML=values.map(v=>`<div class="lv-cursor-row ${v.value===null?'is-unavailable':''}" data-readout-product="${v.id}" data-x="${x}" data-value="${v.value===null?'':v.value}" data-status="${v.status}" style="--series:${COLORS[v.id]}"><span><i></i>${NAMES[v.id]}</span><b>${v.value===null?'—':fixed(v.value,conf.precision)}${v.value===null?'':`<small>${conf.yUnit}</small>`}</b>${v.value===null?`<em>${v.status==='missing'?'本图未提供':'超出该曲线范围'}</em>`:''}</div>`).join('');
    if(g){
      const inDomain=x>=g.xmin&&x<=g.xmax,cross=root.querySelector('#lv-crosshair-'+curve);cross.setAttribute('opacity',inDomain?'1':'0');
      root.querySelector('#lv-crosshair-line-'+curve).setAttribute('d',`M${g.X(x)} ${g.t}V${g.h-g.b}`);
      productList.forEach(p=>{const value=values.find(v=>v.id===p.id)?.value,dot=root.querySelector(`#lv-cursor-${curve}-${p.id}`);dot.setAttribute('visibility',value===null||value===undefined?'hidden':'visible');if(value!==null&&value!==undefined){dot.setAttribute('cx',g.X(x));dot.setAttribute('cy',g.Y(value))}});
      const target=root.querySelector(`.lv-pointer-target[data-curve="${curve}"]`);target.setAttribute('aria-valuenow',x);target.setAttribute('aria-valuetext',`${fixed(x,2)} ${conf.xUnit}`);
    }
    return values;
  }

  function updateCurveContent(curve,renderChart=false){
    if(!root?.isConnected)return;
    const imported=state.imported[curve];
    root.querySelector('#lv-curve-source-'+curve).innerHTML=imported?'<i></i>文件数据':'<i></i>模型计算';
    root.querySelector('#lv-curve-note-'+curve).textContent=imported?'按共同横坐标线性插值；超出曲线范围显示 —，原始零值如实保留。':CURVES[curve].note;
    root.querySelector('#lv-condition-'+curve).textContent=imported?'原始数据回放 · 工况以文件记录为准':curve==='thermal'?`${condition().label} · 温度扫描 25–120°C · 参考温度 ${state.temperature}°C`:`${condition().label} · 工作温度 ${state.temperature}°C · 相同输入条件`;
    root.querySelector('#lv-import-'+curve).innerHTML=imported?`<span>${esc(imported.filename)} · ${Object.values(imported.series).reduce((n,a)=>n+a.length,0)} 个点</span><button data-lv="clear-import" data-curve="${curve}">恢复模型</button>`:'';
    if(renderChart)root.querySelector('#lv-chart-'+curve).innerHTML=lineChartHTML(curve);
    root.querySelector('#lv-tooltip-'+curve).hidden=true;
    const g=chartGeometries[curve];let x=state.pinned[curve]&&Number.isFinite(state.cursors[curve])?state.cursors[curve]:defaultReference(curve);
    if(g&&state.pinned[curve])x=clamp(x,g.xmin,g.xmax);
    updateCursor(curve,x);
    if(renderChart){syncScanOffset(curve,x);updateReplayVisuals(curve,x)}
  }

  function draw(animate=true){
    if(!root?.isConnected)return;
    root.classList.toggle('lv-no-animation',!animate);
    root.querySelector('#lv-bars').innerHTML=barsHTML();
    root.querySelector('#lv-radar').innerHTML=radarHTML();
    root.querySelector('#lv-legend').innerHTML=legendHTML();
    root.querySelector('#lv-source-summary').textContent=Object.keys(state.imported).length?'已接入文件数据；指标与雷达使用计算模型。':'';
    root.querySelector('#lv-temperature-value').textContent=state.temperature+'°C';
    root.querySelector('#lv-temperature').value=state.temperature;
    root.querySelectorAll('[data-lv="scenario"]').forEach(el=>{el.classList.toggle('active',el.dataset.value===state.scenario);el.setAttribute('aria-pressed',String(el.dataset.value===state.scenario))});
    root.querySelectorAll('[data-lv-product]').forEach(el=>{const visible=state.visible.includes(el.dataset.lvProduct);el.classList.toggle('is-muted',!visible);el.classList.toggle('is-visible',visible);el.querySelector('.lv-product-toggle').setAttribute('aria-pressed',String(visible));el.querySelector('.lv-product-status').textContent=visible?'已加入图表':'已隐藏'});
    chartGeometries={};
    root.querySelectorAll('[data-lv-curve-card]').forEach(el=>{el.hidden=el.dataset.lvCurveCard!==state.curve});
    Object.keys(CURVES).forEach(curve=>updateCurveContent(curve,curve===state.curve));
    const imports=Object.entries(state.imported);
    root.querySelector('#lv-import-status').textContent=imports.length?`已接入 ${imports.map(([key])=>CURVES[key].label).join('、')} · 曲线保持原值，回放只改变观察位置。`:'';
    syncPlayerUI(true);
  }

  function isInteracting(){return playback.pointerHeld||playback.focusHeld||performance.now()<playback.resumeAt}
  function isAdvancing(){return !!playback.enabled&&playback.globalEnabled&&!isInteracting()&&!document.hidden}
  function syncScanOffset(curve,x){const g=chartGeometries[curve];if(curve!==state.curve||!g)return;const at=clamp((x-g.xmin)/(g.xmax-g.xmin),0,1);playback.scanOffset=(at-playback.elapsed/playback.duration+2)%1}
  function updateReplayVisuals(curve,x){
    const g=chartGeometries[curve];if(!g||!root)return;
    const at=clamp(g.X(x),g.l,g.w-g.r),windowRect=root.querySelector('#lv-replay-window-'+curve),beam=root.querySelector('#lv-scan-beam-'+curve);
    if(windowRect)windowRect.setAttribute('width',Math.max(0,at-g.l));
    if(beam)beam.setAttribute('x',at-100);
    const line=root.querySelector('#lv-crosshair-line-'+curve);if(line)line.setAttribute('d',`M${at} ${g.t}V${g.h-g.b}`);
  }
  function syncPlayerUI(force=false){
    if(!root?.isConnected)return;
    const advancing=isAdvancing(),interacting=isInteracting(),key=[playback.enabled,playback.globalEnabled,interacting,document.hidden,state.curve].join(':');
    root.classList.toggle('lv-motion-paused',!advancing);
    root.classList.toggle('lv-motion-running',advancing);
    if(force||key!==playbackKey){
      playbackKey=key;
      const button=root.querySelector('#lv-play-toggle'),status=root.querySelector('#lv-play-status');
      button.innerHTML=ico(playback.enabled?'pause':'play')+(playback.enabled?'暂停播放':'继续播放');
      button.setAttribute('aria-pressed',String(!!playback.enabled));button.setAttribute('aria-label',playback.enabled?'暂停曲线自动播放':'继续曲线自动播放');
      status.textContent=!playback.globalEnabled?'全站动效已暂停':!playback.enabled?'回放已暂停':interacting?'手动读图中':document.hidden?'页面未激活':'自动巡览';
      root.querySelectorAll('.lv-autotab').forEach(tab=>{const active=tab.dataset.curve===state.curve;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1});
    }
    const progress=playback.elapsed/playback.duration,bar=root.querySelector('#lv-play-progress');
    bar.querySelector('span').style.transform=`scaleX(${progress})`;bar.setAttribute('aria-valuenow',String(Math.round(progress*100)));
    root.querySelector('#lv-play-countdown').textContent=Math.max(0,(playback.duration-playback.elapsed)/1000).toFixed(1);
    root.querySelectorAll('.lv-autotab').forEach(tab=>{tab.querySelector('.lv-tab-progress').style.transform=`scaleX(${tab.dataset.curve===state.curve?progress:0})`});
  }
  function activateCurve(curve,manual=false){
    if(!CURVES[curve])return;
    state.curve=curve;playback.elapsed=0;playback.lastReadout=0;
    if(manual)playback.resumeAt=performance.now()+1100;
    if(!root)return;
    root.querySelectorAll('[data-lv-curve-card]').forEach(el=>{el.hidden=el.dataset.lvCurveCard!==curve});
    updateCurveContent(curve,true);syncPlayerUI(true);
  }
  function setPlayback(enabled,origin='local'){
    playback.enabled=!!enabled;
    if(origin==='global')playback.globalEnabled=!!enabled;
    playback.lastFrame=0;
    if(enabled){playback.resumeAt=0;playback.focusHeld=playback.keyboardMode&&!!document.activeElement?.closest?.('.lv-pointer-target,.lv-autotab')}
    syncPlayerUI(true);
    return playback.enabled;
  }
  function animateFrame(timestamp){
    if(!root?.isConnected)return;
    const delta=playback.lastFrame?Math.min(100,timestamp-playback.lastFrame):0;playback.lastFrame=timestamp;
    if(isAdvancing()){
      playback.elapsed+=delta;
      if(playback.elapsed>=playback.duration){const keys=Object.keys(CURVES),next=keys[(keys.indexOf(state.curve)+1)%keys.length];playback.transitions++;activateCurve(next,false)}
      const g=chartGeometries[state.curve];
      if(g){const phase=(playback.scanOffset+playback.elapsed/playback.duration)%1,x=g.xmin+(g.xmax-g.xmin)*phase;updateReplayVisuals(state.curve,x);if(timestamp-playback.lastReadout>=75){updateCursor(state.curve,x,false,'playback');playback.lastReadout=timestamp}}
    }
    syncPlayerUI();playback.raf=requestAnimationFrame(animateFrame);
  }

  function download(name,body,type='text/plain;charset=utf-8'){
    const url=URL.createObjectURL(new Blob(['\uFEFF',body],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function csvFor(curve,useModel=false){let rows=['curve,product,x,y'];selected().forEach(p=>(useModel?modelPoints(p.id,curve):points(p.id,curve)).forEach(([x,y])=>rows.push([curve,p.id,Number(x.toFixed(4)),Number(y.toFixed(5))].join(','))));return rows.join('\n')}
  function report(){const selectedProducts=selected(),data={title:'AURORA 性能对比报告',scenario:condition().label,temperature_c:state.temperature,disclosure:'性能指标与雷达指数由模型计算，不代表产品实测；导入曲线由数据提供方确认来源与测试条件。',products:selectedProducts.map(p=>({id:p.id,name:p.brand+' '+p.name,fitment:p.fit,model:p.model,budget_reference_cny:p.price,specification_source:p.source,simulation_metrics:modelMetrics(p.id),simulation_radar:radarMetrics(p.id)})),curves:Object.fromEntries(Object.keys(CURVES).map(key=>[key,{source:sourceFor(key),filename:state.imported[key]?.filename||null,x_axis:CURVES[key].x,y_axis:CURVES[key].y,reference_x:state.cursors[key]??defaultReference(key),reference_readouts:readings(key,state.cursors[key]??defaultReference(key)),interpolation:'Linear interpolation at a common x; no extrapolation outside each series range.',series:Object.fromEntries(selectedProducts.map(p=>[p.id,points(p.id,key)]))}]))};download('AURORA_性能对比报告.json',JSON.stringify(data,null,2),'application/json;charset=utf-8');notice('已导出完整报告，含四类曲线、指标与数据来源')}

  async function importCSV(file){
    if(file.size>2*1024*1024)throw new Error('CSV 请控制在 2 MB 以内。');
    const text=(await file.text()).replace(/^\uFEFF/,'').trim(),lines=text.split(/\r?\n/);
    if(lines.shift().trim().toLowerCase().replace(/\s/g,'')!=='curve,product,x,y')throw new Error('列名应为 curve,product,x,y，请先下载模板。');
    if(lines.length<2||lines.length>12000)throw new Error('CSV 需要 2–12,000 行数据。');
    const result={};
    lines.forEach((line,index)=>{
      const values=line.split(',').map(v=>v.trim());
      if(values.length!==4||values.some(v=>v===''))throw new Error(`第 ${index+2} 行需要 4 个完整字段。`);
      const [curve,id,xString,yString]=values,x=Number(xString),y=Number(yString);
      if(!CURVES[curve]||!BASE[id])throw new Error(`第 ${index+2} 行的曲线或产品标识无效。`);
      if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1000000||Math.abs(y)>1000000)throw new Error(`第 ${index+2} 行不是有效数值，或超出显示范围。`);
      result[curve]??={filename:file.name,series:{}};result[curve].series[id]??=[];result[curve].series[id].push([x,y]);
    });
    Object.values(result).forEach(group=>Object.values(group.series).forEach(series=>{series.sort((a,b)=>a[0]-b[0]);if(series.length<2)throw new Error('每条曲线至少需要两个点。');if(new Set(series.map(p=>p[0])).size!==series.length)throw new Error('同一产品的横坐标不能重复。')}));
    Object.assign(state.imported,result);Object.keys(result).forEach(curve=>{delete state.pinned[curve];delete state.cursors[curve]});state.curve=Object.keys(result)[0];
    const importedIds=Object.keys(result[state.curve].series);if(!state.visible.some(id=>importedIds.includes(id)))state.visible=importedIds;
    draw();notice('CSV 已导入，曲线与来源标记已更新');
  }

  function mount(options={}){
    unmount();context=options;productList=options.products?.filter(p=>BASE[p.id])||productList;
    root=document.querySelector('#performance-lab-v2');if(!root)return;
    const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');playback.reducedMotion=motionQuery.matches;
    if(playback.enabled===null||playback.reducedMotion)playback.enabled=!playback.reducedMotion;
    playback.pointerHeld=false;playback.focusHeld=false;playback.resumeAt=0;playback.elapsed=0;playback.lastFrame=0;playback.lastReadout=0;
    aborter=new AbortController();const listener={signal:aborter.signal};
    root.addEventListener('click',event=>{
      const btn=event.target.closest('[data-lv]');if(!btn)return;
      const action=btn.dataset.lv,id=btn.dataset.id,curve=btn.dataset.curve||state.curve;
      if(action==='toggle'){const idx=state.visible.indexOf(id);if(idx>=0){if(state.visible.length===1){notice('至少保留一款方案，才能继续查看曲线');return}state.visible.splice(idx,1)}else state.visible.push(id);draw()}
      if(action==='add')context.addCart?.(id);
      if(action==='scenario'){state.scenario=btn.dataset.value;draw()}
      if(action==='curve')activateCurve(curve,true);
      if(action==='playback')setPlayback(!playback.enabled);
      if(action==='reference'){delete state.pinned[curve];const x=defaultReference(curve);playback.resumeAt=performance.now()+1800;updateCursor(curve,x);syncScanOffset(curve,x);updateReplayVisuals(curve,x)}
      if(action==='reset'){state.scenario='street';state.temperature=60;state.visible=productList.map(p=>p.id);state.imported={};state.curve='force';state.cursors={};state.pinned={};playback.elapsed=0;draw();notice('已恢复默认模型设置')}
      if(action==='clear-import'){delete state.imported[curve];delete state.pinned[curve];draw();notice('本图已恢复为模型计算')}
      if(action==='template')download('AURORA_'+curve+'_模板.csv',csvFor(curve,true),'text/csv;charset=utf-8');
      if(action==='export-data'){if(!selected().some(p=>points(p.id,curve).length)){notice('当前所选方案没有本图数据，请选择有数据的方案后导出');return}download('AURORA_'+curve+'_'+sourceFor(curve)+'.csv',csvFor(curve),'text/csv;charset=utf-8');notice('已导出'+CURVES[curve].label+'中显示的方案数据')}
      if(action==='export-report')report();
    },listener);
    root.addEventListener('input',event=>{if(event.target.id==='lv-temperature'){state.temperature=Number(event.target.value);draw(false)}},listener);
    root.addEventListener('change',async event=>{if(event.target.id==='lv-csv-file'&&event.target.files.length){try{await importCSV(event.target.files[0]);playback.elapsed=0;playback.resumeAt=performance.now()+1400}catch(error){notice(error.message);const status=root?.querySelector('#lv-import-status');if(status)status.textContent=error.message}finally{event.target.value=''}}},listener);
    root.addEventListener('pointerdown',()=>{playback.keyboardMode=false;playback.focusHeld=false;syncPlayerUI()},listener);
    document.addEventListener('keydown',event=>{if(event.key==='Tab')playback.keyboardMode=true},listener);
    root.addEventListener('pointerover',event=>{if(event.target.closest('.lv-plot-area')){playback.pointerHeld=true;syncPlayerUI()}},listener);
    root.addEventListener('pointermove',event=>{
      if(!event.target.classList.contains('lv-pointer-target'))return;
      const curve=event.target.dataset.curve,g=chartGeometries[curve];if(!g)return;
      playback.pointerHeld=true;
      const svg=event.target.closest('svg'),point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
      const coord=point.matrixTransform(svg.getScreenCTM().inverse()),x=g.xmin+clamp((coord.x-g.l)/(g.w-g.l-g.r),0,1)*(g.xmax-g.xmin),values=updateCursor(curve,x,true);
      updateReplayVisuals(curve,x);
      const tip=root.querySelector('#lv-tooltip-'+curve),bounds=root.querySelector(`[data-lv-plot="${curve}"]`).getBoundingClientRect(),conf=CURVES[curve];
      tip.innerHTML=`<b>相同位置 ${fixed(x,Math.abs(x)>=10?1:2)} ${conf.xUnit}</b>`+values.map(v=>`<span><i style="background:${COLORS[v.id]}"></i>${NAMES[v.id]} <strong>${v.value===null?(v.status==='missing'?'未提供':'超出范围'):fixed(v.value,conf.precision)+' '+conf.yUnit}</strong></span>`).join('');
      tip.hidden=false;tip.style.left=clamp(event.clientX-bounds.left+15,0,Math.max(0,bounds.width-225))+'px';tip.style.top=Math.max(0,event.clientY-bounds.top-125)+'px';syncPlayerUI();
    },listener);
    root.addEventListener('pointerout',event=>{
      const plot=event.target.closest('.lv-plot-area');if(!plot)return;
      if(!event.relatedTarget||!plot.contains(event.relatedTarget)){playback.pointerHeld=false;playback.resumeAt=performance.now()+900;const tip=root?.querySelector('#lv-tooltip-'+plot.dataset.lvPlot);if(tip)tip.hidden=true;syncPlayerUI()}
    },listener);
    root.addEventListener('focusin',event=>{playback.focusHeld=playback.keyboardMode&&!!event.target.closest('.lv-pointer-target,.lv-autotab');syncPlayerUI()},listener);
    root.addEventListener('focusout',()=>{queueMicrotask(()=>{if(!root)return;playback.focusHeld=playback.keyboardMode&&!!document.activeElement?.closest?.('.lv-pointer-target,.lv-autotab');if(!playback.focusHeld)playback.resumeAt=performance.now()+800;syncPlayerUI()})},listener);
    root.addEventListener('keydown',event=>{
      if(event.target.matches('.lv-autotab')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();playback.keyboardMode=true;playback.focusHeld=true;const keys=Object.keys(CURVES),index=keys.indexOf(event.target.dataset.curve),next=event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):keys[(index+(event.key==='ArrowLeft'?-1:1)+keys.length)%keys.length];activateCurve(next,true);root.querySelector('#lv-tab-'+next).focus();return;
      }
      if(!event.target.classList.contains('lv-pointer-target')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const curve=event.target.dataset.curve,g=chartGeometries[curve];if(!g)return;event.preventDefault();playback.keyboardMode=true;playback.focusHeld=true;
      const current=Number(event.target.getAttribute('aria-valuenow')),delta=(g.xmax-g.xmin)/80;
      let next=current+(event.key==='ArrowLeft'?-delta:delta);if(event.key==='Home')next=g.xmin;if(event.key==='End')next=g.xmax;
      const x=clamp(next,g.xmin,g.xmax);updateCursor(curve,x,true);updateReplayVisuals(curve,x);syncPlayerUI();
    },listener);
    document.addEventListener('visibilitychange',()=>{playback.lastFrame=0;syncPlayerUI()},listener);
    motionQuery.addEventListener('change',event=>{playback.reducedMotion=event.matches;if(event.matches)setPlayback(false)},listener);
    draw();
    let observedWidth=0;
    resizeObserver=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(!width)return;const shouldRedraw=observedWidth>0&&Math.abs(width-observedWidth)>30;observedWidth=width;if(shouldRedraw)draw(false)});
    resizeObserver.observe(root);playback.raf=requestAnimationFrame(animateFrame);
  }

  function unmount(){aborter?.abort();resizeObserver?.disconnect();if(playback.raf)cancelAnimationFrame(playback.raf);playback.raf=0;playback.lastFrame=0;aborter=null;resizeObserver=null;root=null;chartGeometries={};playbackKey=''}
  window.addEventListener('aurora-motionchange',event=>{if(typeof event.detail?.enabled==='boolean')setPlayback(event.detail.enabled,'global')});
  window.AuroraLab={
    render,mount,unmount,setPlayback,setPaused:paused=>setPlayback(!paused),
    inspect:()=>({scenario:state.scenario,temperature:state.temperature,curve:state.curve,visible:[...state.visible],imported:Object.keys(state.imported),cursors:{...state.cursors},readouts:Object.fromEntries(Object.keys(CURVES).map(curve=>[curve,readings(curve,state.cursors[curve]??defaultReference(curve))])),metrics:Object.fromEntries(productList.map(p=>[p.id,modelMetrics(p.id)])),playback:{enabled:!!playback.enabled,playing:!!root&&isAdvancing(),interactionPaused:isInteracting(),pointerHeld:playback.pointerHeld,focusHeld:playback.focusHeld,keyboardMode:playback.keyboardMode,reducedMotion:playback.reducedMotion,globalEnabled:playback.globalEnabled,progress:playback.elapsed/playback.duration,elapsedMs:playback.elapsed,durationMs:playback.duration,scanX:state.cursors[state.curve]??null,transitions:playback.transitions}}),
    readAt:(curve,id,x)=>CURVES[curve]&&BASE[id]?interpolate(points(id,curve),Number(x)):null,
    setCursor:(curve,x)=>{if(!CURVES[curve]||!Number.isFinite(Number(x)))return null;if(curve!==state.curve)activateCurve(curve,true);const values=updateCursor(curve,Number(x),true);updateReplayVisuals(curve,Number(x));return values}
  };
})();
