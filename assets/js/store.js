/* =========================================================================
   MindSpace — 状态存储
   本地优先：所有数据存于 localStorage；图片经压缩后以 dataURL 存储。
   ========================================================================= */
(function (global) {
  "use strict";

  const KEY = "mindspace.state.v1";

  function uid(p) {
    return (p || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function defaultState() {
    const t = todayStr();
    const fy = (function () {
      let a = 500000, y = 0;
      while (a < 3000000 && y < 80) { a = a * 1.07 + 117000; y++; }
      return y;
    })();
    return {
      life: {
        period: {
          events: [{ start: t, end: "" }],
          notes: {}
        },
        calendar: {},
        images: [
          { id: uid("ph"), caption: "点击图片可自由编辑这段注解文字。", date: t, src: "" }
        ],
        anniversaries: [
          { id: uid("an"), name: "相识纪念日", date: "2022-03-14", repeat: true, mode: "acc" },
          { id: uid("an"), name: "下次旅行", date: shiftDays(t, 120), repeat: false, mode: "count" }
        ]
      },
      fire: {
        title: "个人财务自由 FIRE 规划模拟器",
        scenario: "default",
        scenarios: {
          default: {
            label: "默认情景",
            params: {
              age: 30, initAnnualSpend: 120000,
              annualIncome: 260000, savingsRate: 45, annualReturn: 7,
              inflation: 3, monthlyInvest: 9750
            }
          },
          conservative: {
            label: "保守情景",
            params: {
              age: 30, initAnnualSpend: 120000,
              annualIncome: 260000, savingsRate: 35, annualReturn: 4.5,
              inflation: 3, monthlyInvest: 7600
            }
          }
        },
        // 净资产 = 储蓄明细 + 投资明细 的合计
        savings: [
          { id: uid("sv"), date: "2024-01-10", amount: 200000, note: "工资储蓄" },
          { id: uid("sv"), date: "2025-03-15", amount: 120000, note: "年终奖" },
          { id: uid("sv"), date: "2026-02-20", amount: 80000, note: "副业收入" }
        ],
        investments: [
          { id: uid("iv"), date: "2024-06-01", amount: 60000, note: "指数基金定投" },
          { id: uid("iv"), date: "2025-09-10", amount: 40000, note: "黄金" }
        ],
        milestones: [
          { age: 35, desc: "净资产突破 100 万", status: "done" },
          { age: 40, desc: "可覆盖 50% 年支出", status: "todo" },
          { age: 45, desc: "FIRE 达成资产过半", status: "todo" },
          { age: 52, desc: "实现财务独立", status: "todo" }
        ],
        assumptions: [
          { key: "return", label: "年化收益", val: "7", unit: "%", desc: "股债组合的保守长期回报" },
          { key: "bonus", label: "年年终奖", val: "2", unit: "月", desc: "约 2 个月薪资的年终奖励" },
          { key: "savings", label: "存储率", val: "45", unit: "%", desc: "税后收入中用于投资的比例" },
          { key: "inflation", label: "通胀率", val: "3", unit: "%", desc: "长期消费品价格年涨幅假设" }
        ],
        titles: { k1: "FIRE 达成资产", k2: "当前进度", k3: "预计达成年龄", k4: "净资产合计" },
        descs: {
          d1: "按 4% 法则，覆盖年支出所需本金",
          d2: "净资产 ÷ 目标资产",
          d3: "约 " + fy + " 年后实现独立",
          d4: "储蓄 + 投资 明细实时合计"
        },
        chartDesc: "假设年化 7% 且每年定投 ¥97,500，资产将在 " + fy + " 年左右触及目标线。"
      },
      market: {
        indices: [
          { code: "SH", name: "上证指数", price: 3210.45, prev: 3198.20 },
          { code: "SZ", name: "深证成指", price: 10145.6, prev: 10210.3 },
          { code: "CYB", name: "创业板指", price: 2034.8, prev: 2011.5 },
          { code: "HSI", name: "恒生指数", price: 17820.4, prev: 17910.2 },
          { code: "IXIC", name: "纳斯达克", price: 15820.3, prev: 15740.9 },
          { code: "SPX", name: "标普500", price: 4980.1, prev: 4960.4 }
        ],
        watch: [
          { code: "600519", name: "贵州茅台", price: 1685.0, prevClose: 1702.5, hold: 100, cost: 1600 },
          { code: "000858", name: "五粮液", price: 142.3, prevClose: 139.8, hold: 0, cost: 0 },
          { code: "300750", name: "宁德时代", price: 188.6, prevClose: 192.1, hold: 200, cost: 210 }
        ],
        funds: [
          { code: "110011", name: "易方达中小盘", nav: 9.842, prevNav: 9.910, estimate: -0.68 },
          { code: "161725", name: "招商中证白酒", nav: 1.043, prevNav: 1.058, estimate: -1.42 },
          { code: "005827", name: "易方达蓝筹精选", nav: 2.311, prevNav: 2.298, estimate: 0.56 }
        ]
      }
    };
  }

  function shiftDays(str, n) {
    const d = new Date(str + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      console.warn("状态读取失败，使用默认数据", e);
      return defaultState();
    }
  }

  function migrate(s) {
    const d = defaultState();
    // 浅合并，保证新增字段存在
    return Object.assign(d, s, {
      life: Object.assign(d.life, s.life || {}),
      fire: Object.assign(d.fire, s.fire || {}),
      market: Object.assign(d.market, s.market || {})
    });
  }

  let onSaveCb = null;
  function setOnSave(cb) { onSaveCb = cb; }
  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("保存失败（可能超出本地存储配额）", e);
      return false;
    }
    if (onSaveCb) { try { onSaveCb(state); } catch (e) {} }
    return true;
  }

  // 路径读写： "fire.params.age"
  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
  }

  function exportData(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindspace-backup-" + todayStr() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.Store = {
    KEY, uid, todayStr, defaultState, load, save, migrate, getPath, setPath, setOnSave,
    exportData, deepClone
  };
})(window);
