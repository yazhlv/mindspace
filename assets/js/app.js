/* =========================================================================
   MindSpace — 应用主控
   导航 · 可编辑引擎 · 交互分发 · 弹层 · 实时模拟 · PWA
   ========================================================================= */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => Sections.escapeHtml(s);

  const NAV = [
    { id: "life", label: "生活记录", en: "Life Chronicle", subs: [
      { id: "period", label: "经期记录" }, { id: "calendar", label: "日历备忘" },
      { id: "gallery", label: "图片记录" }, { id: "anniversary", label: "纪念日" } ] },
    { id: "fire", label: "财务自由 FIRE 规划", en: "FIRE Roadmap", subs: [] },
    { id: "market", label: "股市分析", en: "Market Insights", subs: [
      { id: "realtime", label: "大盘实时" }, { id: "portfolio", label: "自选股" }, { id: "fund", label: "基金分析" } ] }
  ];
  const ICONS = {
    life: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.6-9.2-9C1.3 8.9 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.3 0 4.7 3.4 3.2 6.5C19 16.4 12 21 12 21z"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.3-2-1-3 2 1 4 3.5 4 7a7 7 0 0 1-14 0c0-4 3-6 5-11z"/></svg>',
    market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 15l4-4 3 3 5-6 4 4"/><path d="M20 7v12H4"/></svg>'
  };

  const App = {
    state: Store.load(),
    route: { section: "life", sub: "period" },
    detail: null,
    mainIndex: "SH",
    calMonth: new Date(),
    periodMonth: new Date(),
    series: {},
    marketStatus: "connecting",
    lastUpdate: null,
    globals: null,
    content: null, navList: null, crumbs: null, subtabs: null,
    overlay: null, sheet: null
  };
  window.App = App;

  /* ----------------------------- 导航 ----------------------------- */
  function renderNav() {
    App.navList.innerHTML = NAV.map((g) => {
      const hasSub = g.subs && g.subs.length;
      const isActive = App.route.section === g.id;
      const subHTML = hasSub ? `<div class="nav-sub"><div class="nav-sub-inner">${g.subs.map((s) => `
        <button class="nav-sub-item ${isActive && App.route.sub === s.id ? "active" : ""}" data-nav="${g.id}" data-sub="${s.id}">${s.label}</button>`).join("")}</div></div>` : "";
      const firstSub = hasSub ? `data-sub="${g.subs[0].id}"` : "";
      return `<div class="nav-group ${isActive ? "open" : ""}">
        <button class="nav-item ${isActive ? "active" : ""}" data-nav="${g.id}" ${firstSub}>
          <span class="ni-icon">${ICONS[g.id] || ""}</span>
          <span class="ni-label">${g.label}<span class="ni-en">${g.en}</span></span>
        </button>${subHTML}</div>`;
    }).join("");
  }

  function renderSubtabs() {
    const g = NAV.find((x) => x.id === App.route.section);
    if (!g || !g.subs || !g.subs.length) { App.subtabs.innerHTML = ""; return; }
    App.subtabs.innerHTML = g.subs.map((s) =>
      `<button class="subtab ${App.route.sub === s.id ? "active" : ""}" data-nav="${g.id}" data-sub="${s.id}">${s.label}</button>`).join("");
  }

  function updateCrumbs() {
    const g = NAV.find((x) => x.id === App.route.section);
    const sub = g && g.subs.find((s) => s.id === App.route.sub);
    App.crumbs.innerHTML = `<span class="cr-main">${g ? g.label : ""}</span>` +
      (sub ? `<span class="cr-sep">·</span><span class="cr-sub">${sub.label}</span>` : "");
  }

  function go(section, sub) {
    const g = NAV.find((x) => x.id === section);
    if (g && g.subs.length && (!sub || !g.subs.find((s) => s.id === sub))) sub = g.subs[0].id;
    App.route = { section, sub: sub || "" };
    App.detail = null;
    closeDrawer();
    renderNav(); renderSubtabs(); updateCrumbs();
    refreshContent();
  }

  function refreshContent() {
    App.content.innerHTML = Sections.render(App.route.section, App.route.sub);
    App.content.scrollTop = 0;
    requestAnimationFrame(() => drawAll(App.content));
  }

  /* ----------------------------- 图表绘制 ----------------------------- */
  function drawAll(container) {
    $$("canvas[data-chart]", container).forEach((c) => {
      const type = c.dataset.chart, code = c.dataset.code;
      if (type === "spark") {
        const d = App.series[code] || [];
        Charts.sparkline(c, d, d.length > 1 ? (d[d.length - 1] >= d[0] ? Charts.UP : Charts.DOWN) : Charts.MUTE);
      } else if (type === "line") {
        Charts.line(c, App.series[code] || [App.state.market.indices[0].price], parseFloat(c.dataset.base));
      } else if (type === "fire") {
        const f = Sections.computeFire();
        Charts.fireGrowth(c, f.series, f.fireTarget);
      }
    });
  }

  /* ----------------------------- 可编辑引擎 ----------------------------- */
  function commitEdit(el) {
    const path = el.dataset.path;
    if (!path) return;
    let val = el.textContent.replace(/\s+/g, " ").trim();
    if (el.classList.contains("num")) {
      let n = parseFloat(val.replace(/[^\d.\-]/g, ""));
      if (isNaN(n)) n = 0;
      val = n;
    }
    Store.setPath(App.state, path, val);
    Store.save(App.state);
    if (el.dataset.recalc === "fire") recomputeFire();
  }

  function recomputeFire() {
    if (App.route.section === "fire") refreshContent();
  }

  document.addEventListener("focusout", (e) => {
    const el = e.target.closest && e.target.closest(".editable");
    if (el) commitEdit(el);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.classList && e.target.classList.contains("editable") && e.key === "Enter") {
      e.preventDefault(); e.target.blur();
    }
  });

  /* ----------------------------- 弹层 / 抽屉 ----------------------------- */
  function openSheet(html, onMount) {
    App.sheet.innerHTML = html;
    App.overlay.hidden = false;
    if (onMount) onMount(App.sheet);
    const f = App.sheet.querySelector("input,textarea");
    if (f) setTimeout(() => f.focus(), 30);
  }
  function closeSheet() { App.overlay.hidden = true; App.sheet.innerHTML = ""; }

  function openConfirm(title, msg, onYes) {
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">${title}</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <p style="color:var(--ink-soft);font-size:14px;margin:0 0 22px;line-height:1.6">${msg}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn ghost" id="cfNo">取消</button>
        <button class="btn danger" id="cfYes">确认清空</button>
      </div>`, (sheet) => {
      sheet.querySelector("#cfNo").onclick = closeSheet;
      sheet.querySelector("#cfYes").onclick = () => { closeSheet(); onYes(); };
    });
  }

  function openLightbox(im) {
    const lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML = `
      <button class="lb-close" data-lb="close">×</button>
      ${im.src ? `<img src="${im.src}" alt="">` : `<div style="color:#eee;font-size:18px">（无图，可直接编辑下方注解）</div>`}
      <div class="lb-cap">
        <div class="field"><label>文字注解（可高度自由编辑）</label>
          <textarea class="textarea" id="lbCap">${esc(im.caption || "")}</textarea></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn sm ghost" id="lbDel">删除图片</button>
          <button class="btn sm primary" id="lbDone">完成</button>
        </div>
      </div>`;
    document.body.appendChild(lb);
    const cap = lb.querySelector("#lbCap");
    cap.addEventListener("input", () => { im.caption = cap.value; Store.save(App.state); });
    lb.querySelector("#lbDone").onclick = () => lb.remove();
    lb.querySelector("#lbDel").onclick = () => {
      const i = App.state.life.images.indexOf(im);
      if (i >= 0) App.state.life.images.splice(i, 1);
      Store.save(App.state); lb.remove(); refreshContent();
    };
    lb.querySelector('[data-lb="close"]').onclick = () => lb.remove();
    lb.onclick = (e) => { if (e.target === lb) lb.remove(); };
  }

  /* ----------------------------- 图片压缩 ----------------------------- */
  function fileToDataURL(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1280, scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ----------------------------- 交互分发 ----------------------------- */
  function handleAction(action, el, e) {
    const d = el.dataset;
    switch (action) {
      case "close-sheet": closeSheet(); break;
      case "nav-toggle": toggleDrawer(); break;
      case "cal-prev": case "cal-next": {
        const dir = action === "cal-prev" ? -1 : 1;
        const key = d.cal === "period" ? "periodMonth" : "calMonth";
        const m = new Date(App[key]); m.setMonth(m.getMonth() + dir); App[key] = m;
        refreshContent(); break;
      }
      case "open-calendar-day": openCalendarDay(d.date); break;
      case "add-image": addImage(); break;
      case "edit-image": {
        const im = App.state.life.images.find((x) => x.id === d.id);
        if (im) openLightbox(im); break;
      }
      case "add-anni": editAnni(null); break;
      case "edit-anni": editAnni(d.id); break;
      case "toggle-anni-mode": {
        const a = App.state.life.anniversaries.find((x) => x.id === d.id);
        if (a) { a.mode = a.mode === "count" ? "acc" : "count"; Store.save(App.state); refreshContent(); }
        break;
      }
      case "period-add": {
        App.state.life.period.events.push({ start: Store.todayStr(), end: "" });
        Store.save(App.state); refreshContent(); break;
      }
      case "period-remove": {
        App.state.life.period.events.splice(+d.i, 1);
        Store.save(App.state); refreshContent(); break;
      }
      case "set-main-index": App.mainIndex = d.code; refreshContent(); break;
      case "add-watch": editWatch(null); break;
      case "edit-watch": editWatch(d.code); break;
      case "rm-watch": {
        App.state.market.watch = App.state.market.watch.filter((x) => x.code !== d.code);
        Store.save(App.state); refreshContent(); break;
      }
      case "watch-detail": App.detail = { type: "stock", code: d.code }; refreshContent(); break;
      case "add-fund": editFund(null); break;
      case "edit-fund": editFund(d.code); break;
      case "rm-fund": {
        App.state.market.funds = App.state.market.funds.filter((x) => x.code !== d.code);
        Store.save(App.state); refreshContent(); break;
      }
      case "fund-detail": App.detail = { type: "fund", code: d.code }; refreshContent(); break;
      case "market-back": App.detail = null; refreshContent(); break;
      case "set-scenario": {
        App.state.fire.scenario = d.scn;
        const f = Sections.computeFire();
        const p = App.state.fire.scenarios[d.scn].params;
        App.state.fire.chartDesc = `假设年化 ${p.annualReturn}% 且每年定投 ${Sections.fmtMoney(p.monthlyInvest)}，资产将在 ${f.years} 年左右触及目标线。`;
        App.state.fire.descs.d3 = `约 ${f.years} 年后实现独立`;
        Store.save(App.state); refreshContent(); break;
      }
      case "add-milestone": editMilestone(null); break;
      case "toggle-milestone": {
        const m = App.state.fire.milestones[+d.i];
        if (m) { m.status = m.status === "done" ? "todo" : "done"; Store.save(App.state); refreshContent(); }
        break;
      }
      case "rm-milestone": {
        App.state.fire.milestones.splice(+d.i, 1); Store.save(App.state); refreshContent(); break;
      }
      case "settings-fire": toast("所有数字与标题均可点击直接编辑；右上角可切换情景。"); break;
      case "share-fire": {
        const f = Sections.computeFire();
        const txt = `【${App.state.fire.title}】\nFIRE 达成资产：${Sections.fmtMoney(f.fireTarget)}\n当前净资产：${Sections.fmtMoney(f.netWorth)}\n当前进度：${f.progress}%\n预计达成年龄：${f.reachAge} 岁`;
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast("已复制规划摘要"), () => toast("摘要已生成（剪贴板不可用）"));
        else toast("已生成规划摘要");
        break;
      }
      case "export-data": Store.exportData(App.state); break;
      case "import-data": $("#importFile").click(); break;
      case "clear-cache": openConfirm(
        "清空本地缓存？",
        "此操作将删除全部本地数据并恢复为初始示例数据，且不可撤销。",
        () => {
          try { localStorage.removeItem(Store.KEY); } catch (e) {}
          App.state = Store.defaultState();
          Store.save(App.state);
          App.series = {}; seedSeries(); App.globals = null; App.marketStatus = "connecting";
          closeSheet(); closeDrawer(); go(App.route.section, App.route.sub);
          updateLiveBadge(); toast("本地缓存已清空，已恢复示例数据");
        }); break;

      /* 云同步（Supabase） */
      case "open-sync": openSyncSheet(); break;
      case "sync-save-config": {
        const url = (App.sheet.querySelector("#syncUrl") || {}).value || "";
        const key = (App.sheet.querySelector("#syncKey") || {}).value || "";
        if (!url.trim() || !key.trim()) { toast("请填写 URL 与 anon key"); break; }
        (async () => { try { await Sync.configure(url, key); openSyncSheet(); }
          catch (e) { toast("连接失败：" + (e.message || e)); } })();
        break;
      }
      case "sync-signin": case "sync-signup": {
        const email = (App.sheet.querySelector("#syncEmail") || {}).value || "";
        const pass = (App.sheet.querySelector("#syncPass") || {}).value || "";
        if (!email.trim() || !pass.trim()) { toast("请填写邮箱与密码"); break; }
        (async () => {
          try {
            if (action === "sync-signup") await Sync.signUp(email, pass);
            else await Sync.signIn(email, pass);
            Sync.setAuto(true);
            await firstSyncAfterLogin();
            openSyncSheet();
          } catch (e) { toast("操作失败：" + (e.message || e)); }
        })();
        break;
      }
      case "sync-signout":
        (async () => { try { await Sync.signOut(); openSyncSheet(); } catch (e) { toast("退出失败：" + (e.message || e)); } })();
        break;
      case "sync-clear-config": Sync.clearConfig(); openSyncSheet(); break;
      case "sync-pull":
        (async () => {
          try {
            const r = await Sync.pull();
            if (r && r.payload) { applyRemote(r.payload); toast("已拉取云端数据"); }
            else toast("云端暂无数据，可先「推送本机」");
            openSyncSheet();
          } catch (e) { toast("拉取失败：" + (e.message || e)); }
        })();
        break;
      case "dismiss-install": {
        const b = $("#installBanner"); if (b) { b.hidden = true; try { localStorage.setItem("mindspace_banner_dismissed", "1"); } catch (e) {} }
        break;
      }
      case "copy-url": {
        const url = location.href;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => toast("链接已复制，请切换到 Chrome/Edge 粘贴打开"));
          } else {
            const ta = document.createElement("textarea"); ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); toast("链接已复制，请切换到 Chrome/Edge 粘贴打开");
          }
        } catch (e) { toast("复制失败，请手动复制地址栏链接到 Chrome/Edge 打开"); }
        break;
      }
      case "sync-push":
        (async () => {
          try { await Sync.push({ life: App.state.life, fire: App.state.fire }); Sync.touch(); openSyncSheet(); toast("已推送到云端"); }
          catch (e) { toast("推送失败：" + (e.message || e)); }
        })();
        break;
    }
  }

  // 全局点击
  document.addEventListener("click", (e) => {
    if (e.target.closest(".editable")) return;        // 让编辑自然发生
    const actEl = e.target.closest("[data-action]");
    if (!actEl) {
      const navEl = e.target.closest("[data-nav]");
      if (navEl) { go(navEl.dataset.nav, navEl.dataset.sub || null); }
      return;
    }
    const action = actEl.dataset.action;
    if (action === "nav-main") return;
    handleAction(action, actEl, e);
  });

  // 输入变更（日期 / 文本域）
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.action === "period-set") {
      const ev = App.state.life.period.events[+el.dataset.i];
      if (ev) { ev[el.dataset.f] = el.value; Store.save(App.state); refreshContent(); }
    }
    if (el.dataset && el.dataset.action === "period-note") {
      App.state.life.period.notes[Store.todayStr()] = el.value;
      Store.save(App.state);
    }
  });

  /* ----------------------------- 各弹层表单 ----------------------------- */
  function openCalendarDay(date) {
    const rec = App.state.life.calendar[date] || { text: "", tags: [], images: [] };
    let imgs = rec.images ? rec.images.slice() : [];
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">${date}</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <div class="field"><label>文字记录</label><textarea class="textarea" id="cdText">${esc(rec.text)}</textarea></div>
      <div class="field"><label>标签（逗号分隔）</label><input class="input" id="cdTags" value="${esc((rec.tags || []).join(", "))}"></div>
      <div class="field"><label>图片（点击或拖拽）</label>
        <div class="dropzone" id="cdDrop">点击选择 / 拖拽图片到此处</div>
        <input type="file" id="cdFile" accept="image/*" hidden>
        <div class="thumbs" id="cdThumbs"></div></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
        <button class="btn ghost" id="cdDel">删除该日记录</button>
        <button class="btn primary" id="cdSave">保存</button>
      </div>`, (sheet) => {
      const drop = sheet.querySelector("#cdDrop"), file = sheet.querySelector("#cdFile"), thumbs = sheet.querySelector("#cdThumbs");
      const renderThumbs = () => {
        thumbs.innerHTML = imgs.map((s, i) => `<div class="thumb"><img src="${s}"><button class="rm" data-i="${i}">×</button></div>`).join("");
        thumbs.querySelectorAll(".rm").forEach((b) => b.onclick = () => { imgs.splice(+b.dataset.i, 1); renderThumbs(); });
      };
      renderThumbs();
      drop.onclick = () => file.click();
      file.onchange = () => { if (file.files[0]) fileToDataURL(file.files[0], (u) => { imgs.push(u); renderThumbs(); }); };
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("drag"); };
      drop.ondragleave = () => drop.classList.remove("drag");
      drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("drag");
        Array.from(e.dataTransfer.files).forEach((f) => fileToDataURL(f, (u) => { imgs.push(u); renderThumbs(); })); };
      sheet.querySelector("#cdSave").onclick = () => {
        const text = sheet.querySelector("#cdText").value.trim();
        const tags = sheet.querySelector("#cdTags").value.split(",").map((s) => s.trim()).filter(Boolean);
        if (!text && !tags.length && !imgs.length) delete App.state.life.calendar[date];
        else App.state.life.calendar[date] = { text, tags, images: imgs };
        Store.save(App.state); closeSheet(); refreshContent();
      };
      sheet.querySelector("#cdDel").onclick = () => { delete App.state.life.calendar[date]; Store.save(App.state); closeSheet(); refreshContent(); };
    });
  }

  function addImage() {
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">添加图片</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <div class="field"><label>选择图片</label><div class="dropzone" id="aiDrop">点击选择 / 拖拽图片</div><input type="file" id="aiFile" accept="image/*" hidden></div>
      <div class="field"><label>文字注解</label><textarea class="textarea" id="aiCap" placeholder="为这张照片写下注解…"></textarea></div>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn primary" id="aiSave">添加到相册</button></div>`, (sheet) => {
      let src = "";
      const drop = sheet.querySelector("#aiDrop"), file = sheet.querySelector("#aiFile");
      drop.onclick = () => file.click();
      file.onchange = () => { if (file.files[0]) fileToDataURL(file.files[0], (u) => { src = u; drop.textContent = "已选择 1 张图片 ✓"; }); };
      sheet.querySelector("#aiSave").onclick = () => {
        if (!src) { toast("请先选择一张图片"); return; }
        App.state.life.images.unshift({ id: Store.uid("ph"), caption: sheet.querySelector("#aiCap").value, date: Store.todayStr(), src });
        Store.save(App.state); closeSheet(); refreshContent();
      };
    });
  }

  function editAnni(id) {
    const a = id ? App.state.life.anniversaries.find((x) => x.id === id) : null;
    const cur = a || { name: "", date: Store.todayStr(), repeat: true, mode: "acc" };
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">${id ? "编辑纪念日" : "新增纪念日"}</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <div class="field"><label>名称</label><input class="input" id="anName" value="${esc(cur.name)}"></div>
      <div class="field"><label>日期</label><input class="input" type="date" id="anDate" value="${cur.date}"></div>
      <div class="field"><label>展示模式</label>
        <div class="mode-toggle">
          <button class="${cur.mode === "count" ? "on" : ""}" data-m="count">倒计时</button>
          <button class="${cur.mode === "acc" ? "on" : ""}" data-m="acc">累计日</button>
        </div></div>
      <div class="field"><label><input type="checkbox" id="anRepeat" ${cur.repeat ? "checked" : ""}> 每年重复</label></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        ${id ? '<button class="btn ghost" id="anDel">删除</button>' : ""}
        <button class="btn primary" id="anSave">保存</button></div>`, (sheet) => {
      let mode = cur.mode;
      sheet.querySelectorAll(".mode-toggle button").forEach((b) => b.onclick = () => {
        mode = b.dataset.m;
        sheet.querySelectorAll(".mode-toggle button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      });
      sheet.querySelector("#anSave").onclick = () => {
        const data = { name: sheet.querySelector("#anName").value || "未命名", date: sheet.querySelector("#anDate").value, repeat: sheet.querySelector("#anRepeat").checked, mode };
        if (a) Object.assign(a, data);
        else App.state.life.anniversaries.push(Object.assign({ id: Store.uid("an") }, data));
        Store.save(App.state); closeSheet(); refreshContent();
      };
      if (id) sheet.querySelector("#anDel").onclick = () => {
        App.state.life.anniversaries = App.state.life.anniversaries.filter((x) => x.id !== id);
        Store.save(App.state); closeSheet(); refreshContent();
      };
    });
  }

  function editWatch(code) {
    const w = code ? App.state.market.watch.find((x) => x.code === code) : null;
    const cur = w || { code: "", name: "", price: 0, prevClose: 0, hold: 0, cost: 0 };
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">${code ? "编辑股票" : "添加自选股"}</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <div class="grid grid-2">
        <div class="field"><label>代码</label><input class="input" id="wCode" value="${esc(cur.code)}" ${code ? "readonly" : ""}></div>
        <div class="field"><label>名称</label><input class="input" id="wName" value="${esc(cur.name)}"></div>
        <div class="field"><label>当前价</label><input class="input" type="number" step="0.01" id="wPrice" value="${cur.price}"></div>
        <div class="field"><label>昨收</label><input class="input" type="number" step="0.01" id="wPrev" value="${cur.prevClose}"></div>
        <div class="field"><label>持仓（股）</label><input class="input" type="number" id="wHold" value="${cur.hold}"></div>
        <div class="field"><label>成本</label><input class="input" type="number" step="0.01" id="wCost" value="${cur.cost}"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        ${code ? '<button class="btn ghost" id="wDel">删除</button>' : ""}
        <button class="btn primary" id="wSave">保存</button></div>`, (sheet) => {
      sheet.querySelector("#wSave").onclick = () => {
        const data = {
          code: sheet.querySelector("#wCode").value.trim(),
          name: sheet.querySelector("#wName").value.trim() || "未命名",
          price: +sheet.querySelector("#wPrice").value || 0,
          prevClose: +sheet.querySelector("#wPrev").value || 0,
          hold: +sheet.querySelector("#wHold").value || 0,
          cost: +sheet.querySelector("#wCost").value || 0
        };
        if (!data.code) { toast("请填写股票代码"); return; }
        if (w) Object.assign(w, data);
        else { App.state.market.watch.push(data); seedOne(data.code, data.price); }
        Store.save(App.state); closeSheet(); refreshContent();
      };
      if (code) sheet.querySelector("#wDel").onclick = () => {
        App.state.market.watch = App.state.market.watch.filter((x) => x.code !== code);
        Store.save(App.state); closeSheet(); refreshContent();
      };
    });
  }

  function editFund(code) {
    const f = code ? App.state.market.funds.find((x) => x.code === code) : null;
    const cur = f || { code: "", name: "", nav: 0, prevNav: 0, estimate: 0 };
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">${code ? "编辑基金" : "添加基金"}</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <div class="grid grid-2">
        <div class="field"><label>代码</label><input class="input" id="fCode" value="${esc(cur.code)}" ${code ? "readonly" : ""}></div>
        <div class="field"><label>名称</label><input class="input" id="fName" value="${esc(cur.name)}"></div>
        <div class="field"><label>单位净值</label><input class="input" type="number" step="0.001" id="fNav" value="${cur.nav}"></div>
        <div class="field"><label>昨净值</label><input class="input" type="number" step="0.001" id="fPrev" value="${cur.prevNav}"></div>
        <div class="field"><label>估值动态(%)</label><input class="input" type="number" step="0.01" id="fEst" value="${cur.estimate}"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        ${code ? '<button class="btn ghost" id="fDel">删除</button>' : ""}
        <button class="btn primary" id="fSave">保存</button></div>`, (sheet) => {
      sheet.querySelector("#fSave").onclick = () => {
        const data = {
          code: sheet.querySelector("#fCode").value.trim(),
          name: sheet.querySelector("#fName").value.trim() || "未命名",
          nav: +sheet.querySelector("#fNav").value || 0,
          prevNav: +sheet.querySelector("#fPrev").value || 0,
          estimate: +sheet.querySelector("#fEst").value || 0
        };
        if (!data.code) { toast("请填写基金代码"); return; }
        if (f) Object.assign(f, data);
        else { App.state.market.funds.push(data); seedOne(data.code, data.nav); }
        Store.save(App.state); closeSheet(); refreshContent();
      };
      if (code) sheet.querySelector("#fDel").onclick = () => {
        App.state.market.funds = App.state.market.funds.filter((x) => x.code !== code);
        Store.save(App.state); closeSheet(); refreshContent();
      };
    });
  }

  function editMilestone(i) {
    const m = i != null ? App.state.fire.milestones[i] : null;
    const cur = m || { age: App.state.fire.scenarios[App.state.fire.scenario].params.age + 5, desc: "", status: "todo" };
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">${i != null ? "编辑里程碑" : "添加里程碑"}</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <div class="grid grid-2">
        <div class="field"><label>年龄</label><input class="input" type="number" id="mAge" value="${cur.age}"></div>
        <div class="field"><label>状态</label><select class="select" id="mStatus"><option value="todo" ${cur.status === "todo" ? "selected" : ""}>进行中</option><option value="done" ${cur.status === "done" ? "selected" : ""}>已达成</option></select></div>
      </div>
      <div class="field"><label>描述</label><input class="input" id="mDesc" value="${esc(cur.desc)}"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        ${i != null ? '<button class="btn ghost" id="mDel">删除</button>' : ""}
        <button class="btn primary" id="mSave">保存</button></div>`, (sheet) => {
      sheet.querySelector("#mSave").onclick = () => {
        const data = { age: +sheet.querySelector("#mAge").value || 0, desc: sheet.querySelector("#mDesc").value, status: sheet.querySelector("#mStatus").value };
        if (m) Object.assign(m, data);
        else App.state.fire.milestones.push(data);
        Store.save(App.state); closeSheet(); refreshContent();
      };
      if (i != null) sheet.querySelector("#mDel").onclick = () => {
        App.state.fire.milestones.splice(i, 1); Store.save(App.state); closeSheet(); refreshContent();
      };
    });
  }

  /* ----------------------------- 移动端抽屉 ----------------------------- */
  function toggleDrawer() { $("#nav").classList.toggle("open"); $("#navScrim").hidden = !$("#nav").classList.contains("open"); }
  function closeDrawer() { $("#nav").classList.remove("open"); $("#navScrim").hidden = true; }

  /* ----------------------------- 实时数据（真实接口 + 模拟兜底） ----------------------------- */
  function seedOne(code, base) {
    if (App.series[code] || !base) return;
    const arr = []; let v = base * 0.985;
    for (let i = 0; i < 40; i++) { v += (base - v) * 0.08 + base * 0.004 * (Math.random() - 0.5); arr.push(v); }
    arr[arr.length - 1] = base; App.series[code] = arr;
  }
  function seedSeries() {
    [...App.state.market.indices, ...App.state.market.watch, ...App.state.market.funds].forEach((x) =>
      seedOne(x.code, x.price || x.nav || 0));
  }

  // 本地模拟（仅在实时接口不可用时启用）
  function simulateTick() {
    const walk = (last) => last + last * 0.0016 * (Math.random() - 0.5) * 2;
    App.state.market.indices.forEach((x) => { const a = App.series[x.code]; if (!a) return; const n = walk(a[a.length - 1]); a.push(n); a.shift(); x.price = n; });
    App.state.market.watch.forEach((x) => { const a = App.series[x.code]; const n = walk(a ? a[a.length - 1] : x.price); if (a) { a.push(n); a.shift(); } x.price = n; });
    App.state.market.funds.forEach((x) => { const a = App.series[x.code]; const n = walk(a ? a[a.length - 1] : x.nav); if (a) { a.push(n); a.shift(); } x.nav = n; x.estimate = ((n - x.prevNav) / x.prevNav) * 100; });
    Store.save(App.state);
    if (App.route.section === "market" && !App.detail) refreshContent();
  }

  function updateLiveBadge() {
    const b = $("#liveBadge");
    if (!b) return;
    b.hidden = false;
    if (App.marketStatus === "live") {
      b.className = "live-badge live";
      const t = App.lastUpdate ? App.lastUpdate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
      b.innerHTML = '<span class="lb-dot"></span>实时 · ' + t;
    } else if (App.marketStatus === "fallback") {
      b.className = "live-badge fb";
      b.innerHTML = '<span class="lb-dot"></span>模拟数据';
    } else {
      b.className = "live-badge";
      b.innerHTML = '<span class="lb-dot"></span>连接中…';
    }
  }

  let liveTimer = null;
  function scheduleLive(ms) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(liveTick, ms);
  }
  async function liveTick() {
    try {
      const data = await Market.fetchAll(App.state.market);
      const anyLive = data.ok.indices || data.ok.watch || data.ok.funds || data.ok.globals;

      if (data.ok.indices) {
        const by = {}; data.indices.forEach((x) => (by[x.code] = x));
        App.state.market.indices.forEach((x) => {
          const d = by[x.code]; if (!d) return;
          x.price = d.price; x.prev = d.prev; if (d.volume) x.volume = d.volume;
          if (d.series && d.series.length) App.series[x.code] = d.series;
        });
      }
      if (data.ok.watch) {
        const by = {}; data.watch.forEach((x) => (by[x.code] = x));
        App.state.market.watch.forEach((x) => {
          const d = by[x.code]; if (!d) return;
          x.price = d.price; x.prevClose = d.prevClose; if (d.name && !x.name) x.name = d.name;
          if (d.series && d.series.length) App.series[x.code] = d.series;
        });
      }
      if (data.ok.funds) {
        const by = {}; data.funds.forEach((x) => (by[x.code] = x));
        App.state.market.funds.forEach((x) => {
          const d = by[x.code]; if (!d) return;
          x.nav = d.nav; x.prevNav = d.prevNav; x.estimate = d.estimate;
        });
      }
      if (data.ok.globals) App.globals = data.globals;

      App.marketStatus = anyLive ? "live" : "fallback";
      App.lastUpdate = data.ts;
      Store.save(App.state);
      if (App.route.section === "market" && !App.detail) refreshContent();
      updateLiveBadge();
      scheduleLive(anyLive ? 20000 : 3000);
    } catch (e) {
      console.warn("实时行情获取失败，启用本地模拟：", e);
      simulateTick();
      App.marketStatus = "fallback";
      updateLiveBadge();
      scheduleLive(3000);
    }
  }

  /* ----------------------------- 工具 ----------------------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  function bindImport() {
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          App.state = Store.migrate(data); Store.save(App.state);
          closeDrawer(); go(App.route.section, App.route.sub); toast("数据已导入");
        } catch (err) { toast("导入失败：文件格式不正确"); }
      };
      r.readAsText(f); e.target.value = "";
    });
  }

  /* ----------------------------- 云同步面板 ----------------------------- */
  function openSyncSheet() {
    const s = Sync.status();
    let body = "";
    if (!s.configured) {
      body = `
        <div class="field"><label>Supabase URL</label><input class="input" id="syncUrl" placeholder="https://xxxx.supabase.co"></div>
        <div class="field"><label>Anon Key（公开键，安全）</label><input class="input" id="syncKey" placeholder="eyJhbGci..."></div>
        <p class="section-desc">在 Supabase 控制台 Project Settings → API 获取。建表与开启邮箱登录见 SUPABASE_SETUP.md。</p>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn primary" data-action="sync-save-config">保存并连接</button></div>`;
    } else if (!s.loggedIn) {
      body = `
        <p class="section-desc">已连接：<code>${esc(s.url)}</code></p>
        <div class="field"><label>邮箱</label><input class="input" id="syncEmail" type="email" placeholder="you@example.com"></div>
        <div class="field"><label>密码（至少 6 位）</label><input class="input" id="syncPass" type="password" placeholder="••••••"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" data-action="sync-clear-config">清除配置</button>
          <button class="btn ghost" data-action="sync-signup">注册</button>
          <button class="btn primary" data-action="sync-signin">登录</button>
        </div>`;
    } else {
      const last = s.lastSync ? new Date(s.lastSync).toLocaleString("zh-CN") : "尚未同步";
      body = `
        <p class="section-desc">已登录：<b>${esc(s.user.email)}</b></p>
        <div class="field" style="display:flex;align-items:center;gap:10px">
          <label style="margin:0">自动同步（本地改动防抖推送到云端）</label>
          <label class="switch"><input type="checkbox" id="syncAuto" ${s.auto ? "checked" : ""}><span class="slider"></span></label>
        </div>
        <p class="section-desc">最近同步：${last}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" data-action="sync-signout">退出</button>
          <button class="btn ghost" data-action="sync-pull">拉取云端</button>
          <button class="btn primary" data-action="sync-push">推送本机</button>
        </div>`;
    }
    openSheet(`
      <div class="sheet-head"><div class="sheet-title">云同步（Supabase）</div><button class="sheet-close" data-action="close-sheet">×</button></div>
      <p class="section-desc">电脑与手机登录同一账号，即自动同步「生活记录」与「FIRE 规划」（行情各自实时拉取，不互传）。</p>
      ${body}`, (sheet) => {
      const auto = sheet.querySelector("#syncAuto");
      if (auto) auto.onchange = () => Sync.setAuto(auto.checked);
      const f = sheet.querySelector("#syncUrl, #syncEmail");
      if (f) setTimeout(() => f.focus(), 30);
    });
  }

  function applyRemote(payload) {
    if (!payload) return;
    if (payload.life) App.state.life = Object.assign(Store.defaultState().life, payload.life);
    if (payload.fire) App.state.fire = Object.assign(Store.defaultState().fire, payload.fire);
    Store.save(App.state);
    renderNav(); renderSubtabs(); updateCrumbs(); refreshContent();
  }
  async function firstSyncAfterLogin() {
    try {
      const r = await Sync.pull();
      if (r && r.payload) applyRemote(r.payload);
      else { await Sync.push({ life: App.state.life, fire: App.state.fire }); Sync.touch(); }
    } catch (e) { console.warn("首次同步失败（可稍后手动同步）：", e); }
  }
  function updateSyncBtn(s) {
    const b = $("#syncBtn"); if (!b) return;
    if (s.loggedIn) { b.textContent = "☁ 已同步"; b.classList.add("on"); }
    else { b.textContent = "☁ 同步"; b.classList.remove("on"); }
  }

  /* ----------------------------- PWA 安装提示 ----------------------------- */
  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.matchMedia("(display-mode: fullscreen)").matches ||
           window.matchMedia("(display-mode: minimal-ui)").matches ||
           navigator.standalone === true;
  }
  function isLikelyPwaInstallable() {
    const ua = navigator.userAgent || "";
    // Chrome / Edge / Samsung Internet 新版支持安装；国产系统浏览器一般不支持独立 PWA
    const can = /Chrome|Edg|SamsungBrowser/.test(ua);
    const cannot = /QQBrowser|LieBaoFast|UCBrowser|Quark|Baidu|Huawei|MiuiBrowser|Miui|OppoBrowser|VivoBrowser|HeyTapBrowser|WeChat|MicroMessenger/.test(ua);
    return can && !cannot;
  }
  function initInstallBanner() {
    if (isStandalone()) return;
    try { if (localStorage.getItem("mindspace_banner_dismissed") === "1") return; } catch (e) {}
    // 在明显不支持 PWA 的系统浏览器里才显示强提示
    if (isLikelyPwaInstallable()) return;
    const b = $("#installBanner"); if (b) b.hidden = false;
  }

  /* ----------------------------- 启动 ----------------------------- */
  function init() {
    App.content = $("#content"); App.navList = $("#navList"); App.crumbs = $("#crumbs");
    App.subtabs = $("#subtabs"); App.overlay = $("#overlay"); App.sheet = $("#sheet");
    renderNav(); renderSubtabs(); updateCrumbs();
    refreshContent();
    bindImport();
    initInstallBanner();
    // 云同步：本地保存后自动推送个人数据（life + fire）
    if (global.Sync) {
      Store.setOnSave((state) => Sync.schedulePush(() => ({ life: state.life, fire: state.fire })));
      Sync.on(updateSyncBtn);
      updateSyncBtn(Sync.status());
    }
    $("#menuBtn").addEventListener("click", toggleDrawer);
    $("#navScrim").addEventListener("click", closeDrawer);
    $("#overlay").addEventListener("click", (e) => { if (e.target === App.overlay) closeSheet(); });
    window.addEventListener("resize", () => drawAll(App.content));
    seedSeries();
    updateLiveBadge();
    scheduleLive(1500);
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
