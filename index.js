const {
    exec
} = require('child_process');
const path = require('path');

let notify;

try {
    notify = require('hyper/notify');
} catch (error) {
    notify = function (title, body, details = {}) {
        debugLogger(`[Notification] ${title}: ${body}`);
        if (details.error) {
            console.error(details.error);
        }
        // debugLogger(_win)
        if (_win) {
            _win.webContents.send('notification', {
                title,
                body
            });
        }
    }
}
if (!Array.isArray) {
    Array.isArray = function (arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
    };
}

if (!String.prototype.trim) {
    String.prototype.trim = function (char, type) {
        if (char) {
            if (type == 'left') {
                return this.replace(new RegExp('^\\' + char + '+', 'g'), '');
            } else if (type == 'right') {
                return this.replace(new RegExp('\\' + char + '+$', 'g'), '');
            }
            return this.replace(new RegExp('^\\' + char + '+|\\' + char + '+$', 'g'), '');
        }
        return this.replace(/^\s+|\s+$/g, '');
    }
}

let _app
let _win
let SSHConnectSessions = {}

let pluginConfig = {
    scpHelperDisable: true,
    defaultSelectPath: '~',
    aliasSendCommand: "fs",
    aliasReceiveCommand: "js",
    sendCommand: "scp_send",
    receiveCommand: "scp_receive",
    sshConnectTime: 1000,
    injectCommand: true,
    injectFuncName: "scp_inject_func",
    defaultInteraction: false,
    debugLog: true,
    maxMatchLength: 500,
    matchSSHConnect: (data) => {
        return false;
    },
    matchSSHDisconnect: (data) => {
        return data.match("Connection to [^ ]+ closed");
    }
}

const WRITE_TO_TERMINAL = 'statusline/executecommand';
const writeToTerminal = (command, uid) => {
    window.rpc.emit(WRITE_TO_TERMINAL, {
        command,
        uid
    })
}
const executeCommand = (command, uid, currentInput = '') => {
    writeToTerminal(`${'\b'.repeat(currentInput.length)}${command}\r`, uid);
}
const debugLogger = function () {
    pluginConfig.debugLog && console.log.apply(null, arguments)
}

// 刷新config
const refreshConfig = (config) => {
    if (_app) {
        config = _app.config.getConfig()
    }
    if (!config || !config.hyperHelper) return
    debugLogger(config.hyperHelper)
    if (config.hyperHelper.matchSSHConnect && typeof (config.hyperHelper.matchSSHConnect) !== 'function') {
        delete config.hyperHelper.matchSSHConnect
    }
    if (config.hyperHelper.matchSSHDisconnect && typeof (config.hyperHelper.matchSSHDisconnect) !== 'function') {
        delete config.hyperHelper.matchSSHDisconnect
    }

    pluginConfig = Object.assign({}, pluginConfig, config.hyperHelper)
}

const matchPTYData = (action) => {
    if (pluginConfig.scpHelperDisable) return
    // 字符太长，就不匹配了，影响性能
    if (action.data.length > pluginConfig.maxMatchLength) return
    if (!SSHConnectSessions[action.uid]) {
        let result = pluginConfig.matchSSHConnect(action.data, debugLogger)
        if (result) {
            setTimeout(() => {
                exec(`ssh -p ${result[2]} ${result[0]}@${result[1]} "echo \\$HOSTNAME"`, (err, stdout) => {
                    debugLogger("error", err);
                    debugLogger("stdout", stdout);
                    if (err) {
                        // ssh can not reuse
                        notify("SSH can not reuse")
                    } else {
                        notify(`SSH server ${result[1]} connect success`)
                        SSHConnectSessions[action.uid] = {
                            "user": result[0],
                            "host": result[1],
                            "port": result[2],
                        }
                        if (pluginConfig.injectCommand) {
                            injectCommandToServer(action.uid)
                        }

                    }
                });
            }, pluginConfig.sshConnectTime);
        }
    } else {
        // match disconnect
        let data = action.data.trim("\n")
        let result = pluginConfig.matchSSHDisconnect(data, debugLogger)
        debugLogger("matchSSHDisconnect", result)
        if (result) {
            notify(`SSH server ${SSHConnectSessions[action.uid].host} disconnect`)
            delete SSHConnectSessions[action.uid]
            return
        }
        // match sendCommand receiveCommand
        let sendRegex = new RegExp("^'" + pluginConfig.sendCommand + "' (.+)")
        let receiveRegex = new RegExp("^'" + pluginConfig.receiveCommand + "' (.+)")
        // 只取前3条进行匹配
        let lines = data.split("\n", 3)
        debugLogger("match lines", lines)
        lines.every((line) => {
            line = line.trim()
            debugLogger("match line", line)
            sendResult = sendRegex.exec(line)
            debugLogger("sendResult", sendResult)
            if (sendResult) {
                handleSend(action.uid, sendResult[1])
                return false
            }
            receiveResult = receiveRegex.exec(line)
            debugLogger("receiveResult", receiveResult)
            if (receiveResult) {
                handleReceive(action.uid, receiveResult[1])
                return false
            }
            return true
        })
    }
}

