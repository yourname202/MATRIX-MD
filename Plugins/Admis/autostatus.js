module.exports = {
  command: "autostatus",
  run: async (sock, msg) => {
    await sock.sendMessage(msg.key.remoteJid, { text: "⚡ Auto status activé" })
  }
}
