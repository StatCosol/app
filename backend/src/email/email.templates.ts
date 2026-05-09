export function baseHtml(title: string, bodyHtml: string) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:16px">
    <div style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;background:#fff">
      <h2 style="margin:0 0 10px 0;font-size:18px">${title}</h2>
      <div style="font-size:14px;line-height:1.6;color:#111827">${bodyHtml}</div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0"/>
      <div style="font-size:12px;color:#6b7280">
        This is an automated notification from StatCo Solutions.
      </div>
    </div>
  </div>`;
}

export function taskLine(
  taskId: number,
  clientId: number,
  dueDate?: string,
  status?: string,
) {
  return `
    <div style="margin:10px 0;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb">
      <div><b>Task ID:</b> ${taskId}</div>
      <div><b>Client ID:</b> ${clientId}</div>
      ${dueDate ? `<div><b>Due Date:</b> ${dueDate}</div>` : ''}
      ${status ? `<div><b>Status:</b> ${status}</div>` : ''}
    </div>`;
}
