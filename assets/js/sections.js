/* =========================================================================
   MindSpace — 各业务板块渲染与交互
   依赖：window.Store / window.Charts / window.App
   ========================================================================= */
(function (global) {
  "use strict";

  const S = () => App.state;

  /* ----------------------------- 工具 ----------------------------- */
  function fmtNum(n, d) {
    if (n == null || isNaN(n)) return "0";
    const v = Number(n);
    const s = v.toLocaleString("zh-CN", { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: 0 });
    return s;
  }
  function fmtMoney(n) { return "¥" + fmtNum(n, 0); }
  function sign(n) { return n > 0 ? "+" : ""; }
  function chgClass(n) { return n >= 0 ? "up" : "down"; }
  function pct(n) { return sign(n) + fmtNum(n, 2) + "%"; }
  function liveNote() {
    if (App.marketStatus === "live") return "主要指数实时走势（数据源：Yahoo Finance 实时）。";
    if (App.marketStatus === "fallback") return "主要指数实时走势（实时接口暂不可用，当前为本地模拟数据）。";
    return "主要指数实时走势（正在连接实时数据源…）。";
  }

  function buildCalendar(year, month, opts) {
    opts = opts || {};
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const today = Store.todayStr();
    const dows = ["日", "一", "二", "三", "四", "五", "六"].map((x) => `<div class="cal-dow">${x}</div>`).join("");
    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const cls = ["cal-cell"];
      if (ds === today) cls.push("today");
      if (opts.markSet && opts.markSet.has(ds)) cls.push("marked");
      const data = opts.pick ? `data-action="${opts.pick}" data-date="${ds}"` : "";
      cells += `<div class="${cls.join(" ")}" ${data}>${d}${opts.markSet && opts.markSet.has(ds) ? '<span class="dot"></span>' : ""}</div>`;
    }
    return dows + cells;
  }

  function monthLabel(y, m) { return `${y} 年 ${m + 1} 月`; }

  /* ============================ FIRE 计算 ============================ */
  function computeFire() {
    const st = S().fire;
    const p = st.scenarios[st.scenario].params;
    const withdrawal = 0.04; // 4% 法则（可在假设区自由编辑）
    const fireTarget = Math.round(p.initAnnualSpend / withdrawal);

    // 净资产 = 储蓄明细 + 投资明细 的合计，并按日期排序构建累计历史
    const sav = (st.savings || []).filter((e) => e && isFinite(+e.amount));
    const inv = (st.investments || []).filter((e) => e && isFinite(+e.amount));
    const entries = sav.concat(inv)
      .map((e) => ({ date: e.date || "1970-01-01", v: +e.amount }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let run = 0; const history = [];
    entries.forEach((e) => { run += e.v; history.push({ date: e.date, value: run }); });
    const netWorth = run; // 当前净资产（储蓄 + 投资 合计）

    const contribution = Math.round(p.annualIncome * p.savingsRate / 100);
    const r = p.annualReturn / 100;

    // 曲线：先绘制按日期的累计历史，再从当前净资产按年复利 + 年定投 推演至目标
    const series = history.map((h) => h.value);
    if (series.length === 0) series.push(0);
    let assets = netWorth, years = 0;
    while (assets < fireTarget && years < 80) {
      assets = assets * (1 + r) + contribution;
      years += 1;
      series.push(Math.round(assets));
    }
    const progress = fireTarget > 0 ? Math.min(100, Math.round((netWorth / fireTarget) * 100)) : 0;
    const reachAge = p.age + years;
    return {
      fireTarget, netWorth, progress, reachAge, series, years, contribution,
      entriesCount: entries.length,
      firstDate: entries.length ? entries[0].date : null,
      lastDate: entries.length ? entries[entries.length - 1].date : null
    };
  }

  /* ============================ 渲染分发 ============================ */
  function render(section, sub) {
    if (App.detail) return renderDetail();
    if (section === "life") return renderLife(sub);
    if (section === "fire") return renderFire();
    if (section === "market") return renderMarket(sub);
    return "";
  }

  /* ============================ 生活记录 ============================ */
  function renderLife(sub) {
    sub = sub || "period";
    if (sub === "period") return lifePeriod();
    if (sub === "calendar") return lifeCalendar();
    if (sub === "gallery") return lifeGallery();
    if (sub === "anniversary") return lifeAnniversary();
    return "";
  }

  function lifePeriod() {
    const p = S().life.period;
    const ev = p.events;
    const m = App.periodMonth || new Date();
    const y = m.getFullYear(), mo = m.getMonth();
    const markSet = new Set();
    ev.forEach((e) => {
      if (!e.start) return;
      const s = new Date(e.start + "T00:00:00");
      const en = e.end ? new Date(e.end + "T00:00:00") : s;
      for (let d = new Date(s); d <= en; d.setDate(d.getDate() + 1)) {
        markSet.add(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
      }
    });
    const rows = ev.map((e, i) => `
      <div class="param" style="display:flex;gap:10px;align-items:center;">
        <div style="flex:1">
          <div class="p-label">周期 #${i + 1}</div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input class="input" style="flex:1" type="date" value="${e.start || ""}" data-action="period-set" data-i="${i}" data-f="start">
            <input class="input" style="flex:1" type="date" value="${e.end || ""}" data-action="period-set" data-i="${i}" data-f="end">
          </div>
        </div>
        <button class="btn sm ghost" data-action="period-remove" data-i="${i}">移除</button>
      </div>`).join("");

    const last = ev[ev.length - 1];
    let predict = "—";
    if (last && last.start) {
      const d = new Date(last.start + "T00:00:00");
      d.setDate(d.getDate() + 28);
      predict = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    return `
      <h2 class="section-title">经期记录</h2>
      <p class="section-desc">记录起止日期，系统自动预测下一次生理期（默认 28 天周期）。状态描述可自由编辑。</p>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="card-title">周期记录</div>
            <button class="btn sm primary" data-action="period-add">+ 新增周期</button></div>
          <div class="param-grid">${rows || '<div class="empty-hint"><span class="eh-ico">🌸</span>暂无记录，点击右上角新增</div>'}</div>
        </div>
        <div class="card warm">
          <div class="card-head"><div class="card-title">预测与状态</div></div>
          <div class="param"><div class="p-label">预测下次开始</div><div class="p-val">${predict}</div></div>
          <div style="margin-top:14px">
            <div class="field"><label>本月状态描述（心情 / 身体反应，可自由编辑）</label>
              <textarea class="textarea" data-action="period-note" placeholder="例如：略有疲惫，注意保暖…">${p.notes[Store.todayStr()] || ""}</textarea></div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:18px">
        <div class="cal-head">
          <div class="cal-title">${monthLabel(y, mo)}</div>
          <div style="display:flex;gap:8px">
            <button class="cal-nav-btn" data-action="cal-prev" data-cal="period">‹</button>
            <button class="cal-nav-btn" data-action="cal-next" data-cal="period">›</button>
          </div>
        </div>
        <div class="cal-grid">${buildCalendar(y, mo, { markSet })}</div>
        <div class="cal-legend"><span><span class="sw" style="background:var(--mark)"></span>已记录 / 预测区间</span></div>
      </div>`;
  }

  function lifeCalendar() {
    const cal = S().life.calendar;
    const m = App.calMonth || new Date();
    const y = m.getFullYear(), mo = m.getMonth();
    const markSet = new Set(Object.keys(cal));
    const recent = Object.keys(cal).sort().reverse().slice(0, 6);
    const recentHTML = recent.length ? recent.map((d) => `
      <div class="anni" data-action="open-calendar-day" data-date="${d}" style="cursor:pointer">
        <div class="ring acc" style="font-size:13px">${d.slice(5)}</div>
        <div class="info"><div class="nm">${cal[d].text ? escapeHtml(cal[d].text.slice(0, 28)) : "（空白记录）"}</div>
          <div class="dt">${(cal[d].tags || []).map((t) => "#" + t).join(" ") || "无标签"}</div></div>
      </div>`).join("") :
      `<div class="empty-hint"><span class="eh-ico">📅</span>点击左侧日期，开始记录你的每一天</div>`;
    return `
      <h2 class="section-title">日历备忘</h2>
      <p class="section-desc">点击任意日期，添加图片、文字与标签。已记录的日期会以暖色实心圆圈标注。</p>
      <div class="cal-wrap">
        <div class="cal">
          <div class="cal-head">
            <div class="cal-title">${monthLabel(y, mo)}</div>
            <div style="display:flex;gap:8px">
              <button class="cal-nav-btn" data-action="cal-prev" data-cal="calendar">‹</button>
              <button class="cal-nav-btn" data-action="cal-next" data-cal="calendar">›</button>
            </div>
          </div>
          <div class="cal-grid">${buildCalendar(y, mo, { markSet, pick: "open-calendar-day" })}</div>
          <div class="cal-legend"><span><span class="sw" style="background:var(--mark)"></span>已记录</span><span><span class="sw" style="background:transparent;border:1px solid var(--line)"></span>未记录</span></div>
        </div>
        <div class="card warm" style="align-self:start">
          <div class="card-head"><div class="card-title">近期记录</div></div>
          <div class="anni-list">${recentHTML}</div>
        </div>
      </div>`;
  }

  function lifeGallery() {
    const imgs = S().life.images;
    const grid = imgs.length ? imgs.map((im) => `
      <div class="photo" data-action="edit-image" data-id="${im.id}">
        ${im.src ? `<img src="${im.src}" alt="">` : `<div style="aspect-ratio:1/1;background:linear-gradient(135deg,#F0E6DA,#E6D6C4);display:grid;place-items:center;color:#b9a892">无图</div>`}
        <div class="cap">${escapeHtml(im.caption || "点击添加注解")}</div>
      </div>`).join("") :
      `<div class="empty-hint" style="grid-column:1/-1"><span class="eh-ico">🖼️</span>还没有照片，点击右下角「添加图片」</div>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div><h2 class="section-title">图片记录</h2>
        <p class="section-desc">瀑布流相册，点击任意图片可预览并自由编辑下方注解。</p></div>
        <button class="btn primary" data-action="add-image">+ 添加图片</button>
      </div>
      <div class="gallery">${grid}</div>`;
  }

  function lifeAnniversary() {
    const list = S().life.anniversaries;
    const today = new Date(Store.todayStr() + "T00:00:00");
    const items = list.length ? list.map((a, i) => {
      const target = new Date(a.date + "T00:00:00");
      let big, sub, ringCls;
      if (a.mode === "count") {
        let diff = Math.round((target - today) / 86400000);
        const neg = diff < 0; diff = Math.abs(diff);
        big = (neg ? "已过 " : "还有 ") + diff;
        sub = "天"; ringCls = "count";
      } else {
        let diff = Math.round((today - target) / 86400000);
        const neg = diff < 0; diff = Math.abs(diff);
        big = (neg ? "还有 " : "已经 ") + diff;
        sub = "天"; ringCls = "acc";
      }
      return `
      <div class="anni">
        <div class="ring ${ringCls}">${a.mode === "count" ? "⏳" : "❤"}</div>
        <div class="info">
          <div class="nm"><span class="editable" data-path="life.anniversaries.${i}.name">${escapeHtml(a.name)}</span></div>
          <div class="dt">${a.date} · ${a.repeat ? "每年重复" : "一次性"}</div>
        </div>
        <div class="big ${chgClass(1)}">${big}<small>${sub}</small></div>
        <div class="acts">
          <button class="btn sm" data-action="toggle-anni-mode" data-id="${a.id}">${a.mode === "count" ? "切累计" : "切倒计时"}</button>
          <button class="btn sm ghost" data-action="edit-anni" data-id="${a.id}">编辑</button>
        </div>
      </div>`;
    }).join("") : `<div class="empty-hint"><span class="eh-ico">🎉</span>还没有纪念日</div>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div><h2 class="section-title">纪念日</h2>
        <p class="section-desc">支持倒计时 / 累计日两种模式，可设置每年重复或一次性。</p></div>
        <button class="btn primary" data-action="add-anni">+ 新增纪念日</button>
      </div>
      <div class="anni-list">${items}</div>`;
  }

  /* ============================ FIRE ============================ */
  function renderFire() {
    if (App.detail && (App.detail.type === "savings" || App.detail.type === "investments")) return renderFireDetail(App.detail.type);
    const st = S().fire;
    const f = computeFire();
    const p = st.scenarios[st.scenario].params;
    const savTotal = (st.savings || []).reduce((s, e) => s + (isFinite(+e.amount) ? +e.amount : 0), 0);
    const invTotal = (st.investments || []).reduce((s, e) => s + (isFinite(+e.amount) ? +e.amount : 0), 0);
    const scnBtns = Object.keys(st.scenarios).map((k) =>
      `<button class="subtab ${st.scenario === k ? "active" : ""}" data-action="set-scenario" data-scn="${k}">${st.scenarios[k].label}</button>`).join("");

    const T = st.titles, D = st.descs;
    const kpis = `
      <div class="kpi"><div class="k-label"><span class="editable" data-path="fire.titles.k4">${escapeHtml(T.k4)}</span></div>
        <div class="k-val">${fmtMoney(f.netWorth)}</div>
        <div class="progress"><span style="width:${f.progress}%"></span></div>
        <div class="k-desc"><span class="editable" data-path="fire.descs.d4">${escapeHtml(D.d4)}</span></div></div>
      <div class="kpi"><div class="k-label"><span class="editable" data-path="fire.titles.k2">${escapeHtml(T.k2)}</span></div>
        <div class="k-val">${f.progress}<span class="k-unit">%</span></div>
        <div class="progress"><span style="width:${f.progress}%"></span></div>
        <div class="k-desc"><span class="editable" data-path="fire.descs.d2">${escapeHtml(D.d2)}</span></div></div>
      <div class="kpi"><div class="k-label"><span class="editable" data-path="fire.titles.k1">${escapeHtml(T.k1)}</span></div>
        <div class="k-val">${fmtMoney(f.fireTarget)}</div>
        <div class="progress"><span style="width:${f.progress}%"></span></div>
        <div class="k-desc"><span class="editable" data-path="fire.descs.d1">${escapeHtml(D.d1)}</span></div></div>
      <div class="kpi"><div class="k-label"><span class="editable" data-path="fire.titles.k3">${escapeHtml(T.k3)}</span></div>
        <div class="k-val">${f.reachAge}<span class="k-unit">岁</span></div>
        <div class="progress"><span style="width:${Math.min(100, (p.age / f.reachAge) * 100)}%"></span></div>
        <div class="k-desc"><span class="editable" data-path="fire.descs.d3">${escapeHtml(D.d3)}</span></div></div>`;

    const params = `
      <div class="param"><div class="p-label">当前年龄</div><div class="p-val"><span class="editable num" data-path="fire.scenarios.${st.scenario}.params.age" data-recalc="fire">${p.age}</span><span class="p-unit">岁</span></div></div>
      <div class="param"><div class="p-label">初始年支出</div><div class="p-val"><span class="editable num" data-path="fire.scenarios.${st.scenario}.params.initAnnualSpend" data-recalc="fire">${fmtNum(p.initAnnualSpend, 0)}</span><span class="p-unit">元</span></div></div>
      <div class="param"><div class="p-label">年税后收入</div><div class="p-val"><span class="editable num" data-path="fire.scenarios.${st.scenario}.params.annualIncome" data-recalc="fire">${fmtNum(p.annualIncome, 0)}</span><span class="p-unit">元</span></div></div>
      <div class="param"><div class="p-label">存储率</div><div class="p-val"><span class="editable num" data-path="fire.scenarios.${st.scenario}.params.savingsRate" data-recalc="fire">${p.savingsRate}</span><span class="p-unit">%</span></div></div>
      <div class="param"><div class="p-label">投资年化收益</div><div class="p-val"><span class="editable num" data-path="fire.scenarios.${st.scenario}.params.annualReturn" data-recalc="fire">${p.annualReturn}</span><span class="p-unit">%</span></div></div>
      <div class="param"><div class="p-label">通胀率</div><div class="p-val"><span class="editable num" data-path="fire.scenarios.${st.scenario}.params.inflation" data-recalc="fire">${p.inflation}</span><span class="p-unit">%</span></div></div>
      <div class="param"><div class="p-label">每月定投</div><div class="p-val"><span class="editable num" data-path="fire.scenarios.${st.scenario}.params.monthlyInvest" data-recalc="fire">${fmtNum(p.monthlyInvest, 0)}</span><span class="p-unit">元</span></div></div>`;

    const milestones = st.milestones.map((m, i) => `
      <div class="tl-item ${m.status === "done" ? "done" : ""}">
        <div class="tl-age">${m.age} 岁</div>
        <div class="tl-desc"><span class="editable" data-path="fire.milestones.${i}.desc">${escapeHtml(m.desc)}</span></div>
        <span class="tl-tag ${m.status === "done" ? "done" : "todo"}">${m.status === "done" ? "已达成" : "进行中"}</span>
        <span style="margin-left:8px">
          <button class="btn sm ghost" data-action="toggle-milestone" data-i="${i}">${m.status === "done" ? "标记未达成" : "标记达成"}</button>
          <button class="btn sm ghost" data-action="rm-milestone" data-i="${i}">删除</button>
        </span>
      </div>`).join("");

    const assumes = st.assumptions.map((a, i) => `
      <div class="assume">
        <div class="a-label"><span class="editable" data-path="fire.assumptions.${i}.label">${escapeHtml(a.label)}</span></div>
        <div class="a-val"><span class="editable num" data-path="fire.assumptions.${i}.val">${a.val}</span><span style="font-size:13px;color:var(--ink-soft)">${a.unit}</span></div>
        <div class="a-desc"><span class="editable" data-path="fire.assumptions.${i}.desc">${escapeHtml(a.desc)}</span></div>
      </div>`).join("");

    return `
      <div class="fire-head">
        <h2 class="section-title"><span class="editable" data-path="fire.title">${escapeHtml(st.title)}</span></h2>
        <div class="fire-meta">
          <div class="mode-toggle">${scnBtns}</div>
          <button class="btn sm" data-action="share-fire">分享</button>
          <button class="btn sm ghost" data-action="settings-fire">设置</button>
        </div>
      </div>

      <div class="kpi-row">${kpis}</div>

      <div class="fire-assets">
        <div class="fa-block"><div class="fa-label">储蓄合计</div><div class="fa-val">${fmtMoney(savTotal)}<small>元</small></div><button class="btn sm ghost" data-action="fire-detail" data-type="savings">查看明细 ›</button></div>
        <div class="fa-block"><div class="fa-label">投资合计</div><div class="fa-val">${fmtMoney(invTotal)}<small>元</small></div><button class="btn sm ghost" data-action="fire-detail" data-type="investments">查看明细 ›</button></div>
        <div class="fa-block total"><div class="fa-label">净资产合计</div><div class="fa-val">${fmtMoney(f.netWorth)}<small>元</small></div><div class="fa-sub">储蓄 ${fmtMoney(savTotal)} + 投资 ${fmtMoney(invTotal)}</div></div>
      </div>

      <div class="grid grid-2" style="margin-bottom:18px">
        <div class="card"><div class="card-head"><div class="card-title">模拟设定</div></div><div class="param-grid">${params}</div></div>
        <div class="card warm"><div class="card-head"><div class="card-title">目标设置</div></div>
          <div class="param-grid">
            <div class="param"><div class="p-label">FIRE 提款率</div><div class="p-val">4<span class="p-unit">%</span></div></div>
            <div class="param"><div class="p-label">年结余（预估）</div><div class="p-val">${fmtMoney(f.contribution)}</div></div>
          </div>
          <button class="btn primary sm" style="margin-top:14px" data-action="add-milestone">+ 添加里程碑</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-head"><div class="card-title">资产增长曲线</div><div class="card-sub">随参数实时更新</div></div>
        <canvas data-chart="fire" id="fireChart" style="width:100%;height:240px;display:block"></canvas>
        <p class="section-desc" style="margin:12px 0 0"><span class="editable" data-path="fire.chartDesc">${escapeHtml(st.chartDesc)}</span>${
          f.entriesCount ? `<br><span style="color:var(--ink-mute)">数据区间：${f.firstDate} ~ ${f.lastDate} · 共 ${f.entriesCount} 笔 · 净资产 ${fmtMoney(f.netWorth)}（随明细实时变动）</span>` : ""
        }</p>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-head"><div class="card-title">里程碑时间线 · The Milestones</div></div>
        <div class="timeline">${milestones || '<div class="empty-hint">暂无里程碑</div>'}</div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">关键假设与偏差对比</div></div>
        <div class="assume-grid">${assumes}</div>
        <div class="param-grid" style="margin-top:16px">
          ${st.assumptions.map((a, i) => `<div class="param"><div class="p-label">${escapeHtml(a.label)} 偏差对比</div><div class="p-val"><span class="editable num" data-path="fire.assumptions.${i}.val">${a.val}</span><span class="p-unit">${a.unit}</span> 基准</div></div>`).join("")}
        </div>
      </div>`;
  }

  /* 储蓄 / 投资 明细页：记录每笔日期与金额，改动实时反映到净资产与曲线 */
  function renderFireDetail(type) {
    const isSav = type === "savings";
    const list = (S().fire[type] || []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const total = list.reduce((s, e) => s + (isFinite(+e.amount) ? +e.amount : 0), 0);
    const rows = list.map((e) => `
      <div class="fa-row">
        <div class="fa-date">${escapeHtml(e.date || "—")}</div>
        <div class="fa-note">${escapeHtml(e.note || "（无备注）")}</div>
        <div class="fa-amt">${fmtMoney(+e.amount)}</div>
        <div class="fa-acts">
          <button class="btn sm ghost" data-action="edit-entry" data-type="${type}" data-id="${e.id}">编辑</button>
          <button class="btn sm ghost" data-action="rm-entry" data-type="${type}" data-id="${e.id}">删除</button>
        </div>
      </div>`).join("");
    return `
      <button class="btn ghost sm" data-action="fire-back" style="margin-bottom:14px">‹ 返回 FIRE</button>
      <div class="fire-head">
        <h2 class="section-title">${isSav ? "储蓄明细" : "投资明细"}</h2>
        <div class="fire-meta"><span class="chip">合计 ${fmtMoney(total)} · 共 ${list.length} 笔</span></div>
      </div>
      <p class="section-desc">记录每笔${isSav ? "储蓄" : "投资"}的日期与金额（可填负数表示取出）；改动会实时反映到「净资产合计」与资产增长曲线。</p>
      <div class="card">
        <div class="fa-list">${rows || '<div class="empty-hint">暂无记录，点击「添加一笔」开始记录</div>'}</div>
        <button class="btn primary sm" data-action="add-entry" data-type="${type}" style="margin-top:16px">+ 添加一笔</button>
      </div>`;
  }

  /* ============================ 股市 ============================ */
  function renderMarket(sub) {
    sub = sub || "realtime";
    if (sub === "realtime") return marketRealtime();
    if (sub === "portfolio") return marketPortfolio();
    if (sub === "fund") return marketFund();
    return "";
  }

  function marketRealtime() {
    const st = S().market;
    const main = App.mainIndex || "SH";
    const idx = st.indices.find((x) => x.code === main) || st.indices[0];
    const chg = idx.price - idx.prev;
    const chgP = (chg / idx.prev) * 100;
    const cards = st.indices.map((x) => {
      const c = x.price - x.prev, cp = (c / x.prev) * 100;
      return `<div class="index-card" data-action="set-main-index" data-code="${x.code}" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between"><div><div class="ic-name">${x.name}</div><div class="ic-code">${x.code}</div></div>
          <div class="ic-chg ${chgClass(c)}">${pct(cp)}</div></div>
        <div class="ic-price ${chgClass(c)}">${fmtNum(x.price, 2)}</div>
        <canvas data-chart="spark" data-code="${x.code}" style="width:100%;height:46px"></canvas>
      </div>`;
    }).join("");

    const GLOBE_FB = [
      { n: "道琼斯", v: 38900.4, c: 0.42 }, { n: "标普500", v: 4980.1, c: 0.31 },
      { n: "纳斯达克", v: 15820.3, c: 0.31 }, { n: "日经225", v: 39210.2, c: -0.18 },
      { n: "德国DAX", v: 17880.5, c: 0.12 }, { n: "黄金", v: 2342.6, c: 0.55 },
      { n: "原油", v: 78.4, c: -0.9 }, { n: "美元指数", v: 104.2, c: -0.2 }
    ];
    const globeSrc = (App.globals && App.globals.length)
      ? App.globals.map((g) => ({ n: g.name, v: g.value, c: g.chg }))
      : GLOBE_FB;
    const globe = globeSrc.map((g) => `<div class="globe"><div class="g-name">${g.n}</div><div class="g-val">${fmtNum(g.v, g.v > 1000 ? 0 : 2)}</div><div class="g-chg ${chgClass(g.c)}">${pct(g.c)}</div></div>`).join("");

    const volText = idx.volume ? (idx.volume / 1e8).toFixed(2) + " 亿手" : "—";

    return `
      <div class="mkt-head">
        <h2 class="section-title">大盘实时</h2>
        <div class="mkt-clock" id="mktClock" title="本地日期与实时时间">
          <span class="mkt-date" id="mktDate"></span>
          <span class="mkt-time" id="mktTime"></span>
        </div>
      </div>
      <p class="section-desc">${liveNote()}点击卡片切换主图。</p>
      <div class="card" style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px">
          <div><div class="card-sub">${idx.name} · ${idx.code}</div>
            <div class="detail-hero"><span class="d-price ${chgClass(chg)}">${fmtNum(idx.price, 2)}</span>
            <span class="d-chg ${chgClass(chg)}">${sign(chg)}${fmtNum(chg, 2)} (${pct(chgP)})</span></div></div>
          <div class="chip">成交量 ${volText}</div>
        </div>
        <canvas data-chart="line" data-code="${idx.code}" data-base="${idx.prev}" id="mainChart" style="width:100%;height:200px;display:block;margin-top:8px"></canvas>
      </div>
      <h3 class="card-title" style="margin:6px 0 12px">主要大盘指数</h3>
      <div class="mkt-grid">${cards}</div>
      <h3 class="card-title" style="margin:24px 0 12px">全球市场概览</h3>
      <div class="globe-row">${globe}</div>`;
  }

  function marketPortfolio() {
    const st = S().market;
    const rows = st.watch.length ? st.watch.map((w) => {
      const c = w.price - w.prevClose, cp = (c / w.prevClose) * 100;
      let pnl = "";
      if (w.hold > 0) {
        const profit = (w.price - w.cost) * w.hold;
        pnl = `<div class="w-num ${chgClass(profit)}">${sign(profit)}${fmtMoney(profit)}</div>`;
      } else pnl = `<div class="w-num" style="color:var(--ink-mute)">—</div>`;
      return `<div class="watch-row" data-action="watch-detail" data-code="${w.code}">
        <div><div class="w-name">${w.name}</div><div class="w-code">${w.code}</div></div>
        <div class="w-num ${chgClass(c)}">${fmtNum(w.price, 2)}</div>
        <div class="w-num ${chgClass(c)}">${pct(cp)}</div>
        <div class="w-acts"><button class="btn sm ghost" data-action="edit-watch" data-code="${w.code}">编辑</button>
          <button class="btn sm ghost" data-action="rm-watch" data-code="${w.code}">✕</button></div>
      </div>`;
    }).join("") : `<div class="empty-hint"><span class="eh-ico">📈</span>还没有自选股，点击「添加股票」</div>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div><h2 class="section-title">自选股</h2><p class="section-desc">点击单只股票查看详情。价格对接 Yahoo Finance 实时数据（A 股代码自动识别交易所）。</p></div>
        <button class="btn primary" data-action="add-watch">+ 添加股票</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">${rows}</div>`;
  }

  function marketFund() {
    const st = S().market;
    const rows = st.funds.length ? st.funds.map((f) => {
      const c = f.nav - f.prevNav, cp = (c / f.prevNav) * 100;
      return `<div class="watch-row" data-action="fund-detail" data-code="${f.code}">
        <div><div class="w-name">${f.name}</div><div class="w-code">${f.code}</div></div>
        <div class="w-num">${fmtNum(f.nav, 3)}</div>
        <div class="w-num ${chgClass(cp)}">${pct(cp)}</div>
        <div class="w-acts"><button class="btn sm ghost" data-action="edit-fund" data-code="${f.code}">编辑</button>
          <button class="btn sm ghost" data-action="rm-fund" data-code="${f.code}">✕</button></div>
      </div>`;
    }).join("") : `<div class="empty-hint"><span class="eh-ico">💡</span>还没有关注基金</div>`;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div><h2 class="section-title">基金分析</h2><p class="section-desc">净值、日涨跌与估值动态。点击进入详情。</p></div>
        <button class="btn primary" data-action="add-fund">+ 添加基金</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">${rows}</div>`;
  }

  function renderDetail() {
    const d = App.detail;
    if (d.type === "stock") {
      const w = S().market.watch.find((x) => x.code === d.code);
      if (!w) { App.detail = null; return renderMarket("portfolio"); }
      const c = w.price - w.prevClose, cp = (c / w.prevClose) * 100;
      const holdVal = w.hold * w.price;
      const profit = (w.price - w.cost) * w.hold;
      return `
        <button class="btn ghost sm" data-action="market-back" style="margin-bottom:14px">‹ 返回自选股</button>
        <div class="card">
          <div class="detail-hero"><span style="font-size:20px;font-weight:600">${w.name}</span>
            <span class="card-sub">${w.code}</span></div>
          <div class="detail-hero"><span class="d-price ${chgClass(c)}">${fmtNum(w.price, 2)}</span>
            <span class="d-chg ${chgClass(c)}">${sign(c)}${fmtNum(c, 2)} (${pct(cp)})</span></div>
          <canvas data-chart="line" data-code="${w.code}" data-base="${w.prevClose}" id="detailChart" style="width:100%;height:220px;display:block;margin-top:10px"></canvas>
        </div>
        <div class="grid grid-2" style="margin-top:16px">
          <div class="card warm"><div class="card-title">持仓概况</div>
            <div class="param-grid">
              <div class="param"><div class="p-label">持仓数量</div><div class="p-val">${w.hold || 0}<span class="p-unit">股</span></div></div>
              <div class="param"><div class="p-label">持仓市值</div><div class="p-val">${fmtMoney(holdVal)}</div></div>
              <div class="param"><div class="p-label">成本价</div><div class="p-val">${fmtNum(w.cost, 2)}</div></div>
              <div class="param"><div class="p-label">浮动盈亏</div><div class="p-val ${chgClass(profit)}">${sign(profit)}${fmtMoney(profit)}</div></div>
            </div>
            <button class="btn sm" data-action="edit-watch" data-code="${w.code}" style="margin-top:12px">编辑持仓</button>
          </div>
          <div class="card"><div class="card-title">说明</div>
            <p class="section-desc">${App.marketStatus === "live" ? "以上为 Yahoo Finance 实时行情数据。" : "实时接口暂不可用，当前展示本地模拟数据；接口恢复后将自动切换为实时。"}</p></div>
        </div>`;
    }
    if (d.type === "fund") {
      const f = S().market.funds.find((x) => x.code === d.code);
      if (!f) { App.detail = null; return renderMarket("fund"); }
      const c = f.nav - f.prevNav, cp = (c / f.prevNav) * 100;
      return `
        <button class="btn ghost sm" data-action="market-back" style="margin-bottom:14px">‹ 返回基金</button>
        <div class="card">
          <div class="detail-hero"><span style="font-size:20px;font-weight:600">${f.name}</span>
            <span class="card-sub">${f.code}</span></div>
          <div class="detail-hero"><span class="d-price">${fmtNum(f.nav, 3)}</span>
            <span class="d-chg ${chgClass(cp)}">${pct(cp)}</span>
            <span class="chip">盘中估值 ${pct(f.estimate)}</span></div>
          <canvas data-chart="spark" data-code="${f.code}" id="detailChart" style="width:100%;height:200px;display:block;margin-top:10px"></canvas>
        </div>
        <div class="card" style="margin-top:16px"><div class="card-title">动态</div>
          <p class="section-desc">估值动态 ${pct(f.estimate)}，可结合净值走势判断申赎时点。</p>
          <button class="btn sm" data-action="edit-fund" data-code="${f.code}">编辑基金</button></div>`;
    }
    return "";
  }

  /* ----------------------------- 辅助 ----------------------------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  global.Sections = {
    render, computeFire, buildCalendar, escapeHtml,
    fmtNum, fmtMoney, pct, chgClass
  };
})(window);
