# Notes QA - 智能笔记问答应用

## 1. 我做了什么

我构建了一个基于个人笔记的 AI 问答应用。用户可以上传 Markdown、TXT、Word、Excel 格式的笔记，AI 会根据笔记内容回答问题，并标注每个答案的引用来源，用户点击引用即可跳转到原文位置验证。

核心技术方案：使用阿里千问的 text-embedding-v4 进行向量化检索，配合 qwen-turbo 生成答案。前端采用 Next.js + React，单页面双栏布局，笔记存储在浏览器 localStorage 中。

已部署到 Netlify：https://notes-qa.netlify.app

## 2. 我没做什么及原因

- **PDF 支持**：移除了。pdfjs-dist 只能提取文字层，扫描件需要 OCR 超出时间预算，用户可手动复制为 txt
- **多用户/认证**：单用户 MVP，简化开发
- **流式输出**：非核心，体验优化可后续加
- **悬停预览/示例问题**：P1 优先级，核心问答功能已满足
- **笔记编辑/删除/历史**：简化，MVP 聚焦核心

## 3. 下次改进

如果再有 3 天时间，我会：

1. 添加流式输出，提升答案生成时的交互体验
2. 预置 3-5 个示例问题和示例笔记，降低上手门槛
3. 考虑服务端存储方案（Vercel Blob/PostgreSQL），实现多设备同步

---

## 技术栈

- Next.js 16.2.7 + React 19
- 阿里千问 API（Embedding + LLM）
- localStorage 持久化

## 部署

```bash
# 本地运行
npm install
npm run dev

# 部署到 Netlify（推送 GitHub 后在 Netlify 面板导入）
```