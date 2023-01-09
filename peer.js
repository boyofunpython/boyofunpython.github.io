import { setupPopup } from "./js/popupcontainer.js";
import * as PeerConnection from "./js/peer.js";
import { saveNewFile } from "./main.js"

setupPopup("#peerConnections", "#peerContainer");


/**
 * @type {import("indexeddb-fs").CreateFsOutput}
 */
const fs = window["indexeddb-fs"].createFs();
const creatTeacherLink = document.querySelector("#creatTeacherLink");
const connectToTeacher = document.querySelector("#connectToTeacher");


// setting up events

creatTeacherLink.addEventListener("click", () => {
    PeerConnection.createTeacherLink();
    PeerConnection.settingBroadcastSystem({
        data: () => {
            return window["BMeditor"].getCode();
        }
    });
    const broadCastCallback = () => {
        PeerConnection.broadCastTeacherInfo();
    }
    const stopBroadCastButton = document.createElement("button");
    const brocastButton = document.createElement("button");
    const statusContainer = document.createElement("div");
    statusContainer.appendChild(stopBroadCastButton);
    statusContainer.appendChild(brocastButton);
    brocastButton.innerText = "廣播老師程式碼";
    brocastButton.addEventListener("click", () => {
        if (window.confirm("確定要廣播程式碼？")) {
            broadCastCallback();
        }
    });
    stopBroadCastButton.textContent = "教師廣播中（點此停止廣播)";
    stopBroadCastButton.addEventListener("click", () => {
        if(!window.confirm("確定要停止廣播？")) return;
        PeerConnection.settingBroadcastSystem({
            isTeacher: false,
            data: () => ''
        });
        PeerConnection.studentConns.forEach((conn) => {
            conn.close();
        });
        connectToTeacher.removeAttribute("disabled");
        creatTeacherLink.removeAttribute("disabled");
        statusContainer.remove();
    });
    ["button", "button-large", "button-warning"].forEach((className) => {
        stopBroadCastButton.classList.add(className);
    });
    ["button", "button-large", "button-primary"].forEach((className) => {
        brocastButton.classList.add(className);
    });
    statusContainer.style.display = "block";
    statusContainer.style.zIndex = 1000;
    statusContainer.style.position = "fixed";
    statusContainer.style.top = "0";
    statusContainer.style.right = "35%";
    const studentList = document.createElement("ul");
    studentList.id = "studentList";
    studentList.style.listStyle = "none";
    studentList.style.display = "none";
    brocastButton.style.display = "none";
    statusContainer.appendChild(studentList);
    statusContainer.addEventListener("mouseover", () => {
        studentList.style.display = "block";
        brocastButton.style.display = "block";
    });
    statusContainer.addEventListener("mouseout", () => {
        studentList.style.display = "none";
        brocastButton.style.display = "none";
    });
    document.body.appendChild(statusContainer);
    connectToTeacher.setAttribute("disabled", true);
    creatTeacherLink.setAttribute("disabled", true);
});

connectToTeacher.addEventListener("click", () => {
    const urlParams = new URLSearchParams(window.location.search);
    let peerId = urlParams.get('peer');
    if (peerId === null) {
        peerId = window.prompt("請輸入老師分享的連線ID");
    }
    if (!peerId.match("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
        PeerConnection.createDialog("ID格式錯誤，請輸入正確的連線ID");
        return;
    }
    let studentName = window.prompt("請輸入你的名稱：");
    if (studentName === null || studentName.trim().length === 0) {
        studentName = "匿名學生" + new Date().getTime();
    }
    const connectingDialog = PeerConnection.createDialog(`連線建立中，請稍候...`, true);
    PeerConnection.settingBroadcastSystem({
        studentName: studentName,
        receiver: (code) => {
            saveNewFile("FromTeacher.py",false,()=>{
                window["BMeditor"].setCode(code);
            });
            window.alert("收到老師廣播的程式！")
        },
        reconnecting: true
    });
    PeerConnection.connectToTeacher(peerId,disconnect);

    const disconnectButton = document.createElement("button");
    const sendCodeButton = document.createElement("button");
    const statusContainer = document.createElement("div");
    statusContainer.appendChild(disconnectButton);
    statusContainer.appendChild(sendCodeButton);
    disconnectButton.textContent = "與老師連線中";
    // disconnectButton.addEventListener("click", () => {
    //     disconnect();
    //     statusContainer.remove();
    // });
    ["button", "button-large", "button-warning"].forEach((className) => {
        disconnectButton.classList.add(className);
    });
    sendCodeButton.textContent = "傳送程式碼給老師";
    ["button", "button-large", "button-primary"].forEach((className) => {
        sendCodeButton.classList.add(className);
    });
    sendCodeButton.style.display = "none";
    sendCodeButton.addEventListener("click", () => {
        const messageCode = window["BMeditor"].getCode();
        const message = {
            type: "code",
            code: messageCode,
        };
        try {
            PeerConnection.connectionToTeacher?.conn.send(message);
            window.alert("程式碼已傳送給老師囉！");
        } catch (e) {
            window.alert("傳送失敗，請重新嘗試");
            console.error(e);
        }
    });
    statusContainer.addEventListener("mouseover", () => {
        sendCodeButton.style.display = "block";
    });
    statusContainer.addEventListener("mouseout", () => {
        sendCodeButton.style.display = "none";
    });
    statusContainer.style.zIndex = 1000;
    statusContainer.style.position = "fixed";
    statusContainer.style.top = "0";
    statusContainer.style.right = "35%";
    statusContainer.style.display = "none";
    document.body.appendChild(statusContainer);

    const checkers = {
        timeoutChecker: null,
        connectedChecker: null,
    }
    checkers.timeoutChecker = setTimeout(() => {
        clearInterval(checkers.connectedChecker);
        disconnect();
        statusContainer.remove();
        connectingDialog.remove();
        PeerConnection.createDialog("連線逾時，請檢查網路狀況或重新嘗試");
    }, 10000);
    checkers.connectedChecker = setInterval(() => {
        if (PeerConnection.errorInfos.message === "無法連接到老師的主機！網路錯誤！") {
            clearInterval(checkers.timeoutChecker);
            disconnect();
            connectingDialog.remove();
            PeerConnection.createDialog("無法連接到老師的主機！網路錯誤！");
            PeerConnection.errorInfos.message = null;
        }
        if (PeerConnection.connectionToTeacher.conn !== null) {
            statusContainer.style.display = "block";
            clearTimeout(checkers.timeoutChecker);
            connectToTeacher.setAttribute("disabled", true);
            creatTeacherLink.setAttribute("disabled", true);
            connectingDialog.remove();
        } else {
            statusContainer.style.display = "none";
        }
    }, 500);

    function disconnect() {
        clearInterval(checkers.connectedChecker);
        PeerConnection.settingBroadcastSystem({
            isTeacher: false,
            receiver: console.log,
            reconnecting: false
        });
        PeerConnection.connectionToTeacher.conn?.close();
        statusContainer?.remove();
        connectToTeacher.removeAttribute("disabled");
        creatTeacherLink.removeAttribute("disabled");
    }
});
