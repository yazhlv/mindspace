/* =========================================================================
   MindSpace — 轻量 Canvas 图表（无外部依赖，离线可用）
   ========================================================================= */
(function (global) {
  "use strict";

  const UP = "#C25B4E", DOWN = "#4E8169", ACCENT = "#BE8A6A", MUTE = "#A39A90";

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 300;
    const h = rect.height || canvas.clientHeight || 120;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function colorFor(data) {
    if (!data || data.length < 2) return MUTE;
    return data[data.length - 1] >= data[0] ? UP : DOWN;
  }

  // 迷你走势（卡片内）
  function sparkline(canvas, data, color) {
    const { ctx, w, h } = setup(canvas);
    if (!data || data.length < 2) return;
    const min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    const pad = 4, span = (max - min) || 1;
    const x = (i) => pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = color || colorFor(data);
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // 蜡烛图（大盘实时）
  function candle(canvas, candles) {
    const { ctx, w, h } = setup(canvas);
    if (!candles || !candles.length) return;
    const padT = 10, padB = 16, padX = 8;
    let min = Infinity, max = -Infinity;
    candles.forEach((c) => { min = Math.min(min, c.l); max = Math.max(max, c.h); });
    const span = (max - min) || 1;
    const x = (i) => padX + (i + 0.5) * ((w - padX * 2) / candles.length);
    const y = (v) => padT + ((max - v) / span) * (h - padT - padB);
    const bw = Math.max(2, ((w - padX * 2) / candles.length) * 0.6);
    candles.forEach((c, i) => {
      const up = c.c >= c.o;
      const col = up ? UP : DOWN;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      // 影线
      ctx.beginPath();
      ctx.moveTo(x(i), y(c.h));
      ctx.lineTo(x(i), y(c.l));
      ctx.lineWidth = 1;
      ctx.stroke();
      // 实体
      const yo = y(c.o), yc = y(c.c);
      const top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(x(i) - bw / 2, top, bw, bh);
    });
  }

  // 分时 / 折线（带基准线）
  function line(canvas, data, base) {
    const { ctx, w, h } = setup(canvas);
    if (!data || data.length < 2) return;
    const min = Math.min.apply(null, data.concat([base || Infinity]));
    const max = Math.max.apply(null, data.concat([base || -Infinity]));
    const span = (max - min) || 1;
    const padT = 12, padB = 14, padX = 10;
    const x = (i) => padX + (i / (data.length - 1)) * (w - padX * 2);
    const y = (v) => padT + ((max - v) / span) * (h - padT - padB);
    // 基准线
    if (base != null) {
      ctx.strokeStyle = "#E2D6C8";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padX, y(base)); ctx.lineTo(w - padX, y(base)); ctx.stroke();
      ctx.setLineDash([]);
    }
    const col = colorFor(data);
    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    // 填充
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, hexA(col, 0.18));
    grad.addColorStop(1, hexA(col, 0));
    ctx.lineTo(x(data.length - 1), h - padB);
    ctx.lineTo(x(0), h - padB);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
  }

  // FIRE 资产增长面积图（含目标线）
  function fireGrowth(canvas, series, target) {
    const { ctx, w, h } = setup(canvas);
    if (!series || series.length < 2) return;
    const max = Math.max.apply(null, series.concat([target || 0]));
    const min = 0;
    const span = (max - min) || 1;
    const padT = 14, padB = 18, padX = 12;
    const x = (i) => padX + (i / (series.length - 1)) * (w - padX * 2);
    const y = (v) => padT + ((max - v) / span) * (h - padT - padB);
    // 目标线
    if (target != null) {
      ctx.strokeStyle = ACCENT; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(padX, y(target)); ctx.lineTo(w - padX, y(target)); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    series.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.stroke();
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, "rgba(190,138,106,0.22)");
    grad.addColorStop(1, "rgba(190,138,106,0)");
    ctx.lineTo(x(series.length - 1), h - padB);
    ctx.lineTo(x(0), h - padB);
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  global.Charts = { sparkline, candle, line, fireGrowth, UP, DOWN, ACCENT, MUTE };
})(window);
