"use client";

import { useState, useRef, useEffect, useMemo } from "react";

interface Note {
  id: string;
  filename: string;
  content: string;
  wordCount: number;
  uploadedAt: Date;
}

// 从 localStorage 读取笔记
const loadNotesFromStorage = (): Note[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem('notes-qa-notes');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [references, setReferences] = useState<{index: number; content: string}[]>([]);
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 页面加载时从 localStorage 读取
  useEffect(() => {
    const savedNotes = loadNotesFromStorage();
    if (savedNotes.length > 0) {
      setNotes(savedNotes);
    }
  }, []);

  // 笔记变化时保存到 localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && notes.length > 0) {
      localStorage.setItem('notes-qa-notes', JSON.stringify(notes));
    }
  }, [notes]);

  // 删除笔记
  const deleteNote = (id: string) => {
    if (confirm('确定要删除这篇笔记吗？')) {
      setNotes(prev => prev.filter(n => n.id !== id));
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
        setAnswer('');
        setQuestion('');
      }
    }
  };

  // 问答功能（搜索所有笔记）
  const handleAskQuestion = async () => {
    if (!question.trim() || notes.length === 0 || isAsking) return;

    setIsAsking(true);
    setAnswer('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // 限制内容大小，只发送前 10000 字符
      const MAX_CHARS = 10000;
      const limitedNotes = notes.map(n => ({
        id: n.id,
        filename: n.filename,
        content: n.content.slice(0, MAX_CHARS),
      }));

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          allNotes: limitedNotes,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        setAnswer(data.answer);
        setReferences(data.references || []);
      }
    } catch (error: any) {
      console.error('Fetch error:', error);
      alert(error.name === 'AbortError' ? '请求超时' : '请求失败');
    } finally {
      clearTimeout(timeoutId);
      setIsAsking(false);
    }
  };

  // 选中笔记后自动进入编辑模式
  const handleSelectNote = (note: Note) => {
    if (selectedNoteId === note.id && editingNoteId === note.id) {
      // 已经选中且在编辑中，再次点击变为浏览模式
      setEditingNoteId(null);
    } else {
      // 选中进入编辑模式
      setSelectedNoteId(note.id);
      setEditingNoteId(note.id);
      setEditContent(note.content);
    }
  };

  // 保存后变为浏览模式
  const saveEditAndView = () => {
    if (editingNoteId) {
      setNotes(prev => prev.map(n =>
        n.id === editingNoteId
          ? { ...n, content: editContent, wordCount: editContent.replace(/\s/g, '').length }
          : n
      ));
      // 保存后退出编辑模式，进入浏览模式
      setEditingNoteId(null);
    }
  };

  // 文件解析 - 调用后端API
  const parseFile = async (file: File): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      return data.content;
    } catch (error) {
      console.error('解析文件失败:', error);
      throw new Error(`无法解析 ${file.name} 文件`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      // 检查文件大小 (最大10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`文件 ${file.name} 太大，请上传小于10MB的文件`);
        continue;
      }

      try {
        const content = await parseFile(file);
        const wordCount = content.replace(/\s/g, '').length;

        const newNote: Note = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          filename: file.name,
          content,
          wordCount,
          uploadedAt: new Date(),
        };

        setNotes(prev => [...prev, newNote]);
      } catch (error) {
        console.error('解析文件失败:', error);
        alert(`无法解析文件 ${file.name}，请确保文件格式正确`);
      }
    }

    setIsUploading(false);
    // 清空 input 以便重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddNoteClick = () => {
    fileInputRef.current?.click();
  };

  // 高亮显示引用部分的内容
  const highlightContent = (content: string, highlight: string | null, refIdx: number) => {
    if (!highlight || !content) {
      return <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">{content}</pre>;
    }

    // 找到高亮内容在原文中的位置
    const highlightPos = content.indexOf(highlight);
    if (highlightPos === -1) {
      return <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">{content}</pre>;
    }

    // 提取高亮部分前后的内容
    const before = content.slice(0, highlightPos);
    const match = highlight;
    const after = content.slice(highlightPos + highlight.length);

    return (
      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
        {before}
        <mark className="bg-yellow-200 text-yellow-900 px-1 rounded border-l-4 border-yellow-500">
          {match}
          {refIdx > 0 && <sup className="ml-1 text-xs text-yellow-600">[{refIdx}]</sup>}
        </mark>
        {after}
      </pre>
    );
  };

  return (
    <div className="flex h-screen bg-white">
      {/* 左侧栏 - 笔记列表 */}
      <aside className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={handleAddNoteClick}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加笔记
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.docx,.xlsx,.xls"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
        <div className="flex-1 p-4 overflow-auto">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">暂无笔记</p>
              <p className="text-xs">上传你的第一篇笔记</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  data-note-id={note.id}
                  key={note.id}
                  onClick={() => handleSelectNote(note)}
                  onMouseEnter={() => setHoveredNoteId(note.id)}
                  onMouseLeave={() => setHoveredNoteId(null)}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors group relative ${
                    selectedNoteId === note.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-sm truncate">{note.filename}</p>
                  <p className="text-xs text-gray-400 mt-1">{note.wordCount} 字</p>
                  {/* 删除按钮 - 悬停时显示 */}
                  {hoveredNoteId === note.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                      className="absolute top-2 right-2 p-1 text-red-500 hover:bg-red-100 rounded"
                      title="删除笔记"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {notes.length > 0 && (
          <div className="p-3 border-t border-gray-200 text-xs text-gray-400 flex justify-between">
            <span>{notes.length} 篇笔记</span>
            <span>共 {notes.reduce((sum, n) => sum + n.wordCount, 0)} 字</span>
          </div>
        )}
        {isUploading && (
          <div className="p-3 border-t border-gray-200">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
            </div>
            <p className="text-xs text-center text-gray-400 mt-1">上传中...</p>
          </div>
        )}
      </aside>

      {/* 右侧栏 - 编辑/浏览/问答区 */}
      <main className="flex-1 flex flex-col">
        {/* 笔记编辑区 */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-2xl mx-auto h-full">
            {selectedNoteId ? (
              editingNoteId === selectedNoteId ? (
                // 编辑模式
                <div className="flex flex-col h-full">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 w-full p-4 border border-gray-300 rounded-lg font-sans text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 mt-3 justify-end">
                    <button
                      onClick={() => {
                        setSelectedNoteId(null);
                        setAnswer('');
                        setQuestion('');
                        setReferences([]);
                        setEditingNoteId(null);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      关闭
                    </button>
                    <button
                      onClick={saveEditAndView}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                // 浏览模式 - 保存后浮动显示
                <div className="flex flex-col h-full">
                  <div className="flex-1 prose prose-sm max-w-none overflow-auto">
                    {highlightedRef ? highlightContent(
                      notes.find(n => n.id === selectedNoteId)?.content || '',
                      highlightedRef,
                      references.findIndex(r => r && notes.find(n => n.id === selectedNoteId)?.content.includes(r.content.slice(0, 30))) + 1
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                        {notes.find(n => n.id === selectedNoteId)?.content}
                      </pre>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 justify-end">
                    <button
                      onClick={() => {
                        const note = notes.find(n => n.id === selectedNoteId);
                        if (note) {
                          setEditingNoteId(note.id);
                          setEditContent(note.content);
                        }
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setSelectedNoteId(null)}
                      className="px-4 py-2 text-gray-500 hover:text-gray-700"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="text-center text-gray-400 mt-20">
                <h2 className="text-xl font-medium mb-2">欢迎使用 Notes QA</h2>
                <p className="text-sm">点击左侧笔记开始编辑，或上传新笔记</p>
              </div>
            )}
          </div>
        </div>

        {/* 输入区 */}
        <div className="p-4 border-t border-gray-200">
          <div className="max-w-2xl mx-auto">
            {/* AI 回答结果显示 */}
            {answer && (
              <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-600 font-medium mb-1">AI 回答</p>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {answer.split(/(\[\d+\])/).map((part, i) => {
                    const match = part.match(/\[(\d+)\]/);
                    if (match) {
                      const idx = parseInt(match[1]) - 1;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            const ref = references[idx];
                            if (ref) {
                              // 找到包含这段内容的笔记并选中
                              const noteWithContent = notes.find(n => n.content.includes(ref.content.slice(0, 50)));
                              if (noteWithContent) {
                                setSelectedNoteId(noteWithContent.id);
                                setHighlightedRef(ref.content.slice(0, 100)); // 保存高亮内容
                                // 滚动到笔记列表
                                const noteEl = document.querySelector(`[data-note-id="${noteWithContent.id}"]`);
                                noteEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }
                          }}
                          className="text-blue-600 hover:text-blue-800 underline mx-0.5 cursor-pointer font-medium"
                        >
                          {part}
                        </button>
                      );
                    }
                    return part;
                  })}
                </div>
              </div>
            )}

            {/* 加载状态 */}
            {isAsking && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span className="text-sm text-blue-600">AI 思考ing...</span>
              </div>
            )}

            {/* 问题输入 */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="问关于笔记的问题..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={notes.length === 0}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAskQuestion();
                  }
                }}
              />
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={notes.length === 0 || isAsking || !question.trim()}
                onClick={handleAskQuestion}
              >
                {isAsking ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}