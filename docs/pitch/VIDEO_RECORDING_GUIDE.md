# 🎬 AgriGuard 演示视频录制全套指南 (Demo Video Guide)

为助力黑客松（DoraHacks / SATNAV Africa Joint Programme）最终冲刺，本文档提供**最省时、高得分**的 2~3 分钟演示视频录制方案与逐字稿。

---

## 🛠️ 录制准备工作

1. **录屏工具推荐**：Loom、OBS Studio 或 Windows 自带录屏 (Win + Alt + R)。
2. **前置环境启动**：
   - 打开浏览器，访问前端控制台：http://localhost:5173/。
   - 登录演示账号：demo / 密码 demo123。
   - 打开准备好的 PPT：docs/AgriGuard_Presentation.pptx。
3. **分辨率与音频**：建议 1080P，开启麦克风降噪，全屏录制。

---

## 🎙️ 2分30秒 英文中英对照录制逐字稿 (Demo Script)

### [0:00 - 0:40] 痛点与破局 (Problem & Vision)
> **画面建议**：展示 PPT 第 1~2 页或 docs/screenshots/02_dashboard.png。
> 
- **EN**: "Hello judges, this is AgriGuard. Every year, over .3 billion in climate losses hit smallholder farmers across Africa, yet less than 3% have any crop insurance. Traditional insurance fails because damage assessment takes up to 12 weeks of manual paperwork, pushing vulnerable families into bankruptcy. We built AgriGuard to replace manual loss adjusters with satellite automation."
- **ZH**: “评委好，这是 AgriGuard。非洲小农每年因气候灾害面临 93 亿美元损失，但保险覆盖率不足 3%。传统保险需要长达 12 周的人工勘灾和繁琐审批，导致农户陷入破产。我们构建 AgriGuard，用空间卫星数据彻底取代人工理赔员。”

---

### [0:40 - 1:20] 空间地理围栏与灾害监测 (GNSS Geo-fencing & Monitoring)
> **画面建议**：切换到浏览器 http://localhost:5173/，展示 Mapbox 卫星底图上的农场高亮多边形。
> 
- **EN**: "Here is our live dashboard. Using Galileo GNSS, we establish tamper-proof geo-fences for each smallholder farm plot. In the background, our backend continuously streams real-time Earth Observation data from NASA EONET and hydrological models. When severe weather hits, our spatial PostGIS engine instantly calculates intersections between disaster perimeters and farm boundaries—zero paperwork required."
- **ZH**: “这是实时控制台。通过 Galileo GNSS，我们为每个小农土地建立防篡改的地理围栏。后台持续接入 NASA EONET 卫星灾害流。当极端天气发生时，PostGIS 空间引擎瞬间完成交集计算——无需任何人工填表。”

---

### [1:20 - 2:00] 智能合约即时理赔与离线告警 (Smart Contract & SMS Payout)
> **画面建议**：点击灾害触发/展示理赔记录，展示 USDC 交易哈希与 SMS 短信通知面板。
> 
- **EN**: "Once a threshold is crossed, a Solidity smart contract automatically executes an on-chain USDC stablecoin payout in under 3 minutes. Simultaneously, low-bandwidth Twilio SMS alerts are delivered directly to the farmer's offline phone, accompanied by an AI-generated damage estimation report."
- **ZH**: “一旦超过理赔阈值，Solidity 智能合约会在 3 分钟内自动触发链上 USDC 赔付。同时，系统通过低带宽 Twilio SMS 短信将确认码与 AI 灾损评估报告直接发送给农户的离线手机。”

---

### [2:00 - 2:30] 商业前景与总结 (Market Potential & Wrap-up)
> **画面建议**：切回 PPT 商业规模页（TAM/SAM/SOM）或总结页。
> 
- **EN**: "By slashing operational costs by 90% and compressing the claim lifecycle from 12 weeks to 3 minutes, AgriGuard creates a sustainable B2B2C parametric insurance model. AgriGuard: When the Earth speaks through satellites, farmers get paid in minutes. Thank you!"
- **ZH**: “通过降低 90% 勘灾成本并将理赔时效由 12 周缩减至 3 分钟，AgriGuard 实现了可持续的 B2B2C 参数化保险闭环。AgriGuard：当卫星感知大地，农户即刻获赔。谢谢！”

---

## 📤 视频上传与提交

1. 将录制视频上传至 **YouTube**（设为 Unlisted/Public）或 **Loom** / **Bilibili**。
2. 复制视频链接，填写到 README.md 的 Demo Video 以及 DoraHacks 的 Video 栏中。
