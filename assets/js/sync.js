/* =========================================================================
   MindSpace — 云同步（Supabase）
   设计：
   - 配置（URL + anon key）与登录态存于 localStorage，不写进代码。
   - 仅同步个人数据 life + fire；行情每端各自实时拉取，避免互相覆盖。
   - Supabase JS 通过 CDN 动态加载，无需任何构建步骤。
   - 任意环节失败均优雅降级：同步不可用不影响本地使用。
   ========================================================================= */
(function (global) {
  "use strict";

  const LS_KEY = "mindspace.sync.v1";
  const SB_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
  const TABLE = "mindspace_sync";

  let cfg = load();
  let client = null;
  let listeners = [];
  let pushTimer = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  async function ensureClient() {
    if (client) return client;
    if (!cfg.url || !cfg.anonKey) return null;
    if (!global.__sbClient) {
      const mod = await import(/* @vite-ignore */ SB_CDN);
      global.__sbClient = mod.createClient(cfg.url, cfg.anonKey);
    }
    client = global.__sbClient;
    return client;
  }

  function status() {
    return {
      configured: !!(cfg.url && cfg.anonKey),
      loggedIn: !!cfg.user,
      user: cfg.user || null,
      auto: !!cfg.auto,
      lastSync: cfg.lastSync || null,
      url: cfg.url || ""
    };
  }
  function emit() { listeners.forEach((cb) => { try { cb(status()); } catch (e) {} }); }
  function on(cb) { listeners.push(cb); }

  async function configure(url, anonKey) {
    cfg.url = (url || "").trim();
    cfg.anonKey = (anonKey || "").trim();
    persist();
    client = null;
    return !!(await ensureClient());
  }
  function clearConfig() {
    cfg.url = ""; cfg.anonKey = ""; cfg.user = null; cfg.auto = false; cfg.lastSync = null;
    persist(); client = null; emit();
  }

  async function signUp(email, password) {
    const c = await ensureClient();
    if (!c) throw new Error("尚未配置 Supabase");
    const { data, error } = await c.auth.signUp({ email, password });
    if (error) throw error;
    cfg.user = data.user ? { id: data.user.id, email: data.user.email } : null;
    persist(); emit();
    return data;
  }
  async function signIn(email, password) {
    const c = await ensureClient();
    if (!c) throw new Error("尚未配置 Supabase");
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    cfg.user = { id: data.user.id, email: data.user.email };
    persist(); emit();
    return data;
  }
  async function signOut() {
    const c = await ensureClient();
    if (c) { try { await c.auth.signOut(); } catch (e) {} }
    cfg.user = null; persist(); emit();
  }

  // 拉取：返回 { payload, updatedAt } 或 null
  async function pull() {
    const c = await ensureClient();
    if (!c || !cfg.user) throw new Error("未登录");
    const { data, error } = await c
      .from(TABLE)
      .select("payload, updated_at")
      .eq("user_id", cfg.user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? { payload: data.payload, updatedAt: data.updated_at } : null;
  }
  // 推送：按 user_id 幂等 upsert
  async function push(payload) {
    const c = await ensureClient();
    if (!c || !cfg.user) throw new Error("未登录");
    const { error } = await c
      .from(TABLE)
      .upsert({ user_id: cfg.user.id, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
  }

  // 自动同步：本地保存后防抖推送（仅 life + fire）
  function schedulePush(getPayload) {
    const s = status();
    if (!s.configured || !s.loggedIn || !s.auto) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        await push(getPayload());
        cfg.lastSync = new Date().toISOString();
        persist(); emit();
      } catch (e) {
        console.warn("自动同步失败（将下次重试）：", e);
      }
    }, 1200);
  }

  function setAuto(v) { cfg.auto = !!v; persist(); emit(); }
  function touch() { cfg.lastSync = new Date().toISOString(); persist(); emit(); }

  global.Sync = {
    configure, clearConfig, signUp, signIn, signOut,
    pull, push, schedulePush, setAuto, touch, on, status,
    isConfigured: () => !!(cfg.url && cfg.anonKey),
    isLoggedIn: () => !!cfg.user
  };
})(window);
