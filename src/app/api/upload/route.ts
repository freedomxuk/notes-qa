/**
 * 文件解析接口
 * 支持 txt、md、docx、xlsx 格式
 */

import mammoth from "mammoth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "没有文件" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    let content = "";

    if (ext === "pdf") {
      // PDF 不支持，请用户复制内容保存为 txt
      return Response.json({
        error: "暂不支持 PDF 格式。请将 PDF 内容复制保存为 .txt 文件后上传。"
      }, { status: 400 });
    } else if (ext === "docx") {
      // Word 解析 - 需要 { buffer: Buffer } 格式
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      content = result.value;
    } else if (ext === "xlsx" || ext === "xls") {
      // Excel 解析
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "buffer" });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        content += `=== Sheet: ${sheetName} ===\n`;
        content += XLSX.utils.sheet_to_csv(sheet) + "\n";
      }
    } else {
      // 纯文本：.txt, .md 等
      content = await file.text();
    }

    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    content = content.replace(/\n{3,}/g, "\n\n");

    return Response.json({
      filename: file.name,
      content,
      wordCount: content.replace(/\s/g, "").length,
    });
  } catch (error) {
    console.error("解析失败:", error);
    return Response.json(
      { error: `解析失败: ${error instanceof Error ? error.message : "未知错误"}` },
      { status: 500 }
    );
  }
}
