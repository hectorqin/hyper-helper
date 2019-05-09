# hyper-helper

> Helper Plugin for [Hyper](https://hyper.is). Some useful helper, now only the SCPHelper

## Install

Add following to your `~/.hyper.js` config.

```javascript
module.exports = {
  ...
  plugins: ['hyper-helper']
  ...
}
```

## Config

Add following to `~/.hyper.js`

### Default plugin config

```javascript
let pluginConfig = {
    enableSCPHelper: false, // Whether to disable scpHelper
    defaultSendPath: '~', // Default send choosen path
    defaultReceivePath: '~/Downloads', // Default receive folder
    aliasSendCommand: "fs", // Alias for send command, means to send file to remote server
    aliasReceiveCommand: "js", // Alias for receive command, means to receive file from remote server
    sendCommand: "scp_send", // Truly send command name
    receiveCommand: "scp_receive", // Truly receive command name
    sshConnectTime: 1000, // Timeout for test ssh connection
    injectCommand: true,  // Whether to inject alias command. If you add the inject command permanent in your remote server's '~/.bashrc' or '/etc/profile', then you can set it to false
    injectFuncName: "scp_inject_func", // The inject function name
    defaultInteraction: true, // Whether to use the interactive mode to select the send file or the receive path
    debugLog: true, // Whether to display log
    maxMatchLength: 500, // Match the maximum length of SESSION_PTY_DATA. When the length of SESSION_PTY_DATA is oversized, don't match
    matchSSHConnect: (data) => {
        return false;
    }, // Default method to detect ssh whether to establish a connection. Must return a ssh info array like this [user, host, port] for connected
    matchSSHDisconnect: (data) => {
        return data.match("Connection to [^ ]+ closed");
    } // Default method to detect ssh whether to close the connection
}
```

### Add your config to ~/.hyper.js

```javascript
module.exports = {
  config: {
    ...
      hyperHelper: {
        enableSCPHelper: true,
        maxMatchLength: 1200,
        matchSSHConnect: (data, log)=>{
            // if (data.startsWith('Last login') || data.startsWith('Welcome to')) {
            let result = data.match(/成功登录【(\w+)@([0-9.]+):([0-9]+)】/)
            log("result", result)
            if (result) {
                return result.slice(1)
            }
            // }
            return false
        },
        // debugLog: DEBUG,
      }
    ...
  }
}
```

### The authenticate for SCP command

There are two ways to resolve it.

1. Set SSH to share connections

2. Configure SSH key authentication

### Usage

1. Log into your remote server.
2. Wait for command injection.

    ```bash
    [root@XXXXXXX ~]# scp_inject_func(){ local s="";for i in $@; do s="$s '$i'"; done;s="$s '-w' '$(pwd)'";echo $s; } && alias fs="scp_inject_func scp_send -i" && alias js="scp_inject_func scp_receive -i" && printf '\nUsage:\nfs [localhost:]file1 ... [-d [remoteserver:]path]\njs [remoteserver:]file1 ... [-d [localhost:]path]\n\nOptions:\n-d  The destination in localhost or remoteserver.It can be absolute path or relative to your pwd.\n-i  Open the file dialog to choose the source files when send to server or the destination folder when receive from server.\n-n   Do not Open the file dialog.\n\nExample:\nfs testfile.txt   This will send the file in your localhost pwd to the remoteserver.\n\nInject success! Enjoy yourself!\n\n'

    Usage:
    fs [localhost:]file1 ... [-d [remoteserver:]path]
    js [remoteserver:]file1 ... [-d [localhost:]path]

    Options:
    -d   The destination in localhost or remoteserver.It can be absolute path or relative to your defaultSendPath/defaultReceivePath.
    -i   Open the file dialog to choose the source files when send to server or the destination folder when receive from server.
    -n   Do not Open the file dialog.

    Example:
    fs -n testfile.txt   This will send the file in your localhost defaultSendPath to the remoteserver.
    js -n testfile.txt       This will receive the file in the current path of your remote server to the defaultReceivePath of your local server.

    Inject success! Enjoy yourself!
    ```

3. Follow the tip.

- Send file to remote server

    ```bash
    fs -n testfile.txt
    ```

- Choose file to send

    ```bash
    fs -i
    ```

- Receive file from remote server

    ```bash
    js -n testfile.txt
    ```

- Choose folder to receive

    ```bash
    js -i testfile.txt
    ```