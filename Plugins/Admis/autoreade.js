module.exports = {
  command: "autoread",
  run: async (sock, msg) => {
    await sock.sendMessage(msg.key.remoteJid, { text: "✅ Auto-read activé" })
  }
}
