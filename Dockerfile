# 使用官方 Python 镜像作为基础镜像
FROM python:3.10-slim

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# 安装系统依赖 (PostGIS 需要 GDAL 等库)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        binutils \
        libproj-dev \
        gdal-bin \
        libgdal-dev \
        python3-gdal \
        postgis \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 安装 Python 依赖
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY . /app/

# 给入口脚本执行权限
RUN chmod +x /app/entrypoint.sh

# 暴露端口
EXPOSE 8000

# 默认启动命令 (兼容 Render 动态分配的 $PORT 与本地 Docker 运行)
CMD ["/app/entrypoint.sh"]