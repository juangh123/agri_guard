# 📋 AgriGuard 黑客松最终提交资料清单与操作指南

本文档汇集了 **AgriGuard** 项目参加 **GNSS 4 for Space Applications in Africa (G4-SAA)**（DoraHacks 平台）冲刺提交所需的全部物料与填报指引。

---

## 0. 官方时间线 (Official Timeline)

| 节点 | 时间 | 状态 |
|:---|:---|:---|
| Pre-registration opens | 2026/09/26 18:00（北京时间） | 待开启 |
| Submission window opens | 2026/10/03 16:23（北京时间） | 待开启 |
| Submission deadline | 2026/10/11 04:00（北京时间） | 待开启 |

> 来源：https://dorahacks.io/hackathon/satnav/detail
>
> 已于 2026-09-15 直接核对页面内嵌时间数据与页面显示；平台时间字段按 UTC 换算为北京时间。

---

## 1. 基础信息汇总表 (Project Metadata)

| 填报字段 | 英文内容 (DoraHacks 填写) | 中文说明 |
|:---|:---|:---|
| **Project Name** | **AgriGuard** | 项目名称 |
| **Tagline / Catchphrase** | Zero-Touch Parametric Crop Insurance & Real-time Early Warning System for Africa's Smallholder Farmers | 一句话项目定位 |
| **Target Track** | **Challenge II — Synergizing Agriculture and Geomatics** | 主赛道与项目最直接匹配；灾害减损作为重要交叉价值 |
| **Theme Alignment** | Mitigating Risks associated with Disasters through Space Technologies that Exploit the use of GNSS | 契合主题 |
| **Tech Stack** | Django, PostGIS, Celery, Redis, React, MapLibre GL, Esri Living Atlas, Web3.py, Solidity reference contract, OpenAI, Twilio | 技术栈 |
| **License** | MIT License | 开源协议 |
| **Repository URL** | https://github.com/juangh123/agri_guard | 代码仓库 |
| **Demo URL / Video** | `docs/AgriGuard_Demo_Final.mp4`（仓库内） | 已按当前界面重制；正式提交时也可同步上传 YouTube/Unlisted 或 Loom |

---

## 2. 提交文案 (Copy-Paste Ready Submission Texts)

### 📌 2.1 Short Description (适合 250 词 Abstract / 平台短简介)

```markdown
AgriGuard is a zero-touch parametric crop insurance and early warning platform designed to protect Sub-Saharan Africa's smallholder farmers against climate catastrophes (floods, droughts, wildfires).

Every year, African farmers lose $9.3B to climate disasters, yet over 97% lack insurance due to high verification costs and prolonged 4-12 week claim settlement cycles. AgriGuard reduces the human loss-adjustment bottleneck by combining GNSS-defined farm boundaries, Earth-observation signals, and an auditable digital settlement workflow:
1. **GNSS/WGS84 Geo-Fencing:** Stores captured field boundaries with optional device, accuracy, and timestamp metadata for auditable smallholder plot records.
2. **Earth Observation & Disaster Data:** Ingests NASA EONET event footprints and visualizes live Esri Living Atlas layers; automated threshold ingestion from GEOGLOWS/VIIRS is a production roadmap item, while the demo labels simulated metrics clearly.
3. **Automated PostGIS Trigger:** Spatial intersection (ST_Intersects) instantly identifies affected farms without paperwork.
4. **Auditable Settlement Status & Alert:** The backend can execute an ERC-20 transfer only when credentials and the explicit live-settlement gate are enabled; otherwise the claim is recorded as PENDING instead of a fake paid hash. SMS status uses Twilio only when explicitly enabled and otherwise uses a labeled mock sender.
5. **AI Damage Estimation:** A configurable OpenAI model generates assessment reports for insurers when its explicit live gate is enabled, with a deterministic fallback for offline and public demos.

The product target is to compress the claim cycle from 12 weeks to under 3 minutes, reduce inspection costs by up to 90%, and improve post-disaster liquidity for smallholders.
```

---

### 📌 2.2 详细项目长文 (Detailed BUIDL Description)

可直接复制项目内已编写完备的文档：
👉 **[SUBMISSION_FULL.md](SUBMISSION_FULL.md)**

该文档包含：
- 完整 Elevator Pitch (90秒发言稿)
- 系统架构说明与 Mermaid 流程图
- 空间数据处理与触发代码示例 (PostGIS / Signals / Smart Contract)
- 商业模型、市场规模测算 (TAM/SAM/SOM) 与 UN SDGs 对标

---

## 3. 提交附件物料与路径

