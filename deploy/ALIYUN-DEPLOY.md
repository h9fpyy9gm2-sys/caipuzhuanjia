# 阿里云 Ubuntu + SSH 部署

域名备案完成前，可以先用服务器公网 IP 访问。备案完成后，再把 Nginx 的 `server_name` 换成正式域名并配置 HTTPS。

## 1. 服务器安装运行环境

```bash
sudo apt update
sudo apt install -y nginx curl unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. 上传文件

在本地把 `outputs` 内的网站文件上传到服务器：

```bash
scp -r outputs/index.html outputs/styles.css outputs/site-refresh.css outputs/nav-fix.css outputs/customer-float.css outputs/script.js outputs/api-config.js outputs/llms.txt outputs/robots.txt outputs/sitemap.xml outputs/assets root@你的服务器IP:/tmp/caipu-site/
scp -r outputs/server root@你的服务器IP:/tmp/caipu-server/
scp outputs/deploy/ecosystem.config.cjs outputs/deploy/nginx-caipu.conf root@你的服务器IP:/tmp/
```

## 3. 服务器目录与依赖

```bash
sudo mkdir -p /var/www/caipu-zhuanjia/site /var/www/caipu-zhuanjia/server
sudo cp -r /tmp/caipu-site/* /var/www/caipu-zhuanjia/site/
sudo cp -r /tmp/caipu-server/* /var/www/caipu-zhuanjia/server/
sudo chown -R $USER:$USER /var/www/caipu-zhuanjia
cd /var/www/caipu-zhuanjia/server
npm install --omit=dev
cp .env.example .env
nano .env
```

在 `.env` 中填写 `OPENAI_API_KEY`，不要把密钥提交到网站目录或前端文件。

## 4. 启动 API

```bash
cd /var/www/caipu-zhuanjia/server
pm2 start /tmp/ecosystem.config.cjs
pm2 save
pm2 startup
curl http://127.0.0.1:8787/health
```

## 5. 配置 Nginx

```bash
sudo cp /tmp/nginx-caipu.conf /etc/nginx/sites-available/caipu-zhuanjia
sudo ln -sfn /etc/nginx/sites-available/caipu-zhuanjia /etc/nginx/sites-enabled/caipu-zhuanjia
sudo nginx -t
sudo systemctl reload nginx
```

访问 `http://你的服务器IP/` 检查首页；访问 `http://你的服务器IP/health` 检查 API。

## 6. 备案完成后

把 `/etc/nginx/sites-available/caipu-zhuanjia` 中的 `server_name _;` 改成正式域名，然后使用 Certbot 配置 HTTPS：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

之后把服务器安全组放行 `80` 和 `443` 端口。当前前端默认使用同域名 `/api`，不需要修改 `api-config.js`。
