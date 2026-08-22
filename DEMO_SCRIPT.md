# AgriGuard 评委演示脚本

> 适用场景：GNSS 4 for Space Applications in Africa (G4-SAA) 现场/线上评审
> 全程约 6–8 分钟 + 问答。每个环节含【操作】和【讲解要点】（英文为可直接使用的口述句）。

---

## 0. 演示前检查清单（提前 5 分钟完成）

| # | 事项 | 说明 |
|---|------|------|
| 1 | **预热后端** | 演示前 1–2 分钟先打开一次 https://agri-guard-murex.vercel.app —— Render 免费档冷启动需 30–60 秒，提前唤醒 |
| 2 | 确认线上地址 | 前端：https://agri-guard-murex.vercel.app ；后端：https://agri-guard-jcko.onrender.com/api/ |
| 3 | 无需登录 | 页面打开后自动以演示身份静默获取令牌，评委无需输入账号密码（如被问到：`demo / demo123`、农户账号 `farmer / farmer123`） |
| 4 | 浏览器 | Chrome/Edge，窗口最大化；提前按 `F12` 演练一次 DevTools 离线开关（第 5 幕用） |
| 5 | 语言 | 默认英文开场，右上角语言下拉可随时切换（共 7 种语言） |
| 6 | 兜底 | 若现场网络中断，页面自动切换到本地缓存快照继续演示（这本身也是演示点，见第 5 幕） |

---

## 1. 开场（30 秒）

【讲解要点】

> "In Africa, over 33 million smallholder farmers face climate disasters every year — but traditional insurance takes **weeks to months** to pay out. AgriGuard is a **parametric insurance platform**: satellite and GNSS data trigger payouts **automatically, in minutes, with no claims adjuster needed**."

- 一句话定位：面向非洲小农户的参数化保险 —— 灾害数据达标即自动理赔，无需人工查勘
- 三个关键词：**Automatic（自动触发）· Transparent（链上存证）· Inclusive（农户可用）**

---

## 2. 保险公司总览（约 1 分钟）

【操作】
1. 确认右上角角色选择器为 **Insurer（保险公司）**
2. 停留在 Overview 页

【讲解要点】
- 顶部 KPI：承保农场数、活跃警报、理赔案件、赔付金额一目了然
- 警报列表按风险等级排序，DISASTER/WARNING 级实时置顶
- 点击任一理赔案件卡片可直接跳转到该案件的时间轴（现场点一次）

> "The insurer sees the whole portfolio at a glance — every alert is backed by satellite evidence, not paperwork."

---

## 3. 实时地图与灾害演算（约 1.5 分钟）

【操作】
1. 点击顶部导航 **Map**
2. 指着地图上的农场边界（绿色围栏）和灾害影响区
3. 切换一次灾害类型视角，指出不同灾种的演算差异

【讲解要点】
- 地图基于真实地理数据：农场电子围栏（geofence）+ 灾害多边形叠加，空间相交即判定受灾
- **灾害周期演算按灾种区分**：洪水、野火、干旱各自有不同的演进速度与影响半径模型 —— 基于历史灾害数据与 AI 分析校准，不是一刀切动画
- 地图界面所有文字跟随系统语言（现场切换一次中文/斯瓦希里语证明）

> "Every disaster type behaves differently — a flash flood spreads in hours, a drought creeps over weeks. Our simulation engine models each one separately, calibrated on historical event data."

---

## 4. 核心高潮：一键触发全链路（约 2 分钟）⭐

【操作】
1. 在地图页点击右上角红色按钮 **"Simulate Disaster (God Mode)"**
2. 按钮变为 "Running pipeline…" —— 此时讲解后端正在发生的事
3. 观察右上角 **实时弹出的灾害警报通知**（WebSocket 推送，非轮询）
4. 点击顶部导航 **Claims**，展示新生成理赔案件的时间轴：
   **DETECTED → VERIFIED → TRIGGERED → NOTIFIED → PAYOUT**
5. 点击顶部导航 **SMS**，展示农户收到的赔付通知短信样机

