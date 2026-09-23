# 词根侦探 · RootDetective V1

通过**词根词缀拆解**来背英语单词的网页应用。把长单词拆成「词根 + 前缀 + 后缀」，
配合中文释义、例句与词源故事，让记忆有迹可循，而不是死记硬背。

> 当前版本：词库约 **3192 词 / 6 个主题世界 / 69 个核心词素**，内容经过质量闸门校验。
> 界面已适配手机端（底部导航 + 竖排卡片），并内置错词本与听写模式。

---

## 功能特性

- **词根拆解学习**：每个单词给出 `parts`（前缀 / 词根 / 后缀）拆分与逐段含义。
- **主题世界**：单词按主题世界组织，循序渐进。
- **错词本**：练习中答错的词自动进入错词本，可针对性复习（`data.ts` 中的 `mistakeWordIds`）。
- **听写模式**：隐藏拼写，凭发音 / 释义回想，强化输出记忆。
- **手机端适配**：底部导航栏 + 竖排卡片布局，移动端体验完整。
- **多端同步（脚手架）**：内置基于 Supabase 的远端适配器，可按需开启跨设备进度同步。
- **内容质量闸门**：`scripts/validate-content.mjs` 对切分、释义、例句做规则校验，保证词库干净。

---

## 技术栈

- **构建**：[Vite](https://vite.dev/) 8
- **框架**：[React](https://react.dev/) 19 + TypeScript 7
- **测试**：[Vitest](https://vitest.dev/) 5
- **运行时要求**：Node `^22.12.0 || ^24.0.0 || >=26.0.0`

---

## 本地运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build

# 预览构建产物
npm run preview

# 运行测试
npm test

# 校验词库内容质量闸门
npm run validate:content
```

---

## 部署（IIS + ASPX）

本项目是**前后端一体**的站点：前端是 Vite 构建的静态文件，后端是 `Dict.aspx` 这个极简词典接口（查不在词根库里的词）。两者都放在同一个 `dist/` 目录里，由 **IIS** 统一托管——`npm` 只负责构建，运行时全靠 IIS。

### 构建并打包

```bash
npm run deploy
```

`scripts/deploy-iis.mjs` 会：① 清理 `dist/` 里旧的前端产物；② `npm run build` 重新构建；③ 把 `Dict.aspx` / `Dict.aspx.cs` / `Web.config` 覆盖进 `dist/`；④ 首次才复制 `bin/`、`App_Data/`（dll 被 IIS 锁定、db 较大，已存在就跳过）。

### IIS 配置

- 网站**物理路径 = 本项目根目录下的 `dist/`**（不是项目根目录）。
- 默认文档设为 `index.html`。
- `Dict.aspx` 由 IIS 即时编译，**无需**先 build；数据库 `dist/App_Data/dict.db`（SQLite，约 59MB）随站点一起部署即可。

### 两层职责

| 层 | 技术 | 作用 | 是否必需 |
| --- | --- | --- | --- |
| 前端 | React + Vite（静态文件） | 拼词、复习、错词本等全部学习功能，词库打包进 JS | 必需 |
| 后端 | `Dict.aspx`（ASP.NET，读 SQLite） | 兜底词典：查词根库里没有的词，返回音标 + 释义 | 仅「搜陌生词」需要 |

### 为什么本地只用 NPM 也能跑

`npm run dev` 起的是 Vite 开发服务器（默认 5173 端口），**不含 ASPX**。此时核心学习功能完全正常；只有「搜索一个库里没有的生词」会调 `/Dict.aspx`，dev 环境下该接口不存在，代码会静默降级为「没找到」，不影响主流程。要本地也验证兜底词典，需在本机装 IIS 并把 `dist/` 挂成站点。

> 上传服务器时记得整个 `dist/` 一起传，`App_Data/dict.db` 约 59MB 别漏；以后若换了 `dict.db` 词库，要手动把它拷进 `dist/App_Data/`（发布脚本对 `bin/`、`App_Data/` 是「已存在就跳过」）。

### Python 版兜底词典（可选，与 ASP.NET 并存）

如果不想依赖 IIS / .NET，仓库根目录另有 `server.py`——纯标准库实现、零第三方依赖，接口与 `Dict.aspx` **完全对等**（同路径 `/Dict.aspx`、同 JSON 结构），可直接替代 IIS 托管整套站点：

```bash
pip install  # 无需，仅用标准库
PORT=8000 python server.py      # http://0.0.0.0:8000
```

- 它既提供 `/Dict.aspx` 词典接口（读 `dist/App_Data/dict.db`），也顺带托管 `dist/` 下的前端静态文件。
- **并存方式**：IIS 占 80、Python 占 8000；前端调哪个端口的 `/Dict.aspx` 就走哪套后端，无需改任何前端代码。本地想验证 Python 版兜底词典时，把前端接到 8000 即可。
- 受限环境若 `0.0.0.0` 绑定被拒，可 `HOST=127.0.0.1 PORT=8765 python server.py`。

---

## 目录结构

```
src/
  domain/        领域模型与内容（data.ts 由脚本生成，含词库与错词本）
  data/          本地存储 / 设置 / 云端同步适配器
  components/    UI 组件
scripts/         内容生成与校验管线（构建词根、选词、拆词素、例句、组装、闸门）
tests/           单元测试（Vitest）
docs/            设计文档与素材
```

---

## 词库与内容生成

词库由 `scripts/` 下的管线生成：构建词根表 → 选词 → 词素拆分 → 生成释义/例句 →
组装进 `src/domain/data.ts` → 跑质量闸门。重新生成可参考：

```bash
npm run content:all
```

当前已提交词库为经过闸门校验的干净版本（约 3192 词）。

---

## 多端同步（Supabase，可选）

默认仅本地存储。如需开启跨设备同步，在项目根目录创建 `.env`：

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

远端需有一张 `profiles` 表（Postgres）：

```sql
create table profiles (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

> 同步为纯 `fetch` 实现的轻量脚手架：未配置上述环境变量时自动降级为本地模式，
> 不引入额外依赖。开启 RLS 时，请为 anon key 配置允许按 `id` upsert / select 的策略。

---

## License

见仓库 [`LICENSE`](./LICENSE) 文件。
