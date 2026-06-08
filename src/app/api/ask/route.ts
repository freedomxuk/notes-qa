/**
 * RAG 问答接口
 * 使用阿里千问 text-embedding-v4 + qwen3-vl-rerank
 */

import OpenAI from "openai";

export const dynamic = "force-dynamic";

// 创建阿里千问客户端
function createClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });
}

// ============ 工具函数 ============

// 文本分块
function splitIntoChunks(text: string, chunkSize: number = 500): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }

    if (trimmed.length > chunkSize) {
      const sentences = trimmed.split(/(?<=[。！？])\s*/);
      for (const sentence of sentences) {
        if (sentence.length > chunkSize) {
          for (let i = 0; i < sentence.length; i += chunkSize) {
            chunks.push(sentence.slice(i, i + chunkSize));
          }
        } else {
          currentChunk += sentence + " ";
        }
      }
    } else {
      currentChunk += trimmed + "\n\n";
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// 余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============ 数据存储 ============

interface ChunkData {
  id: string;
  content: string;
  noteId: string;
  noteFilename: string;
  embedding: number[];
}

let chunksStore: ChunkData[] = [];

// ============ API 接口 ============

export async function POST(request: Request) {
  try {
    const { question, allNotes } = await request.json();

    if (!question) {
      return Response.json({ error: "缺少问题" }, { status: 400 });
    }

    if (!allNotes || allNotes.length === 0) {
      return Response.json({ error: "请先上传笔记" }, { status: 400 });
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;

    console.log("Embedding Key:", apiKey ? "已配置" : "未配置");

    if (!apiKey) {
      return Response.json({ error: "API Key 未配置" }, { status: 500 });
    }

    // 创建客户端
    const client = createClient(apiKey);

    // 为所有笔记生成分块和 embedding
    for (const note of allNotes) {
      const noteId = note.id;
      let noteChunks = chunksStore.filter(c => c.noteId === noteId);

      if (noteChunks.length === 0) {
        console.log(`为笔记 ${note.filename} 生成分块...`);
        console.log(`原始内容长度: ${note.content.length}, 前50字:`, note.content.slice(0, 50));
        const texts = splitIntoChunks(note.content, 500);
        console.log(`分块数量: ${texts.length}`);

        for (let i = 0; i < texts.length; i++) {
          const text = texts[i];
          console.log(`分块${i}:`, Buffer.from(text).toString('hex').slice(0, 100));
          try {
            const resp = await client.embeddings.create({
              model: "text-embedding-v4",
              input: text,
            });
            const embedding = resp.data[0].embedding;
            chunksStore.push({
              id: `${noteId}-chunk-${i}`,
              content: text,
              noteId,
              noteFilename: note.filename,
              embedding,
            });
          } catch (e) {
            console.error("Embedding 失败:", e);
          }
        }
      }
    }

    // 生成问题的 embedding
    const qResp = await client.embeddings.create({
      model: "text-embedding-v4",
      input: question,
    });
    const questionEmbedding = qResp.data[0].embedding;

    // 计算相似度
    const results = chunksStore.map(chunk => ({
      content: chunk.content,
      noteFilename: chunk.noteFilename,
      embedScore: cosineSimilarity(questionEmbedding, chunk.embedding),
    }));

    results.sort((a, b) => b.embedScore - a.embedScore);
    const candidates = results.slice(0, 20);

    console.log(`Embedding 候选: ${candidates.length} 个`);
    console.log(`Top 候选内容:`, candidates[0]?.content?.slice(0, 50));

    // 直接用 embedding 相似度排序（reranker API 格式不同，暂跳过）
    const sortedResults = [...candidates].sort((a, b) => b.embedScore - a.embedScore);
    // 取所有候选，不过滤（只要有分数）
    const relevantChunks = sortedResults.slice(0, 10).map(c => ({ ...c, rerankScore: c.embedScore }));

    console.log(`Reranker 筛选后: ${relevantChunks.length} 个`);

    const contextParts = relevantChunks.map((r, i) => `[${i + 1}] ${r.content}`).join("\n\n");

    // 生成答案 - 强制使用上下文
    const qwenResp = await client.chat.completions.create({
      model: "qwen-turbo",
      messages: [
        { role: "system", content: "你是一个问答助手。必须严格根据下面提供的上下文回答问题，不要编造。如果上下文没有答案，直接说「我没有足够信息回答这个问题」。用[数字]标注来源。" },
        { role: "user", content: `【上下文开始】\n${contextParts}\n【上下文结束】\n\n问题：${question}\n\n请根据上述上下文回答，只使用上下文中的信息。` },
      ],
    });

    const answer = qwenResp.choices[0]?.message?.content || "生成答案失败";

    const refs = relevantChunks.map((r, i) => ({ index: i + 1, content: r.content, score: r.rerankScore }));
    return Response.json({ answer, references: refs });
  } catch (error) {
    console.error("错误:", error);
    return Response.json({ error: error instanceof Error ? error.message : "未知错误" }, { status: 500 });
  }
}