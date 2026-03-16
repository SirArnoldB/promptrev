import * as vscode from 'vscode';
import { BUILT_IN_MODIFIERS } from '@promptrev/core';
import type { ModifierDefinition } from '@promptrev/core';

export interface ProjectConfig {
  domainContext?: string;
  modifiers?: Record<string, Partial<ModifierDefinition>>;
}

const CONFIG_FILENAME = '.promptrev.json';

/**
 * Loads, watches, and merges .promptrev.json with VS Code settings.
 *
 * Merge precedence (highest → lowest):
 *   .promptrev.json  >  settings.json (promptrev.modifiers)  >  built-ins
 *
 * domainContext: project value prepended to the global settings value.
 */
export class ProjectConfigProvider {
  private _config: ProjectConfig = {};
  private _watcher?: vscode.FileSystemWatcher;
  private readonly _onDidChange = new vscode.EventEmitter<ProjectConfig>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async init(): Promise<void> {
    await this._reload();
    this._startWatcher();
  }

  /** Raw config from .promptrev.json only. */
  getProjectConfig(): ProjectConfig {
    return this._config;
  }

  /**
   * Merged modifiers: settings.json modifiers overridden by .promptrev.json modifiers.
   * Project config wins on key conflict.
   */
  getMergedModifiers(): Record<string, Partial<ModifierDefinition>> {
    const settings = vscode.workspace
      .getConfiguration('promptrev')
      .get<Record<string, Partial<ModifierDefinition>>>('modifiers') ?? {};
    return { ...settings, ...this._config.modifiers };
  }

  /**
   * Merged domainContext: project value prepended to global settings value.
   * e.g. project="React + TS"  global="PostgreSQL"  →  "React + TS. PostgreSQL"
   */
  getMergedDomainContext(): string | undefined {
    const global =
      vscode.workspace.getConfiguration('promptrev').get<string>('domainContext') ?? '';
    const project = this._config.domainContext ?? '';
    const merged = [project, global].filter(Boolean).join('. ');
    return merged || undefined;
  }

  /**
   * Returns true if the modifier key is known (built-in or user-defined).
   * Used to decide whether to show the "unknown modifier" fallback notice.
   */
  isKnownModifier(key: string): boolean {
    return key in BUILT_IN_MODIFIERS || key in this.getMergedModifiers();
  }

  private async _reload(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this._config = {};
      return;
    }

    const fileUri = vscode.Uri.joinPath(folder.uri, CONFIG_FILENAME);
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      this._config = this._validate(raw);
    } catch (err) {
      if (err instanceof SyntaxError) {
        vscode.window.showWarningMessage(
          `PromptRev: Malformed .promptrev.json — ${err.message}. Falling back to defaults.`
        );
      }
      // File absent or unreadable — silently use empty config
      this._config = {};
    }
  }

  private _validate(raw: unknown): ProjectConfig {
    if (typeof raw !== 'object' || raw === null) {
      vscode.window.showWarningMessage(
        'PromptRev: .promptrev.json must be a JSON object. Falling back to defaults.'
      );
      return {};
    }
    const obj = raw as Record<string, unknown>;
    const result: ProjectConfig = {};

    if (typeof obj.domainContext === 'string') {
      result.domainContext = obj.domainContext;
    }

    if (typeof obj.modifiers === 'object' && obj.modifiers !== null && !Array.isArray(obj.modifiers)) {
      result.modifiers = obj.modifiers as Record<string, Partial<ModifierDefinition>>;
    }

    return result;
  }

  private _startWatcher(): void {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;

    const pattern = new vscode.RelativePattern(folder, CONFIG_FILENAME);
    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const reload = async () => {
      await this._reload();
      this._onDidChange.fire(this._config);
    };

    this._watcher.onDidChange(reload, undefined, this._context.subscriptions);
    this._watcher.onDidCreate(reload, undefined, this._context.subscriptions);
    this._watcher.onDidDelete(async () => {
      this._config = {};
      this._onDidChange.fire(this._config);
    }, undefined, this._context.subscriptions);

    this._context.subscriptions.push(this._watcher, this._onDidChange);
  }
}
