import * as vscode from 'vscode';
import * as path from 'path';
import type { HistoryEntry } from '@promptrev/core';
import { getHistoryManager } from './history-manager';

type WebviewMessage =
  | { type: 'restore'; id: string }
  | { type: 'export' }
  | { type: 'clear' };

export class HistoryPanelProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'promptrev.history';

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      const manager = getHistoryManager();

      switch (message.type) {
        case 'restore': {
          const original = manager.restore(message.id);
          if (original) {
            await vscode.env.clipboard.writeText(original);
            vscode.window.showInformationMessage('PromptRev: Original prompt copied to clipboard.');
          }
          break;
        }
        case 'export': {
          await this._exportHistory(manager.export());
          break;
        }
        case 'clear': {
          const confirm = await vscode.window.showWarningMessage(
            'Clear all PromptRev history?',
            { modal: true },
            'Clear'
          );
          if (confirm === 'Clear') {
            manager.clear();
            this.refresh();
          }
          break;
        }
      }
    });
  }

  /** Call after each enhancement to push updated entries to the panel. */
  refresh(): void {
    if (!this._view) return;
    const entries = getHistoryManager().getAll();
    void this._view.webview.postMessage({ type: 'update', entries });
  }

  private async _exportHistory(json: string): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    const rootUri = folders?.[0]?.uri;

    if (!rootUri) {
      // No workspace — write to clipboard instead
      await vscode.env.clipboard.writeText(json);
      vscode.window.showInformationMessage('PromptRev: History JSON copied to clipboard (no workspace open).');
      return;
    }

    const fileUri = vscode.Uri.joinPath(rootUri, 'promptrev-history.json');
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(json, 'utf8'));
    const open = await vscode.window.showInformationMessage(
      'PromptRev: History exported to promptrev-history.json',
      'Open File'
    );
    if (open === 'Open File') {
      await vscode.window.showTextDocument(fileUri);
    }
  }

  private _buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 8px;
    }

    .toolbar {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }

    button {
      font-family: var(--vscode-font-family);
      font-size: 11px;
      padding: 3px 8px;
      cursor: pointer;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.danger {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
      border-color: var(--vscode-inputValidation-errorBorder, transparent);
    }

    .empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 12px 4px;
    }

    .entry {
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .entry-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      background: var(--vscode-sideBarSectionHeader-background);
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    }

    .badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .timestamp {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      margin-left: auto;
    }

    .entry-body {
      padding: 7px 8px;
    }

    .label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
    }

    .snippet {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      border-radius: 2px;
      padding: 4px 6px;
      margin-bottom: 6px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .entry-footer {
      padding: 5px 8px 7px;
      display: flex;
      gap: 5px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" id="btn-export">Export JSON</button>
    <button class="danger" id="btn-clear">Clear History</button>
  </div>

  <div id="list"><p class="empty">No history yet. Enhance a prompt with @rev to get started.</p></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('btn-export').addEventListener('click', () => {
      vscode.postMessage({ type: 'export' });
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      vscode.postMessage({ type: 'clear' });
    });

    function truncate(text, max) {
      return text.length > max ? text.slice(0, max) + '…' : text;
    }

    function timeAgo(ts) {
      const diff = Math.floor((Date.now() - ts) / 1000);
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    function renderEntries(entries) {
      const list = document.getElementById('list');
      if (!entries.length) {
        list.innerHTML = '<p class="empty">No history yet. Enhance a prompt with @rev to get started.</p>';
        return;
      }
      list.innerHTML = entries.map(e => \`
        <div class="entry">
          <div class="entry-header">
            <span class="badge">\${e.modifier}</span>
            <span class="timestamp">\${timeAgo(e.timestamp)}</span>
          </div>
          <div class="entry-body">
            <div class="label">Original</div>
            <div class="snippet">\${escHtml(truncate(e.original, 120))}</div>
            <div class="label">Revised</div>
            <div class="snippet">\${escHtml(truncate(e.revised, 120))}</div>
          </div>
          <div class="entry-footer">
            <button onclick="restore('\${e.id}')">Restore Original</button>
          </div>
        </div>
      \`).join('');
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function restore(id) {
      vscode.postMessage({ type: 'restore', id });
    }

    window.addEventListener('message', e => {
      // Only accept messages from the extension host (same origin)
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'update') renderEntries(e.data.entries);
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
