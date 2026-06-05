/**
 * RAG 问答接口
 * 完整流程：搜索所有笔记 → 生成问题向量 → 搜索相关 chunks → 生成答案
 */

export const dynamic = "force-dynamic";

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
    if (!apiKey) {
      return Response.json({ error: "阿里千问 API Key 未配置" }, { status: 500 });
    }

    // 为所有笔记生成分块和 embedding
    for (const note of allNotes) {
      const noteId = note.id;
      let noteChunks = chunksStore.filter(c => c.noteId === noteId);

      // 如果没有缓存，重新生成
      if (noteChunks.length === 0) {
        console.log(`为笔记 ${note.filename} 生成分块...`);

        const texts = splitIntoChunks(note.content, 500);

        // 生成 embedding
        for (let i = 0; i < texts.length; i++) {
          const text = texts[i];

          const embedResponse = await fetch(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "text-embedding-v3",
                input: text,
              }),
            }
          );

          const embedData = await embedResponse.json();
          if (embedData.error) {
            console.error(`Embedding 失败:`, embedData.error);
            continue;
          }

          const embedding = embedData.data[0].embedding;
          chunksStore.push({
            id: `${noteId}-chunk-${i}`,
            content: text,
            noteId,
            noteFilename: note.filename,
            embedding,
          });
        }
      }
    }

    // 生成问题的 embedding
    const qEmbedResponse = await fetch(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-v3",
          input: question,
        }),
      }
    );

    const qEmbedData = await qEmbedResponse.json();
    if (qEmbedData.error) {
      return Response.json({ error: `问题向量化失败: ${qEmbedData.error.message}` }, { status: 500 });
    }

    const questionEmbedding = qEmbedData.data[0].embedding;

    // 计算与所有 chunks 的相似度
    const results = chunksStore.map(chunk => ({
      content: chunk.content,
      noteFilename: chunk.noteFilename,
      embedScore: cosineSimilarity(questionEmbedding, chunk.embedding),
    }));

    // 按 Embedding 相似度排序，取 top 20
    results.sort((a, b) => b.embedScore - a.embedScore);
    const candidates = results.slice(0, 20);

    console.log(`Embedding 候选: ${candidates.length} 个`);

    // ============ Reranker: 用 LLM 判断真正相关性 ============
    const rerankedResults = await Promise.all(
      candidates.map(async (candidate) => {
        // 让 LLM 评估这段内容是否能回答问题
        const rerankPrompt = `你是一个相关性评估器。

问题：「${question}」
候选内容：「${candidate.content}」

请判断这个候选内容能否回答问题。回答格式：
- 如果能回答：返回数字 0-10 表示相关性得分（10分最高）
- 如果不能回答：返回 -1

只返回一个数字，不要有其他文字。`;

        const rerankResponse = await fetch(
          "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "qwen-turbo",
              messages: [{ role: "user", content: rerankPrompt }],
              maxTokens: 10,
            }),
          }
        );

        const rerankData = await rerankResponse.json();
        const responseText = rerankData.choices?.[0]?.message?.content?.trim() || "";

        // 解析得分
        const match = responseText.match(/-?\d+/);
        let rerankScore = match ? parseInt(match[0]) : 0;

        // 如果返回 -1 或无法解析，当作 0 分
        if (rerankScore < 0) rerankScore = 0;

        return {
          ...candidate,
          rerankScore,
        };
      })
    );

    // 按 Reranker 得分排序，取 top 5
    rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);
    const relevantChunks = rerankedResults.filter(r => r.rerankScore > 0).slice(0, 5);

    console.log(`Reranker 筛选后: ${relevantChunks.length} 个相关块`);

    // 构建上下文
    const contextParts = relevantChunks.map((r, i) => `[${i + 1}] ${r.content}`).join("\n\n");

    // 调用阿里千问生成答案
    const qwenResponse = await fetch(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen-turbo",
          messages: [
            {
              role: "system",
              content: "你是一个问答助手。根据提供的上下文回答用户问题。如果找不到相关信息，请如实说明。每当引用上下文内容时，用 [数字] 标注来源，例如：[1]、[2]。"
            },
            {
              role: "user",
              content: `【相关上下文】\n${contextParts}\n\n【用户问题】\n${question}\n\n请根据以上上下文回答问题，并标注来源。`
            }
          ],
        }),
      }
    );

    const qwenData = await qwenResponse.json();

    if (qwenData.error) {
      return Response.json({ error: `生成答案失败: ${qwenData.error.message || qwenData.error}` }, { status: 500 });
    }

    const answer = qwenData.choices?.[0]?.message?.content || "生成答案失败";

    // 返回答案和引用，用于点击跳转
    return Response.json({
      answer,
      references: relevantChunks.map((r, i) => ({
        index: i + 1,
        content: r.content,
        score: r.rerankScore,
      })),
    });
  } catch (error) {
    console.error("问答错误:", error);
    return Response.json({ error: error instanceof Error ? error.message : "未知错误" }, { status: 500 });
  }
}