require("dotenv").config()
const fs = require("fs")
const path = require("path")
const qrcode = require("qrcode-terminal")
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys")
const pino = require("pino")

// -------- ENV --------
const BOT_NAME = process.env.BOT_NAME || "MATRIX-MD"
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "."

// -------- Plugins --------
const plugins = {}
const pluginFolders = [
  "system","admin","owner","image","game","ai","fun","textmaker","download","insu_compl"
]

for (const folder of pluginFolders) {
  const folderPath = path.join(__dirname, "plugins", folder)
  if (!fs.existsSync(folderPath)) continue

  for (const file of fs.readdirSync(folderPath)) {
    if (!file.endsWith(".js")) continue
    const plugin = require(`./plugins/${folder}/${file}`)
    if (plugin?.command && typeof plugin.run === "function") {
      plugins[plugin.command.toLowerCase()] = plugin.run
    }
  }
}

// -------- Session --------
if (!fs.existsSync("./session")) fs.mkdirSync("./session")

// -------- Start Bot --------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")
  const versionData = await fetchLatestBaileysVersion()
  const version = versionData.version || versionData

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version
  })

  sock.ev.on("creds.update", saveCreds)

  // 🔥 ICI : affichage du QR
  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update

    if (qr) {
      console.log("\n📱 Scanne ce QR code avec WhatsApp\n")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log(`\n🤖 ${BOT_NAME} connecté avec succès !`)
    }

    if (connection === "close") {
      console.log("❌ Connexion fermée, redémarrage…")
      startBot()
    }
  })

  // -------- Messages --------
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg?.message) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text || !text.startsWith(COMMAND_PREFIX)) return

    const args = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/)
    const cmdName = args.shift().toLowerCase()

    let participants = []
    if (["tagall", "kickall"].includes(cmdName)) {
      try {
        const group = await sock.groupMetadata(msg.key.remoteJid)
        participants = group.participants.map(p => p.id)
      } catch {}
    }

    if (plugins[cmdName]) {
      try {
        await plugins[cmdName](sock, msg, args, participants)
      } catch (err) {
        console.log("Erreur commande:", err)
        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Erreur lors de la commande"
        })
      }
    }
  })
}

startBot()