const injectCommandToServer = (termID) => {
    debugLogger('injectCommandToServer')
    let helpCMD = `printf '\\nUsage:\\n${pluginConfig.aliasSendCommand} [localhost:]file1 ... [-d [remoteserver:]path]\\n${pluginConfig.aliasReceiveCommand} [remoteserver:]file1 ... [-d [localhost:]path]\\n\\nOptions:\\n-d  The destination in localhost or remoteserver.It can be absolute path or relative to your pwd.\\n-i  Open the file dialog to choose the source files when send to server or the destination folder when receive from server.\\n-n   Do not Open the file dialog.\\n\\nExample:\\n${pluginConfig.aliasSendCommand} testfile.txt   This will send the file in your localhost pwd to the remoteserver.\\n\\nInject success! Enjoy yourself!\\n\\n'`
    executeCommand(`${pluginConfig.injectFuncName}(){ local s="";for i in $@; do s="$s '$i'"; done;s="$s '-w' '$(pwd)'";echo $s; } && alias ${pluginConfig.aliasSendCommand}="${pluginConfig.injectFuncName} ${pluginConfig.sendCommand} ${pluginConfig.defaultInteraction ? '-i' : '-n'}" && alias ${pluginConfig.aliasReceiveCommand}="${pluginConfig.injectFuncName} ${pluginConfig.receiveCommand} ${pluginConfig.defaultInteraction ? '-i' : '-n'}" && ${helpCMD}`, termID)
}

const parseArgs = (arg) => {
    let args = arg.trim().split("' '")
    let maxIndex = args.length - 1
    args.forEach((value, index, arr) => {
        if (index == 0) {
            arr[index] = value + "'"
        } else if (index == maxIndex) {
            arr[index] = "'" + value
        } else {
            arr[index] = "'" + value + "'"
        }
    })
    return args
}

const handleSend = (termID, arg) => {
    let args = parseArgs(arg)
    debugLogger(args)
    let source = []
    let destination = ''
    let serverPWD = ''
    let isInteractive = false
    args.forEach((value, index, arr) => {
        if (index && arr[index - 1] == "'-d'") {
            destination = value
        } else if (index && arr[index - 1] == "'-w'") {
            serverPWD = value
        } else if (arr[index] == "'-i'") {
            isInteractive = true
        } else if (arr[index] == "'-n'") {
            isInteractive = false
        } else if (value != "'-d'" && value != "'-w'" && value != "'-i'" && value != "'-n'") {
            source.push(value)
        }
    });
    debugLogger(source, destination, serverPWD)
    if (destination == "") {
        destination = serverPWD
    } else if (destination.trim("'")[0] != "/") {
        destination = "'" + path.join(serverPWD.trim("'"), destination.trim("'")) + "'"
    }
    debugLogger("isInteractive", isInteractive)
    if (isInteractive) {
        notify("Choose files to send")
        window.rpc.emit("scp-send-select-file", {
            options: {
                defaultPath: pluginConfig.defaultSelectPath,
                title: "请选择上传的文件",
                buttonLabel: "确定",
                filters: [],
                properties: ['openFile', 'openDirectory', 'multiSelections', 'showHiddenFiles'],
                message: "",
            },
            args: {
                server: SSHConnectSessions[termID],
                destination: destination
            }
        })
    } else {
        source.forEach((value, index, arr) => {
            value = value.trim("'")
            if (value[0] != "/") {
                arr[index] = "'" + path.join(pluginConfig.defaultSelectPath, value) + "'"
            }
        })
        debugLogger("source  ", source)
        debugLogger("destination  ", destination)
        scpToServer(SSHConnectSessions[termID], source, destination)
    }
}

const handleReceive = (termID, arg) => {
    let args = parseArgs(arg)
    debugLogger(args)
    let source = []
    let destination = ''
    let serverPWD = ''
    let isInteractive = false
    args.forEach((value, index, arr) => {
        if (index && arr[index - 1] == "'-d'") {
            destination = value
        } else if (index && arr[index - 1] == "'-w'") {
            serverPWD = value
        } else if (arr[index] == "'-i'") {
            isInteractive = true
        } else if (arr[index] == "'-n'") {
            isInteractive = false
        } else if (value != "'-d'" && value != "'-w'" && value != "'-i'" && value != "'-n'") {
            source.push(value)
        }
    });
    debugLogger(source, destination, serverPWD)
    source.forEach((value, index, arr) => {
        value = value.trim("'")
        if (value[0] != "/") {
            arr[index] = "'" + path.join(serverPWD.trim("'"), value) + "'"
        }
    })
    debugLogger("isInteractive", isInteractive)
    if (isInteractive) {
        notify("Choose path to receive")
        window.rpc.emit("scp-receive-select-path", {
            options: {
                defaultPath: pluginConfig.defaultSelectPath,
                title: "请选择保存路径",
                buttonLabel: "确定",
                filters: [],
                properties: ['openDirectory', 'showHiddenFiles', 'createDirectory'],
                message: "",
            },
            args: {
                server: SSHConnectSessions[termID],
                source: source
            }
        })
    } else {
        if (destination == "") {
            destination = "'" + pluginConfig.defaultSelectPath + "'"
        } else if (destination.trim("'")[0] != "/") {
            destination = "'" + path.join(pluginConfig.defaultSelectPath, destination.trim("'")) + "'"
        }
        debugLogger("source  ", source)
        debugLogger("destination  ", destination)
        scpToLocal(SSHConnectSessions[termID], source, destination)
    }
}