| 物料类型 | 本地相对路径 | 用途 |
|:---|:---|:---|
| **路演 PPT** | docs/AgriGuard_Presentation_submission.pptx | 提交平台附件 / 现场答辩 Deck |
| **精选截图集** | docs/screenshots/ (使用 09–14 共 6 张最新验收截图) | 上传至 DoraHacks 图片画廊 (Gallery) |
| **交互式离线 Demo** | docs/INTERACTIVE_DEMO.html | 双击本地打开，可作为备用演示 |
| **智能合约源码** | contracts/AgriGuardParametric.sol | Web3 自动理赔逻辑参考 |
| **系统架构文档** | docs/ARCHITECTURE.md | 技术实现细节与架构图 |

---

## 4. 视频录制建议指南 (Demo Video Guide)

建议录制时长：**2 ~ 3 分钟**（英文配音或英文字幕）。

### 推荐录制脚本流程：
1. **0:00 - 0:45 (Problem & Vision)**
   - 打开 PPT 第 1-2 页，简述非洲小农气候灾害痛点（$9.3B 损失，3% 保险覆盖率，理赔需 12 周）。
2. **0:45 - 1:45 (Live Dashboard Demo)**
   - 切换到浏览器 https://agri-guard-api-live.vercel.app/，页面会自动进入演示环境。
   - 仅在最新前端 bundle 已发布后录制；仓库内的 `AgriGuard_Demo.mp4` 是旧版归档，不作为提交视频。
   - 展示 MapLibre/Esri 卫星地图上标定的 GNSS/WGS84 农场多边形。
   - 点击/触发灾害事件（洪水/干旱）。
   - 展示系统毫秒级空间交集计算、闪烁告警和赔付判定。
3. **1:45 - 2:30 (Automation & Payout)**
   - 展示理赔流水、未配置 Web3 时的 `PENDING` 状态（无伪造 TxHash）与 SMS 短信通知。
   - 展示 OpenAI 生成的灾情与损失评估报告。
4. **2:30 - 3:00 (Market & Summary)**
   - 总结：从 12 周压缩至 3 分钟，为非洲农户构建空间科技防护网。

---

## 5. DoraHacks 提交最后核对 CheckList

- [ ] 在 2026/10/11 04:00（北京时间）前完成 BUIDL 提交。
- [ ] GitHub 仓库已设为 **Public**（公开）。
- [ ] 确保 .env 中的真实 API Key **未被提交**（.gitignore 已配置）。
- [ ] 录制或答辩前重新部署最新前后端，并确认线上 claim 时间轴包含 `[SIMULATED]` 与 `PENDING`、没有伪造 TxHash，匿名 `/api/farms/` 不返回 `phone_number` / `wallet_address`。
- [ ] 上传 Cover 封面图（使用 docs/screenshots/09_overview_pipeline.png）。
- [ ] 上传 Gallery 相册（使用 docs/screenshots/09 至 14 共 6 张当前验收截图）。
- [ ] 审核并上传 `docs/AgriGuard_Demo_Final.mp4`，或替换为基于同一脚本录制的 YouTube/Unlisted / Loom 链接。
- [ ] 粘入 docs/SUBMISSION_FULL.md 或本清单中的项目描述。
- [ ] 保存 BUIDL 链接后，回填 README.md 的 `Submission URL`。
- [ ] 选择 **Challenge II — Synergizing Agriculture and Geomatics**，确认灾害减损价值在描述中可见。
- [ ] 确认完成提交并保存 BUIDL 链接！

---

## 6. 本地最终验收记录（2026-09-15）

| 项目 | 结果 |
|:---|:---|
| PPT | `docs/AgriGuard_Presentation_submission.pptx` · 12 slides · SHA-256 `289f5e7ebbffdb731235ee862ebdcbbed16ba28664f1c36b80b7c758e71fb17f` |
| 视频 | `docs/AgriGuard_Demo_Final.mp4` · 121.066667s · 1440×900 · SHA-256 `752C68B57FFDBB0E512BC5162675BD437161E1D1D7D96BCC01CAB6E090B07693` |
| 自动化测试 | `43 passed`（1 个 websockets 依赖弃用警告） |
| 前端 | `npm run lint` 与 production `npm run build` 通过 |
| Django | `manage.py check`、迁移漂移检查通过；生产环境模式下仅保留 HSTS subdomain/preload 提示 |
| 智能合约 | `solc 0.8.24` 编译通过 |
| 公开数据边界 | 匿名 API 不返回农场电话/钱包；events/alerts/claims 为只读，未登录或公开 demo 用户不能篡改审计记录 |

> 当前线上后端仍可能使用旧构建。上面的视频使用本地 production preview 和当前验收截图生成；正式录制或答辩前必须完成部署并重新执行线上版本校验。
