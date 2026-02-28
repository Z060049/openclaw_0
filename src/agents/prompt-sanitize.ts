/**
 * 清洗发往 Web 平台（Manus、ChatGPT Web、Grok Web、Qwen Web 等）的用户输入。
 * 移除 Control UI 注入的元数据块和时间戳信封，避免平台识别自动化并降低风控风险。
 */

/** 移除消息开头的 [Dow YYYY-MM-DD HH:MM TZ] 时间戳信封 */
const TIMESTAMP_ENVELOPE = /^\[[^\]]*\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}[^\]]*\]\s*/;

/**
 * 移除 Control UI 注入的元数据块和时间戳，仅保留用户实际输入内容。
 * 适用于发往各类 Web 聊天平台（manus.im、chatgpt.com、grok.com 等）。
 */
export function stripForWebProvider(text: string): string {
  let out = text;
  // 移除 "Conversation info (untrusted metadata):" ... "```" 及同类块
  const blockPattern = /\n*Conversation info \(untrusted metadata\):\s*\n```(?:json)?\n[\s\S]*?\n```/gi;
  out = out.replace(blockPattern, "");
  const senderPattern = /\n*Sender \(untrusted metadata\):\s*\n```(?:json)?\n[\s\S]*?\n```/gi;
  out = out.replace(senderPattern, "");
  const threadPattern = /\n*Thread starter \(untrusted[^)]*\):\s*\n```(?:json)?\n[\s\S]*?\n```/gi;
  out = out.replace(threadPattern, "");
  const replyPattern = /\n*Replied message \(untrusted[^)]*\):\s*\n```(?:json)?\n[\s\S]*?\n```/gi;
  out = out.replace(replyPattern, "");
  const fwdPattern = /\n*Forwarded message context \(untrusted metadata\):\s*\n```(?:json)?\n[\s\S]*?\n```/gi;
  out = out.replace(fwdPattern, "");
  const historyPattern = /\n*Chat history since last reply \(untrusted[^)]*\):\s*\n```(?:json)?\n[\s\S]*?\n```/gi;
  out = out.replace(historyPattern, "");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  out = out.replace(TIMESTAMP_ENVELOPE, "");
  return out.trim();
}
