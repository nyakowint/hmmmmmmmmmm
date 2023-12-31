/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { User } from "discord-types/general";
import { app, WebFrameMain } from "electron";
import { createServer, Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server;
let httpServer: HttpServer;
let webFrame: WebFrameMain;
let hasInit = false;

app.on("browser-window-created", (_, win) => {
    win.webContents.on("frame-created", (_, { frame }) => {
        frame.once("dom-ready", async () => {
            if (frame.url.startsWith("https://discord.com")) {
                webFrame = frame;
            }
        });
    });
});


export function init() {
    if (hasInit) return;
    httpServer = createServer();

    if (!webFrame) {
        console.warn("WHERE IS THE FRAME BRUH");
        return;
    }

    io = new Server(httpServer, {
        serveClient: false,
        allowEIO3: true,
        cors: { origin: "*" }
    });
    httpServer.listen(3020, () => {
        console.log("[vc-premid] SocketIO starting on 3020");
        info("SocketIO starting on 3020");
    });
    httpServer.on("error", onIOError);
    io.on("connection", onConnect);
    hasInit = true;
}

export function disconnect() {
    if (!hasInit) return;
    io.close();
    httpServer.close();
    hasInit = false;
}

async function onConnect(sio: Socket) {
    info("PreMiD socket connected!");
    webFrame.executeJavaScript("window.Vencord.Plugins.plugins.PreMiD.showToast('PreMiD connected!')");

    // Get current user from plugin & send to extension
    const {
        username,
        globalName,
        id,
        avatar,
        discriminator,
        flags,
        premiumType
    } = await webFrame.executeJavaScript("window.Vencord.Webpack.Common.UserStore.getCurrentUser()") as User | any;
    sio.emit("discordUser", { username, global_name: globalName, discriminator, id, avatar, bot: false, flags, premium_type: premiumType });

    // Extension requests Premid version
    sio.on("getVersion", () => {
        info("Extension requested version");
        sio.emit("receiveVersion", "221");
    });


    sio.on("setActivity", setActivity);
    sio.on("clearActivity", clearActivity);
    sio.on("selectLocalPresence", () => { info("Selecting local presence is not supported"); });
    sio.once("disconnect", () => onIoDisconnect());
}

function info(message: string) {
    if (webFrame) {
        webFrame.executeJavaScript(`window.Vencord.Plugins.plugins.PreMiD.logger.info('${message}')`);
    }
}

function setActivity(data: any) {
    // hopefully this works
    webFrame.executeJavaScript(`window.Vencord.Plugins.plugins.PreMiD.receiveActivity("${JSON.stringify(data).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`);
}

function clearActivity() {
    info("Clearing activity");
    webFrame.executeJavaScript("window.Vencord.Plugins.plugins.PreMiD.clearActivity()");
}

function onIOError(e: { message: any; code: string; }) {
    console.error("[vc-premid] SocketIO error", e);
    info(`SocketIO error ${e.code}: ${e.message}`);
}

async function onIoDisconnect() {
    info("[vc-premid] SocketIO disconnected");
    clearActivity();
}
