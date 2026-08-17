# 📋 AgriGuard 黑客松最终提交资料清单与操作指南

本文档汇集了 **AgriGuard** 项目参加 **SATNAV Africa Joint Programme Hackathon**（DoraHacks 平台）冲刺提交所需的全部物料与填报指引。

---

## 1. 基础信息汇总表 (Project Metadata)

| 填报字段 | 英文内容 (DoraHacks 填写) | 中文说明 |
|:---|:---|:---|
| **Project Name** | **AgriGuard** | 项目名称 |
| **Tagline / Catchphrase** | Zero-Touch Parametric Crop Insurance & Real-time Early Warning System for Africa's Smallholder Farmers | 一句话项目定位 |
| **Target Track** | **Disaster Risk Reduction & Management** / **Early Warning Services** | 参赛赛道 |
| **Theme Alignment** | Mitigating Risks associated with Disasters through Space Technologies (GNSS & Earth Observation) | 契合主题 |
| **Tech Stack** | Django, PostGIS, Celery, Redis, React, Mapbox GL, Solidity (Web3.py), OpenAI, Twilio | 技术栈 |
| **License** | MIT License | 开源协议 |
| **Repository URL** | [填入你的 GitHub 仓库公开链接] | 代码仓库 |
| **Demo URL / Video** | [填入视频链接，如 YouTube/Loom] | 演示视频链接 |

---

## 2. 提交文案 (Copy-Paste Ready Submission Texts)

### 📌 2.1 Short Description (适合 250 词 Abstract / 平台短简介)

`markdown
AgriGuard is a zero-touch parametric crop insurance and early warning platform designed to protect Sub-Saharan Africa's smallholder farmers against climate catastrophes (floods, droughts, wildfires). 

Every year, African farmers lose .3B to climate disasters, yet over 97% lack insurance due to high verification costs and prolonged 4–12 week claim settlement cycles. AgriGuard eliminates human loss adjusters by combining space data with Web3 automation:
1. **Galileo GNSS Geo-Fencing:** Creates tamper-proof spatial boundaries for registered smallholder plots.
2. **Earth Observation & Disaster Data:** Ingests live NASA EONET events and GEOGLOWS streamflow models.
3. **Automated PostGIS Trigger:** Spatial intersection (ST_Intersects) instantly identifies affected farms without paperwork.
4. **On-Chain Settlement & Instant Alert:** Solidity smart contracts execute instant USDC payouts while Twilio SMS notifies farmers on low-bandwidth/offline phones.
5. **AI Damage Estimation:** GPT-3.5 generates automated assessment reports for insurers.

AgriGuard compresses the claim cycle from 12 weeks to under 3 minutes, slashes inspection costs by 90%, and drives down post-disaster bankruptcy rates by up to 60%.
`

---

### 📌 2.2 详细项目长文 (Detailed BUIDL Description)

可直接复制项目内已编写完备的文档：
👉 **[docs/SUBMISSION_FULL.md](docs/SUBMISSION_FULL.md)**

该文档包含：
- 完整 Elevator Pitch (90秒发言稿)
- 系统架构说明与 Mermaid 流程图
- 空间数据处理与触发代码示例 (PostGIS / Signals / Smart Contract)
- 商业模型、市场规模测算 (TAM/SAM/SOM) 与 UN SDGs 对标

---

## 3. 提交附件物料与路径

| 物料类型 | 本地相对路径 | 用途 |
|:---|:---|:---|
| **路演 PPT** | docs/AgriGuard_Presentation.pptx | 提交平台附件 / 现场答辩 Deck |
| **精选截图集** | docs/screenshots/ (10张完整截图) | 上传至 DoraHacks 图片画廊 (Gallery) |
| **交互式离线 Demo** | docs/INTERACTIVE_DEMO.html | 双击本地打开，可作为备用演示 |
| **智能合约源码** | contracts/AgriGuardParametric.sol | Web3 自动理赔逻辑参考 |
| **系统架构文档** | docs/ARCHITECTURE.md | 技术实现细节与架构图 |

---

## 4. 视频录制建议指南 (Demo Video Guide)

建议录制时长：**2 ~ 3 分钟**（英文配音或英文字幕）。

### 推荐录制脚本流程：
1. **0:00 - 0:45 (Problem & Vision)**
   - 打开 PPT 第 1-2 页，简述非洲小农气候灾害痛点（.3B 损失，3% 保险覆盖率，理赔需 12 周）。
2. **0:45 - 1:45 (Live Dashboard Demo)**
   - 切换到浏览器 http://localhost:5173/。
   - 展示 Mapbox 卫星地图上标定的 Galileo GNSS 农场多边形。
   - 点击/触发灾害事件（洪水/干旱）。
   - 展示系统毫秒级空间交集计算、闪烁告警和赔付判定。
3. **1:45 - 2:30 (Automation & Payout)**
   - 展示理赔流水、模拟的区块链交易哈希 (TxHash) 与 SMS 短信通知。
   - 展示 OpenAI 生成的灾情与损失评估报告。
4. **2:30 - 3:00 (Market & Summary)**
   - 总结：从 12 周压缩至 3 分钟，为非洲农户构建空间科技防护网。

---

## 5. DoraHacks 提交最后核对 CheckList

- [ ] GitHub 仓库已设为 **Public**（公开）。
- [ ] 确保 .env 中的真实 API Key **未被提交**（.gitignore 已配置）。
- [ ] 上传 Cover 封面图（建议使用 docs/screenshots/02_dashboard.png）。
- [ ] 上传 Gallery 相册（选择 docs/screenshots/ 下的 4~6 张高清界面图）。
- [ ] 填入 YouTube / Loom 录制的 Demo 视频链接。
- [ ] 粘入 docs/SUBMISSION_FULL.md 或本清单中的项目描述。
- [ ] 确认完成提交并保存 BUIDL 链接！
