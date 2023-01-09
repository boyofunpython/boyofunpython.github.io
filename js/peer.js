import { saveNewFile } from "../main.js"

/**
 * @type {import('qrcode')}
 */
const QRCode = window.QRCode;

/**
 * @type {import('peerjs').Peer}
 */
let selfPeer = new Peer({
    host: 'killkli.ddns.net',
    key: "killkliAPI",
    secure: true,
    port: 9000,
});
function settingSelfPeer() {
    selfPeer.on("close", () => {
        console.log("connection closed");
        console.log("attempting to reconnect");
        try {
            selfPeer.reconnect();
        } catch (error) {
            console.log("無法重新登入，原因：", error);
            errorInfos.message = "無法重新登入，網路錯誤！";
            selfPeer.removeAllListeners("close");
        }
    });
    // injecting badge span style
    const badgeStyle = document.createElement("style");
    badgeStyle.innerHTML = `
    .badge {
        position: relative;
        top: -1px;
        right: -1px;
        padding: 0.1em 0.4em;
        border-radius: 0.25em;
        background-color: #e3342f;
        color: white;
        font-size: 75%;
        font-weight: bold;
        line-height: 1;
        text-align: center;
        white-space: nowrap;
        vertical-align: baseline;
        display: inline-block;
        cursor: pointer;
    }
    .badge-primary{
        background-color: #3490dc;
    }
    .badge-pill{
        padding-right: 0.6em;
        padding-left: 0.6em;
        border-radius: 10rem;
    }
    .list-group-item{
        position: relative;
        display: block;
        padding: 0.75rem 1.25rem;
        margin-bottom: -1px;
        background-color: #fff;
        border: 1px solid rgba(0,0,0,.125);
    }
    .list-group-item:hover{
        z-index: 2;
        color: #495057;
        text-decoration: none;
        background-color: #f8f9fa;
    }

`;
    document.head.appendChild(badgeStyle);

    selfPeer.on("connection", (conn) => {
        studentConns.push(conn);
        // creating connection dom element
        const studentList = document.querySelector(settings.studentListDom);
        const studentItem = document.createElement("li");
        studentItem.classList.add("list-group-item");
        studentItem.innerText = conn.metadata.name;
        studentItem.id = conn.metadata.name;
        const studentBadge = document.createElement("span");
        studentBadge.classList.add("badge");
        studentBadge.classList.add("badge-primary");
        studentBadge.classList.add("badge-pill");
        studentBadge.innerText = "連線中";
        studentItem.appendChild(studentBadge);
        studentList.appendChild(studentItem);
        // send code to the specific student
        studentBadge.addEventListener("click", () => {
            if (window.confirm("確定要傳送程式碼給" + conn.metadata.name + "嗎？")) {
                conn.send({
                    type: "teacherInfo",
                    code: settings.data()
                });
            }
        });
        conn.on("data", (data) => {
            console.log('Teacher server received:', data);
            if (data.type && data.type === "code") {
                const receivedCodeBadge = document.createElement("span");
                receivedCodeBadge.classList.add("badge");
                receivedCodeBadge.classList.add("badge-primary");
                receivedCodeBadge.classList.add("badge-pill");
                receivedCodeBadge.innerText = "收到程式碼@" + new Date().toLocaleTimeString();
                studentItem.appendChild(receivedCodeBadge);
                receivedCodeBadge.addEventListener("click", () => {
                    if (window.confirm(`是否要接收${conn.metadata.name}的程式碼？`)) {
                        saveNewFile(`ST_${conn.connectionId}.py`, false, () => {
                            window["BMeditor"].setCode(data.code);
                        });
                        receivedCodeBadge.remove();
                    }
                });
            }
        });
        conn.on("close", () => {
            console.log("connection closed");
            studentItem.remove();
            studentConns.splice(studentConns.indexOf(conn), 1);
        });
    });
}
settingSelfPeer();



export const studentConns = [];
export const connectionToTeacher = { conn: null }
export const errorInfos = {
    message: null
}
const settings = {
    dataDom: "#messageCode",
    data: () => {
        return document.querySelector(settings.dataDom).value;
    },
    recevierDom: "#messageCode",
    receiver: (code) => {
        const receiverDom = document.querySelector(settings.recevierDom);
        receiverDom.value = code;
    },
    studentListDom: "#studentList",
    studentName: "student",
    isTeacher: false,
    reconnecting: true,
}
export function isTeacher() {
    return settings.isTeacher === true;
}





