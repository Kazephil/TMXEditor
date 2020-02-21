/*****************************************************************************
Copyright (c) 2018-2020 - Maxprograms,  http://www.maxprograms.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to compile,
modify and use the Software in its executable form without restrictions.

Redistribution of this Software or parts of it in any form (source code or
executable binaries) requires prior written permission from Maxprograms.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*****************************************************************************/

import { Buffer } from "buffer";
import { execFileSync, spawn } from "child_process";
import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, shell, webContents, nativeTheme } from "electron";
import { existsSync, mkdirSync, readFile, readFileSync, writeFile, writeFileSync } from "fs";
import { ClientRequest, request, IncomingMessage } from "http";
const https = require('https');

app.allowRendererProcessReuse = true;

var mainWindow: BrowserWindow;
var replaceTextWindow: BrowserWindow;
var filtersWindow: BrowserWindow;
var consolidateWindow: BrowserWindow;
var removeUntranslatedWindow: BrowserWindow;
var settingsWindow: BrowserWindow;
var sortUnitsWindow: BrowserWindow;
var changeLanguageWindow: BrowserWindow;
var newFileWindow: BrowserWindow;
var addLanguageWindow: BrowserWindow;
var removeLanguageWindow: BrowserWindow;
var srcLanguageWindow: BrowserWindow;
var splitFileWindow: BrowserWindow;
var mergeFilesWindow: BrowserWindow;


var contents: webContents;
var javapath: string = app.getAppPath() + '/bin/java';
var appHome: string = app.getPath('appData') + '/tmxeditor/';
var stopping: boolean = false;
var fileLanguages: any[];
var currentDefaults: any;
var currentStatus: any = {};
var currentPreferences: any;
var currentTheme: string;
var filterOptions: any = {};
var loadOptions: any = {
    start: 0,
    count: 200
};
var sortOptions: any = {};

var currentFile: string = '';
var saved: boolean = true;
var needsName: boolean = false;

const SUCCESS: string = 'Success';
const LOADING: string = 'Loading';
const COMPLETED: string = 'Completed';
const ERROR: string = 'Error';
const SAVING: string = 'Saving';
const PROCESSING: string = 'Processing';

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    if (mainWindow) {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.focus();
    }
}

if (process.platform == 'win32') {
    javapath = app.getAppPath() + '\\bin\\java.exe';
    appHome = app.getPath('appData') + '\\tmxeditor\\';
}

if (!existsSync(appHome)) {
    mkdirSync(appHome, { recursive: true });
}

const ls = spawn(javapath, ['-cp', 'lib/h2-1.4.200.jar', '--module-path', 'lib', '-m', 'tmxserver/com.maxprograms.tmxserver.TMXServer', '-port', '8060'], { cwd: app.getAppPath() });

ls.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
});

ls.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
});

ls.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
});

var ck: Buffer = execFileSync('bin/java', ['--module-path', 'lib', '-m', 'openxliff/com.maxprograms.server.CheckURL', 'http://localhost:8060/TMXserver'], { cwd: app.getAppPath() });
console.log(ck.toString());

app.on('open-file', function (event, filePath) {
    event.preventDefault();
    openFile(filePath);
});

loadDefaults();
loadPreferences();

app.on('ready', function () {
    createWindow();
    mainWindow.loadURL('file://' + app.getAppPath() + '/index.html');
    mainWindow.on('resize', function () {
        saveDefaults();
    });
    mainWindow.on('move', function () {
        saveDefaults();
    });
    mainWindow.show();
    // contents.openDevTools();
    setTheme();
    checkUpdates(true);
});

app.on('quit', function () {
    stopServer();
});

app.on('window-all-closed', function () {
    stopServer();
    app.quit();
});

