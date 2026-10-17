const vscode = require('vscode');
const { collect } = require('./git');
const { analyze } = require('./analyze');
const { renderDocument, renderError, nonce } = require('./render');

const panelType = 'gitVigil';
let openPanel;

function config() {
  const cfg = vscode.workspace.getConfiguration('gitVigil');
  const maxCommits = Number(cfg.get('maxCommits')) || 60000;
  const statCommits = Number(cfg.get('statCommits')) || 6000;
  return {
    maxCommits: maxCommits > 0 ? maxCommits : 60000,
    statCommits: statCommits > 0 ? Math.min(statCommits, maxCommits) : 6000,
    includeAllBranches: cfg.get('includeAllBranches') !== false,
  };
}

async function summary(cwd) {
  const repo = await collect(cwd, config());
  return analyze(repo);
}

function showHtml(panel, html) {
  panel.webview.html = html;
}

async function reveal(cwd) {
  if (!openPanel) {
    openPanel = vscode.window.createWebviewPanel(panelType, 'Git Vigil', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    openPanel.onDidDispose(() => (openPanel = undefined));
    openPanel._cwd = cwd;
    openPanel.webview.onDidReceiveMessage(async (message) => {
      if (message && message.type === 'refresh') await keepVigil(openPanel._cwd);
    });
  } else {
    openPanel._cwd = cwd || openPanel._cwd;
    openPanel.reveal(vscode.ViewColumn.One);
  }
  return openPanel;
}

async function keepVigil(cwd) {
  const panel = await reveal(cwd);
  const folders = vscode.workspace.workspaceFolders || [];
  const target = cwd || (folders[0] && folders[0].uri.fsPath);
  if (panel) panel._cwd = target;

  if (!target) {
    showHtml(panel, renderError('No folder open', 'Open a repository, then run "Git Vigil: Keep the vigil" again.', nonce()));
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Git Vigil — reading the history' },
    async () => {
      try {
        const data = await summary(target);
        panel.webview.html = renderDocument(data, nonce(), { vscodeApi: true });
      } catch (error) {
        const code = String(error && error.message);
        if (code === 'no-commits') {
          showHtml(panel, renderError('Nothing to keep vigil for', 'This repository has no commits yet.', nonce()));
        } else if (code.includes('not a git repository') || error && error.code === 'ENOENT') {
          showHtml(panel, renderError('Not a git repository', `${target} is not tracked by git, or git is not on the PATH.`, nonce()));
        } else {
          showHtml(panel, renderError('The vigil could not be kept', code, nonce()));
        }
      }
    }
  );
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitVigil.open', () => keepVigil()),
    vscode.commands.registerCommand('gitVigil.openForFile', (_uri, list) => {
      const first = list && list[0];
      keepVigil(_uri ? _uri.fsPath : first ? first.fsPath : undefined);
    })
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.text = '$(clock) vigil';
  status.tooltip = 'Git Vigil: keep the vigil';
  status.command = 'gitVigil.open';
  status.show();
  context.subscriptions.push(status);
}

function deactivate() {
  if (openPanel) openPanel.dispose();
}

module.exports = { activate, deactivate };
