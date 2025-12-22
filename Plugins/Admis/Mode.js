module.exports = {
  command: "mode",
  run: async (sock, msg) => {
    await sock.sendMessage(msg.key.remoteJid, { text: "🔧 Mode owner activé" })
  }
}