const scpToServer = (server, source, destination, handle) => {
    execSSH(server, `mkdir -p ${destination}`, (err, stdout, stderr) => {
        if (err) {
            notify("Create destination false", stdout)
            return;
        }
        execCMD(`scp -r -P ${server.port} ${source.join(' ')} ${server.user}@${server.host}:${destination}`, (err, stdout, stderr) => {
            if (err) {
                notify("Send file false", stdout)
            } else {
                notify("Send success")
            }
            handle && handle(err, stdout, stderr)
        });
    })
}

const scpToLocal = (server, source, destination, handle) => {
    execCMD(`mkdir -p ${destination}`, (err, stdout, stderr) => {
        if (err) {
            notify("Create destination false", stdout)
            return;
        }
        execCMD(`scp -r -P ${server.port} ${server.user}@${server.host}:"${source.join(' ')}" ${destination}`, (err, stdout, stderr) => {
            if (err) {
                notify("Receive file false", stdout)
            } else {
                notify("Receive success")
            }
            handle && handle(err, stdout, stderr)
        });
    })
}

const execSSH = (server, cmd, handle) => {
    cmd = Array.isArray(cmd) ? cmd : [cmd]
    let command = cmd.join(" && ")
    execCMD(`ssh -p ${server.port} ${server.user}@${server.host} "${command}"`, (err, stdout, stderr) => {
        handle && handle(err, stdout, stderr)
    });
}

const execCMD = (command, handle) => {
    debugLogger(command)
    exec(command, (err, stdout, stderr) => {
        debugLogger("error", err);
        debugLogger("stdout", stdout);
        debugLogger("stderr", stderr);
        handle && handle(err, stdout, stderr)
    })
}

// exports.decorateConfig = (config) => {
//     return Object.assign({}, config, {
//         css: `
//             ${config.css || ''}
//         `
//     })
// }

exports.onWindow = (win) => {
    win.rpc.on(WRITE_TO_TERMINAL, ({
        uid,
        command
    }) => {
        win.sessions.get(uid).write(command);
    });
    win.rpc.on("scp-send-select-file", ({
        options,
        args
    }) => {
        console.log(options)
        console.log(args)
        const dialog = require('electron').dialog
        const notify = (title, body, details) => {
            win.rpc.emit("statusline-notify", {
                title,
                body,
                details
            })
        }

        dialog.showOpenDialog(options, function (files) {
            console.log(files)
            if (!files || !files.length) {
                notify("User canceled")
                return
            }
            let source = []
            files.forEach((value, index) => {
                source.push("'" + value + "'")
            });
            scpToServer(args.server, source, args.destination)
        })
    })
    win.rpc.on("scp-receive-select-path", ({
        options,
        args
    }) => {
        console.log(options)
        console.log(args)
        const dialog = require('electron').dialog
        const notify = (title, body, details) => {
            win.rpc.emit("statusline-notify", {
                title,
                body,
                details
            })
        }

        dialog.showOpenDialog(options, function (files) {
            console.log(files)
            if (!files || !files.length) {
                notify("User canceled")
                return
            }
            scpToLocal(args.server, args.source, "'" + files[0] + "'")
        })
    })
    _win = win
    // console.log(_win)
}

exports.onApp = (app) => {
    _app = app;
    refreshConfig()
}

exports.middleware = (store) => (next) => (action) => {
    // const uids = store.getState().sessions.sessions;
    debugLogger(action)
    switch (action.type) {
        case 'SESSION_SET_XTERM_TITLE':
            break;
        case 'SESSION_ADD':
            delete SSHConnectSessions[action.uid]
            break;
        case 'SESSION_ADD_DATA':
            break;
        case 'SESSION_SET_ACTIVE':
            break;
        case 'SESSION_PTY_DATA':
            matchPTYData(action)
            break;
        case 'CONFIG_LOAD':
        case 'CONFIG_RELOAD':
            refreshConfig(action.config)
            break;
    }

    next(action);
}