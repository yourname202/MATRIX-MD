// plugins/system/menu.js
module.exports = {
  command: "menu",
  run: async (sock, msg, args) => {
    const text = `
彡━━ ࿇ SYSTEM STVOPS ━彡
│ • .menu
│ • .ping
│ • .alive
│ • .tts <texte>
│ • .del sudo
│ • .owner
│ • .admins
┗━━━━━━━━━━━━━━━━━━━
`
    await sock.sendMessage(msg.key.remoteJid, { text })
  }
}
