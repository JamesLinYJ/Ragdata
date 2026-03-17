# Know Frontend

这是一个独立的 `RAGFlow` 定制前端，覆盖：

- 登录页
- 首页
- 知识库页
- 聊天页

## 启动

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

默认会把 `/api` 代理到 `http://127.0.0.1:9380`。

如果你希望打开就直接进入系统，可以在 `frontend/.env.local` 设置：

```bash
VITE_AUTO_LOGIN_EMAIL=your@email.com
VITE_AUTO_LOGIN_PASSWORD=your-password
```

如果密码里包含 `#`、空格等特殊字符，请用引号包起来，例如：

```bash
VITE_AUTO_LOGIN_PASSWORD="KnowTest#2026"
```

## 依赖前提

- `RAGFlow` 后端已经启动
- 浏览器能访问 `http://127.0.0.1:9380`

## 已实现

- 使用 `RAGFlow` 账号登录
- 查看知识库和聊天助手概况
- 创建 / 删除知识库
- 上传文档并触发解析
- 一键创建“烟草知识库”
- 创建聊天助手并绑定知识库
- 发起流式知识问答
