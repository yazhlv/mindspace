/* =========================================================================
   MindSpace — 真实行情数据层
   指数 / 自选股：Yahoo Finance 公开接口（浏览器直连，支持 CORS）
   基金估值：同花顺 fundgz JSONP（跨域脚本，免 CORS）
   任何环节失败均优雅降级，由上层回落到本地模拟。
   ========================================================================= */
(function (global) {
  "use strict";

  // 指数：内部短码 -> Yahoo Finance 符号
  const INDEX_MAP = {
    SH: "000001.SS", SZ: "399001.SZ", CYB: "399006.SZ",
    HSI: "^HSI", IXIC: "^IXIC", SPX: "^GSPC"
  };
  // 全球市场概览：Yahoo 符号 -> 中文名
  const GLOBE_MAP = {
    "^DJI": "道琼斯", "^GSPC": "标普500", "^IXIC": "纳斯达克",
    "^N225": "日经225", "^GDAXI": "德国DAX",
    "GC=F": "黄金", "CL=F": "原油", "DX-Y.NYB": "美元指数"
  };

  // 6 位 A 股代码 -> 交易所后缀；其余（美股 / 指数）原样使用
  function toYahoo(code) {
    if (/^\d{6}$/.test(code)) return code[0] === "6" ? code + ".SS" : code + ".SZ";
    return code;
  }

  async function yf(symbol, range, interval) {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) + "?range=" + range + "&interval=" + interval +
      "&includePrePost=false";
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) throw new Error("yf " + r.status + " " + symbol);
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) throw new Error("yf empty " + symbol);
    const meta = res.meta || {};
    const quotes = res.indicators && res.indicators.quote && res.indicators.quote[0];
    const closes = (quotes && quotes.close) || [];
    const times = res.timestamp || [];
    let pts = times.map((t, i) => closes[i]).filter((c) => c != null);
    if (pts.length < 6 && res.indicators && res.indicators.adjclose) {
      const adj = (res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose) || [];
      const f = adj.filter((c) => c != null);
      if (f.length) pts = f;
    }
    const price = (meta.regularMarketPrice != null) ? meta.regularMarketPrice : meta.previousClose;
    const prev = (meta.chartPreviousClose != null) ? meta.chartPreviousClose : meta.previousClose;
    return {
      price: price, prev: prev, volume: meta.regularMarketVolume,
      currency: meta.currency, name: meta.shortName || meta.symbol, series: pts
    };
  }

  // 简单并发限流，避免触发行情源限流
  async function pLimit(tasks, n) {
    const out = new Array(tasks.length);
    let i = 0;
    async function worker() {
      while (i < tasks.length) {
        const idx = i++;
        try { out[idx] = await tasks[idx].fn(); }
        catch (e) { out[idx] = { __err: e }; }
      }
    }
    const ws = [];
    const cnt = Math.min(n, tasks.length);
    for (let k = 0; k < cnt; k++) ws.push(worker());
    await Promise.all(ws);
    return out;
  }

  /* ------------------- 基金：同花顺 JSONP ------------------- */
  const fundPending = {};
  function onFundJSONP(data) {
    const code = data && data.fundcode;
    const p = code && fundPending[code];
    if (!p) return;
    try { const sc = document.querySelector('script[data-fund="' + code + '"]'); if (sc) sc.remove(); } catch (e) {}
    delete fundPending[code];
    p.resolve(data);
  }
  global.jsonpgz = onFundJSONP;

  function fetchFund(code) {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { delete fundPending[code]; reject(new Error("fund timeout")); }, 9000);
      fundPending[code] = {
        resolve: (d) => { clearTimeout(to); resolve(d); },
        reject: (e) => { clearTimeout(to); reject(e); }
      };
      const s = document.createElement("script");
      s.dataset.fund = code;
      s.onerror = () => { clearTimeout(to); delete fundPending[code]; reject(new Error("fund load fail")); };
      s.src = "https://fundgz.10jqka.com.cn/js/" + encodeURIComponent(code) + "/";
      document.body.appendChild(s);
    });
  }
  function applyFund(d) {
    const dwjz = parseFloat(d.dwjz) || 0;   // 昨净值
    const gsz = parseFloat(d.gsz) || 0;     // 估算净值
    const gszzl = parseFloat(d.gszzl) || 0; // 估算涨跌 %
    const nav = gsz || dwjz;
    const prevNav = dwjz || (nav / (1 + gszzl / 100)) || 0;
    return { code: d.fundcode, name: d.name || "", nav: nav, prevNav: prevNav, estimate: gszzl, gztime: d.gztime };
  }

  /* ------------------- 统一拉取 ------------------- */
  async function fetchAll(market) {
    const ts = new Date();
    const result = { ts: ts, ok: {}, indices: [], watch: [], funds: [], globals: [] };

    // 指数
    const idxTasks = (market.indices || []).map((idx) => ({
      fn: async () => {
        const d = await yf(INDEX_MAP[idx.code] || toYahoo(idx.code), "1d", "5m");
        return { code: idx.code, name: idx.name, price: d.price, prev: d.prev, series: d.series, volume: d.volume };
      }
    }));
    const idxRes = await pLimit(idxTasks, 4);
    result.indices = idxRes.filter((x) => x && !x.__err);
    result.ok.indices = result.indices.length > 0;

    // 全球市场
    const gTasks = Object.keys(GLOBE_MAP).map((sym) => ({
      fn: async () => {
        const d = await yf(sym, "1d", "5m");
        return { name: GLOBE_MAP[sym], value: d.price, chg: d.prev ? (d.price - d.prev) / d.prev * 100 : 0 };
      }
    }));
    const gRes = await pLimit(gTasks, 4);
    result.globals = gRes.filter((x) => x && !x.__err);
    result.ok.globals = result.globals.length > 0;

    // 自选股
    if (market.watch && market.watch.length) {
      const wTasks = market.watch.map((w) => ({
        fn: async () => {
          const d = await yf(toYahoo(w.code), "1d", "5m");
          return { code: w.code, price: d.price, prevClose: d.prev, series: d.series, name: d.name || w.name };
        }
      }));
      const wRes = await pLimit(wTasks, 3);
      result.watch = wRes.filter((x) => x && !x.__err);
      result.ok.watch = result.watch.length > 0;
    } else result.ok.watch = true;

    // 基金
    if (market.funds && market.funds.length) {
      const fTasks = market.funds.map((f) => ({
        fn: async () => { const d = await fetchFund(f.code); return applyFund(d); }
      }));
      const fRes = await pLimit(fTasks, 2);
      result.funds = fRes.filter((x) => x && !x.__err);
      result.ok.funds = result.funds.length > 0;
    } else result.ok.funds = true;

    return result;
  }

  global.Market = { fetchAll };
})(window);