【讲解要点】

> "One click just ran the entire insurance pipeline on our live backend: **PostGIS spatial matching** found the affected farm, a risk alert was created, a claim was auto-filed with a **cryptographic evidence hash**, the smart contract trigger fired, the farmer got an **SMS**, and this screen updated in real time over **WebSocket** — no refresh."

- 五步时间轴对应真实状态机：卫星探测 → GNSS 交叉验证（置信度 95%+）→ 达到阈值触发智能合约 → 短信通知 → 赔付执行
- 每笔理赔附带证据哈希（evidence hash），可上链存证、防篡改
- AI 损失评估报告自动生成（作物损失估算、恢复周期预测、处置建议）
- 后端真实部署在 Render，前端在 Vercel —— 这不是本地 mock

---

## 5. 农户视角 + 离线韧性（约 1.5 分钟）

【操作】
1. 右上角角色选择器切换到 **Farmer（农户）** —— 界面变为极简模式：大按钮、少选项、直白文案
2. 展示农户首页：我的农场状态、赔付进度（Payments）、灾害警报
3. 打开 DevTools → Network → 勾选 **Offline**，刷新页面：应用照常打开，数据来自本地快照，顶部显示离线标识与最后同步时间
4. 取消 Offline，页面提示连接恢复并自动刷新数据

【讲解要点】

> "Our real users may have a $50 Android phone and 2G signal. So the farmer view is radically simplified, supports **Kiswahili, French, Arabic and more**, works **offline as a PWA**, and every critical event also arrives by **plain SMS** — no smartphone required."

- 7 种语言：English / 中文 / Kiswahili / Français / Español / Português / العربية
- 离线缓存 + 最后同步时间戳 —— 弱网环境照常可用
- 深色模式与高对比度模式（Settings 中可展示）

---

## 6. 收尾：架构一句话（30 秒）

【讲解要点】

> "Under the hood: **Django + PostGIS** for spatial intelligence, **WebSocket** for real-time ops, **Web3 smart contracts** for trustless payout, **AI** for damage assessment — deployed live on Render and Vercel. AgriGuard turns insurance from a 3-month wait into a 3-minute payout."

- 彩蛋（时间充裕时）：按 `Ctrl + K` 唤起命令面板，可搜索农场/跳转页面/切换角色主题

---

## 7. 评委高频提问预案

| 提问 | 应答要点 |
|------|----------|
| 数据来源是真实的吗？ | 灾害演算模型基于历史灾害数据与 AI 分析校准；生产接入点是卫星/GNSS 开放数据源，当前演示用 God Mode 模拟同一管线 |
| 真的赔钱了吗？ | 智能合约触发与赔付流水真实执行；当前为测试网/模拟模式（无真实资金划转），接入主网仅需配置钱包与合约地址 |
| 没有智能手机的农户怎么办？ | 关键事件全部走 SMS 通道；农户功能同时支持 USSD 扩展 |
| 大规模部署？ | PostGIS 空间索引支撑万级农场相交查询毫秒级返回；前后端均 Serverless 可弹性扩容 |
| 如何防欺诈？ | GNSS 交叉验证 + 置信度阈值 + 证据哈希链上存证，三重校验 |
| 断网能用吗？ | PWA 离线快照 + 恢复后自动同步（第 5 幕已演示） |

---

## 8. 应急方案

| 情况 | 处理 |
|------|------|
| 首次打开白屏/转圈久 | Render 冷启动，等待 ≤60 秒；讲解词："This is the free-tier backend waking up — in production it stays warm." |
| 模拟按钮点了没反应 | 检查是否切到了 Farmer 角色（农户无此按钮，切回 Insurer） |
| 完全断网 | 页面自动进入离线模式，继续演示第 2/3/5 幕（离线本身即亮点），第 4 幕用已有理赔数据讲解 |
| 备用账号 | 若自动登录失效：登录页输入 `demo / demo123` |

---

*祝演示顺利。Good luck! 🌾🛡️*
