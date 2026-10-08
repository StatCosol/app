import { Pipe, PipeTransform } from '@angular/core';
import { IconName } from './icon/icon.component';

export function actionIconName(label: unknown): IconName {
  const text = String(label ?? '').replace(/^[^a-z]+/i, '').toLowerCase();
  if (/^(download|export|print)/.test(text)) return text.startsWith('print') ? 'printer' : 'download';
  if (/^(upload|import|reupload)/.test(text)) return 'upload';
  if (/^(approve|verify|acknowledge|resolve|activate|complete|mark paid)/.test(text)) return 'check-circle';
  if (/^(reject|withdraw|deactivate)/.test(text)) return 'x-circle';
  if (/^(delete|remove)/.test(text)) return 'trash';
  if (/^(edit|update|revise)/.test(text)) return 'pencil';
  if (/^(add|new|create|register)/.test(text)) return 'plus';
  if (/^(refresh|load|retry|reload|run|generate|recompute|recalculate)/.test(text)) return 'refresh';
  if (/^(send|resend|remind|notify)/.test(text)) return 'send';
  if (/^(search|apply)/.test(text)) return 'search';
  if (/^(reset|clear|revert|restore|reopen|re-open)/.test(text)) return 'undo';
  if (/^(assign|unassign|manage|configure)/.test(text)) return 'cog';
  if (/^(view|preview|review|compare|conduct)/.test(text)) return 'eye';
  if (/^(submit|publish)/.test(text)) return 'send';
  return 'arrow-right';
}

@Pipe({ name: 'actionIcon', standalone: true })
export class ActionIconPipe implements PipeTransform {
  transform(label: unknown): IconName { return actionIconName(label); }
}