export function createTeacherLink(callTimes = 0) {
    if (selfPeer.id === undefined || selfPeer.id === null) {
        selfPeer.reconnect();
        if (callTimes > 10) {
            console.log("failed to create teacher link");
            errorInfos.message = "無法建立連結，請檢查網路連線！";
            createDialog("無法建立連結，請檢查網路連線！");
            return;
        }
        console.log("waiting for peer id");
        setTimeout(() => createTeacherLink(callTimes + 1), 1000);
        return;
    }
    const teacherLink = `${window.location.origin}/?peer=${selfPeer.id}`;
    // document.body.focus();
    // window.navigator.clipboard.writeText(teacherLink);
    createDialog(`
    分享連結為：
    ${teacherLink}
    連結ID：
    ${selfPeer.id}
    請複製連結並傳送給學生！
    `, false, teacherLink);
    settings.isTeacher = true;
}

export function broadCastTeacherInfo() {
    const messageCode = settings.data();
    const message = {
        type: "teacherInfo",
        code: messageCode,
    };
    studentConns.forEach((conn) => {
        conn.send(message);
    });
}

export function settingBroadcastSystem(userSettings = settings) {
    Object.assign(settings, userSettings);
}

export function connectToTeacher(customID = undefined, disconnect_callback = () => console.log("connection closed")) {
    const urlParams = new URLSearchParams(window.location.search);
    const peerId = customID ?? urlParams.get('peer');
    if (peerId) {
        selfPeer.removeAllListeners("open");
        settings.isTeacher = false;
        if (!selfPeer.disconnected) {
            makeConnectionToTeacher({ peerId, retryTimes: 0, disconnect_callback });
        } else {
            selfPeer.reconnect();
            selfPeer.on("open", () => {
                makeConnectionToTeacher({ peerId, retryTimes: 0, disconnect_callback });
            });
        }
    } else {
        console.log("No peer id provided");
    }
}

const RETRY_LIMIT = 10;
function makeConnectionToTeacher({
    peerId,
    retryTimes = 0,
    disconnect_callback = () => console.log("connection closed")
}) {
    let retry_count = retryTimes;
    const conn = selfPeer.connect(peerId, { metadata: { name: settings.studentName } });
    conn.on('open', () => {
        // Receive messages
        console.log("connected to teacher");
        connectionToTeacher.conn = conn;
        conn.on('data', data => {
            console.log('Student Client Received', data);
            if (data.type === "teacherInfo") {
                settings.receiver(data.code)
            }
        });
        // Send messages
        conn.send('Hello!');
        createDialog("已連接到老師的主機！");
    });
    conn.on("error", (err) => {
        console.log("error: ", err);
        connectionToTeacher.conn = null;
        settings.reconnecting = false;
        errorInfos.message = "無法連接到老師的主機！網路錯誤！";
        createDialog("無法連接到老師的主機！");
    });
    conn.on("close", () => {
        console.log("connection closed");
        connectionToTeacher.conn = null;
        disconnect_callback();
        createDialog("與老師的連線已斷開，請重新連結！");
    });
}



export function createDialog(message, noclosebutton = false, qrlink = false) {
    const dialog = document.createElement("dialog");
    const dialogBody = document.createElement("div");
    dialog.appendChild(dialogBody);
    const dialogTextContainer = document.createElement("div");
    dialogTextContainer.classList.add("resultScreen-body");
    const dialogText = document.createElement("pre");
    dialogTextContainer.appendChild(dialogText);
    const disMissButton = document.createElement("button");
    dialogText.innerText = message;
    disMissButton.innerText = "關閉此視窗";
    ["button", "button-large", "button-primary"].forEach((className) => {
        disMissButton.classList.add(className);
    });
    disMissButton.onclick = () => {
        dialog.close();
        //remove dialog
        dialog.remove();
    };
    dialogBody.appendChild(dialogTextContainer);
    noclosebutton ? null : dialogBody.appendChild(disMissButton);
    dialogBody.style.justifyContent = "space-between";
    dialogBody.style.justifyItems = "stretch";
    document.body.appendChild(dialog);
    dialog.classList.add("resultScreenDialog");
    dialogBody.classList.add("resultScreen");
    dialog.style.height = "500px";
    if (qrlink !== false && typeof qrlink === "string") {
        const qrCodeContainer = document.createElement("div");
        qrCodeContainer.classList.add("qrCodeContainer");
        const qrCodeDescription = document.createElement("p");
        qrCodeDescription.innerText = "或是掃描下方QR Code";
        qrCodeContainer.appendChild(qrCodeDescription);
        const qrCode = document.createElement("img");
        QRCode.toDataURL(qrlink).then(url => qrCode.src = url);
        qrCodeContainer.appendChild(qrCode);
        dialogTextContainer.appendChild(qrCodeContainer);
    }
    dialog.showModal();
    return dialog;
}