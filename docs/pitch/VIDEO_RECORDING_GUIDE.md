# 🎬 AgriGuard 演示视频录制全套指南 (Demo Video Guide)

为助力黑客松（DoraHacks / SATNAV Africa Joint Programme）最终冲刺，本文档提供**最省时、高得分**的 2~3 分钟演示视频录制方案与逐字稿。

---

## 🛠️ 录制准备工作

1. **录屏工具推荐**：Loom、OBS Studio 或 Windows 自带录屏 (Win + Alt + R)。
2. **前置环境启动**：
   - 打开浏览器，访问公开演示：https://agri-guard-api-live.vercel.app/。
   - 页面会自动进入演示环境；备用账号为 demo / demo123。
   - 打开准备好的 PPT：docs/AgriGuard_Presentation_submission.pptx。
   - 严禁使用仓库内 2026-08-22 的旧版 `AgriGuard_Demo.mp4` 直接提交；该版本仍包含旧 KPI、旧时间轴和 `24h` 到账文案。
3. **分辨率与音频**：建议 1080P，开启麦克风降噪，全屏录制。

---

## 🎙️ 2分30秒 英文中英对照录制逐字稿 (Demo Script)

### [0:00 - 0:40] 痛点与破局 (Problem & Vision)
> **画面建议**：展示 PPT 第 1~2 页或 docs/screenshots/09_overview_pipeline.png。
> 
- **EN**: "Hello judges, this is AgriGuard. Every year, over 9.3 billion dollars in climate losses hit smallholder farmers across Africa, yet less than 3% have any crop insurance. Traditional insurance fails because damage assessment takes up to 12 weeks of manual paperwork, pushing vulnerable families into bankruptcy. We built AgriGuard to reduce the manual loss-adjustment bottleneck with geospatial evidence."
- **ZH**: “评委好，这是 AgriGuard。非洲小农每年因气候灾害面临 93 亿美元损失，但保险覆盖率不足 3%。传统保险需要长达 12 周的人工勘灾和繁琐审批，导致农户陷入破产。我们构建 AgriGuard，用空间卫星数据彻底取代人工理赔员。”

---

### [0:40 - 1:20] 空间地理围栏与灾害监测 (GNSS Geo-fencing & Monitoring)
> **画面建议**：切换到浏览器 https://agri-guard-api-live.vercel.app/，展示 MapLibre/Esri 卫星底图上的农场高亮多边形。
> 
- **EN**: "Here is our live dashboard. Using GNSS-captured WGS84 boundaries, we create auditable geo-fences for each smallholder plot, including optional device, accuracy, and capture-time metadata. Our backend ingests NASA EONET event footprints every six hours and displays live GEOGLOWS and VIIRS layers. When a verified hazard footprint intersects a farm boundary, PostGIS calculates the intersection automatically."
- **ZH**: “这是实时控制台。我们使用 GNSS 采集的 WGS84 边界为每个小农地块建立可审计地理围栏，并记录设备、精度和采集时间元数据。后台每 6 小时接入 NASA EONET 事件范围，同时展示实时 GEOGLOWS 和 VIIRS 图层。当经过验证的灾害范围与农场边界相交时，PostGIS 会自动完成空间求交。”

---

### [1:20 - 2:00] 可审计赔付路径与离线告警 (Auditable Settlement & SMS)
> **画面建议**：点击灾害触发/展示理赔记录，展示 `PENDING` 或真实 ERC-20 交易状态与 SMS 短信通知面板。
> 
- **EN**: "Once a threshold is crossed, our settlement service can sign an ERC-20 token transfer from the insurer wallet. In this demo, no blockchain credentials are configured, so AgriGuard clearly records the claim as PENDING instead of fabricating a transaction hash. SMS status updates use Twilio when credentials are configured and a clearly labeled mock sender otherwise. The Solidity policy contract is included as the reference design for the next escrow phase."
- **ZH**: “一旦超过理赔阈值，结算服务可以从保险方钱包签名执行 ERC-20 代币转账。本次演示未配置区块链凭据，因此 AgriGuard 会明确记录为 PENDING，而不会伪造交易哈希。短信状态在配置 Twilio 后真实发送，否则使用明确标记的模拟发送器。Solidity 保单合约作为下一阶段托管方案参考实现随项目提供。”

---

### [2:00 - 2:30] 商业前景与总结 (Market Potential & Wrap-up)
> **画面建议**：切回 PPT 商业规模页（TAM/SAM/SOM）或总结页。
> 
- **EN**: "Our target is to reduce routine verification cost by up to 90% and compress the claim lifecycle from 12 weeks to minutes. AgriGuard creates a sustainable B2B2C parametric insurance model built on transparent evidence and settlement status. Thank you!"
- **ZH**: “我们的目标是将常规核验成本降低最多 90%，并把理赔周期从 12 周压缩到分钟级。AgriGuard 以透明证据和赔付状态为基础，构建可持续的 B2B2C 参数化保险模式。谢谢！”

---

## 📤 视频上传与提交

1. 将录制视频上传至 **YouTube**（设为 Unlisted/Public）或 **Loom** / **Bilibili**。
2. 复制视频链接，填写到 README.md 的 Demo Video 以及 DoraHacks 的 Video 栏中。
