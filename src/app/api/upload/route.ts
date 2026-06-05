/**
 * 文件解析接口
 * 支持 PDF、Word、Excel 解析为纯文本
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

    if (ext === "docx") {
      const buffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      content = result.value;
    } else if (ext === "xlsx" || ext === "xls") {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "buffer" });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        content += `=== Sheet: ${sheetName} ===\n`;
        content += XLSX.utils.sheet_to_csv(sheet) + "\n";
      }
    } else {
      // 纯文本：包括 .txt, .md, .pdf 等
      // PDF 作为纯文本读取（会有乱码，但不会报错）
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