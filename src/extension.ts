import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

type Match = {
    key: string;
    range: vscode.Range;
    value: string;
    locale: string;
};

type Translations = Record<string, string>;

const LOCALE_FILES: Record<string, string> = {
    en: path.join('packages', 'shared', 'src', 'i18n', 'locales', 'en.ts'),
    fr: path.join('packages', 'shared', 'src', 'i18n', 'locales', 'fr.ts'),
};

// group 1 = opening quote (empty → variable locale, use selected locale); group 2 = locale value; group 3 = key
const make_call_res = () => ({
    t: /i18n\.t\(['"`](\w+)['"`](?:,\s*[^)]+)?\)/g,
    locals: /locals\.translate\(['"`](\w+)['"`](?:,\s*[^)]+)?\)/g,
    translate: /i18n\.translate\((['"`]?)([\w.]+)\1,\s*['"`](\w+)['"`](?:,\s*[^)]+)?\)/g,
});

const make_entry_res = () => ({
    fn: /^\s+(\w+):\s+\([^)]*\)\s+=>\s+`([^`]*)`/gm,
    single: /^\s+(\w+):\s+'((?:[^'\\]|\\.)*)'/gm,
    double: /^\s+(\w+):\s+"((?:[^"\\]|\\.)*)"/gm,
    backtick: /^\s+(\w+):\s+`([^`$]*)`/gm,
});

let all_key_lines: Record<string, Record<string, number>> = {};
let collapsed_type: vscode.TextEditorDecorationType;
let all_translations: Record<string, Translations> = {};
let selected_locale = 'en';

const BEFORE_STYLE: vscode.ThemableDecorationAttachmentRenderOptions = {
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
    margin: '0 2px',
    border: '1px solid',
    fontStyle: 'italic',
    borderColor: new vscode.ThemeColor('editorCodeLens.foreground'),
    textDecoration: 'none; padding: 0 4px; border-radius: 3px;',
};

const create_collapsed_type = (): vscode.TextEditorDecorationType =>
    vscode.window.createTextEditorDecorationType({
        textDecoration: 'none; font-size: 0.001em; color: transparent;',
    });

const get_locale_file_path = (locale: string): string | undefined => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return undefined;
    const rel = LOCALE_FILES[locale];
    if (!rel) return undefined;
    return path.join(folders[0].uri.fsPath, rel);
};

const parse_translations = (content: string): Translations => {
    const result: Translations = {};
    const {fn, single, double, backtick} = make_entry_res();
    let m: RegExpExecArray | null;

    while ((m = fn.exec(content)) !== null) result[m[1]] = m[2].replace(/\$\{(\w+)\}/g, '{$1}');
    while ((m = single.exec(content)) !== null) result[m[1]] = m[2].replace(/\\'/g, "'");
    while ((m = double.exec(content)) !== null) result[m[1]] = m[2].replace(/\\"/g, '"');
    while ((m = backtick.exec(content)) !== null) result[m[1]] = m[2];

    return result;
};

const parse_key_lines = (content: string): Record<string, number> => {
    const result: Record<string, number> = {};
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s+(\w+):/);
        if (m) result[m[1]] = i;
    }
    return result;
};

const load_translations = (): void => {
    selected_locale = vscode.workspace.getConfiguration('i18n-preview').get<string>('locale', 'en');

    for (const locale of Object.keys(LOCALE_FILES)) {
        const file_path = get_locale_file_path(locale);
        if (!file_path) continue;
        try {
            const content = fs.readFileSync(file_path, 'utf-8');
            all_translations[locale] = parse_translations(content);
            all_key_lines[locale] = parse_key_lines(content);
        } catch {
            all_translations[locale] = {};
            all_key_lines[locale] = {};
        }
    }
};

const lookup = (locale: string, key: string): string | undefined => (all_translations[locale] ?? {})[key];

const is_supported_file = (file_name: string): boolean => file_name.endsWith('.svelte') || file_name.endsWith('.ts');

const find_matches = (text: string, doc: vscode.TextDocument): Match[] => {
    const matches: Match[] = [];
    const {t, locals, translate} = make_call_res();
    let m: RegExpExecArray | null;

    for (const re of [t, locals]) {
        while ((m = re.exec(text)) !== null) {
            const key = m[1];
            const value = lookup(selected_locale, key);
            if (value === undefined) continue;
            matches.push({
                key,
                range: new vscode.Range(doc.positionAt(m.index), doc.positionAt(m.index + m[0].length)),
                value,
                locale: selected_locale,
            });
        }
    }

    while ((m = translate.exec(text)) !== null) {
        const locale = m[1] !== '' ? m[2] : selected_locale;
        const key = m[3];
        const value = lookup(locale, key);
        if (value === undefined) continue;
        matches.push({
            key,
            range: new vscode.Range(doc.positionAt(m.index), doc.positionAt(m.index + m[0].length)),
            value,
            locale,
        });
    }

    return matches;
};

const update_decorations = (editor: vscode.TextEditor): void => {
    if (!is_supported_file(editor.document.fileName)) {
        editor.setDecorations(collapsed_type, []);
        return;
    }

    const text = editor.document.getText();
    const cursor_line = editor.selection.active.line;
    const matches = find_matches(text, editor.document);

    const decorations: vscode.DecorationOptions[] = matches
        .filter(m => m.range.start.line !== cursor_line)
        .map(m => ({
            range: m.range,
            renderOptions: {before: {...BEFORE_STYLE, contentText: m.value}},
        }));

    editor.setDecorations(collapsed_type, decorations);
};

const refresh_all = (): void => {
    for (const editor of vscode.window.visibleTextEditors) {
        update_decorations(editor);
    }
};

export const activate = (context: vscode.ExtensionContext): void => {
    collapsed_type = create_collapsed_type();

    load_translations();

    const watcher = vscode.workspace.createFileSystemWatcher('**/i18n/locales/*.ts');
    watcher.onDidChange(() => {
        load_translations();
        refresh_all();
    });
    context.subscriptions.push(watcher);

    const reload_cmd = vscode.commands.registerCommand('i18n-preview.reload', () => {
        load_translations();
        refresh_all();
        vscode.window.showInformationMessage('i18n: translations reloaded');
    });
    context.subscriptions.push(reload_cmd);

    const change_locale_cmd = vscode.commands.registerCommand('i18n-preview.change_locale', async () => {
        const current = vscode.workspace.getConfiguration('i18n-preview').get<string>('locale', 'en');
        const locales = Object.keys(LOCALE_FILES).map(locale => ({
            label: locale,
            description: locale === current ? '(current)' : undefined,
        }));
        const picked = await vscode.window.showQuickPick(locales, {title: 'i18n: Select locale'});
        if (!picked) return;
        await vscode.workspace.getConfiguration('i18n-preview').update('locale', picked.label, vscode.ConfigurationTarget.Global);
        load_translations();
        refresh_all();
    });
    context.subscriptions.push(change_locale_cmd);

    const open_at_line_cmd = vscode.commands.registerCommand('i18n-preview.open_at_line', async (file_path: string, line: number) => {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file_path));
        await vscode.window.showTextDocument(doc, {selection: new vscode.Range(line, 0, line, 999)});
    });
    context.subscriptions.push(open_at_line_cmd);

    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider([{pattern: '**/*.svelte'}, {pattern: '**/*.ts'}], {
            provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
                if (!is_supported_file(document.fileName)) return [];

                const text = document.getText();
                const links: vscode.DocumentLink[] = [];
                const {t, locals, translate} = make_call_res();
                let m: RegExpExecArray | null;

                const make_link = (match_index: number, match_length: number, locale: string, key: string) => {
                    const file_path = get_locale_file_path(locale);
                    const line = (all_key_lines[locale] ?? {})[key];
                    if (!file_path || line === undefined) return;

                    const args = encodeURIComponent(JSON.stringify([file_path, line]));
                    const target = vscode.Uri.parse(`command:i18n-preview.open_at_line?${args}`);
                    links.push(new vscode.DocumentLink(new vscode.Range(document.positionAt(match_index), document.positionAt(match_index + match_length)), target));
                };

                for (const re of [t, locals]) {
                    while ((m = re.exec(text)) !== null) {
                        make_link(m.index, m[0].length, selected_locale, m[1]);
                    }
                }

                while ((m = translate.exec(text)) !== null) {
                    const locale = m[1] !== '' ? m[2] : selected_locale;
                    make_link(m.index, m[0].length, locale, m[3]);
                }

                return links;
            },
        }),
    );

    context.subscriptions.push(
        vscode.languages.registerHoverProvider([{pattern: '**/*.svelte'}, {pattern: '**/*.ts'}], {
            provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
                if (!is_supported_file(document.fileName)) return undefined;

                const text = document.getText();
                const matches = find_matches(text, document);
                // When a `before` decoration is shown, VS Code maps the hover position to the
                // character immediately before range.start, so check one char to the left too.
                const match = matches.find(
                    m =>
                        m.range.contains(position) ||
                        (position.line === m.range.start.line && position.character === m.range.start.character - 1),
                );
                if (!match) return undefined;

                return new vscode.Hover(new vscode.MarkdownString(`\`${match.key}\``), match.range);
            },
        }),
    );

    vscode.workspace.onDidChangeConfiguration(
        e => {
            if (e.affectsConfiguration('i18n-preview.locale')) {
                load_translations();
                refresh_all();
            }
        },
        null,
        context.subscriptions,
    );

    vscode.window.onDidChangeActiveTextEditor(
        editor => {
            if (editor) update_decorations(editor);
        },
        null,
        context.subscriptions,
    );

    vscode.workspace.onDidChangeTextDocument(
        event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                update_decorations(editor);
            }
        },
        null,
        context.subscriptions,
    );

    vscode.window.onDidChangeTextEditorSelection(
        event => {
            update_decorations(event.textEditor);
        },
        null,
        context.subscriptions,
    );

    for (const editor of vscode.window.visibleTextEditors) {
        update_decorations(editor);
    }
};

export const deactivate = (): void => {
    collapsed_type?.dispose();
};
