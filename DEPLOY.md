# MindSpace 部署指南（GitHub Pages / Vercel）

本目录是**纯静态站点**（HTML/CSS/JS），无需构建步骤，所有资源引用均为**相对路径**，
因此可同时兼容：
- GitHub Pages 项目站点子路径（`https://用户名.github.io/仓库名/`）
- Vercel 根路径（`https://项目名.vercel.app`）

> 数据说明：所有用户数据存在访问设备浏览器的 `localStorage`（图片内联存储），
> 部署本身不含任何后端。换设备请用 App 内「导出数据 / 导入」迁移。

---

## 方式一：GitHub Pages（永久链接形如 `https://<用户名>.github.io/<仓库名>/`）

### 方法 A — 分支直接发布（最简单）
1. 在 GitHub 新建一个仓库（如 `mindspace`），**不要**初始化 README。
2. 在本目录执行：
   ```bash
   git init
   git add -A
   git commit -m "MindSpace initial"
   git branch -M main
   git remote add origin https://github.com/<用户名>/<仓库名>.git
   git push -u origin main
   ```
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择
   **Deploy from a branch**，Branch 选 `main`、目录选 `/ (root)`，保存。
4. 几分钟后访问 `https://<用户名>.github.io/<仓库名>/` 即为永久链接。

### 方法 B — GitHub Actions 自动发布（推荐，已附带工作流）
1. 同上把代码推送到 `main` 分支（本目录已含 `.github/workflows/pages.yml`）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择
   **GitHub Actions**。
3. 推送即自动部署，链接同上。

> 仓库根目录的 `.nojekyll` 已包含，可避免 GitHub 用 Jekyll 处理导致文件被忽略。

---

## 方式二：Vercel（永久链接形如 `https://<项目名>.vercel.app`）

### 方法 A — 网页拖拽（最快，无需 Git）
1. 打开 https://vercel.com/new ，选择 **Deploy**，把本目录直接拖入。
2. Framework Preset 选 **Other**，无需构建命令，直接 Deploy。
3. 生成 `https://<项目名>.vercel.app` 即永久链接，可绑定自定义域名。

### 方法 B — 关联 Git 仓库
1. 先按「方式一」把仓库推到 GitHub。
2. Vercel 控制台 **Add New → Project**，导入该 GitHub 仓库。
3. Framework 选 **Other**，Build Command 留空，Output Directory 填 `.`（本目录已含 `vercel.json` 声明纯静态）。
4. Deploy 完成即得链接。

---

## 手机装成 App（生成桌面图标）
- **Android Chrome / Edge**：打开上面的永久链接 → ⋮ →「安装应用」（或「添加到主屏幕」）。
- **iOS Safari**：打开链接 → 底部「分享」→「添加到主屏幕」。
- PWA 安装依赖 **HTTPS**，上述两种平台均满足；左边栏在手机端自动变为抽屉式汉堡菜单。

## 行情数据
大盘/自选股来自 Yahoo Finance 公开接口，基金来自同花顺 JSONP，均为浏览器直连。
若接口临时不可用，界面会自动降级为「模拟数据」，不会报错。