if (process.platform === 'darwin') {
    app.on('open-file', function (event, path) {
        event.preventDefault();
        openFile(path);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        title: 'TMXEditor',
        width: currentDefaults.width,
        height: currentDefaults.height,
        x: currentDefaults.x,
        y: currentDefaults.y,
        useContentSize: true,
        webPreferences: {
            nodeIntegration: true
        },
        show: false,
        icon: 'icons/tmxeditor.png'
    });
    contents = mainWindow.webContents;
    var fileMenu: Menu = Menu.buildFromTemplate([
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: function () { createNewFile(); } },
        { label: 'Open', accelerator: 'CmdOrCtrl+O', click: function () { openFileDialog(); } },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', click: function () { closeFile(); } },
        { label: 'Save', accelerator: 'CmdOrCtrl+s', click: function () { saveFile(); } },
        { label: 'Save As', click: function () { saveAs() } },
        new MenuItem({ type: 'separator' }),
        { label: 'Convert CSV/TAB Delimited to TMX', click: function () { convertCSV(); } },
        { label: 'Export as TAB Delimited...', click: function () { exportDelimited(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'File Properties', click: function () { showFileInfo(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Validate TMX File...', click: function () { validateFile(); } },
        { label: 'Clean Invalid Characters...', click: function () { cleanCharacters(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Split TMX File...', click: function () { splitFile(); } },
        { label: 'Merge TMX Files...', click: function () { mergeFiles(); } }
    ]);
    var editMenu: Menu = Menu.buildFromTemplate([
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: function () { contents.undo(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: function () { contents.cut(); } },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: function () { contents.copy(); } },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: function () { contents.paste(); } },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: function () { contents.selectAll(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Confirm Edit', accelerator: 'Alt+Enter', click: function () { saveEdits(); } },
        { label: 'Cancel Edit', accelerator: 'Esc', click: function () { cancelEdit(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Replace Text...', accelerator: 'CmdOrCtrl+F', click: function () { replaceText(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Insert Unit', click: function () { insertUnit(); } },
        { label: 'Delete Selected Units', click: function () { deleteUnits(); } }
    ]);
    var viewMenu: Menu = Menu.buildFromTemplate([
        { label: 'Sort Units', accelerator: 'F5', click: function () { sortUnits(); } },
        { label: 'Filter Units', accelerator: 'F3', click: function () { showFilters() } },
        new MenuItem({ type: 'separator' }),
        { label: 'Show First Page', click: function () { firstPage(); } },
        { label: 'Show Previous Page', click: function () { previousPage(); } },
        { label: 'Show Next Page', click: function () { nextPage(); } },
        { label: 'Show Last Page', click: function () { lastPage(); } },
        new MenuItem({ type: 'separator' }),
        new MenuItem({ label: 'Toggle Full Screen', role: 'togglefullscreen' }),
        new MenuItem({ label: 'Toggle Development Tools', accelerator: 'F12', role: 'toggleDevTools' }),
    ]);
    var tasksMenu: Menu = Menu.buildFromTemplate([
        { label: 'Change Language Code...', click: function () { changeLanguageCode(); } },
        { label: 'Add Language...', click: function () { addLanguage(); } },
        { label: 'Remove Language...', click: function () { removeLanguage() } },
        { label: 'Change Source Language...', click: function () { changeSourceLanguage(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Remove All Tags', click: function () { removeTags(); } },
        { label: 'Remove Duplicates', click: function () { removeDuplicates(); } },
        { label: 'Remove Untranslated...', click: function () { removeUntranslated(); } },
        { label: 'Remove Initial/Trailing Spaces', click: function () { removeSpaces(); } },
        { label: 'Consolidate Units...', click: function () { consolidateUnits(); } }
    ]);
    var helpMenu: Menu = Menu.buildFromTemplate([
        { label: 'TMXEditor User Guide', accelerator: 'F1', click: function () { showHelp(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Check for Updates...', click: function () { checkUpdates(false); } },
        { label: 'View Licenses', click: function () { showLicenses(); } },
        new MenuItem({ type: 'separator' }),
        { label: 'Release History', click: function () { showReleaseHistory(); } },
        { label: 'Support Group', click: function () { showSupportGroup(); } }
    ]);
    var template: MenuItem[] = [
        new MenuItem({ label: 'File', role: 'fileMenu', submenu: fileMenu }),
        new MenuItem({ label: 'Edit', role: 'editMenu', submenu: editMenu }),
        new MenuItem({ label: 'View', role: 'viewMenu', submenu: viewMenu }),
        new MenuItem({ label: 'Tasks', submenu: tasksMenu }),
        new MenuItem({ label: 'Help', role: 'help', submenu: helpMenu })
    ];
    if (process.platform === 'darwin') {
        var appleMenu: Menu = Menu.buildFromTemplate([
            new MenuItem({ label: 'About...', click: function () { showAbout(); } }),
            new MenuItem({
                label: 'Preferences...', submenu: [
                    { label: 'Settings', accelerator: 'Cmd+,', click: function () { showSettings(); } }
                ]
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({
                label: 'Services', role: 'services', submenu: [
                    { label: 'No Services Apply', enabled: false }
                ]
            }),
            new MenuItem({ type: 'separator' }),
            new MenuItem({ label: 'Quit TMXEditor', accelerator: 'Cmd+Q', role: 'quit', click: function () { app.quit(); } })
        ]);
        template.unshift(new MenuItem({ label: 'TMXEditor', role: 'appMenu', submenu: appleMenu }));
    } else {
        var help: MenuItem = template.pop();
        template.push(new MenuItem({
            label: 'Settings', submenu: [
                { label: 'Preferences', click: function () { showSettings(); } }
            ]
        }));
        template.push(help);
    }
    if (!existsSync(appHome + 'recent.json')) {
        writeFile(appHome + 'recent.json', '{"files" : []}', function (err) {
            if (err) {
                dialog.showMessageBox({ type: 'error', message: err.message });
                return;
            }
        });
    }
    readFile(appHome + 'recent.json', function (err: Error, buf: Buffer) {
        if (err instanceof Error) {
            Menu.setApplicationMenu(Menu.buildFromTemplate(template));
            return;
        }
        var jsonData = JSON.parse(buf.toString());
        var files = jsonData.files;
        if (files != undefined && files.length > 0) {
            if (process.platform === 'darwin') {
                template[1].submenu.append(new MenuItem({ type: 'separator' }));
            } else {
                template[0].submenu.append(new MenuItem({ type: 'separator' }));
            }
            for (let i: number = 0; i < files.length; i++) {
                var file = files[i];
                if (existsSync(file)) {
                    if (process.platform === 'darwin') {
                        template[1].submenu.append(new MenuItem({ label: file, click: function () { openFile(files[i]); } }));
                    } else {
                        template[0].submenu.append(new MenuItem({ label: file, click: function () { openFile(files[i]); } }));
                    }
                }
            }
        }
        if (process.platform == 'win32') {
            template[0].submenu.append(new MenuItem({ type: 'separator' }));
            template[0].submenu.append(new MenuItem({ label: 'Exit', accelerator: 'Alt+F4', role: 'quit', click: function () { app.quit(); } }));
            template[5].submenu.append(new MenuItem({ type: 'separator' }));
            template[5].submenu.append(new MenuItem({ label: 'About...', click: function () { showAbout(); } }));
        }
        if (process.platform === 'linux') {
            template[0].submenu.append(new MenuItem({ type: 'separator' }));
            template[0].submenu.append(new MenuItem({ label: 'Quit', accelerator: 'Ctrl+Q', role: 'quit', click: function () { app.quit(); } }));
            template[5].submenu.append(new MenuItem({ type: 'separator' }));
            template[5].submenu.append(new MenuItem({ label: 'About...', click: function () { showAbout(); } }));
        }
        Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    });
}

function sendRequest(json: any, success: any, error: any) {
    var postData: string = JSON.stringify(json);
    var options = {
        hostname: '127.0.0.1',
        port: 8060,
        path: '/TMXServer',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };
    // Make a request
    var req: ClientRequest = request(options);
    req.on('response',
        function (res: any) {
            res.setEncoding('utf-8');
            if (res.statusCode != 200) {
                error('sendRequest() error: ' + res.statusMessage);
            }
            var rawData: string = '';
            res.on('data', function (chunk: string) {
                rawData += chunk;
            });
            res.on('end', function () {
                try {
                    success(JSON.parse(rawData));
                } catch (e) {
                    error(e.message);
                }
            });
        }
    );
    req.write(postData);
    req.end();
}

function stopServer() {
    if (!stopping) {
        stopping = true;
        if (!saved) {
            let response = dialog.showMessageBoxSync(mainWindow, { type: 'question', message: 'Save changes?', buttons: ['Yes', 'No'] });
            if (response === 0) {
                saveFile();
            }
        }
        ls.kill();
    }
}

function showAbout() {
    var aboutWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('aboutWindow'),
        height: getHeihght('aboutWindow'),
        minimizable: false,
        maximizable: false,
        resizable: false,
        useContentSize: true,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    aboutWindow.setMenu(null);
    aboutWindow.loadURL('file://' + app.getAppPath() + '/html/about.html');
    aboutWindow.show();
}

function showLicenses() {
    var licensesWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('licensesWindow'),
        height: getHeihght('licensesWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    licensesWindow.setMenu(null);
    licensesWindow.loadURL('file://' + app.getAppPath() + '/html/licenses.html');
    licensesWindow.show();
}

ipcMain.on('licenses-clicked', function () {
    showLicenses();
});

ipcMain.on('open-license', function (event, arg: any) {
    var licenseFile = '';
    var title = '';
    switch (arg.type) {
        case 'TMXEditor':
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/license.txt'
            title = 'TMXEditor License';
            break;
        case "electron":
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/electron.txt'
            title = 'MIT License';
            break;
        case "TypeScript":
        case "MapDB":
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/Apache2.0.html'
            title = 'Apache 2.0';
            break;
        case "Java":
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/java.html'
            title = 'GPL2 with Classpath Exception';
            break;
        case "OpenXLIFF":
        case "TMXValidator":
        case "H2":
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/EclipsePublicLicense1.0.html';
            title = 'Eclipse Public License 1.0';
            break;
        case "JSON":
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/json.txt'
            title = 'JSON.org License';
            break;
        case "jsoup":
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/jsoup.txt'
            title = 'MIT License';
            break;
        case "DTDParser":
            licenseFile = 'file://' + app.getAppPath() + '/html/licenses/LGPL2.1.txt'
            title = 'LGPL 2.1';
            break;
        default:
            dialog.showErrorBox('Error', 'Unknow license');
            return;
    }
    var licenseWindow = new BrowserWindow({
        parent: mainWindow,
        width: 680,
        height: 400,
        show: false,
        title: title,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    licenseWindow.setMenu(null);
    licenseWindow.loadURL(licenseFile);
    licenseWindow.show();
});

function showHelp() {
    shell.openExternal('file://' + app.getAppPath() + '/tmxeditor.pdf',
        { activate: true, workingDirectory: app.getAppPath() }
    ).catch((error: Error) => {
        dialog.showErrorBox('Error', error.message);
    });
}

ipcMain.on('show-help', () => {
    showHelp();
});


ipcMain.on('open-file', function () {
    openFileDialog();
});

function openFileDialog() {
    dialog.showOpenDialog({
        title: 'Open TMX File',
        properties: ['openFile'],
        filters: [
            { name: 'TMX File', extensions: ['tmx'] },
            { name: 'Any File', extensions: ['*'] }
        ]
    }).then(function (value: any) {
        if (!value.canceled) {
            openFile(value.filePaths[0]);
            saveRecent(value.filePaths[0]);
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
}

function openFile(file: string) {
    contents.send('start-waiting');
    contents.send('set-status', 'Opening file...');
    sendRequest({ command: 'openFile', file: file },
        function success(data: any) {
            currentStatus = data;
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    clearInterval(intervalObject);
                    getFileLanguages();
                    contents.send('file-loaded', currentStatus);
                    currentFile = file;
                    mainWindow.setTitle(currentFile);
                    saved = true;
                    return;
                } else if (currentStatus.status === LOADING) {
                    // it's OK, keep waiting
                    contents.send('status-changed', currentStatus);
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'openFile'
                } else {
                    contents.send('end-waiting');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error loading file');
                    return;
                }
                getLoadingProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            console.log(reason);
            dialog.showErrorBox('Error', reason);
        }
    );
}

function getLoadingProgress() {
    sendRequest({ command: 'loadingProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(data: string) {
            console.log(data);
        }
    );
}

function closeFile() {
    if (currentFile === '') {
        return;
    }
    if (!saved) {
        let response = dialog.showMessageBoxSync(mainWindow, { type: 'question', message: 'Save changes?', buttons: ['Yes', 'No'] });
        if (response === 0) {
            saveFile();
        }
    }
    contents.send('set-status', 'Closing file...');
    contents.send('start-waiting');
    sendRequest({ command: 'closeFile' },
        function success(json: any) {
            contents.send('end-waiting');
            if (json.status === SUCCESS) {
                contents.send('file-closed');
                contents.send('set-status', '');
                currentFile = '';
                mainWindow.setTitle('TMXEditor');
            } else {
                dialog.showMessageBox({ type: 'error', message: json.reason });
            }
        },
        function error(data: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: data });
        }
    );
}

function getFileLanguages() {
    contents.send('set-status', 'Getting languages...');
    sendRequest({ command: 'getLanguages' },
        function success(json: any) {
            if (json.status === SUCCESS) {
                fileLanguages = json.languages;
                contents.send('languages-changed');
            } else {
                dialog.showMessageBox({ type: 'error', message: json.reason });
            }
        },
        function error(data: string) {
            dialog.showMessageBox({ type: 'error', message: data });
        }
    );
}

ipcMain.on('get-languages', function (event, arg) {
    event.sender.send('update-languages', fileLanguages);
});

function saveDefaults() {
    var defaults = mainWindow.getBounds();
    if (!currentDefaults) {
        return;
    }
    if (defaults.width === currentDefaults.width && defaults.height === currentDefaults.height && defaults.x === currentDefaults.x) {
        return;
    }
    if (defaults.width === 800 && defaults.height === 600) {
        return;
    }
    writeFileSync(appHome + 'defaults.json', JSON.stringify(defaults));
}

function loadDefaults() {
    currentDefaults = { width: 900, height: 700, x: 0, y: 0 };
    if (existsSync(appHome + 'defaults.json')) {
        try {
            var data: Buffer = readFileSync(appHome + 'defaults.json');
            currentDefaults = JSON.parse(data.toString());
        } catch (err) {
            console.log(err);
        }
    }
}

function savePreferences() {
    writeFileSync(appHome + 'preferences.json', JSON.stringify(currentPreferences));
    nativeTheme.themeSource = currentPreferences.theme;
}

function loadPreferences() {
    currentPreferences = { theme: 'system', indentation: 2 };
    if (existsSync(appHome + 'preferences.json')) {
        try {
            var data: Buffer = readFileSync(appHome + 'preferences.json');
            currentPreferences = JSON.parse(data.toString());
        } catch (err) {
            console.log(err);
        }
    }

    if (currentPreferences.theme === 'system') {
        if (nativeTheme.shouldUseDarkColors) {
            currentTheme = app.getAppPath() + '/css/dark.css';
            nativeTheme.themeSource = 'dark';
        } else {
            currentTheme = app.getAppPath() + '/css/light.css';
            nativeTheme.themeSource = 'light';
        }
    }
    if (currentPreferences.theme === 'dark') {
        currentTheme = app.getAppPath() + '/css/dark.css';
        nativeTheme.themeSource = 'dark';
    }
    if (currentPreferences.theme === 'light') {
        currentTheme = app.getAppPath() + '/css/light.css';
        nativeTheme.themeSource = 'light';
    }
}

function saveRecent(file: string) {
    readFile(appHome + 'recent.json', function (err: Error, data: Buffer) {
        if (err instanceof Error) {
            return;
        }
        var jsonData = JSON.parse(data.toString());
        var files = jsonData.files;
        if (files != undefined) {
            var found = false;
            for (var i = 0; i < files.length; i++) {
                if (file === files[i]) {
                    found = true;
                }
            }
            if (!found) {
                files.unshift(file);
                if (files.length > 5) {
                    jsonData.files = files.slice(0, 5);
                }
                writeFile(appHome + 'recent.json', JSON.stringify(jsonData), function (error) {
                    if (error) {
                        dialog.showMessageBox({ type: 'error', message: error.message });
                        return;
                    }
                });
            }
        }
    });
}

function loadSegments() {
    var json: any = {
        command: 'getSegments'
    }
    Object.assign(json, loadOptions);
    Object.assign(json, filterOptions);
    Object.assign(json, sortOptions);
    contents.send('start-waiting');
    contents.send('set-status', 'Loading segments...');
    sendRequest(json,
        function success(data: any) {
            contents.send('set-status', '');
            contents.send('end-waiting');
            if (data.status === SUCCESS) {
                contents.send('update-segments', data);
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

ipcMain.on('get-segments', function (event, arg) {
    loadOptions = arg;
    loadSegments();
});


ipcMain.on('get-cell-properties', function (event, arg) {
    arg.command = 'getTuvData';
    sendRequest(arg,
        function success(json: any) {
            json.type = arg.lang;
            event.sender.send('update-properties', json);
        },
        function error(data: string) {
            dialog.showMessageBox({ type: 'error', message: data });
        }
    );
});

ipcMain.on('get-row-properties', function (event, arg) {
    arg.command = 'getTuData';
    sendRequest(arg,
        function success(json: any) {
            json.type = 'TU';
            event.sender.send('update-properties', json);
        },
        function error(data: string) {
            dialog.showMessageBox({ type: 'error', message: data });
        }
    );
});

function showSettings(): void {
    settingsWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('settingsWindow'),
        height: getHeihght('settingsWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    settingsWindow.setMenu(null);
    settingsWindow.loadURL('file://' + app.getAppPath() + '/html/preferences.html');
    // settingsWindow.webContents.openDevTools()
    settingsWindow.show();
}

ipcMain.on('get-preferences', (event, arg) => {
    event.sender.send('set-preferences', currentPreferences);
});

ipcMain.on('save-preferences', (event, arg) => {
    currentPreferences = arg;
    savePreferences();
    settingsWindow.close();
    loadPreferences();
    setTheme();
});

ipcMain.on('get-theme', (event, arg) => {
    event.sender.send('set-theme', currentTheme);
});

function setTheme(): void {
    contents.send('set-theme', currentTheme);
}

nativeTheme.on('updated', () => {
    loadPreferences();
    setTheme();
});

function createNewFile(): void {
    newFileWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('newFileWindow'),
        height: getHeihght('newFileWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    newFileWindow.setMenu(null);
    newFileWindow.loadURL('file://' + app.getAppPath() + '/html/newFile.html');
    // settingsWindow.webContents.openDevTools()
    newFileWindow.show();
}

ipcMain.on('create-file', (event, arg) => {
    newFileWindow.close();
    if (currentFile != '' && !saved) {
        let response = dialog.showMessageBoxSync(mainWindow, { type: 'question', message: 'Save changes?', buttons: ['Yes', 'No'] });
        if (response === 0) {
            saveFile();
        }
    }
    sendRequest(arg,
        function success(data: any) {
            if (data.status === SUCCESS) {
                openFile(data.path);
                needsName = true;
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

ipcMain.on('new-file', () => {
    createNewFile();
});

function saveFile(): void {
    if (currentFile === '') {
        return;
    }
    if (needsName) {
        saveAs();
        return;
    }
    sendRequest({ command: 'saveFile', file: currentFile },
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Saving...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    saved = true;
                    return;
                } else if (currentStatus.status === SAVING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'saveFile'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error saving file');
                    return;
                }
                getSavingProgress();
            }, 500);
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function getSavingProgress() {
    sendRequest({ command: 'savingProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(data: string) {
            console.log(data);
        }
    );
}
ipcMain.on('save-file', () => {
    saveFile();
})

function saveAs(): void {
    dialog.showSaveDialog({
        title: 'Save TMX File',
        properties: ['showOverwriteConfirmation', 'createDirectory'],
        filters: [
            { name: 'TMX File', extensions: ['tmx'] },
            { name: 'Any File', extensions: ['*'] }
        ]
    }).then(function (value: any) {
        if (!value.canceled) {
            currentFile = value.filePath;
            needsName = false;
            saveFile();
            mainWindow.setTitle(currentFile);
            saveRecent(currentFile);
            saved = true;
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
}

function convertCSV(): void {
    // TODO
    dialog.showMessageBox(mainWindow, { type: 'info', message: 'Not implemented' });
}

ipcMain.on('convert-csv', () => {
    convertCSV();
});

function exportDelimited(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    dialog.showSaveDialog({
        title: 'Export TAB Delimited',
        properties: ['showOverwriteConfirmation', 'createDirectory'],
        filters: [
            { name: 'Text File', extensions: ['txt'] },
            { name: 'CSV File', extensions: ['csv'] },
            { name: 'Any File', extensions: ['*'] }
        ]
    }).then(function (value: any) {
        if (!value.canceled) {
            contents.send('start-waiting');
            sendRequest({ command: 'exportDelimited', file: value.filePath },
                function success(data: any) {
                    currentStatus = data;
                    contents.send('set-status', 'Exporting...');
                    var intervalObject = setInterval(function () {
                        if (currentStatus.status === COMPLETED) {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showMessageBox(mainWindow, { type: 'info', message: 'File exported' });
                            return;
                        } else if (currentStatus.status === ERROR) {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showErrorBox('Error', currentStatus.reason);
                            return;
                        } else if (currentStatus.status === SUCCESS) {
                            // keep waiting
                        } else {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showErrorBox('Error', 'Unknown error exporting file');
                            return;
                        }
                        getExportProgress();
                    }, 500);
                },
                function error(reason: string) {
                    contents.send('end-waiting');
                    dialog.showErrorBox('Error', reason);
                }
            );
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
}

function getExportProgress() {
    sendRequest({ command: 'exportProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function showFileInfo(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    var fileInfoWindow: BrowserWindow = new BrowserWindow({
        parent: mainWindow,
        width: 550,
        height: 400,
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: true,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    fileInfoWindow.setMenu(null);
    fileInfoWindow.loadURL('file://' + app.getAppPath() + '/html/fileInfo.html');
    // fileInfoWindow.webContents.openDevTools()
    fileInfoWindow.show();
}

ipcMain.on('show-file-info', () => {
    showFileInfo();
});

ipcMain.on('file-properties', (event, arg) => {
    sendRequest({ command: 'getFileProperties' },
        function success(data: any) {
            if (data.status === SUCCESS) {
                event.sender.send('set-file-properties', data);
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function validateFile(): void {
    dialog.showOpenDialog({
        title: 'Validate TMX File',
        properties: ['openFile'],
        filters: [
            { name: 'TMX File', extensions: ['tmx'] }
        ]
    }).then(function (value) {
        if (!value.canceled) {
            contents.send('start-waiting');
            sendRequest({ command: 'validateFile', file: value.filePaths[0] },
                function success(data: any) {
                    currentStatus = data;
                    contents.send('set-status', 'Validating...');
                    var intervalObject = setInterval(function () {
                        if (currentStatus.status === COMPLETED) {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showMessageBox(mainWindow, { type: 'info', message: 'File is valid' });
                            return;
                        } else if (currentStatus.status === ERROR) {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showErrorBox('Error', currentStatus.reason);
                            return;
                        } else if (currentStatus.status === SUCCESS) {
                            // keep waiting
                        } else {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showErrorBox('Error', 'Unknown error validating file');
                            return;
                        }
                        getValidatingProgress();
                    }, 500);
                },
                function error(reason: string) {
                    contents.send('end-waiting');
                    dialog.showMessageBox({ type: 'error', message: reason });
                }
            );
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
}

function getValidatingProgress() {
    sendRequest({ command: 'validatingProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function cleanCharacters(): void {
    dialog.showOpenDialog({
        title: 'Clean Characters',
        properties: ['openFile'],
        filters: [
            { name: 'TMX File', extensions: ['tmx'] }
        ]
    }).then(function (value) {
        if (!value.canceled) {
            contents.send('start-waiting');
            sendRequest({ command: 'cleanCharacters', file: value.filePaths[0] },
                function success(data: any) {
                    currentStatus = data;
                    contents.send('set-status', 'Cleaning...');
                    var intervalObject = setInterval(function () {
                        if (currentStatus.status === COMPLETED) {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showMessageBox(mainWindow, { type: 'info', message: 'File cleaned' });
                            return;
                        } else if (currentStatus.status === ERROR) {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showErrorBox('Error', currentStatus.reason);
                            return;
                        } else if (currentStatus.status === SUCCESS) {
                            // keep waiting
                        } else {
                            contents.send('end-waiting');
                            contents.send('set-status', '');
                            clearInterval(intervalObject);
                            dialog.showErrorBox('Error', 'Unknown error cleaning characters');
                            return;
                        }
                        getCleaningProgress();
                    }, 500);
                },
                function error(reason: string) {
                    contents.send('end-waiting');
                    dialog.showMessageBox({ type: 'error', message: reason });
                }
            );
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
}

function getCleaningProgress() {
    sendRequest({ command: 'cleaningProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function splitFile(): void {
    splitFileWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('splitFileWindow'),
        height: getHeihght('splitFileWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: true,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    splitFileWindow.setMenu(null);
    splitFileWindow.loadURL('file://' + app.getAppPath() + '/html/splitFile.html');
    // splitFileWindow.webContents.openDevTools()
    splitFileWindow.show();
}

ipcMain.on('select-tmx', (event, arg) => {
    dialog.showOpenDialog({
        title: 'TMX File',
        properties: ['openFile'],
        filters: [
            { name: 'TMX File', extensions: ['tmx'] },
            { name: 'Any File', extensions: ['*'] }
        ]
    }).then(function (value: any) {
        if (!value.canceled) {
            event.sender.send('tmx-file', value.filePaths[0]);
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
});

ipcMain.on('split-tmx', (event, arg) => {
    splitFileWindow.close();
    sendRequest(arg,
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Splitting...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showMessageBox(mainWindow, { type: 'info', message: 'File split' });
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'replaceText'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error splitting file');
                    return;
                }
                getSplitProgress();
            }, 500);
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function getSplitProgress() {
    sendRequest({ command: 'getSplitProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(data: string) {
            console.log(data);
        }
    );
}

function mergeFiles(): void {
    mergeFilesWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('mergeFilesWindow'),
        height: getHeihght('mergeFilesWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: true,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    mergeFilesWindow.setMenu(null);
    mergeFilesWindow.loadURL('file://' + app.getAppPath() + '/html/mergeFiles.html');
    // mergeFilesWindow.webContents.openDevTools()
    mergeFilesWindow.show();
}

ipcMain.on('select-merged-tmx', (event, arg) => {
    dialog.showSaveDialog({
        title: 'Merged TMX File',
        properties: ['showOverwriteConfirmation', 'createDirectory'],
        filters: [
            { name: 'TMX File', extensions: ['tmx'] },
            { name: 'Any File', extensions: ['*'] }
        ]
    }).then(function (value: any) {
        if (!value.canceled) {
            event.sender.send('merged-tmx-file', value.filePath);
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
});

ipcMain.on('add-tmx-files', (event, arg) => {
    dialog.showOpenDialog({
        title: 'TMX Files',
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'TMX File', extensions: ['tmx'] },
            { name: 'Any File', extensions: ['*'] }
        ]
    }).then(function (value: any) {
        if (!value.canceled) {
            event.sender.send('tmx-files', value.filePaths);
        }
    }).catch(function (error: Error) {
        dialog.showErrorBox('Error', error.message);
        console.log(error);
    });
});

ipcMain.on('merge-tmx-files', (event, arg) => {
    mergeFilesWindow.close();
    contents.send('start-waiting');
    sendRequest(arg,
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Merging...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showMessageBox(mainWindow, { type: 'info', message: 'Files merged' });
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'mergeFiles'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error merging files');
                    return;
                }
                getMergeProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function getMergeProgress() {
    sendRequest({ command: 'getMergeProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(data: string) {
            console.log(data);
        }
    );
}

function saveEdits(): void {
    if (currentFile === '') {
        return;
    }
    contents.send('save-edit');
}

ipcMain.on('save-data', (event, arg) => {
    sendRequest(arg,
        function (data: any) {
            if (data.status === SUCCESS) {
                saved = false;
                event.sender.send('data-saved', data);
                return;
            }
            dialog.showMessageBox({ type: 'error', message: data.reason });
        },
        function (reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function cancelEdit(): void {
    if (currentFile === '') {
        return;
    }
    contents.send('cancel-edit');
}

function replaceText(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    replaceTextWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('replaceTextWindow'),
        height: getHeihght('replaceTextWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    replaceTextWindow.setMenu(null);
    replaceTextWindow.loadURL('file://' + app.getAppPath() + '/html/searchReplace.html');
    replaceTextWindow.show();
    // filtersWindow.webContents.openDevTools();
}

ipcMain.on('replace-text', () => {
    replaceText();
})

ipcMain.on('replace-request', (event, arg) => {
    replaceTextWindow.close();
    contents.send('start-waiting');
    sendRequest(arg,
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Replacing...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    loadSegments();
                    getCount();
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'replaceText'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error replacing text');
                    return;
                }
                getProcessingProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function sortUnits() {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    sortUnitsWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('sortUnitsWindow'),
        height: getHeihght('sortUnitsWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    sortUnitsWindow.setMenu(null);
    sortUnitsWindow.loadURL('file://' + app.getAppPath() + '/html/sortUnits.html');
    sortUnitsWindow.show();
    // sortUnitsWindow.webContents.openDevTools();
}

ipcMain.on('sort-units', () => {
    sortUnits();
});

ipcMain.on('set-sort', (event, arg) => {
    sortOptions = arg;
    sortUnitsWindow.close();
    loadSegments();
    contents.send('sort-on');
});

ipcMain.on('clear-sort', () => {
    sortOptions = {};
    sortUnitsWindow.close();
    loadSegments();
    contents.send('sort-off');
});

ipcMain.on('get-sort', (event, arg) => {
    event.sender.send('sort-options', sortOptions);
});

function showFilters() {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    filtersWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('filtersWindow'),
        height: getHeihght('filtersWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    filtersWindow.setMenu(null);
    filtersWindow.loadURL('file://' + app.getAppPath() + '/html/filters.html');
    filtersWindow.show();
    // filtersWindow.webContents.openDevTools();
}

ipcMain.on('filter-units', () => {
    showFilters();
});

ipcMain.on('filter-options', (event, arg) => {
    filterOptions = arg;
    filtersWindow.close();
    loadSegments();
    contents.send('filters-on');
});

ipcMain.on('get-filter-options', (event, arg) => {
    event.sender.send('set-filter-options', filterOptions);
});

ipcMain.on('clear-filter-options', () => {
    filterOptions = {};
    filtersWindow.close();
    loadSegments();
    contents.send('filters-off');
});

ipcMain.on('get-filter-languages', (event, arg) => {
    event.sender.send('filter-languages', fileLanguages);
});

function insertUnit(): void {
    sendRequest({ command: 'insertUnit' },
        function success(data: any) {
            if (data.status === SUCCESS) {
                contents.send('unit-inserted', data.id);
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

ipcMain.on('insert-unit', () => {
    insertUnit();
});

function deleteUnits(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    contents.send('request-delete');
}

ipcMain.on('delete-units', (event, arg) => {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    var selected: string[] = arg;
    if (selected.length === 0) {
        dialog.showMessageBox({ type: 'warning', message: 'Select units' });
        return;
    }
    sendRequest({ command: 'deleteUnits', selected },
        function success(data: any) {
            if (data.status === SUCCESS) {
                getFileLanguages();
                getCount();
                loadSegments();
                saved = false;
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function firstPage(): void {
    contents.send('first-page');
}

function previousPage(): void {
    contents.send('previous-page');
}

function nextPage(): void {
    contents.send('next-page');
}

function lastPage(): void {
    contents.send('last-page');
}

function changeLanguageCode(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    changeLanguageWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('changeLanguageWindow'),
        height: getHeihght('changeLanguageWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    changeLanguageWindow.setMenu(null);
    changeLanguageWindow.loadURL('file://' + app.getAppPath() + '/html/changeLanguage.html');
    changeLanguageWindow.show();
    //changeLanguageWindow.webContents.openDevTools();
}

ipcMain.on('change-language', (event, arg) => {
    changeLanguageWindow.close();
    sendRequest(arg,
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Changing...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    getFileLanguages();
                    loadSegments();
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'replaceText'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error changing language code');
                    return;
                }
                getProcessingProgress();
            }, 500);
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

ipcMain.on('all-languages', (event, arg) => {
    sendRequest({ command: 'getAllLanguages' },
        function success(data: any) {
            if (data.status === SUCCESS) {
                event.sender.send('languages-list', data.languages);
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function removeLanguage(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    removeLanguageWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('removeLanguageWindow'),
        height: getHeihght('removeLanguageWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    removeLanguageWindow.setMenu(null);
    removeLanguageWindow.loadURL('file://' + app.getAppPath() + '/html/removeLanguage.html');
    removeLanguageWindow.show();
    // removeLanguageWindow.webContents.openDevTools();
}

ipcMain.on('remove-language', (event, arg) => {
    removeLanguageWindow.close();
    sendRequest({ command: 'removeLanguage', lang: arg },
        function success(data: any) {
            if (data.status === SUCCESS) {
                getFileLanguages();
                loadSegments();
                saved = false;
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function addLanguage(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    addLanguageWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('addLanguageWindow'),
        height: getHeihght('addLanguageWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    addLanguageWindow.setMenu(null);
    addLanguageWindow.loadURL('file://' + app.getAppPath() + '/html/addLanguage.html');
    addLanguageWindow.show();
    // addLanguageWindow.webContents.openDevTools();
}

ipcMain.on('add-language', (event, arg) => {
    addLanguageWindow.close();
    sendRequest({ command: 'addLanguage', lang: arg },
        function success(data: any) {
            if (data.status === SUCCESS) {
                getFileLanguages();
                loadSegments();
                saved = false;
            } else {
                dialog.showMessageBox({ type: 'error', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function changeSourceLanguage(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    srcLanguageWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('srcLanguageWindow'),
        height: getHeihght('srcLanguageWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    srcLanguageWindow.setMenu(null);
    srcLanguageWindow.loadURL('file://' + app.getAppPath() + '/html/srcLanguage.html');
    srcLanguageWindow.show();
    // srcLanguageWindow.webContents.openDevTools();
}

ipcMain.on('get-source-language', (event, arg) => {
    sendRequest({ command: 'getSrcLanguage' },
        function success(data: any) {
            if (data.status === SUCCESS) {
                event.sender.send('set-source-language', data);
            } else {
                dialog.showMessageBox({ type: 'warning', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

ipcMain.on('change-source-language', (event, arg) => {
    srcLanguageWindow.close();
    sendRequest({ command: 'setSrcLanguage', lang: arg },
        function success(data: any) {
            if (data.status !== SUCCESS) {
                dialog.showMessageBox({ type: 'warning', message: data.reason });
            }
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function removeTags(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    contents.send('start-waiting');
    sendRequest({ command: 'removeTags' },
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Removing tags...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    loadSegments();
                    saved = false;
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'removeDuplicates'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error removing tags');
                    return;
                }
                getProcessingProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function removeDuplicates(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    contents.send('start-waiting');
    sendRequest({ command: 'removeDuplicates' },
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Removing duplicates...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    loadSegments();
                    getCount();
                    saved = false;
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'removeDuplicates'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error removing duplicates');
                    return;
                }
                getProcessingProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function removeUntranslated(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    removeUntranslatedWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('removeUntranslatedWindow'),
        height: getHeihght('removeUntranslatedWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    removeUntranslatedWindow.setMenu(null);
    removeUntranslatedWindow.loadURL('file://' + app.getAppPath() + '/html/removeUntranslated.html');
    removeUntranslatedWindow.show();
}

ipcMain.on('remove-untranslated', (event, arg) => {
    removeUntranslatedWindow.close();
    contents.send('start-waiting');
    sendRequest(arg,
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Removing units...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    loadSegments();
                    getCount();
                    saved = false;
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'removeUntranslated'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error removing untranslated units');
                    return;
                }
                getProcessingProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function removeSpaces(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    contents.send('start-waiting');
    sendRequest({ command: 'removeSpaces' },
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Removing spaces...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    loadSegments();
                    saved = false;
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'removeSpaces'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error removing spaces');
                    return;
                }
                getProcessingProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function consolidateUnits(): void {
    if (currentFile === '') {
        dialog.showMessageBox({ type: 'warning', message: 'Open a TMX file' });
        return;
    }
    if (fileLanguages.length < 3) {
        dialog.showMessageBox({ type: 'warning', message: 'File must have at least 3 languages' });
        return;
    }
    consolidateWindow = new BrowserWindow({
        parent: mainWindow,
        width: getWidth('consolidateWindow'),
        height: getHeihght('consolidateWindow'),
        useContentSize: true,
        minimizable: false,
        maximizable: false,
        resizable: false,
        show: false,
        icon: './icons/tmxeditor.png',
        webPreferences: {
            nodeIntegration: true
        }
    });
    consolidateWindow.setMenu(null);
    consolidateWindow.loadURL('file://' + app.getAppPath() + '/html/consolidateUnits.html');
    consolidateWindow.show();
    // consolidateWindow.webContents.openDevTools();
}

ipcMain.on('consolidate-units', (event, arg) => {
    consolidateWindow.close();
    contents.send('start-waiting');
    sendRequest(arg,
        function success(data: any) {
            currentStatus = data;
            contents.send('set-status', 'Consolidating...');
            var intervalObject = setInterval(function () {
                if (currentStatus.status === COMPLETED) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    loadSegments();
                    getCount();
                    return;
                } else if (currentStatus.status === PROCESSING) {
                    // it's OK, keep waiting
                } else if (currentStatus.status === ERROR) {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', currentStatus.reason);
                    return;
                } else if (currentStatus.status === SUCCESS) {
                    // ignore status from 'consolidateUnits'
                } else {
                    contents.send('end-waiting');
                    contents.send('set-status', '');
                    clearInterval(intervalObject);
                    dialog.showErrorBox('Error', 'Unknown error consolidating units');
                    return;
                }
                getProcessingProgress();
            }, 500);
        },
        function error(reason: string) {
            contents.send('end-waiting');
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
});

function getProcessingProgress() {
    sendRequest({ command: 'processingProgress' },
        function success(data: any) {
            currentStatus = data;
        },
        function error(data: string) {
            console.log(data);
        }
    );
}

function getCount() {
    sendRequest({ command: 'getCount' },
        function success(data: any) {
            contents.send('status-changed', data);
        },
        function error(reason: string) {
            dialog.showMessageBox({ type: 'error', message: reason });
        }
    );
}

function checkUpdates(silent: boolean): void {
    https.get('https://raw.githubusercontent.com/rmraya/TMXEditor/master/package.json', (res: IncomingMessage) => {
        if (res.statusCode === 200) {
            let rawData = '';
            res.on('data', (chunk: string) => {
                rawData += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (app.getVersion() !== parsedData.version) {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Updates Available',
                            message: 'Version ' + parsedData.version + ' is available'
                        });
                    } else {
                        if (!silent) {
                            dialog.showMessageBox(mainWindow, {
                                type: 'info',
                                message: 'There are currently no updates available'
                            });
                        }
                    }
                } catch (e) {
                    dialog.showErrorBox('Error', e.message);
                }
            });
        } else {
            if (!silent) {
                dialog.showErrorBox('Error', 'Updates Request Failed.\nStatus code: ' + res.statusCode);
            }
        }
    }).on('error', (e: any) => {
        if (!silent) {
            dialog.showErrorBox('Error', e.message);
        }
    });
}



ipcMain.on('get-version', (event, arg) => {
    event.sender.send('set-version', app.getVersion());
});

function showReleaseHistory(): void {
    shell.openExternal('https://www.maxprograms.com/products/tmxlog.html');
}

function showSupportGroup(): void {
    shell.openExternal('https://groups.io/g/maxprograms/');
}

ipcMain.on('show-message', (event, arg) => {
    dialog.showMessageBox(arg);
});

function getWidth(window: string): number {
    switch (process.platform) {
        case 'win32': {
            switch (window) {
                case 'aboutWindow': { return 620; }
                case 'replaceTextWindow': { return 450; }
                case 'filtersWindow': { return 500; }
                case 'consolidateWindow': { return 470; }
                case 'removeUntranslatedWindow': { return 470; }
                case 'settingsWindow': { return 400; }
                case 'sortUnitsWindow': { return 450; }
                case 'changeLanguageWindow': { return 490; }
                case 'newFileWindow': { return 480; }
                case 'addLanguageWindow': { return 420; }
                case 'removeLanguageWindow': { return 420; }
                case 'srcLanguageWindow': { return 420; }
                case 'splitFileWindow': { return 490 }
                case 'mergeFilesWindow': { return 560 }
                case 'licensesWindow': { return 500; }
            }
            break;
        }
        case 'darwin': {
            switch (window) {
                case 'aboutWindow': { return 620; }
                case 'replaceTextWindow': { return 450; }
                case 'filtersWindow': { return 500; }
                case 'consolidateWindow': { return 470; }
                case 'removeUntranslatedWindow': { return 470; }
                case 'settingsWindow': { return 400; }
                case 'sortUnitsWindow': { return 450; }
                case 'changeLanguageWindow': { return 490; }
                case 'newFileWindow': { return 480; }
                case 'addLanguageWindow': { return 420; }
                case 'removeLanguageWindow': { return 420; }
                case 'srcLanguageWindow': { return 420; }
                case 'splitFileWindow': { return 490 }
                case 'mergeFilesWindow': { return 560 }
                case 'licensesWindow': { return 500; }
            }
            break;
        }
        case 'linux': {
            switch (window) {
                case 'aboutWindow': { return 620; }
                case 'replaceTextWindow': { return 450; }
                case 'filtersWindow': { return 500; }
                case 'consolidateWindow': { return 470; }
                case 'removeUntranslatedWindow': { return 470; }
                case 'settingsWindow': { return 400; }
                case 'sortUnitsWindow': { return 450; }
                case 'changeLanguageWindow': { return 490; }
                case 'newFileWindow': { return 480; }
                case 'addLanguageWindow': { return 420; }
                case 'removeLanguageWindow': { return 420; }
                case 'srcLanguageWindow': { return 420; }
                case 'splitFileWindow': { return 490 }
                case 'mergeFilesWindow': { return 560 }
                case 'licensesWindow': { return 500; }
            }
            break;
        }
    }
}

function getHeihght(window: string): number {
    switch (process.platform) {
        case 'win32': {
            switch (window) {
                case 'aboutWindow': { return 380; }
                case 'replaceTextWindow': { return 210; }
                case 'filtersWindow': { return 300; }
                case 'consolidateWindow': { return 120; }
                case 'removeUntranslatedWindow': { return 120; }
                case 'settingsWindow': { return 150; }
                case 'sortUnitsWindow': { return 150; }
                case 'changeLanguageWindow': { return 160; }
                case 'newFileWindow': { return 160; }
                case 'addLanguageWindow': { return 120; }
                case 'removeLanguageWindow': { return 120; }
                case 'srcLanguageWindow': { return 120; }
                case 'splitFileWindow': { return 150; }
                case 'mergeFilesWindow': { return 450; }
                case 'licensesWindow': { return 360; }
            }
            break;
        }
        case 'darwin': {
            switch (window) {
                case 'aboutWindow': { return 360; }
                case 'replaceTextWindow': { return 190; }
                case 'filtersWindow': { return 290; }
                case 'consolidateWindow': { return 110; }
                case 'removeUntranslatedWindow': { return 110; }
                case 'settingsWindow': { return 140; }
                case 'sortUnitsWindow': { return 140; }
                case 'changeLanguageWindow': { return 150; }
                case 'newFileWindow': { return 150; }
                case 'addLanguageWindow': { return 110; }
                case 'removeLanguageWindow': { return 110; }
                case 'srcLanguageWindow': { return 110; }
                case 'splitFileWindow': { return 150; }
                case 'mergeFilesWindow': { return 420; }
                case 'licensesWindow': { return 350; }
            }
            break;
        }
        case 'linux': {
            switch (window) {
                case 'aboutWindow': { return 350; }
                case 'replaceTextWindow': { return 210; }
                case 'filtersWindow': { return 290; }
                case 'consolidateWindow': { return 110; }
                case 'removeUntranslatedWindow': { return 110; }
                case 'settingsWindow': { return 140; }
                case 'sortUnitsWindow': { return 140; }
                case 'changeLanguageWindow': { return 140; }
                case 'newFileWindow': { return 140; }
                case 'addLanguageWindow': { return 110; }
                case 'removeLanguageWindow': { return 110; }
                case 'srcLanguageWindow': { return 110; }
                case 'splitFileWindow': { return 170; }
                case 'mergeFilesWindow': { return 420; }
                case 'licensesWindow': { return 350; }
            }
            break;
        }
    }
}

