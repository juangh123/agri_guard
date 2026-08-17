# 🌐 AgriGuard 真实云端生产环境部署指南 (Cloud Deployment Guide)

为了让黑客松评委与公众可以直接在线测试 AgriGuard，推荐以下两种部署方案：

---

## 方案一：云服务器一键 Docker Compose 部署（最推荐、最稳健）

**适用环境**：任何 Linux 云服务器（如阿里云、腾讯云、AWS EC2、DigitalOcean、Hetzner 等，建议配置 2核4G 或以上，系统 Ubuntu 22.04 LTS）。

### 1. 服务器准备与安装 Docker
登录你的 Linux 服务器执行：
`ash
# 更新源并安装 Docker & Docker Compose
curl -fsSL https://get.docker.com | bash
sudo systemctl enable docker && sudo systemctl start docker
`

### 2. 克隆项目代码
`ash
git clone <你的 GitHub 仓库公开地址>
cd agri_guard
`

### 3. 配置环境变量
`ash
cp .env.example .env
nano .env # 或使用 vim 编辑真实 API Key（OpenAI、Twilio、Mapbox 等）
`

### 4. 一键启动全部服务
`ash
# 启动 DB (PostGIS)、Redis、Django API、Celery 以及 React 前端
docker compose up -d --build

# 初始化数据库结构与演示数据
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_demo_data
`

### 5. 开放端口与在线访问
在云服务器安全组/防火墙开放：
- **5173**：前端 Web 访问端口
- **8000**：后端 API 访问端口

👉 **评委测试地址**：http://<你的服务器公网IP>:5173/  
👉 **测试账号**：demo / **密码**：demo123

*(可选进阶)*：可配置 Nginx 将 80/443 端口反向代理到 5173 与 8000 并绑定域名及 SSL 证书。

---

## 方案二：Serverless 免费云平台组合部署（零服务器成本）

| 模块 | 推荐平台 | 部署说明 |
|:---|:---|:---|
| **前端 (React/Vite)** | **Vercel / Netlify / Cloudflare Pages** | 连接 GitHub 仓库，根目录设为 rontend，构建命令 
pm run build，输出目录 dist。配置环境变量 VITE_API_BASE_URL 指向后端。 |
| **后端 API (Django)** | **Render / Railway / Fly.io** | 选择 Web Service，直接使用仓库根目录的 Dockerfile 或配置 Python 启动命令 daphne -b 0.0.0.0 -p \ config.asgi:application。 |
| **空间数据库 (PostGIS)**| **Neon / Supabase / Render Postgres** | 创建支持 PostGIS 扩展的云 PostgreSQL 数据库，将连接串填入后端的 DATABASE_URL。 |
| **消息队列 (Redis)** | **Upstash Redis / Redis Cloud** | 创建免费云 Redis 实例，填入 CELERY_BROKER_URL。 |

---

## 方案三：本地隧道公网映射（急救方案，免迁移快速给评委演示）

如果临近提交没有充裕时间配置云服务器，可以直接将当前你电脑上已跑通的 Docker 环境**通过公网隧道映射**出去：

1. **使用 Ngrok / Cloudflare Tunnel / Localtunnel**：
   `ash
   # 安装 localtunnel (npm)
   npx localtunnel --port 5173
   `
2. 系统会生成一个临时的公网 HTTPS 链接（如 https://agri-guard-demo.loca.lt），直接将该链接发给评委即可访问你电脑上的项目大屏。
