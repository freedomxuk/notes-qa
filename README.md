# Notes QA - 智能笔记应用

这是一个基于 [Next.js](https://nextjs.org) 框架构建的智能笔记应用。

## 功能特点

- 📝 上传和管理笔记文件（支持 .md 和 .txt 格式）
- ✏️ 在线编辑笔记内容
- 🤖 基于 AI 的智能问答功能
- 💾 本地存储，数据保存在浏览器中

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 运行开发服务器

```bash
npm run dev
```

然后打开浏览器访问 http://localhost:3000

### 3. 构建生产版本

```bash
npm run build
```

### 4. 启动生产服务器

```bash
npm start
```

## 配置 AI 问答

如果要使用 AI 问答功能，需要配置 Anthropic API Key：

1. 访问 https://console.anthropic.com/ 注册账号
2. 创建 API Key
3. 在 `.env.local` 文件中添加：
   ```
   ANTHROPIC_API_KEY=你的API密钥
   ```

## 技术栈

- **框架**: Next.js 16.2.7
- **UI 库**: React 19.2.4
- **样式**: Tailwind CSS v4
- **AI**: LangChain + Anthropic Claude

## 学习更多

想了解更多 Next.js 的内容，可以看看以下资源：

- [Next.js 文档](https://nextjs.org/docs) - Next.js 功能和 API
- [Next.js 学习教程](https://nextjs.org/learn) - 交互式教程
- [Next.js GitHub 仓库](https://github.com/vercel/next.js) - 欢迎反馈和贡献

## 部署

最简单的方式是使用 Vercel 平台部署：

- [在 Vercel 上部署 Next.js](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)